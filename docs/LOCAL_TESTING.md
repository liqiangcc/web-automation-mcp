# 本地 Codex MCP 测试指南

## 1. 目标

本指南用于在本地 Codex 中验证以下完整链路：

```text
Codex
 -> stdio MCP
 -> web-automation-mcp
 -> Playwright Chromium / shared CDP Chrome
 -> 已登录的 ChatGPT Web
 -> 完整响应
```

文件相关能力额外验证：

```text
Codex workspace
 -> 相对输入路径
 -> web_ask_with_files
 -> ChatGPT Web
 -> web_ask_to_file
 -> <workspace>/mcp-output
```

本文以 WSL2 + WSLg 为主要测试环境。原生 Linux 也可采用相同流程，但不需要 WSL 专用检查。

## 2. 当前基线

| 项目               | 推荐值                 | 要求                                      |
| ------------------ | ---------------------- | ----------------------------------------- |
| Windows Linux 环境 | WSL2                   | 必须使用 WSL2，不能使用 WSL1              |
| Linux 发行版       | Ubuntu 24.04           | Playwright 支持的 64 位 Linux             |
| GUI                | WSLg，X11 `DISPLAY=:0` | 首次人工登录必须能打开 headed Chromium    |
| Node.js            | 24.x                   | `>=22.0.0`                                |
| MCP 传输           | stdio                  | Codex 在本机启动 MCP 子进程               |
| Provider           | ChatGPT Web            | V0.1 仅支持 ChatGPT                       |
| Profile            | `default`              | 同一 profile 不能被两个浏览器进程同时使用 |

## 3. 重要约束

1. Codex、登录 CLI 和 MCP Server 必须由同一个 Linux 用户运行。
2. 不要使用日常 Chrome profile；项目使用独立的自动化 profile。
3. 默认 profile 数据保存在 `~/.web-automation-mcp`，其中包含登录状态，禁止提交、复制或公开。
4. 首次登录是人工操作。项目不会自动填写用户名、密码或 MFA。
5. 同一 profile 有排他锁。运行登录、状态检查或 MCP 请求时，不要同时启动另一项操作。
6. MCP 工具使用 camelCase 参数，例如 `profileId`、`conversationId`、`outputPath`。
7. MCP 文件参数始终使用相对路径，不把宿主机绝对路径作为正常调用接口。

## 4. Workspace 路径规则

正常的 Codex CLI 场景应从正在开发的仓库启动：

```bash
cd /home/user/project
codex
```

MCP Server 在启动时固定一次 workspace root：

```text
workspaceRoot = WEB_AUTOMATION_MCP_WORKSPACE ?? MCP startup cwd
inputRoot = WEB_AUTOMATION_MCP_INPUT_ROOT ?? workspaceRoot
outputRoot = WEB_AUTOMATION_MCP_OUTPUT_ROOT ?? workspaceRoot/mcp-output
```

因此 Codex 和 MCP 使用同一套相对路径：

```text
docs/design.pdf
src/service/UserService.java
logs/error.log
```

默认输出：

```text
outputPath: reports/review.md

=> <workspace>/mcp-output/reports/review.md
```

`WEB_AUTOMATION_MCP_INPUT_ROOT` 和 `WEB_AUTOMATION_MCP_OUTPUT_ROOT` 只作为高级覆盖配置。

Workspace 在 MCP 进程生命周期内保持稳定。之后 shell 中执行 `cd` 不会让已经启动的 MCP 静默切换根目录；切换项目后应重启 Codex/MCP，或显式配置 `WEB_AUTOMATION_MCP_WORKSPACE`。

如果使用的 Codex Desktop/IDE 客户端没有把 active workspace 作为 stdio MCP 的进程 cwd，可显式设置：

```text
WEB_AUTOMATION_MCP_WORKSPACE=/absolute/path/to/project
```

这属于客户端兼容兜底；MCP Tool 参数仍然只传相对路径。

## 5. WSL2 和 WSLg 检查

在 Windows PowerShell 中运行：

```powershell
wsl --version
wsl --list --verbose
```

