# Conversation Discovery, Reading, Continuation, and Export

## 1. Purpose

This document defines the design for discovering existing ChatGPT Web conversations, reading their content, continuing a selected conversation, and exporting a conversation to a workspace file.

The design must preserve the repository's existing separation of concerns:

- MCP owns protocol shape only.
- Application owns use-case orchestration only.
- ChatGPT adapters own ChatGPT Web semantics only.
- Browser/Playwright owns generic browser mechanics only.
- Infrastructure owns filesystem persistence only.
- Domain/ports own stable concepts and contracts.

The feature is intentionally designed around explicit `conversationId` values. It must not introduce a mutable global "active conversation" abstraction.

## 2. Problem

The current system can continue a conversation when the caller already has its `conversationId`, but discovery is weak after a Codex/MCP restart or when the conversation was created manually in ChatGPT Web.

Typical desired flow:

```text
AI client
  -> discover recent conversations
  -> inspect lightweight metadata
  -> choose conversationId
  -> optionally read the conversation
  -> continue with web_ask(conversationId, prompt)
  -> optionally export the full conversation to a local workspace file
```

The design must support this flow without making browser page state the source of truth.

## 3. Scope

### 3.1 In scope

Initial capabilities:

1. `web_list_conversations`
   - discover recent conversations;
   - return lightweight metadata;
   - support bounded pagination;
   - never return full message bodies.

2. `web_get_conversation`
   - read one explicit conversation by `conversationId`;
   - return an ordered semantic message list;
   - not submit prompts or mutate the conversation.

3. `web_export_conversation_to_file`
   - read one explicit conversation;
   - render it into a deterministic text/Markdown representation;
   - write through the existing output-file boundary;
   - return metadata, not the full conversation body.

Continuation continues to use the existing `web_ask` / `web_ask_with_files` APIs with an explicit `conversationId`.

### 3.2 Deferred

Defer the following until the basic discovery/read/export flow proves stable:

- `web_search_conversations`;
- provider-wide semantic search;
- deletion/rename/archive operations;
- changing titles;
- bulk export;
- synchronization into a local conversation database;
- indexing or embeddings;
- cross-provider conversation aggregation;
- reconstructing provider-specific rich Markdown with perfect fidelity.

### 3.3 Explicit non-goals

Do not add:

- `web_open_conversation`;
- `web_select_conversation`;
- `web_set_active_conversation`;
- a process-global current conversation;
- a browser-tab-global conversation handle as application state.

The caller must continue to pass `conversationId` explicitly.

## 4. Core design principles

### 4.1 Explicit identity over implicit browser state

Correct:

```text
web_list_conversations
  -> conversationId
  -> web_get_conversation(conversationId)
  -> web_ask(conversationId, prompt)
```

Avoid:

```text
web_open_conversation
  -> browser now has hidden active state
  -> web_ask(prompt)
```

A browser tab may temporarily navigate to a conversation as an implementation detail, but this state must not become an application contract.

### 4.2 List metadata separately from conversation bodies

Conversation discovery is an index operation, not a content-copy operation.

`web_list_conversations` should return only lightweight fields such as:

```ts
interface ConversationSummary {
  readonly conversationId: ConversationId;
  readonly title: string;
}
```

Optional provider-neutral metadata may be added later only when it can be derived reliably, for example `updatedAt`.

Do not return all messages while listing conversations. This avoids unnecessary browser work and excessive MCP/model context usage.

### 4.3 Reading and exporting are separate use cases

Reading returns semantic data to the caller.

Exporting writes content directly through `AnswerFilePort` and returns file metadata.

This keeps large conversations out of the caller's model context when the caller only needs a local artifact.

### 4.4 Browser mechanics do not know conversation semantics

Generic browser mechanics may expose capabilities such as:

- query locators;
- read text/attributes;
- scroll a container;
- navigate;
- wait for DOM change;
- inspect URL;
- test visibility/existence.

They must not expose methods such as:

