# Web Automation MCP 测试计划

> Status: Draft  
> Target: V0.1 / Post-Fix Validation  
> Date: 2026-08-09

## 1. 目的

本测试计划用于验证 `web-automation-mcp` 在真实 ChatGPT Web 环境中的可靠性，重点覆盖：

- 回答是否完整；
- 回答完成后是否能及时返回；
- 长时间生成是否会被错误判定为超时；
- 同一会话连续提问是否可靠；
- 新会话创建、旧会话继续和会话切换是否可靠；
- 文件上传能力是否可靠；
- ChatGPT 页面发生变化时是否能够稳定退化；
- 验证过程本身是否会制造过多 ChatGPT 会话或过高请求频率。

本计划特别规定：

> **请求数量与会话数量必须分离。**

测试可以产生较多请求样本，但不得默认采用“一次请求创建一个新会话”的方式。

## 2. 核心原则

### 2.1 关注点分离

测试分为以下独立关注点：

```text
MCP 协议
    ↓
Completion 完成检测
    ↓
Response Reliability
    ↓
Conversation Lifecycle
    ↓
Attachments
    ↓
Stress / Recovery
```

一个测试失败时，应能够明确判断失败属于哪个层次。

不得为了验证附件能力重复运行完整 30-request completion matrix。

不得为了验证新会话能力让普通回答可靠性测试全部创建新会话。

### 2.2 会话是昂贵资源

真实 ChatGPT 会话视为有限资源。

默认约束：

```text
30 requests
!=
30 conversations
```

Full Validation 要求：

```text
totalRequests = 30
conversationsCreated <= 8
```

除专门测试新会话生命周期外，同一测试类别应优先复用已有 conversation。

### 2.3 串行执行

真实 ChatGPT 验证默认：

```text
concurrency = 1
```

禁止同时向同一个浏览器 profile 发起多个 ChatGPT 请求。

一个请求必须完成、返回并进入稳定状态后，才允许发送下一个请求。

### 2.4 控制请求频率

默认真实验证请求间隔建议：

```text
2000-5000 ms
```

初始推荐：

```text
3000 ms
```

该间隔指：

```text
上一个请求完成
-> MCP 返回结果
-> cooldown
-> 下一个请求
```

长回答本身持续时间较长，不需要额外人为延迟。

如果 ChatGPT 出现明显的频率限制、异常提示或安全验证，不应继续高频发送请求。

## 3. 测试等级

### 3.1 Quick Validation

用于日常开发和小范围修改。

目标：

```text
requests <= 12
conversations <= 4
```

重点验证：

- 基本 ask；
- fast completion；
- fallback completion；
- 一次 multi-turn；
- 一次 long response；
- marker 完整性。

Quick Validation 不作为最终 V0.1 可靠性验收结果。

### 3.2 Full Validation

用于：

- completion 机制修改；
- provider adapter 修改；
- ChatGPT selector 修改；
- browser lifecycle 修改；
- 发布前验证；
- V0.1 milestone 验收。

要求：

```text
requests = 30
conversationsCreated <= 8
concurrency = 1
successRate >= 95%
```

30 个样本至少：

```text
29 / 30 SUCCESS
```

### 3.3 Stress Validation

Stress Validation 默认不自动执行。

仅用于专门验证：

- 长时间回答；
- 页面长期运行；
- 大量连续请求；
- browser restart；
- profile persistence；
- selector drift；
- recovery；
- shared CDP 长时间稳定性。

Stress Validation 的结果不得与普通 Full Validation 成功率混在一起。

## 4. Full Validation 会话模型

Full Validation 使用以下推荐矩阵。

| Category | Requests | New Conversations | Strategy |
|---|---:|---:|---|
| short | 5 | 1 | 5 次请求复用同一会话 |
| code | 5 | 1 | 5 次请求复用同一会话 |
| long | 5 | 1 | 5 次请求复用同一会话 |
| slow | 5 | 1 | 5 次请求复用同一会话 |
| multi-turn | 5 | 1 | 完整连续对话 |
| new-chat isolation | 3 | 3 | 每次独立新会话 |
| resume / switch | 2 | 0 | 复用前面已有会话 |
| **Total** | **30** | **8** | |

因此：

```text
30 requests
8 conversations maximum
```

而不是：

```text
30 requests
30 conversations
```

## 5. Conversation Alias

测试报告不得记录真实 ChatGPT conversation ID。

运行时为会话分配临时 alias：

```text
C1
C2
C3
...
C8
```

例如：

```text
short_1 -> C1
short_2 -> C1
short_3 -> C1

code_1 -> C2
code_2 -> C2
```

这样既可以分析会话复用行为，又不会把真实 conversation ID 写入日志。

## 6. Completion 专项测试

Completion 测试主要验证：