目标发行版的 `VERSION` 应为 `2`。如需更新 WSL：

```powershell
wsl --update
wsl --shutdown
```

重新进入 WSL 后运行：

```bash
uname -r
printf 'DISPLAY=%s\n' "${DISPLAY-}"
ls -l /tmp/.X11-unix
```

可选 GUI 检查：

```bash
sudo apt-get update
sudo apt-get install -y x11-utils
xdpyinfo >/dev/null && echo "WSLg display is available"
```

如果 `xdpyinfo` 报告 `cannot open display`，先修复 WSLg，不要继续首次登录测试。

## 6. 获取代码和安装运行时

```bash
git fetch origin
git switch bootstrap/phase-0
```

使用 Node.js 24：

```bash
nvm install 24
nvm use 24
node --version
npm --version
```

安装项目依赖和 Playwright Chromium：

```bash
npm install
npx playwright install --with-deps chromium
npx playwright install --list
```

网络较慢时可增加下载超时：

```bash
PLAYWRIGHT_DOWNLOAD_CONNECTION_TIMEOUT=120000 \
  npx playwright install --with-deps chromium
```

确认 Chromium 可执行文件存在：

```bash
node --input-type=module -e \
  "import { chromium } from 'playwright'; import { existsSync } from 'node:fs'; const path = chromium.executablePath(); console.log(path); console.log({ exists: existsSync(path) });"
```

## 7. 自动化检查

```bash
npm run typecheck
npm run lint
npm run format:check
npm test
npm run build
npm run mcp:smoke
```

MCP Inspector 应发现六个工具：

- `web_session_status`
- `web_new_chat`
- `web_ask`
- `web_ask_with_files`
- `web_ask_to_file`
- `web_get_last_response`

Inspector smoke 只验证 MCP 启动和工具发现，不验证 ChatGPT 登录或真实浏览器操作。

## 8. 首次登录和持久化验证

确保没有 Codex MCP 请求或其他登录命令正在使用 `default` profile：

```bash
npm run login -- default
```

预期：

1. 打开 headed Chromium；
2. 进入 ChatGPT；
3. 人工完成登录/MFA；
4. CLI 检测到 `AUTHENTICATED`；
5. 浏览器关闭并保存 profile。

然后执行：

```bash
npm run session:status -- default
npm run verify:persistence -- default
```

只有两次独立生命周期都返回 `AUTHENTICATED` 才算持久化验证通过。

## 9. 注册到 Codex：默认 workspace-relative 模式

先构建，并记录项目与 Node 的绝对位置：

```bash
npm run build
PROJECT_DIR="$(pwd)"
NODE_BIN="$(readlink -f "$(command -v node)")"
printf 'Node: %s\nServer: %s\n' "$NODE_BIN" "$PROJECT_DIR/dist/index.js"
```

正常 Codex CLI 使用不需要配置 INPUT/OUTPUT root：

```bash
cd "$PROJECT_DIR"

codex mcp add web-automation \
  -- \
  "$NODE_BIN" \
  "$PROJECT_DIR/dist/index.js"
```

然后从目标仓库目录启动新的 Codex 会话：

```bash
cd "$PROJECT_DIR"
codex
```

此时默认：

```text
inputRoot  = $PROJECT_DIR
outputRoot = $PROJECT_DIR/mcp-output
```

检查：

```bash
codex mcp get web-automation
codex mcp list
```

如果某个 Codex 客户端没有以项目目录启动 MCP，使用显式 workspace 兜底：

```bash
codex mcp remove web-automation
codex mcp add web-automation \
  --env WEB_AUTOMATION_MCP_WORKSPACE="$PROJECT_DIR" \
  -- \
  "$NODE_BIN" \
  "$PROJECT_DIR/dist/index.js"
```

如需进一步限制输入或把输出放到其他目录，可额外配置：

```text
WEB_AUTOMATION_MCP_INPUT_ROOT
WEB_AUTOMATION_MCP_OUTPUT_ROOT
```

这些变量决定服务端允许的 root，不会改变 MCP Tool “只收相对路径”的接口。

## 10. Shared CDP Chrome 模式

