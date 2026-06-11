# Classroom Exporter — All Vulnerabilities

> **Total: 49 issues** — 10 Critical, 13 High, 18 Medium, 8 Low

---

## 🔴 CRITICAL (10)

| # | Vulnerability | File |
|---|---------------|------|
| C1 | Real secrets (DB password, OAuth secret, session key) committed to git history and recoverable by anyone who cloned the repo | `.env` |
| C2 | `.env.example` contains actual production credentials instead of placeholder values | `.env.example` |
| C3 | CORS set to `origin: true` with `credentials: true` — any website can make authenticated API requests on behalf of users | `api-server/src/app.ts` |
| C4 | `GET /exports`, `GET /exports/:id`, and `GET /exports/:id/logs` have zero authentication — all export data is publicly readable | `api-server/src/routes/exports.ts` |
| C5 | `express-session` uses default `MemoryStore` which leaks memory, doesn't scale, and loses all sessions on server restart | `api-server/src/app.ts` |
| C6 | No `userId` column on `export_jobs` table — any authenticated user can view all other users' export data (no multi-tenancy) | `lib/db/src/schema/index.ts` |
| C7 | `redirect` query parameter flows unsanitized from user input to `res.redirect()` in OAuth callback — open redirect for phishing | `api-server/src/routes/auth.ts` |
| C8 | Google OAuth `access_token` and `refresh_token` stored as plain text in the database and session — exposed on any breach | `lib/db/src/schema/index.ts`, `api-server/src/routes/auth.ts` |
| C9 | Session secret falls back to hardcoded `"fallback-secret-change-me"` if env var is missing — attackers can forge session cookies | `api-server/src/app.ts` |
| C10 | No `.dockerignore` file — `.env` with secrets and `.git/` history are sent into Docker build context and may leak into image layers | Project root |

---

## 🟠 HIGH (13)

| # | Vulnerability | File |
|---|---------------|------|
| H1 | No rate limiting on any endpoint — vulnerable to brute-force, DoS, and Google API quota exhaustion | `api-server/src/app.ts` |
| H2 | No `helmet` middleware — missing `X-Frame-Options`, `HSTS`, `X-Content-Type-Options`, `CSP`, `Referrer-Policy` headers | `api-server/src/app.ts` |
| H3 | Google access tokens expire after 1 hour but no refresh logic exists — app breaks silently for all users after 1 hour | `api-server/src/lib/google.ts` |
| H4 | Raw `error.message` sent directly to clients in every catch block — leaks internal paths, DB errors, and stack traces | `api-server/src/routes/exports.ts` |
| H5 | Docker container runs as `root` — a container breakout gives the attacker root privileges | `Dockerfile` |
| H6 | No validation of required environment variables at startup — missing vars cause silent failures or insecure fallbacks | `api-server/src/index.ts` |
| H7 | Frontend redirects to `authUrl.url` from API response without validating it's a Google domain — open redirect if API is compromised | `classroom-exporter/src/pages/auth.tsx` |
| H8 | `sessions` table has no indexes on `userId` or `expiresAt` — session lookups and cleanup degrade as data grows | `lib/db/src/schema/index.ts` |
| H9 | `POST /exports/download` uses raw type assertion `req.body as { ... }` with no Zod validation — bypasses all input validation | `api-server/src/routes/exports.ts` |
| H10 | `export_logs.export_id` FK uses `ON DELETE no action` — deleting export jobs fails or orphans log rows | `lib/db/src/schema/index.ts` |
| H11 | No `SIGTERM`/`SIGINT` handlers — in-flight requests are killed and DB connections are not drained on deploy/restart | `api-server/src/index.ts` |
| H12 | No indexes on `export_jobs.status`, `export_jobs.created_at`, `export_jobs.course_id`, `export_logs.export_id` — full table scans | `lib/db/src/schema/index.ts` |
| H13 | `POST /exports/download` endpoint exists in server code but is absent from OpenAPI spec — undocumented, untypes, no generated client | `api-server/src/routes/exports.ts` |

---

## 🟡 MEDIUM (18)

