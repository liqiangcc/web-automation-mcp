# Local File Input and Web Upload

## 1. Decision

V0.1 adds one atomic MCP operation for local-file input:

```text
web_ask_with_files(profileId, prompt, files[], conversationId?)
```

The operation validates local files inside a configured input root, uploads them to the provider UI, submits the prompt, waits for completion, and returns the normal answer result.

V0.1 does **not** expose a standalone `web_upload_file` operation. Uploading a file without submitting the associated prompt would create hidden browser state that must survive across MCP calls and would couple later requests to a particular tab/composer state.

A text-only `web_ask_from_file` operation is deferred. It can be useful for bypassing MCP/model context transfer, but native provider attachment upload covers more file types and is the higher-value first capability.

## 2. Core use case

```text
Local Files
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

Combined with `web_ask_to_file`, this creates the desired local-to-web-to-local flow:

```text
Local input files
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
Local output
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

- `files` contains paths relative to `WEB_AUTOMATION_MCP_INPUT_ROOT`.
- At least one file is required.
- V0.1 limits one request to 10 files.
- Absolute paths and path traversal are rejected.
- Resolved files must remain inside the configured input root.
- Only regular files are accepted.
- The MCP result never returns local absolute input paths.

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

## 4. Input-root security model

Configuration:

```text
WEB_AUTOMATION_MCP_INPUT_ROOT=/safe/workspace
```

When unset, V0.1 uses the MCP server working directory as the input root, matching the existing output-root fallback model.

The file resolver must reject:

- empty paths;
- absolute POSIX paths;
- absolute Windows paths;
- `..` traversal segments;
- NUL bytes;
- paths whose canonical target escapes the configured root through symlinks;
- directories, devices, sockets and other non-regular files;
- missing files;
- requests exceeding the configured safety limits.

The resolver returns canonical paths only to the provider/browser side. MCP responses, lifecycle logs and diagnostics do not include those paths.

## 5. Safety limits

V0.1 uses local safety limits, independent of provider limits:

- maximum files per request: 10;
- maximum bytes per file: configurable through `WEB_AUTOMATION_MCP_MAX_INPUT_FILE_BYTES`;
- default maximum bytes per file: 50 MiB.

Provider-specific file-type and upload-size restrictions remain provider concerns. The local resolver protects the host filesystem; it must not attempt to duplicate every ChatGPT product rule.

## 6. Concern boundaries

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

- root confinement;
- canonicalization;
- regular-file checks;
- size/count limits;
- filesystem error classification.

It does not know ChatGPT.

### `ports/ProviderAttachmentPort`

Represents a provider that can accept local attachments with a prompt.

It receives already validated canonical file descriptors. It does not perform filesystem authorization.

### `adapters/chatgpt/ChatGptAttachmentUploader`

Owns ChatGPT attachment UI semantics:

- locate the file input / attachment target;
- attach the resolved files;
- classify deterministic upload failures.

It does not decide which host paths are allowed.

### `adapters/playwright/`

Owns the browser mechanic for setting files on an HTML file input. It does not know what the files mean.

## 7. Dependency direction

```text
mcp
  -> application
      -> InputFilePort
      -> ProviderAttachmentPort

infrastructure/input-file
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
application -> fs
application -> Playwright
application -> ChatGPT selectors
ChatGPT adapter -> input-root policy
Playwright adapter -> ChatGPT concepts
```

## 8. Browser capability

`BrowserPagePort` gains a generic file-input mechanic, conceptually:

```ts
exists(locator): Promise<boolean>
setInputFiles(locator, filePaths): Promise<void>
```

`exists` is separate from `isVisible` because HTML file inputs are commonly hidden while still being valid automation targets.

The ChatGPT semantic registry gains a `file-input` target. The provider adapter resolves an existing file input rather than requiring it to be visible.

## 9. Ask-with-files state machine

```text
ACQUIRE_PROFILE
  -> OPEN_OR_RESUME_CONVERSATION
  -> PROBE_SESSION
  -> RESOLVE_LOCAL_FILES
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

The implementation may capture the response baseline immediately before prompt submission. Uploading attachments must not be interpreted as a new assistant response.

## 10. Error taxonomy

Add stable errors for the new boundary:

- `INPUT_PATH_NOT_ALLOWED` - requested path violates root/path policy;
- `INPUT_FILE_NOT_FOUND` - requested file does not exist or cannot be resolved;
- `INPUT_FILE_TOO_LARGE` - local safety limit exceeded;
- `FILE_UPLOAD_FAILED` - provider/browser could not attach the validated files.

Existing errors continue to apply:

- `AUTH_REQUIRED`
- `PROFILE_BUSY`
- `NAVIGATION_FAILED`
- `TARGET_NOT_FOUND`
- `GENERATION_TIMEOUT`
- `EXTRACTION_FAILED`
- `PROVIDER_CHANGED`

## 11. Observability and redaction

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

## 12. V0.1 acceptance criteria

Automated tests must prove:

1. traversal and absolute paths are rejected;
2. symlink escape cannot leave the input root;
3. missing files are classified;
4. oversized files are rejected;
5. normal files resolve to canonical paths;
6. MCP never returns canonical input paths;
7. ChatGPT attachment resolution can fall back when the primary locator drifts;
8. attachment errors map to stable public MCP errors;
9. normal `web_ask` and `web_ask_to_file` behavior remains unchanged;
10. MCP Inspector discovers `web_ask_with_files`.

Real local validation must additionally prove:

1. one text file can be uploaded and analyzed;
2. one PDF or image can be uploaded and analyzed;
3. two files can be uploaded in one request;
4. a follow-up with `conversationId` works;
5. shared-CDP Chrome mode works without closing the externally managed Chrome process.

## 13. Deferred capabilities

Do not add these until the atomic operation is proven stable:

- standalone `web_upload_file`;
- persistent attachment handles across MCP calls;
- automatic directory upload;
- arbitrary unrestricted host-file access;
- provider-independent MIME policy;
- file-content extraction/OCR inside this MCP;
- `web_ask_from_file` text-inlining optimization.