```text
提交请求
↓
检测生成开始
↓
观察语义进度
↓
检测生成结束
↓
settle
↓
立即返回最终结果
```

### 6.1 Fast Path

建议：

```text
5 samples
```

验收：

```text
requiredFastSamples >= 4
fast-path rate >= 80%
fast-path p95 latency <= 1000 ms
```

P95 只计算：

```text
completionPath = fast
```

的样本。

Fallback latency 必须单独统计。

### 6.2 Fallback Path

Fallback 是正常的安全退化路径，不应自动视为失败。

报告必须记录：

```text
fastSamples
fallbackSamples
fallbackRate
fastP95LatencyMs
fastMaxLatencyMs
fallbackAverageLatencyMs
```

如果 fallback 比例异常升高，应作为 provider semantic signal 可能失效的诊断信号。

### 6.3 Unknown Generation State

测试必须验证：

```text
true
false
unknown
```

三态行为。

如果 Stop / generation control selector 无法可靠判断：

```text
不得：
unknown -> false
```

必须保持：

```text
unknown
```

并走更加保守的 completion 策略。

## 7. 长回答测试

### 7.1 总生成时间

回答总时间允许超过：

```text
120 seconds
```

只要 response semantic state 仍然持续进展，就不得因为总时间超过两分钟而失败。

### 7.2 Semantic Idle

默认：

```text
idleTimeout ~= 120 seconds
absoluteTimeout ~= 10 minutes
```

测试至少覆盖：

```text
response text progress
-> 90 秒无新文本
-> 再次继续生成
-> 正常完成
```

该场景不得被判为：

```text
GENERATION_STALLED
```

## 8. Completion Marker 测试

每个 validation request 使用唯一 marker。

成功条件不是：

```text
response.includes(marker)
```

而是：

```text
marker exactly once
AND
marker is the final non-empty line
AND
response ends after marker
```

以下情况必须失败：

```text
marker
后面还有回答内容
```

以及：

```text
marker
...
marker
```

应分类为：

```text
INCOMPLETE_RESPONSE
```

或对应 validation failure。

## 9. Conversation Lifecycle 测试

Conversation 测试与 Completion 测试分离。

### 9.1 Continue

验证：

```text
Ask 1
 ↓
conversation C5
 ↓
Ask 2
 ↓
same C5
 ↓
Ask 3
```

后续回答必须能够正确使用前文上下文。

### 9.2 New Chat Isolation

只创建少量独立新会话。

推荐：

```text
3 samples
```

验证：

```text
C6
C7
C8
```

之间上下文不泄漏。

不再使用 5-30 个新会话来间接测试普通 completion。

### 9.3 Resume Conversation

从已有 conversation 返回后重新继续：

```text
C1
 ↓
切到 C2
 ↓
重新打开 C1
 ↓
继续提问
```

应验证：

- conversation 可以重新定位；
- previous context 保留；
- 新回答能够正常完成；
- completion detector 不受切换动作影响。

### 9.4 Conversation Switching

至少验证：

```text
C1 -> C2 -> C1
```

而不是只测试：

```text
C1 -> C1 -> C1
```

这样可以发现 active conversation 状态泄漏问题。

## 10. Attachment 测试

Attachment Validation 必须作为独立关注点运行。

测试包括：

```text
1 x text file
1 x multiple files
1 x PDF 或 image（可选）
```

附件测试不应该为了执行 2-3 个上传测试，再重新执行一次完整 30-request matrix。

因此建议提供独立入口：

```text
npm run validate:attachments
```

或者：

```text
npm run validate:live -- --attachments-only
```

当前 `--skip-attachments` 可以把附件从 reliability matrix 中移除；后续应增加反向的 `--attachments-only` 能力。

## 11. 推荐执行流程

### Phase 0 - Static / CI

