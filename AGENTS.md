# Repository Guidelines

## Project Structure & Module Organization

pnpm monorepo (`pnpm-workspace.yaml`):

- `apps/worker/`: Cloudflare Worker (entry in `src/index.ts`), WhatsApp/email ingestion, HTTP API for mobile, Durable Object agent, D1 schema in `db/schema.sql`, config in `wrangler.jsonc`.
- `apps/mobile/`: Expo / React Native app (SDK 57).
- `docs/`: Product and operations docs (runbook, closed beta guide, MVP design).
- Root: shared `package.json` (delegating scripts), `pnpm-workspace.yaml`, `oxlint`/`oxfmt` configs, `AGENTS.md`, `README.md`, `LICENSE`.

## Build, Test, and Development Commands

Root scripts delegate to the worker package:

- `pnpm dev`: Run the worker locally with Wrangler.
- `pnpm deploy`: Deploy the worker to Cloudflare.
- `pnpm test`: Run Vitest for the worker.
- `pnpm check`: Run worker `tsc`, `lint`, and format check in parallel.
- `pnpm mobile:start`: Start the Expo dev server.
- Package-scoped: run inside `apps/worker` or `apps/mobile` with `pnpm --filter @misgastos/worker <script>` (e.g. `tsc`, `cf-typegen`, `android`, `ios`).

## Coding Style & Naming Conventions

- TypeScript is the primary language; keep imports explicit and ordered.
- Indentation is 2 spaces and trailing commas are used in multi-line objects.
- Prefer descriptive function names like `onEmail`, `onFetch` to match worker handlers.
- Formatting and linting are enforced via root `oxfmt` and `oxlint`; run `pnpm check` before PRs.

## Testing Guidelines

- Framework: Vitest (worker). Test files live under `apps/worker/test/` with `*.spec.ts` naming.
- Run `pnpm test` locally; add tests for new parsing or handler behavior.

## Commit & Pull Request Guidelines

- Commit messages follow Conventional Commits: `feat: ...`, `chore: ...`, `init`.
- PRs should include: summary, test results (commands + outcomes), and any config/env changes.
- If behavior changes affect Telegram or email parsing, include example inputs/outputs.

## Configuration & Secrets

- Secrets are managed via Wrangler (`wrangler secret put ...`).
- Worker env vars/secrets are documented in `apps/worker/README.md` section "Variables y bindings" and `apps/worker/.env.example`.
- Database schema changes must update `apps/worker/db/schema.sql` and be applied to D1.