```text
listChatGptConversations()
readChatGptConversation()
findChatGptSidebarItem()
```

Those belong to the ChatGPT adapter.

## 5. Architecture

```text
MCP Client
    |
    v
MCP Adapter
    |
    +-----------------------------+
    |              |              |
    v              v              v
ListConversations  GetConversation  ExportConversation
UseCase             UseCase          UseCase
    |              |              /        \
    |              |             /          \
    v              v            v            v
ConversationCatalogPort   ConversationReaderPort   AnswerFilePort
    ^              ^                              ^
    |              |                              |
ChatGPT Conversation Adapter                Restricted file writer
    |
    +-------------------------+
    |                         |
    v                         v
BrowserSessionPort       BrowserPagePort
                              ^
                              |
                     PlaywrightBrowserAdapter
```

The two conversation ports may be implemented by one ChatGPT class if that keeps the implementation simple. The important boundary is semantic responsibility, not maximizing interface count.

## 6. Responsibility boundaries

### 6.1 `mcp/`

Responsibilities:

- input schemas;
- output schemas;
- tool registration;
- translating application results to MCP responses;
- public error translation.

Must not:

- know sidebar selectors;
- perform scrolling;
- parse ChatGPT URLs;
- read/write files directly;
- maintain an active conversation.

### 6.2 `application/`

Proposed use cases:

```text
ListConversationsUseCase
GetConversationUseCase
ExportConversationUseCase
```

Responsibilities:

- validate semantic request constraints;
- invoke provider-neutral conversation ports;
- compose conversation reading with `AnswerFilePort` for export;
- return domain results.

Must not:

- import Playwright;
- use ChatGPT selectors;
- directly inspect the filesystem;
- encode virtual-scroll algorithms;
- know whether the provider uses a sidebar.

### 6.3 `domain/`

Stable provider-neutral concepts:

```ts
interface ConversationSummary {
  readonly conversationId: ConversationId;
  readonly title: string;
}

interface ConversationPage {
  readonly conversations: readonly ConversationSummary[];
  readonly nextCursor?: string;
}

type ConversationMessageRole = 'user' | 'assistant' | 'system' | 'other';

interface ConversationMessage {
  readonly role: ConversationMessageRole;
  readonly text: string;
}

interface ConversationTranscript {
  readonly conversationId: ConversationId;
  readonly title?: string;
  readonly messages: readonly ConversationMessage[];
}
```

Provider-specific DOM node identifiers must not enter domain types.

### 6.4 `ports/`

Suggested contracts:

```ts
interface ConversationCatalogPort {
  list(input: {
    readonly profileId: ProfileId;
    readonly limit: number;
    readonly cursor?: string;
  }): Promise<ConversationPage>;
}

interface ConversationReaderPort {
  get(input: {
    readonly profileId: ProfileId;
    readonly conversationId: ConversationId;
  }): Promise<ConversationTranscript>;
}
```

The exact names can remain simple. Avoid creating extra interfaces solely for architectural ceremony.

### 6.5 `adapters/chatgpt/`

Owns all ChatGPT-specific conversation semantics:

- identify the conversation history/navigation region;
- recognize conversation items;
- derive `conversationId` from provider URLs/links;
- read titles;
- paginate through virtualized/lazy history;
- navigate to an explicit conversation;
- recognize user/assistant message containers;
- extract ordered message text;
- determine when additional history rows/messages have finished loading.

This is the main change boundary when ChatGPT Web changes its history UI.

It must not:

- write exported files;
- expose selectors to MCP/application;
- own workspace path policy;
- create application-level active-conversation state.

### 6.6 `adapters/playwright/`

Owns only generic browser mechanics required by the ChatGPT adapter:

- locator operations;
- generic scrolling;
- URL/navigation mechanics;
- DOM-change wait;
- text/attribute extraction;
- page lifecycle.

It must not know:

- what a conversation is;
- what a ChatGPT title is;
- what `/c/<id>` means;
- which message role is user/assistant.

