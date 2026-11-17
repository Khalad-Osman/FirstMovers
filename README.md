# First Movers

Industrial commercial-real-estate intelligence for the GTA and Ontario. First Movers finds industrial occupiers (manufacturing, warehousing, distribution, logistics) whose changing business conditions could lead to a real-estate decision, and turns the evidence into a source-backed brief.

`CLAUDE.md` is the source of truth for product rules, architecture and decisions. `docs/intelligence-model.md` and `docs/analysis-rules.md` are the analysis prompt, used word for word.

## What's in the app

| Area | What it does |
|---|---|
| Opportunity Feed | Briefs ranked Strong Signal → Worth Monitoring; "Reviewed, no signal" collapsed; sample briefs behind a toggle |
| Live Research | Research a company or theme on demand (Firecrawl), review the sources, then analyze and add to the feed |
| Discovery | Builds candidates from structured signals, screens them with a cheap model, researches and analyzes the best within caps |
| Signals / Data sources | Federal contract awards (CanadaBuys) and industrial building permits (Mississauga, Brampton, Toronto) |
| Watchlist, company timeline | Companies being tracked; each brief ends with the company's dated history |
| Usage, Settings | Monthly credit/token usage; caps, models, schedules (admin) |

Stack: Next.js 16 (App Router) + TypeScript + Tailwind, Supabase (Postgres, Auth, RLS), Vercel. LLM: OpenAI by default behind `lib/llm/`. Web research: Firecrawl.

## Local setup

Requirements: Node 24, Docker (for local Supabase).

```bash
npm install
npm run db:start                 # local Supabase in Docker
cp .env.example .env.local       # then fill values (see below)
npm run dev                      # http://localhost:3000
```

Fill `.env.local`:
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`: from `npx supabase status`.
- `DISCOVERY_JOB_SECRET`, `CRON_SECRET`: any random strings of 16+ characters.
- `LLM_PROVIDER=openai`, `OPENAI_API_KEY`, `LLM_SCREENING_MODEL`, `LLM_ANALYSIS_MODEL`, `FIRECRAWL_API_KEY`: needed only for analysis, Live Research and discovery.

First admin: sign up at `/signup`, then `npm run promote-admin -- you@example.com`. Load real signals (free, public data): `npm run ingest -- all`.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm run typecheck`, `npm run lint` | Static checks |
| `npm test` | Unit tests (no network, no credits) |
| `npm run test:db` | Integration tests against local Supabase (Firecrawl and models faked) |
| `npm run db:test` | Database tests (RLS, integrity, ingestion SQL) |
| `npm run db:reset` / `db:types` | Re-apply migrations / regenerate DB types |
| `npm run ingest -- <source\|all>` | Ingest structured sources (free) |
| `npm run eval:analysis` | Live model evaluation on fictional fixtures (**spends credits**) |
| `npm run promote-admin -- <email>` | Make an existing user an admin |
| `npm run create-account -- <email> "<Name>" <member\|admin> [password]` | Create a confirmed account (used when public sign-up is off) |

## Deploying (Vercel + hosted Supabase)

1. Create a Supabase project; `npx supabase login`, `npx supabase link --project-ref <ref>`, `npx supabase db push`.
2. In Supabase Auth: set the site URL and redirect URL (`https://<domain>/auth/callback`) and turn off public sign-ups.
3. Import the repository into Vercel. Set the environment variables from `.env.example` (hosted Supabase values, secrets, model names, `SIGNUP_ENABLED=false`).
4. `vercel.json` registers one daily cron job (`/api/cron/daily`, authenticated with `CRON_SECRET`). Schedules are switched on in Settings.
5. Create accounts with `scripts/create-account.mjs` against the hosted project's env file.

## Credits and costs

Nothing spends credits on page load. Firecrawl and LLM calls happen only on an explicit click (Live Research, Analyze sources, Run discovery) or a scheduled job, within the caps in Settings. See `CLAUDE.md` §8.
