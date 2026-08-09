# Live Validation

## Goal

The live validation command turns the remaining V0.1 browser reliability checks into a repeatable local procedure. It intentionally separates two concerns:

```text
MCP protocol correctness
  -> npm run mcp:smoke

ChatGPT Web / browser reliability
  -> npm run validate:live
```

`mcp:smoke` uses MCP Inspector to verify stdio startup and tool discovery. `validate:live` calls the default application/runtime directly so that the 30-run reliability rate is not distorted by repeatedly launching Inspector or downloading packages.

## Prerequisites

Before live validation:

```bash
npm run build
npm run verify:persistence -- default
```

The selected profile must report `AUTHENTICATED`. For shared-CDP mode, start the dedicated Chrome instance first and export `WEB_AUTOMATION_MCP_CDP_URL` as described in `LOCAL_TESTING.md`.

## 30-run reliability matrix

Run:

```bash
npm run validate:live -- --profile default
```

The matrix contains exactly 30 requests:

- 5 short responses;
- 5 long-form responses;
- 5 code-generation responses;
- 5 requests in one multi-turn conversation series;
- 5 intentionally long responses intended to exercise >30 second generation when the provider is slow enough;
- 5 repeated isolated new-chat requests.

Every validation prompt asks ChatGPT to emit a unique end marker. A request counts as successful only when:

1. the browser/application call succeeds; and
2. the complete response contains that request's end marker.

A response returned without the marker is classified as `INCOMPLETE_RESPONSE`, which prevents an early completion detector from being counted as success.

The current acceptance target is at least 95% across all 30 requested cases. With 30 cases, at least 29 must succeed for the rate gate to pass.

The report records only fixed validation metadata:

- case id/category;
- success/incomplete/error status;
- total duration;
- response character count;
- whether the request continued an existing conversation;
- whether duration exceeded 30 seconds;
- typed failure code.

It does not store the generated response text.

## Attachment checks

By default the same command also runs:

1. one text attachment using `validation/fixtures/sample.txt`;
2. one two-file attachment using `sample.txt` and `sample.md`.

The files contain only fixed non-secret validation tokens. The response must contain the expected token(s) and the unique end marker.

To add a real PDF or image that already exists inside the current Codex workspace:

```bash
npm run validate:live -- \
  --profile default \
  --binary-file docs/example.pdf
```

`--binary-file` remains workspace-relative and goes through the same restricted input resolver as normal MCP attachment requests.

To run only the 30-request reliability matrix:

```bash
npm run validate:live -- --profile default --skip-attachments
```

## Report output

The default report is written under the effective output root:

```text
mcp-output/validation/live-validation-<timestamp>.json
```

The command exits with code 0 only when:

- the 30-run success rate reaches the configured 95% target; and
- every attachment check that was requested succeeds.

The report does not store absolute workspace paths. Instead it stores a SHA-256 `workspaceFingerprint`, allowing two launches to be compared without leaking the host path.

## Workspace A/B verification

The workspace contract can be checked without opening a browser:

```bash
npm run validate:live -- --workspace-only
```

To prove that startup cwd is stable per process and changes after restart, run the built CLI from two repositories:

```bash
WEB_AUTOMATION_REPO=/absolute/path/to/web-automation-mcp

cd /path/to/project-a
node "$WEB_AUTOMATION_REPO/dist/cli/live-validation-main.js" --workspace-only

cd /path/to/project-b
node "$WEB_AUTOMATION_REPO/dist/cli/live-validation-main.js" --workspace-only
```

Expected result: the two `workspaceFingerprint` values differ. Re-running in the same directory should produce the same fingerprint.

If a Codex surface does not launch stdio MCP in the intended repository cwd, set:

```bash
WEB_AUTOMATION_MCP_WORKSPACE=/path/to/project
```

or configure the MCP process cwd in that Codex surface. The MCP tool arguments themselves should remain relative paths.

## Shared-CDP validation

Run the same validation command with the externally managed Chrome endpoint:

```bash
WEB_AUTOMATION_MCP_CDP_URL=http://127.0.0.1:9223 \
  npm run validate:live -- --profile default --binary-file docs/example.pdf
```

The generated report records `mode: "shared_cdp"`. Passing this run proves the validation scenarios work through the CDP browser session path without intentionally closing the externally managed Chrome process.

Run again without `WEB_AUTOMATION_MCP_CDP_URL` to validate the persistent-profile path separately.

## Useful options

```text
--profile <id>          browser profile id; default is default
--report <relative>     custom report path under the effective output root
--delay-ms <ms>         delay between reliability requests; default 1000
--skip-attachments      skip attachment checks
--workspace-only        print workspace fingerprint and exit
--binary-file <path>    add one workspace-relative PDF/image check
```

## What remains manual

CI can test matrix construction, marker accounting, path policy and failure classification, but it cannot prove a real authenticated ChatGPT account. The following TODO items remain incomplete until `validate:live` is executed locally against the real profile:

- real restart persistence;
- real text/PDF/image/multiple-file upload;
- shared-CDP attachment flow;
- 30-run >=95% browser reliability result.
