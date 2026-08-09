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
    +-------------------------------+
    |               |               |
    v               v               v
TargetResolver  CompletionDetector  ResponseExtractor
    |               |               |
    +---------------+---------------+
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

Knows semantic provider operations, not browser selectors.

### `domain/`

Contains stable concepts and error types:

- `ProfileId`
- `ConversationId`
- `ProviderId`
- `AskRequest/AskResult`
- execution status/error taxonomy

No dependency on MCP, Playwright or ChatGPT.

### `ports/`

Defines interfaces consumed by application/domain logic:

- `ProviderPort`
- `BrowserPort`
- `ProfileStore`
- `DiagnosticsSink`
- `Clock`

### `session/`

Owns browser identity lifecycle:

- profile path resolution
- profile creation metadata
- exclusive locking
- headed/manual login bootstrap
- session probing coordination

It does not send prompts.

### `adapters/chatgpt/`

Owns ChatGPT Web semantics:

- how to recognize login state
- how to open a new conversation
- how to resolve semantic targets
- how to submit a prompt
- how to recognize generation progress/completion
- how to extract the assistant response

This is the main change boundary when ChatGPT UI changes.

### `adapters/playwright/`

Owns browser mechanics:

- launch persistent context
- page lifecycle
- fill/click/press
- locator execution
- snapshots/screenshots
- timeouts

It must not know what a ChatGPT prompt or assistant response is.

### `recovery/` (V0.2+)

Owns fallback and repair orchestration. V0.1 should only collect diagnostics and return a typed `PROVIDER_CHANGED` failure after deterministic strategies are exhausted.

## 3. Dependency rules

```text
mcp -> application -> domain/ports
chatgpt adapter -------> ports
playwright adapter ----> ports
session ---------------> ports
```

Forbidden dependencies:

```text
application -> playwright
mcp -> chatgpt DOM selectors
domain -> MCP SDK
chatgpt adapter -> MCP SDK
playwright adapter -> ChatGPT concepts
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
    new-chat.ts
    session-status.ts
  session/
    profile-manager.ts
    profile-lock.ts
    profile-path.ts
  adapters/
    chatgpt/
      chatgpt-provider.ts
      session-probe.ts
      targets.ts
      completion-detector.ts
      response-extractor.ts
    playwright/
      playwright-browser.ts
      locator-runner.ts
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
  -> WAIT_FOR_NEW_ASSISTANT_RESPONSE
  -> WAIT_FOR_COMPLETION
  -> EXTRACT_RESPONSE
  -> RETURN
```

Typed exits:

- `AUTH_REQUIRED`
- `PROFILE_BUSY`
- `NAVIGATION_FAILED`
- `TARGET_NOT_FOUND`
- `GENERATION_TIMEOUT`
- `EXTRACTION_FAILED`
- `PROVIDER_CHANGED`

## 7. Change handling

### Level 0: normal

Known semantic locator succeeds -> deterministic execution.

### Level 1: selector drift

Primary locator fails -> ordered fallback succeeds -> continue and record drift metric.

### Level 2: structural drift

All deterministic candidates fail -> collect diagnostics -> `PROVIDER_CHANGED` in V0.1. In V0.2+, invoke a recovery strategy to propose a candidate locator, validate it in isolation, and store it only after repeated success.

### Level 3: behavioral change

Workflow semantics changed (for example the provider introduces a new mandatory interaction) -> do not self-patch a selector. Mark provider behavior version incompatible and require workflow/provider adapter update.

## 8. Authentication architecture

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

## 9. Why login is a CLI concern first

Interactive sign-in can require MFA, external identity providers and anti-abuse challenges. Treating login as an explicit local maintenance operation keeps MCP calls deterministic and prevents authentication secrets from flowing through the model.
