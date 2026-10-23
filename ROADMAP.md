# Roadmap

## Current

- Verified 2026 OpenCode Go policy and holiday calendar.
- Provider boundary: only `opencode-go` is managed.
- Primary and auxiliary request holds.
- Session-scoped explicit peak authorization.
- `offpeak` service for free-first paid timing.
- `/offpeak` status and control commands.

## Next

- Add the 2027 State Council holiday calendar when published.
- Re-verify the OpenCode Go model table after any provider catalog change.
- Add a policy status line for custom deployment policies only if a real need
  appears; the built-in set stays explicit and fail-closed.

## Explicitly out of scope

- A queue or background scheduler.
- A proxy that injects pricing headers.
- Global peak authorization.
- Persisting and replaying an in-flight paid request.
