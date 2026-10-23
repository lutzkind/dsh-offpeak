# Decisions

## 2026-10-23 — Two paid providers, two separate policies

The shipped plugin manages `opencode-go` and the official DeepSeek Direct API
(`deepseek`). Each has its own `PricingPolicy` object, model coverage, source,
and verification date; the current peak windows happen to match, but they are
not shared constants or one merged policy. Both waterfalls evaluate either
managed provider and pass everything else through untouched.

Direct DeepSeek remains explicit/manual selection only: the plugin never selects
it and never falls back to it. It only enforces the verified Direct API timing
policy once that route is chosen. `dsh-free-first` remains OpenCode Go-only and
never intercepts, probes, or maintains health for Direct DeepSeek.

This corrects the earlier v0.2.0 decision that removed the direct policy. Native
provider management is the intended behavior; free-first's narrower boundary is
a separate plugin concern.

## 2026-10-23 — Native Harness waterfalls, not an OpenCode port

Use `agent/request` for primary steps and `llm/stream` for direct auxiliary
calls. Do not copy OpenCode's `model.request`, transport hooks, RPC, or
synthetic continuation machinery; those solve OpenCode-specific lifecycle
problems that do not exist here.

## 2026-10-23 — One timer per hold

The Harness exposes a cancellable request signal and a durable next-transition
instant. A single boundary timer plus a control wake signal is sufficient; a
polling loop would add latency and wakeups without new information.

## 2026-10-23 — Holds are not persisted

A hold belongs to a live turn. Persisting and replaying it would risk duplicate
inference after a crash. A restart cancels the turn; resuming the session
re-enters the same policy.

## 2026-10-23 — Titles use a free/flat route

The shipped title provider bypasses both waterfalls through `prepareCall()`.
Rather than adding a fragile global interception, the host configuration points
title generation at the free/flat OpenCode Go `beam-free` route. Titles are
auxiliary and non-fatal.

## 2026-10-23 — Session override is explicit and persistent

`/offpeak session off` stores only an opt-out keyed by session id. It is
released by `/offpeak session on`, never inherited by other sessions, and does
not bypass `UNKNOWN` or invalid policy data.

## 2026-10-23 — `off` pauses, it does not authorize

Turning the guard off pauses paid dispatch. It does not release held requests
and never creates peak authorization. The only peak authorization is the
explicit session override.
