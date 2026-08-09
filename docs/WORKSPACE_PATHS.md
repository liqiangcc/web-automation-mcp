# Workspace and Relative Path Model

## 1. Decision

Local file paths exposed through MCP are workspace-relative by default.

For the normal local Codex workflow, the workspace is the directory from which the MCP server is started. In practice this should be the Codex session startup working directory for the repository being worked on.

```text
Codex startup cwd
      |
      v
MCP workspace root
      |
      +-- src/
      +-- docs/
      +-- logs/
      +-- mcp-output/
```

MCP callers use paths such as:

```text
docs/design.pdf
src/service/UserService.java
logs/error.log
```

They do not pass host absolute paths.

## 2. Why startup cwd instead of a dynamic cwd

The MCP server is a separate process. Its filesystem root must not silently change because an agent executes `cd` later in the session.

Therefore V0.1 defines workspace root once when the MCP runtime is created:

```text
server startup
   -> resolve workspace root
   -> canonicalize root
   -> keep root stable for server lifetime
```

If Codex is restarted from another repository, the new MCP process naturally receives a new startup cwd. If the launcher keeps an MCP server alive across workspace changes, an explicit workspace configuration must be used or the MCP server must be restarted.

## 3. Configuration precedence

Recommended default configuration requires no path variables:

```text
workspace = process startup cwd
input root = workspace
output root = workspace/mcp-output
```

Optional advanced overrides:

```text
WEB_AUTOMATION_MCP_WORKSPACE
WEB_AUTOMATION_MCP_INPUT_ROOT
WEB_AUTOMATION_MCP_OUTPUT_ROOT
```

Resolution rules:

```text
workspaceRoot =
  WEB_AUTOMATION_MCP_WORKSPACE
  ?? startup cwd

inputRoot =
  WEB_AUTOMATION_MCP_INPUT_ROOT
  ?? workspaceRoot

outputRoot =
  WEB_AUTOMATION_MCP_OUTPUT_ROOT
  ?? <workspaceRoot>/mcp-output
```

`INPUT_ROOT` and `OUTPUT_ROOT` are advanced overrides, not the normal interface.

## 4. MCP path semantics

### Input

```json
{
  "files": ["docs/design.pdf", "logs/error.log"]
}
```

With workspace `/home/user/project`, the server resolves these internally to canonical host paths beneath the configured input root.

### Output

```json
{
  "outputPath": "reports/review.md"
}
```

With the default output root, this resolves beneath:

```text
/home/user/project/mcp-output/reports/review.md
```

The MCP contract remains relative even though browser and filesystem adapters eventually require absolute canonical paths.

## 5. Security invariant

The public path contract is:

> relative path in, canonical path internally, root confinement before use.

The server must reject:

- POSIX absolute paths;
- Windows absolute paths;
- `..` traversal;
- NUL bytes;
- canonical paths escaping through symlinks;
- input paths outside `inputRoot`;
- output paths outside `outputRoot`.

The model must not be able to widen the workspace by supplying another root in a tool argument.

Workspace/root selection is server-side configuration, not MCP request data.

## 6. Concern boundary

Workspace selection is not a ChatGPT concern and not a Playwright concern.

```text
Runtime composition
      |
      v
WorkspacePathPolicy
   |             |
   v             v
InputFilePort  AnswerFilePort
   |             |
   v             v
canonical      canonical
input path     output path
```

Responsibilities:

- runtime composition determines the stable workspace root;
- input infrastructure authorizes and canonicalizes input paths;
- output infrastructure authorizes and canonicalizes output paths;
- application use cases operate on semantic requests;
- ChatGPT adapters receive already authorized canonical attachment paths;
- MCP only accepts and returns workspace-relative path semantics unless a result explicitly documents a local generated file path.

## 7. Codex usage model

Normal use should be zero-config:

```bash
cd /home/user/project
codex
```

Then the MCP path vocabulary matches the repository vocabulary already visible to Codex:

```text
Codex: docs/design.pdf
MCP:   docs/design.pdf
```

No second project root needs to be taught to the agent.

If the MCP is registered globally and its launcher does not inherit the desired project cwd, configure:

```text
WEB_AUTOMATION_MCP_WORKSPACE=/home/user/project
```

or launch/restart the MCP from the intended workspace.

## 8. Non-goals

V0.1 does not add:

- absolute-path MCP arguments;
- per-request workspace switching;
- arbitrary host filesystem access;
- automatic discovery of unrelated repositories;
- trust in a caller-provided workspace root;
- dynamic root mutation after the server starts.

## 9. Acceptance criteria

Automated tests must prove:

1. startup cwd is used when no workspace override is configured;
2. `WEB_AUTOMATION_MCP_WORKSPACE` overrides startup cwd;
3. `INPUT_ROOT` overrides only input resolution;
4. `OUTPUT_ROOT` overrides only output resolution;
5. default output is `<workspace>/mcp-output`;
6. public MCP requests continue to use relative paths;
7. absolute/traversal/symlink escape remains rejected;
8. existing explicit-root deployments remain compatible.