如果 Chrome DevTools MCP 已使用 `http://127.0.0.1:9223`，可让 `web-automation` 连接同一个专用 Chrome：

```bash
codex mcp remove web-automation
codex mcp add web-automation \
  --env WEB_AUTOMATION_MCP_CDP_URL=http://127.0.0.1:9223 \
  -- \
  "$NODE_BIN" \
  "$PROJECT_DIR/dist/index.js"
```

如果客户端 cwd 不可靠，同时增加：

```bash
--env WEB_AUTOMATION_MCP_WORKSPACE="$PROJECT_DIR"
```

Windows PowerShell 启动专用 Chrome 示例：

```powershell
& 'C:\Program Files\Google\Chrome\Application\chrome.exe' `
  --remote-debugging-port=9223 `
  --remote-allow-origins=* `
  --user-data-dir="$env:LOCALAPPDATA\chrome-devtools-mcp-wsl"
```

在该 Chrome 中手动登录 ChatGPT，并保持 Chrome 运行。不要让 Chrome DevTools MCP 和 `web-automation` 同时操作同一个标签页。

## 11. 在真实 Codex 中测试

### TC-CODEX-01 工具发现和登录状态

```text
请调用 web-automation MCP 的 web_session_status，profileId 使用 default。
```

预期返回 `ok: true` 和 `status: "AUTHENTICATED"`。

### TC-CODEX-02 创建新对话

```text
请调用 web_new_chat，profileId 使用 default。
```

预期返回 `ok: true` 和 `status: "READY"`。

### TC-CODEX-03 单轮问答

```text
请调用 web_ask：
profileId: default
prompt: 请只回答：本地 MCP 测试成功
```

预期返回完整 `responseText` 和非空 `conversationId`。

### TC-CODEX-04 多轮追问

使用上一轮 `conversationId`：

```text
请继续调用 web_ask，prompt 为：请只回答数字 2。
```

预期继续同一个 ChatGPT 对话。

### TC-CODEX-05 获取最后响应

```text
请调用 web_get_last_response，profileId 为 default，conversationId 使用刚才的值。
```

预期读取最新 assistant 文本且不提交新 prompt。

### TC-CODEX-06 相对路径上传本地文件

先在 Codex workspace 创建测试文件：

```bash
mkdir -p mcp-input
printf 'local-file-upload-test\n' > mcp-input/sample.txt
```

然后让 Codex 调用：

```text
web_ask_with_files
profileId: default
prompt: 请读取附件并只返回附件中的文本。
files: ["mcp-input/sample.txt"]
```

预期：

- `ok: true`；
- `fileCount: 1`；
- MCP 参数只出现 `mcp-input/sample.txt`，不要求宿主机绝对路径；
- 返回非空 `conversationId` 和完整 `responseText`；
- 尝试 `../secret.txt` 或绝对路径时返回 `INPUT_PATH_NOT_ALLOWED`。

继续验证 PDF/图片与两文件上传：

```text
files: ["docs/example.pdf"]
files: ["docs/a.pdf", "logs/error.log"]
```

### TC-CODEX-07 将回答保存到 workspace 输出目录

```text
请调用 web_ask_to_file：
profileId: default
prompt: 请写一份 Markdown 格式的 MCP 测试摘要
outputPath: reports/mcp-summary.md
```

默认文件应位于：

```text
$PROJECT_DIR/mcp-output/reports/mcp-summary.md
```

预期：

- 返回 `ok: true`、`conversationId`、`filePath`、`bytesWritten`、`sha256`；
- MCP 结果不包含完整回答正文；
- 再次使用同一路径且不启用 overwrite 时返回 `FILE_ALREADY_EXISTS`；
- 绝对路径、`../` 和符号链接逃逸返回 `OUTPUT_PATH_NOT_ALLOWED`。

### TC-CODEX-08 Workspace 重启切换

在两个不同仓库分别启动新的 Codex/MCP 生命周期：

```text
repo-a -> files: ["docs/a.txt"]
repo-b -> files: ["docs/b.txt"]
```

预期每次相对路径只在对应启动 workspace 中解析，不继承上一个项目的 root。

## 12. 非交互式 Codex 冒烟测试

```bash
codex exec --ephemeral --json --color never \
  '必须调用 web-automation MCP 的 web_session_status；profileId 使用 default；最后只报告工具是否可发现以及返回状态。'
