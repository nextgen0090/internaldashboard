# Deploy Internal Dashboard on Cloudflare

Repo: `https://github.com/nextgen0090/internaldashboard.git`  
Worker name (must match): `internaldashboard` (see `wrangler.toml`)

Production API: `https://gamevault222.com/api/...` (no change)

---

## Option A — GitHub Desktop + Cloudflare (recommended)

Push with GitHub Desktop → Cloudflare builds and deploys automatically.

### A1. Commit & push from GitHub Desktop

1. Open **GitHub Desktop**
2. Open this repo: `InternalDashboard`
3. Branch: use **`dev`** (or create/switch to **`main`** if you prefer production on `main`)
4. Include at least:
   - `index.html`
   - `wrangler.toml`
   - `package.json`
   - `.assetsignore`
   - `_headers`
5. **Commit** → **Push origin**

### A2. Connect repo in Cloudflare (one time)

1. Open [Cloudflare Dashboard](https://dash.cloudflare.com) → **Workers & Pages**
2. Click **Create** → **Import a repository** / **Connect to Git**
3. Choose **GitHub** → authorize Cloudflare → select **`nextgen0090/internaldashboard`**
4. Settings:

| Setting | Value |
|--------|--------|
| Project / Worker name | `internaldashboard` (same as `wrangler.toml` / your `*.workers.dev` URL) |
| Production branch | `dev` (or `main` — whatever you push from Desktop) |
| Root directory | `/` (repo root) |
| Build command | *(leave empty)* — static site, no build |
| Deploy command | `npx wrangler deploy` (default) |

5. Save / Deploy

Cloudflare installs npm deps from `package.json` and runs Wrangler.

### A3. Every update after that

1. Edit files locally  
2. **GitHub Desktop** → Commit → **Push origin**  
3. Cloudflare auto-deploys (check **Workers & Pages** → `internaldashboard` → **Deployments**)

Live URL example:

`https://internaldashboard.<your-subdomain>.workers.dev`

---

## Option B — Manual deploy (CLI, no Git connect)

Use when you want to publish without pushing.

```bash
cd "D:\GameBackend\Server Data\NewWork\InternalDashboard"
npm install
npx wrangler login
npm run deploy
```

---

## Optional: custom domain

1. Cloudflare → **Workers & Pages** → **internaldashboard**
2. **Settings** → **Domains & Routes** → Add  
   e.g. `internal.gamevault222.com`

---

## Remove Vercel

1. [vercel.com/dashboard](https://vercel.com/dashboard) → delete the old project  
2. GitHub repo → **Settings** → **Integrations** → remove **Vercel** if listed  

`vercel.json` is already gone from this repo.

---

## Local development (unchanged)

- Double-click **`start.bat`** → `http://localhost:8080` (proxies to local .NET)
- Deployed site always uses `https://gamevault222.com`

---

## Files Cloudflare uses

| File | Role |
|------|------|
| `index.html` | Dashboard UI |
| `wrangler.toml` | Worker name + static assets |
| `package.json` | Wrangler dependency for CI deploy |
| `.assetsignore` | Do not upload `server.py`, `start.bat`, etc. |
| `_headers` | No-cache for HTML |

`server.py` / `start.bat` stay for local only — not needed on Cloudflare.
