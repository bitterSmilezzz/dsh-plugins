# dsh-model-selector — QA 工作区

`agent-qa` 真机用例 + 不依赖 LLM 的硬 DOM 断言，针对 `dsh-model-selector` 0.1.7。
放这里（而不是插件仓）是因为 agent-qa 会在 config 同目录写 `cache/`、`agent-qa-memory/`，
这些不该进发布到 DSH-Store 的包。

## 装

```
npm install --noproxy '*' --proxy "" --https-proxy ""
```

本机 npm 走全局代理会 `ECONNRESET`，必须绕开；装完一律用 `npx --no-install`，
否则会静默回落到 `~/.npm/_npx/<hash>` 里的旧版 CLI。

## 浏览器

agent-qa 依赖 `playwright-core@1.59.1`，它钉的是 chromium **build 1217**（Chrome for Testing 147.0.7727.15）。
`agent-qa install-browsers` 可能卡死（在 `__dirlock` 上等几个小时只落几百 KB）。判断方法是看缓存目录大小：

```
du -sh ~/Library/Caches/ms-playwright/chromium-1217     # 完整约 340M，坏的话只有几百 K
```

坏了就直接自举（mac 路径；Windows 换成 `%LOCALAPPDATA%\ms-playwright\`，
文件名 `mac-arm64` → `win64` —— **Windows 这条路未实测**）：

```
curl -L -o /tmp/cft.zip https://cdn.playwright.dev/builds/cft/147.0.7727.15/mac-arm64/chrome-mac-arm64.zip
rm -rf ~/Library/Caches/ms-playwright/chromium-1217 ~/Library/Caches/ms-playwright/__dirlock
mkdir -p ~/Library/Caches/ms-playwright/chromium-1217
cd ~/Library/Caches/ms-playwright/chromium-1217 && unzip -q /tmp/cft.zip
```

headless 模式还要 `chrome-headless-shell-mac-arm64.zip`（同目录、同版本），解到
`chromium_headless_shell-1217/`。

## LLM

每条用例的每一步都是「截图 + 强制 tool_choice」判定，所以模型必须**同时**满足：能吃图、
且允许 `tool_choice: required/object`。用 `node checks/model-sweep.mjs` 可以对一个端点全量扫这两条。

OpenCode Go（`https://opencode.ai/zen/go/v1`）实测：**`qwen3.8-flash` 不能用**——它看图正常，
但 thinking 模式直接 400 拒绝 forced tool_choice，agent-qa planner 第一步就挂。
可用：`qwen3.7-plus`（3.7s，当前选用）、`qwen3.6-plus`、`qwen3.5-plus`、`qwen3.8-max`、`kimi-k3`、`longcat-2.0`。
`hy4-preview` 两条都过但 `auth test` 会 abort。

凭据自己存：`npx --no-install agent-qa auth set "<key>" --config qwen-go --type api-key`。
想换 Claude 订阅就把 `use.llm` 改成 `default` 再 `auth login --config default`。

## 指向被测实例

`dsh --profile web --no-open` 启动时打印的 URL 带一次性 token，**不落盘**；裸 `http://127.0.0.1:3080/` 返回 401。
agent-qa 的 config 没有 env 插值，`agent-qa.local.yaml` 也只覆盖 devices/apps/providers，
所以带 token 的 URL 必须写进 `registry.targets.dsh-web.url`（或先访问一次，用
`agent-qa auth-state capture --target dsh-web --name token` 存 cookie）。

注意：跑用例会真的点选模型，**会改掉该 profile 当前会话的模型选择**。

## 跑

```
npx --no-install agent-qa doctor
npx --no-install agent-qa run tests/web/*.yaml --headless
```

单条约 2–3 分钟，8 条约 20 分钟。

## checks/

| 脚本 | 干什么 | 需要 LLM |
|---|---|---|
| `dom-probe.mjs` | 打开座位菜单，硬断言 role 嵌套、`aria-checked` 唯一、选中行底色与兄弟不同、滑杆读数可见、供应商标 10px<12px、菜单不出视口、推理徽章带非空 title、短视口下菜单仍在视口内且列表可滚动、console 无错 | 否 |
| `toast-probe.mjs` | 点击推理模型行后 50ms 采样 body 4.2s，硬断言官方 Toast（`body > [role=alert]`）确实弹出——补 agent-qa LLM 判定太慢抓不到的瞬时窗口 | 否 |
| `axe-probe.mjs` | axe-core 跑整页，菜单开/关两种状态，输出违规规则 + 节点 | 否 |
| `model-sweep.mjs` | 扫某端点全部模型的「图 + required tool_choice」能力 | 否 |

LLM 判定盲区与探针分工：toast 是「hold 3s + fade 1s」的瞬时元素，agent-qa 每步截图+LLM 分析要 30–90s，必然错过——归 `toast-probe.mjs`；推理徽章的原生 `title` 在 headless 截图与 ARIA 树里都不可见，归 `dom-probe.mjs` 断言属性；短视口滚动钳位需要改视口尺寸、agent-qa 没有 resize 工具，也归 `dom-probe.mjs`。三条 agent-qa 用例（10/50/60）只覆盖 judge 能验证的持久交互流。

`services.accessibility.failOnViolation: true` 会因每一步后的 axe 结果直接判步骤失败。
唯一关掉的是 `scrollable-region-focusable`——那是官方工具详情面板（hash 类名 `_2ctAZa_body`）自己的
serious 违规，不归我们改，写死 hash 类名进 exclude 又太脆；我们自己那片由 `axe-probe.mjs` 单独盯。
