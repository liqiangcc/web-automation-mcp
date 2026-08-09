# Event-Driven Response Completion

## 1. Purpose

This document defines how `web-automation-mcp` should detect that a Web AI response has completed without relying on a fixed high-frequency polling loop.

The design must solve three reliability problems at the same time:

1. long responses must not fail only because total generation time exceeds a small fixed timeout;
2. completed responses should be returned promptly instead of waiting for a conservative polling/stability window;
3. completion must not be declared early while the provider is still streaming or changing the response.

The design is intentionally provider-semantic and browser-mechanic separated. Event delivery is a browser capability. Interpretation of ChatGPT UI state belongs to the ChatGPT adapter. Completion policy is a state-machine concern.

## 2. Core decision

Use **event-driven DOM change notification as the primary wake-up mechanism**, combined with semantic snapshots and bounded timers.

```text
Browser DOM changes
      |
      v
BrowserChangeSource
      |   generic: "the page changed"
      v
ChatGptCompletionSnapshotSource
      |   provider semantic snapshot
      v
CompletionDetector state machine
      |
      +--> completed
      +--> start timeout
      +--> stalled
      +--> absolute timeout
```

Do not use a fixed `sleep(250)` loop as the normal progression mechanism.

Timers remain necessary because completion includes proving that no relevant semantic change occurred during a settle window. "No event happened" cannot itself be emitted by `MutationObserver`.

## 3. Separation of concerns

### 3.1 Browser mechanics

The browser abstraction may expose a capability conceptually equivalent to:

```ts
interface BrowserChangeSource {
  waitForChange(options: { timeoutMs: number }): Promise<'changed' | 'timeout'>;
}
```

The Playwright adapter may implement this with a page-side `MutationObserver`, optionally with a short debounce to coalesce mutation bursts.

Browser mechanics are responsible for:

- installing and disposing the DOM observer;
- waking the caller when the document changes;
- debouncing event storms;
- surviving page lifecycle/disposal correctly;
- enforcing the requested wait timeout.

Browser mechanics must **not** know:

- what an assistant response is;
- what a ChatGPT stop button means;
- what a composer-ready state means;
- whether a response is complete.

The browser event means only:

> something in the observed page changed; re-read semantic state.

### 3.2 ChatGPT provider semantics

The ChatGPT adapter owns a semantic snapshot source conceptually equivalent to:

```ts
interface CompletionSnapshot {
  responsePresent: boolean;
  responseText?: string;
  generating: boolean | 'unknown';
  composerReady: boolean | 'unknown';
}

interface CompletionSnapshotSource {
  read(): Promise<CompletionSnapshot>;
}
```

This layer is responsible for mapping provider UI into stable meanings:

- whether a post-baseline assistant response exists;
- the current response text;
- whether generation is visibly active;
- whether the composer is ready for a new request.

Selectors and provider-specific fallbacks remain inside `adapters/chatgpt/`.

This layer does not decide timeout policy or how long text must remain stable.

### 3.3 Completion state machine

`CompletionDetector` consumes only:

- semantic completion snapshots;
- generic browser-change wakeups;
- clock/timer dependencies;
- completion policy configuration.

It owns:

- state transitions;
- semantic activity tracking;
- fast and fallback settle windows;
- start/idle/absolute timeout classification;
- the final completion decision.

It must not contain Playwright APIs or ChatGPT selectors.

### 3.4 Application and MCP

Application use cases continue to treat completion as a provider operation. MCP schemas remain unchanged.

Neither `application/` nor `mcp/` should know whether completion is implemented with `MutationObserver`, polling, timers, or another browser primitive.

## 4. Critical activity rule

A raw DOM mutation is **not semantic activity**.

ChatGPT pages can mutate for reasons unrelated to the active answer, including navigation chrome, sidebars, animations, status indicators and other background UI.

Therefore:

```text
DOM mutation
    |
    +--> wake detector
           |
           v
      read semantic snapshot
           |
           +--> snapshot meaning changed -> semantic activity
           |
           +--> no semantic change      -> no activity reset
```

`lastActivityAt` may be refreshed only by relevant semantic changes, for example:

- the first post-baseline assistant response appears;
- response text changes;
- `generating` changes state;
- `composerReady` changes state.

