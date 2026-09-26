# 📚 Classroom Exporter

> Export all files from your Google Classroom courses to Google Drive or as a single ZIP — directly in your browser with zero server limits.

Classroom Exporter connects directly to your Google account, browses your Classroom courses, and exports all materials to a neatly organized Google Drive folder **or** packages everything into a single `.zip` file downloaded directly to your computer.

---

## ✨ Key Architectural Highlights (New Architecture)

- ⚡ **Decoupled Frontend on Vercel** — Fast, global Edge CDN deployment with instant loading, zero cold starts, and 100% free hosting.
- 🚀 **Client-Orchestrated Export Engine** — Google Drive transfers run Google-to-Google directly inside Google's datacenter without slow proxy servers.
- 📦 **In-Browser Streaming ZIP Downloads** — Streams files directly into a single `.zip` archive on your disk via `client-zip`. No 512MB RAM server caps and no 60s proxy timeouts.
- 📁 **Organized Assignment Folders** — Preserves assignment and topic folders rather than dumping files into a flat list. Automatically converts Google Docs, Sheets, and Slides into `.docx`, `.xlsx`, and `.pptx`.
- 🔐 **Google Identity Services (OAuth 2.0)** — Client-side token authentication with granular Classroom and Drive scopes.
- 🗄️ **Supabase Integration** — Optional PostgreSQL persistence with Row-Level Security (RLS) for multi-device export history, with automatic fallback to local storage.
- 🛑 **No UptimeRobot or Container Sleeping** — Eliminates Render container cold starts, monthly 750h quotas, and keep-alive pinging.

---

## 🖥️ Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 19, Vite, TailwindCSS v4, shadcn/ui, TanStack Query, Wouter |
| **ZIP Streaming** | `client-zip` (Browser-native streaming ZIP generator) |
| **APIs** | Google Classroom API v1, Google Drive API v3 |
| **Auth** | Google Identity Services (GIS) / OAuth 2.0 |
| **Database (Optional)** | Supabase (PostgreSQL with Row-Level Security) / LocalStorage |
| **Hosting** | Vercel (or any static hosting platform) |

---

## 📁 Project Structure

```
Classroom-Exporter/
├── frontend/                # Standalone decoupled React 19 + Vite frontend
│   ├── src/
│   │   ├── lib/             # Google Classroom/Drive clients, ZIP streamer, auth
│   │   ├── pages/           # auth, courses, export-setup, export-detail, history
│   │   └── components/      # shared layout + shadcn/ui components
│   ├── public/              # static assets, favicon, opengraph
│   ├── vercel.json          # Vercel SPA routing and security headers
│   └── package.json         # Standalone package definition
├── supabase/
│   └── migrations/          # Supabase SQL schema with Row-Level Security (RLS)
├── docs/                    # Architecture audit and technical specifications
└── package.json             # Root workspace management
```

---

## 🚀 Getting Started

### 1. Prerequisites

- **Node.js** v20+
- **pnpm** v9+ (`npm install -g pnpm`)
- A **Google Cloud** project with the following APIs enabled:
  - **Google Classroom API**
  - **Google Drive API**

### 2. Configure Google Cloud Console

1. In [Google Cloud Console](https://console.cloud.google.com), navigate to **APIs & Services** → **Credentials**.
2. Create an **OAuth 2.0 Client ID** (Web application).
3. Under **Authorized JavaScript origins**, add:
   - `http://localhost:3000` (for local development)
   - `https://your-app.vercel.app` (your production Vercel domain)
4. Copy your **Client ID**.

### 3. Setup Frontend

```bash
# Clone the repository
git clone https://github.com/your-username/classroom-exporter.git
cd classroom-exporter

# Install dependencies
pnpm install

# Copy example environment file
cp frontend/.env.example frontend/.env
```

Edit `frontend/.env` and paste your Google Client ID:
```env
VITE_GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com

# Optional: Supabase for persistent cloud history (works without it using LocalStorage)
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
```

### 4. Run Development Server

```bash
pnpm dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## ☁️ Deploying to Vercel

Classroom Exporter is pre-configured for one-click deployment on [Vercel](https://vercel.com):

1. Push your repository to GitHub.
2. In the Vercel dashboard, click **Add New** → **Project**, and import your repository.
3. Configure the project settings:
   - **Framework Preset**: Vite
   - **Root Directory**: `frontend`
4. Add the Environment Variables:
   - `VITE_GOOGLE_CLIENT_ID`: Your Google OAuth Client ID
   - `VITE_SUPABASE_URL` (optional): Your Supabase project URL
   - `VITE_SUPABASE_ANON_KEY` (optional): Your Supabase anonymous key
5. Click **Deploy**. Your app is live with zero server costs and zero sleep downtime!

---

## 🗄️ Supabase Database Setup (Optional)

If you wish to sync export history across devices:

1. Create a project at [supabase.com](https://supabase.com).
2. Go to **SQL Editor** in your Supabase dashboard.
3. Copy and run the contents of [`supabase/migrations/0001_classroom_exporter_schema.sql`](./supabase/migrations/0001_classroom_exporter_schema.sql).
4. Add your `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to Vercel environment variables.

---

## 🛠️ Scripts Reference

| Command | Description |
|---|---|
| `pnpm dev` | Start the frontend dev server at `localhost:3000` |
| `pnpm build` | Type-check and build the frontend for production |
| `pnpm typecheck` | Run full TypeScript verification |

---

## 📄 License

Proprietary / All rights reserved.
