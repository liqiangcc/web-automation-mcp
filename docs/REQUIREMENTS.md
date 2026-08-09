# Requirements

## 1. Problem statement

An AI agent sometimes needs to interact with an AI service through its web UI instead of an API. The initial target is ChatGPT Web. Repeating low-level browser discovery on every call is slow, expensive and fragile. The system therefore needs a stable semantic interface backed by deterministic browser automation and targeted recovery when the page changes.

## 2. Core user story

Given an existing authenticated browser profile, an MCP client can ask ChatGPT a question and receive the complete generated response without knowing anything about the web page structure.

## 3. Functional requirements

### FR-1 Persistent profile

- Use a dedicated automation profile directory.
- The user signs in manually on first use.
- The same profile is reused across process restarts.
- Never automate against the user's normal Chrome default profile.
- Never expose cookies, tokens or storage state through MCP.

### FR-2 Session probe

Return one of:

- `AUTHENTICATED`
- `AUTH_REQUIRED`
- `PROVIDER_UNAVAILABLE`
- `UNKNOWN`

Network failures must not be misclassified as authentication failures.

### FR-3 New conversation

Create or open a new ChatGPT conversation and return an opaque local `conversation_id`.

### FR-4 Ask

Input:

- `profile_id`
- `prompt`
- optional `conversation_id`
- optional timeout

Output:

- `conversation_id`
- `status`: `completed | timeout | auth_required | provider_changed | failed`
- `response_text`
- optional `partial_response_text`
- timing metadata
- diagnostics reference when failed

### FR-5 Completion detection

The implementation must not depend on a fixed sleep. Completion should be inferred from multiple provider-specific signals, for example:

1. a new assistant response appeared after submission;
2. streaming activity began or content changed;
3. response content remains stable for a configured interval;
4. known generation-in-progress controls are no longer present;
5. input/send interaction has returned to an idle state.

No single UI selector should be the sole completion signal.

### FR-6 Response extraction

V0.1 must reliably return plain text. Structured Markdown reconstruction is a later capability. Extraction must target the assistant response associated with the submitted prompt, not simply "the last div on the page".

### FR-7 Deterministic locator resolution

Provider targets are semantic names such as:

- `prompt_input`
- `send_action`
- `assistant_message`
- `new_chat_action`

Each target has an ordered locator strategy. Prefer accessibility/semantic locators over CSS structure.

### FR-8 Failure diagnostics

When a provider action fails, collect enough information for repair without collecting secrets unnecessarily:

- current URL pattern
- target semantic name
- attempted locator strategies
- visible accessibility/DOM summary around relevant regions
- screenshot when enabled
- timing and error category

### FR-9 Profile locking

A profile must be owned by at most one browser process. V0.1 serializes requests per profile.

### FR-10 Save response to file

The MCP server may save a completed provider response directly to a UTF-8 file without returning the
full response to the MCP client. File output must:

- stay beneath a configured output root;
- reject absolute paths, traversal and symlink escape;
- refuse existing files unless overwrite is explicitly enabled;
- publish through an atomic same-directory operation;
- return only the conversation id, canonical path, byte count and SHA-256 digest.

## 4. Non-functional requirements

### Reliability

For a stable provider UI, target >= 95% successful end-to-end asks in a 30-run local validation set, excluding provider outages.

### Observability

Every execution gets a request id and structured lifecycle events:

`acquire_profile -> probe_session -> open_conversation -> resolve_prompt_input -> submit -> wait_generation -> extract -> release`

### Security

- Profile directories are outside the repository by default.
- `.gitignore` excludes all auth/profile state.
- MCP tools never return cookies, authorization headers or tokens.
- File-output tools never include the complete provider response in MCP results or diagnostics.
- Logs redact prompt/response content when configured.
- Diagnostic screenshots are opt-in and stored locally.

### Testability

Business logic must be testable with fake `BrowserPort` and fake `ProviderPort`; unit tests must not require ChatGPT or a real browser.

## 5. Deferred requirements

- Provider auto-discovery
- Workflow recording
- AI-assisted repair
- Multi-provider abstraction beyond proven commonality
- Multi-profile concurrency
- Browser pool
- Remote browser service
