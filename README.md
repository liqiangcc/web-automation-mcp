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
8. **Local paths are workspace-relative at the MCP boundary.**
9. **Response completion should be event-driven by browser change notifications, while completion meaning remains provider-semantic.**
10. **Conversation identity is explicit; browser active-tab state is never an application contract.**

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
- Upload restricted local files with a prompt
- Wait for a complete response
- Return text plus execution metadata
- Discover recent conversations with bounded opaque-cursor pagination
- Read one explicit conversation as an ordered semantic transcript
- Export a complete conversation to a restricted workspace file without returning the full transcript
- Save a completed response directly to a restricted local file without returning the full text
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
- Arbitrary absolute-path host filesystem access
- Per-request workspace switching
- Reverse engineering ChatGPT private streaming/network protocols
- Process-global or tab-global active conversation state

## Current MCP surface

- `web_session_status(profileId)`
- `web_list_conversations(profileId, limit?, cursor?)`
- `web_get_conversation(profileId, conversationId)`
- `web_export_conversation_to_file(profileId, conversationId, outputPath, overwrite?)`
- `web_new_chat(profileId)`
- `web_ask(profileId, prompt, conversationId?)`
- `web_ask_with_files(profileId, prompt, files[], conversationId?)`
- `web_ask_to_file(profileId, prompt, outputPath, conversationId?, overwrite?)`
- `web_get_last_response(profileId, conversationId)`

`web_list_conversations` returns lightweight conversation IDs/titles only. `web_get_conversation` returns ordered semantic message bodies for one explicit ID and refuses to silently truncate transcripts that exceed its deterministic response-size guard. `web_export_conversation_to_file` reuses the same complete conversation reader but bypasses the MCP transcript-size guard, renders deterministic Markdown, writes through the restricted output-file boundary, and returns file metadata only.

## Workspace-relative paths

For normal local Codex use, relative file paths should mean the same thing to Codex and to this MCP.

Start Codex from the repository being worked on:

```bash
cd /home/user/project
codex
```

The MCP runtime treats its startup working directory as the default workspace root. Therefore:

```text
docs/design.pdf
src/service/UserService.java
```

are resolved relative to that workspace, not to an unrelated global directory.

Default root model:

```text
workspaceRoot = WEB_AUTOMATION_MCP_WORKSPACE ?? startup cwd
inputRoot = WEB_AUTOMATION_MCP_INPUT_ROOT ?? workspaceRoot
outputRoot = WEB_AUTOMATION_MCP_OUTPUT_ROOT ?? workspaceRoot/mcp-output
```

`WEB_AUTOMATION_MCP_INPUT_ROOT` and `WEB_AUTOMATION_MCP_OUTPUT_ROOT` remain advanced overrides. MCP tool arguments themselves remain relative paths; callers cannot provide a new workspace root per request.

The workspace root is stable for the MCP process lifetime. If the agent changes shell directories later, the MCP root does not silently follow that `cd`; restart from the intended repository or configure `WEB_AUTOMATION_MCP_WORKSPACE` explicitly.

`web_ask_with_files` accepts relative paths beneath the effective input root and never returns canonical input paths.

`web_ask_to_file` and `web_export_conversation_to_file` accept relative `outputPath` values. By default they write beneath `<workspace>/mcp-output`, refuse existing files unless overwrite is explicitly enabled, and return file metadata rather than the full response/transcript text.

## Response completion direction

The reliability target is event-driven completion rather than a fixed high-frequency polling loop:

```text
Browser: page changed
    -> ChatGPT adapter: read semantic response/generation/composer state
    -> CompletionDetector: apply completion and timeout policy
```

Raw DOM mutations only wake the detector; they do not count as generation progress by themselves. Provider selectors remain inside the ChatGPT adapter, while `MutationObserver`/event transport remains a browser-adapter concern.

See `docs/RESPONSE_COMPLETION.md` for the design and implementation acceptance criteria.

## Conversation discovery and reading

Conversation operations preserve explicit identity:

```text
web_list_conversations
  -> conversationId
  -> web_get_conversation(conversationId)
  -> web_ask(conversationId, prompt)
  -> web_get_conversation(conversationId)
  -> optional web_export_conversation_to_file(conversationId, outputPath)
```

The ChatGPT adapter owns sidebar/message semantics. Playwright exposes only generic DOM snapshot, scroll and DOM-change mechanics. Application/MCP never depend on ChatGPT selectors or mutable active-tab state. Export rendering and filesystem persistence remain outside the ChatGPT adapter.

Run the executable real-session acceptance flow from an authenticated local profile:

```bash
npm run validate:conversations -- --profile default
```

The acceptance flow creates one disposable test conversation, discovers it through pagination, reads the full semantic transcript, continues the same explicit conversation ID, reads it again to prove the transcript extended, and finally verifies the last response. A fixture/CI pass is not a substitute for this authenticated browser run.

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
- `docs/RESPONSE_COMPLETION.md` - event-driven response-completion design, state machine and timeout semantics
- `docs/CONVERSATIONS.md` - conversation discovery, reading, continuation and export boundaries
- `docs/CONVERSATION_CLEANUP.md` - destructive conversation cleanup safety design
- `docs/WORKSPACE_PATHS.md` - Codex workspace-relative path contract and root precedence
- `docs/FILE_INPUT_AND_UPLOAD.md` - restricted local input and provider attachment design
- `docs/FEASIBILITY.md` - feasibility evidence, risks and go/no-go criteria
- `docs/POC_PLAN.md` - executable proof-of-concept plan
- `docs/LOCAL_TESTING.md` - WSL/Linux environment setup and real local Codex MCP validation
- `TODO.md` - implementation order
