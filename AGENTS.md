# Repository Guidelines

## Project Structure & Module Organization

- `src/`: Cloudflare Worker source (entry in `src/index.ts`) with feature areas like `src/email/` and `src/http/`.
- `test/`: Vitest tests (e.g., `test/index.spec.ts`) and test types.
- `db/`: D1 database schema (`db/schema.sql`).
- `types/`: Shared type definitions (e.g., `types/env`).
- Config: `wrangler.jsonc`, `tsconfig.json`, `tsconfig.worker.json`.

## Build, Test, and Development Commands

- `pnpm dev` / `pnpm start`: Run the worker locally with Wrangler.
- `pnpm deploy`: Deploy the worker to Cloudflare.
- `pnpm test`: Run Vitest.
- `pnpm lint`: Run `oxlint` (type-aware linting).
- `pnpm lint:format`: Check formatting with `oxfmt`.
- `pnpm tsc`: Typecheck via `tsgo` using `tsconfig.worker.json`.
- `pnpm check`: Run `tsc`, `lint`, and `lint:format` in parallel.
- `pnpm cf-typegen`: Generate Cloudflare types.

## Coding Style & Naming Conventions

- TypeScript is the primary language; keep imports explicit and ordered.
- Indentation is 2 spaces and trailing commas are used in multi-line objects.
- Prefer descriptive function names like `onEmail`, `onFetch` to match worker handlers.
- Formatting and linting are enforced via `oxfmt` and `oxlint`; run `pnpm check` before PRs.

## Testing Guidelines

- Framework: Vitest.
- Test files live under `test/` and typically use `*.spec.ts` naming.
- Run `pnpm test` locally; add tests for new parsing or handler behavior.

## Commit & Pull Request Guidelines

- Commit messages follow Conventional Commits: `feat: ...`, `chore: ...`, `init`.
- PRs should include: summary, test results (commands + outcomes), and any config/env changes.
- If behavior changes affect Telegram or email parsing, include example inputs/outputs.

## Configuration & Secrets

- Secrets are managed via Wrangler (`wrangler secret put ...`).
- Required environment values include `CLAUDE_API_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, and `SENTRY_DSN` when enabled.
- Database schema changes must update `db/schema.sql` and be applied to D1.
