# 📚 Classroom Exporter

> Export all files from your Google Classroom courses to Google Drive or as a ZIP — in seconds.

Classroom Exporter is a full-stack web app that lets teachers and students sign in with their Google account, browse their Classroom courses, and export all course materials to a neatly organized Google Drive folder **or** download everything as a single ZIP archive. Live progress logs let you watch every file copy happen in real time.

---

## ✨ Features

- 🔐 **Google OAuth 2.0 Sign-In** — Secure, one-click authentication with CSRF protection
- 📖 **Course Browser** — View all your active and archived Google Classroom courses at a glance
- ☁️ **Export to Google Drive** — Copies all course files into a new Drive folder (`Classroom Export — <Course Name>`)
- 📦 **Download as ZIP** — Packages every accessible file into a single `.zip` download directly to your computer
- 🔄 **Google Workspace file conversion** — Docs, Sheets, and Slides are automatically exported to `.docx`, `.xlsx`, and `.pptx`
- 📊 **Live Progress Dashboard** — Real-time activity log with per-file status (copied / skipped / failed), a progress bar, and file counts
- 📜 **Export History** — Revisit any past export job, its logs, and its Drive folder link
- 🐳 **Docker-ready** — Single `docker run` deploys the entire app (API + React frontend served together)
- ☁️ **Render deployment** — Includes a `render.yaml` for one-click Render.com deployment

---

