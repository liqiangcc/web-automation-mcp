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

Conversation discovery/read/export use cases may compose conversation ports and `AnswerFilePort`, but they must not know sidebar, scrolling, DOM or provider URL mechanics.

### `domain/`

Contains stable concepts and error types:

- `ProfileId`
- `ConversationId`
- `ProviderId`
- `AskRequest/AskResult`
- conversation summary/page/message/transcript concepts
- execution status/error taxonomy

No dependency on MCP, Playwright or ChatGPT.

### `ports/`

Defines interfaces consumed by application/provider/session logic:

- `ProviderPort`
- `BrowserPort`
- `ConversationCatalogPort` / `ConversationReaderPort` when conversation discovery is implemented
- `AnswerFilePort`
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

It does not send prompts, discover provider conversations or decide response completion.

### `adapters/chatgpt/`

Owns ChatGPT Web semantics:

- how to recognize login state
- how to open a new conversation
- how to resolve semantic targets
- how to submit a prompt
- how to map the current page into response/generation/composer semantic state
- how to extract the assistant response
- how to discover ChatGPT conversation handles/titles
- how to interpret lazy/virtualized conversation history
- how to map provider message DOM into semantic user/assistant messages

This is the main change boundary when ChatGPT UI changes.

The ChatGPT adapter may expose semantic completion snapshots and semantic conversation pages/transcripts, but it does not own browser event transport, timer policy, filesystem output policy or MCP schemas.

### `adapters/playwright/`

Owns browser mechanics:

- launch/connect browser context
- page lifecycle
- fill/click/press/file input
- locator execution
- generic scrolling
- generic DOM-change notification
- page-side observer cleanup/debounce
- snapshots/screenshots
- browser-level timeouts

It must not know what a ChatGPT prompt, assistant response, stop button, completed answer, conversation item, conversation title or message role means.

### Completion policy

`CompletionDetector` owns completion state transitions and policy. It consumes provider-semantic snapshots plus generic browser-change/clock dependencies.

It must not import Playwright or contain ChatGPT selectors.

The detailed design is in `docs/RESPONSE_COMPLETION.md`.

### Conversation discovery/read/export policy

Conversation operations are split by concern:

```text
MCP
  -> List/Get/Export Conversation use cases
      -> ConversationCatalogPort / ConversationReaderPort
          -> ChatGPT conversation semantics
              -> BrowserPagePort generic mechanics

ExportConversationUseCase
  -> ConversationReaderPort
  -> transcript renderer
  -> AnswerFilePort
```

The public/application contract uses explicit `conversationId` values. Browser navigation to a conversation is an implementation detail and must not become a process-global "active conversation" state.

Conversation listing returns lightweight metadata only. Full transcript reading is a separate operation. Export writes through `AnswerFilePort` so large transcripts do not need to flow back through MCP results.

Virtual scrolling/lazy loading belongs to the ChatGPT adapter. Generic scroll/DOM-change operations remain browser mechanics. A raw DOM mutation may wake discovery logic, but only semantic progress such as discovering a new unique conversation handle may advance the conversation-list progress state.

The detailed design is in `docs/CONVERSATIONS.md`.

### `recovery/` (V0.2+)

Owns fallback and repair orchestration. V0.1 should only collect diagnostics and return a typed `PROVIDER_CHANGED` failure after deterministic strategies are exhausted.

## 3. Dependency rules

```text
mcp -> application -> domain/ports
provider/chatgpt -------> ports
chatgpt semantic probes -> ports
chatgpt conversation adapter -> browser/session ports
completion detector ----> semantic/change/clock abstractions
playwright adapter -----> ports
session ----------------> ports
application export -----> conversation reader + answer file port
```

Forbidden dependencies:

```text
application -> playwright
application -> ChatGPT DOM/sidebar/virtual-scroll mechanics
mcp -> chatgpt DOM selectors
mcp -> filesystem
domain -> MCP SDK
chatgpt adapter -> MCP SDK
chatgpt adapter -> output-root policy
playwright adapter -> ChatGPT concepts
playwright adapter -> conversation semantics
completion detector -> Playwright API
completion detector -> ChatGPT selectors
browser page state -> global active conversation
raw DOM mutation -> semantic completion decision
raw DOM mutation -> semantic conversation pagination progress
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
    conversation-catalog-port.ts
    conversation-reader-port.ts
    answer-file-port.ts
    profile-store.ts
    diagnostics-sink.ts
  application/
    ask.ts
    ask-to-file.ts
    ask-with-files.ts
    new-chat.ts
    session-status.ts
    list-conversations.ts
    get-conversation.ts
    export-conversation.ts
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
      conversation-catalog.ts
      conversation-reader.ts
      conversation-targets.ts
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
      list-conversations-tool.ts
      get-conversation-tool.ts
      export-conversation-tool.ts
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

Conversation targets extend the same provider-owned semantic-target idea; their selectors must remain under `adapters/chatgpt`.

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
- `RESPONSE_START_TIMEOUT`
- `GENERATION_STALLED`
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

## 8. Conversation flow boundary

Conversation discovery/read/continuation uses explicit identity:

```text
LIST
  -> ConversationSummary[] + opaque nextCursor
  -> choose conversationId
  -> optional GET transcript
  -> ASK using the same explicit conversationId
  -> optional EXPORT transcript through AnswerFilePort
```

No separate `open/select/set-active` operation is required. Provider navigation is internal to the ChatGPT adapter/provider workflow.

`web_list_conversations` is an index operation and must not return message bodies. `web_get_conversation` is a read operation. `web_export_conversation_to_file` is a composition of conversation reading, deterministic transcript rendering and restricted file output.

See `docs/CONVERSATIONS.md` for pagination, virtual-scroll, completeness, security and acceptance rules.

## 9. Change handling

### Level 0: normal

Known semantic locator succeeds -> deterministic execution.

### Level 1: selector drift

Primary locator fails -> ordered fallback succeeds -> continue and record drift metric.

### Level 2: structural drift

All deterministic candidates fail -> collect diagnostics -> `PROVIDER_CHANGED` in V0.1. In V0.2+, invoke a recovery strategy to propose a candidate locator, validate it in isolation, and store it only after repeated success.

### Level 3: behavioral change

Workflow semantics changed (for example the provider introduces a new mandatory interaction) -> do not self-patch a selector. Mark provider behavior version incompatible and require workflow/provider adapter update.

The same levels apply independently to prompt/completion UI and conversation-history/message UI.

## 10. Authentication architecture

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

Conversation list/read/export operations use the same session/profile ownership boundary; they do not introduce a separate browser/profile lifecycle.

## 11. Why login is a CLI concern first

Interactive sign-in can require MFA, external identity providers and anti-abuse challenges. Treating login as an explicit local maintenance operation keeps MCP calls deterministic and prevents authentication secrets from flowing through the model.
