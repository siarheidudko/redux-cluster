# redux-cluster — instructions for Claude

TypeScript cluster module for Redux that synchronizes Redux stores across cluster processes via IPC and TCP sockets. Published to npm as `redux-cluster`.

## Stack

- TypeScript (`tsc`), targeting CJS + ESM dual build with type declarations.
- Node `>=16` runtime; CI tests on Node 20, 22 and 24.
- ESLint + Prettier.
- Test runner: `node --test` with `tsx` import.

## Commands you must know

```bash
npm run lint           # ESLint over src/**/*.ts and tests/**/*.ts — must exit 0
npm run build          # Clean + tsc types + tsc ESM + tsc CJS + create-package-files.sh
npm run test:all       # Aggregator: unit + error + transport (used by autoupdate verification)
npm run test:unit      # Unit tests only
npm run test:transport # Transport-layer tests
npm run test:cluster   # Cluster tests (more setup-heavy)
npm run test:integration # Integration tests
npm run test:error     # Error-path tests
npm test               # Alias for npm run test:all
```

## Definition of "done" for any change you make

You are NOT done with a code change until **all three** of the following exit 0 in the working tree on the branch you're going to push:

```bash
npm run lint
npm run build
npm run test:all
```

Run these explicitly with the `Bash` tool before your last commit on the branch. Do not assume "the change looks right" is sufficient — `tsc` errors and ESLint errors must be observed as exit code 0, not inferred. If any of them fail, fix the failure and re-run all three from a clean state until they all pass. Only then commit and push.

If `npm install` is needed (e.g. lockfile changed), run it with `--no-audit --no-fund` and ensure it returned 0 before running checks.

## Boundaries

- Do not modify product logic when fixing dependency-compatibility issues. Acceptable edits: type adjustments, renamed exports, breaking-change shims, ESLint-config tweaks for new rule defaults.
- Do not bump the package `version` manually. Versioning is handled by the autoupdate flow / maintainer on release.
- Do not edit `.github/workflows/build-and-deploy.yml` unless explicitly asked — it is the release pipeline.
- Do not push to `main` directly. Always work on the existing branch you were summoned to.

## When you are working on an autoupdate PR

- Branch will be `chore/autoupdate-<run_id>`.
- Goal: bring `npm run lint && npm run build && npm run test:all` to green.
- Push compatibility fixes onto this branch. Each push re-runs `pr-checks.yml` automatically; you don't need to mention checks back to the maintainer until they're green.
- If a fix is impossible without changing product behavior, stop and leave a comment explaining what's blocked rather than guessing.

## CI quirks specific to this repo

This repo follows the unified `autoupdate-with-claude` baseline (same template across siblings). Several workarounds are intentional:
- `autoupdate.yml` uses `GITHUB_TOKEN` and explicitly dispatches `pr-checks.yml` after PR creation, because events created via `GITHUB_TOKEN` don't trigger `pull_request` workflows.
- `autoupdate.yml` dispatches `claude.yml` directly via `workflow_dispatch` (passing `branch` and `run_url` inputs) instead of relying on an `@claude` PR comment.
- Releases are wired via `release-on-version-bump.yml` (push to main → detect `package.json` version change → force-recreate `vX.Y.Z` tag on main HEAD → dispatch `build-and-deploy.yml`).
- All actions pinned to the `@v4` line because the runner image currently lacks `externals/node24`, breaking post-cleanup of `@v5/@v6` actions.

Do **not** "fix" any of the above by replacing dispatch calls with comment-based mentions, or by bumping action versions back to `@v5/@v6`.
