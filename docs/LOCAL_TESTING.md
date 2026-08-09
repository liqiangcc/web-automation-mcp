# 本地 Codex MCP 测试指南

## 1. 目标

本指南用于在本地 Codex 中验证以下完整链路：

```text
Codex
 -> stdio MCP
 -> web-automation-mcp
 -> Playwright Chromium
 -> 已登录的 ChatGPT Web
 -> 完整响应
```

本文以 WSL2 + WSLg 为主要测试环境。原生 Linux 也可采用相同流程，但不需要 WSL 专用检查。

## 2. 当前已验证环境

当前开发环境的基线如下：

| 项目               | 当前值                 | 要求                                      |
| ------------------ | ---------------------- | ----------------------------------------- |
| Windows Linux 环境 | WSL2                   | 必须使用 WSL2，不能使用 WSL1              |
| Linux 发行版       | Ubuntu 24.04           | Playwright 支持的 64 位 Linux             |
| GUI                | WSLg，X11 `DISPLAY=:0` | 首次人工登录必须能打开 headed Chromium    |
| Node.js            | 24.19.0                | `>=22.0.0`                                |
| MCP 传输           | stdio                  | Codex 在本机启动 MCP 子进程               |
| Provider           | ChatGPT Web            | V0.1 仅支持 ChatGPT                       |
| Profile            | `default`              | 同一 profile 不能被两个浏览器进程同时使用 |

## 3. 重要约束

1. Codex、登录 CLI 和 MCP Server 必须由同一个 Linux 用户运行。
2. 不要使用日常 Chrome profile；项目使用独立的 Playwright persistent profile。
3. 默认 profile 数据保存在 `~/.web-automation-mcp`，其中包含登录状态，禁止提交、复制或公开。
4. 首次登录是人工操作。项目不会自动填写用户名、密码或 MFA。
5. 同一 profile 有排他锁。运行登录、状态检查或 MCP 请求时，不要同时启动另一项操作。
6. MCP 工具实际使用 camelCase 参数，例如 `profileId` 和 `conversationId`。

如果先用 `root` 配置 Codex，随后改用普通用户启动 Codex，普通用户不会自动继承 `/root/.codex` 中的 MCP 配置，也不会共享 `/root/.web-automation-mcp` 中的登录状态。

## 4. WSL2 和 WSLg 检查

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

内核名称应包含 `WSL2`，`DISPLAY` 不应为空，并且 `/tmp/.X11-unix` 下应存在 X11 socket。

可选的 GUI 连通性检查：

```bash
sudo apt-get update
sudo apt-get install -y x11-utils
xdpyinfo >/dev/null && echo "WSLg display is available"
```

如果 `xdpyinfo` 报告 `cannot open display`，先在 Windows PowerShell 中执行 `wsl --update` 和 `wsl --shutdown`，不要继续进行登录测试。

## 5. 获取代码和安装运行时

实现目前位于 `bootstrap/phase-0` 分支：

```bash
git fetch origin
git switch bootstrap/phase-0
```

使用 NVM 安装 Node.js 24：

```bash
command -v nvm >/dev/null || {
  echo "请先安装 NVM 或在当前 shell 中加载 NVM"
  exit 1
}
nvm install 24
nvm use 24
node --version
npm --version
```

`node --version` 必须为 `v22` 或更高版本，推荐 `v24`。

安装项目依赖和 Playwright Chromium：

```bash
npm install
npx playwright install --with-deps chromium
npx playwright install --list
```

Playwright 浏览器默认安装在当前 Linux 用户的 `~/.cache/ms-playwright`。如果下载网络较慢，可以增加连接超时：

```bash
PLAYWRIGHT_DOWNLOAD_CONNECTION_TIMEOUT=120000 \
  npx playwright install --with-deps chromium
```

确认 Chromium 可执行文件存在：

