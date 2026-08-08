# web-automation-mcp

A deterministic-first MCP server for driving authenticated web applications through a persistent browser profile.

## Phase 1 goal

The first supported scenario is intentionally narrow:

> An AI calls MCP -> web-automation-mcp uses an already authenticated ChatGPT browser profile -> sends a prompt -> waits for generation to finish -> extracts the complete response -> returns it to the caller.

The browser is an implementation detail. MCP clients work with semantic operations such as `ask`, not selectors or mouse coordinates.

## Design principles

1. **Explore once, execute many, repair when necessary.**
2. **Semantic workflow over recorded mouse/DOM macros.**
3. **Deterministic execution first; AI recovery only on structural change.**
4. **MCP is an adapter, not the business core.**
5. **Provider logic, browser logic, authentication state, completion detection and extraction are separate concerns.**
6. **Credentials are never exposed through MCP.**
7. **A browser profile is treated as a secret-bearing local asset.**

## V0.1 scope

- Node.js + TypeScript
- MCP TypeScript SDK v2
- Playwright + Chromium
- One provider: ChatGPT Web
- One persistent browser profile at a time
- Manual first login in a headed browser
- Reuse login state through a dedicated persistent `userDataDir`
- Deterministic semantic locators with fallbacks
- Send a prompt
- Wait for a complete response
- Return text plus execution metadata
- Detect authentication loss and provider-UI mismatch
- Diagnostic artifacts on failure

## Explicit non-goals for V0.1

- General-purpose RPA
- Coordinate/mouse recording
- Arbitrary website automation
- Claude/Gemini support
- Autonomous AI browsing on every request
- Automatic username/password or MFA entry
- Parallel use of one browser profile
- Self-modifying selectors without validation

## Proposed MCP surface

- `web_session_status(profile_id)`
- `web_new_chat(profile_id)`
- `web_ask(profile_id, prompt, conversation_id?)`
- `web_get_last_response(profile_id, conversation_id)`

## Local authentication and persistence checks

Initial login is a local maintenance operation rather than an MCP runtime action. Credentials stay inside the dedicated browser profile.

```bash
npm run login -- default
```

Check the current profile in a fresh browser lifecycle:

```bash
npm run session:status -- default
```

Verify restart persistence by launching, checking, closing, and then independently launching the same profile again. The command passes only when both checks report `AUTHENTICATED`:

```bash
npm run verify:persistence -- default
```

The profile is stored under `~/.web-automation-mcp` by default and is protected by an exclusive profile lock. Do not commit or export the profile directory.

## Documents

- `docs/REQUIREMENTS.md` - product and reliability requirements
- `docs/ARCHITECTURE.md` - boundaries and dependency rules
- `docs/FEASIBILITY.md` - feasibility evidence, risks and go/no-go criteria
- `docs/POC_PLAN.md` - executable proof-of-concept plan
- `TODO.md` - implementation order