Unrelated DOM mutations must never keep a stuck generation alive indefinitely.

## 5. State model

Recommended logical states:

```text
SUBMITTED
   |
   v
WAITING_FOR_START
   |
   | response appears / generation begins
   v
GENERATING
   |
   | strong completion signals appear
   v
FAST_SETTLING
   |\
   | \ semantic activity -> GENERATING
   |  \
   |   settle timer expires with state unchanged
   v
COMPLETED

GENERATING
   |
   | no reliable generation transition but response becomes quiet
   v
FALLBACK_SETTLING
   |\
   | \ semantic activity -> GENERATING
   |  \
   |   longer settle timer expires with state unchanged
   v
COMPLETED
```

The names are internal implementation concepts; they do not need to become domain entities if a simpler implementation can preserve the same behavior.

## 6. Completion signals

### 6.1 Strong/fast path

Use the fast path when the detector has observed reliable provider state, especially a transition such as:

```text
generating = true
      ->
generating = false
```

A completion candidate should require:

```text
post-baseline response exists
AND response text is non-empty
AND generating is not active
AND composer is ready (when the signal is available)
```

Then require only a short settle period before returning.

Initial tuning target:

```text
fastSettleMs ~= 300-500 ms
```

The exact value is configuration and must be tuned by live validation rather than hard-coded as a domain rule.

### 6.2 Weak/fallback path

If reliable generation state was never observed, completion must be more conservative:

```text
post-baseline response exists
AND response text is non-empty
AND no known generating signal is active
AND composer is ready or unavailable as a signal
AND semantic response state remains unchanged for a longer window
```

Initial tuning target:

```text
fallbackSettleMs ~= 1500-2000 ms
```

This is a fallback, not the normal performance path.

### 6.3 Unknown signals

A missing or drifted selector should not automatically mean `false`.

Where useful, provider probes should distinguish:

```text
true | false | unknown
```

This avoids treating "could not observe the generation control" as proof that generation ended.

## 7. Timeout model

Do not use a small fixed total-generation timeout as the primary failure condition.

Use separate timeout meanings.

### 7.1 Response start timeout

If no post-baseline response or generation signal appears within a bounded startup window:

```text
WAITING_FOR_START -> RESPONSE_START_TIMEOUT
```

Suggested initial range: 30-60 seconds, subject to live testing.

### 7.2 Semantic idle/stall timeout

After generation has started, measure time since the last **semantic activity**, not time since submission.

```text
lastActivityAt = time of last relevant snapshot change
```

A long answer that keeps adding text continues to refresh activity and must not fail merely because total duration exceeds two minutes.

A conservative initial idle/stall window should be used because reasoning can legitimately pause before emitting more text. The initial implementation should prefer a value around 90-120 seconds and tune it using real long-response tests.

On expiry:

```text
GENERATING -> GENERATION_STALLED
```

### 7.3 Absolute safety timeout

Keep a much larger absolute upper bound as a final safety net, for example around 10 minutes.

```text
any non-terminal state -> GENERATION_TIMEOUT
```

The absolute timeout protects against observers, provider state or browser behavior that never reaches a terminal condition. It is not the normal long-response limit.

## 8. Event waiting and timers

A normal detector cycle should look like:

```text
1. read semantic snapshot
2. update state/activity
3. if complete -> return the already-read response
4. compute nearest relevant deadline
5. wait for DOM change OR deadline
6. repeat
```

Conceptually:

```ts
await Promise.race([
  changes.waitForChange({ timeoutMs: nextDeadlineMs }),
  deadline,
]);
```

The implementation does not need to expose `Promise.race` through a port; this only describes orchestration behavior.

A low-frequency watchdog may be retained as a resilience fallback if the observer is lost across page lifecycle changes. It must not become the primary 250 ms polling loop, and watchdog wakeups do not count as semantic activity by themselves.

## 9. MutationObserver scope and debounce

A page-side `MutationObserver` can generate a large event volume during streaming.

The Playwright adapter may debounce/coalesce raw events for a short interval, for example 25-50 ms:

```text
many DOM mutations
      |
      v
short debounce
      |
      v
one "changed" wakeup
```

