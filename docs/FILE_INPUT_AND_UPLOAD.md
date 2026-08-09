# Local File Input and Web Upload

## 1. Decision

V0.1 exposes one atomic MCP operation for local-file input:

```text
web_ask_with_files(profileId, prompt, files[], conversationId?)
```

The operation validates workspace-relative local files, uploads them to the provider UI, submits the prompt, waits for completion, and returns the normal answer result.

V0.1 does **not** expose a standalone `web_upload_file` operation. Uploading a file without submitting the associated prompt would create hidden browser state that must survive across MCP calls and would couple later requests to a particular tab/composer state.

A text-only `web_ask_from_file` operation is deferred. Native provider attachment upload covers more file types and is the higher-value first capability.

Workspace semantics are defined in `docs/WORKSPACE_PATHS.md`.

## 2. Core use case

```text
Codex workspace
    |
    v
workspace-relative file paths
    |
    v
Restricted Input Resolver
    |
    v
AskWithFilesUseCase
    |
    v
ProviderAttachmentPort
    |
    v
ChatGPT Attachment Adapter
    |
    v
BrowserPort
    |
    v
ChatGPT Web
    |
    v
Complete Response
```

Combined with `web_ask_to_file`, this creates the local-to-web-to-local flow:

```text
workspace input files
      |
      v
web_ask_with_files
      |
      v
ChatGPT Web
      |
      v
response
      |
      v
web_ask_to_file / normal MCP result
      |
      v
workspace/mcp-output
```

## 3. MCP contract

### `web_ask_with_files`

Input:

```json
{
  "provider": "chatgpt",
  "profileId": "default",
  "prompt": "Analyze the attached files and summarize the risks.",
  "files": [
    "reports/design.pdf",
    "logs/error.log"
  ],
  "conversationId": "optional-provider-conversation-id"
}
```

Rules:

- `files` always contains relative paths.
- Normal zero-config behavior resolves those paths beneath the MCP workspace root.
- The workspace root defaults to the MCP server startup cwd, which should match the Codex session startup working directory in normal local use.
- `WEB_AUTOMATION_MCP_WORKSPACE` can explicitly set the workspace root.
- `WEB_AUTOMATION_MCP_INPUT_ROOT` is an advanced input-only override.
- At least one file is required.
- V0.1 limits one request to 10 files.
- Absolute paths and traversal are rejected.
- Resolved files must remain inside the effective input root.
- Only regular files are accepted.
- MCP results never return canonical absolute input paths.

Output:

```json
{
  "ok": true,
  "provider": "chatgpt",
  "profileId": "default",
  "conversationId": "provider-conversation-id",
  "responseText": "...",
  "fileCount": 2
}
```

## 4. Workspace and input-root model

Normal local Codex usage should require no file-root configuration:

```bash
cd /home/user/project
codex
```

Conceptually:

```text
workspaceRoot = WEB_AUTOMATION_MCP_WORKSPACE ?? startupCwd
inputRoot = WEB_AUTOMATION_MCP_INPUT_ROOT ?? workspaceRoot
outputRoot = WEB_AUTOMATION_MCP_OUTPUT_ROOT ?? workspaceRoot/mcp-output
```

Therefore:

```text
files: ["docs/design.pdf"]
```

maps internally to:

```text
<workspaceRoot>/docs/design.pdf
```

The workspace root is resolved once for the MCP runtime. It must not silently follow later `cd` commands executed by an agent. A new repository/workspace should use a restarted MCP process or an explicit workspace override.

## 5. Input security model

The file resolver must reject:

- empty paths;
- absolute POSIX paths;
- absolute Windows paths;
- `..` traversal segments;
- NUL bytes;
- paths whose canonical target escapes the effective input root through symlinks;
- directories, devices, sockets and other non-regular files;
- missing files;
- requests exceeding configured safety limits.

The public invariant is:

> relative path in, canonical path internally, root confinement before provider use.

Workspace/root selection is server-side policy. MCP request data must never be able to replace or widen the configured root.

The resolver returns canonical paths only to the provider/browser side. MCP responses, lifecycle logs and diagnostics do not include those paths.

## 6. Safety limits

V0.1 uses local safety limits independent of provider limits:

- maximum files per request: 10;
- maximum bytes per file: configurable through `WEB_AUTOMATION_MCP_MAX_INPUT_FILE_BYTES`;
- default maximum bytes per file: 50 MiB.

Provider-specific file-type and upload-size restrictions remain provider concerns. The local resolver protects the host filesystem; it must not duplicate every ChatGPT product rule.

## 7. Concern boundaries

### Runtime workspace policy

Owns selection of a stable workspace root for the MCP process lifetime.

It does not resolve ChatGPT selectors and does not read file contents.

### `application/AskWithFilesUseCase`

Owns orchestration only:

1. validate/resolve requested files through `InputFilePort`;
2. select `ProviderAttachmentPort` by provider id;
3. invoke provider ask-with-files;
4. return semantic result.

It must not call Node.js `fs`, Playwright or ChatGPT DOM APIs.

### `ports/InputFilePort`

Represents safe local-file resolution.

```ts
interface ResolvedInputFile {
  requestedPath: string;
  filePath: string;
  bytes: number;
}

interface InputFilePort {
  resolve(paths: readonly string[]): Promise<readonly ResolvedInputFile[]>;
}
```