```bash
node --input-type=module -e \
  "import { chromium } from 'playwright'; import { existsSync } from 'node:fs'; const path = chromium.executablePath(); console.log(path); console.log({ exists: existsSync(path) });"
```

输出中的 `exists` 必须为 `true`。

## 6. 自动化检查

```bash
npm run typecheck
npm run lint
npm run format:check
npm test
npm run build
```

验收要求：

- typecheck 退出码为 0；
- lint 退出码为 0；
- format check 退出码为 0；
- 所有 Vitest 测试通过；
- `dist/index.js` 成功生成。

单独验证 MCP Inspector 的 `tools/list`：

```bash
npm run mcp:smoke
```

预期发现以下工具：

- `web_session_status`
- `web_new_chat`
- `web_ask`
- `web_ask_to_file`
- `web_get_last_response`

Inspector smoke 只验证 MCP 启动和工具发现，不验证 ChatGPT 登录或真实浏览器操作。

## 7. 首次登录和持久化验证

确保没有 Codex MCP 请求或其他登录命令正在使用 `default` profile，然后运行：

```bash
npm run login -- default
```

登录窗口默认等待 1 分钟。请在窗口关闭前完成登录；超时后命令会关闭浏览器并返回
`AUTH_REQUIRED`。

预期行为：

1. WSLg 在 Windows 桌面打开 Linux Chromium；
2. 浏览器进入 ChatGPT；
3. 测试人员手动完成登录和 MFA；
4. CLI 检测到 `AUTHENTICATED`；
5. 浏览器关闭，profile 保存到本地。

检查新浏览器生命周期中的状态：

```bash
npm run session:status -- default
```

预期状态：

```text
AUTHENTICATED
```

执行两次独立重启验证：

```bash
npm run verify:persistence -- default
```

只有两次检查都返回 `AUTHENTICATED` 才算持久化验证通过。

## 8. 注册到本地 Codex

先构建项目，并解析 Node 与项目入口的绝对路径：

```bash
npm run build
PROJECT_DIR="$(pwd)"
NODE_BIN="$(readlink -f "$(command -v node)")"
printf 'Node: %s\nServer: %s\n' "$NODE_BIN" "$PROJECT_DIR/dist/index.js"
```

注册 stdio MCP Server：

```bash
codex mcp add web-automation \
  --env WEB_AUTOMATION_MCP_CDP_URL=http://127.0.0.1:9223 \
  --env WEB_AUTOMATION_MCP_OUTPUT_ROOT="$PROJECT_DIR/mcp-output" \
  -- \
  "$NODE_BIN" \
  "$PROJECT_DIR/dist/index.js"
```

检查注册结果：

```bash
codex mcp get web-automation
codex mcp list
```

验收要求：

- `web-automation` 存在；
- transport 为 `stdio`；
- status 为 `enabled`；
- command 和 args 都是有效的绝对路径。

如果该名称已经存在并且路径需要更新，先确认旧配置后再替换：

```bash
codex mcp get web-automation
codex mcp remove web-automation
codex mcp add web-automation \
  --env WEB_AUTOMATION_MCP_CDP_URL=http://127.0.0.1:9223 \
  --env WEB_AUTOMATION_MCP_OUTPUT_ROOT="$PROJECT_DIR/mcp-output" \
  -- \
  "$NODE_BIN" \
  "$PROJECT_DIR/dist/index.js"
```

修改 MCP 配置后，关闭旧 Codex 会话并创建新会话。已经运行的会话不会动态获得新注册的工具。

### 复用 Chrome DevTools MCP 的宿主机 Chrome

如果 Chrome DevTools MCP 已使用 `http://127.0.0.1:9223`，上述配置会让两个 MCP
连接同一个宿主机 Chrome 和同一个专用 profile。`web-automation` 每次请求会新建并在完成后
关闭自己的标签页，只断开自己的 CDP 连接，不关闭宿主机 Chrome。

启动 Chrome 时必须使用独立测试 profile，不能使用日常 Chrome 默认 profile：

