# PoC Plan

## Objective

Prove the smallest useful vertical slice before building a generic framework:

```text
manual login once
 -> persistent profile
 -> MCP ask
 -> ChatGPT Web
 -> wait until complete
 -> extract response text
 -> return result
```

## PoC-0: Pure architecture tests

Implement fake ports first.

Acceptance:

- `AskUseCase` is testable with `FakeProvider` and `FakeProfileManager`.
- no import from `playwright` or MCP SDK in domain/application modules.
- failure taxonomy is covered by unit tests.

## PoC-1: Persistent profile bootstrap

Command:

```bash
npm run login -- --provider chatgpt --profile default
```

Behavior:

1. acquire profile lock;
2. launch headed persistent Chromium;
3. navigate to ChatGPT;
4. user signs in manually;
5. session probe loops until authenticated or cancelled;
6. release profile.

Acceptance:

- close browser;
- run command again;
- signed-in state is still present without credentials.

## PoC-2: Provider session probe

Implement `ChatGPTSessionProbe` with three-way classification:

- authenticated
- auth required
- unknown/unavailable

Do not implement `cookieExists()` as the probe.

Acceptance: login page and network failure are classified differently.

## PoC-3: Prompt submission

Implement semantic target registry for `prompt_input` and `send_action`.

Resolution order:

1. role/accessibility semantics;
2. label/placeholder/text semantics;
3. stable provider-specific attribute;
4. CSS fallback.

Acceptance: prompt is visibly submitted without coordinate/mouse recording.

## PoC-4: Completion detector

Capture assistant-response baseline before submit.

Suggested detector state:

```text
WAIT_NEW_RESPONSE
 -> STREAMING
 -> STABLE_CANDIDATE
 -> COMPLETED
```

Completion requires multiple signals rather than a single selector.

Initial heuristic:

- a new assistant response exists;
- text has changed at least once after appearance;
- text remains unchanged for e.g. 1.5-2.5 seconds;
- provider is not visibly in generating/busy state;
- input is usable again.

The exact thresholds are configuration, not domain rules.

Acceptance: short and long answers finish without fixed sleeps and without truncation.

## PoC-5: Response extraction

Associate response with the newly created assistant message index/handle.

V0.1 return:

```json
{
  "status": "completed",
  "conversation_id": "opaque-id",
  "response_text": "...",
  "duration_ms": 12345
}
```

Acceptance: code blocks/lists may lose Markdown syntax, but no answer text is truncated or mixed with older messages.

## PoC-6: MCP wrapper

Expose `web_ask` only after PoC-1..5 work directly through application APIs.

Use the stable MCP TypeScript SDK v2 line.

Acceptance:

- test with MCP Inspector;
- MCP module contains no provider selectors;
- stdout remains reserved for stdio protocol when stdio transport is used.

## PoC-7: Drift simulation

Before AI repair, prove deterministic fallback.

Use a local fixture page modeled around semantic roles. Break the primary target while leaving a fallback target valid.

Acceptance:

- `TargetResolver` falls back;
- drift telemetry records the primary failure;
- no application/MCP code changes.

## PoC-8: Diagnostics

On `TARGET_NOT_FOUND` or `EXTRACTION_FAILED`, write a local diagnostics bundle:

```text
diagnostics/<request-id>/
  meta.json
  screenshot.png       # if enabled
  accessibility.txt
  dom-summary.txt
```

Acceptance: enough evidence exists to update only the ChatGPT adapter.

## Recommended validation matrix

Run 30+ prompts with at least:

- 5 short factual prompts
- 5 long-form prompts
- 5 code-generation prompts
- 5 multi-turn follow-ups
- 5 responses intentionally allowed to run >30 s
- 5 repeated new-chat runs

Record:

- success/failure category
- time to first response
- total completion time
- text length
- whether fallback locator was used
- whether output was truncated

## Exit decision

Proceed from PoC to V0.1 implementation only when the persistent-session, completion-detection and extraction gates pass. Do not begin generic workflow recording before those gates pass.
