# Architecture & Production Resilience Audit: Classroom Exporter

> **Audit Standard**: Evaluated across **Correctness**, **Architecture**, **Security**, **Performance**, and **Production Resilience**.  
> **Target Environment**: Production containerized deployment (Node.js 22, Express, PostgreSQL / Neon, Google Cloud APIs, Docker / Render Starter Plan).

---

## Executive Summary & Architecture Verdict

Classroom Exporter is designed to export Google Classroom materials to Google Drive or package them as downloadable ZIP archives. While the frontend and API contracts provide a clean user experience, the underlying system architecture is **critically unready for production**. 

The system tightly couples long-running, resource-intensive background batch operations directly into the single-threaded Node.js HTTP event loop using in-memory triggers (`setImmediate`), loads full binary payloads into memory buffers, lacks resilient job state management, and implements an API rate-limiter that self-denials its own frontend polling.

Under production conditions (courses with 50+ files or files > 200MB, multi-container deployments, platform restarts, or concurrent users), **this application will experience container OOM crashes, truncated downloads, stuck jobs, API rate limit lockouts, and silent data loss.**

```
                               CURRENT FLAWED ARCHITECTURE
                               
  Browser Client (Polling /api every 2s)
        │
        ├──► Rate Limiter: max 100 req / 15 min ──► [BLOCKED with HTTP 429 after 3m 20s]
        │
        ▼
  Express HTTP Monolith (Single Node Process)
   ├── GET /exports/:id ──► Queries ALL logs repeatedly (N-query amplification)
   │
   ├── POST /exports/download ──► Synchronous Loop (Blocks for minutes)
   │     │                           └── Loads 500MB+ into RAM ──► [CONTAINER OOM-KILL / 504 TIMEOUT]
   │     └── Archiver pipe to res ──► Broken mid-stream ─────────► [CORRUPT ZIP DOWNLOAD]
   │
   └── POST /exports ──► setImmediate() (In-Memory Worker)
         │                     └── Server redeploy / restart ────► [JOB PERMANENTLY FROZEN IN DB]
         └── Sequential copy loop (No backoff)
               ├── Google API 429/503 ───────────────────────────► [TRANSFER INSTANTLY FAILS]
               └── Duplicate file name collision ────────────────► [FILES SILENTLY DISCARDED]
```

---

## 🔴 Where It Will Break in Production (Critical Failure Points)

### 1. In-Process `setImmediate` Worker: Immediate Job Severing & DB State Freezing
* **Affected Files**: `artifacts/api-server/src/routes/exports.ts`, `artifacts/api-server/src/index.ts`
* **Production Failure**:
  When a user starts an export to Google Drive, the background worker is spawned inside the Express HTTP process via `setImmediate(() => { runExport(job.id, tokenSnapshot); })`.
  - **No Lifecycle Management**: In cloud environments (Render, Fly.io, Kubernetes, AWS ECS), deployments, autoscaling events, or memory spikes trigger container restarts. Render periodically cycles or sleeps containers on starter plans.
  - **Graceful Shutdown Does Not Drain Background Jobs**: In `index.ts`, `SIGTERM` only calls `server.close()`, which waits for open HTTP sockets. Background promises in `setImmediate` are ignored, and `process.exit(0)` terminates them mid-copy.
  - **Permanent Ghost State**: The job in PostgreSQL remains in status `"running"` indefinitely. There is no watchdog, heartbeat, timeout, or startup reconciliation. The user visits the dashboard days later and sees the job permanently spinning.
  - **Multi-Instance Incompatibility**: If scaled to 2+ replicas behind a load balancer, replica A runs the job while replica B serves polling requests. If replica A dies, replica B has no ability to resume or monitor the job.

