# Feasibility Validation

## Executive conclusion

**Go for V0.1, with a narrow scope.**

The architecture is technically feasible. The key remaining uncertainty is not whether a persistent browser can automate the flow, but how stable ChatGPT-specific completion detection and response extraction remain across UI releases. That risk is controllable by isolating provider-specific semantics and by treating structural drift as a typed failure instead of rediscovering the whole page on every request.

## 1. Evidence already verified

### 1.1 Persistent browser identity is supported

Playwright exposes `browserType.launchPersistentContext(userDataDir)`. Its official documentation states that `userDataDir` stores session data such as cookies and local storage and can be reused between launches.

Implication: manual first login + profile reuse is a supported browser automation pattern; repeated username/password automation is unnecessary.

### 1.2 A dedicated profile is required

Playwright warns against automating the normal Chrome default user profile and recommends a separate automation directory.

Implication: `~/.web-automation-mcp/profiles/<profile-id>` should be the only supported model.

### 1.3 One profile cannot be opened by multiple browser instances

Playwright documents that browsers do not allow multiple instances using the same User Data Directory.

A local Chromium 144.0.7559.96 probe performed during this design validation confirmed the constraint: while one process owned a test profile, a second process using the same directory exited with code 21 and a `SingletonLock` / `ProcessSingleton` error.

Implication: exclusive `ProfileLock` is a V0.1 requirement, not a later optimization.

### 1.4 Semantic locators are a first-class Playwright capability

Playwright recommends locators such as `getByRole`, `getByLabel`, `getByPlaceholder` and `getByText`, with auto-waiting and retry behavior.

Implication: target resolution can be based on UI semantics and accessibility instead of brittle DOM ancestry.

### 1.5 MCP TypeScript SDK is suitable for the boundary

As of the 2026-07-28 MCP specification, the official TypeScript SDK v2 is the stable release line and provides server tool registration plus stdio/HTTP transports.

Implication: use MCP only as an outer adapter and keep browser/provider implementation independent of the SDK.

### 1.6 The current public ChatGPT page exposes semantic UI

A current public fetch of `chatgpt.com` shows semantic controls such as New chat, Log in and an input region. This does not prove authenticated DOM stability, but it supports the assumption that accessibility/semantic targeting is viable.

## 2. What was not validated end to end in this environment

A complete authenticated ChatGPT ask could not be executed here because this runtime does not have access to the user's ChatGPT login state. In addition, the environment's internal npm registry returned 404 for the Playwright package, so a Playwright runtime spike could not be installed here.

A direct local Chromium probe was still possible and was used to validate browser/profile exclusivity. The missing Playwright package is an environment-specific limitation, not evidence against feasibility.

## 3. Main feasibility risks

### R1 Provider DOM drift - Medium/High probability, Medium impact

Mitigation:

- semantic target registry
- multiple deterministic candidates
- provider adapter isolation
- typed `PROVIDER_CHANGED`
- diagnostics bundle
- later AI-assisted repair

### R2 Completion detection drift - Medium probability, High impact

This is the hardest V0.1 problem. A fixed delay is unacceptable.

Mitigation: combine new-message detection, text mutation/stability, busy/stop-control state and idle interaction state. Validate against long answers, code blocks, regenerated answers and interrupted generation.

### R3 Response extraction loses structure - Medium probability, Medium impact

V0.1 returns plain text. Markdown reconstruction is explicitly deferred until text extraction is stable.

### R4 Session expiration / challenge pages - Medium probability, Medium impact

Mitigation: distinguish `AUTH_REQUIRED`, `PROVIDER_UNAVAILABLE` and `UNKNOWN`; do not auto-enter passwords or MFA.

### R5 Profile corruption through concurrency - High impact

Mitigation: file/process lock plus one long-lived persistent context per profile or strict serialized acquisition.

### R6 Provider terms / anti-automation controls - External risk

The technical design should not attempt to bypass access controls, challenge systems or security protections. Operational use should remain within the target service's applicable terms and normal authenticated user permissions.

## 4. Go/no-go gates

### Gate A - Browser/profile

Pass when:

- manual login survives 3 browser process restarts;
- `session_status` recognizes the signed-in state;
- simultaneous same-profile startup is prevented cleanly.

### Gate B - Ask loop

Pass when 30 representative prompts achieve >= 95% successful completed-response extraction on one stable UI version, excluding provider/network outages.

Test set should include:

- short answer
- long answer
- Markdown list
- code block
- response > 60 seconds
- prompt containing multiline text
- follow-up in the same conversation
- new conversation

### Gate C - Failure classification

Pass when tests can deliberately trigger and distinguish:

- profile busy
- auth required
- network/navigation failure
- prompt target missing
- generation timeout
- response extraction failure

### Gate D - Selector drift

Pass when removal/breakage of the primary locator in a controlled fixture causes fallback locator success without changing application or MCP code.

### Gate E - Security

Pass when:

- repository contains no profile/auth data;
- MCP output cannot request or reveal cookies/tokens;
- diagnostics follow configured redaction rules.

## 5. Feasibility verdict by component

| Component | Verdict | Notes |
|---|---|---|
| MCP tool boundary | High confidence | Official SDK directly supports tool servers |
| Persistent login | High confidence | Native persistent context model |
| Exclusive profile ownership | High confidence | Officially documented and locally reproduced |
| Prompt submission | High confidence | Standard semantic browser interaction |
| Conversation continuation | High confidence | Provider adapter can retain/navigate conversation handle |
| Completion detection | Medium confidence | Needs real authenticated UI validation |
| Plain-text extraction | Medium/High confidence | Needs UI-specific selectors but simple output goal |
| Auto-repair | Feasible but defer | Do not make V0.1 depend on it |
| General-purpose recording/RPA | Out of V0.1 | Would dilute the core validation |

## 6. Primary external references

- Playwright BrowserType / persistent context: https://playwright.dev/docs/api/class-browsertype
- Playwright authentication: https://playwright.dev/docs/auth
- Playwright locators: https://playwright.dev/docs/locators
- MCP TypeScript SDK: https://github.com/modelcontextprotocol/typescript-sdk
- MCP 2026-07-28 tools specification: https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/specification/2026-07-28/server/tools.mdx
