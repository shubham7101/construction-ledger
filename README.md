# Construction Ledger

A mobile-first khata book for construction businesses: track money given to and received from contractors, suppliers and labour across many sites, plus direct site expenses, with per-user site access.

Built with Next.js 16 (App Router, React 19, React Compiler), Tailwind CSS v4, Drizzle ORM and LibSQL (a local SQLite file in development, Turso in production).

## Features

- **Overview**: credit/debit totals, counts, spending by category and recent activity across every site you can access.
- **Persons & passbook**: contractors, suppliers and workers with a running balance and a chat-style list of credits and debits.
- **Sites**: per-site outflow (ledger entries plus direct expenses) and status.
- **Ledgers & expenses**: full lists with infinite scroll, search, sort and date/site/category filters.
- **Admin**: users (active toggle, per-site access), sites, categories and person types.
- **Auth**: mobile number + password, bcrypt hashes, JWT in an `httpOnly` cookie. Every request is re-checked against the database.
- **Installable app (PWA)**: add it to the home screen on Android and iOS; it opens full screen with its own icon. Only an offline page is cached; financial data never is.

## Getting started

Requires [Bun](https://bun.sh) 1.3+.

```bash
bun install
cp .env.example .env          # then set JWT_SECRET (openssl rand -base64 48)
bun run db:migrate            # create the tables in local.db

# Either: a real first admin account
SEED_ADMIN_MOBILE=9876543210 SEED_ADMIN_PASSWORD='choose-one' bun run db:seed
# Or: realistic demo data (local only; logins 9000000000 / Demo@1234)
bun run db:demo

bun run dev                   # http://localhost:3000
```

## Environment variables

| Name                  | Required        | Description                                                            |
| --------------------- | --------------- | ---------------------------------------------------------------------- |
| `JWT_SECRET`          | yes             | At least 32 random characters. Changing it signs everyone out.         |
| `DATABASE_URL`        | yes             | `file:./local.db` locally, `libsql://<db>.turso.io` for Turso.          |
| `DATABASE_AUTH_TOKEN` | Turso only      | Turso database token.                                                  |
| `SEED_ADMIN_MOBILE`   | `db:seed` only  | 10-digit mobile number of the first admin.                             |
| `SEED_ADMIN_PASSWORD` | `db:seed` only  | Password of the first admin (min 8 characters).                        |

## Scripts

| Command               | What it does                                                   |
| --------------------- | -------------------------------------------------------------- |
| `bun run dev`         | Development server                                             |
| `bun run build`       | Production build                                               |
| `bun run start`       | Serve the production build                                     |
| `bun run lint`        | Biome lint + format check                                      |
| `bun run format`      | Biome format (writes)                                          |
| `bun test`            | Unit tests                                                     |
| `bun run db:generate` | Create a migration in `drizzle/` after editing `src/db/schema.ts` |
| `bun run db:migrate`  | Apply pending migrations                                       |
| `bun run db:seed`     | Add the first admin, default categories and person types       |
| `bun run db:demo`     | Fill an empty local database with demo data (`--reset` wipes it first) |
| `bun run db:studio`   | Browse the database in Drizzle Studio                          |

## Deployment

1. **Database.** On serverless hosts (Vercel, Netlify, etc.) the filesystem isn't persistent, so use [Turso](https://turso.tech): set `DATABASE_URL=libsql://…` and `DATABASE_AUTH_TOKEN`. On a VPS or container with a persistent disk, a `file:` database works too; back it up.
2. **Secrets.** Set a fresh `JWT_SECRET` in the host's environment settings, never the one from your local `.env`.
3. **Schema and first admin.** Against the production database, run `bun run db:migrate`, then `bun run db:seed` with `SEED_ADMIN_MOBILE` / `SEED_ADMIN_PASSWORD`. Never run `db:demo` in production.
4. **Build and start.** `bun run build && bun run start` (or let the host run the build).
5. **HTTPS.** Required for installing the app and for the service worker. Login cookies are marked `secure` automatically when the request arrives over HTTPS.

After each schema change, run `bun run db:migrate` against production before deploying the new code.

## Install on a phone

- **Android (Chrome):** open the site, then tap **Install app** in the menu (or the install banner).
- **iOS (Safari):** tap **Share → Add to Home Screen**.

Icons live in `public/icons/` (SVG source, 192/512 PNGs, a maskable 512 for Android, a 180 Apple touch icon) and `src/app/favicon.ico` (16/32/48). The web manifest is `src/app/manifest.ts`.

## Project structure

```
src/
  app/
    (auth)/login/         Login page
    (app)/                Signed-in pages: overview, persons, sites, ledgers,
                          expenses, categories, profile, admin/*
    layout.tsx            Root layout, metadata, icons
    manifest.ts           Web app manifest
  components/ui/          UI primitives (Segmented, Toast, ...)
  features/               Feature components: shell (header, nav, FAB),
                          sheets (add/edit, filter, sort, detail, pickers),
                          overview, feed, admin
  hooks/                  Client hooks (URL params, sheets, infinite lists)
  lib/                    Pure helpers: formatting, validators, params
  server/
    actions/              Server actions (mutations)
    queries/              Data reads
    auth/                 JWT session + password hashing
    permissions.ts        Role and site-access checks
  db/                     Drizzle schema, client, seed scripts
  proxy.ts                Redirects signed-out requests to /login
drizzle/                  SQL migrations
public/                   Icons, service worker, offline page
```