### 2. Container OOM Crashes via Whole-File Memory Buffering (`ArrayBuffer`)
* **Affected Files**: `artifacts/api-server/src/lib/exporter.ts`, `render.yaml`
* **Production Failure**:
  - In `downloadDriveFile` and `rawFetch`, files are downloaded into memory with `Buffer.from(await res.arrayBuffer())`.
  - In `runExport`, binary files downloaded from Google Drive are buffered into RAM, then turned into a stream via `bufferToStream(buffer)` before uploading to Drive.
  - In `render.yaml`, the app runs on a **Render Starter plan (512 MB RAM limit)**.
  - Classroom courses commonly contain high-definition recorded lectures, Zoom MP4s, large PDFs, or software archives (300MB – 2GB+). Downloading a single 300MB file or two concurrent 150MB files will exceed the 512MB cgroup memory limit.
  - **Result**: The Linux kernel immediately sends `SIGKILL` (OOM Killer) to the Node.js process. The entire web server crashes instantly, aborting all active users and connections.

### 3. Synchronous ZIP Route: Proxy Timeouts (504) & Corrupt Archive Generation
* **Affected Files**: `artifacts/api-server/src/routes/exports.ts`, `artifacts/classroom-exporter/src/pages/export-setup.tsx`
* **Production Failure**:
  - `POST /exports/download` executes sequentially in a single synchronous HTTP request:
    1. Fetches full course material list from Classroom API.
    2. Sequentially queries Drive API for metadata for each file.
    3. Sequentially downloads each file into RAM.
    4. Pipes compressed chunks to `res`.
  - For a course with 60 files (at ~2 seconds per Google API roundtrip), this request takes **120+ seconds**.
  - **Gateway Timeouts**: Render, Cloudflare, AWS ALB, and Nginx have hard gateway request timeouts (Render: 100s, Cloudflare: 100s, standard Nginx: 60s). At second 100, the proxy severs the connection and sends `504 Gateway Timeout`.
  - **Silent Corrupt Archive**: If files were partially written before the timeout or error occurred, the client receives a truncated `.zip` file with missing central directory headers. The user attempts to extract it and gets `ZipArchiveError: End-of-central-directory signature not found`.
  - **Frontend Heap Crash**: In `export-setup.tsx`, the frontend executes `const blob = await res.blob();` followed by `URL.createObjectURL(blob)`. For a 1GB+ course, the browser tab must allocate 1GB for the blob and another in URL object storage, freezing or crashing mobile and laptop browsers.

### 4. Self-Inflicted Rate-Limiter DoS (`429 Too Many Requests`)
* **Affected Files**: `artifacts/api-server/src/app.ts`, `artifacts/classroom-exporter/src/pages/export-detail.tsx`, `artifacts/classroom-exporter/src/pages/exports-history.tsx`
* **Production Failure**:
  - In `app.ts`, `apiLimiter` is mounted globally on `/api`:
    ```ts
    const apiLimiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100,                  // 100 requests per IP
    });
    app.use("/api", apiLimiter);
    ```
  - In `export-detail.tsx`, the client polls `GET /api/exports/:id` every **2 seconds** (`refetchInterval: 2000`).
  - **Math**: 100 requests / (30 requests/minute) = **3 minutes and 20 seconds**.
  - Any export job lasting longer than 3.3 minutes triggers a hard `429 Too Many Requests`. The UI fails, and because the rate limiter is mounted on `/api`, the user is **completely locked out of the entire application** for the remaining 11.5 minutes.
  - **Shared NAT / School Network Catastrophe**: Schools and university departments route hundreds of students through a single public IP. Under default `express-rate-limit`, the 100 requests are shared across all students at that school. Multiple users will hit 429 within 10 seconds.

### 5. Silent Data Loss: Filename Collision & Flat Export Structure
* **Affected Files**: `artifacts/api-server/src/lib/exporter.ts`, `artifacts/api-server/src/routes/exports.ts`
* **Production Failure**:
  - In `exporter.ts`, deduplication is done strictly against filename strings:
    ```ts
    if (existing.has(file.name)) {
      skipped++;
      await addLog(exportId, "warning", `Skipped (already exists): ${file.name}`);
      continue;
    }
    ```
  - In real classrooms, teachers attach generic filenames across different assignments (e.g. `Assignment 1/Lab.pdf`, `Assignment 2/Lab.pdf`, `Syllabus.docx`, `Rubric.pdf`).
  - Because files are dumped into a single flat Drive folder or flat ZIP root, **every subsequent file sharing a name with a previous file is permanently skipped and lost.** The user thinks their course was fully exported, but critical coursework files are missing.

