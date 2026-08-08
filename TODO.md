# TODO

## Phase 0 - Repository bootstrap

- [ ] Initialize Node.js/TypeScript project
- [ ] Pin Node.js >= 20 (prefer current LTS/runtime used by deployment)
- [ ] Add MCP TypeScript SDK v2
- [ ] Add Playwright
- [ ] Add Vitest
- [ ] Add ESLint/Prettier or equivalent formatting/linting
- [ ] Add `.gitignore` for profiles/auth/diagnostics
- [ ] Add CI: typecheck, lint, unit tests

## Phase 1 - Stable core boundaries

- [ ] Define domain types and typed errors
- [ ] Define `ProviderPort`
- [ ] Define `BrowserPort`
- [ ] Define `ProfileStore`
- [ ] Implement `AskUseCase` against fakes
- [ ] Add architecture dependency tests or lint boundaries

## Phase 2 - Profile/session

- [ ] Implement profile path resolver
- [ ] Implement exclusive profile lock
- [ ] Implement Playwright persistent context adapter
- [ ] Implement headed login CLI
- [ ] Implement ChatGPT session probe
- [ ] Test restart persistence

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
