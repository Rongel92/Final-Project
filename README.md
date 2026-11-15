# Laptop Resale

An internal web application for managing employee resales of refurbished company laptops.
Employees register for open resales and accept the required declarations; administrators
create resales, run an auditable selection, publish results, and manage handovers — all backed
by a PostgreSQL database.

## Tech stack

| Layer | Technology |
| --- | --- |
| Frontend | React + TypeScript, Vite, Tailwind CSS, React Router |
| Backend | Node.js + Express (TypeScript) |
| Database | PostgreSQL via Prisma ORM |
| Auth | Demo sign-in — pick a user from the database (no SSO) |
| File storage | Local server storage (`server/uploads`) |
| Excel export | XLSX via ExcelJS |

All application data is stored in **PostgreSQL** — there is no browser-only mock database or
`localStorage`-backed data store.

## Run the demo (Docker only)

The quickest way to present the project. Only Docker Desktop is needed — no Node.js. From
the repository root:

```powershell
docker compose up -d --build   # first time: builds the image (a few minutes)
docker compose up -d           # later starts
```

Open <http://localhost:8080> and pick a user to sign in as (administrators are listed first).

- Every start reloads the mock data: 2 administrators, 35 employees, 6 laptop models and
  7 resales at every stage, dated relative to today. Changes made during a demo are lost on
  the next start; set `DEMO_RESET_ON_START: "false"` in `docker-compose.yml` to keep them.
- Emails are not sent, only written to the log: `docker logs laptop-resale-demo`.
- Stop with `docker compose down`; add `-v` to delete the demo database as well.
- The demo runs its own database and does not touch the development one below.

## Project structure

```
.
├── server/   Express API, Prisma schema and seed, business services
├── client/   React single-page application
└── package.json  Root convenience scripts
```

## Prerequisites

- Node.js 18+ (developed and verified on Node 24)
- npm 9+
- Docker Desktop (for the local PostgreSQL database)

### Corporate proxy / TLS note

If you are behind an SSL-inspecting corporate proxy and package or Prisma engine downloads
fail with `UNABLE_TO_GET_ISSUER_CERT_LOCALLY`, set this before running any `npm`/`npx`
command so Node trusts the Windows certificate store:

```powershell
$env:NODE_OPTIONS="--use-system-ca"
```

## Setup

From the repository root, start the local database (PostgreSQL 16 in Docker), then copy
`server/.env.example` to `server/.env`:

```powershell
docker compose -f docker-compose.dev.yml up -d
```

Then:

```powershell
# Install both apps and initialize the database (generate + migrate)
npm run setup
```

Or manually:

```powershell
# Backend
cd server
npm install
npm run setup        # prisma generate + migrate
npm run seed         # wipe the database and load the mock data

# Frontend
cd ../client
npm install
```

## Running (development)

Open two terminals.

```powershell
# Terminal 1 — API on http://localhost:4000
cd server
npm run dev
```

```powershell
# Terminal 2 — Web app on http://localhost:5173
cd client
npm run dev
```

The Vite dev server proxies `/api` to the backend on port 4000. Open
<http://localhost:5173> and pick a user to sign in as.

## Authentication

There is no SSO and no password. The sign-in page lists every active user in the
database (administrators first); choosing one stores that user's id in a signed,
server-side session cookie. A user's role (`ADMIN` or `EMPLOYEE`) comes from the
database. This is meant for demos and local development only — anyone who can reach
the app can sign in as anyone, including an administrator.

## Deployment (production)

The app ships as a single container (`Dockerfile`, multi-stage, non-root, OpenShift
SCC-compatible — arbitrary UID in group 0). All data lives in the PostgreSQL database
given by `DATABASE_URL`; the container itself is stateless. Runtime configuration is
injected as environment variables (see `deploy/env.example` for the full list; real
`*.env` files are gitignored). `docker-compose.prod.yml` builds and runs it locally for
verification.

## Initial data

`npm run seed` (in `server/`) wipes the database and loads mock data:

- **2 administrators** and **35 employees** (one inactive, one marked ineligible)
- **6 laptop models** with serial-numbered inventory
- **7 resales**, one at each stage: completed, cancelled, results published with pickups in
  progress, registration closed awaiting the draw, registration open, scheduled, and draft
- Matching registrations, draw results, waiting lists, handovers (with signed agreements),
  notifications, participation history and audit log

The seed prints a few employees worth signing in as (a pending winner, someone awaiting
pickup, someone who isn't registered anywhere, and so on).

## Production build

```powershell
npm run build            # builds server (tsc) and client (vite)
```

The client build outputs static assets to `client/dist`. Serve them behind the API or any
static host; point the client at the API origin as needed.

## Key features

- Admin resale lifecycle: draft → publish → open → close → select → publish results → pickup → complete
- Employee registration wizard with mandatory declarations and typed electronic signature
- Automatic eligibility evaluation (participation / purchase cooldown) with admin override
- Deterministic, reproducible, auditable selection (cryptographically seeded per model)
- Waiting lists with automatic promotion when a winner declines
- Electronic handover confirmation (employee + administrator) with payroll acknowledgment
- Participation history, notifications, and a full audit log
- Excel (XLSX) exports for registrations, results, inventory, handovers, participation, audit, and a full report
- Responsive UI with light/dark theme

## Future integration points (built to be swappable)

- **Authentication** — demo sign-in only; the `attachUser` middleware resolves the session user, so a real identity provider can be plugged in later.
- **Notifications** — the `NotificationChannel` service abstraction is ready for Email/Teams/SMS channels.
- **File storage** — local disk storage is isolated in the forms service; swap for SharePoint/Blob.
- **Database** — Prisma makes moving to another database (e.g. SQL Server) a schema/provider change.
