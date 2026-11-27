# FloodRelay Deployment Guide — Render & Neon

This guide covers deploying Project **FloodRelay** on [Render](https://render.com) backed by your existing **Neon PostgreSQL + PostGIS** database.

---

## Architecture Overview

```
                      NEON POSTGRESQL + POSTGIS (Singapore / aws-ap-southeast-1)
                                                 │
                        ┌────────────────────────┴────────────────────────┐
                        ▼                                                 ▼
               RENDER API WEB SERVICE                            RENDER WEB SERVICE
         Name: floodrelay-api                              Name: floodrelay-web
         Runtime: Node 24 (Express)                        Runtime: Node 24 (Next.js 15)
         Entry: npm --workspace=@floodrelay/api run start  Entry: npm --workspace=@floodrelay/web run start
         Health: /health                                   Health: /citizen
```

- **Frontend (`floodrelay-web`):** Full-stack Next.js 15 application. Proxies all API, authentication, and dispatch calls server-side to `BACKEND_API_URL` via `rewrites()`.
- **Backend (`floodrelay-api`):** Persistent Express service hosting the REST API and in-process `@floodrelay/solver`.
- **Database (`Neon`):** Remote PostgreSQL 16 instance with PostGIS 3.4 enabled in Singapore.
- **Routing:** Operates via straight-line solver fallback (with flood impedance) by default on free tier, or can connect to an external OSRM instance via `OSRM_BASE_URL`.

---

## 1. Verify Neon Database Migrations (One-Time Local Step)

Before starting the web services, ensure the Neon database has all required tables (`001` through `006`) and the PostGIS Delhi NCR service area boundary.

In your local terminal, run the migrator using the Neon **direct (unpooled)** connection string:

```bash
DATABASE_URL="postgresql://<user>:<password>@<direct-host>.neon.tech/<dbname>?sslmode=require" \
  npm run migrate --workspace=@floodrelay/api
```

- If already migrated: output will show `Applied 0 migrations: []`.
- If unmigrated: migrations `001` through `006` will be applied safely without data loss.

_(Optional)_ Seed initial scenario:

```bash
DATABASE_URL="postgresql://<user>:<password>@<direct-host>.neon.tech/<dbname>?sslmode=require" \
  npm run seed --workspace=@floodrelay/api -- --file scenarios/demo-yamuna-scenario.json
```

---

## 2. Deploy via Render Blueprint (One-Click Setup)

1. Push this branch (`chore/render-deployment`) to your GitHub repository.
2. Log in to your [Render Dashboard](https://dashboard.render.com).
3. Navigate to **Blueprints** -> **New Blueprint Instance**.
4. Connect the repository `Parssharma/floodrelay` and select branch `chore/render-deployment`.
5. Render will automatically read `render.yaml` and configure both web services (`floodrelay-api` and `floodrelay-web`).
6. Set the secret environment variable:
   - `DATABASE_URL`: Your **Neon pooled** connection string (`...-pooler...neon.tech/...?sslmode=require`).
7. Click **Apply**.
8. Render will build and deploy both services automatically, wiring `BACKEND_API_URL` and `CORS_ORIGIN` between them.

---

## 3. Alternative: Manual Service Setup on Render

If you prefer to configure the services manually on Render without Blueprints:

### Service 1: Backend API (`floodrelay-api`)

- **Type:** Web Service
- **Environment:** Node
- **Region:** Singapore
- **Branch:** `chore/render-deployment`
- **Root Directory:** _(leave empty)_
- **Build Command:** `npm install && npm --workspace=@floodrelay/api run build`
- **Start Command:** `npm --workspace=@floodrelay/api run start`
- **Health Check Path:** `/health`
- **Environment Variables:**
  - `NODE_VERSION`: `24.13.0`
  - `NODE_ENV`: `production`
  - `DATABASE_URL`: `<your-neon-pooled-connection-string>`
  - `REQUIRE_DB`: `1`
  - `INITIAL_OPERATOR_USERNAME`: `eoc_admin`
  - `INITIAL_OPERATOR_PASSWORD`: `<your-secure-password>`
  - `INITIAL_OPERATOR_NAME`: `EOC Duty Commander`
  - `CORS_ORIGIN`: `https://floodrelay-web.onrender.com` (update once web is created)

### Service 2: Frontend Web (`floodrelay-web`)

- **Type:** Web Service
- **Environment:** Node
- **Region:** Singapore
- **Branch:** `chore/render-deployment`
- **Root Directory:** _(leave empty)_
- **Build Command:** `npm install && npm --workspace=@floodrelay/web run build`
- **Start Command:** `npm --workspace=@floodrelay/web run start`
- **Health Check Path:** `/citizen`
- **Environment Variables:**
  - `NODE_VERSION`: `24.13.0`
  - `NODE_ENV`: `production`
  - `BACKEND_API_URL`: `https://floodrelay-api.onrender.com`
  - `NEXT_PUBLIC_API_URL`: _(leave unset)_
