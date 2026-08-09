# Conversation Cleanup and Destructive Operations

## 1. Purpose

This document defines safe conversation-cleanup behavior for ChatGPT Web.

Cleanup is deliberately separated from conversation discovery/read/export because it is destructive. The design must preserve explicit intent, narrow scope and auditable execution.

The core rule is:

> Discovery finds conversation handles. Cleanup mutates only explicitly selected handles.

Do not infer a destructive target from whichever conversation happens to be open in the browser.

## 2. Why cleanup belongs in the product

Browser-driven AI workflows can create many temporary conversations. Without cleanup, test/validation runs and repeated automation can pollute the provider's history and make later discovery harder.

Therefore cleanup is useful, but it must not weaken the repository's existing safety and separation-of-concerns boundaries.

## 3. Scope

### 3.1 First supported destructive capability

Add a single-conversation operation first:

```text
web_delete_conversation
```

It accepts one explicit `conversationId` and deletes only that conversation.

### 3.2 Small explicit batch deletion

After single deletion proves stable, add:

```text
web_delete_conversations
```

It accepts an explicit bounded array of conversation IDs.

Recommended first limit: 20 IDs per request.

Batch deletion is a convenience wrapper over the same semantic delete capability. It must not introduce separate browser logic.

### 3.3 Deferred high-risk cleanup

Do not initially support:

- delete all conversations;
- delete all test conversations automatically;
- delete older than a date;
- delete by title substring;
- delete by search result;
- delete every conversation not in a keep-list;
- background scheduled cleanup;
- account-wide bulk cleanup with unbounded target discovery.

These policies combine selection and destruction and are much harder to validate safely, especially when conversation history is virtualized or only partially loaded.

If rule-based cleanup is added later, selection must first produce a concrete preview set of conversation IDs before a separate destructive call executes them.

## 4. Separation of concerns

```text
MCP
  |
  v
DeleteConversationUseCase
  |
  v
ConversationMutationPort
  |
  v
ChatGPT Conversation Mutation Adapter
  |
  v
BrowserPagePort / BrowserSessionPort
  |
  v
Playwright generic mechanics
```

### MCP

Owns:

- destructive tool schema;
- required explicit `conversationId` / ID list;
- destructive/idempotency annotations where supported by the MCP SDK;
- public result/error translation.

Must not:

- find delete buttons;
- perform sidebar scrolling;
- infer the currently open conversation;
- select conversations by title;
- delete files or edit provider DOM directly.

### Application

Owns:

- validating that requested IDs are explicit and bounded;
- orchestrating one or more mutation-port calls;
- deciding batch stop/continue policy;
- returning per-ID results;
- observability-safe counts.

Must not:

- know selectors;
- know confirmation-dialog DOM;
- know whether the provider uses a sidebar or context menu;
- use Playwright directly.

### Conversation mutation port

Suggested provider-neutral contract:

```ts
interface ConversationMutationPort {
  delete(input: {
    readonly profileId: ProfileId;
    readonly conversationId: ConversationId;
  }): Promise<DeleteConversationResult>;
}
```

The port expresses semantic mutation, not UI mechanics.

### ChatGPT adapter

Owns:

- locating the explicit conversation handle;
- opening the provider delete action for that specific ID;
- handling provider confirmation UI;
- verifying the target disappeared or another positive delete-success condition;
- detecting provider drift.

It must not own batch-selection policy or application-level cleanup rules.

### Browser / Playwright

Owns only generic mechanics:

- click;
- locator/text/attribute reads;
- scroll;
- wait for DOM change;
- visibility/existence;
- navigation/page lifecycle.

It must not know what deletion, a conversation, or a confirmation dialog means.

## 5. Tool design

### 5.1 `web_delete_conversation`

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
  "deleted": true
}
```

The caller must supply the target ID explicitly.

The implementation must not default to the active/open conversation.

### 5.2 `web_delete_conversations`

Request:

```json
{
  "provider": "chatgpt",
  "profileId": "default",
  "conversationIds": ["abc123", "def456"]
}
```

Response:

```json
{
  "ok": true,
  "provider": "chatgpt",
  "profileId": "default",
  "requested": 2,
  "deleted": 2,
  "failed": 0,
  "results": [
    { "conversationId": "abc123", "deleted": true },
    { "conversationId": "def456", "deleted": true }
  ]
}
```

Batch size must be bounded.

Do not accept arbitrary selectors, titles or provider URLs as deletion targets.

## 6. Idempotency semantics

Deletion is destructive but should be operationally repeat-safe where possible.

Recommended semantic result states:

```text
DELETED
NOT_FOUND
FAILED
```

A repeated delete of an already absent conversation should return a typed `NOT_FOUND`/already-absent result rather than deleting some different conversation.

Never compensate for a missing requested ID by deleting the currently selected row.

## 7. Positive target verification

The most important safety invariant is:

> The adapter must prove that the delete UI it is about to activate belongs to the requested `conversationId`.

A safe conceptual flow is:

```text
conversationId
  -> locate matching conversation handle/link
  -> verify handle identity
  -> open that handle's action menu
  -> resolve delete action within that item/menu context
  -> confirm provider dialog
  -> verify requested handle is gone / provider reports success