```

工具返回失败时 Codex 进程仍可能正常退出，因此必须检查 MCP tool call 结果，不能只看 shell 退出码。

## 13. 故障排查

### Workspace 指向错误目录

先确认当前 Codex 启动目录：

```bash
pwd
```

如果使用的客户端没有让 MCP 继承该目录，显式设置：

```text
WEB_AUTOMATION_MCP_WORKSPACE=/absolute/path/to/project
```

修改 MCP 配置后必须新建 Codex 会话。

### `INTERNAL_ERROR: Unexpected internal error`

```bash
npx playwright install --list
node --input-type=module -e \
  "import { chromium } from 'playwright'; import { existsSync } from 'node:fs'; const path = chromium.executablePath(); console.log(path, existsSync(path));"
```

查看本地诊断：

```bash
find ~/.web-automation-mcp/diagnostics -maxdepth 1 -type f -print
```

### `AUTH_REQUIRED`

```bash
npm run login -- default
```

确认登录 CLI 与 Codex MCP 使用同一个 Linux 用户。

### `PROFILE_BUSY`

等待当前 profile 操作完成，不要删除仍属于活动进程的 lock 文件。

### Codex 找不到工具

```bash
codex mcp get web-automation
codex mcp list
npm run build
npm run mcp:smoke
```

修改配置后新建 Codex 会话。

## 14. 诊断和安全检查

生命周期日志写入 stderr，stdout 专用于 stdio MCP 协议。失败诊断默认写入：

```text
~/.web-automation-mcp/diagnostics/
```

测试后确认：

- MCP 响应没有 cookie、token、Authorization header；
- 日志和 diagnostics 没有 prompt、response 正文或 canonical input path；
- profile 目录没有进入 Git 状态；
- 输入 Tool 不允许绝对路径和 workspace 逃逸；
- 输出 Tool 不允许写出 outputRoot；
- 不向缺陷报告上传整个 profile 目录。

## 15. 最低验收标准

- [ ] WSL2/WSLg 或 Linux GUI 检查通过；
- [ ] Node.js / Playwright 安装完成；
- [ ] typecheck、lint、format、unit tests、build 全部通过；
- [ ] MCP Inspector 能发现六个工具；
- [ ] ChatGPT 人工登录完成；
- [ ] 两次重启持久化验证通过；
- [ ] `web_session_status` 可从真实 Codex 调用；
- [ ] `web_ask` 返回完整文本和 `conversationId`；
- [ ] `web_ask_with_files` 通过文本、PDF/图片、两文件测试；
- [ ] `web_ask_to_file` 默认写到 `<workspace>/mcp-output`；
- [ ] 多轮追问和 `web_get_last_response` 通过；
- [ ] shared-CDP 附件路径通过；
- [ ] 两个不同仓库重启 Codex 后 workspace-relative 行为正确；
- [ ] 完成 `POC_PLAN.md` 中的 30+ 次真实请求矩阵。

## 16. 测试记录模板

| 字段                     | 记录        |
| ------------------------ | ----------- |
| 日期                     |             |
| 测试人员                 |             |
| Windows/WSL 版本         |             |
| Linux 发行版             |             |
| Node.js 版本             |             |
| Playwright/Chromium 版本 |             |
| Git commit               |             |
| Codex 启动 cwd           |             |
| Effective workspace      |             |
| Profile ID               |             |
| 自动化测试结果           |             |
| Inspector smoke          |             |
| 持久化验证               |             |
| 文件上传验证             |             |
| Codex 工具调用           |             |
| 30-run 成功率            |             |
| 失败分类                 |             |
| Diagnostics 路径         |             |
| 最终结论                 | PASS / FAIL |

清理 Codex 注册项：

```bash
codex mcp remove web-automation
```

该命令只移除 Codex MCP 配置，不会删除浏览器 profile 或登录状态。