### `infrastructure/RestrictedInputFileResolver`

Owns:

- effective input-root confinement;
- canonicalization;
- regular-file checks;
- size/count limits;
- filesystem error classification.

It does not know ChatGPT.

### `ports/ProviderAttachmentPort`

Represents a provider that can accept local attachments with a prompt.

It receives already validated canonical file descriptors. It does not perform host-filesystem authorization.

### `adapters/chatgpt/ChatGptAttachmentUploader`

Owns ChatGPT attachment UI semantics:

- locate the file input / attachment target;
- attach the resolved files;
- classify deterministic upload failures.

It does not decide which host paths are allowed.

### `adapters/playwright/`

Owns the browser mechanic for setting files on an HTML file input. It does not know what the files mean.

## 8. Dependency direction

```text
mcp
  -> application
      -> InputFilePort
      -> ProviderAttachmentPort

runtime/infrastructure
  -> workspace policy
  -> InputFilePort

chatgpt attachment adapter
  -> BrowserPort

playwright adapter
  -> BrowserPort
```

Forbidden:

```text
mcp -> fs
mcp -> Playwright
mcp request -> arbitrary workspace root
application -> fs
application -> Playwright
application -> ChatGPT selectors
ChatGPT adapter -> workspace/input-root policy
Playwright adapter -> ChatGPT concepts
```

## 9. Browser capability

`BrowserPagePort` provides generic file-input mechanics:

```ts
exists(locator): Promise<boolean>
setInputFiles(locator, filePaths): Promise<void>
```

`exists` is separate from `isVisible` because HTML file inputs are commonly hidden while still being valid automation targets.

The ChatGPT semantic registry contains a `file-input` target. The provider adapter resolves an existing file input rather than requiring it to be visible.

## 10. Ask-with-files state machine

```text
RESOLVE_WORKSPACE_POLICY
  -> RESOLVE_LOCAL_FILES
  -> ACQUIRE_PROFILE
  -> OPEN_OR_RESUME_CONVERSATION
  -> PROBE_SESSION
  -> RESOLVE_FILE_INPUT
  -> ATTACH_FILES
  -> CAPTURE_RESPONSE_BASELINE
  -> RESOLVE_PROMPT_INPUT
  -> SUBMIT_PROMPT
  -> WAIT_FOR_NEW_ASSISTANT_RESPONSE
  -> WAIT_FOR_COMPLETION
  -> EXTRACT_RESPONSE
  -> CAPTURE_CONVERSATION_ID
  -> RETURN
```

The exact acquisition order may differ in implementation, but local authorization must happen before canonical paths are exposed to the provider/browser boundary.

Uploading attachments must not be interpreted as a new assistant response.

## 11. Error taxonomy

Stable errors for the file-input boundary:

- `INPUT_PATH_NOT_ALLOWED` - requested path violates root/path policy;
- `INPUT_FILE_NOT_FOUND` - requested file does not exist or cannot be resolved;
- `INPUT_FILE_TOO_LARGE` - local safety limit exceeded;
- `FILE_UPLOAD_FAILED` - provider/browser could not attach validated files.

Existing errors continue to apply:

- `AUTH_REQUIRED`
- `PROFILE_BUSY`
- `NAVIGATION_FAILED`
- `TARGET_NOT_FOUND`
- `GENERATION_TIMEOUT`
- `EXTRACTION_FAILED`
- `PROVIDER_CHANGED`

## 12. Observability and redaction

Lifecycle events may record:

- operation = `ask_with_files`;
- provider;
- profile id;
- request id;
- duration;
- error code;
- file count.

They must not record:

- file contents;
- canonical input paths;
- requested filenames when they may contain sensitive information;
- prompt text;
- response text;
- conversation id value;
- cookies, tokens or browser storage.

Diagnostics follow the same rule.

## 13. V0.1 acceptance criteria

Automated tests must prove:

1. startup cwd becomes the default workspace when no overrides are configured;
2. explicit workspace/input overrides preserve backward-compatible advanced control;
3. traversal and absolute paths are rejected;
4. symlink escape cannot leave the input root;
5. missing files are classified;
6. oversized files are rejected;
7. normal files resolve to canonical paths;
8. MCP never returns canonical input paths;
9. ChatGPT attachment resolution can fall back when the primary locator drifts;
10. attachment errors map to stable public MCP errors;
11. normal `web_ask` and `web_ask_to_file` behavior remains unchanged;
12. MCP Inspector discovers `web_ask_with_files`.

Real local validation must additionally prove:

1. starting Codex in repository A makes repository-relative paths work without per-project root configuration;
2. one text file can be uploaded and analyzed;
3. one PDF or image can be uploaded and analyzed;
4. two files can be uploaded in one request;
5. a follow-up with `conversationId` works;
6. shared-CDP Chrome mode works without closing the externally managed Chrome process.

## 14. Deferred capabilities

Do not add these until the atomic operation is proven stable:

- standalone `web_upload_file`;
- persistent attachment handles across MCP calls;
- automatic directory upload;
- arbitrary unrestricted host-file access;
- per-request workspace switching;
- provider-independent MIME policy;
- file-content extraction/OCR inside this MCP;
- `web_ask_from_file` text-inlining optimization.
