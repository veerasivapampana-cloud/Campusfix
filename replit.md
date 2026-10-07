# CampusFix

CampusFix helps students report campus problems, administrators route urgent work, and maintenance teams resolve issues with a clear audit trail.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/campusfix` — student, admin, staff, analytics, credits, and notification web app
- `artifacts/api-server/src/routes/campusfix.ts` — CampusFix API endpoints
- `artifacts/api-server/src/lib/campusfix.ts` — deterministic triage, seed data, and read models
- `lib/db/src/schema/campusfix.ts` — PostgreSQL schema
- `lib/api-spec/openapi.yaml` — API contract; regenerate clients with the command above

## Architecture decisions

- Classification uses deterministic campus safety rules and needs no third-party AI key.
- The role switcher uses demo accounts for walkthroughs; it is not an authentication boundary.
- Issue, timeline, notification, and credits data persist in the project's PostgreSQL database.
- Frontend API calls and server validation share the OpenAPI-generated contract.

## Product

Students can report and track issues, earn campus credits, and receive updates. Administrators prioritize and assign tickets across departments. Maintenance staff update work status and resolution notes. Analytics summarize category overlap, hotspots, and department outcomes.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