```powershell
& 'C:\Program Files\Google\Chrome\Application\chrome.exe' `
  --remote-debugging-port=9223 `
  --remote-allow-origins=* `
  --user-data-dir="$env:LOCALAPPDATA\chrome-devtools-mcp-wsl"
```

在该 Chrome 窗口中手动登录 ChatGPT，并在执行 MCP 测试期间保持 Chrome 运行。不要让
Chrome DevTools MCP 和 `web-automation` 同时操作同一个标签页。

## 9. 在真实 Codex 中测试

启动一个新的本地 Codex 会话：

```bash
codex
```

### TC-CODEX-01 工具发现和登录状态

向 Codex 输入：

```text
请调用 web-automation MCP 的 web_session_status 工具，
参数 profileId 为 default，并返回结构化结果。
```

预期：

- Codex 能发现 `web_session_status`；
- 实际调用参数包含 `profileId: "default"`；
- 返回 `ok: true` 和 `status: "AUTHENTICATED"`。

### TC-CODEX-02 创建新对话

```text
请调用 web-automation MCP 的 web_new_chat，
参数 profileId 为 default。
```

预期返回 `ok: true` 和 `status: "ready"`。

### TC-CODEX-03 发送单轮问题

```text
请调用 web-automation MCP 的 web_ask，参数为：
profileId: default
prompt: 请只回答：本地 MCP 测试成功
```

预期：

- 返回 `ok: true`；
- `responseText` 非空且未截断；
- 返回非空 `conversationId`；
- 回答包含“本地 MCP 测试成功”。

保存该次返回的 `conversationId`。

### TC-CODEX-04 多轮追问

```text
请继续调用 web_ask，使用刚才返回的 conversationId，
profileId 为 default，prompt 为：请只回答数字 2。
```

预期使用同一个 ChatGPT 对话并返回非空响应。

### TC-CODEX-05 获取最后响应

```text
请调用 web_get_last_response，profileId 为 default，
conversationId 使用刚才的值。
```

预期返回该对话最新的 assistant 文本，且不会提交新 prompt。

### TC-CODEX-06 将回答直接保存到文件

```text
请调用 web-automation MCP 的 web_ask_to_file，参数为：
profileId: default
prompt: 请写一份 Markdown 格式的 MCP 测试摘要
outputPath: reports/mcp-summary.md
```

预期：

- 返回 `ok: true`、非空 `conversationId`、`filePath`、`bytesWritten` 和 `sha256`；
- MCP 的 `content` 和 `structuredContent` 都不包含完整回答正文；
- 文件位于 `$PROJECT_DIR/mcp-output/reports/mcp-summary.md`；
- 再次使用相同路径且不传 `overwrite: true` 时返回 `FILE_ALREADY_EXISTS`；
- 绝对路径、`../`、Windows 绝对路径和符号链接逃逸返回 `OUTPUT_PATH_NOT_ALLOWED`。

## 10. 非交互式 Codex 冒烟测试

可用一个全新的临时 Codex 会话验证 MCP 是否真实可调用：

```bash
codex exec --ephemeral --json --color never \
  '必须调用 web-automation MCP 的 web_session_status；profileId 使用 default；最后只报告工具是否可发现以及返回状态。'
```

输出事件中应出现：

```text
server: web-automation
tool: web_session_status
status: completed
```

工具返回失败时，Codex 进程本身仍可能正常退出，因此必须检查 MCP tool call 的结果，不能只看 shell 退出码。

## 11. 故障排查

### `INTERNAL_ERROR: Unexpected internal error`

先确认 Playwright 浏览器已完整安装：

```bash
npx playwright install --list
node --input-type=module -e \
  "import { chromium } from 'playwright'; import { existsSync } from 'node:fs'; const path = chromium.executablePath(); console.log(path, existsSync(path));"