### 6. Zero Retry / Exponential Backoff on Google API Throttling & 5xx Errors
* **Affected Files**: `artifacts/api-server/src/lib/exporter.ts`
* **Production Failure**:
  - Google Drive and Classroom APIs enforce strict per-user quotas (12,000 queries/min/project, 2,000 queries/min/user) and frequently return transient `503 Service Unavailable`, `500 Internal Error`, or `403 userRateLimitExceeded`.
  - The exporter performs raw calls in a loop without exponential backoff or retry logic (`catch (copyErr)` increments `failed++` immediately).
  - Any momentary network hiccup or rate limit response instantly aborts copying that file and marks it as permanently failed.

---

## 🔒 Security & Authorization Vulnerabilities

### Critical Findings

| ID | Vulnerability | Location | Architectural Risk |
|---|---|---|---|
| **SEC-1** | **Bypassed Authorization on Export Logs (IDOR)** | `artifacts/api-server/src/routes/exports.ts` | Any authenticated user can read logs for any export ID. Line 280 executes `SELECT * FROM export_logs WHERE export_id = ?` and returns it immediately. The `userEmail` ownership check is only executed in a dead branch if `logs.length === 0`. |
| **SEC-2** | **Disabling TLS Certificate Validation (`rejectUnauthorized: false`)** | `lib/db/src/index.ts` | `ssl: { rejectUnauthorized: false }` allows man-in-the-middle (MITM) attacks between the app and the Neon database over the public internet, intercepting database queries and encrypted session cookies. |
| **SEC-3** | **Unauthenticated Fallback User Identity Leakage** | `artifacts/api-server/src/routes/auth.ts`, `artifacts/api-server/src/routes/exports.ts` | If `getUserInfo` throws during OAuth callback, `req.session.userEmail` is set to `null`. Queries then execute `where(eq(exportJobs.userEmail, ""))`, exposing all exports belonging to any user whose email resolution failed to one another. |
| **SEC-4** | **No Anti-CSRF Protection on Mutations** | `artifacts/api-server/src/routes/exports.ts` | `POST /api/exports` and `POST /api/exports/download` rely solely on cookies without CSRF tokens or `Origin`/`Sec-Fetch-Site` header checks. |

---

## 🏗️ Architectural Shortcomings & Scalability Bottlenecks

### 1. N+1 Database Write Amplification & Unbounded Polling Query Load
- **Per-file DB writes**: In `exporter.ts`, every single file processed performs **2 sequential remote SQL statements** to Neon serverless Postgres:
  1. `await db.insert(exportLogs)...`
  2. `await db.update(exportJobs)...`
  For 100 files, that is 200 sequential network round-trips to the database (averaging 30-80ms each), adding 10–15 seconds of pure DB I/O latency to the export.
- **Unbounded read load**: `GET /api/exports/:id` fetches **all** historical logs without pagination or cursor:
  ```ts
  const logs = await db.select().from(exportLogs).where(eq(exportLogs.exportId, job.id)).orderBy(exportLogs.createdAt);
  ```
  Every 2 seconds, the client downloads the entire growing log table over the wire. At 500 files, this transfers megabytes of repeated JSON logs every 2 seconds, exhausting database connection pool bandwidth and CPU.

### 2. Ephemeral User Identity & Token Loss
- **No User Domain Model**: The database contains no `users` or `accounts` table. User identity is transiently bound to the `session` table managed by `connect-pg-simple`.
- **Token Desynchronization**: Google OAuth refresh tokens are stored in the session record. When `oauth2Client` refreshes an access token during a background export, the new credentials are not persisted back to the database. If the session expires or is cleared, the user's connection to Google Cloud is broken.

### 3. Startup Race Condition & Deprecated SQL Syntax
- In `artifacts/api-server/src/app.ts`, `ensureSessionTable()` is invoked as an unawaited asynchronous promise at the module root.
- If incoming traffic hits the server during cold start before `pool.query` finishes, `connect-pg-simple` crashes immediately with `relation "session" does not exist`.
- Furthermore, `WITH (OIDS=FALSE)` is deprecated syntax completely removed in modern PostgreSQL versions (PG 12+), risking syntax errors on updated Postgres engines.