Debounce belongs to browser mechanics because it manages event transport volume, not completion meaning.

The first implementation may observe a broad page root for robustness. If event volume becomes excessive, observation scope may later be narrowed behind the same generic browser-change abstraction without changing provider/application code.

## 10. Result freshness

When a completion decision is reached, return the response text from the same semantic snapshot used to make that decision whenever possible.

Avoid this pattern:

```text
detect complete
 -> perform unrelated wait
 -> re-query DOM later
 -> extract again
```

Prefer:

```text
read snapshot
 -> prove complete
 -> return snapshot text immediately
```

This minimizes the delay between observed provider completion and MCP result delivery.

## 11. Failure taxonomy

Planned completion-related error meanings:

- `RESPONSE_START_TIMEOUT`: submission occurred but no response/generation start was observed in time;
- `GENERATION_STALLED`: generation started but relevant semantic state stopped progressing beyond the idle threshold;
- `GENERATION_TIMEOUT`: the large absolute safety bound was exceeded;
- `PROVIDER_CHANGED`: required provider semantics cannot be established after deterministic fallbacks;
- `EXTRACTION_FAILED`: a completed post-baseline response cannot be extracted safely.

The current error taxonomy may keep `GENERATION_TIMEOUT` during migration, but implementation should converge toward the more precise classifications above.

## 12. Observability

Completion diagnostics should record metadata only, never response text.

Useful fields include:

```text
completionPath: fast | fallback
sawGeneratingSignal: boolean
generationEndedObserved: boolean
semanticActivityCount
browserWakeupCount
watchdogWakeupCount
settleMs
elapsedMs
completionReturnLagMs (when generation-end transition was observed)
terminalErrorCode
```

Do not log prompt text, response text, cookies, tokens, conversation IDs or raw DOM containing user content.

## 13. Testing strategy

### Unit tests

Use fake snapshot/change sources and a fake clock. Cover at least:

1. response begins immediately and completes through the fast path;
2. several text mutations reset semantic activity;
3. unrelated DOM wakeups do not reset semantic activity;
4. generation lasts longer than the old two-minute total timeout but continues making progress;
5. generation becomes silent and reaches `GENERATION_STALLED`;
6. no response begins and reaches `RESPONSE_START_TIMEOUT`;
7. no generation signal is observed and fallback settle completes safely;
8. mutation during settle cancels completion and returns to generating;
9. absolute timeout remains a final safety bound;
10. returned text is the snapshot that satisfied completion.

### Adapter tests

Playwright adapter tests should verify generic change notification and cleanup without ChatGPT selectors.

ChatGPT adapter tests should verify semantic snapshots against provider fixtures without testing timer policy.

### Live validation

Use the existing 30-run validation matrix and end markers to detect premature completion. Add metrics for response-completion latency.

Acceptance targets for the first event-driven implementation:

- no fixed 250 ms polling loop in the normal path;
- long responses with continuing semantic progress are not failed by the old two-minute total limit;
- strong-signal completions normally return within about one second of the observed generation-end transition;
- no end-marker truncation in successful validation cases;
- >=95% complete-response success across the real 30-run matrix before marking the reliability gate complete.

## 14. Non-goals

V0.1 should not:

- reverse engineer ChatGPT private SSE/WebSocket protocols;
- treat network-idle as response completion;
- put ChatGPT selectors in the Playwright adapter;
- put `MutationObserver` details in application/MCP code;
- require prompts to contain validation markers in production;
- reset idle timeout for arbitrary DOM mutations;
- remove all safety timers in the name of being "fully event driven".

## 15. Dependency rule summary

```text
MCP/Application
      |
      v
Provider operation
      |
      v
CompletionDetector
   /          \
  v            v
Semantic      Change/Clock
Snapshot      abstractions
  ^            ^
  |            |
ChatGPT      BrowserPort
Adapter         ^
                |
            Playwright
```

Forbidden:

```text
Playwright -> ChatGPT completion semantics
CompletionDetector -> Playwright API
CompletionDetector -> ChatGPT selectors
ChatGPT snapshot source -> timeout policy
MCP/Application -> MutationObserver
raw DOM mutation -> semantic activity reset
```

This boundary is the main architectural constraint for the implementation phase.
