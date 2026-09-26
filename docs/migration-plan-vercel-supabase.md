# Architecture Redesign Plan: Eliminating Render Cold Starts & Uptime Bottlenecks

## Goal Description
The current deployment runs the React frontend, Express API server, background export runner, and static asset server in a single monolithic container on **Render (Free/Starter)**, with PostgreSQL on **Neon**, and an external **UptimeRobot** pinging the server to prevent Render from sleeping.

This setup has severe production limitations:
1. **Render Free Quota Exhaustion**: Render allocates 750 free instance hours/month. Pinging 24/7 (744 hours) consumes ~100% of the free quota. Any restart or second deployment causes mid-month account suspension.
2. **Cold Starts (50+ seconds)**: If UptimeRobot misses a ping, the container spins down. Subsequent user requests experience 50–90 second latency.
3. **Severe Timeout on Long Exports**: Long-running exports in a single container risk memory overflow (512MB RAM cap) and deployment severing.

---

## Technical Analysis of Hosting Options

### Can we host the Backend on Supabase Edge Functions & Frontend on Vercel?

| Platform / Layer | Role | Free Tier Capabilities | Critical Production Constraints |
|---|---|---|---|
| **Vercel** | Frontend (React SPA) | **Excellent** (Fast, global CDN, 100% uptime, zero cold starts) | Perfect for frontend. For Serverless API functions: **10-second hard execution limit** (max 60s). |
| **Supabase Database** | PostgreSQL | **Good** (500MB DB, built-in Auth, PgBouncer pooling) | **Pauses after 7 days of inactivity** on free tier (requires manual dashboard reactivation if inactive). |
| **Supabase Edge Functions** | Backend API | Serverless Deno / TS runtime | **150-second maximum wall-clock timeout**; CPU limit. Cannot run 5–15 minute monolithic export jobs. |

> [!WARNING]
> **The Long-Job Serverless Dilemma**:
> Google Classroom courses frequently contain 50 to 200+ files. Copying or downloading these sequentially takes between **2 and 15 minutes**.
> - If the backend runs as standard serverless functions on **Vercel**, requests are terminated at **10 to 60 seconds** (`FUNCTION_INVOCATION_TIMEOUT`).
> - If the backend runs on **Supabase Edge Functions**, requests are terminated at **150 seconds**.
> Therefore, simply lifting and shifting the existing Express server to Vercel/Supabase serverless will **break all medium-to-large course exports**.

---

## Architectural Alternatives Comparison

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│ OPTION 1: Hybrid Serverless + Client-Driven Orchestration (Recommended)                         │
│                                                                                                 │
│  [ Vercel (Frontend SPA) ] ──(Direct Google REST APIs)──► [ Google Classroom & Drive APIs ]     │
│             │                                                                                   │
│      (State / Logs)                                                                             │
│             ▼                                                                                   │
│  [ Supabase / Neon DB ] (Free, Auth + Job History)                                              │
│                                                                                                 │
│  Zero server runtime cost. No timeouts. Zero RAM bottlenecks. Infinite scalability.             │
└─────────────────────────────────────────────────────────────────────────────────────────────────┘
                                                vs
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│ OPTION 2: Vercel (Frontend) + Chunked Serverless Worker (Vercel / Supabase)                     │
│                                                                                                 │
│  [ Vercel Frontend ] ──► [ Serverless Function ] ──(Processes batch of 10 files / 10s)          │
│                                  │                                                              │
│                         Loops via client trigger or step-functions                              │
└─────────────────────────────────────────────────────────────────────────────────────────────────┘
                                                vs
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│ OPTION 3: Vercel (Frontend) + Always-On Free Dedicated Worker (Koyeb / Fly.io / Oracle Free)    │
│                                                                                                 │
│  [ Vercel Frontend ] ──► [ Koyeb Free / Fly.io / Oracle VM ] ──► [ Neon / Supabase DB ]         │
│  (Keeps Express backend running 24/7 without Render's 750h restriction or cold sleep)           │
└─────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### Deep Dive: Option 1 vs. Option 2 vs. Option 3

| Feature / Criteria | Option 1: Client-Orchestrated Serverless | Option 2: Chunked Serverless (Vercel + Supabase) | Option 3: Vercel Frontend + Always-On Worker (Koyeb/Fly/Oracle) |
|---|---|---|---|
| **Hosting Cost** | **$0 / month forever** | **$0 / month forever** | **$0 / month** (within free tier) |
| **Uptime / Cold Starts** | **Instant (Zero cold starts)** | Minor serverless cold start (~1s) | Always warm |
| **Max Job Duration** | **Unlimited** (no server timeouts) | Chunked (10 files per request) | Unlimited (background thread) |
| **Server RAM Limitations** | **Eliminated** (Google Drive server-side copy) | Bounded by batch size | 512MB–1GB VM RAM |
| **Background Execution** | User must keep tab open | User must keep tab open (or cron) | Runs headless if user closes tab |
| **ZIP Download Handling** | In-browser streaming (`client-zip`) | Multipart signed links | Server-side stream / object store |
| **Architectural Complexity** | **Low** (Removes Express server entirely) | **Medium-High** (Batch orchestrator) | **Low** (Maintains existing Express codebase) |

---

## Recommended Architecture: Option 1 + Option 3 Hybrid

1. **Frontend**: Deploy on **Vercel** (or **Cloudflare Pages**).
   - Fast worldwide CDN.
   - Zero maintenance, zero sleep, zero cold starts.
   - Free custom domain with automatic SSL.
2. **Database**: **Supabase PostgreSQL** or **Neon**.
   - If using **Supabase**: Utilize Supabase Auth (built-in Google OAuth) + Supabase PostgreSQL + Row-Level Security (RLS). This eliminates custom session tables, encryption keys, and cookie security headaches.
   - If using **Neon**: Keep existing Drizzle ORM schema, but deploy stateless API routes.
3. **Execution Strategy**:
   - **For Drive Exports**: Direct browser-to-Google orchestration or chunked micro-batches. Drive file copying is purely a Google Cloud metadata operation (`drive.files.copy`); routing file bytes through an intermediate server container is an anti-pattern.
   - **For ZIP Downloads**: Use client-side streaming (`client-zip`), which writes directly to the user's disk via `FileSystemWritableFileStream` or downloads without holding gigabytes in server memory.
