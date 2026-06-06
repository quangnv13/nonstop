# Root `src` Migration Design

## Goal

Restructure the repository so the Telegram runtime lives directly at the repository root, with source files under `src/`, runtime data remaining in `data/`, and both `apps/client` and `apps/server` removed entirely.

## Scope

This change includes:

- Moving the current single-process Telegram client runtime from `apps/client/src` to `src`
- Promoting runtime package metadata and build scripts to the root `package.json`
- Moving root-facing config files to the repository root, including `tsconfig.json` and `.env.example`
- Keeping `data/` in place and preserving its current role for runtime workspace storage
- Removing all remaining `apps/server` files and residual references
- Removing `apps/client` after the root runtime is verified
- Updating operator documentation to match the root-runtime architecture

This change does not include:

- Reworking runtime behavior beyond path and packaging changes
- Changing the workspace data model
- Adding new user-facing features

## Architecture

The repository will become a single Node.js package rooted at the project root.

- `src/` contains the Telegram bot runtime, PTY driver, workspace store, session output formatting, and related helpers
- `package.json` at root owns all runtime dependencies and scripts such as `dev`, `build`, and `start`
- `tsconfig.json` at root compiles `src/**/*` into `dist/`
- `.env.example` at root documents the required Telegram and CLI override environment variables
- `data/` remains the runtime storage location for workspaces and any existing JSON artifacts

The runtime should behave the same after migration, except paths and startup commands become root-based instead of `apps/client`-based.

## File Structure

Target structure:

```text
/
  package.json
  package-lock.json
  tsconfig.json
  .env.example
  src/
    index.ts
    bot.ts
    logger.ts
    prompt-detection.ts
    session-controls.ts
    session-delivery.ts
    session-output.ts
    store.ts
    terminal.ts
    types.ts
  data/
  docs/
```

Removed structure:

- `apps/client/**`
- `apps/server/**`

## Data and Path Handling

`data/` remains rooted at the repository root. The migrated `store.ts` should continue resolving the data directory reliably when the runtime starts from the repository root. Default workspace regeneration should continue producing root-relative defaults:

- `Project Root`
- `Docs`

If keeping `Client App` still makes sense after migration, it should be replaced with a root-oriented label or removed. The preferred result is to avoid any default workspace that points at a deleted path.

Existing tracked JSON fixtures in `data/` should be updated so they no longer reference `apps/server` or `apps/client`.

## Dependency and Env Model

The root `package.json` becomes the only dependency manifest. It should contain the runtime dependencies currently required by the Telegram client:

- `dotenv`
- `grammy`
- `node-pty`

And the current development dependencies:

- `@types/node`
- `tsx`
- `typescript`

The root `.env.example` should document:

- `TELEGRAM_BOT_TOKEN`
- `ADMIN_USERNAME`
- `CLIENT_NAME`
- `TELEGRAM_USERNAME`
- `OUTPUT_INTERVAL`
- `MAX_OUTPUT_LINES`
- `MAX_RENDER_LINES`
- optional `CODEX_*`
- optional `ANTIGRAVITY_*`

## Documentation Changes

Update `README.md` and `docs/manual_test.md` so all setup, build, run, and verification steps reference the root runtime. Remove all server/client split instructions and replace them with single-process startup and verification steps.

## Verification

Manual verification for completion:

1. Root install completes and produces a single coherent `package-lock.json`
2. TypeScript build succeeds from the repository root
3. Runtime starts from the repository root using the root scripts
4. No live source, config, or tracked data file references `apps/server`
5. No live source, config, or tracked data file requires `apps/client`
6. `apps/server` and `apps/client` no longer exist after migration

## Risks

- Existing running processes may hold file handles inside `apps/server` or `apps/client`, preventing deletion until stopped
- Root lockfile state may remain stale if installs are run before the folder removal is complete
- Tracked runtime data may still point at deleted workspace paths if not normalized during migration

## Implementation Notes

Prefer a direct file move with minimal code changes. Only adjust imports, package metadata, path assumptions, and documentation that are required by the new root-based layout.