```

再查看本地诊断记录：

```bash
find ~/.web-automation-mcp/diagnostics -maxdepth 1 -type f -print
```

### Chromium 窗口没有出现

```bash
printf 'DISPLAY=%s\n' "${DISPLAY-}"
xdpyinfo >/dev/null
```

如果失败，在 Windows PowerShell 中运行 `wsl --update`、`wsl --shutdown`，然后重新进入 WSL。远程 SSH 会话或没有 WSLg 的后台环境需要额外的 X Server，不能直接执行首次 headed 登录。

### `AUTH_REQUIRED`

```bash
npm run login -- default
```

确认登录命令和 Codex MCP 由同一个 Linux 用户运行。

### `PROFILE_BUSY`

等待正在使用该 profile 的登录、状态检查或 MCP 请求完成。不要删除仍属于活动进程的 lock 文件。

### Codex 找不到工具

```bash
codex mcp get web-automation
codex mcp list
npm run build
```

确认注册路径存在，并新建 Codex 会话。还要确认配置 MCP 与启动 Codex 使用的是同一个 Linux 用户。

### 参数校验失败

MCP schema 使用以下字段：

- `profileId`
- `conversationId`
- `prompt`
- 可选 `provider`，V0.1 仅允许 `chatgpt`

不要向 MCP 发送 `profile_id` 或 `conversation_id`。

## 12. 诊断和安全检查

生命周期日志写入 stderr，stdout 专用于 stdio MCP 协议。失败诊断默认写入：

```text
~/.web-automation-mcp/diagnostics/
```

测试后确认：

- MCP 响应中没有 cookie、token、Authorization header；
- 日志和 diagnostics 没有泄漏登录凭证；
- profile 目录没有出现在 Git 状态中；
- 不向缺陷报告上传整个 profile 目录。

## 13. 最低验收标准

V0.1 本地验收至少需要满足：

- [ ] WSL2/WSLg 或 Linux GUI 检查通过；
- [ ] Node.js 版本满足要求；
- [ ] Chromium 和系统依赖安装完成；
- [ ] typecheck、lint、format、unit tests、build 全部通过；
- [ ] MCP Inspector 能发现五个工具；
- [ ] ChatGPT 人工登录完成；
- [ ] 两次重启持久化验证通过；
- [ ] 新 Codex 会话能调用 `web_session_status`；
- [ ] `web_ask` 能返回完整文本和 `conversationId`；
- [ ] `web_ask_to_file` 能写入受限目录且不在 MCP 响应中返回完整正文；
- [ ] 多轮追问和 `web_get_last_response` 通过；
- [ ] 完成 `POC_PLAN.md` 中的 30+ 次真实请求矩阵。

## 14. 测试记录模板

| 字段                     | 记录        |
| ------------------------ | ----------- |
| 日期                     |             |
| 测试人员                 |             |
| Windows/WSL 版本         |             |
| Linux 发行版             |             |
| Node.js 版本             |             |
| Playwright/Chromium 版本 |             |
| Git commit               |             |
| Profile ID               |             |
| 自动化测试结果           |             |
| Inspector smoke          |             |
| 持久化验证               |             |
| Codex 工具调用           |             |
| 30-run 成功率            |             |
| 失败分类                 |             |
| Diagnostics 路径         |             |
| 最终结论                 | PASS / FAIL |

## 15. 参考资料

- [OpenAI Developers](https://developers.openai.com/) - Codex、插件和 MCP 能力入口
- [Microsoft：在 WSL 中运行 Linux GUI 应用](https://learn.microsoft.com/en-us/windows/wsl/tutorials/gui-apps) - WSL2/WSLg 要求与排查
- [Playwright：Browsers](https://playwright.dev/docs/browsers) - Chromium、系统依赖、代理和下载配置

清理 Codex 注册项时运行：

```bash
codex mcp remove web-automation
```

该命令只移除 Codex MCP 配置，不会删除浏览器 profile 或登录状态。