```

Avoid flows such as:

```text
click first visible menu
click first visible Delete
```

because virtualized history and reordered rows can delete the wrong conversation.

## 8. Pagination and deletion

Discovery and deletion remain separate.

Correct:

```text
web_list_conversations
  -> caller chooses IDs
  -> web_delete_conversations(explicit IDs)
```

Incorrect:

```text
web_delete_old_conversations()
  -> adapter scrolls history and decides targets while deleting
```

The second design mixes discovery policy with destructive execution and makes partial failure difficult to reason about.

## 9. Test-created conversations

Validation tooling may create many disposable conversations. A later convenience feature may tag locally created validation conversations in local validation metadata, but cleanup should still resolve them to explicit conversation IDs before deletion.

Recommended future flow:

```text
validation report
  -> createdConversationIds[]
  -> preview
  -> explicit cleanup call
```

Do not make `validate:live` silently delete provider history by default. Cleanup after validation should be opt-in and separately reported.

## 10. Error model

Suggested errors:

- `CONVERSATION_NOT_FOUND`
- `CONVERSATION_DELETE_FAILED`
- `CONVERSATION_DELETE_NOT_CONFIRMED`
- `CONVERSATION_BATCH_TOO_LARGE`

Reuse existing:

- `AUTH_REQUIRED`
- `PROFILE_BUSY`
- `NAVIGATION_FAILED`
- `TARGET_NOT_FOUND`
- `PROVIDER_CHANGED`

Public errors must not expose selector internals or unrelated conversation titles/content.

## 11. Observability and privacy

Safe fields:

```text
operation=delete_conversation
requestedCount
deletedCount
failedCount
durationMs
errorCode
```

Do not log:

- conversation title;
- message body;
- prompt/response text;
- cookies/tokens;
- raw provider DOM;
- destructive menu selectors.

Whether raw `conversationId` is logged should follow the project's existing identifier-sensitivity policy; counts are always preferable for aggregate logs.

## 12. Batch failure policy

For a bounded explicit batch, prefer per-ID results rather than pretending the whole operation is atomic.

Recommended behavior:

```text
for each explicit ID
  -> attempt semantic delete
  -> record DELETED / NOT_FOUND / FAILED
  -> continue unless authentication/session/provider state becomes globally invalid
```

Stop the entire batch immediately for global failures such as:

- `AUTH_REQUIRED`;
- `PROFILE_BUSY` before execution begins;
- provider structural drift that makes subsequent deletions unsafe.

Do not retry an ambiguous destructive action automatically if the adapter cannot determine whether the provider already committed the deletion.

## 13. Concurrency

Deletion uses the same existing profile/session serialization boundary as ask/list/read/export.

Do not create a second browser ownership model for cleanup.

Within one profile, batch deletion should execute sequentially by default. Parallel destructive browser actions add little value and substantially increase target-confusion risk.

## 14. Relationship to archive/non-destructive cleanup

If the provider exposes a reliable non-destructive archive capability in the future, model it as a separate semantic mutation such as `archive`, not as a hidden mode of delete.

Delete and archive have different user intent and recovery properties and should not share one ambiguous boolean flag.

## 15. Testing strategy

### Application tests

- requires explicit ID;
- rejects empty/bad batch;
- enforces maximum batch size;
- preserves per-ID result mapping;
- stops on global unsafe failure;
- does not derive targets from titles/current page.

### ChatGPT adapter fixtures

- delete exact requested row;
- duplicate/similar titles with different IDs;
- reordered rows;
- virtualized history;
- missing requested ID;
- confirmation dialog changed;
- unrelated DOM mutations;
- post-delete positive verification;
- ambiguous confirmation result.

### MCP tests

- tool marked destructive where annotations support it;
- input only accepts explicit IDs;
- errors are redacted;
- batch size bounded;
- Inspector tool discovery.

### Real authenticated validation

Use dedicated disposable test conversations:

1. create several known test conversations;
2. record their real IDs;
3. list and verify them;
4. delete exactly one ID;
5. verify the other IDs remain;
6. delete a small explicit batch;
7. verify deleted IDs disappear and unrelated conversations remain;
8. repeat in shared-CDP mode when available.

Do not validate deletion against valuable existing user conversations.

## 16. Implementation order

1. Finish conversation discovery/read first so explicit target selection is reliable.
2. Add `ConversationMutationPort` and typed errors.
3. Implement exact single-ID ChatGPT deletion with positive target/success verification.
4. Add `DeleteConversationUseCase` and `web_delete_conversation`.
5. Add deterministic tests and real disposable-conversation validation.
6. Only then add bounded `web_delete_conversations` as application-level sequential composition.
7. Defer rule-based cleanup until a safe preview/selection model is designed.

## 17. Acceptance criteria

Cleanup is complete only when:

1. every deletion target is an explicit `conversationId`;
2. the adapter verifies the target identity before destructive interaction;
3. deletion success has a positive verification condition;
4. a missing ID cannot cause another conversation to be deleted;
5. batch deletion is bounded and sequential;
6. MCP/application contain no ChatGPT delete selectors;
7. Playwright contains no conversation/delete semantics;
8. no implicit active-conversation state is introduced;
9. logs contain no conversation content;
10. real tests prove unrelated conversations survive targeted cleanup.
