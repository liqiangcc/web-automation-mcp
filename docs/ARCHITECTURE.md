# Architecture

## 1. Architecture decision

Use ports/adapters with a deterministic provider state machine. Do not encode the ChatGPT workflow as a raw Playwright script exposed to MCP.

```text
MCP Client
    |
    v
MCP Adapter
    |
    v
Application Use Cases
    |
    +--------------------+
    |                    |
    v                    v
ProviderPort         ProfileManager
    ^                    |
    |                    v
ChatGPTProvider      BrowserProfile + ProfileLock
    |
    +---------------------------------------------+
    |               |               |             |
    v               v               v             v
TargetResolver  CompletionDetector  ResponseExtractor  Provider Probes
    |               |               |             |
    +---------------+---------------+-------------+
                    |
                    v
                BrowserPort
                    ^
                    |
             PlaywrightAdapter
```

## 2. Concern boundaries

### `mcp/`

Responsible only for protocol schemas, tool registration and translating application results to MCP results.

Must not contain Playwright selectors or provider-specific DOM logic.

### `application/`

Implements use cases such as `Ask`, `NewChat` and `SessionStatus`.

Knows semantic provider operations, not browser selectors or completion mechanics.

### `domain/`

Contains stable concepts and error types:

- `ProfileId`
- `ConversationId`
- `ProviderId`
- `AskRequest/AskResult`
- execution status/error taxonomy

No dependency on MCP, Playwright or ChatGPT.

### `ports/`

Defines interfaces consumed by application/provider/session logic:

- `ProviderPort`
- `BrowserPort`
- `ProfileStore`
- `DiagnosticsSink`
- clock/change abstractions when needed for deterministic completion tests

### `session/`

Owns browser identity lifecycle:

- profile path resolution
- profile creation metadata
- exclusive locking
- headed/manual login bootstrap
- session probing coordination

It does not send prompts or decide response completion.

### `adapters/chatgpt/`

Owns ChatGPT Web semantics:

- how to recognize login state
- how to open a new conversation
- how to resolve semantic targets
- how to submit a prompt
- how to map the current page into response/generation/composer semantic state
- how to extract the assistant response

This is the main change boundary when ChatGPT UI changes.

The ChatGPT adapter may expose semantic completion snapshots, but it does not own browser event transport or timer policy.

### `adapters/playwright/`

Owns browser mechanics:

- launch/connect browser context
- page lifecycle
- fill/click/press/file input
- locator execution
- generic DOM-change notification
- page-side observer cleanup/debounce
- snapshots/screenshots
- browser-level timeouts

It must not know what a ChatGPT prompt, assistant response, stop button or completed answer means.

### Completion policy

`CompletionDetector` owns completion state transitions and policy. It consumes provider-semantic snapshots plus generic browser-change/clock dependencies.

It must not import Playwright or contain ChatGPT selectors.

The detailed design is in `docs/RESPONSE_COMPLETION.md`.

### `recovery/` (V0.2+)

Owns fallback and repair orchestration. V0.1 should only collect diagnostics and return a typed `PROVIDER_CHANGED` failure after deterministic strategies are exhausted.

## 3. Dependency rules

```text
mcp -> application -> domain/ports
provider/chatgpt -------> ports
chatgpt semantic probes -> ports
completion detector ----> semantic/change/clock abstractions
playwright adapter -----> ports
session ----------------> ports
```

Forbidden dependencies:

```text
application -> playwright
mcp -> chatgpt DOM selectors
domain -> MCP SDK
chatgpt adapter -> MCP SDK
playwright adapter -> ChatGPT concepts
completion detector -> Playwright API
completion detector -> ChatGPT selectors
raw DOM mutation -> semantic completion decision
```

## 4. Suggested source layout

```text
src/
  domain/
    conversation.ts
    execution.ts
    errors.ts
  ports/
    provider-port.ts
    browser-port.ts
    answer-file-port.ts
    profile-store.ts
    diagnostics-sink.ts
  application/
    ask.ts
    ask-to-file.ts
    ask-with-files.ts
    new-chat.ts
    session-status.ts
  session/
    profile-manager.ts
    profile-lock.ts
    profile-path.ts
  adapters/
    chatgpt/
      session-probe.ts
      targets.ts
      completion-snapshot.ts
      completion-detector.ts
      response-extractor.ts
    playwright/
      playwright-browser.ts
      locator-runner.ts
      dom-change-source.ts
  mcp/
    create-server.ts
    tools/
      ask-tool.ts
      new-chat-tool.ts
      session-status-tool.ts
  cli/
    login.ts
  infrastructure/
    answer-file.ts
    diagnostics.ts
    logger.ts
```

