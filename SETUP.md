# Family Playbook — Local Development Setup

## Prerequisites

- Node.js 20+
- npm 9+
- A Supabase project (existing project keys are in `.env.local`)

---

## 1. Clone and install

```bash
git clone <your-repo-url>
cd familyplaybook
npm install
```

---

## 2. Configure environment variables

Copy the example file and fill in your values:

```bash
cp .env.example .env.local
```

Open `.env.local` and set:

| Variable | Where to find it |
|---|---|
| `VITE_SUPABASE_URL` | Supabase dashboard > Project Settings > API > Project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase dashboard > Project Settings > API > anon public key |
| `VITE_APP_URL` | `http://localhost:3000` for local dev |
| `VITE_STRIPE_PUBLISHABLE_KEY` | Stripe dashboard > Developers > API Keys (optional for local dev) |

> **Important:** `.env.local` is gitignored and must never be committed.

---

## 3. Run the dev server

```bash
npm run dev
```

App will be available at [http://localhost:3000](http://localhost:3000)

---

## 4. Supabase project notes

- **Project URL:** `https://ifdncylgiqhhcwovpdyf.supabase.co`
- Auth is email-based (magic link + email/password). OAuth providers (Google, Facebook, Discord) are configured in the Supabase dashboard.
- Row Level Security (RLS) is enabled on all tables — users can only access their own data.
- Storage bucket `images` is used for all user-uploaded images.
- Edge functions handle: Stripe checkout, Stripe webhook, subscription queries, OpenAI guide generation, error analysis.

### Key tables
| Table | Purpose |
|---|---|
| `profiles` | User profile data (name, avatar) |
| `user_billing` | Stripe subscription status, plan key, billing interval |
| `packs` (bundles) | User-created bundles |
| `guides` | User-created guides |
| `pack_guides` | Many-to-many: bundles <> guides |
| `library_packs` | Template bundles in the library |
| `library_guides` | Template guides in the library |
| `user_favorites` | Guides a user has starred |
| `shared_links` | Public share UUIDs for guides/bundles |
| `plans` | Subscription plan definitions |
| `plan_entitlements` | Feature limits per plan |
| `error_logs` | Client-side error log with AI analysis |

---

## 5. Auth redirect configuration

For local development, add `http://localhost:3000/auth/callback` to your Supabase project's allowed redirect URLs:

Supabase dashboard > Authentication > URL Configuration > Redirect URLs

---

## 6. Build for production

```bash
npm run build
```

Output is in `dist/`. Serve as a static site behind nginx (see `Dockerfile` and `nginx.conf`).

---

## 7. Docker

Two Docker Compose files cover different workflows.

### 7a. Development — hot-reload (`docker-compose.dev.yml`)

Runs the Vite dev server inside a container with the project mounted as a live volume. Changes to `src/` are reflected in the browser immediately via HMR — no rebuild required.

**First time:**
```bash
cp .env.example .env.local   # fill in your Supabase and Stripe values
docker compose -f docker-compose.dev.yml up
```

**Subsequent runs:**
```bash
docker compose -f docker-compose.dev.yml up
```

App is available at [http://localhost:3000](http://localhost:3000).

> `node_modules` live in a named Docker volume (`node_modules`) so platform-native binaries (esbuild, rollup) are never clobbered by the host checkout. If you add or remove a package, restart the container — `npm install` runs automatically on every `up`.

To remove the volume and do a clean reinstall:
```bash
docker compose -f docker-compose.dev.yml down -v
docker compose -f docker-compose.dev.yml up
```

---

### 7b. Production (`docker-compose.yml`)

Builds a static bundle with Vite, copies it into an nginx container, and serves it on port 80. **All `VITE_*` variables are baked into the bundle at build time** — set them before building.

**Set up environment:**
```bash
cp .env.example .env.local
# Edit .env.local — set VITE_APP_URL to your production domain
```

**Build and start:**
```bash
docker compose up --build -d
```

**Check health:**
```bash
docker compose ps          # should show "healthy"
curl http://localhost/     # nginx serves index.html
```

**Update to a new version:**
```bash
git pull
docker compose up --build -d
```

**Environment variables and the production build**

| Variable | Notes |
|---|---|
| `VITE_SUPABASE_URL` | Required — your Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Required — Supabase anon/public key |
| `VITE_APP_URL` | Set to your production domain (e.g. `https://familyplaybook.app`) |
| `VITE_STRIPE_PUBLISHABLE_KEY` | Required if billing is enabled |
| `VITE_ENABLE_AI_GENERATION` | `true` / `false`; defaults to `false` if unset |

Docker Compose reads `.env.local` then `.env` (both optional). Alternatively, export variables in your shell or CI environment before running `docker compose up --build`.

---

## 8. Known issues / verification checklist

Run through these after setup to confirm everything works:

- [ ] App loads at `http://localhost:3000` without console errors
- [ ] Sign up flow: enter email > receive magic link or confirm email > redirected to app
- [ ] Sign in with email/password works
- [ ] Home screen loads with bundles and guides from Supabase
- [ ] Image upload works (create/edit a bundle, add a cover image)
- [ ] Favorites screen shows starred guides
- [ ] Account screen loads profile and subscription status
- [ ] PWA install prompt appears on mobile / Chrome

---

## 9. Project structure overview

```
src/
  App.jsx              # Root router and provider tree
  main.jsx             # Entry point
  contexts/            # React context providers (auth, data, entitlements)
  lib/                 # Supabase client, error logger, utilities
  components/          # UI components (screens + reusable — will be split in Phase 2)
  hooks/               # Custom React hooks
  pages/               # Route-level page components (being migrated from components/)
  index.css            # Tailwind base + custom theme tokens
```

See `technical_specification.txt` and `readme.txt` for full product and schema documentation.

---

## 10. Database migrations

Migrations live in [`supabase/migrations/`](supabase/migrations/) as plain `.sql` files, ordered by their `YYYYMMDD` filename prefix. They are **not** applied automatically — the Supabase project schema and the SQL files can drift, and that drift is the most common cause of "I'm logged in but the app shows no data" symptoms (see troubleshooting below).

Whenever you pull new commits, check whether `supabase/migrations/` contains any files that haven't been applied to the live Supabase project, and apply them.

### Applying migrations — Supabase Dashboard (recommended)

This is the workflow used in production. It needs no CLI install and works on any Node version.

1. Open the SQL editor: https://supabase.com/dashboard/project/ifdncylgiqhhcwovpdyf/sql/new
2. For each unapplied migration file in `supabase/migrations/`, in filename order:
   - Open the `.sql` file in your editor, copy its full contents.
   - Paste into the dashboard SQL editor and click **Run**.
   - Confirm "Success. No rows returned." (or the expected row output).
3. Hard-refresh the app (Cmd+Shift+R) and confirm queries that previously 400'd now return 200.

The migrations in this repo are written to be idempotent (`CREATE … IF NOT EXISTS`, `CREATE OR REPLACE FUNCTION`, etc.), so re-running a migration that has already been applied is safe.

### Applying migrations — Supabase CLI (alternative)

Faster for bulk-applying many migrations, but requires Node 20+ and one-time setup.

```bash
brew install supabase/tap/supabase
supabase login
supabase link --project-ref ifdncylgiqhhcwovpdyf
supabase db push
```

### Troubleshooting: "Library and My Guides are empty after login"

Symptom: you can log in successfully, but the Library tab, My Guides, and My Bundles all appear empty. No obvious error in the UI.

Cause: the client is selecting a column from `guides` or `packs` that doesn't yet exist in the database, because a recent migration in `supabase/migrations/` hasn't been applied to the project. The Supabase REST API returns `400 Bad Request`, the `Promise.allSettled` in [`DataContext.jsx`](src/contexts/DataContext.jsx) swallows the error, and the UI silently renders `[]`.

How to confirm in 30 seconds:
1. Open DevTools → **Network** tab, filter `guides`, reload the page.
2. If you see `400 Bad Request` on a request like `…/rest/v1/guides?select=…updated_at,…&user_id=eq.…`, that's this issue.
3. Click the failing request → **Response** tab — Postgres usually names the offending column (e.g. `column "updated_at" does not exist`).

Fix: apply the pending migrations using either workflow above. After applying, hard-refresh; the same request should now return 200 with data.
