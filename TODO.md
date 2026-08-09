# TODO

## Phase 0 - Repository bootstrap

- [x] Initialize Node.js/TypeScript project
- [x] Pin Node.js >= 20 (support maintained Node 22+, CI on Node 24 LTS)
- [x] Add MCP TypeScript SDK v2
- [x] Add Playwright
- [x] Add Vitest
- [x] Add ESLint/Prettier or equivalent formatting/linting
- [x] Add `.gitignore` for profiles/auth/diagnostics
- [x] Add CI: typecheck, lint, unit tests

## Phase 1 - Stable core boundaries

- [x] Define domain types and typed errors
- [x] Define `ProviderPort`
- [x] Define `BrowserPort`
- [x] Define `ProfileStore`
- [x] Implement `AskUseCase` against fakes
- [x] Add architecture dependency tests or lint boundaries

## Phase 2 - Profile/session

- [x] Implement profile path resolver
- [x] Implement exclusive profile lock
- [x] Implement Playwright persistent context adapter
- [x] Implement headed login CLI
- [x] Implement ChatGPT session probe
- [x] Implement fresh-lifecycle session status command
- [x] Implement two-restart persistence verifier
- [ ] Run restart persistence verification on a real authenticated local profile (`npm run verify:persistence -- default`)

## Phase 3 - ChatGPT vertical slice

- [x] Semantic target registry
- [x] Prompt input resolver
- [x] Prompt submit
- [x] Assistant response baseline tracking
- [x] Completion detector
- [x] Plain-text response extractor
- [x] Conversation handle persistence
- [x] Implement `ChatGptProvider` against `ProviderPort`
- [x] Add generic locked browser session runtime

## Phase 4 - MCP

- [x] `web_session_status`
- [x] `web_new_chat`
- [x] `web_ask`
- [x] `web_get_last_response`
- [x] MCP Inspector CLI `tools/list` smoke test

## Phase 5 - Reliability

- [x] Structured request lifecycle logs
- [x] Diagnostics bundle
- [x] Implement executable 30-run live validation matrix and structured report
- [ ] Execute the 30-run matrix on a real authenticated profile and reach >=95% complete-response success
- [x] Failure classification tests
- [x] Locator fallback test fixture
- [x] Security/redaction tests

### Event-driven response completion

- [x] Document event-driven completion architecture and SoC boundaries
- [x] Define DOM-change wakeup as browser mechanics, not provider semantics
- [x] Define semantic activity independently from raw DOM mutation activity
- [x] Define fast/fallback settle paths and start/idle/absolute timeout meanings
- [x] Add generic browser DOM-change wait capability
- [x] Implement Playwright `MutationObserver` change source with bounded debounce and cleanup
- [x] Add ChatGPT completion snapshot source for response/generation/composer state
- [x] Add composer-ready semantic probe without leaking selectors outside `adapters/chatgpt`
- [x] Refactor `CompletionDetector` from fixed polling to event-driven state machine
- [x] Track semantic progress instead of using the old two-minute total timeout as the normal limit
- [x] Add precise `RESPONSE_START_TIMEOUT` and `GENERATION_STALLED` classifications
- [x] Keep a large absolute safety timeout
- [x] Add low-frequency watchdog only as missed-event/page-lifecycle resilience fallback
- [x] Add unit tests proving unrelated DOM wakeups do not reset semantic idle time
- [x] Add unit tests for fast completion, fallback completion, settle cancellation, stall and absolute timeout
- [x] Add completion-path/latency metadata to lifecycle observability without logging response content
- [x] Extend live validation report with completion latency/path metrics
- [ ] Verify long responses can exceed two minutes while continuing to make semantic progress on a real ChatGPT session
- [ ] Verify strong-signal response completion normally returns within about one second of observed generation end on a real ChatGPT session

## Phase 5.5 - Local file input and web upload

- [x] Document input-root, attachment and security design
- [x] Add restricted local input file resolver
- [x] Add generic browser file-input capability
- [x] Add ChatGPT attachment uploader and provider port
- [x] Add `web_ask_with_files`
- [x] Add path confinement, upload and MCP redaction unit tests
- [x] Add `web_ask_with_files` to MCP Inspector smoke test

### Workspace-relative path model