不访问真实 ChatGPT：

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run mcp:smoke
```

全部通过后才能进行真实浏览器测试。

### Phase 1 - Authentication / Persistence

执行：

```bash
npm run verify:persistence -- default
```

要求：

```text
AUTHENTICATED
```

失败则停止。

不得继续发送 validation prompts。

### Phase 2 - Quick Completion

先执行少量 completion 样本。

目标：

```text
5 fast samples
1 long/fallback-oriented sample
```

建议：

```text
requests <= 6
conversations <= 2
```

如果这里已经暴露 completion bug，不执行 Full Validation，先修复根因。

### Phase 3 - Full 30-Request Reliability

只有 Phase 2 通过后执行。

目标：

```text
requests = 30
conversationsCreated <= 8
success >= 29
```

执行过程中禁止并发。

推荐：

```text
delayMs = 3000
```

### Phase 4 - Conversation Lifecycle

如果 Full Validation 已经覆盖：

```text
multi-turn
new-chat isolation
resume
switch
```

则无需额外创建大量会话。

只对失败场景做针对性复测。

### Phase 5 - Attachments

独立运行附件验证。

不要重新跑 30-request matrix。

### Phase 6 - Shared CDP

只有 persistent-profile 路径稳定后，再执行 shared-CDP 验证。

两种模式分别出报告：

```text
persistent_profile
shared_cdp
```

结果不得混合计算。

## 12. 提前停止条件

为了避免异常情况下持续向 ChatGPT 高频发送请求，出现以下情况应停止当前 suite：

```text
AUTH_REQUIRED
PROFILE_BUSY
PROVIDER_CHANGED
连续 completion failure
明显 provider rate-limit / verification UI
browser session lost
```

建议规则：

```text
2 consecutive infrastructure/provider failures
-> abort suite
```

普通单个 validation case 的内容失败不一定立即停止。

## 13. Failure Classification

至少分别统计：

```text
RESPONSE_START_TIMEOUT
GENERATION_STALLED
GENERATION_TIMEOUT
INCOMPLETE_RESPONSE
TARGET_NOT_FOUND
PROVIDER_CHANGED
PROVIDER_UNAVAILABLE
AUTH_REQUIRED
PROFILE_BUSY
EXTRACTION_FAILED
```

未来如果可以可靠识别 ChatGPT 的限频状态，建议新增独立错误：

```text
PROVIDER_THROTTLED
```

不得把 provider 限频误判为 completion detector failure。

## 14. Report Schema

真实验证报告至少包含：

```text
suite
commitSha
mode

totalRequests
successfulRequests
incompleteRequests
failedRequests
successRate

conversationsCreated
conversationsReused
maxRequestsPerConversation

conversationAliases

fastSamples
fallbackSamples
fastP95LatencyMs
fastMaxLatencyMs

averageCompletionLatencyMs
maxCompletionLatencyMs

longResponseWaitMs

responseStartTimeouts
generationStalls
generationTimeouts
incompleteResponses

failureCodes

aborted
abortReason
```

不得记录：

```text
prompt text
response text
cookie
token
raw DOM
real conversation ID
absolute workspace path
browser profile contents
```

## 15. Sanitized Result

原始报告继续保存在：

```text
mcp-output/validation/
```

并保持 `.gitignore`。

GitHub 只提交脱敏摘要，例如：

```text
docs/validation-results/2026-08-09-post-fix.md
```

摘要至少记录：

```text
commit SHA
suite
browser mode

30/30 or 29/30
success rate

requests
conversations created
conversation reuse ratio

fast/fallback ratio
fast p95
fast max

long response result

failure distribution

是否达到 acceptance gate

发现的新 bug
```

## 16. Acceptance Gates

### Gate A - Static

必须全部通过：

```text
typecheck
lint
unit tests
build
MCP smoke
```

### Gate B - Completion

要求：

```text
fast-path >= 80%
fast-path p95 <= 1000 ms
marker truncation = 0
```

长回答：

```text
持续 semantic progress 时不得因旧 2 分钟总超时失败
```

### Gate C - Reliability

要求：

```text
successRate >= 95%
```

30 次测试至少：

```text
29 / 30
```

### Gate D - Conversation Resource

要求：

```text
30 requests
conversationsCreated <= 8
```

如果成功率达到 95%，但创建了超过 8 个会话：

```text
Reliability PASS
Resource Efficiency FAIL
```

两者必须分别报告。

### Gate E - Safety

必须满足：

```text
no secrets committed
no raw response committed
no raw DOM committed
no browser profile committed
no absolute workspace path committed
```

## 17. 日常开发策略

普通代码修改不应每次执行完整 30-request suite。

推荐：

```text
普通修改
-> Unit / CI

Completion 修改
-> Quick Validation

Completion / Browser / Provider 重大修改
-> Quick
-> Full

Release / Milestone
-> Full
-> Attachments
-> Shared CDP
```

这样可以避免：

```text
每修改一点代码
-> 30 个 ChatGPT 请求
-> 大量新会话
-> provider 提示频繁
-> 验证结果被限频污染
```

## 18. 最终目标

最终测试体系应达到：

```text
少量真实会话
        +
足够请求样本
        +
关注点分离
        +
可重复
        +
可审计
        +
不会泄漏用户数据
```

推荐稳定目标：

```text
Quick:
  <= 12 requests
  <= 4 conversations

Full:
  30 requests
  <= 8 conversations
  >= 95% success

Attachments:
  2-3 requests
  独立运行

Stress:
  手动按需运行
```

核心原则：

> **不要通过制造大量 ChatGPT 会话来获得可靠性样本。**

真正需要统计的是请求、完成状态和生命周期行为，而不是新会话数量。