### 6.7 `infrastructure/`

Conversation export must reuse the existing `AnswerFilePort` / restricted atomic writer.

Filesystem responsibilities remain:

```text
relative output path
  -> canonical confined output root
  -> safe atomic write
```

The conversation adapter never receives output-root policy.

## 7. Proposed MCP tools

### 7.1 `web_list_conversations`

Request:

```json
{
  "provider": "chatgpt",
  "profileId": "default",
  "limit": 20,
  "cursor": "optional"
}
```

Response:

```json
{
  "ok": true,
  "provider": "chatgpt",
  "profileId": "default",
  "conversations": [
    {
      "conversationId": "abc123",
      "title": "Browser automation architecture"
    }
  ],
  "nextCursor": "optional"
}
```

Rules:

- default `limit`: 20;
- bounded maximum, recommended 50;
- no message bodies;
- no absolute local paths;
- no assumption that one call enumerates the whole account history.

### 7.2 `web_get_conversation`

Request:

```json
{
  "provider": "chatgpt",
  "profileId": "default",
  "conversationId": "abc123"
}
```

Response:

```json
{
  "ok": true,
  "provider": "chatgpt",
  "profileId": "default",
  "conversationId": "abc123",
  "title": "Browser automation architecture",
  "messages": [
    { "role": "user", "text": "..." },
    { "role": "assistant", "text": "..." }
  ]
}
```

This is intentionally read-only.

For very large transcripts a later version may add message pagination or a size guard. V0.1/first implementation should define and test a deterministic maximum response size rather than silently returning truncated content.

### 7.3 `web_export_conversation_to_file`

Request:

```json
{
  "provider": "chatgpt",
  "profileId": "default",
  "conversationId": "abc123",
  "outputPath": "conversations/browser-automation.md",
  "overwrite": false
}
```

Response:

```json
{
  "ok": true,
  "provider": "chatgpt",
  "profileId": "default",
  "conversationId": "abc123",
  "filePath": "...",
  "messageCount": 42,
  "bytesWritten": 38241,
  "sha256": "..."
}
```

The MCP response must not duplicate the full transcript.

## 8. Pagination and virtualized history

ChatGPT conversation history may be lazy-loaded or virtualized. The domain/API must therefore model discovery as bounded pagination rather than "return all conversations".

### 8.1 Provider-neutral cursor

The public cursor is an opaque string owned by this MCP implementation. Callers must not parse it.

The cursor must not contain:

- cookies;
- authentication tokens;
- local absolute paths;
- raw DOM references;
- arbitrary executable data.

A simple first implementation may encode only stable paging state required by the adapter, with versioning.

### 8.2 Discovery algorithm boundary

ChatGPT adapter may internally perform:

```text
locate history container
  -> read currently visible semantic items
  -> deduplicate by conversationId
  -> if limit not reached:
       scroll history container
       wait for bounded DOM change
       read newly materialized items
  -> stop at limit / end-of-history / provider timeout
```

Application/MCP must not know that this is implemented using scrolling.

### 8.3 Progress and termination

Conversation-list scrolling needs its own bounded progress policy. It must not scroll forever when DOM changes for unrelated reasons.

Semantic progress means discovering at least one new unique conversation handle or observing a reliable end-of-history state.

Raw DOM mutation is only a wake-up signal, consistent with `docs/RESPONSE_COMPLETION.md`.

## 9. Reading a conversation

### 9.1 Navigation

The adapter receives an explicit `conversationId` and navigates/opens that provider conversation as an implementation detail.

The resulting page state is not stored as global application state.

### 9.2 Message extraction

The ChatGPT adapter maps provider DOM into ordered semantic messages:

```text
provider message nodes
  -> role recognition
  -> plain-text extraction
  -> ConversationMessage[]
```

The first implementation should prefer reliable plain text over perfect Markdown reconstruction.

### 9.3 Loading older messages

