# AGENTS.md — dsh-offpeak

## Start here

Read `README.md`, `ARCHITECTURE.md`, `DECISIONS.md`, `ROADMAP.md`, and the latest
`HANDOFF.md` before changing behavior. A local checkout is not proof of
`origin/main`: run `git status -sb` and inspect `git log -1`; deployed
production is the live DeepSeek Harness profile described in `HANDOFF.md`.
The host repository map is `/root/REPO_MAP.md`.

## What this repo is

A DeepSeek Harness native plugin package. It is not an OpenCode plugin and must
not import `@opencode/plugin` or OpenCode lifecycle hooks.

## Production

The live integration is the DeepSeek Harness host at `/root/.dsh`, with the
guarded launcher `/root/cli-persistence/bin/dsh` and this package pinned in
`/root/.dsh/profiles/{headless,web}/package.json` to a release tag. Verify with
`python3 /root/scripts/dsh_verify.py --live` and
`node /root/scripts/dsh_verify_runtime.mjs`; see `HANDOFF.md`.

## Commands

```sh
npm ci
npm run typecheck
npm test
npm pack --dry-run
```

## Invariants

- Pricing evaluation stays pure and clock-injected in `src/policy.ts`.
- The plugin must never send a provider request while a paid route is held.
- `UNKNOWN` stays fail-closed; `FLAT` and `UNTRACKED` are never delayed.
- Do not replace the Harness waterfalls with a proxy, daemon, or polling loop.
- Session overrides are explicit and session-scoped; never globalize them.
- Do not add a second scheduler or queue.
- Update `ARCHITECTURE.md`, `DECISIONS.md`, and `HANDOFF.md` with behavior
  changes, and keep tests deterministic and provider-free.