Names are illustrative. Preserve simple boundaries rather than creating an interface for every file.

## 5. Semantic target model

Do not store only one selector.

```ts
interface SemanticTarget {
  id: 'prompt_input' | 'send_action' | 'assistant_message' | 'new_chat_action';
  candidates: LocatorCandidate[];
}

type LocatorCandidate =
  | { kind: 'role'; role: string; name?: string | RegExp }
  | { kind: 'label'; text: string | RegExp }
  | { kind: 'placeholder'; text: string | RegExp }
  | { kind: 'testId'; value: string }
  | { kind: 'css'; value: string };
```

Candidate order is provider-specific. CSS is a fallback, not the default contract.

## 6. Ask state machine

```text
ACQUIRE_PROFILE
  -> PROBE_SESSION
  -> OPEN_OR_RESUME_CONVERSATION
  -> CAPTURE_RESPONSE_BASELINE
  -> RESOLVE_PROMPT_INPUT
  -> SUBMIT_PROMPT
  -> WAIT_FOR_RESPONSE_COMPLETION
  -> EXTRACT/RETURN_RESPONSE
  -> RETURN
```

`WAIT_FOR_RESPONSE_COMPLETION` is event-driven in the target V0.1 reliability design:

```text
generic DOM change / timer deadline
        -> read ChatGPT semantic completion snapshot
        -> update completion state
        -> complete, continue, or typed timeout
```

A raw DOM mutation is only a wake-up. It is not proof of generation progress.

Typed exits include:

- `AUTH_REQUIRED`
- `PROFILE_BUSY`
- `NAVIGATION_FAILED`
- `TARGET_NOT_FOUND`
- `RESPONSE_START_TIMEOUT` (planned)
- `GENERATION_STALLED` (planned)
- `GENERATION_TIMEOUT`
- `EXTRACTION_FAILED`
- `PROVIDER_CHANGED`

## 7. Event-driven completion boundary

The completion path is intentionally split into three concerns:

```text
Playwright/browser
  "the page changed"
        |
        v
ChatGPT semantic probe
  "response text/generation/composer state"
        |
        v
CompletionDetector
  "given those states and time, are we done?"
```

Browser event transport may use `MutationObserver` and debounce internally. ChatGPT selectors stay in `adapters/chatgpt`. Settle/start/idle/absolute timing policy stays in `CompletionDetector`.

Only relevant semantic snapshot changes refresh the activity clock. Sidebar animations or unrelated DOM churn must not prevent a stalled-generation timeout.

See `docs/RESPONSE_COMPLETION.md` for the complete state and timeout design.

## 8. Change handling

### Level 0: normal

Known semantic locator succeeds -> deterministic execution.

### Level 1: selector drift

Primary locator fails -> ordered fallback succeeds -> continue and record drift metric.

### Level 2: structural drift

All deterministic candidates fail -> collect diagnostics -> `PROVIDER_CHANGED` in V0.1. In V0.2+, invoke a recovery strategy to propose a candidate locator, validate it in isolation, and store it only after repeated success.

### Level 3: behavioral change

Workflow semantics changed (for example the provider introduces a new mandatory interaction) -> do not self-patch a selector. Mark provider behavior version incompatible and require workflow/provider adapter update.

## 9. Authentication architecture

Use a dedicated Playwright persistent context:

```text
~/.web-automation-mcp/
  profiles/
    chatgpt-default/
  locks/
  diagnostics/
  state/
```

Manual bootstrap:

```text
CLI login
 -> acquire exclusive profile lock
 -> launch headed persistent browser
 -> user signs in
 -> session probe reports AUTHENTICATED
 -> close/release
```

Runtime never receives the user's password.

## 10. Why login is a CLI concern first

Interactive sign-in can require MFA, external identity providers and anti-abuse challenges. Treating login as an explicit local maintenance operation keeps MCP calls deterministic and prevents authentication secrets from flowing through the model.