## 🖥️ Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 19, Vite, TailwindCSS v4, shadcn/ui, TanStack Query, Wouter |
| **Backend** | Node.js 22, Express, Pino (structured logging) |
| **Database** | PostgreSQL via [Neon](https://neon.tech) (serverless), Drizzle ORM |
| **Auth** | Google OAuth 2.0 (`express-session` with HTTP-only cookies) |
| **APIs** | Google Classroom API, Google Drive API v3 |
| **Monorepo** | pnpm workspaces |
| **Packaging** | Docker (multi-stage build), Render.com |
| **Validation** | Zod (shared between client & server via `lib/api-zod`) |

---

## 📁 Project Structure

```
Classroom-Exporter/
├── artifacts/
│   ├── api-server/          # Express backend
│   │   └── src/
│   │       ├── routes/      # auth, courses, exports, health
│   │       └── lib/         # Google API clients, exporter logic, logger
│   └── classroom-exporter/  # React frontend (Vite)
│       └── src/
│           ├── pages/       # auth, courses, export-setup, export-detail, exports-history
│           └── components/  # shared layout + shadcn/ui components
├── lib/
│   ├── api-client-react/    # TanStack Query hooks (auto-generated from spec)
│   ├── api-spec/            # OpenAPI specification
│   ├── api-zod/             # Shared Zod schemas (request/response validation)
│   └── db/                  # Drizzle ORM schema + migrations
├── Dockerfile               # Multi-stage production build
├── render.yaml              # Render.com deployment config
├── .env.example             # Environment variable template
└── pnpm-workspace.yaml      # pnpm monorepo config
```

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** v22+
- **pnpm** v9+ (`npm install -g pnpm`)
- A **PostgreSQL** database (e.g., a free [Neon](https://neon.tech) project)
- A **Google Cloud** project with the **Classroom API** and **Drive API** enabled

### 1. Clone the repository

```bash
git clone https://github.com/your-username/classroom-exporter.git
cd classroom-exporter
```

### 2. Install dependencies

```bash
pnpm install
```

### 3. Configure environment variables

Copy the example file and fill in your values:

```bash
cp .env.example .env
```

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string (pooled) |
| `DATABASE_URL_UNPOOLED` | PostgreSQL connection string (direct, for migrations) |
| `SESSION_SECRET` | A long, random secret string for signing session cookies |
| `GOOGLE_CLIENT_ID` | OAuth 2.0 Client ID from Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | OAuth 2.0 Client Secret from Google Cloud Console |
| `APP_URL` | The public URL of your app (used for the OAuth redirect URI) |
| `PORT` | Port to listen on (default: `3000`) |
| `LOG_LEVEL` | Pino log level: `trace`, `debug`, `info`, `warn`, `error` |

> **Setting up Google OAuth:**
> 1. Go to [Google Cloud Console](https://console.cloud.google.com) → **APIs & Services** → **Credentials**
> 2. Create an **OAuth 2.0 Client ID** (Web application)
> 3. Add `{APP_URL}/api/auth/callback` as an **Authorized Redirect URI**
> 4. Enable the **Google Classroom API** and **Google Drive API** for your project

### 4. Run database migrations

```bash
pnpm --filter @workspace/db run migrate
```

### 5. Start the development servers

**Backend (API server):**
```bash
pnpm --filter @workspace/api-server run dev
```

**Frontend (React app):**
```bash
pnpm --filter @workspace/classroom-exporter run dev
```

The frontend dev server will proxy `/api` requests to the backend automatically.

---

## 🐳 Running with Docker

Build and run the full stack in a single container:

```bash
# Build the image
docker build -t classroom-exporter .

# Run the container
docker run -p 3000:10000 \
  -e DATABASE_URL="..." \
  -e SESSION_SECRET="..." \
  -e GOOGLE_CLIENT_ID="..." \
  -e GOOGLE_CLIENT_SECRET="..." \
  -e APP_URL="http://localhost:3000" \
  classroom-exporter
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## ☁️ Deploying to Render

This repo includes a [`render.yaml`](./render.yaml) for zero-config deployment on [Render.com](https://render.com).

1. Push the repo to GitHub
2. In the Render dashboard, click **New → Blueprint** and connect your repository
3. Render will detect `render.yaml` and configure the service automatically
4. Set the required environment variables in the Render dashboard (see the table above)
5. Deploy — Render will build the Docker image and serve the app

---

## 🔄 How It Works

```
User signs in with Google
        │
        ▼
Browse Classroom courses (fetched live from Google Classroom API)
        │
        ▼
Choose an export mode:
  ┌─────────────────────┐    ┌─────────────────────┐
  │   Export to Drive   │    │   Download as ZIP   │
  │                     │    │                     │
  │ Creates a job in DB │    │ Streams a .zip to   │
  │ Runs in background  │    │ browser immediately │
  │ Live logs via poll  │    │                     │
  └─────────────────────┘    └─────────────────────┘
        │
        ▼
Google Workspace files (Docs/Sheets/Slides) auto-converted to Office formats
```

---

## 🛠️ Scripts Reference

| Command | Description |
|---|---|
| `pnpm build` | Type-check and build all packages |
| `pnpm typecheck` | Run TypeScript checks across all workspaces |
| `pnpm --filter @workspace/api-server run dev` | Start the API server in watch mode |
| `pnpm --filter @workspace/classroom-exporter run dev` | Start the Vite dev server |
| `pnpm --filter @workspace/classroom-exporter run build` | Build the frontend for production |
| `pnpm --filter @workspace/api-server run build` | Build the backend for production |

---

## 🤝 Contributing

Contributions, bug reports, and feature suggestions are welcome! If you'd like to contribute:

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Make your changes and ensure the project builds: `pnpm build`
4. Open a pull request with a clear description of the change

Please follow the existing code style (the project uses **Prettier** for formatting).

---

## 📄 License

This project is currently **proprietary / all rights reserved**. An open-source license may be added in the future — watch this repo for updates.

---

## 🙏 Acknowledgements

Built with:
- [Google Classroom API](https://developers.google.com/classroom) & [Drive API](https://developers.google.com/drive)
- [Neon](https://neon.tech) — serverless Postgres
- [Drizzle ORM](https://orm.drizzle.team)
- [shadcn/ui](https://ui.shadcn.com)
- [TanStack Query](https://tanstack.com/query)
- [Render](https://render.com) — hosting
