# Real Validation Results — 2026-08-09

## Scope

- Branch: `bootstrap/phase-0`
- Tested commit: `3bb9e27`
- Browser mode: host Chrome through shared CDP (`127.0.0.1:9223`)
- Profile: `default`
- No source-code fixes were made during this validation.

Raw JSON reports remain local under `mcp-output/validation/` and are not committed. This document intentionally contains no conversation IDs, response bodies, secrets, or local absolute paths.

## Results

| Area | Result | Notes |
|---|---|---|
| Typecheck | PASS | Completed successfully |
| Lint | PASS | Completed successfully |
| Build | PASS | Completed successfully |
| MCP smoke | PASS | All registered tools discovered |
| Session status | PASS | Host Chrome reported `AUTHENTICATED` |
| Persistence | PASS | Both independent lifecycles remained authenticated |
| Unit tests | FAIL | 146/147 passed; one boundary test referenced a missing MCP handler file |
| Conversation acceptance | FAIL | Seed response was created, but conversation listing returned zero items |
| Cleanup acceptance | FAIL | Disposable targets were not discovered during preflight |

## Recorded issues

1. `tests/reliability/conversation-boundaries.test.ts` references the nonexistent `src/mcp/conversation-mutation-tool-handler.ts`.
2. `validate:conversations` returned `seed_not_discovered`; reading, continuation, and export were not exercised.
3. `validate:cleanup` returned `preflight_identity_missing`; deletion safety assertions were not exercised.
4. Targeted cleanup afterward returned `CONVERSATION_DELETE_FAILED` for one disposable target and `CONVERSATION_NOT_FOUND` for the other attempted targets. Complete cleanup could not be proven.
5. Earlier Completion/live validation was affected by missing terminal markers, `NAVIGATION_FAILED`, and ChatGPT frequency limiting. Those suites were not counted as PASS.

## Acceptance status

The release acceptance is **NOT PASS**. Conversation discovery and cleanup require investigation before repeating destructive or high-volume real-browser validation.