If a provider conversation can virtualize or lazily load messages, that concern belongs to the ChatGPT reader. It should use bounded semantic progress rules similar to history discovery.

Do not return a transcript marked complete unless the adapter has a positive completeness condition or a deterministic provider boundary.

If completeness cannot be established, return a typed failure rather than silently truncating.

## 10. Continuation semantics

No new continuation tool is required.

The existing call remains:

```json
{
  "provider": "chatgpt",
  "profileId": "default",
  "conversationId": "abc123",
  "prompt": "Continue the previous analysis."
}
```

Flow:

```text
web_list_conversations
  -> choose conversationId
  -> optional web_get_conversation
  -> web_ask(conversationId, prompt)
```

This preserves one explicit identity model across new and discovered conversations.

## 11. Export format

Default export format should be deterministic Markdown/plain text generated in application/domain-facing code, not by Playwright.

Example:

```markdown
# Browser automation architecture

Conversation ID: abc123

## User

...

## Assistant

...
```

Rendering responsibility should be isolated from browser extraction and filesystem writing:

```text
ConversationTranscript
  -> transcript renderer
  -> string
  -> AnswerFilePort
```

If formatting options are added later, they should remain an export concern.

## 12. Errors

Suggested typed errors:

- `CONVERSATION_NOT_FOUND`
- `CONVERSATION_LIST_FAILED`
- `CONVERSATION_READ_FAILED`
- `CONVERSATION_INCOMPLETE`

Reuse existing errors when appropriate:

- `AUTH_REQUIRED`
- `PROFILE_BUSY`
- `NAVIGATION_FAILED`
- `TARGET_NOT_FOUND`
- `PROVIDER_CHANGED`
- output-file errors for export.

Do not expose selector text or raw private page content in public error messages.

## 13. Concurrency and session isolation

All conversation operations must use the existing browser session/profile lock boundary.

A single profile remains serialized.

Conversation listing, reading, exporting, and asking must not bypass `BrowserSessionPort` or introduce a second independent browser ownership model.

Shared-CDP mode follows the same ownership rule already used by the project: web-automation-mcp owns only the page/session resources it creates, and external DevTools clients are outside this MCP's local profile lock.

## 14. Security and privacy

Conversation bodies are sensitive data.

Rules:

1. Lifecycle logs may record operation name, duration, counts, success/failure, and safe pagination metadata.
2. Lifecycle logs must not record titles or message bodies by default.
3. Diagnostics must not dump full transcripts unless an explicit future diagnostics policy safely allows it.
4. `web_list_conversations` should return titles because they are required for discovery, but titles must not be copied into logs.
5. `web_get_conversation` returns content only because the caller explicitly requested that conversation.
6. `web_export_conversation_to_file` must reuse workspace output-root confinement.
7. Conversation cursors must not embed credentials or raw browser state.

## 15. Observability

Safe metrics:

```text
operation=list_conversations
returnedCount
hasNextCursor
durationMs

operation=get_conversation
messageCount
durationMs

operation=export_conversation
messageCount
bytesWritten
durationMs
```

Do not log:

```text
title
conversation body
message text
conversationId value if current policy treats IDs as sensitive
selectors
cookies/tokens
```

Existing safe request-context conventions should be reused.

## 16. Dependency rules

Allowed:

```text
mcp -> application -> domain/ports
application export -> ConversationReaderPort + AnswerFilePort
chatgpt conversation adapter -> BrowserPagePort / BrowserSessionPort
playwright -> browser ports
infrastructure -> AnswerFilePort
```

Forbidden:

```text
mcp -> ChatGPT selectors
mcp -> filesystem
application -> Playwright
application -> ChatGPT DOM
application -> virtual-scroll mechanics
chatgpt adapter -> MCP SDK
chatgpt adapter -> output-root policy
playwright adapter -> conversation semantics
file writer -> ChatGPT DOM
browser page state -> global active conversation
raw DOM mutation -> semantic pagination progress
```

## 17. Suggested source layout

Illustrative only:

```text
src/
  domain/
    conversation.ts
  ports/
    conversation-catalog-port.ts
    conversation-reader-port.ts
    answer-file-port.ts
  application/
    list-conversations.ts
    get-conversation.ts
    export-conversation.ts
  adapters/
    chatgpt/
      conversation-catalog.ts
      conversation-reader.ts
      conversation-targets.ts
  infrastructure/
    answer-file.ts
  mcp/
    tools/
      list-conversations-tool.ts
      get-conversation-tool.ts
      export-conversation-tool.ts
```

Prefer a small number of cohesive classes/modules. Do not create one abstraction per DOM operation.

## 18. Testing strategy

### 18.1 Domain/application tests

- list request validates limit/cursor;
- list use case returns summaries without message bodies;
- get use case requires explicit conversationId;
- export composes reader + renderer + `AnswerFilePort`;
- export MCP result omits transcript body;
- no active-conversation state exists.

### 18.2 ChatGPT adapter tests

Fixtures should cover:

- one visible conversation;
- many conversations;
- duplicate rows from virtualization;
- scroll adds new rows;
- unrelated DOM mutation without semantic progress;
- malformed/missing conversation links;
- changed title markup;
- ordered user/assistant messages;
- missing/unknown role;
- incomplete message history.

### 18.3 Browser adapter tests

Only generic mechanics:

- scrolling a target/container;
- DOM-change wait;
- text/attribute reads;
- cleanup/timeouts.

Do not put ChatGPT-specific fixtures into Playwright browser-port tests.

### 18.4 MCP tests

- schemas;
- bounded list limit;
- opaque cursor round trip;
- full transcript only from `web_get_conversation`;
- export result contains file metadata but no transcript;
- error translation;
- Inspector tool discovery.

### 18.5 Real authenticated validation

After deterministic tests pass:

1. list recent conversations;
2. pick a known conversation;
3. verify returned title/id;
4. read its full transcript;
5. continue it with `web_ask(conversationId, ...)`;
6. read again and verify the new turn exists;
7. export it to workspace output;
8. compare export message count with semantic transcript count;
9. repeat in shared-CDP mode if available.

Do not mark the feature complete based only on static fixtures/CI.

## 19. Implementation order

Recommended sequence:

### Stage 1 - Domain and ports

- add summary/page/message/transcript types;
- add catalog/reader ports;
- add typed errors.

### Stage 2 - ChatGPT catalog

- semantic conversation-history targets;
- ID/title extraction;
- bounded virtual-scroll discovery;
- cursor handling;
- unit fixtures.

### Stage 3 - List use case and MCP tool

- `ListConversationsUseCase`;
- `web_list_conversations`;
- MCP redaction/tool discovery tests.

### Stage 4 - Conversation reader

- explicit conversation navigation;
- semantic message extraction;
- completeness handling;
- `GetConversationUseCase`;
- `web_get_conversation`.

### Stage 5 - Export

- deterministic transcript renderer;
- `ExportConversationUseCase`;
- reuse `AnswerFilePort`;
- `web_export_conversation_to_file`.

### Stage 6 - Real validation

- list/read/continue/export on a real authenticated profile;
- shared-CDP verification when available;
- only then mark the feature complete.

## 20. Acceptance criteria

The design is implemented correctly when:

1. A caller can discover recent conversation handles without receiving their bodies.
2. A caller can read a selected conversation by explicit `conversationId`.
3. A caller can continue that conversation using the existing `web_ask` API.
4. A caller can export the transcript without injecting the whole transcript into the MCP result.
5. Conversation listing handles virtualized/lazy history with bounded semantic progress.
6. No application/MCP code contains ChatGPT selectors or scrolling logic.
7. Browser/Playwright code contains no ChatGPT conversation semantics.
8. Export uses existing workspace/output-root confinement.
9. No mutable application-level active conversation is introduced.
10. Real authenticated validation confirms list -> read -> continue -> read/export works end to end.
