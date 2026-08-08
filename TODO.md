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
- [ ] Test restart persistence on a real authenticated local profile

## Phase 3 - ChatGPT vertical slice

- [ ] Semantic target registry
- [ ] Prompt input resolver
- [ ] Prompt submit
- [ ] Assistant response baseline tracking
- [ ] Completion detector
- [ ] Plain-text response extractor
- [ ] Conversation handle persistence

## Phase 4 - MCP

- [ ] `web_session_status`
- [ ] `web_new_chat`
- [ ] `web_ask`
- [ ] `web_get_last_response`
- [ ] MCP Inspector smoke test

## Phase 5 - Reliability

- [ ] Structured request lifecycle logs
- [ ] Diagnostics bundle
- [ ] 30-run validation matrix
- [ ] Failure classification tests
- [ ] Locator fallback test fixture
- [ ] Security/redaction tests

## Phase 6 - Only after V0.1 proves stable

- [ ] Page fingerprint/change detector
- [ ] AI-assisted locator recovery
- [ ] Candidate validation + promotion policy
- [ ] Provider behavior versioning
- [ ] Additional providers
- [ ] Semantic workflow DSL
- [ ] Workflow recording/exploration