| # | Vulnerability | File |
|---|---------------|------|
| M1 | No `Content-Security-Policy` header or meta tag — browser won't restrict which scripts/styles can execute | `classroom-exporter/index.html` |
| M2 | Source maps not explicitly disabled in Vite build config — could expose original source code in production | `classroom-exporter/vite.config.ts` |
| M3 | Auth guards are decentralized across individual page components — missing a check on any new page leaves it unprotected | `classroom-exporter/src/App.tsx` |
| M4 | No CSRF token sent with mutation requests — combined with `SameSite: lax`, top-level navigation CSRF is possible | `classroom-exporter/src/pages/export-setup.tsx` |
| M5 | `express.json()` has no explicit `limit` — relies on default which could change in future Express versions | `api-server/src/app.ts` |
| M6 | Route parameters like `courseId` are not validated for format or length before use | `api-server/src/routes/courses.ts` |
| M7 | Static files served without cache headers; catch-all `*` route serves `index.html` for API 404s too | `api-server/src/app.ts` |
| M8 | No request logging middleware (morgan/pino-http) — no access logs, audit trail, or performance data | `api-server/src/app.ts` |
| M9 | No Express global error-handling middleware — unhandled errors return default HTML page with stack trace | `api-server/src/app.ts` |
| M10 | No `process.on("unhandledRejection")` or `uncaughtException` handlers — unhandled async errors crash the process | `api-server/src/index.ts` |
| M11 | Session ID is not regenerated after OAuth login — vulnerable to session fixation attacks | `api-server/src/routes/auth.ts` |
| M12 | `status` and `level` columns are free-text with no CHECK constraint or pgEnum — database doesn't enforce valid values | `lib/db/src/schema/index.ts` |
| M13 | `updatedAt` uses `.defaultNow()` which only sets on INSERT — never auto-updates on UPDATE operations | `lib/db/src/schema/index.ts` |
| M14 | Database pool has no `max` connections, no `idleTimeoutMillis`, no `connectionTimeoutMillis`, no SSL enforcement | `lib/db/src/index.ts` |
| M15 | `GET /exports` and `GET /exports/:id/logs` return ALL rows with no pagination — potential DoS on large datasets | `api-server/src/routes/exports.ts` |
| M16 | `APP_URL` is set to `http://localhost:3000` — OAuth callbacks will fail and `secure` cookies won't work in production | `.env` |
| M17 | Port mismatch between `.env` (3000) and Dockerfile (10000) — confusing and error-prone for deployments | `.env`, `Dockerfile` |
| M18 | Health check endpoint returns `{ status: "ok" }` without testing database connectivity — reports healthy when DB is down | `api-server/src/routes/health.ts` |

---

## 🟢 LOW (8)

| # | Vulnerability | File |
|---|---------------|------|
| L1 | `session.destroy()` on logout does not call `res.clearCookie()` — browser keeps sending the invalidated session ID | `api-server/src/routes/auth.ts` |
| L2 | Raw `pool` object is exported from DB package — allows consumers to run unparameterized SQL, bypassing Drizzle ORM safety | `lib/db/src/index.ts` |
| L3 | Counter columns (`totalFiles`, `copiedFiles`, `skippedFiles`, `failedFiles`) are nullable with no default — require null-checks everywhere | `lib/db/src/schema/index.ts` |
| L4 | Dockerfile has no `HEALTHCHECK` instruction — Docker daemon cannot monitor container health natively | `Dockerfile` |
| L5 | `node:22-slim` image tag is not pinned to a SHA digest — a new push could introduce breaking changes or supply-chain compromise | `Dockerfile` |
| L6 | Google Drive scope is `auth/drive` (full read/write) instead of `auth/drive.file` (only files created by the app) | `api-server/src/lib/google.ts` |
| L7 | `.env.example` is listed in `.gitignore` — new developers won't see which environment variables are required | `.gitignore` |
| L8 | Replit `runtimeErrorOverlay()` plugin is included unconditionally — may expose stack traces to users in production | `classroom-exporter/vite.config.ts` |
