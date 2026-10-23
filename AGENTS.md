# AGENTS.md — dsh-offpeak

## What this repo is

A DeepSeek Harness native plugin package. It is not an OpenCode plugin and must
not import `@opencode/plugin` or OpenCode lifecycle hooks.

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