- [x] Define Codex startup cwd as the default MCP workspace concept
- [x] Define root precedence: `WORKSPACE`, then optional input/output overrides
- [x] Keep MCP file arguments relative and forbid request-controlled workspace roots
- [x] Add stable workspace-root resolver at runtime startup
- [x] Default input root to workspace root
- [x] Default output root to `<workspaceRoot>/mcp-output`
- [x] Preserve `WEB_AUTOMATION_MCP_INPUT_ROOT` and `WEB_AUTOMATION_MCP_OUTPUT_ROOT` as advanced overrides
- [x] Add workspace/root precedence and compatibility tests
- [x] Update local Codex registration/testing examples for zero-config workspace-relative paths
- [x] Add browser-free workspace fingerprint verification mode

## Phase 5.6 - Conversation discovery, reading and export

- [x] Document conversation discovery/read/continuation/export architecture and SoC boundaries (`docs/CONVERSATIONS.md`)
- [x] Keep continuation based on explicit `conversationId`; reject active-conversation/global-browser-state design
- [x] Separate lightweight conversation listing from full transcript reading
- [x] Define virtualized/lazy conversation history as ChatGPT adapter semantics over generic browser scroll/DOM-change mechanics
- [x] Define raw DOM mutation as wake-up only, not semantic pagination progress
- [x] Define export as `ConversationReaderPort` + transcript renderer + existing `AnswerFilePort`
- [ ] Add provider-neutral conversation summary/page/message/transcript domain types
- [ ] Add conversation catalog/reader ports without leaking ChatGPT DOM semantics
- [x] Implement ChatGPT conversation catalog with bounded virtual-scroll discovery and opaque cursor
- [x] Add `ListConversationsUseCase`
- [x] Add `web_list_conversations`
- [ ] Implement ChatGPT conversation reader with explicit `conversationId` and completeness handling
- [ ] Add `GetConversationUseCase`
- [ ] Add `web_get_conversation`
- [ ] Add deterministic transcript renderer
- [ ] Add `ExportConversationUseCase` using `AnswerFilePort`
- [ ] Add `web_export_conversation_to_file`
- [ ] Add architecture/redaction/pagination/virtualization unit tests
- [ ] Add the three tools to MCP Inspector smoke coverage
- [ ] Validate list -> read -> continue -> read/export on a real authenticated profile
- [ ] Validate conversation operations through shared-CDP mode when available

## Phase 5.7 - Conversation cleanup

- [x] Document destructive cleanup architecture and safety boundaries (`docs/CONVERSATION_CLEANUP.md`)
- [x] Separate cleanup/mutation from conversation discovery and reading
- [x] Require explicit `conversationId` targets; forbid deletion based on implicit active browser state
- [x] Define single-ID deletion before bounded batch deletion
- [x] Define batch deletion as sequential application-level composition over one semantic mutation port
- [x] Defer delete-all/date/title/rule-based cleanup until a separate preview/selection model exists
- [x] Require positive target identity and delete-success verification
- [ ] Add `ConversationMutationPort` and typed deletion errors
- [ ] Implement exact ChatGPT single-conversation deletion with positive target verification
- [ ] Add `DeleteConversationUseCase`
- [ ] Add destructive `web_delete_conversation` MCP tool
- [ ] Add duplicate-title/reordered-row/virtualized-list safety fixtures
- [ ] Validate exact deletion using disposable real conversations and prove unrelated conversations survive
- [ ] Add bounded `web_delete_conversations` only after single deletion proves stable
- [ ] Add per-ID batch results and global-failure stop policy
- [ ] Add batch deletion to MCP Inspector smoke coverage
- [ ] Validate bounded batch deletion using disposable real conversations

### Real validation

- [ ] Validate text/PDF or image/multiple-file upload with a real authenticated local profile
- [ ] Validate attachment flow through shared-CDP Chrome mode
- [ ] Validate starting Codex from two different repositories gives the expected workspace-relative behavior after MCP restart

## Phase 6 - Only after V0.1 proves stable

- [ ] Page fingerprint/change detector
- [ ] AI-assisted locator recovery
- [ ] Candidate validation + promotion policy
- [ ] Provider behavior versioning
- [ ] Additional providers
- [ ] `web_search_conversations` / provider-wide conversation search after list/read proves stable
- [ ] Rule-based conversation cleanup with explicit preview/selection and separate destructive execution
- [ ] Semantic workflow DSL
- [ ] Workflow recording/exploration
