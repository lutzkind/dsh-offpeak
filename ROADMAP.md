# Roadmap

## Current

- Verified OpenCode Go and DeepSeek Direct API policies, with separate sources,
  model coverage, and holiday rules.
- Provider boundary: `opencode-go` and `deepseek` are managed; everything else
  passes through.
- Primary and auxiliary request holds for both paid providers.
- Session-scoped explicit peak authorization.
- `offpeak` service for free-first OpenCode Go paid timing.
- `/offpeak` status and control commands.

## Next

- Add the 2027 State Council holiday calendar when published.
- Re-verify each provider's model table and peak schedule after any vendor
  change; do not propagate one provider's facts to the other.
- Add a policy status line for custom deployment policies only if a real need
  appears; the built-in set stays explicit and fail-closed.

## Explicitly out of scope

- A queue or background scheduler.
- A proxy that injects pricing headers.
- Global peak authorization.
- Persisting and replaying an in-flight paid request.
