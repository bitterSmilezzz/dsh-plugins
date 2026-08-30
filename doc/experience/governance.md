# 治理 / 决策 / 记录（106 条）
- **账号下 11 仓收编/归档定案 + 校验器两处假阳性修（2026-08-30，治理/契约）**：
问题=用户要求"dsh 正常 + 我们 GitHub 账号下所有插件都能用且符合伞仓库契约，与最新版官方功能重叠的就归档"。先盘账号：11 仓（5 在用 + dsh-plugins 伞 + dsh-ui-tweaks + dsh-email + dsh-skills + DSH-Transparent-UI-Plugin + dsh-wallpaper-engine），而 `scripts/manifest.json` 只登记 5 仓 → 其余完全不过 19 项门禁。
原因=重叠判定不能有主观成分；且 `validate-plugin.mjs` 自身有假阳性，会把合规仓库误判 FAIL。
解法=①**重叠按官方 223 个已装包实测**：`grep` 证据显示 alpha.2 无桌面通知、无 ASR/语音、无快捷键/hotkey 包、三个 settings-* UI 包 `retryPolicy` 命中全 0（官方只有 `dsh-llm-retry` 机制、无批量设置面）、无 email/imap/wallpaper 包 → notify / asr-voice / shortcuts / retry-settings / email **均非重叠**；唯 `dsh-client-ui-model-selection` 同时含 `group`(36) 与 `effort`(49) 但 `search`/`slider`/`range` 全 0 → model-selector 判为**部分重叠**（差异化价值=400+ 模型搜索与滑杆），保留；②**dsh-ui-tweaks 双删**（用户点名）：它是拆分前的合并包、profile 三处引用实测为 0，先 `git fetch --unshallow` 取全史（48 commits + tag v0.1.0）→ `git bundle` → 从 bundle clone 回来比对 HEAD 逐字一致 → `rm -rf` 本地 + `gh api -X DELETE` 远端（复核 API 404 与 `ls-remote` Repository not found）；③**删前必修依赖**：`dsh-asr-voice/scripts/build.sh` 的依赖树解析链第 4 顺位是 `../dsh-ui-tweaks/node_modules`，且第 1–3 顺位（`DSH_CHECKOUT`/`DSH_HOME`/`~/.dsh/source/current`）在本机全部不存在——不先改成"首选本插件自有 node_modules"就直接把该仓构建打死；④无 git 历史的 computer-use / skin-runtime 与退役的 skills / wallpaper-engine / Aqua 走 tar 归档（含 `.git`）+ 移 `~/dsh-quarantine-20260830/`，**远端一律保留**；⑤`validate-plugin.mjs` 修两处假阳性：`entry.unique` 把 cordis.patch.yml 的 YAML 注释示例 `- id: xxx` 计成真实条目；`tools.count` 对 `src/`+`lib/` 双扫把真实 7 工具报成 14、把「4–10 需专项评审」的 WARN 误升级成「>10 必须拆分」的 FAIL。实测 dsh-email 由 17/19(2 FAIL) → 18/19(0 FAIL、剩正确 WARN)，5 个在用插件仍 19/19。⑥dsh-email（保留）补齐准入：README 加「权限与依赖披露」= 权限等级 **high**（邮箱凭据 + 出站连接所配置 IMAP/SMTP）、外部依赖表、**生命周期脚本 prepare=tsc / prepublishOnly=build 显式列出**、7 工具专项评审结论、标题改「中文名（English Name）」、实测测试数 44 更正为 56。
坑=①**fork 进自有账号不等于可随意改发布模型**：dsh-email 是 `STARDUSTLC666` 的 fork、README 徽章仍指向上游，为 GitHub 固定源而把 `lib/` 入库属"本地适配版"改动，推远端必须单独确认；②无 git 历史的仓库**不能 bundle**，只能 tar，且排除规则要精准——第一次把 skin-runtime 的 `build/`（601 行构建 helper）连同 Swift 产物一起排掉了，重做才补回；③"归档 / 移出工作区 / 销毁远端"是三件事，默认只做前两件，销毁要逐仓点名；④GitHub 归档 tar 是**按 tag 现生成的**，判"固定源是否真可安装"必须 `codeload` 拉下来数 `lib/` 文件数——asr-voice v0.1.3 实测为 **0**（`lib/` 被 gitignore），而本地 `link:` 安装让这个坑完全不可见；⑤伞契约禁止安装期构建脚本，所以"产物不入库"直接等于不可分发，不是体积优化项。
验证=`gh api` 404 + `git ls-remote` not found；bundle 可从本地 clone 恢复且 HEAD 一致；三处 tar/bundle 文件数与体积逐仓记录；`validate-all` 5×19 全绿 + email 18/19；`codeload` 复核两个新 tag。可复现?是。



- **M7 收尾实证：合并包固定源 + 双通道 E2E 验证（2026-08-26，治理/验证）**：问题=合并包此前仅「建成热装」证据，固定源（git/commit/tag）、validate 全绿、端到端双路径验证未实际落地——计划文档先行标记完成与仓库真实状态脱节（.git 实际未初始化）。原因=①verifier 早期按**假设的流块形状**解析：pi-ai 真实形状是 `text-delta`/`block-end`/`usage`/`finish`（无 `delta` 类块，`finish.reason.kind='stop'` 是正常终态），误把 stop 判失败、漏计 text-delta → 0 文本假失败（桥实际回 "PONG"）。解法=①`git init` + 初始 commit（12 文件，含 bin/*.exe、scripts/verify-e2e.mjs）+ `v0.1.0` tag，HEAD=`5ea19f72…`（40 位 hex 与 manifest 0.1.0 对齐）；.gitignore=node_modules/lib/*.tgz/*.log/*.tsbuildinfo/.dsh；②`validate-plugin.mjs ../dsh-subscription-relay` = **19/19 PASS 0 WARN 0 FAIL**（与归档两插件 M5 齐平）；③verify-e2e.mjs 按真实形状解析（deltas=text-delta|delta|block-end、block-end 全文优先去重、complete|stop 皆 OK、仅 failure kind 为 FAIL）——合成 id `workbuddy/glm-5.2` 双路径（`ctx.llm.prepareCall().stream` 与直接 `ctx.llm.stream`）均 **E2E PASS** 回 "PONG"；④trae 通道同 id 以 `TRANSPORT: Stream ended without finish_reason` 干净收尾 exit 1（上游无健康账号的预期失败，relay 透传不挂死）；⑤README 补「外部依赖」表过 readme.complete。坑=①任务标「完成」前核对真实仓库态（.git/tag 存在性）；②验证解析器按真实协议写，不按假设块类型过滤；③验收判据按通道区分——wb 必须真回复、trae 是干净失败即可；④合成 id 双形（回显 harness 复合 / 上游裸 id）两通道都要走合成 id 才算覆盖真链路。可复现?是（`node scripts/verify-e2e.mjs --channel workbuddy --model glm-5.2` → PASS；`--channel trae` → FAIL exit 1；validate-plugin.mjs → 19/19）。
- **M7 登记+退役：dsh-workbuddy/dsh-trae 退役，合并包 dsh-subscription-relay 入账（2026-08-26，治理/登记）**：问题=两插件合并后，总账与登记表如何反映（旧二行 vs 新一行）。解法=①本地私有插件仍**不进** scripts/manifest.json（沿用 M5 边界：无公开 GitHub 仓库 → CI clone 必失败自动开 Issue）；②登记落地=方案文档「订阅 Provider 总账」第 3/4 行 provider 改指 `@dsh-external/dsh-subscription-relay`，「通用入口」补「由合并插件统一注册、设置页『订阅中转』统一维护」；③旧两插件源码目录（D:\workspace\deepseek-harness\dsh-workbuddy / dsh-trae）保留为归档，不再装配；④新包走同五件套=validate-plugin.mjs 本地全绿 + git init/commit/v0.1.0 tag（固定源）+ README 权限披露 high + 中文名「订阅中转」+ searchTerms。坑=①provider 唯一注册是合并验收关键：旧插件 loader entry 必须卸净（dev_plugin_status 只剩新包）；②总账行更新别漏「通用入口」描述，否则文档与运行态不一致。验证=总账 3/4 行已改指合并包并注明统一设置入口；validate-plugin 通过；HEAD 40 位 hex、tag v0.1.0。可复现?是（给 manifest.json 加本地插件行必 clone 失败；总账不改则与运行态不符）。
- **伞仓库 CI 登记边界：manifest.json 只收公开 GitHub 仓库，本地私有插件走「本地校验+文档登记」（2026-08-26，治理/登记）**：问题=M5 收尾要把 dsh-workbuddy / dsh-trae 两个自建本地插件「登记」进伞仓库——直接往 scripts/manifest.json 加行？原因=validate-plugins.yml 对清单每项执行 `git clone https://github.com/<owner>/<repo>`；本地插件无公开仓库，加进清单必 clone 失败并触发自动开/更新 GitHub Issue（cron 每 8 小时）。解法=①本地私有插件**不进** manifest.json（避免 CI 噪音）；②登记落地=validate-plugin.mjs 本地全绿（两插件 19/19 PASS）+ 本地 git 仓库满足固定源（git init + 初始 commit + `v0.1.0` tag，HEAD 40 位 hex 与 version 对齐）+ 方案文档「订阅 Provider 总账」登记表 + 本文档留决策记录；③将来任一插件推了公开 GitHub 仓库后，在 manifest.json 加 `{id, repo}` 一行即自动纳入 CI 校验。验证=本地校验两插件 19/19、HEAD 均为 40 位 hex、tag v0.1.0。可复现?是（给 manifest.json 加无公开仓库条目，CI 必 clone 失败开 Issue）。

- **dsh-workbuddy / dsh-trae DSH-Store 准入规则逐条自查（2026-08-26，治理/自查）**：问题=M5 验收要求「DSH-Store 准入规则自查通过」；两插件为本地私有自用（private:true）不实际提交商城，但按 AGENTS.md「DSH-Store 准入契约」逐条对照。结果=可静态化条目全满足：①固定源=本地 git 40 位 commit + tag（公开 GitHub 分发留待用户决定公开）；manifest 一致=version 0.1.0 = tag v0.1.0；②入口唯一=patch 各 1 个 entry id（未禁用/遮蔽/重复任何 @deepseek-ai/* 官方组件）；③命名空间=@dsh-external/* 合规；④生命周期脚本=无（README 明示「无」）；⑤权限保守披露=README 权限表 权限等级 **high**（凭证 auths/0600 + 子进程 + 网络），文件=插件私有 dataDir，网络=127.0.0.1 + 上游厂商 API，全数列明；⑥README 完整=中文名（English Name）+ description 中文用途 + searchTerms 中文搜索词 + 安装/启用/外部依赖/已知风险齐全；⑦可验证=一次性 Profile（web）注入安装 + 运行验收证据齐备（/v1/models 13 模型、chat 200、status 路由 modelCount 13、签到调度、kill 崩溃自愈、卸载即净）；⑧不适用项=validate:registry 属商城侧工具（build-dsh-plugin/catalog.json / dshOperations 证据），未上架不适用；「无证据写 unknown」规则无触发。结论=自检通过；将来公开上架前补公开仓库并走商城提交即可。可复现?是（对照 AGENTS.md 准入节逐条复检可得相同结论）。

- **dsh-plugins 重构：契约伞仓库 + 私有校验自动化（2026-08-24，治理/契约）**：问题=用户拍板伞仓库最终定位——所有新增插件的共同遵循仓库，承担新插件的校验与测试；经验踩坑按主题分类进 doc/；插件清单从本仓库完整移除；校验脚本按契约新增；并配 GitHub 自动化（只校验自有项目，可扩展）。解法=①**NOTES.md（4841 行/1032 条目）按主题拆分为 doc/experience/ 8 文件**（fixes/research/governance/install/architecture/performance/features/misc + README 索引），解析坑=正文里的字段子项（- **问题**/- **解法**/- **可复现** 等）不是独立条目，按前缀并入前一条目；分类标签 98 种太多，先映射标签再按标题关键词兜底，misc 保留 140 条历史短碎片；②**删除 plugins.json + 5 个清单依赖脚本**（install.sh/install-plugins/plugin-manifest/check-consistency/check-bundle-size），README 190→60 行，THIRD-PARTY.md + docs/ 归档进 doc/experience/misc.md；③**新增 scripts/validate-plugin.mjs**：按 AGENTS.md 契约逐条静态检查（manifest/patch/entry 唯一/不动官方组件/namespace/生命周期脚本/README/权限/固定 commit/inject），PASS/FAIL/WARN 三级，权限披露缺省为 WARN 不阻断；实测抓出 dsh-ui-tweaks 禁用官方 entry（ui-settings-plugin-inventory）= 邮件 SUBMISSION_ENTRY_PROTECTED 根因，verify 脚本有效；④**私有清单 scripts/manifest.json**（5 个自研插件，不进 README），新增插件加一行即纳入；⑤**.github/workflows/validate-plugins.yml**：cron 每 8 小时 + push 清单触发，逐个 clone 校验，失败自动开/更新 GitHub Issue（label validate-plugin），通过自动关；ci.yml 重写为脚本自检 + dry-run。坑=①bash 管道会吞 node 退出码（tail 覆盖），验证 exit code 要单独跑；②GitHub Actions 里 node 内联脚本读 GITHUB_OUTPUT 传退出码，不能用常规 exit；③字段子项前缀匹配要覆盖「解法（commit xxx）」变体。验证=validate-plugin 对 web-search-free 14/15 通过、ui-tweaks 13/15 失败 1（exit=1）；全仓 grep 无 plugins.json/NOTES.md 残留（AGENTS 的 docs/proposals 是 dsh-std 契约原文术语非本仓引用）。可复现?是（validate-plugin.mjs 对 ui-tweaks 稳定 FAIL）。

- **伞仓库契约元属性定案：版本无关（2026-08-24，治理/契约）**：问题=用户明确「这个仓库的这套契约是版本无关的」——契约不绑定任何 DSH 版本号，随官方契约演进另行评估，不因版本变更自动失效。解法=AGENTS.md 定位句补一句「**本契约版本无关**：不绑定任何 DSH 版本号，随官方契约演进另行评估，不因版本变更自动失效」；呼应此前删除全部版本号（rc.6/rc.7/rc.5/0.1.1-rc.1）的决定。坑=契约与实现版本解耦：校验脚本、契约文本都不写死版本，官方契约变化时人工评估而非自动失效。验证=git diff 仅定位句 +2 行。可复现?是。

- **dsh-plugins 定位升级：伞仓库 = 新增插件共同遵循仓库 + 校验测试基地（2026-08-24，治理/契约）**：问题=用户明确 dsh-plugins 不再只是纯汇总 meta-repo，而是所有新增插件的共同遵循仓库（伞仓库），并承担新插件的校验与测试。解法=①AGENTS.md 定位句改「所有新增插件的共同遵循仓库（伞仓库）：承载全部插件契约，并承担新插件的校验与测试」；②新增契约节「## 新插件校验与测试契约（⚑ 强制，伞仓库职责）」：新插件登记发布前须在本仓库通过既有校验与测试设施（scripts/ 下 check-consistency / check-bundle-size / web-regression 等）并对照全部契约逐条自检，未通过不得发布；③README 定位段同步为「插件伞仓库 + 校验测试」。坑=①校验测试设施是 scripts/ 既有脚本（check-consistency/check-bundle-size/web-regression），契约只引用不新建，避免过度设计；②README 定位与 AGENTS 定位必须同步，否则又制造文档矛盾（前几轮教训）。验证=git diff 仅 AGENTS 定位+1 契约节、README 定位段；契约节仍在「只承载契约」范围内。可复现?是。

- **伞仓库 AGENTS.md 二轮瘦身：只留四类契约（2026-08-24，治理/契约）**：问题=用户认为上轮重构仍不够精简，明确要求伞仓库 AGENTS.md 只承载契约（原本的 Pi 契约 + DSH 官方规则契约 + DSH-Store 准入契约 + dsh-std 协议契约），踩坑经验/历史记录/插件清单一律不要提及。解法=从 175 行压到 100 行：删「目录结构/本地仓库组织约定/第三方插件维护/写插件注意事项/设计理念/经验档案/脚本与治理」全部协调节（含提交纪律、inject 服务名坑、fork 治理原则），定位句去掉 plugins.json 提及；保留：顶部落档硬约束（NOTES 落档机制是契约性硬约束，保留）+ 四个契约节 + License。坑=①用户「只承载契约」的边界判断：落档硬约束虽提及 NOTES/踩坑，但它是伞仓库的强制工作契约，删掉会断 NOTES 档案机制，保留；②协调信息（清单/脚本/组织）由 README/NOTES/脚本自身承接，不重复。验证=grep 协调/历史/清单/踩坑关键词零命中，100 行，CLAUDE 软链正常。可复现?是。

- **伞仓库 AGENTS.md 瘦身重构：只留协调+契约（2026-08-24，治理/契约）**：问题=用户指出 AGENTS.md 自相矛盾（版本号 rc.6/rc.7 冲突、harness 源码存在性冲突、自研 bundle 数量对不上、清单归属矛盾），并给出 5 条指示：①不要涉及版本号；②历史都不要、伞仓库与 harness 无关；③自研 bundle 清单放 README、AGENTS 只做协调和契约；④AGENTS 里不放插件清单；⑤历史都去掉。解法=全量重写 AGENTS.md（266 行→175 行）：删「仓库概况」（历史演进+插件清单，清单 README/plugins.json 已完整承接）、删「参照项目与文档」（版本号+harness+官方 GitHub）、删「踩坑长期规则」历史条目（settings.yaml/retry/模型兼容等，NOTES 档案已有）、删第三方维护的具体仓库例子（只留 fork 治理原则）；保留并重组：目录结构/本地组织（去 harness 与历史存档）/写插件注意事项（并入 inject 服务名坑）/设计理念/Pi 契约/DSH 官方规则契约（去 rc.6 与 npm 包产物路径）/DSH-Store 准入契约/dsh-std 协议契约/脚本与治理（并入提交纪律）。坑=①README 的插件清单与 plugins.json 8 条一致，清单迁移零新增；②CLAUDE.md 软链指向 AGENTS.md 无需动；③残留检查 grep 版本号/harness/历史关键词全零命中。验证=文件 175 行、grep 无残留、CLAUDE 软链正常、git diff 全量替换。可复现?是。

- **DSH Standard（dsh-std）协议契约并入伞仓库 AGENTS（2026-08-24，治理/契约）**：问题=用户要求把 https://github.com/Yan-Zero/dsh-std （DSH 生态通用互操作协议标准，@dsh-std/*，meta-protocol）的契约也放进伞仓库。解法=在其 AGENTS.md 提取 6 条核心契约（边界/meta-protocol 不吸收领域行为/adapter 隔离/协议变更必有 docs/proposals 提案/权威归规范与坐标/RFC 式规范语言 MUST-SHOULD/不写实现路线图/稳定文档路径/pnpm check+git diff --check）写入伞仓库 AGENTS.md 新增「### DSH Standard（dsh-std）协议契约（⚑ 强制，生态互操作标准）」节，标注权威原文链接+单源摘要；13 个插件仓库指针 AGENTS.md 已声明遵守伞仓库全部契约，无需改动自动生效。坑=①dsh-std 是第三方标准仓库（Yan-Zero 非 bitterSmilezzz），只取契约文本入库，不登记 plugins.json/不加本地副本；②dsh-std 契约约束的是「实现/扩展/贡献该协议时」的行为，与 DSH-Store 准入契约（上架门禁）适用时机不同，两节并列区分。验证=git diff 新增 1 节 20 行；13 仓库指针无需变更。可复现?是。

- **DSH-Store 准入契约铺开为伞仓库单源 + 插件仓库指针（2026-08-24，治理/契约）**：问题=用户收到 DSH-Store（AI-Scarlett/dsh-safe-plugin-manager）自动扫描通知，dsh-ui-tweaks 被拒（SUBMISSION_ENTRY_PROTECTED: Bundle Patch uses a protected DSH entry ID——cordis.patch.yml 里 disabled: true 禁用了官方 entry ui-settings-plugin-inventory，违反目录准入规则第 7 条「不禁用/替换/重复安装 @deepseek-ai/* 官方组件」）；用户认可该准入规则，要求作为契约铺到所有本地插件仓库。解法=①契约**单一来源**写入伞仓库 AGENTS.md 新增「### DSH-Store 准入契约（⚑ 强制，第三方商城上架门禁）」节（8 条：固定源发布/manifest 一致/入口唯一不动官方组件/命名空间合规/生命周期脚本透明/权限保守披露/README 完整/可验证 + 被拒即整改），明确「各插件仓库 AGENTS.md 只放指针不复制内容」；②13 个插件仓库（DeepSeek-Balance-Whale-Widget/dsh-code/dsh-computer-use/dsh-desktop-shell/dsh-file-preview/dsh-market/dsh-memory/dsh-skin-runtime/DSH-taskboard/DSH-Transparent-UI-Plugin/dsh-ui-tweaks/dsh-visualize/dsh-web-search-free）各写一份指针 AGENTS.md：遵守 ../dsh-plugins/AGENTS.md 根契约 + 必读要点索引。坑=①dsh-ui-tweaks 当前仍违反准入契约第 3 条（cordis.patch.yml 禁用 ui-settings-plugin-inventory），契约铺开后属已知违规项，需按「被拒即整改」处理（改 slot 注入叠加、去掉 disabled 补丁）——本次只铺契约未修插件，留待用户拍板；②NOTES.md 是 CRLF 行尾，prepend 必须按原行尾写。验证=13 仓库 AGENTS.md 全部落盘 + 伞仓库 git diff 30 行新增。可复现?是。

- **dsh-ui-aqua 存档恢复重装 + 按需登记回治理文档（2026-08-21，治理/恢复+安装）**：问题=用户问 aqua（DSH-Transparent-UI-Plugin）上游是否更新并要求重装，随后拍板登记口径=「改回来、按需非必装」；该插件 2026-08-20 已双删（本地目录+GitHub fork），唯一副本=伞目录 doc/archives bundle。对照=①上游核查：同步点 fa0cb1f→HEAD 27ebacb 仅 ahead 3 个 commit 且全是 README 文档改动（README.md +3 / README.zh.md +2，零代码零发版：tag 仍 v1.3.0、npm dsh-client-ui-aqua latest 仍 1.3.1），stars 267→355——从存档恢复严格优于跟上游重装；②本机 dsh 已升 0.1.1-rc.1，存档版 peer 只声明 ^0.1.0-rc.7。解法=①`git clone doc/archives/DSH-Transparent-UI-Plugin-2026-08-20.bundle DSH-Transparent-UI-Plugin` 恢复伞目录仓库（HEAD=7d831d6=上游 fa0cb1f+本地适配）；②web profile 里 `dsh plugin --profile web add <路径>` link 安装（dependencies + bundles 第 8 条）；③静态验证：node_modules 符号链接正常、`--dump-config` 出 ui-aqua 层（id/name 对齐）；④兼容预检：lib/client.js 实际只 require runtime/client + ui-primitives + react（rc.1 均在平台模块表），peer 警告不阻塞，浏览器实测留待重启后；⑤按需口径落地：**刻意不入 plugins.json plugins 数组**（install.sh --all / install-plugins.mjs 全量模式不会装它），THIRD-PARTY 表行去删除线改「已恢复·按需可选」+治理 bullet 重写、README 时间线/fork 表/按需安装示例/EN index 四处、AGENTS fork 清单与长期规则行两处、$comment 注明不入清单原因、伞目录 doc/README.md 布局表补回目录行+已删列表标注恢复。坑=①上游源码缺 `dsh.bundle.patch` 声明（npm 发布产物有、源码没有）→ GitHub 直装会当普通依赖不进 bundles——必须装本地适配版而非上游直装；②3080 端口的 dsh web 即本会话宿主进程，agent 不能自己杀，插件集合变化必须用户手动重启+硬刷新生效；③pnpm unsatisfied peers（rc.7 vs rc.1）只警告不阻塞安装。验证=check-consistency 全过（plugins 数组条数不变）、dump-config ui-aqua 层就位；浏览器渲染验证待用户重启后进行。可复现?是。

- **省钱插件系列计划取消 + dsh-usage-plugin 清仓收尾（2026-08-21，决策/清理）**：问题=用户提出「针对 DSH 省钱的各种插件」新项目计划（网页搜索多来源/上下文精简/token 优化/无 AI 脚本自动注入），侦察后产出完整计划 doc/plan-save-cost-plugins.md（P0=省钱配置预设+ctx-audit+tool-diet 砍工具 schema；P1=env-inject 确定性注入+budget-guard；复用官方 token-meter/compaction/pruner/session-stats/web-seam，不重复造轮子）。解法=用户拍板：**方案整体取消**——工具裁剪/上下文审计/预算门禁影响实际使用效果；真实花钱场景=多来源网页搜索（官方仅 deepseek provider，ctx.web 为 provider 注册架构），由另一会话开发中；计划文档保留为决策记录（防重复调研，标注⛔已取消）。同时确认 dsh-usage-plugin 一起清仓（此前 meta-repo 已清仓但 web profile 仍装着）：①`dsh plugin --profile web remove dsh-usage-plugin` 卸载（bundles 列表+dependencies+node_modules 全清，验证 grep 零残留）；②本地仓库 `dsh-usage-plugin/` 补 git bundle 存档（`--all` 含 v0.2.0 自研版 67f595b 全历史，787KB，README 声明但 archives 此前缺失，已对齐）；③rm -rf 本地目录；④doc/README.md 布局表标注已清仓。坑=①README 声明「历史已存档」但 archives 实际缺 bundle——清仓 commit 与本地操作不同步，归档必须当场验证文件存在；②dsh-usage/usage-records.json 与 boot log 是运行时数据非仓库内容，保留未删（用户可自行删除）；③卸载后 usage_stats 工具/用量面板/余额查询随插件消失，属用户已知预期。验证=profile package.json 无 usage 引用、bundles 6 条、node_modules 零残留；bundle verify 完整历史。可复现?是。

- **dsh-market/usage-plugin/visualize 卸载治理 + ui-tweaks 对比（2026-08-21，治理/清理+审计）**：问题=用户决策：usage-plugin 与 market 本地+GitHub 双删；better-sidebar、trace-compare 本地删（GitHub fork 已 404）；visualize **仅本地卸载、GitHub 仓库保留待验证**；ui-tweaks 保留并出详细对比（doc/dsh-ui-tweaks-vs-official-0.1.1-rc1.md）。解法=①git bundle 五仓全量存档 `doc/archives/*-2026-08-21.bundle`（usage-plugin 69KB / market 1.6MB / better-sidebar 3.7MB / trace-compare 4.5MB / visualize 57KB，恢复=clone bundle）；②`dsh plugin --profile web remove` 依次卸 visualize/usage-plugin/dshmarket（pnpm v11 本地完成，dump-config 零残留）；③profile cordis.patch.yml 清 dsh-visualize config 段与 oil-sticky-prompt 手插 insert（remove 会把 bundle 归一进 bundles 列表，oil-sticky-prompt 自带 dsh.bundle patch 自动挂载，insert 冗余）；④meta-repo 清仓 plugins.json（7 条）/README/AGENTS/THIRD-PARTY + NOTES 落档。坑=①**本机无 gh CLI、无 GITHUB_TOKEN、GCM 无 GitHub 凭据 → GitHub 仓库删除无法自动化**（NOTES 里「gh 已认证」是 macOS 机）；留待用户浏览器手动删或装 gh auth login；②node -e 里 PowerShell 对 `$` 转义会吞变量（`$comment` 变成 ``），长脚本写文件跑；③plugins.json 是 CRLF + 1 空格缩进，JSON.stringify(null,1)+replace CRLF 重写不破坏；④remove 会重写 bundles 列表（oil-sticky-prompt 被提升）。验证=check-consistency 重跑全过；bundle 恢复演练可复现。可复现?是。

- **dsh-trace-compare 本地+GitHub 双删（2026-08-20，治理/清理）**：问题=用户要求把 dsh-trace-compare 本地和远端都删掉（此前已从 web profile 卸载，见上一条）。对照=①本地 repo main=origin/main=0bc18bb + 10 个 tag（v0.1.0→v0.3.2），git 干净；②它是 bitterSmilezzz 对 lamost423/dsh-trace-compare 的 fork，非唯一副本（上游仍在）；③从未登记 plugins.json/README（第三方调研后本地 link 装，不入清单）。解法=①删前存档：`git bundle create <绝对路径>/doc/archives/dsh-trace-compare-2026-08-20.bundle --all` （含 main+全部 10 tag），恢复演练 `git clone bundle /tmp` 成功（HEAD=0bc18bb、tag 齐全）；②`rm -rf dsh-trace-compare/` 删本地；③`gh repo delete bitterSmilezzz/dsh-trace-compare --yes` 删 GitHub （gh 已认证 bitterSmilezzz、带 delete_repo scope），ls-remote 确认 404；④清仓：删 profile 的 `cordis.patch.yml.bak-trace-compare`/`package.json.bak-trace-compare` 两个备份、删 dsh-plugins/scripts/verify-trace-compare.mjs + `.trace-compare-shots/`、.gitignore 删 `.trace-compare-shots/` 行、doc/README.md 已删除列表补 trace-compare。**坑**=①gh 删除即刻不可逆，必须先本地存档再删（bundle 是删除后唯一本地副本，GitHub 删了就只剩它）；②`git bundle verify` 在非 git 仓库的伞目录报 "need a repository to verify"，用 list-heads + clone 验证；③trace-compare 从未入 plugins.json，无需动清单。**验证**=bundle list-heads 含 main+10 tag、恢复演练成功；ls-remote 404 确认远端已删；全仓 grep 仅剩历史/归档语境引用（NOTES/doc-README/bundle）；dump-config 依旧 clean（先前已卸载）。可复现?是（gh repo delete 幂等结果=404；bundle 恢复可复现）。

- **dsh-model-fix 归档（2026-08-20，治理/清理）**：问题=用户要求把 dsh-model-fix（muse-spark-1.2 流式收尾修复，host-only bundle，2026-08-19 新建）归档。对照=①自研 first-party 独立仓库 （bitterSmilezzz/dsh-model-fix，main+dev 双分支，git 干净），web profile 用 link 协议装着（仅 web 有），plugins.json 有登记、README 有目录行；②settings.yaml 无配置段、scripts/external 无引用、AGENTS/THIRD-PARTY 无 model-fix 字面（无需改）。解法=①`git bundle create <绝对路径>/doc/archives/dsh-model-fix-2026-08-20.bundle --all` 全量存档（main 1bb39a4 + dev ad18355），恢复演练 `git clone bundle /tmp` 成功（bundle 克隆默认 checkout dev，main 变 remotes/origin/main，refs 齐全可恢复）；②`dsh plugin --profile web remove dsh-model-fix` 卸载 + 手动删 node_modules 残留 link 符号链接；③plugins.json 删 1 条（10→9）+ $comment 补归档注记；④README 目录 blockquote/自研表/架构演进/EN index/安装计数（自研 5→4 bundle）全量清仓；⑤伞目录 doc/README.md 已删除列表补 dsh-model-fix + bundle 路径。**坑**=①bundle 输出路径相对 CWD，必须传绝对路径（沿用 aqua 任务经验）；②pnpm remove 后 node_modules 的 link 协议符号链接残留（与 trace-compare 卸载同款坑），需手动 rm；③NOTES.md 是 CRLF 行尾，prepend 必须按原行尾写（沿用经验）。**验证**=plugins.json 解析 9 条 + `scripts/check-consistency.mjs` 全过；dump-config 无 model-fix、exit 0；package.json/lock 无 model-fix；bundle 恢复演练成功。可复现?是（bundle 恢复、一致性脚本、dump-config 均幂等可复现）。后续定案（同日）：本地仓库 `dsh-model-fix/` 已 rm -rf 删除（删除前确认 GitHub 端 main/dev 均已 push、外部零引用、bundle 已存档），GitHub 远程保留不删（归档在远端）；恢复来源=GitHub 或 `doc/archives/dsh-model-fix-2026-08-20.bundle`。
后续（同日）：GitHub 端 `gh repo archive bitterSmilezzz/dsh-model-fix --yes` 已设为归档状态（isArchived=true，PUBLIC 只读，保留可浏览/可 clone），与「归档在远端」定案一致。

- **GitHub 仓库删除 → 本地同步 + git bundle 存档（2026-08-20，治理/清理）**：问题=用户在 GitHub 删了 2 个第三方 fork 仓库（`dsh-better-sidebar`、`DSH-Transparent-UI-Plugin`/aqua），要求本地同步。对账=①origin `ls-remote` 404 精确定位删除集（仅这 2 个各 404，其余 11 个 origin 正常）；②运行时核查：web profile `node_modules` 无 aqua、侧边栏实装官方 `@deepseek-ai/dsh-client-ui-sidebar` → 删除零运行时影响；③better-sidebar 本地无独有 commit（纯上游快照）可安全删；aqua 有**本地独有 commit 7d831d6**（THIRD-PARTY 记录=web profile 实测在跑的本地版）→ 删除前必须存档。解法=①`git bundle create <绝对路径>.bundle --all` 全量存档两仓库到伞目录 `doc/archives/`；②恢复演练：`git clone <bundle> /tmp/x` → HEAD=7d831d6、package.json name=`dsh-ui-aqua` 0.1.0、lib/cordis.patch.yml 齐全，证明可逆；③rm -rf 两本地目录；④plugins.json 删 2 条 + README/THIRD-PARTY/AGENTS/settings.example 全量清仓（THIRD-PARTY 两行走 `~~删除线~~` + 标注存档 bundle 路径，仿 dsh-work 退役先例；AGENTS fork 列表/伞目录示例/aqua 长期规则同步）；⑤伞目录 `doc/README.md` 已删除列表补两仓库。**坑**=①bundle 输出路径相对 CWD 解析，`git -C repo bundle create 相对路径.bundle` 会写到 repo 目录内报 `No such file or directory`——必须传绝对路径；②`git bundle verify` 报 "need a repository to verify" 只因伞目录不是 git 仓库，bundle 本身没问题（用 list-heads/clone 验证）；③删本地=删除唯一副本（远程已没有），务必存档先行——本任务存档 `doc/archives/*-2026-08-20.bundle`（3.6MB+6.6MB）；④`~/.dsh/settings.yaml` 里遗留 `dsh-better-sidebar:` 配置段属运行时配置，未动（Cordis 忽略未知节，对官方 sidebar 无害）。**验证**=plugins.json 解析 10 条 + `scripts/check-consistency.mjs` 全过；bundle 恢复演练成功。可复现?是（origin 404、bundle 恢复、一致性脚本均幂等可复现）。

- **dsh-work 退役 + dsh-ui-tweaks 拆 at-file（2026-08-20，清理/决策）**：问题=DSH rc.8 发布（8/19 深夜），用户要求卸载与 rc.8 功能重复的插件并清仓。对照=①dsh-work（收编自 NanmiCoder/dsh-agent-teams，9 个 agent_teams_* 工具）与官方 rc.8 内置 durable Agent Teams 运行时（commit 3546f595，experimental 包 dsh-experimental-agent-team/dsh-experimental-tool-agent-team）**功能直接重复**，但官方版明确「发布排除」未发 npm——卸载后 agent_teams 工具立即消失，需等官方 promotion；②dsh-ui-tweaks 的 at-file（@文件引用）与官方 rc.8 @ 菜单文件/会话引用**部分重复**（官方疑似超集）；③vision_read_image/model-fix/memory/trace-compare/usage-plugin 不重复（机制互补或官方无对应）。解法=①`dsh plugin --profile web remove dsh-work` 卸载 + 伞目录 plugins.json/README/THIRD-PARTY/AGENTS 全量清仓（独立仓库 bitterSmilezzz/dsh-work 保留历史）；②dsh-ui-tweaks 拆 at-file：host 组合器删 import/apply/inject（typert 仅 at-file 用，settings 被 retry 路由共用保留）、client.js 按行号删除 sub_atFile 整块（1830 行）+ 组合器引用 + 头部注释、删 lib/at-file/ 目录、peerDeps 移除 dsh-typert-protocol/registry、README/package.json/cordis.patch.yml 同步。**坑**=①**lib/index.js import 了 @deepseek-ai/dsh-compaction-tool-result-pruner 但 package.json 从未声明**——github 安装时 pnpm 提升碰巧解析到，本地 link 安装必现 ERR_MODULE_NOT_FOUND；解法=补 peerDependencies（本地 link 解析靠仓库内 pnpm install + peer 声明）；②本地 link 安装 bundle 依赖仓库有 node_modules（README 本地开发流程已写，实际踩了）；③client.js 大文件按行删除要精确断言边界（sub_atFile 起点/return module.exports/下一个 sub_ 函数），删完 node --check；④at-file 残留检测要排除「移除说明」注释（命中 4 处均为已移除说明，正常）；⑤cordis.patch.yml 的 insert 块 inject 列表与 lib/index.js 的 export inject 是**两处独立声明**，都要同步删 typert；⑥**NOTES.md 是 CRLF 行尾**，用 Python 默认文本模式写入会变 LF 造成全文件假 diff——必须按原行尾写。**验证**=temp port 4399 boot HTTP 200 + playwright 页面零 console/pageerror + client bundle 200 加载 + dump-config 无 atFile 残留。可复现?是（拆 at-file 后本地 link 安装必现 compaction peer 缺失；补声明后 boot 通过）。

- **预设删除补遗：install.sh 预设复制逻辑移除 + 运行侧 ~/.dsh/.agent-presets 清理 + rm 删错目录的坑（2026-08-19，清理）**：问题=用户确认「预设也包含梁神模式」，全删后复查残留。解法=①ui-tweaks 合并版无 preset 残留（合并时未复制）；②**install.sh 仍含 dsh-essentials 预设复制逻辑**（第 239-266 行整段：ensure_source dsh-essentials → 复制 preset/*/ 到 PRESETS_DIR）——dsh-essentials 已删，此段必然空跑打警告，整体删除（连带 PRESETS_DIR 变量定义与用法注释更新，bash -n 验证）；③**运行侧残留**：~/.dsh/.agent-presets/ 下仍有 liangshen + router-standard 两个已装预设目录——删目录即清（预设是独立目录非 bundle 挂载，无 profile 配置引用）；④meta 文档此前已清（README/AGENTS/THIRD-PARTY/plugins.json 零残留，仅 install.sh 留一行历史说明注释）。**坑**=①**rm -rf 删错目录**：上轮「删除本地 dsh-essentials」命令在 `cd dsh-plugins && ...` 同一 shell 内执行，`rm -rf dsh-essentials` 实际删的是 dsh-plugins/dsh-essentials（不存在，静默成功），伞目录根 dsh-essentials 原封未动——cd 后的相对路径 rm 必须确认目标位置（或先 cd 回根再删）；本次已补删，内容未丢（github 仓库本已删除，本地副本删晚无影响）；②预设删除的完整清理链=源码目录（preset/）+ 安装脚本（install.sh 复制逻辑）+ 运行侧（~/.dsh/.agent-presets/）+ 文档引用，四层都要查，漏一层就是「删了又装回来」或「装了个寂寞」；③install.sh 是纯 LF（非 CRLF），与 NOTES.md 不同，改前查换行符。**验证**=bash -n install.sh 过；grep 全 meta-repo 无 liangshen/router-spec（仅 NOTES 历史 + install.sh 历史注释）；.agent-presets 空；推送 81baa4b。可复现?是（重跑 install.sh 旧版会空跑预设段打警告；rm 相对路径删错目录可复现）。

- **伞目录初始化：meta-repo + 全部 7 个插件仓库 + harness 参照源码 clone 完成（2026-08-19，组织）**：问题=用户要求先克隆 meta-repo（bitterSmilezzz/deepseek-plugins），再按 AGENTS.md「本地仓库组织约定」在伞目录下拉取全部相关项目。解法=①伞目录=当前工作区 /Users/localuser/workspace/deepseek-harness（macOS 参照 Windows 约定 D:\workspace\deepseek-harness，伞目录名即 deepseek-harness 对得上）；②按 plugins.json（来源真相）拉取 9 个仓库：meta-repo deepseek-plugins + 自研合并仓 dsh-plugins（6 子包 core/essentials/memory/visualize/ui-tweaks/work）、dsh-skills（3 子包 dev/writing/design）+ 第三方 fork dsh-better-sidebar / dsh-market / dsh-usage-plugin / DSH-Transparent-UI-Plugin + 自研独立 dsh-desktop-shell + 官方 deepseek-ai/deepseek-harness 参照源码（仅参照不修改）；③为 4 个 fork 配 upstream remote（omdsh-dev/DSH-better-sidebar、dsh-market/dsh-market、feiyang-dev/dsh-usage-plugin、WYH66666666/DSH-Transparent-UI-Plugin——地址以 plugins.json 的 upstream 字段为准）；④建 doc/ 本地记录目录。**坑**=①本次 git clone 9 个仓库全部一次成功（与 NOTES 旧记录「此机 git fetch/pull 不稳定需 curl tarball」相反——旧记录是历史网络状况，当前网络直连 GitHub 稳定；若再遇不稳再回退 codeload tarball 方案）；②默认分支：全部插件仓库均 main、官方 harness 是 master（与 AGENTS.md 记录一致），clone 后 git symbolic-ref 确认即可；③fork 的 upstream 用 plugins.json 的 upstream 字段 + THIRD-PARTY.md 核对，勿猜仓库名；④NOTES.md 是 UTF-8+CRLF 纯 CRLF，插入用 Node readFileSync/writeFileSync(utf8)+'\r\n' 前缀（沿用编码铁律）。**验证**=9 仓库 .git 就位、dsh-plugins/dsh-skills 子包目录与 plugins.json path 一一对应、4 fork upstream remote 就位、doc/ 已建。可复现?是（git clone + remote add upstream 可复现；网络状况随环境变化）。

- **DimAgent 额度用完，官方 CLI 卸载 @arcships/dsh-dim-oauth（2026-08-19，卸载）**：问题=dimagent（DimAgent 账号）额度用完，用户要求卸载该模型供应商插件。解法=①官方卸载路径 `dsh plugin --profile web remove @arcships/dsh-dim-oauth`（dsh plugin 是 pnpm 转发器：先 pnpm remove，再 reconcilePlugins 按「已安装依赖是否声明 dsh.bundle」维护 `dsh.profile.bundles` 层列表——remove 后依赖消失、bundle 层自动剔除）；②清理残留：pnpm remove 后在 `profiles/web/node_modules/@arcships` 留下空作用域目录，手动删；③核查无其他引用：settings.yaml / `.agent-presets/` 均无 dimagent 引用，web profile 的 cordis.patch.yml 不用动（`dimagent-oauth` 行来自包内自带 cordis.patch.yml 的 `- insert:`，包删行即消，区别于 aqua 先例的 profile 手写冗余 insert），令牌文件 `$DSH_HOME/dimagent-oauth.json` 不存在（oauth.js 里 `join(resolveDshHome(),'dimagent-oauth.json')` 是唯一定义位），无凭据残留。**坑**=①卸载 bundle 插件=删依赖即可，profile 手写 patch 只有 aqua 那种冗余注册才要动；②`dsh plugin --help` 输出的是 pnpm help、`dsh plugin --profile web` 报「plugin needs pnpm arguments to forward (e.g. add <package>)」——`--profile` 必填且参数原样转发给 pnpm；③卸载后 node_modules 作用域空目录残留需手动清；④运行中 harness 按 boot 组合加载，卸载需**重启 dsh web** 才生效（GUI 会话内不能自杀 harness，host 组合与 client loader 都按启动态加载）；⑤改 NOTES.md 这类中文 CRLF 文件用 Node readFileSync/writeFileSync(utf8)+'\r\n' 前缀插入，禁用 PowerShell Set-Content（GBK mojibake 铁律）。**验证**=package.json dependencies+bundles 均无 dim-oauth（bundles 剩 base/web-app/essentials/work/ui-aqua/ui-tweaks 6 层）、pnpm-lock.yaml 无引用、node_modules/@arcships 已删、profiles 下仅 web 装有（profiles/node_modules 无 @arcships）。可复现?是（`dsh plugin --profile web add @arcships/dsh-dim-oauth` 再 remove 可复现完整装/卸流程）。

- **DSH 插件加载/形态的准确划分：bundle 补丁 vs 纯技能包（2 种加载通道）+ host/client 半区 + 动态插件第三维度（2026-08-19，知识澄清）**：问题=用户问「dsh 插件加载模式是 2 种吗」。原因=「2 种」指按交付/加载通道划分的插件形态（AGENTS.md「插件形态」节的权威表述）：①bundle 补丁插件——包 manifest 声明 `dsh.bundle.patch`（指向 `cordis.patch.yml`），`dsh plugin add`（=pnpm 转发器）把依赖装进 profile，reconcile 按「解析出的包是否声明 dsh.bundle」维护 `dsh.profile.bundles` 层列表，profile 组合器按序把各 bundle 的 patch 叠加成最终 cordis.yml 树（空根→bundles→profile cordis.patch.yml→$DSH_HOME/cordis.patch.yml→--patch）；bundle 可只含 host 半区，也可再声明 `dsh.client`（`exports["./client"]`）——Node 侧扫描 Loader 配置发现 web dsh.client 包、把构建产物哈希写入启动图、经 `/plugins` 端点供给浏览器；client-only 插件也要一个空 host apply 行占位（只为让插件出现在 host cordis.yml 与 Loader 里）。②纯技能包——不是 bundle，不走 `dsh plugin add`，复制到 skills 目录（如 `~/.agents/skills`）由技能发现/`skill(name)` 机制按需加载。解法=回答时区分三个维度：**加载通道 2 种**（bundle 补丁 / 技能包）；**bundle 内部 2 个运行平面**（host Node 进程半区 + 可选 client 浏览器半区——这是 bundle 组成，不是独立加载通道）；**第三类易混路径=动态 Cordis 插件**（cordis_define/cordis_run 临时扩展当前进程、重启即失、不落盘，区别于静态组合行）。坑=①别把「host/client 两半区」或「静态组合 vs 动态插件」当成加载通道意义上的「2 种」；②client 半区依附于 bundle 的 `dsh.client` 清单声明 + `exports["./client"]`，无独立安装入口；③验证加载正确性可用 `dsh --profile web --dump-config` 数目标行出现次数（NOTES 已有 aqua 重复注册先例）。可复现?否（纯知识澄清，无代码改动；结论核对自 npm 包 @deepseek-ai/dsh README + dsh-base/dsh-client-modules README + 本仓 AGENTS.md）。

- **grill-me/grilling 弹窗交互契约写入 AGENTS.md（2026-08-19，规则）**：问题=用户要求「用 grill-me/grilling 这类面试型 skill 时，DSH 要自动逐个问题弹窗选择（`ask_user_question`），而不是让我挨个打字回复」。解法=在 AGENTS.md「仍具现实意义的长期规则」节、紧挨「DSH 技能斜杠调用契约」条目后新增一条 **grill-me / grilling 交互契约**：每个问题必须用弹窗选择逐个发起，一轮可发多个问题，但每个都要是可选交互，不让用户打字。**坑**=①AGENTS.md 是 UTF-8+CRLF、CLAUDE.md 是软链（120000），改 AGENTS.md 自动同步软链，改含中文文件必须用 Node readFileSync/writeFileSync（utf8）而非 PowerShell Set-Content（GBK mojibake）；②插入用唯一锚点（`/grill me` 那行结尾）定位，replace 单行内容即可，避免 CRLF 匹配问题；③工作树 NOTES.md 顶部有**并行会话未提交条目**（dsh-work 深度 bug 修复记录），提交时不能清掉，连同本次落档一并 commit。验证=git diff AGENTS.md 仅 +1 行、read 确认中文无乱码、git status 只剩 AGENTS.md+NOTES.md 待提交。可复现?是（AGENTS.md 软链+CRLF 中文编辑用 PowerShell 会乱码可复现）。

- **本地仓库伞目录约定 + meta-repo 干净化 + curl tarball 补回 dsh-desktop-shell（2026-08-19，组织/清理）**：问题=①插件迁移后本地各插件仓库摆放无统一约定；②meta-repo 残留 `dsh-desktop-shell/`（仅 tauri/src-tauri/target/ Rust 编译产物，含 exe/pdb）与 `dsh-usage/usage-records.json`（525KB 运行时数据），git status 一直有未跟踪噪音；③dsh-desktop-shell 源码要放到伞目录但 git 网络不稳。解法=①AGENTS.md 新增「本地仓库组织约定」章节：所有 GitHub 上 dsh 插件仓库统一放**伞目录**（Windows=`D:\workspace\deepseek-harness`，macOS 参照同约定自行设路径），meta-repo 保持干净（只存 plugins.json+脚本+文档）；②meta-repo 删 `dsh-desktop-shell/` 与 `dsh-usage/`，.gitignore 追加 `dsh-desktop-shell/`、`dsh-usage/`、`plugin-list.txt`（用户个人待尝试清单）；③curl 拉 codeload tarball（4.1MB，~54KiB/s，git 不可用时的替代）解压到伞目录 → git init + remote add origin，等网络稳定再 `git fetch && git checkout -B main origin/main` 补完整历史。**坑**：①**git fetch/pull 在此机不稳定**（Recv failure / 120s 超时），curl codeload 稳定但慢——拉源码优先 curl tarball；②codeload tarball **不含 .git 历史**，解压是源码快照不是克隆，须 git init + 配 origin 才能日后同步；③repo 文件多为 UTF-8+CRLF，改含中文文件用 Node readFileSync/writeFileSync（utf8），PowerShell Set-Content 会 GBK 误读（与既有编码铁律一致）。**验证**：meta-repo git status 干净（只剩 .gitignore/AGENTS.md 有意修改并已提交）；dsh-desktop-shell index.js `node --check` 过、11 文件就位伞目录；web profile 依赖已指向伞目录本地副本、dsh web HTTP 200。可复现?是（git fetch 超时 / tarball 无 .git / Set-Content 中文乱码均可复现）。

- **fork 仓库健康修复：gitignore 补全 + lockfile 跟踪（2026-08-19，清理）**：问题=合并/收编后各 fork 仓库 .gitignore 不完整——better-sidebar 只有 `*.map`（node_modules 显示未跟踪噪音、易误 add）、usage-plugin 空 .gitignore、pnpm-lock 未跟踪。解法=①better-sidebar：.gitignore 补 `node_modules/*.log/.DS_Store`、跟踪 pnpm-lock.yaml（依赖锁定真相，契约「lockfile 即真相」）；②usage-plugin：补 .gitignore（无 lock 文件，因为无依赖构建）。**坑**：git push 大仓库（better-sidebar 含 lib/ 产物）可能命令超时但实际推送成功——超时后用 `git log origin/main..HEAD` 确认待推送数，为 0 即已推。**验证**：7 个仓库（dsh-plugins/dsh-skills/better-sidebar/market/usage-plugin/aqua/desktop）全部 node_modules 0 跟踪、0 未提交；汇总仓库 check-consistency 15 插件全过、install.sh 语法 OK。可复现?是（无 node_modules 忽略时 git status 显示未跟踪噪音可复现）。

- **dsh-notify 收编为自研基础插件：并入 dsh-plugins 子包（2026-08-19，归位）**：问题=用户指出系统通知（notify）从功能上是基础插件，不应作为需独立维护的第三方 fork。原因=notify 是纯 client bundle（host no-op）、零依赖、极轻量（审批/提问/轮次完成/后台会话桌面通知），与 essentials 同级的基础能力；此前按第三方 fork 独立仓库（origin=third-party-fork，upstream omdsh-dev/dsh-web-ui-notify）。解法=①subtree 并入 dsh-plugins 作第 6 个自研子包（`git subtree add --prefix=dsh-notify`，历史保留）；②删 GitHub 独立仓库 dsh-notify；③plugins.json：repo 改 `bitterSmilezzz/dsh-plugins` + `path:/dsh-notify`、origin 改 first-party（去掉 upstream/scenario）；④THIRD-PARTY：notify 从第三方 fork 清单移出、记录改「收编为自研（2026-08-19）」，fork 清单剩 better-sidebar/market/usage-plugin/aqua。**坑**：subtree add 在无 user.email 的仓库报 fatal 但文件已进工作区——先 `git config user.*` 再提交即可（非 merge 状态，直接 commit 文件完成并入）；删除独立仓库前确认内容已并入（dsh-plugins 子包完整 + 语法 OK）。**验证**：manifest get 输出 `dsh-plugins#main&path:/dsh-notify`；install --all dry-run 含 notify 子包；node --check host/client 语法 OK；check-consistency 15 插件全过。可复现?是（subtree add 缺 user.email 报错但文件可提交可复现）。

- **按用户要求：归档内容直接删除，不再保留（2026-08-19，清理）**：问题=用户明确「多余的旧的不用的不用归档 直接删掉」——此前将旧自研独立仓库（GitHub archive）与过时分析文档（docs/archive/）归档保留，用户认为无用就该删。解法=①**GitHub 删除 9 个旧自研仓库**（dsh-core/essentials/memory/visualize/ui-tweaks/work/dev/writing/design）：先 `gh repo unarchive`（归档仓库不能直接 delete，报 not archived 无害）再 `gh repo delete --yes`——删除不可逆但内容与历史已完整并入 dsh-plugins（6 子包 123 提交）/dsh-skills（3 子包 16 提交），无独立价值；②**删 docs/archive/** 8 个 monorepo 时代分析文档（analysis-*/optimization/pilot-harness/token-saving/violations/vision-bridge/load-fix），内容已在 NOTES.md 决策历史中，docs/ 只留 agent-self-optimization（活契约），README 移除 archive 引用。**坑**：①gh repo delete 输出不可靠（成功时无输出、exit=0 是唯一信号），用 `gh repo view` 确认是否真删（已删仓库报 "Could not resolve"）；②归档仓库必须 unarchive 才能 delete；③删唯一副本前先确认内容已并入（git 历史对象可达），否则永久丢失。**验证**：gh repo list 无 9 个旧仓库（18→9）；docs/archive 空已删；README/AGENTS/THIRD-PARTY 无 archive 残留引用；汇总仓库工作树干净、check-consistency 15 插件全过。可复现?是（gh repo delete 无输出但 exit=0；归档仓库需 unarchive 才能删可复现）。

- **dsh-plugins 合并仓库清理：技能归位 + 根 node_modules 误跟踪修复（2026-08-19，清理）**：问题=①dsh-work/.dsh/skills/dsh-plugin-development（DSH 插件开发指南 v3.1.0，387 行）放在协作 bundle 里是错误归属（该属开发技能包）；②合并 dsh-plugins 时无根 .gitignore，pnpm install 后**根 node_modules 6191 个文件被 git 跟踪**（子包 0 个——子包有各自 .gitignore 正确忽略）。解法=①技能经 git show 从历史提取 → 放入 dsh-skills/dsh-dev/skills/dsh-plugin-development/（结构与 dsh-dev 其他技能一致），dsh-work 移除 .dsh 遗留 + .gitignore 去掉旧 .agent-teams 规则；②根 .gitignore 补 node_modules/*.log/.DS_Store，`git rm -r --cached node_modules` 从索引移除（磁盘保留）。**坑**：`git rm -r 目录` 后原文件立即从工作区消失——要先 `git show HEAD:路径` 提取内容再删，否则唯一副本丢失（本案例技能靠 git 历史恢复）；合并仓库（subtree 多仓库并入）务必第一时间建根 .gitignore，否则 pnpm install 等会污染索引。**验证**：dsh-plugins/dsh-skills 均 node_modules 0 跟踪、工作树干净；web profile bundle 正常（essentials/work 在、9 个 bundle）；dsh-work lib/index.js 语法 OK；check-consistency 15 插件全过。可复现?是（无根 .gitignore 时 pnpm install 后 node_modules 被跟踪可复现）。

- **NOTEWORTHY: Pi 哲学第三方评审 checklist 沉淀**：本次评审形成可复用 checklist——零 token 开销（无 tool/prompt）/ insert-only patch / 副作用可逆（disposer + ctx.effect）/ 依赖纪律（零 runtime dep + Node 内置构建）/ 安全（token 化路径不外暴露 / 同源）/ 文档（双语 README + 限制披露）。核心 Pi 评分：Context 成本=满分（零注入）；极简=满分；用户决策=满分（4 滑块 + 轮播列表全权）。后续收编评审可直接对照。

- **DSH 本地盘点（2026-08-16，盘点/无新增经验）**：为 repo 重组做了只读盘点（skills、agent-presets、profiles、dsh-browser/browser-extension、deepseek-plugins/dsh-*、settings.yaml 结构），全部按用户要求不输出凭据/API key/token。问题→用户需要结构化清单；原因→本地 DSH 组件分散在 `~/.agents/skills`、`~/.dsh`、`~/workspace/deepseek-plugins`；解法→只读 frontmatter/package.json/配置文件结构，敏感值一律不读不打印，产出 Markdown 报告；可复现?是（对应路径与命令可复现，报告已归档在本次回复）。本次无新增经验。

- **mattpocock/skills 35 个全部转 model-invocable（2026-08-16，用户决定）**：用户要求「原本 Claude Code 能用的在 DSH 里也能用」=让 20 个 `disable-model-invocation:true` 的技能也能被模型直接调用。执行=先审计全部 37 个 SKILL.md frontmatter 字段（只有 name/description/disable-model-invocation/argument-hint，无 DSH 会 reject 的 legacy key 如 disableModelInvocation 驼峰），再批量删除 20 个文件里的 `disable-model-invocation: true` 行（python re.subn 逐文件、保留其余内容），frontmatter 完整性复验 0 异常。结果=watcher 热刷新后 `<available_skills>` 从 19 增至 40（35 个 mattpocock 全进 + 原有 frontend-design-masterclass/gpt-image-2-style-library/archify/visualize），grill-me/handoff/implement/to-spec/to-tickets/wayfinder/teach/wait-what 等全部可按描述自动调用，不再需要 `/技能名` 斜杠。注意=这是对第三方技能的**本地修改**（改在 `~/.agents/skills/`，不在本仓库 git 内），后续 git pull 上游更新时这些文件会被覆盖/冲突，需重新套用；个别技能语义上偏用户主动触发（wait-what 打断重述/handoff 交接/teach 教学），改为 model-invocable 后模型按描述自行判断，观察期留意误触发。可复现?是（删字段后 catalog 热刷新全量出现可复现；还原=重新加回 `disable-model-invocation: true`）。

- **DSH 技能斜杠调用契约（2026-08-16，契约澄清）**：用户问「为什么没法斜杠 grill me」。问题=`/grill me` 带空格不触发任何技能。原因=DSH 的 user-invocable 技能斜杠触发规则是**空白边界内的 `/name` token 精确匹配 kebab-case 技能名**（dsh-tool-skill README：`A whitespace-bounded "/name" token anywhere in a claimed user message, naming a user-invocable skill in the workspace catalog, injects that skill's full <skill_content>`）；`disable-model-invocation:true` 只关 modelInvocable、userInvocable 默认仍 true（dsh-skill-filesystem `parseInvocationPolicy`：`modelInvocable: disableModelInvocation!==true` / `userInvocable: userInvocable!==false`），所以 `/grill-me` 是唯一斜杠入口；GUI 输入框的 `/` 技能菜单由官方 `dsh-client-ui-skill` client.js 注册（`inputTriggers.registerSource`，trigger "/"、order 2），候选过滤 `skill.name.startsWith(query)`、user-only 项标注「仅用户调用」，菜单选中插入 `/skill-name `。解法=斜杠必须 `/grill-me`（连字符无空格）；更顺的路径是直接说「grill me」——`grilling` 是 model-invocable（description 明确匹配 'grill' 触发词）会自动加载，而 `grill-me` 官方版是 7 行薄壳（内容=Call the Skill tool with "grilling"），两条路径最终都到 grilling。其余 20 个 user-only 技能（grill-with-docs/handoff/implement/to-spec/to-tickets/triage/wayfinder/teach/to-questionnaire/wait-what 等）同样 `/技能名` 规则。可复现?是（源码 grep parseInvocationPolicy + dsh-tool-skill README 可复现；GUI 未真机验证斜杠菜单）。

- **dsh-vision-router 撤销安装/收编（2026-08-16，用户确认）**：用户指出与 dsh-essentials ModLens 重叠后选择「连仓库收编也撤销」。已从 web profile 卸载（`dsh plugin --profile web remove dsh-vision-router`，`dump-config` 已无 vision-router），已 `git rm -r dsh-vision-router` 并回滚 README/THIRD-PARTY/AGENTS 相关条目；`scripts/check-inject-consistency.mjs` 的 `\bctx\.` / 忽略 `ctx.inject` 修复保留（通用改进，不依赖该插件）。技术判定与设计理念仍见下一条：dsh-vision-router 是 MIT 真 bundle、198 测试 196 过、免 key OVH 链 + 12 像素工具，但与 ModLens 双入口重叠/默认 OVH 外发/工具 schema 常驻，最终不装不收编。可复现?是（卸载、git rm、文档回滚均可复现）。

- **dsh-agent-teams（NanmiCoder/dsh-agent-teams）安装/收编判定 + 可借鉴理念（2026-08-16，判定/落地）**：用户发 https://github.com/NanmiCoder/dsh-agent-teams 链接，要求判断适不适合安装到本仓库并收编，同时把思想/理念落档。问题=这是 **DSH 原生的多 Agent 团队协作 bundle**（GitHub API：388★/35 forks/9 open issues，MIT，2026-08-12 建仓、最近推送 2026-08-15，默认 main；npm `@nanmicoder/dsh-agent-teams` latest 0.1.5，Node ^22.19||>=24）。形态=`dsh.bundle.patch → cordis.patch.yml` 单行 insert `id: agent-teams / name: '@nanmicoder/dsh-agent-teams'`，`dsh.client` web 半区（inject locale/runtime/ui-conversation），**无 runtime dependencies**（仅 peerDeps 全 rc.6，均 optional；devDeps 才从 npm 装 DSH peer，全新 clone 可独立构建）。功能=9 个 `agent_teams_*` 工具（create/add_member/remove_member/create_task/claim_task/update_task/send_message/status/delete）+ 一条 `systemPrompt.section` 使用协议；队长用 `subagents.startContinuable`/`followup` 创建 durable 可续聊成员，状态以 `<workspace>/.agent-teams/<teamId>/` 磁盘真相（team.json + inbox/*.jsonl）+ 会话日志双写；任务状态机 `pending→claimed→in_progress→completed/failed/cancelled`，依赖未完成不可领取；delete 只归档不删（archive/ 保留任务/依赖/邮箱供复盘）；Web UI=右上角 body-portal 活动面板 + 对话流卡片 + 会话跟随/历史恢复。验证=浅克隆 → `pnpm install --frozen-lockfile` ok → `pnpm build`（tsc+tsc client+tsdown，client 71.6KB/gzip 16.4KB）全过 → `pnpm verify`（7 组约 55 断言 + skill mirror check）全过；**隔离 DSH_HOME 实测安装通过**：本地 `/tmp/dsh-agent-teams-upstream` 与 npm 0.1.5 两种来源都 `dsh plugin add` 成功，`--dump-config` 均见 `# == @nanmicoder/dsh-agent-teams` + `id: agent-teams` 行；`scripts/check-package-consistency.mjs` 对 patch 的 `id: agent-teams`（非 dsh-* 前缀）与 name 匹配不会误报。原因=①MIT 与本仓库 License 兼容；②形态完全符合「bundle 补丁 + 可选 client」且 rc.6 契约对齐（成员 provider/model/reasoningEffort 快照用 rc.6 新 API `installModelSelection`/`ReasoningEffortId`/`foldSubagentDescriptor`）；③质量高：离线 verify 覆盖纯规则/依赖门控/磁盘流/宿主快照/客户端投影/成员模型选择，构建与隔离安装全过；④无第三方服务/无额外运行时依赖，状态全本地文件，资源占用低（client 72KB，面板轮询后台不可见自动暂停；旧资源画像=内存低、host 0 interval）；⑤与现有 dsh-essentials/dsh-market/mode-boost/router-standard **无功能重叠**（唯一类似点是都注入 system prompt/工具，但 agent-teams 是任务编排，不是路由/市场/记忆/视觉）。注意/风险=①**源码仓 `.gitignore` 已忽略 `lib/`**（与 dsh-market 同款坑）：git subtree 收编后必须本地 `pnpm build` 并把 lib/ 提交入库，否则 `dsh plugin add ./dsh-agent-teams` 会 `ERR_MODULE_NOT_FOUND`；升级 pull 后要复查重建；②上游迭代快（0.1.2→0.1.5 主要加了成员零交互模型路由快照/冷恢复），收编后需跟随；③一个队长同时只带一个团队、文件状态多进程不保证一致、成员可能不按“仪式”更新任务状态——上游 README 已如实声明，属可接受边界；④曾于 2026-08-16 瘦身时被删除（与 better-sidebar 等一起），本次重评无技术性否决项，但**重新收编会增加一个独立子项目维护面**，且若装到 web profile 会增加 9 个工具 + 1 条 system prompt 段（token 开销小）。解法=判定并执行：**适合安装到 DSH web profile 且已安装（`dsh plugin --profile web add @nanmicoder/dsh-agent-teams` 成功，dump-config 见 `id: agent-teams`）**，**已 git subtree 收编为独立子目录 `dsh-agent-teams/`**（MIT、bundle、活跃、有验证、无重叠），执行步骤=dirty 工作树先 stash/commit → `git subtree add --prefix=dsh-agent-teams https://github.com/NanmiCoder/dsh-agent-teams.git main --squash` → 在子目录 `pnpm install --no-frozen-lockfile && pnpm build`（上游 lockfile 可能过期，dsh-market 同款）→ 移除/注释 `.gitignore` 的 `lib/` 并 `git add lib` → 更新 README 目录表 + THIRD-PARTY 收编行 + AGENTS 当前插件计数与索引 + NOTES（本文）。**用户已确认执行：已安装到真实 web profile（`dsh plugin --profile web add @nanmicoder/dsh-agent-teams`，`--dump-config`/import 验证通过）+ 已 git subtree 收编为 `dsh-agent-teams/`（源码仓缺 lib/ 已构建入库、移除 .gitignore 的 lib/、根 pnpm-lock.yaml 已更新）。** 涉及理念=①**队长-成员协议不是 workflow 引擎**：只用 DSH 原生 seam（tools 注册表 + subagents 可续聊 + systemPrompt section + 文件系统），把编排协议放提示段而非再造运行时——DSH 插件应优先复用能力接缝。②**磁盘真相 + 邮箱 + 归档**：team.json 是事实源、inbox JSONL 是成员/队长消息、delete=archive 不销毁，事件同时写会话日志供审计/复盘；「状态可回放、删除可恢复」是协作类插件的好基线。③**零交互成员模型路由**：默认快照队长当前实际生效的 provider/model/reasoningEffort，冷恢复时从 team.json 同步到子代理（`installModelSelection`），只有用户明确要异构团队才传 provider+model，不弹窗不二次选择——模型路由继承应「继承当前有效值，显式才覆盖」。④**headless/Web 双态安全**：webServer/workspace 服务未挂载时工具照常可用，Web 路由用 `internal/service` 懒注册，`webServer`/`httpServer`、`workspaceRegistry`/`workspace` 双键兼容过渡——插件应默认在 headless 不卡启动。⑤**安全最小面**：sanitizeKey 保留 Unicode 字母/数字并截断+摘要防路径穿越/撞名，资源路由显式 allowlist，成员 spawn 用 toolFilter deny 队长专属工具，进程内 per-team 锁串行化读改写。⑥**UI 是投影不是控制面**：活动面板 1s 轮询只读磁盘快照+实时子代理状态，后台不可见自动暂停，模型不以 UI 为准而以状态文件/status 工具为准——展示层与事实源分离。⑦**工程门禁**：verify.mjs 7 段离线断言 + skill 同步 check + peerDeps optional + prepublish build/verify，是第三方 bundle 可抄的发布基线。可复现?是（GitHub API + git ls-remote + 浅克隆 + pnpm install/build/verify + 临时 DSH_HOME 本地/npm 安装 + --dump-config + check-package-consistency 均可复现；已安装到真实 profile、已收编）。

- **dsh-browser（Lum1104/dsh-browser）安装落地（2026-08-16，用户确认安装）**：用户确认「可以安装」后执行=①官方 `curl | bash install.sh` 下载到 `~/.dsh/dsh-browser`，bridge 构建成功（`packages/browser/bridge-browser/lib/` 已生成），但**第 2 步 `dsh plugin --profile web add` 失败**：`ERR_PNPM_UNEXPECTED_STORE`——上游 workspace `packageManager: pnpm@11.7.0` 使 Homebrew pnpm 在 `~/.dsh/dsh-browser` 下自动切到 v11/store v11，而本机 web profile 的 node_modules 由 pnpm v10/store v10 安装，dsh 在 profile 目录调 pnpm 时版本不匹配。解法=**不要在 dsh-browser 的 pnpm11 workspace 内执行 `dsh plugin add`，改到中立 cwd（`/tmp`）执行**：`cd /tmp && dsh plugin --profile web add "@deepseek-ai/dsh-bridge-browser@link:/Users/localuser/.dsh/dsh-browser/packages/browser/bridge-browser"`，使用 pnpm v10.28.2 成功；与 NOTES 既有「npm 版 dsh 转发 pnpm 版本须与 profile store 对齐（当前 v10/Homebrew）」完全一致。②继续手工完成 install.sh 因失败未执行的 3/4 步：`cd ~/.dsh/dsh-browser && pnpm --filter dsh-browser-extension run build` 成功，`rsync` 复制 `extensions/dsh-browser/dist/` 到 `~/.dsh/browser-extension/`，`open -a "Google Chrome" "chrome://extensions"` 已打开。③验证：`dsh plugin --profile web list` 见 `@deepseek-ai/dsh-bridge-browser link:../../dsh-browser/packages/browser/bridge-browser`；`dsh --profile web --dump-config` 见 `# == @deepseek-ai/dsh-bridge-browser / - id: bridge-browser`；`cd ~/.dsh/profiles/web && node -e "import('@deepseek-ai/dsh-bridge-browser')"` 输出 `import ok bridge-browser`。④**未收编**：本次只安装到本地 web profile，未 `git subtree add` 到本仓库；后续若收编需处理 lib/dist 未入库、`@deepseek-ai/` scope 未发布包名、嵌套 bundle 结构、mac-only install.sh 等（详见上方/此前调研判定）。涉及理念=真实浏览器优于 headless、文本化 DOM 编号操作、快照上下文经济（32k 字符≈8–10k tokens）、confused-deputy 桥自带 token 认证（回环免 token 还需 chrome-extension:// origin）、privileged gateway loopback-only、操作审批 fail-closed + tab handoff、session deferral/workspace、单活动连接 + 代际令牌、协议单一来源 `protocol.ts`。可复现?是（上游 install.sh 在 pnpm v10 profile 上因 v11 workspace 必现 store mismatch；改中立 cwd 后安装/import/dump-config 均可复现；未收编）。

- **dsh-market 安装 + git subtree 收编落地（2026-08-16，用户确认执行）**：用户选择「安装到 web profile + git subtree 收编为 dsh-market/」。执行=①真实 web profile `dsh plugin --profile web add dshmarket` 成功，`--dump-config` 见 `id: dsh-market / name: dshmarket`（有 missing peer @deepseek-ai/cordis 警告，运行时由 DSH closure 解析）；②`git subtree add --prefix=dsh-market https://github.com/dsh-market/dsh-market.git main --squash` 成功（先 stash 了工作树里并行会话的未提交修改，add 后 pop 恢复）；③**关键坑：源码仓库没有 `lib/`**（上游 `.gitignore` 忽略 `lib/`，只有 npm 包 prepack 后才含 lib）——`dsh plugin add ./dsh-market` 本地链接看起来成功且 dump-config 有 entry，但 `import('dshmarket')` 报 `ERR_MODULE_NOT_FOUND: .../dshmarket/lib/index.js`；远程 `github:dsh-market/dsh-market` 安装则因 pnpm 默认拦截 git 依赖的 prepare 构建直接 `ERR_PNPM_GIT_DEP_PREPARE_NOT_ALLOWED`。解法=在仓库内构建 `lib/`（从同 HEAD 源码 build）并**移除 `dsh-market/.gitignore` 里的 `lib/` 行**，把构建产物提交入库（免构建安装；升级 pull 后需复查/重建）；④**包名一致性守护脚本误报**：`scripts/check-package-consistency.mjs` 把 patch 的 `name: 'dshmarket'` 带引号当不等、把逻辑 id `dsh-market` 当旧模块名残留；解法=脚本升级：name 值先去引号，dsh-* 形 id 仅当同条目没有匹配包名的 `name:` 时才判残留，dsh-market 通过；⑤文档已更新：README 目录表加 dsh-market 行、THIRD-PARTY 加收编行（本地修改=lib 入库 + .gitignore + 一致性脚本增强）、AGENTS 当前插件 3→4；⑥仍未处理：与 dsh-essentials 内置「插件市场」tab 的双入口/去重问题（用户选择同时保留，待后续二选一或实测共存）；上游 lockfile 过期（pnpm-lock 缺 @deepseek-ai/dsh-invariants）未在仓库内修，当前子目录测试/构建需 `--no-frozen-lockfile` 或直接用已提交 lib。可复现?是（npm 安装、本地链接缺 lib 报错、git 远程 prepare 拦截、脚本修复、subtree add 均可复现）。

- **dsh-handbook（Electricitysheep/dsh-handbook）外部调研（2026-08-16，判定/记录）**：用户发 https://github.com/Electricitysheep/dsh-handbook 链接。问题=这是 **DSH 社区手册/白皮书仓库**（「DeepSeek Harness 中文手册 × 生态观察中心」，docsify 站点，GitHub API：342★/10 forks/3 open issues，2026-08-13 建仓，最近推送 2026-08-16，默认 main HEAD 8ee8a84，HTML 为主 + 15 章中英 docs + 中英 PDF + cheatsheet/FAQ/config-reference/roadmap + examples/plugin-template），**不是 DSH 插件/bundle/预设/skill**：根目录无 `dsh.bundle.patch`/`cordis.patch.yml`/`dsh.client`，无 Cordis 代码；唯一可运行包是 `examples/plugin-template/`（非 bundle 的教程模板，MIT）。许可=README 明确「内容 CC BY-NC-SA 4.0 · 示例代码 MIT」（无 LICENSE 文件，GitHub license=null），与本仓库「各子项目 MIT、以 MIT 分发」不兼容，不能整体收编/搬运正文。原因=①形态不符：本仓库子项目必须是可 `dsh plugin add` 的 bundle/预设/技能；dsh-handbook 是文档站，安装入口是 `npx -y @deepseek-ai/dsh web` 的教程不是插件；②License 非 MIT（CC BY-NC-SA 含非商业/相同方式共享），整体 `git subtree add` 会污染 MIT 分发；③价值在内容/生态数据，不在可安装代码；与已有官方参考文档互补（新手路径/cheatsheet/插件模板/生态报告/FAQ）。解法=判定：**不安装到 DSH profile、不收编为子项目、不做 git subtree add**；建议作为社区参考文档链接（已加到根 README「依赖的参照项目与文档」：社区手册 dsh-handbook，在线 https://electricitysheep.github.io/dsh-handbook/，内容 CC BY-NC-SA 4.0 仅引用不搬运）；其 `examples/plugin-template/` 是 MIT 可单独参考（写插件教学/脚手架），生态报告方法（1804 插件 × 780 帖交叉验证）可作社区调研口径参考。可复现?是（GitHub API + git ls-remote + 浅克隆读 README/CONTRIBUTING/docs 可复现；未安装、未收编、未改本仓库代码）。

- **dsh-market（dsh-market/dsh-market）安装/收编判定 + 可借鉴点（2026-08-16，判定/记录）**：用户发 https://github.com/dsh-market/dsh-market 问适不适合安装到本仓库并收编。问题=这是 **DSH 官方形态的插件市场 bundle**（README 定位「The plugin market inside DeepSeek Harness — browse, search, one-click install」，MIT，459★/39 forks，npm `dshmarket` latest 1.9.0，main HEAD 9e7daac，homepage dshmarket.com，活跃 2026-08-16 仍有提交）：package.json `name=dshmarket`、`dsh.bundle.patch → cordis.patch.yml` 单行 insert `id: dsh-market / name: dshmarket`、`dsh.client` web 半区 inject connection/runtime/locale/ui-settings/ui-theme，**无 runtime dependencies**（仅 peerDeps @deepseek-ai/cordis ^4.0.1）。功能=浏览/搜索社区插件目录（awesome-dsh-plugin.com 800+，分类/星数/最新排序/双语）、AppStore 式截图、主题市场（安装/实时切换/互斥/卸载）、一键安装（npm tarball 优先 github，实时进度/取消）、更新（npm 或 pinned commit vs HEAD）、卸载、备份/恢复（JSON + WebDAV 每日自动，恢复前校验+失败回滚）、缺 pnpm 一键补齐、脱敏日志导出、需要时一键重启；安全=只装 curated registry、构建脚本默认拦截+逐包批准、终端类插件标记、same-origin POST、重启限 loopback、备份含凭据时 UI 警告、WebDAV 仅 https/拒私网/不存密码、无遥测。架构=host `src/index.ts` inject webServer+loader（profile 用 `--profile` argv 推导，避免装错 profile；DSH Desktop 走 desktopProfiles/desktopPnpm 契约）、routes 挂 `/dsh-market/*`；client `src/client/index.ts` inject slots/locale/theme，注册 `settings.section` id=market order=40 + `shell.overlay` InstallToast；含 hot.ts（纯 insert patch 热挂）、themes.ts、verify.ts（live/restart/inert/broken 四态）、backup/updates/restart/pnpm-compat/ndjson/log；目录数据 data/registry-snapshot.json 离线兜底。验证=浅克隆 → `pnpm install` 因 **lockfile 过期**（package.json 已加 `@deepseek-ai/dsh-invariants` 但 pnpm-lock.yaml 未同步）需 `--no-frozen-lockfile` 才成功；`pnpm typecheck` 全过、`pnpm test` 19 文件 211 测试全过、build 通过（client 172KB / gzip 36KB，lib 316KB，tgz 380KB）；临时 DSH_HOME 下 `dsh plugin --profile web add dshmarket` 安装成功，`--dump-config` 见 `dsh-market` 行，`import('dshmarket')` ok（有 missing peer @deepseek-ai/cordis 警告但运行时由 DSH closure 解析，与既有 peerDeps 坑一致）。原因=①MIT 与本仓库 License 兼容；②形态完全符合「bundle 补丁 + 可选 client」；③npm 已发布、无 runtime 依赖、体积轻、测试质量高（211 tests）；④rc.6 契约对齐（依赖 rc.6 primitives，且有 missingPrimitives 降级门控）；⑤功能上**与本仓库 dsh-essentials 内置的「插件市场」tab 高度重叠**——dsh-market 是一级 `settings.section` 真在线安装市场，dsh-essentials 是 `settings.plugins.tab` 静态市场（GitHub Search + 复制命令、无在线安装 API），二者会同时出现两个市场入口；且 dsh-market 本身可安装/卸载/更新/重启 profile，属于**高权限 profile 管理工具**，收编后维护责任重。解法=判定：**适合从 npm 安装到 DSH web profile（推荐 `dsh plugin --profile web add dshmarket`，隔离安装实测通过；装完重启+硬刷新）**；**有条件适合收编为独立子目录 `dsh-market/`**（MIT、bundle、活跃、有测试，可 `git subtree add` 跟随上游），但收编前需：①先由用户确认是否真要安装/收编（本次仅隔离验证，未装真实 profile、未改仓库代码）；②与 dsh-essentials 市场 tab 二选一或接受双入口/移除旧 tab；③上游 lockfile 过期问题在收编后要补锁或改 CI（`pnpm install --no-frozen-lockfile` 或更新 lock）；④若收编需更新 THIRD-PARTY/README/AGENTS 清单，且当前工作树有多任务未提交，`git subtree add` 前必须先提交/stash。涉及理念=①**市场即信任边界**：安装只允许 curated registry 来源，防名字抢注（npm 名需 registry 校验）、防同名冲突、防 alias 重复安装、防 fake-success（clean exit 但没装上不读成功）；做插件安装/分发类能力可直接借鉴。②**失败可恢复是产品底线**：manifest 快照回滚（pnpm 先写 package.json 再失败会留幽灵依赖）、恢复备份失败时逐个重装/空依赖重试、取消操作保留 partial 并回执 diff、坏条目自动 remove；「操作结果可解释、可回滚」应成为 DSH 插件默认要求。③**激活状态不是布尔**：verifyActivation 区分 live/restart/inert/broken 并给原因（patch 复杂不能热挂/无 dsh.bundle 成普通依赖/仅 client/装坏），UI 不再一刀切「重启后生效」；我们 dsh-essentials 安装/插件列表也可升级为这种多态呈现。④**热挂载 + 持久 disable 状态自愈**：纯 insert patch 可 hotMount/hotUnmount，bundle 层 disable 在内存中不持久，boot 时重放 disable 列表 + 监听 `internal/plugin` 把被覆盖的关闭状态再压回去——「UI 开关与运行时状态一致」的工程样板。⑤**安全面分层**：same-origin POST、backup 导出限 loopback、WebDAV https-only/拒私网/密码不进浏览器、restart 限 direct loopback 且保留原 argv/env/cwd、日志脱敏（home 路径/凭据形状）——权限类插件的合规 checklist。⑥**跨宿主兼容**：普通 DSH 用 argvProfile 推导，DSH Desktop 用 `desktopProfiles` + `desktopPnpm` 契约且 allowRestart=false 交给宿主重启；第三方 bundle 想同时兼容桌面壳可参考这套「环境探测 + 能力降级」模式。⑦**客户端自包含与优雅降级**：只依赖 host 注入的 primitives，构建时 external，运行前检查必需导出缺失则跳过注册（避免整页白屏）；module-scope 缓存 registry/installed 让重进秒开。⑧**发布纪律**：prepack 跑 build+preflight、validate:registry、固定 registry 快照、测试矩阵（unit/compat/web e2e）——都是可抄的工程基线。可复现?是（GitHub API + 浅克隆 + pnpm typecheck/test/build + 临时 DSH_HOME 安装/dump-config/import 均可复现；未安装到本机真实 profile、未改本仓库代码）。

- **Aegis 最终决定（2026-08-16，用户确认）**：用户确认 **不安装、不收编，仅落档思想理念**。本仓库与 DSH profile 均不新增 Aegis；可借鉴理念已在前述 Aegis 条目存档（thin DSH bundle 适配器、`agent/session-start` 同步 bootstrap、method pack 不冒充 runtime core、fast-path / 证据槽 / TaskStartSnapshot / 单一 closeout、canonical skills + 单暴露路径、多宿主生成视图、doctor 结构化验证门禁、本地路径安装的模块解析坑）。可复现?是（判定与理念已在 NOTES 上文；未安装、未收编）。

- **MuseAI 可借鉴点记录（2026-08-16，记录）**：用户决定不安装、不收编，只落档思想理念。问题=yejiming/MuseAI 与配套 dsh-museai-tavern 虽不纳入本仓库，但 dsh-museai-tavern 的架构/交互有不少对本仓库插件设计可借鉴的点。解法=按可落地度整理：①**把外部应用的领域模型映射为 DSH storage-domain**：世界书/角色卡/会话/羁绊作为独立 `museai` 域（store 表 + sessions 表，zustand persist envelope 原样落盘），浏览器 localStorage 仅做离线镜像，重启不丢——本仓库做「长期记忆/角色/素材」类插件可照此把核心实体收敛到 `$DSH_HOME/storages/<domain>.json`。②**conversation.view 承载完整子应用**：order 15 插一个「MuseAI 标签」，内部再分五页，激活时隐藏平台 composer，形成 DSH 内嵌的应用区；适合创作/娱乐/垂直工具类插件，避免把业务 UI 塞进普通会话流。③**零凭据模型桥**：插件不出现 API Key/BaseURL，全部复用 DSH `ctx.llm` + `agentDefaultModel`，前端只从 `/models` 目录选「跟随默认」或显式 provider/model——所有 AI 功能插件都应这样，不要自建第二套模型配置。④**host 双行拆分的 headless 安全**：`museai` 行（存储服务）任何 profile 都可用；`museai-routes` 行用嵌套 inject（webServer+llm+agentDefaultModel+museaiStore）只在 web 存在时挂 `/plugins/museai/*`，headless 不卡启动——同 bundle 兼容 web/headless 的推荐范式。⑤**内存→持久化域升级 facade**：storage-domain 晚挂载时先内存服务，facility 出现后 flush 升级 durable，数据不丢、可降级——可选持久化设施时的优雅模式。⑥**NDJSON 流式桥 + thinking 分离**：`start/delta/thinking_delta/done/error/aborted` 事件流，前端可做 Markdown + 折叠思考 + 停止生成；与 DSH 流式生成模型一致，适合做自定义生成面板。⑦**模型目录接口**：GET `/plugins/museai/models` 聚合 provider×model + failures + defaultSelection，前端一个下拉解决「跟随默认 or 指定模型」——是复用 DSH 模型能力的通用 HTTP 面。⑧**开放格式互操作**：角色卡/世界书支持 JSON 导入导出 + SillyTavern 双格式导出/转换预览；创作类工具做开放格式能显著提升生态价值。⑨**发布纪律**：openspec 变更记录、11 个测试文件覆盖 utils/routes/domain/client-bundle smoke、lib 提交仓库免构建安装，都是外部 bundle 可借鉴的工程基线。⑩**反面教材**：README 安装命令与实际 npm/GitHub 地址不一致、npm 未发布、@deepseek-ai/* 只放 peerDependencies、client bundle ~8.5MB——外部调研/收编前必须核查发布元数据、依赖策略与体积。可复现?是（读源码/测试/构建/隔离安装均可复现；未安装到 DSH profile、未收编）。

- **SandBase Harness 可借鉴点记录（2026-08-16，记录）**：用户决定不安装、不收编，只把设计思想和理念落档。解法=按对本仓库可落地度整理：①**本地优先 + Git 友好 workspace**：agents/skills 是 YAML/Markdown 文件进 Git，runtime state（SQLite/logs/files/sandbox）放 `.managed-agents/` 忽略；「源码文件是配置/能力，运行时状态是数据」与我们的 README/NOTES 分离思路一致。②**单活动栈（One active stack）**：Settings V2 每次只允许一个 model vendor / loop engine / storage / memory / sandbox backend；未实现的适配器（Postgres/S3/mem0/harness 等）保持 roadmap，不提供假 UI。理念=「验证优于信任」：运行时影响型设置要 probe 验证，不只是 schema 验证。③**控制面/执行面分离 + 小核心扩展点**：Agent（持久定义）/ Environment（沙箱模板）/ Session（控制面状态）/ Sandbox（执行资源，一个 session 独享）；core 小，模型、沙箱、工具、策略走稳定接口。DSH 插件做外部 runtime 桥可沿用「薄适配层 + 稳定契约」。④**事件日志是会话真源**：append-only 结构化事件，重启后从事件回放恢复会话；SSE 瞬态 chunk 不落盘；compaction 边界也入日志。这比把会话当黑盒更可审计/可复现，dsh-essentials 记忆/审计可参考。⑤**诚实能力边界**：明确 non-goals（无可视化工作流画布、无图 DSL、无隐藏远端控制面）；BACKLOG 承认 Console 未纳入 typecheck（~90 errors）、本地沙箱无内核隔离、K8s live 测试无集群时跳过等。诚实列边界比宣称全能更可信。⑥**沙箱安全分层**：本地路径禁锢 + 环境 allowlist；Docker/K8s/self-hosted 更强隔离；沙箱只属于一个 session，结束/停机清理；egress 控制列为 roadmap。DSH 侧 sandboxPolicy 可对应做「能力分级 + 如实上报」。⑦**工具治理**：MCP server 按 agent 配置、按 session 连接；工具输出设上限保护事件/上下文；可选集成失败优雅降级并返回状态；敏感操作确认流在 roadmap。对应 dsh-essentials 的「超大工具结果剪枝/权限策略」。⑧**DSH 集成=纯 MCP client bundle**：一行 `@deepseek-ai/dsh-mcp-client` + stdio + env 透传 + `failOnStartupError`，无自写 host 插件；`run_session` 等流到 idle 再返回 text/terminal_event/event_count，并给 structuredContent——外部长任务委托可直接抄这个语义。⑨**发布纪律**：`release:check` 门禁（typecheck+test+build+package:check+smoke）；README 固定不可变 tag；CI 还构建 MCP 容器。npm 包名被占位这一教训也说明「包名/发布路径要早规划」。可复现?是（git clone + docs/spec + src/mcp + CI/package.json 可复现；未安装、未改本仓库代码）。

- **MuseAI（yejiming/MuseAI）外部调研 + dsh-museai-tavern 安装/收编判定（2026-08-16，判定/记录）**：用户发 https://github.com/yejiming/MuseAI 问看看这个项目。问题=主体是**独立 Tauri 桌面 AI 角色扮演/文字冒险应用**（React 19 + AntD + ECharts + Rust/Tauri 2，v0.9.8，~567★/46 forks，本地数据 `~/Documents/MuseAI/`，支持局域网移动端；仓库**无 LICENSE 文件**、GitHub license=null，非 DSH bundle，无 dsh.bundle.patch/cordis.patch）；但它 README 醒目指向配套 **DSH 客户端插件 dsh-museai-tavern**（yejiming/dsh-museai-tavern，MIT，v0.0.1，8★，2026-08-13 新建，浅克隆 HEAD a7a077a），这才是真 DSH bundle：`dsh.bundle.patch → cordis.patch.yml` 两条 insert（`museai` 存储服务行 + `museai-routes` 路由行），`dsh.client` 浏览器半区注册 `conversation.view` order 15 标签（轨迹右侧），把 MuseAI 五个页面（背景/聊天/冒险/羁绊/设置）搬进 DSH Web GUI，模型全部复用 DSH `ctx.llm` + `agentDefaultModel`，无任何 API Key/BaseURL；持久化走 `@deepseek-ai/dsh-storage-domain` 的 `museai` 域（`$DSH_HOME/storages/museai.json`），headless 自动跳过路由。原因=①主体 app 形态/许可/体量都不符合本仓库「MIT 子项目 + bundle 补丁」约定，**不宜安装到 DSH profile、不宜收编**，仅可作外部产品/创作类应用参考；②配套插件**技术上可安装、质量不错**：pnpm install + `pnpm test`（11 文件 49 测试全过）+ `pnpm typecheck` + client typecheck + `pnpm build` 全过；临时 DSH_HOME 下 `dsh plugin --profile web add /tmp/dsh-museai-tavern` 和 `github:yejiming/dsh-museai-tavern` 均成功，`--dump-config` 见 museai/museai-routes 两行；代码结构清晰（src/index.ts 只开 store，routes.ts 嵌套 inject webserver+llm+agentDefaultModel+museaiStore，domain.ts 内存→域升级 facade，client 分页/store/utils/组件，含 openspec 与 11 个测试文件），符合本仓库「路由 patch inject/副作用 effect 回收/headless 安全/无凭据」最佳实践。③但有几个注意点：**README 写 npm 装 `@yejiming/dsh-museai-tavern` 但 npm registry 404 未发布**；**README/package.json 写 `github:omdsh-dev/dsh-museai-tavern` 和 repository omdsh-dev，实际仓库在 yejiming 下，omdsh-dev/dsh-museai-tavern 不存在**（实测 `github:omdsh-dev/...` 安装失败）；package.json 只把 @deepseek-ai/* 放 peerDependencies（dependencies 仅 schemastery），远程安装时 pnpm 报 missing peer 但 DSH 运行时可解析（与既有 peerDeps 坑类似，若收编应补 dependencies 或放宽）；client bundle `lib/client.js` 约 8.57MB + 14.6MB sourcemap（AntD/ECharts 全家桶），偏重；`maxCompleteChars` 配置项在 routes 里没真正截断非流式输出；项目太新（0.0.1、8★）上游可能快速变动。解法=判定：**MuseAI 主体不装不收编；dsh-museai-tavern 作为外部插件可装（推荐 `dsh plugin --profile web add github:yejiming/dsh-museai-tavern`，别用 README 的 npm/omdsh 命令），有条件适合收编为独立子目录**（MIT、bundle 形态、独立仓库、有测试），但收编前需：修 package/repo/README 的 omdsh/npm 不一致、补 @deepseek-ai dependencies 或统一 peer 到 rc.6/`*`、评估 8.5MB client 体积与 dsh-essentials conversation.view（usage-stats order 20）共存、加 THIRD-PARTY 与根 README/NOTES 行。本次只做调研+隔离安装验证，未安装到本机真实 profile、未改本仓库代码。可复现?是（GitHub API + 浅克隆 + pnpm install/test/build + 临时 DSH_HOME 的本地/GitHub 安装与 dump-config 均可复现）。

- **Aegis 冲突分析（2026-08-16，补充）**：问题=用户问 Aegis 若可装，与本仓库现状、当前 DSH 现状是否冲突。原因=当前 web profile 已装 `dsh-essentials`、`dsh-mode-boost`、`dsh-better-sidebar`、`@tt-a1i/archify-dsh`，并有 router-standard/spec/liangshen presets；Aegis 会新增 `aegis-method-pack` 行 + `aegis-method-pack` filesystem provider + `using-aegis`（alwaysApply）skill + `agent/session-start` 同步 bootstrap。解法=结论：**技术上不冲突**（无重复 id/service/provider，远程安装实测通过），但有三个注意点：①**路由/上下文叠加**：Aegis 的 auto bootstrap + alwaysApply `using-aegis` 与 router-standard/spec、mode-boost 都是“给模型注入路由/行为指令”，会叠加并增加每会话上下文，是否干扰需在真实会话里实测，不能只看 dump-config；②**仓库一键脚本**只发现 `dsh-*` 且默认本地路径：收编为 `aegis/` 不会进脚本（安全但需手动扩展），收编为 `dsh-aegis/` 会进脚本但本地安装会因 pnpm 链到 profile 外报 `ERR_MODULE_NOT_FOUND: @deepseek-ai/dsh-llm`，需改脚本用 GitHub 子目录或补 dependencies；③当前工作树多任务未提交，`git subtree add` 前需先处理。可复现?是（`dsh plugin --profile web list` / `dump-config` + Aegis 远程隔离安装实测可复现；未实际装到本机 profile、未收编）。

- **coding-tools-mcp（xyTom/coding-tools-mcp）安装/收编判定 + 可借鉴理念（2026-08-16，判定/记录）**：用户发 https://github.com/xyTom/coding-tools-mcp 问适不适合安装到本仓库并收编。问题=它是**通用模型中立编码运行时 MCP server**（README 定位「Give any AI chat or agent a safe pair of hands on your codebase」，Apache-2.0，PyPI `coding-tools-mcp` 0.3.0（2026-08-13），npm launcher 0.1.0，main HEAD 66b3f19，Python>=3.11，`coding_tools_mcp/` 约 8.9k LOC，仓库 244 文件含 Docker/Cloudflare Worker/desktop client/benchmarks/SWE-bench/CI），不是 DSH bundle/预设/skill：仓库内无 `dsh.bundle.patch`/`cordis.patch.yml`/`dsh.client`，也无 DSH/DeepSeek 引用。形态=固定 18 工具目录（files/search：read_file/list_dir/list_files/search_text/apply_patch/view_image；exec：exec_command/write_stdin/read_output/kill_command/request_permissions；git：git_status/diff/log/show/blame；runtime：server_info/check_exec_environment），`apply_patch` 是唯一文件写原语（staged + baseline check + atomic + rollback），safe/trusted/dangerous 权限模式只改命令策略不改 tools/list，stdio + Streamable HTTP，同时支持 MCP 2026-07-28 与 2025-11-25/2025-06-18 双 era，无 sessions，一个 workspace 一个信任域，Linux Landlock 文件系统约束。与 DSH 关系=DSH npm rc.6 自带官方 `@deepseek-ai/dsh-mcp-client` 插件（`dsh` 的 package.json dependencies 有 `^0.1.0-rc.6`），可在 `cordis.yml`/profile patch 里加一个实例把它挂成外部 MCP server：
  ```yaml
  - id: mcp-coding-tools
    name: '@deepseek-ai/dsh-mcp-client'
    config:
      serverName: codingTools
      transport: stdio
      command: uvx
      args: ['coding-tools-mcp', '--stdio', '--workspace', '/path/to/repo']
  ```
  模型侧工具名变为 `mcp__codingTools__read_file` 等；DSH mcp-client 只桥 tools（Resources/Prompts 暂不消费），而 coding-tools-mcp 恰好只暴露 tools，协议面可对接。原因=①形态不匹配：`dsh plugin add` 收 bundle 补丁，coding-tools-mcp 是独立 Python 产品（自带 Docker/Cloudflare/desktop/benchmark 生态），整体 `git subtree` 会引入非 DSH 大仓与 Python 运行时；②License 不兼容本仓库「各子项目 MIT、以 MIT 分发」约定：Apache-2.0 可分发但需保留 LICENSE/NOTICE/attribution，不是本仓库现行策略；③能力高度重叠：DSH 已有 fs/shell/sandbox/git/工具结果剪枝等原生编码能力，再挂 18 个 `mcp__codingTools__*` 工具会增加每次请求的 tool schema token 开销（本仓库画像 ~55 工具已 ~12K tokens），且形成双轨入口，默认不值得；④它可独立用 `uvx/npx` 运行，无需仓库维护。解法=判定：**不安装到 DSH profile、不收编为子项目、不做 git subtree add**；若确实想要其安全边界/原子 patch/权限模式，按上述配置作为**外部 MCP server 按需挂载**（每个 workspace 一个实例），或未来做薄 MIT bundle 只负责 insert `@deepseek-ai/dsh-mcp-client` 配置并声明官方插件依赖，**不 vendor coding-tools-mcp 源码**。涉及理念=①**安全是产品不是补丁**：workspace root 限制、绝对路径/`..`/symlink 逃逸拒绝、权限模式门控网络/展开/内联脚本/破坏性命令、Linux Landlock、`apply_patch` 原子替换+回滚、命令超时/输出预算/PTY——DSH 插件做文件/执行工具可参考「边界即契约、失败显式报」。②**固定且如实标注的工具目录**：没有 profile 切换/annotation games，权限模式只改 policy 不改 tools/list；与 DSH「工具 schema 稳定、KV cache 前缀稳定」方向一致。③**上下文经济是工程指标**：结果 summary + `structuredContent` 完整机器结果、分页/上限、序列化结果字节随版本下降 37%（dogfood）——DSH 插件应把「token/字节成本」当可度量优化项。④**无 sessions 的运行时**：每个请求自带 `_meta`，无握手状态，重连/多客户端简单；DSH 侧 mcp-client 的 reconnect 世代替换也体现「恢复不重复不泄漏」理念。⑤**合规/可复现发布**：release 流水线从同一 commit 跑 compliance + dogfood + SWE-bench 再发 PyPI/npm，匿名遥测可关；外部工具接入时「发布即验证、证据可复现」值得借鉴。⑥**库依赖优先于源码收编**：通用外部运行时用官方 MCP client 桥 + 薄配置接入，只有 DSH 形态的插件才 git subtree——与 PicGo-Core/agent-qa 的判定一致。可复现?是（git ls-remote + 浅克隆读 README/SPEC/pyproject/docs + PyPI/npm registry + 读本机 `@deepseek-ai/dsh-mcp-client` README 可复现；未安装到 DSH profile、未改本仓库代码）。

- **SandBase Harness（sandbaseai/sandbase-harness）外部调研 + 安装/收编判定（2026-08-16，判定/记录）**：用户发 https://github.com/sandbaseai/sandbase-harness 链接。问题=这是一个「本地优先、Claude Managed Agents 风格」的独立 AI Agent 运行时（TypeScript，Apache-2.0，v0.3.2，~598★/57 forks，main HEAD 9670796，浅克隆成功），不是 DSH 插件仓库；但它自带一个**真 DSH bundle**：根 package.json `dsh.bundle.patch → ./examples/deepseek-harness/cordis.yml`，patch 单行 insert `id: mcp-sandbase-harness / name: @deepseek-ai/dsh-mcp-client / transport: stdio / command: managed-agents-mcp / env: MANAGED_AGENTS_URL+MANAGED_AGENTS_API_KEY（!!js process.env）/ failOnStartupError: true`，无 `dsh.client` 半区；`src/mcp/server.ts` 用 `@modelcontextprotocol/sdk` 实现六个工具 `mcp__sandbase__list_agents/create_session/run_session/get_session/list_artifacts/stop_session`，`run_session` 聚合流事件返回 text + terminal_event + event_count，并回 `structuredContent`。原因=①它是完整运行时：Hono HTTP + SQLite + React Console + CLI/SDK + local/Docker/K8s/self-hosted 沙箱 + MCP toolsets + skills + credential vaults + audit/replay，体量和定位远超本仓库「可 `dsh plugin add` 的 bundle/预设」子项目；②License Apache-2.0 与本仓库「各子项目 MIT、以 MIT 对外分发」约定冲突；③分发有坑：npm 上 `managed-agents@0.0.1` 是另一个占位包（README 自己警告不要 `npm install managed-agents`），`@sandbaseai/sandbase-harness` 未发布，所以 README 里 `dsh plugin add managed-agents` 不能直接当作 npm 包安全安装，官方路径是 clone tag + `npm ci && npm run build && npm link` 再起 runtime + 装 bundle；④DSH 集成只是把 DSH 当 MCP client 接入外部 runtime，需要先 `managed-agents start`（http://127.0.0.1:3000），不是开箱即用插件；⑤上游验证基线是 DSH commit 47f9438，本机 npm rc.6 未实测。解法=判定：**不整体收编为本仓库子项目、不 git subtree add；当前也不建议往 DSH profile 装**（除非确实要用 SandBase 的持久会话/沙箱/审计能力）；如需体验应严格按官方 source 构建流程，在独立环境跑 runtime + MCP 桥，切勿 `npm i managed-agents`。它的 DSH 集成部分可作「纯 MCP client bundle」范式参考：官方 `@deepseek-ai/dsh-mcp-client` 单行 insert + stdio + env 透传 + `failOnStartupError`，对外部 runtime 暴露工具无需自写 host 插件；`run_session` 聚合到 idle 再返回 text/terminal_event 的「委托长任务」语义也值得 dsh-essentials 任务委托参考。可复现?是（git ls-remote + 浅克隆读 README/package.json/examples/deepseek-harness/{cordis.yml,README.md}/src/mcp/server.ts + GitHub API + npm view 可复现；未安装到 DSH profile、未改本仓库代码）。

- **BitFun（GCWing/BitFun）可借鉴点记录（2026-08-16，记录）**：用户要求把 BitFun 中可借鉴/可参考的内容独立落档（上一轮已记录安装/收编判定：不安装、不收编，本条目单独展开设计参考）。问题=BitFun 主体虽不纳入本仓库，但 `packages/dsh-acp` 与产品工程里有多个对 dsh-essentials / dsh-mac-desktop / dsh-router-standard / 未来宿主集成有参考价值的理念。解法=按对本仓库可落地度整理：
  ①**外部宿主嵌 DSH = profile + ACP，不是 bundle**：独立产品内嵌 DSH 时建
  `$DSH_HOME/profiles/<name>/`（`dsh.profile.bundles: []` + cordis.patch.yml 全量 insert）跑
  `dsh --profile`，比往用户 profile 塞插件更干净、可整体替换；dsh-mac-desktop 或未来宿主可参考。
  ②**ACP 展示层是产品决策**：官方 @deepseek-ai/dsh-acp 是 automation-only，故意不发布 tool
  calls/reasoning/plans；BitFun fork 成 IDE 可见。做 IDE/可视化客户端时「协议能通 ≠ 信息足够」，
  展示数据上 wire 按客户端设计；更优是推动官方加 verbosity 开关。
  ③**profile 依赖最小化**：profile node_modules 只放 DSH closure 外的 vendored 包
  （@agentclientprotocol/sdk、dsh-agent-spine-demo），其余从用户已装 dsh 的 flat closure 解析，
  不装第二份 harness；与我们 mode-boost/router-standard 的非 bundle 分发一致。
  ④**远程 profile 同步**：编译好的 profile tar 流经会话 transport 推到远端，stamp 一致跳过，
  无 SFTP；适合 dsh-mac-desktop 未来远程工作区/容器。
  ⑤**会话 load/resume 与 mode 锁定**：ACP loadSession 从 JSONL 回放，存储 mode 覆盖 roster
  默认；会话开始后禁止切 preset，避免日志出现新组合无法复现的工具调用；预设系统可参考
  「首轮后锁定工具集」。
  ⑥**上下文经济**：byte-stable prompt assembly 达 98.67% KV cache hit；flashgrep 跨轮索引把
  大仓搜索提速 ~36x。DSH 插件侧可借鉴「prompt 顺序/字节稳定」与「搜索工具跨轮索引」。
  ⑦**任务即界面**：Mini App 给任务生成 UI 并绑定会话 live state，与 dsh-essentials 可视化卡片
  「会话↔UI 状态绑定」同方向。
  ⑧**自托管零知识 relay**：Argon2id + AES-GCM、用户自部署；远程/外发/多设备同步功能设计时可参考。
  ⑨**工程纪律**：远程场景 first-class、profile 生成/校验脚本、i18n/theme audit；本仓库已有类似，
  可补「profile 产物防漂移」门禁。
  注意=只借鉴思想/写法，不搬源码；dsh-acp 是 fork 官方 MIT，若抽取需保留 NOTICE。可复现?是
  （读 README/AGENTS/packages/dsh-acp/docs 可复现；未安装、未改产品代码）。

- **AgentRQ 安装/收编判定 + 可借鉴点（2026-08-16，判定/记录）**：用户发 https://github.com/agentrq/agentrq 问适不适合安装到本仓库并收编。问题=agentrq/agentrq 是「人机协作任务平台」monorepo（Go/Fiber backend + Vue3 frontend + MCP server + ACP/Codex gateway + integrations/docker），不是独立 DSH 插件；其 `plugins/deepseek-harness` 才是真 DSH bundle，已发布 npm `@agentrq/dsh-plugin-agentrq@0.2.1`（Apache-2.0，`dsh.bundle.patch`→`cordis.patch.yml` 单行 insert，自带 `@deepseek-ai/dsh-mcp-client` 子 fiber + `agentrq:protocol` systemPrompt 段 + `agentrq_autopull` 工具，把 AgentRQ workspace 的任务/消息推送实时注入 DSH 会话）。原因=①技术上可安装：临时 DSH_HOME `dsh plugin --profile test add @agentrq/dsh-plugin-agentrq` 成功，`--dump-config` 出现 agentrq 行；npm 装依赖后 build/typecheck/32 测试全过；直接 import 可经 `$DSH_HOME/profiles/node_modules` 解析到全局 rc.6 的 dsh-* 模块。②但不宜直接收编：License Apache-2.0 与本仓库「各子项目 MIT、以 MIT 对外分发」约定冲突；功能强依赖 AgentRQ 远端/自托管 workspace（`url`+`token`），无 AgentRQ 账号装上无用，属外部服务集成而非通用增强；上游是 monorepo，收编需先 `git subtree split --prefix=plugins/deepseek-harness` 只取子目录，升级/维护比独立仓库复杂；npm 发布版 peerDeps 版本滞后（dsh-llm/dsh-tools/dsh-mcp-client/dsh-system-prompt 写 `^0.0.1-rc.1`，semver 不含 rc.6 的 `0.1.0-rc.6`，虽 dsh CLI 实际能加载但 pnpm 报 missing peer，独立构建解析到 rc.1 类型，属上游应修项）。解法=判定：**可单独安装试用（仅当使用 AgentRQ 时），当前不建议收编为本仓库子项目/并入 dsh-essentials**；若用户坚持收编，需先决策 License 策略（Apache-2.0 子项目保留 LICENSE/NOTICE）、把 dsh-* 移入 dependencies 或放宽 peer 到 rc.6/`*`、用 subtree split 只收 `plugins/deepseek-harness` 并补 THIRD-PARTY/README 行。涉及理念=①**服务端推送而非客户端轮询**：AgentRQ 服务端在任务创建/每 60s ticker 推送 `notifications/claude/channel`，DSH 侧只订阅不轮询，避免双投；②**一个 workspace 一个 profile**：URL 存 profile patch，`scope: single-agent` 只让一个根 agent 持有会话，防多会话重复投递；③**原文转发 + JSON 转义 framing**：推送不分类，只加 `chat_id`/`content_json` 框，防伪造字段；④**MCP 桥由插件自挂子 fiber**：`ctx.plugin(mcpClient, ...)` 与自有 workspace session 同生命周期，URL 单点配置；⑤**补齐 MCP server Instructions**：harness 不展示 server instructions，插件用 `ctx.systemPrompt.section` 补 AgentRQ 协作协议；⑥**断线指数退避 + catchUpOnStart + seen 去重**：会话断开不丢活（服务端会补推），启动 catch-up 只提速度；⑦**bundle 自包含**：npm 包只发 lib+cordis.patch.yml，README 把「安装即契约」写得很清楚；收编 monorepo 子目录必须 split。可复现?是（git ls-remote main 52721b9 + 浅克隆读 `plugins/deepseek-harness/{src,test,package.json,cordis.patch.yml,README.md}` + npm registry 0.2.1 + 临时 DSH_HOME 安装/dump-config 可复现；未安装到本机真实 profile、未改本仓库代码）。

- **Aegis（GanyuanRan/Aegis）安装/收编判定 + 可借鉴点（2026-08-16，判定/记录）**：用户发 https://github.com/GanyuanRan/Aegis 问适不适合安装到本仓库并收编。问题=它是「Aegis Method Pack」（v2.8.1，MIT，默认 main，浅克隆 HEAD c8483d6，~11MB/511 文件，22 个 Agent Skills + docs/current 基线 + benchmarks + assets + Python scripts），不是单纯 DSH 插件，而是一套多宿主「方法包」；但它的 DSH 集成是**真原生 bundle**：根 package.json `dsh.bundle.patch → ./extensions/dsh/cordis.patch.yml`，patch 单行 insert `id: aegis-method-pack / name: aegis/extensions/dsh/index.js`，index.js `inject: [skills, agents]`，用 `@deepseek-ai/dsh-skill-filesystem` 的 apply 把发现隔离到包内 `skills/`（includeDefaultRoots:false、watch:false），并在 auto 模式监听 `agent/session-start`（startup/resume/clear/compact，跳子代理）同步注入 `using-aegis` 路由 bootstrap。原因=①MIT 与本仓库 License 兼容；②形态是 bundle，不是普通 skill 包；③DSH 官方安装文档（docs/README.deepseek-harness.md）写明默认 `dsh plugin --profile <profile> add github:GanyuanRan/Aegis`，还有独立 `tests/deepseek-harness/` 边界测试；④但它也是大而全的多宿主 method pack（Codex/OpenCode/Claude/Kimi/Pi 等大量宿主适配、Python workspace 脚本、基准图表），DSH 兼容性在上游矩阵里只是「structural install，尚无 release-level fresh smoke」；⑤**本地路径安装有坑**：`dsh plugin --profile web add /tmp/Aegis` 后 pnpm 把 `node_modules/aegis` 链到 profile 外，即使 `dsh --profile web --dump-config` 触发 `$DSH_HOME/profiles/node_modules` 平铺 fallback，`import('aegis/extensions/dsh/index.js')` 仍报 `ERR_MODULE_NOT_FOUND: @deepseek-ai/dsh-llm`（Node 按真实路径解析，看不到 profile 的 flat closure）；改用 `github:GanyuanRan/Aegis#v2.8.1` 远程安装后包落在 profile 内，同样 import 通过。解法=判定：**适合作为 DSH profile 插件安装（推荐从上游 GitHub 安装，远程装后 rc.6 下 import/dump-config 实测通过）**；**有条件适合收编为独立第三方子目录 `aegis/` 或 `dsh-aegis/`（git subtree 跟随上游）**，但收编前必须解决一键脚本本地安装的模块解析：要么 install 脚本对该子项目用 GitHub `&path:/aegis` 远程子目录安装，要么给 Aegis 的 package.json 补 `@deepseek-ai/dsh-llm` + `@deepseek-ai/dsh-skill-filesystem` dependencies / 纳入仓库 pnpm workspace 后再本地 link；不建议并入 dsh-essentials（体量/定位不同）。本次只做调研+落档，未安装到 DSH profile、未 git subtree add（工作树有无关未提交修改）。涉及理念=①**thin bundle 适配器**：不复制 skill 正文、不替换 native `skill` tool，只把一个隔离的 filesystem provider 指向包内 canonical `skills/` 树，再由 host 原生 skill 加载——DSH 侧做「技能/方法包」类插件可照此最小侵入。②**生命周期同步 bootstrap**：在 plugin apply 时预读 `using-aegis/SKILL.md` 并构建好注入消息，`agent/session-start` 触发时同步 `agent.inject()`，避免首步模型与异步 skill 文件读竞争；explicit 模式关闭注入但仍可显式 `skill` 调用。③**方法包不是 runtime core**：明确无 GateDecision/PolicySnapshot/完成权威，用户指令优先，简单任务走 `Route: fast-path`，完成前给 A/B/C 证据槽 + TaskStartSnapshot + 单一 closeout 聚合——与本仓库「诚实能力边界」理念一致。④**多宿主 canonical skills + 生成视图**：同一 `skills/` 树经各宿主插件/直接拷贝/direct-child 暴露，updater 管理生成视图，且**同一时间只允许一条暴露路径**，避免重复 owner；收编多宿主项目时可借鉴「canonical 源 + 宿主视图 + 去重约束」。⑤**doctor 验证门禁**：`python scripts/aegis-doctor.py --write-config --json` 要求 `ok:true` + `workspaceSupport:available` + `configStatus:configured`，DSH 收编/安装验证可参考这种「结构化 doctor + 明确字段门禁」。验证=本机 rc.6 下：Aegis 自带 `bash tests/deepseek-harness/run-tests.sh`（不带 --integration）确定性检查全过；远程 GitHub 隔离 profile 安装 `dsh plugin --profile web add github:GanyuanRan/Aegis#v2.8.1` → `dump-config` 见 `id: aegis-method-pack` → `import('aegis/extensions/dsh/index.js')` ok；doctor 输出 `ok:true/workspaceSupport:available/configStatus:configured`。注意=①Aegis 自带 integration 脚本在 macOS 上因 `mktemp` 落在 `/var/folders` 被其安全白名单拒（只允许 /tmp、/var/tmp、$TMPDIR 前缀），但手工隔离安装已覆盖验证；②若未来收编，升级用 `git subtree pull --prefix=aegis https://github.com/GanyuanRan/Aegis.git main --squash`，并对照 THIRD-PARTY 复查本地依赖/安装修改点。可复现?是（git ls-remote + 浅克隆 + 远程隔离 profile 安装 + node import + doctor 均可复现；未安装到本机 DSH profile、未改本仓库代码）。

- **WeSight（freestylefly/wesight）安装/收编判定 + 外部调研（2026-08-16，判定/记录）**：用户发
  https://github.com/freestylefly/wesight 链接。问题=这是独立开源桌面 AI Agent 工作台
  （Electron+React+Vite+better-sqlite3，MIT，~879★/205 forks，homepage wesight.ai，latest release
  v1.0.4 2026-08-03，main HEAD 53ce05f，浅克隆 ~61MB/449 src 文件），不是 DSH bundle/预设/skill：
  仓库内无 `dsh.bundle.patch`/`cordis.patch.yml`/`dsh.client`，无任何 DSH/Cordis/deepseek-harness
  引用；唯一相关项是把独立 `deepseek-tui` CLI 当受管外部引擎（`spawn('deepseek-tui', [
  '--workspace', ..., 'serve', '--http', ...])`），与 DSH 的 `dsh-tui`/DeepSeek Harness 是不同
  项目，勿混淆。原因=本仓库子项目必须是可 `dsh plugin add` 的 bundle/预设/技能；WeSight 是完整
  Electron 桌面产品（自带内置 agent runtime、bundled OpenClaw v2026.3.2、IM Agent Hub、SkillHub、
  scheduled tasks、memory、runtime telemetry、desktop pet），体量/技术栈远超插件范围；MIT 兼容
  不是收编理由。解法=判定：**不安装到 DSH profile、不收编为子项目、不做 git subtree add**；
  如需体验可单独下载 WeSight 桌面 App 作外部宿主/多引擎控制台参考。
  可借鉴理念（已落档）：①**GUI/Cowork/Engine 三层解耦**：渲染层只消费统一 Cowork 标准事件，
  `CoworkEngineRouter` 按 `agentEngine` 切换 Claude Code/OpenClaw/内置 runtime，引擎切换时清理
  活动会话；DSH 桌面壳/多引擎 UI 可借鉴「统一会话事件 + 引擎路由器 + 引擎状态机」，避免 UI 感知
  具体引擎。②**外部 CLI 托管模式**：`DeepSeekTuiRuntimeManager` spawn CLI → 找空闲端口 + 随机
  token → `serve --http --host 127.0.0.1 --auth-token` → 轮询 `/health` 就绪，退出时
  SIGTERM→2s SIGKILL；接入任意外部 agent CLI 到 DSH 桌面壳可照此「子进程 + 本地 HTTP + 健康检查
  + 生命周期清理」。③**配置同步与模式映射**：`OpenClawConfigSync` 把 UI 模型/executionMode 映射
  到外部 runtime 配置（local→sandbox.mode=off、auto→non-main、sandbox→all），切换后按需重启
  网关；与 DSH 的 settings.mutate/外部 provider 同步思路一致。④**运行时遥测**：TTFT、输出阶段
  TPS、工具延迟、步数、状态、时长采集到 SQLite 并在 dashboard 展示；dsh-essentials 使用统计可扩展
  「工具延迟/步数」维度。⑤**IM Agent Hub**：Feishu 等 IM 消息路由到 OpenClaw/Hermes/Claude/Codex，
  每引擎 bot profile；若 DSH 要做 IM 桥可参考「统一入口 + 按引擎配置」而非每平台一套逻辑。
  ⑥**SkillHub/Scheduled Tasks/Memory/Pet**：技能市场、定时任务、记忆抽取、桌面宠物都是独立桌面
  产品常见功能，可作 dsh-essentials/dsh-mac-desktop 功能规划参考，但无需收编。⑦**Electron 打包/
  发布**：electron-builder + macOS 签名/公证/staple + Windows NSIS + SHA256，与 dsh-mac-desktop
  （Swift/Tauri 轻壳）路线不同，可参考 CI 产物校验与发布清单纪律。注意=①bundled OpenClaw 是另一
  个 agent 运行时，与 DSH 无集成；②Node>=24 大工程，不适合插件化；③`deepseek-tui` 不是 DSH，
  名字像但生态不同。可复现?是（git ls-remote + 浅克隆读 README/docs/architecture/package/src +
  `gh repo view` 可复现；未安装、未改本仓库代码）。

- **agent-qa 可借鉴点记录（2026-08-16，记录）**：把 vostride/agent-qa 调研中值得 DSH 插件/预设/技能借鉴的设计理念落档，用户只要事项和想法、不要源码。解法=按「对本仓库可落地度」整理：①**自然语言测试即代码 + QA 工件版本化**：测试/套件/钩子/记忆/配置全部是 YAML+git 可 diff 文件，每个 run 产物（artifacts/logs/memory）也有版本可回看；DSH 做「任务模板/回归验证/可复现工作流」时可借鉴「能力与工件都进仓库、可 diff/review/复用」，而不是只把结果留在会话。②**自愈执行 + 经验回写**：任一子动作（click/fill/select）失败后不立即判失败，而是重新观察 UI、在当前 run 内换路径重试；把被治愈的步骤 curate 进 execution memory 供未来 run 使用；action cache 复用已验证计划降 planner/token/耗时。DSH 插件做浏览器/QA/自动化工具时可做「失败重试 + 经验回写 + 计划缓存」三层，而非一次性执行。③**多面交付 + skill 分层**：同一能力同时有 CLI、本地 dashboard、MCP、skills；skills 按 authoring/debug-fix/result-triage 拆开，分别强调 canonical ID、schema 引用、验证后运行、证据规则（优先 MCP 证据、禁止脑补 selector/日志/截图）；DSH skill 可参考这种「按生命周期拆技能 + 严格前置验证 + 证据闭环」。④**MCP 桥接 DSH 的具体姿势**：`@vostride/agent-qa-mcp` 提供 `agent_qa_*` 工具（stdio/HTTP），DSH dsh-tools 明确支持「一 MCP server 一插件：发现工具后用其 schema 调 `ctx.tools.register()`」；若未来想让 DSH 会话直接用 agent-qa，建议写薄 MIT bundle 做 MCP client→`ctx.tools.register()` 桥，只依赖 `@vostride/agent-qa-mcp`，不 vendor agent-qa 源码（FSL-1.1-ALv2 不并入本仓库）。⑤**沙箱 hooks**：Node/Bun/Python/Bash 钩子在隔离 Docker 容器跑 setup/teardown/seed，结果结构化传回 run；DSH 侧可对应 subprocess/sandboxPolicy 表达，hook 与测试主体职责分离。⑥**BYO LLM**：OpenAI/Anthropic 兼容、Gemini、本地、Codex/Claude Code 订阅多后端；DSH 已有 provider 抽象，方向一致，可继续把「外部订阅认证」做成独立可选包（如 @vostride/agent-qa-subscription-auth 的形态）而不是内置。注意=①只借鉴理念/写法，不搬源码（FSL-1.1-ALv2 非 MIT，两年后才转 Apache-2.0）；②若落地 MCP 桥，先用 Inspect Provider / npm 包产物核对 `ctx.tools.register()` 的 ToolDefinition 契约；③agent-qa 本身 Node>=24、Playwright/Appium/Docker 重，DSH 侧只做桥或工具，不整体收编。可复现?是（git clone / npm view agent-qa 可复现；未安装、未改本仓库代码）。

- **Anionex/agent-vision-toolkit 安装/收编判定 + DSH 子包调研（2026-08-16，判定/可借鉴点）**：用户发 https://github.com/Anionex/agent-vision-toolkit 问适不适合安装到本仓库并收编。问题=该 URL 是一个「视觉工具箱」父仓库（默认 main，HEAD 77c24ad，2026-08-16，MIT，浅克隆 ~42MB）：内含 Python 3.11+ 视觉 CLI（bin/{glance,ground,detect,trace,crop} + ground.py/detect.py + vision_client.py/vision_proxy.py）、vision-tools skill、Codex/Claude Code/Pi/OpenCode extensions，以及一个 Git submodule `dsh-vision-toolkit`——后者才是真正可 `dsh plugin add` 的 DSH Profile Bundle（独立仓库 Anionex/dsh-vision-toolkit，MIT，v0.1.9，HEAD 2192c98，npm @anionex/dsh-vision-toolkit 0.1.9）。原因=①父仓库整体不是 DSH bundle（无 dsh.bundle.patch/cordis.patch/dsh.client），不适合直接收编为子项目；②但 dsh-vision-toolkit 是原生 bundle：`package.json dsh.bundle.patch → cordis.patch.yml` 单行 insert `id: vision-toolkit`，`dsh.client` 声明 Web 半区，形态与本仓库约定一致，MIT 兼容 rc.6。解法=判定：父仓库不直接收编；其 DSH 子包技术上适合收编/安装，但**用户最终决定不安装、不收编，仅作理念落档**；本次未安装到 DSH profile、未 git subtree add、未改仓库代码。若未来改变主意再执行：先提交/stash 脏工作树 → `git subtree add --prefix=dsh-vision-toolkit https://github.com/Anionex/dsh-vision-toolkit.git main --squash -m "chore: merge dsh-vision-toolkit (third-party, MIT)"` → README/THIRD-PARTY 各补一行 → `pnpm run verify:portable` → 可选 `dsh plugin --profile web add ./dsh-vision-toolkit`。要点=①10 个 `vision_*` 工具（glance/ground/detect/crop/trace/pixel_diff/long_screenshot_ocr/extract_foreground/dominant_colors/html_screenshot）+ 自带 `vision-tools` skill；②**渐进暴露**：初始只有 `vision_toolkit_activate`，Agent 加载 skill 后才挂 10 个 schema，健康/版本永远不进模型 schema；③**managed 运行时**：vendor 固定上游快照 + UPSTREAM_MANIFEST 哈希 + requirements.lock（pillow/numpy/vtracer），uv→venv 兜底，prepare 成功才原子切 generation；④**Credentials 只存引用**：Settings 写 key 后浏览器只回显引用，每次调用解析并注入子进程 env，错误/日志脱敏；⑤**Artifacts**：只写 `<workspace>/.dsh-vision-toolkit/artifacts`，带签名 URL 预览/下载，无 HTTP host 时降级 Open file；SVG fail-closed 校验；⑥**image-input variants**：为 text-only 模型注册 `<model> (Vision Toolkit)` 变体，粘贴自动切变体走原生附件流，仅 wire 上把图改写为描述文本、会话日志不动——**与 dsh-essentials 内置 ModLens/paste-input 高度重叠**（ModLens 也做变体+粘贴接管），v0.1.8 前旧结论「工具驱动不冲突」已过时，建议二者选一或关闭一方的 imageInputVariants/paste 接管并先做共存实测。具体核对=①工具名不撞：ModLens=`modlens_read_image`，Vision Toolkit=`vision_*` 十个，skill 名 `modlens` vs `vision-tools`；②bundle patch id 不撞：现有 `essentials`/`desktop-runner`，新包 `vision-toolkit`；③HTTP 路由不撞：ModLens=`/modlens/paste`+`/modlens/config`，Vision=`/_dsh/vision-toolkit/paste-policy`+`paste-images`；④模型变体不撞但重复：ModLens=`(modlens vision)`/`modlens-*`，Vision=`(Vision Toolkit)`/`vision-toolkit-*`，同一 text-only 模型会出现两组变体；⑤粘贴监听都会 `document.addEventListener('paste', ..., true)`，且都做 wire 图片块改写，可能竞态/双处理；⑥slot 有交集但 id 不同：共用 `conversation.input.dock`（paste-input id=`dsh-paste-input-dock`，Vision id=`vision-toolkit-pasted-images`）、`settings.section`（essentials 多个 vs Vision id=`vision-toolkit`）、`tool.call.toolview`（visualize vs Vision 各工具 key），一般可共存但视觉相关 UX 会堆叠；⑦运行时依赖不冲突：Vision 额外要 Python/uv 托管环境，现有仓库无此依赖；文件级新增 `dsh-vision-toolkit/` 目录不覆盖现有文件。⑦诚实能力边界：P2 稳定 `ctx.visionToolkit` 服务在无独立消费方前不发布。轻量对比=ModLens 明显更轻：npm unpacked ~0.53MB（DSH 内只含 dsh/ + dist/main.js ~272KB），单工具 `modlens_read_image`，纯 Node 跑内置 dist/main.js，无 Python/uv；Vision Toolkit npm unpacked ~5.8MB（约 11 倍），10 个 `vision_*` 工具 + skill + Artifacts/Web Settings，且 managed 运行时要 Python 3.11+/uv（pillow/numpy/vtracer，首次联网）。结论=只「看图/贴图识别」选 ModLens；要 grounding/detect/crop/pixel diff/OCR 管线/UI 还原等重能力才需要 Vision Toolkit。注意=Node 需 ^22.19||>=24，Python 3.11+，managed 首次运行要联网装 Python 包；`pnpm run verify:portable` 本地已跑通过（28 required files/25 JS/26 images）。可复现?是（git clone + verify 可复现；未安装、未改本仓库代码）。

- **brooks-lint 安装/收编判定（2026-08-16，判定/记录）**：用户发 https://github.com/hyhmrright/brooks-lint 问适不适合安装到本仓库并收编；追问「再分析，还不明朗」。问题=它是纯 Agent Skills 代码质量工具（v1.5.0，MIT，main HEAD d4b5c408，浅克隆 3.4MB/skills 144KB，114 测试通过），不是 DSH bundle/预设：仓库内无 `dsh.bundle.patch`/`cordis.patch.yml`/`dsh.client`，无 Cordis 代码；DSH 接入方式是标准 SKILL.md Agent Skills，v1.5.0 新增 `docs/dsh-setup.md`，安装器 `scripts/install.sh dsh` 把 `skills/` 六个 `brooks-*` + `_shared/` 平铺到 `$DSH_HOME/skills`（`--project` 到 `.dsh/skills`）。原因=DSH rc.6 `@deepseek-ai/dsh-skill-filesystem` 契约确认：发现只扫 `<root>/<name>/SKILL.md` 或 `<name>.md`（一层平铺），名字必须 kebab-case，`../_shared/` 靠兄弟目录解析；brooks-lint 的 `brooks-*` 和 `_shared` 正好满足，实测 `/tmp/brooks-lint/scripts/install.sh dsh --dir /tmp/brooks-dsh-skills` 安装 6 skills 成功。本仓库当前子项目均为 `dsh plugin add` 的 bundle/预设；若把 brooks-lint 收进 `dsh-brooks-lint/`，`scripts/install.sh` 会自动发现其 package.json 并尝试 `dsh plugin add`（会失败/无用），需要新增 skill 安装分支或改用非 `dsh-*` 目录，且仓库「每个子目录都是独立 DSH 插件/bundle」的契约要改。收编可行但收益低：上游多平台内容（Claude/Codex/Gemini/Cursor 等）与 DSH 无关，纯 DSH 可用部分只有 144KB skills；本仓库已有外部 Agent Skill 先例（gpt-image-2-style-library / dot-skill）都是装到 `~/.agents/skills` 而不收编。解法=判定：**适合作为 DSH 外部 Agent Skill 安装（一条命令），现阶段不建议作为本仓库 bundle 收编/不做 git subtree add**；若用户后续要自维护/离线分发，再以 `brooks-lint/`（非 dsh-*）收编为 skill 源目录并改 install 脚本，或做薄 DSH skill 包装。涉及理念=①**经典工程书→可执行诊断框架**：把 12 本经典书（人月神话/Code Complete/Refactoring/Clean Architecture/程序员修炼之道/DDD/A Philosophy of Software Design/SE@Google/单元测试艺术/Google 测试/遗留代码/xUnit Test Patterns）提炼为 6 个生产代码衰减风险（R1 认知过载/R2 变更传播/R3 知识重复/R4 意外复杂度/R5 依赖混乱/R6 领域模型失真）+6 个测试衰减风险（T1 测试晦涩/T2 脆弱/T3 重复/T4 Mock 滥用/T5 覆盖幻觉/T6 架构不匹配），把「原则」变成可触发、可诊断、可打分的检查维度。②**Iron Law：先诊断后开方**：每条 finding 必须 Symptom→Source→Consequence→Remedy，禁止跳过诊断直接给修复；这是让 AI 审查可追溯、可防「先射箭再画靶」的关键。③**可复现/诚实边界**：解析器用 30 份冻结真实报告做确定性 benchmark（severity 计数 30/30、risk-code 0 FP/0 FN、SARIF 合法 30/30），57 场景 eval 区分结构 vs live；README 明确 parser 只测“报告解析保真”，不声称 finding 一定正确，live 指标会波动。④**多平台标准 Agent Skills 分发**：SKILL.md + 平铺布局 + `_shared/` 共享框架 + kebab-case 名字，让同一套技能被 Claude/Codex/Gemini/Cursor/OpenCode/DSH 等原生发现；DSH 也遵循此契约，所以「非 bundle」不等于「不能装」。⑤**工程自举**：仓库用 `npm test`（114 个）守护自身文档/版本/安装器/解析器一致性，`npm run validate` 校验 guide 步骤连续性、README 版本引用、平台清单；做插件/技能类收编前可先看对方是否自带自测。可复现?是（git ls-remote + 浅克隆读 README/docs/dsh-setup/scripts/install.sh/skills + npm test 114 通过 + /tmp 安装器实测可复现；未安装到本机 DSH、未改本仓库代码）。

- **BitFun（GCWing/BitFun）安装/收编判定 + 可借鉴点（2026-08-16，判定/记录）**：用户发
  https://github.com/GCWing/BitFun 问适不适合安装到本仓库并收编。问题=BitFun 是独立桌面 AI Agent
  （README 定位「A desktop AI agent that turns every task into an app you can open」），MIT，
  main HEAD 8aad825，v0.2.18；形态=Rust workspace + React/Tauri 全栈（desktop/CLI/server/
  relay/mobile-web/installer/mini-app market），Cargo workspace 数十 crate，仓库体积大
  （codeload tar gzip 原始解压 ~318MB，下载 60s 超时只部分解压）。它**不是 DSH bundle/预设/
  skill**：根仓库无 `dsh.bundle.patch`/`cordis.patch.yml`/`dsh.client`；与 DSH 的关系是**外部
  宿主**——把 DSH 当可替换 Agent runtime，通过 `packages/dsh-acp` 的 ACP 桥 + `dsh --profile
  bitfun-acp` 拉起用户已装的 harness，读取用户自己的 `~/.dsh/settings.yaml` 与
  `.credentials.yaml`。唯一 DSH 形态组件是 `packages/dsh-acp`（private @bitfun/dsh-acp v0.0.1，
  MIT，fork 官方 @deepseek-ai/dsh-acp + dsh-acp-demo）：把官方 automation-only ACP 故意不下发
  的 tool calls/reasoning/plans 发布给 IDE；构建为 `$DSH_HOME/profiles/bitfun-acp/` profile
  （package.json `dsh.profile.bundles: []` + 生成 cordis.patch.yml + presets
  standard/code/minimal），**不是 `dsh plugin add` 的 bundle**。原因=本仓库子项目必须是可安装/
  维护的 DSH 插件、bundle 或预设；BitFun 主体是完整独立 agent 运行时（自己的 UI/agent loop/
  tool/远程/桌面），体量与 Rust+React 技术栈远超插件范围，整体收编会破坏 monorepo 插件边界；
  MIT 兼容不是收编理由。解法=判定：**不安装到 DSH profile、不收编为子项目、不做 git subtree
  add**；如需体验可单独下载 BitFun 桌面 App（外部宿主，与 DSH 并行）。其 `packages/dsh-acp`
  若未来要做「IDE 版 DSH」可单独抽取成独立 profile 源，但更优路径是推动上游
  @deepseek-ai/dsh-acp 增加 verbosity/presentation 开关，避免长期维护 fork。
  涉及理念=①**外部宿主嵌 DSH = profile + ACP，不是 bundle**：独立产品要内嵌 DSH 时，建
  `$DSH_HOME/profiles/<name>/`（空 bundle 列表 + cordis.patch.yml 全量 insert）跑 `dsh
  --profile`，比往用户 profile 塞插件更干净、可整体替换。②**ACP 展示层是产品决策**：官方
  dsh-acp automation-only 不发布 tool/reasoning/plan，IDE 场景需要 fork 补发；做外部客户端时
  「协议能通 ≠ 信息足够」，展示数据是否上 wire 按客户端需要设计。③**profile 依赖最小化**：
  profile 的 node_modules 只放 DSH closure 外 vendored 包（@agentclientprotocol/sdk、
  dsh-agent-spine-demo），其余从用户已装 dsh 的 flat closure 解析，不装第二份 harness；
  与我们 mode-boost/router-standard 的非 bundle 分发思路一致。④**远程 profile 同步**：把编译好
  的 profile tar 流经会话 transport 推到远端，stamp 一致跳过，无 SFTP，适合容器/SSH 远程
  工作区。⑤**会话 load/resume 与 mode 锁定**：ACP loadSession 从 JSONL 回放，存储 mode 覆盖
  roster 默认；会话开始后禁止切 preset，避免日志出现新组合无法复现的工具调用；预设系统可参考
  「首轮后锁定工具集」。⑥**上下文经济**：byte-stable prompt assembly 达 98.67% KV cache hit，
  flashgrep 跨轮索引把大仓搜索提速 ~36x；DSH 插件侧可借鉴「prompt 顺序/字节稳定」与「搜索工具
  跨轮索引」。⑦**任务即界面**：Mini App 给任务生成 UI 并绑定会话 live state，与
  dsh-essentials 可视化卡片的「会话↔UI 状态绑定」同方向。⑧**自托管零知识 relay**：Argon2id +
  AES-GCM、用户自部署，远程/外发功能设计时可参考。注意=①codeload 下载超时/截断，仅部分解压
  （根文档、Cargo.toml、packages/dsh-acp 完整）但已足够判定形态；②`src/crates/adapters/
  dsh-adapter` 在 Cargo members 中但未在截断包里读到，判定不受影响；③dsh-acp 是 fork 官方
  MIT，若未来借鉴/抽取需保留 NOTICE 与 MIT 归属。可复现?是（git ls-remote + codeload tar 部分
  解压读 README/AGENTS/package/Cargo/packages/dsh-acp 可复现；未安装、未改本仓库代码）。

- **agent-qa（vostride/agent-qa）安装/收编判定 + 可借鉴点（2026-08-16，判定/记录）**：用户发 https://github.com/vostride/agent-qa 问适不适合安装到本仓库并收编。问题=它是独立「自改进 Agentic QA harness」（default main，浅克隆 HEAD 22636e1（2026-08-03），npm agent-qa@0.1.21，TypeScript，~831★，13M/840 文件，Node>=24 + pnpm workspace + turbo），不是 DSH bundle/预设/skill：仓库内无 `dsh.bundle.patch`/`cordis.patch.yml`/`dsh.client`，无任何 DSH/Cordis 集成（仅测试里出现 deepseek-chat 作 LLM provider）；形态=CLI + 本地 dashboard（SQLite）+ MCP server + 3 个 SKILL.md（authoring/debug-fix/result-triage）+ Playwright/Appium 适配 + Docker hooks。原因=①形态不匹配：`dsh plugin add` 只收 bundle 补丁，agent-qa 是独立大 monorepo（9 个包，840 文件，Playwright/WebdriverIO/Appium/Docker/Node>=24），整体收编会引入非 DSH 的 QA 运行时；②License 不兼容：FSL-1.1-ALv2（Functional Source License，两年后转 Apache-2.0，NOTICE 版权 Pranshu Chittora），非 MIT/OSI，本仓库以 MIT 分发且各子项目均为 MIT，直接 git subtree 收编会把 FSL 文件带进 MIT 仓库，无法重授权；③它的 skills 虽可被 DSH 扫 `~/.agents/skills` 发现，但依赖 agent-qa MCP/CLI 运行时，不是独立可用 skill。解法=判定：**不安装到 DSH profile、不收编为子项目、不做 git subtree add**；如需使用建议独立 `npm install -D agent-qa` / `npx agent-qa init` 跑 QA，与本仓库无关；若未来想让 DSH 会话直接调 agent-qa，可做薄 MIT bundle 桥接其 MCP server（`@vostride/agent-qa-mcp`）到 `ctx.tools.register()`（DSH dsh-tools 明确支持「一 MCP server 一插件」模式），只依赖不 vendor 源码。涉及理念=①「自然语言测试即代码」：测试/套件/钩子/记忆/配置全以 YAML+版本控制文件存在，可 diff/review/复用，值得 DSH 任务模板/回归场景参考；②「自愈执行 + 记忆」：子动作失败后重观察 UI 改走路径、把治愈步骤写进 memory、action cache 复用已验证计划降低 token/耗时——DSH 插件做浏览器/QA 工具可借鉴「失败重试 + 经验回写」而非一次性执行；③「多面交付」：CLI+dashboard+MCP+skills 同一能力多入口，skills 按 authoring/debug-fix/result-triage 拆分并强制 canonical ID/schema 引用/证据规则（优先 MCP 证据、禁止脑补 selector/日志）——DSH skill 分层可参考；④「沙箱 hooks」：Node/Bun/Python/Bash 钩子跑隔离 Docker 容器做 setup/teardown/seed，DSH 侧可用 subprocess/sandboxPolicy 表达；⑤「BYO LLM」：OpenAI/Anthropic 兼容、Gemini、本地、Codex/Claude Code 订阅多后端，DSH 已有 provider 抽象，方向一致。可复现?是（git ls-remote + 浅克隆 + npm view agent-qa 可复现；未安装、未改本仓库代码）。

- **EchoBird 可借鉴点确认（2026-08-16，确认）**：用户要求把 EchoBird 中值得借鉴的内容落档。问题=是否已把 EchoBird 对本仓库（dsh-mac-desktop / dsh-essentials / host 侧）可落地的理念完整存档。原因=此前已有「EchoBird 可借鉴点记录」详细条目，但位置较深，且本对话先做的是安装/收编判定，容易被忽略。解法=确认已落档并在此汇总核心：①**外部切 DSH 模型的配置面**：写 `~/.dsh/settings.yaml` 的 `llm-pi-ai.providers.echobird` 路由（displayName/apiKeyEnv/api/baseURL/models）+ `agent-default-model` 选择器，密钥写 `~/.dsh/.credentials.yaml` 的 `ECHOBIRD_API_KEY`，restore 时反写删除；做 dsh-mac-desktop 模型切换外部接口可直接照此契约，YAML 用 serde_yaml_ng 避免 PyYAML 裸 `off` 坑（本仓库已踩过）。②**DSH zstd 会话日志直读契约**：`<DSH_HOME|~/.dsh>/sessions/<project>/<session>/session.jsonl[.zstd]` 为 checksummed 多帧 concat，首行 header，事件含 session/title（最新胜出）、user/message、turn/start（计轮数）；Rust `zstd::stream::read::Decoder` 与 JS node zlib 逐帧重写互证。③**`dsh web` 进程管理**：按平台探测 dsh 路径（%APPDATA%\npm、/opt/homebrew/bin、/usr/local/bin 等），spawn 后轮询 127.0.0.1:3080 再开浏览器，切模型后 kill+重启保证确定性，EADDRINUSE 容忍。④**tools/<id>/{config,paths}.json 工具管理抽象**：统一 apply/restore，适合未来桌面 App Manager，DSH 插件侧不需要。⑤**外部 agent 循环防护（低优先）**：MAX_CONTEXT_BYTES≈300KB 字节预算、同 tool+args 哈希环形缓冲 3 次判循环、MAX_TOOL_LOOPS=150 兜底。⑥**本地 LLM 管理（背景）**：vLLM/SGLang/llama.cpp + GGUF + Anthropic↔OpenAI 代理，独立产品能力。完整原文见 NOTES 内「EchoBird 可借鉴点记录」。可复现?是（NOTES 内可查原文；未新增代码）。

- **PicGo-Core 安装/收编判定（2026-08-16，判定）**：用户发 https://github.com/PicGo/PicGo-Core 问适不适合安装到本仓库并收编。问题=它是通用图片上传工具/库（v3.0.1，MIT，master 95db432，Node>=20.19，源码 ~20.5k LOC/1.8MB，npm 包名 `picgo`），不是 DSH bundle/预设/skill：仓库内无 `dsh.bundle.patch`/`cordis.patch.yml`/`dsh.client`，无任何 DSH/Cordis 引用；形态是 CLI + Node API（`import { PicGo } from 'picgo'`）+ 可选 HTTP server（Hono，`picgo server`，支持 multipart/clipboard 上传与 secret 鉴权）+ 自带 PicGo 插件系统与云同步（cloud.picgo.app），内置 smms/github/imgur/qiniu/tcyun/upyun/aliyun/picgoCloud 上传器，配置落在 `~/.picgo/config.json`。原因=本仓库子项目必须是可 `dsh plugin add` 的 bundle/预设/技能，PicGo-Core 是独立通用 npm 包，虽然 MIT 兼容，但整体收编会引入非 DSH 的 2 万行 TypeScript + 大量依赖（axios/hono/inquirer/ejs 等）和它自己的插件生态/云服务，与本仓库插件边界不符；直接 `dsh plugin add picgo` 无法安装（非 bundle），`git subtree` 收编只会造成维护双轨。解法=判定：**不安装到 DSH profile、不收编为子项目、不做 git subtree add**；本机要单独用可 `npm install -g picgo`，与仓库无关。若未来 DSH 需要图片上传能力，建议做薄 DSH bundle 包装器而非收编源码：a) 把 `picgo` 作 npm dependency 在 host 侧 `new PicGo()` + `picgo.upload([path])`；b) 或 spawn `picgo upload <file>` / 调 `picgo server` HTTP 接口，把结果（imgUrl/items）转成 DSH 工具返回；上传器与凭据仍由 PicGo 自己的 `~/.picgo/config.json` 管理，DSH 侧不持久化第三方 token。涉及理念=①「外部运行时≠插件」：MIT 只解决可否复制，形态匹配（bundle/patch/服务契约）才决定可否收编；②「库依赖优先于源码收编」：通用库用 npm 依赖/子进程接入，只有 DSH 形态的插件才 git subtree；③「重活放 host、凭证隔离」：上传/网络/第三方登录放 host 侧，client 只收 JSON；④「外部服务合规」：SM.MS/GitHub/云服务等有各自防盗链/登录态/隐私边界，README 需写清楚会把文件发到哪个第三方。可复现?是（git ls-remote + 浅克隆读 package.json/README/src 可复现；未安装、未改本仓库代码）。

- **DeepTide（paean-ai/deeptide）安装/收编判定 + 可借鉴点（2026-08-16，判定/记录）**：用户发
  https://github.com/paean-ai/deeptide 问适不适合安装到本仓库并收编。问题=DeepTide 是独立 AI
  coding agent（README 自称「Built by DeepSeek, for DeepSeek」，但 NOTICE 声明与 DeepSeek/
  Anthropic 无隶属，勿当官方项目），不是 DSH 插件/bundle/预设/skill：默认 main，HEAD 4604b17
  （2026-07-08），MIT，浅克隆 ~18MB；仓库内无任何 `dsh.bundle.patch`/`cordis.patch.yml`/
  `dsh.client`，也无 DSH 字样。形态=三合一社区入口：①macOS 原生 Swift App（deeptide.sh 分发）；
  ②TypeScript/Bun CLI `deeptide`/`tide`（npm 0.11.8，bin.js 只是 thin redirect：设
  `ZERO_CLI_INVOKED_AS=tide` 后 import `@paean-ai/zero-cli/dist/_cli.js`，CLI 源码在上游
  zero-cli，运行需要 Bun）；③Rust 移植 `deeptide-rs`/`deeptide-gui`（crates
  deeptide-cli/core/gui/host，eframe/egui 桌面 GUI 与 CLI 共享 `~/.config/tide/settings.json`
  和会话存储）。另含 native/ 本地推理：`ds4`（DeepSeek V4 Flash Metal 引擎，MIT+ggml 归属）
  和 `dsgo`（Swift 本地 OpenAI/Anthropic 兼容网关），skills/ 10 个纯 SKILL.md 文档技能，
  samples/ 大量像素游戏/模板（~8.4MB）。原因=本仓库子项目必须可 `dsh plugin add` 的
  bundle/预设/技能；DeepTide 是独立 agent 运行时（自有 agent loop/tool/permission/memory/
  CLI/GUI），与 DSH 是同类替代而非插件扩展，体量/技术栈（Bun+Swift+Rust+原生推理）也远超
  插件范围。解法=判定：**不安装到 DSH profile、不收编为子项目、不做 git subtree add**；MIT
  兼容不是收编理由。如需体验可单独全局装 `bun add -g deeptide` / `npm install -g deeptide-rs`
  （外部 CLI，与 DSH 并行），或把其 skills/ 中可用的纯 SKILL.md 拷到 ~/.agents/skills 单独
  试用；若要 DSH 侧调用可未来写薄适配 bundle 包 `tide` 子进程，但当前不建议。
  可借鉴理念（已落档）：①**thin redirect / 单一事实源**：deeptide npm 包只留 launcher+元数据，
  全部引擎在上游 zero-cli，品牌包不重复实现；我们已有 dsh-tui launcher 与 router-standard
  「上游=源仓库」先例，发布时仍应坚持「薄壳包只转发、不 fork 引擎」。②**多形态共享一套契约**：
  macOS App / TS CLI / Rust GUI 通过 tide-spec 共享工具目录/斜杠命令/hook 事件/模型别名，CLI
  和 GUI 还共享同一 settings/session 文件，避免各端漂移；dsh-mac-desktop/headless/web profile
  可参考「接口契约 + 同一存储」来对齐。③**本地推理用稳定 HTTP 契约**：dsgo 暴露
  OpenAI/Anthropic 兼容端点并把请求路由到 ds4/llama-server，DSH 侧只要把本地网关配成 provider
  即可接入；任何本地运行时都应优先做兼容 API 面而非私有协议。④**npm 发布用 files 白名单**：
  native/ 源码留在 GitHub 供审阅/自建但不进 tarball；我们若未来发布大件/原生件可沿用「源码在
  仓库、发布物白名单」的分发纪律。⑤**纯 SKILL.md 文档技能**：DeepTide skills/ 是 sample-derived
  文档型 playbook，不绑运行时，agent 可廉价加载；与我们 ~/.agents/skills 共享目录思路一致，
  适合沉淀「玩法/视觉/交付/调研」类可复用技能。注意=①其 CLI 核心在 @paean-ai/zero-cli（源自
  Claude Code，MIT），收编/参考需按上游 NOTICE 处理；②本地 ds4 涉及 GGML 归属，若借鉴须保留
  native/ds4/LICENSE。可复现?是（git ls-remote + 浅克隆 HEAD 4604b17 读 README/package/
  Cargo/native/README/skills 可复现；未安装、未改本仓库代码）。

- **EchoBird 安装/收编判定（2026-08-16，判定）**：用户发 edison7009/EchoBird 问适不适合安装到本仓库并收编。问题=它是独立 Tauri 2 桌面产品（main ff9de43，v5.6.5，MIT），不是 DSH bundle/预设/skill：仓库内无 `dsh.bundle.patch`/`cordis.patch.yml`/`dsh.client`，只有 `tools/dsh/{config,paths}.json` + `docs/api/tools/install/dsh.json` 把 DSH 当受管 CLI（npm 全局装 `@deepseek-ai/dsh`、`dsh web` 起 127.0.0.1:3080、写 settings.yaml provider + agent-default-model + .credentials.yaml 切模型、直读 zstd 会话日志）。原因=本仓库子项目必须是可 `dsh plugin add` 的 bundle/预设/技能，EchoBird 是独立桌面 App（Rust ~23k 行 + 前端多页），形态与体量都不匹配；MIT 虽兼容但整体收编会引入庞大非插件代码。解法=判定：**不安装到 DSH profile、不收编为子项目、不做 git subtree add**；如需体验可单独下载 EchoBird 桌面 App（外部宿主/工具管理器），与本仓库只做设计互参（外部切模型配置面、zstd 多帧会话日志直读、dsh web 进程管理），已有外部调研与可借鉴点记录。可复现?是（git ls-remote + 浅克隆读 tools/dsh、docs/api/tools/install/dsh.json 可复现；未安装、未改本仓库代码）。

- **dsh-web-ui（zhu1090093659/dsh-web-ui）可借鉴点记录（2026-08-16，记录）**：把 dsh-web-ui 调研中值得本仓库（dsh-essentials / dsh-mac-desktop / dsh-router-standard）借鉴的工程思想与写法落档，用户只要事项和想法、不要源码。解法=按「对本仓库可落地度」整理：①**聚合包自动生成器**：`aggregate.yml` 用 `patchFrom`（汇总子包 cordis.patch.yml insert 行）+ `deps`（子包进 dependencies）+ `self`（聚合包自身 host/client），`scripts/aggregate.mjs` 生成聚合包 patch 并提供 `--check` 防漂移；我们 dsh-essentials 是手写合并，可借鉴「清单驱动生成 + 一致性门禁」降低维护成本。②**shared 运行时单一事实源 + 同步副本门禁**：settings 卡/轮询护栏/DSH_HOME 等跨包模块放 shared/，包内同名文件由 `sync-shared.mjs` 生成，`test:scripts` 含 drift 门禁；我们脚本已有 check-inject/package-consistency，可把「跨包共享代码」也纳入同款同步防漂移。③**设置页一级分区 + 插件子槽归组**：`settings.section`（alwaysOpen 直接展开）作一级菜单，`web-ui.plugin.item` 子槽把多个插件的设置卡归到同一组，并注意先声明子槽再让其他卡注入；我们设置卡片已不少，可借鉴「先分组再展开」的导航结构。④**皮肤中心“先试穿再应用”**：试穿即时生效、退出完全还原、满意再应用；皮肤资产全打进一个 dsh-skins 包，启用互斥由 `dsh-skin use` 管 `~/.dsh/cordis.patch.yml` managed 区段，避免每皮肤一个 npm 包。若我们未来做主题/皮肤能力，这是低维护分发模型。⑤**移动端远程的配对与降级**：扫码/链接一次性限时配对令牌，可一键吊销；SSE 实时推送，隧道不支持 SSE 时自动降级轮询（收发正常、延迟几秒）。适合 dsh-mac-desktop/未来远程能力参考。⑥**真实服务驱动的面板类插件**：task-board 用 `session.prompt` 真实执行并回写状态，aionui-panel 用 host 侧 fs/git 服务，ssh 用 ssh2 连接池 + 端口转发只监听 127.0.0.1 + 集群并发 + agent 工具共用同一配置；说明「UI 只是壳、重活放 host、配置单点」是成熟插件共同模式。⑦**图像理解不进会话**：describe_image 调 OpenAI 兼容视觉端点，只有返回文本进会话，图片本身不落会话记录；和我们的 vision-any/ModLens 思路一致，可强调“原始图片不外泄/不持久化”作为安全卖点。⑧**两阶段预设（梁神）**：先 Minimal 双工具锚定轨迹，再切 Code Mode 全工具，带 fallback 门控；与 router-standard 的“简单任务少工具、复杂任务全工具”互补，可做预设级“首轮收敛”变体。⑨**工程纪律**：包级 AGENTS 分层（根/包/文档）、README 中英三件套 + i18n 配对校验、CI 全量 check（aggregate/gallery/skin-center/docs/emoji）、tag 触发发布 + verify-version、pr-review.mjs 批量审查 PR（规模上限/密钥/emoji/CI 序列/皮肤视觉验证）。我们的文档体系已经类似，可补「生成物漂移门禁」与「发布 tag 校验」。⑩**新包/新皮肤脚手架**：`dsh-plugin-new`/`dsh-skin-new` 生成标准骨架 + 自动注册聚合/皮肤清单；我们 scripts 已有 install/check，可补脚手架减少新包起步成本。注意=①只借鉴思想/写法，不搬源码（仓库以 Apache-2.0 为主、个别 BSD-3-Clause，均非 MIT）；②落地前用 Inspect Provider 核对 rc.6 槽位/服务契约；③聚合/皮肤中心等属于较大工程，按用户决定分期做。可复现?是（读仓库文档/package/scripts 即可复现；未安装、未改本仓库代码）。

- **iPolloWork（Devin-AXIS/iPolloWork）可借鉴点记录（2026-08-16，记录）**：把 iPolloWork 调研中值得 DSH 插件/宿主参考的思想与设计理念落档，用户决定不安装。解法=按「对本仓库可落地度」整理：①**可编辑产物优先**：Agent 目标不是“聊完给文件”，而是把结果维护成工作区真实可编辑项目（`design/<sessionId>/` 下 index.html/design-tokens.css/manifest.json/brief.json），DSH 创作类插件可借鉴「结构化物件 + 设计令牌 + manifest + 可逆保存」而非一次性生成物。②**AI 与手动编辑并存**：画布直接改 + 选区 Ask AI 只把文件/定位/当前样式整理成对话草稿回填，不自动提交；这是「用户确认门」的好范例，尤其适合我们的可视化/模板插件。③**外部委托隔离边界**：宿主把 DSH 放进 `git clone --shared` 隔离副本，跑完只回传 finalResponse + patch，由主代理决定是否应用；比共享工作区更安全，适合 dsh-mac-desktop 或未来宿主嵌入。④**双传输形态**：headless CLI（`--profile headless --patch`）适合一次性任务，JSON-RPC stdio（initialize/session/prompt/idle）适合可观测/可取消任务；配套任务持久化、patch 分页、60min 超时、运行时版本管理（PyPI wheel）。⑤**Studio 插件分区**：DSH bundle host 用 `webServer+workspaceRegistry` 开 prefix 路由，client 用 `slots.inject("conversation.view")` 挂 iframe；随机 token + same-origin + workspace 目录白名单，Ask AI 只回填草稿。⑥**模板市场按场景隔离**：Design/PPT/Video 目录与模板分类彼此独立，避免网站/海报混入 PPT；模板先隔离校验再原子替换，失败恢复原项目。⑦**插件独立安装**：三个 DSH bundle 各自含浏览器资源，只装选中能力，不把桌面主项目拖进 Harness。⑧**诚实能力边界**：SKILL.md 明确 DSH 子代理不自动继承 OAuth/主代理工具，除非 capabilities 报告桥接可用，不得声称能直接操作 Studio/Video。注意=①这些思想来自 source-available 代码，落地时只能参考理念，不能直接搬代码（License 非 MIT）；②事件/槽位契约以 Inspect Provider 核对 rc.6 为准；③用户明确不安装，本次仅落设计。可复现?是（codeload tarball 已解压读源码可复现）。

- **Petdex（crafter-station/petdex）可借鉴点记录（2026-08-16，记录）**：把 Petdex 调研中值得 DSH 插件/桌面壳借鉴的设计落档，用户决定不安装。解法=按「对本仓库可落地度」整理：①只读 session 事件投影 bundle：`inject:["sessions"]` + 全局监听 `session/created|disposed|event`，不碰 agent/approval 决策；这是「外部 UI/通知/遥测镜像 DSH 活动」的最小骨架。②内容零外发：归一化为 state/text/rootSessionId/sourceSessionId/sourceSeq/kind 的无内容投影，prompt/tool 参数/model 输出/审批内容不转发；外发只走本地 loopback + update-token 门禁 + 300ms 超时，失败 fail-open 不影响 DSH。③会话归并与事件治理：子 agent 经 `header.parentSession + origin==='subagent'` 回溯根会话（seen 集合+MAX_PARENT_DEPTH 防环），workflow/goal/compaction 更新父卡片；per-source `event.seq` 高水位去重，队列上限 64，可替换 progress 合并，intervention/turn 终局事件优先。④状态映射可作任务卡片参考：turn/start→jumping，step/tool/workflow/goal/compaction→running，approval/asked→waiting，approval/decided→running，turn/completed→waving，blocked/max-tokens→waiting，failed/stopped→failed；审批只展示不代答。⑤官方 CLI 安装/卸载是桌面壳可复制的模式：npx 固定 `@deepseek-ai/dsh@0.1.0-rc.6` + `pnpm@11.19.0`，`dsh plugin --profile web add --ignore-scripts <tgz>`，卸载只按包名 remove；私有 tgz 哈希锁定后嵌入二进制，稳定路径落在 `~/.petdex/integrations/dsh/<ver>/`。⑥连接状态机：`absent→not_installed→restart_required→connected`，查 `~/.dsh/profiles/web/package.json` 的 dependencies+bundles 判断已装，真实事件回写 `~/.petdex/runtime/dsh-handshake.json`（含 integrationVersion）才算 connected——避免「装了但没重启」误报成功。⑦macOS 桌面壳 PATH 处理：Finder 启动不继承交互 shell 环境，用 `/bin/zsh -lic 'exec "$@"'` 转发 argv，不把包路径/profile 插进 shell 源码；DSH_HOME 可覆盖 `~/.dsh`。⑧点击宠物只激活默认浏览器，不做会话级深链（诚实兜底）。⑨SSH remote agents：反向隧道 `-R 127.0.0.1:7777:127.0.0.1:7777`、先装依赖再发布配置、全部通过后原子发布 update-token——若 dsh-mac-desktop 做远程能力可参考。注意=①以上事件名/字段来自 Petdex 源码，落地前必须用 Inspect Provider 核对 rc.6 契约；②`@petdex/dsh-plugin` 是 MIT 可读代码，但 Petdex 桌面主体是 Native SDK/Zig 产品，不宜整体收编；③用户明确不安装，本次仅落设计。可复现?是（git clone 读源码即可复现）。

- **Mirage（strukto-ai/mirage）可借鉴点记录（2026-08-16，记录）**：把 Mirage DSH 适配器里值得本仓库参考的套路落档，避免只留「统一 VFS」的泛泛总结。解法=按「对本仓库可落地度」整理：①**替换 fs/shell 两个可交换 seam**：bundle patch 直接禁用 `fs-sandbox`/`bash-sandbox`/`pwsh-sandbox`/`tool-pwsh`/`tool-fs-search`，再插入自实现 `FileSystem`（`@deepseek-ai/dsh-fs`）与 `ShellExecutor`（`@deepseek-ai/dsh-shell`），不改 harness 即可把 DSH 的文件/命令世界整体换成虚拟/远程后端；做「沙箱替换、worktree、远程文件、多后端聚合」类插件可直接抄这个 patch 骨架。②**共享 Service 持有执行世界**：`MirageService` 提供 `ctx.mirage`（Workspace 唯一实例），fs/shell 两个 provider 都 `inject:['mirage']`，`processPath` 与 shell 命令在同一路径空间，保证 `ctx.fs` 写出的文件 shell 能读到；任何需要 fs/shell 联动的插件应共享同一状态对象而非各自初始化。③**异步构造 + `ready` 门**：声明式 mount 走资源注册表异步 build，service 暴露 `ready: Promise<Workspace>`，fs/shell 每个入口先 await ready、再二次检查 AbortSignal；避免半初始化对象被访问，也覆盖等待期间信号已取消的竞态。④**sandboxMode 如实上报**：`get sandboxMode()` 动态返回 `'workspace-write'` 或 undefined——只有所有 runtime `reach==='vfs'`（即一切效果都过 Workspace 门）才宣称沙箱，有 host 可达 runtime 就放弃声明；宁可 undefined 让权限预设拒绝组合，也不假报 full/workspace-write。⑤**错误码映射**：把底层 POSIX stamp（ENOENT/EISDIR/ENOTDIR/EACCES/EPERM）映射成 dsh-fs 的 `FS_NOT_FOUND`/`FS_NOT_REGULAR_FILE`/`FS_NOT_DIRECTORY`/`FS_PERMISSION_DENIED`/`FS_IO_ERROR`，并保留 cause；不要消息 sniffing。⑥**严格文本语义**：NUL 采样 + `TextDecoder(fatal:true)` 判二进制（`FS_NOT_TEXT`），CRLF 多数保持、编辑 oldString 唯一性/`replaceAll` 语义与 DSH 自研后端一致；文件 seam 必须复刻 DSH 文本契约，不能直接透传底层「宽松解码」。⑦**版本/并发控制**：`versionOf(stat)` 按 fingerprint→revision→meta 派生 `FsVersion`，per-targetKey tail promise 串行化 mutating ops，保证 read→guard→write 窗口不交错；多后端文件系统不能依赖底层 API 的原子性。⑧**后台命令流式 + spill**：`start` 用 console 流式输出并设 retention budget；`spillDir` 配置后把完整 stdout/stderr 写到 workspace 路径供 agent 读回，发现丢块立即 lossy + 停用 spill（不给有洞的文件）；长命令输出治理可参考。⑨**声明式 YAML 配置面**：`mounts` 块 `{resource, mode, config}` 走 `buildResource` 注册表，支持 `!!js process.env.X` 运行期解析、`registerResourceFactory` 注册自定义资源；bundle 复杂配置应区分「注册名+配置块」与「活实例」，让 profile YAML 可配而不用写代码。⑩**sessionId 持久 shell**：未绑定 session 时每次命令 clean slate（贴合 DSH bash 契约），绑定时保留 cwd/export/函数；需要跨命令状态时可做按 sessionId 的有状态执行器。注意=①Apache-2.0，代码不可直接搬入 MIT 仓库；②这些点多数围绕 fs/shell provider 契约，落地前用 Inspect Provider 核对 rc.6 `FileSystem`/`ShellExecutor` 确切签名；③npm 发布版 peerDeps 滞后（见外部调研条目），若参考其实现以 GitHub main 为准。可复现?是（git clone 读 `typescript/packages/dsh/src/{service,fs,shell,errors,text,spill}.ts`；未实现/未安装）。

- **OpenPencil 可借鉴点记录（2026-08-16，记录）**：把 OpenPencil 调研中值得 DSH 插件/预设/技能
  借鉴的点落档，避免只留泛泛总结。解法=按「对本仓库可落地度」整理：①分层设计工作流
  （skeleton→content→refine）：先骨架、后内容、最后统一 refine/自检，等价于 DSH 大任务「先出
  结构→分块填充→统一校验」，可做成预设或工具链。②空间分解 + 并发 Agent Teams：orchestrator
  把页面拆成 hero/features/footer 等空间子任务并行生成，成员有画布指示器 + delegate + fallback；
  DSH 可借鉴「按产物空间/模块拆子 agent + 收敛校验」，而非只按步骤拆。③增量 codegen 管线
  （codegen_plan→submit_chunk→assemble→clean）：声明 chunks/依赖/sharedStyles/rootLayout，
  逐块提交再装配；适合 DSH 大代码生成避免一次性超长输出。④模型能力分档：full/standard/basic
  自动调 prompt/thinking/timeout，与现有 mode-boost/router-standard 成本路由互补。⑤Design-as-Code
  + 变量→CSS 变量：产物用可 diff JSON + 设计 token 引用；任何 agent 工作流都可借鉴「先定义
  token/组件，再生成实例」。⑥技能包设计：SKILL.md 内嵌严格 JSON 规则、schema、常见错误表、可
  复制 pattern；DSH skill 也可把「最易错约束 + 对照表 + 最小可跑示例」前置。⑦MCP 工具面：分层
  工具（skeleton/content/refine + codegen plan/submit/assemble）+ `op tools` 自省 + 分段知识加载
  （只取需要的 schema/layout/style）；DSH 插件做工具集时可按「分段检索知识 + 明确 pipeline 阶段」
  组织。⑧跨 agent 技能分发：openpencil-skill 以独立仓库 + `op install --target` 写到各 agent 的
  skill 目录；DSH 可继续沿用 ~/.agents/skills 共享目录方案。注意=①OpenPencil 是独立 Rust 产品，
  代码不可直接搬，思想可借鉴；②落地前用 DSH 契约核对，特别是 subagent 并发/工具 schema 限制。
  用户已决定不安装 openpencil-skill / op CLI / OpenPencil 实例，仅保留思想落档。
  可复现?否（纯记录，未改代码）。

- **EchoBird 可借鉴点记录（2026-08-16，记录）**：把 edison7009/EchoBird 调研中值得 DSH 插件/桌面壳借鉴的点落档，避免只留泛泛总结。解法=按「对本仓库可落地度」整理：①外部切 DSH 模型的配置面：EchoBird 写 `~/.dsh/settings.yaml` 的 `llm-pi-ai.providers.echobird` 路由（displayName/apiKeyEnv/api/baseURL/models）+ `agent-default-model` 选择器，密钥写 `~/.dsh/.credentials.yaml` 的 `ECHOBIRD_API_KEY`；restore 时删路由、删选择器、删 key。这是「外部程序/桌面壳管理 DSH 模型」的 canonical 写入面，做 dsh-mac-desktop 或 dsh-essentials 的模型切换外部接口可直接照此契约；写 YAML 用 serde_yaml_ng（Rust）而非 PyYAML 语义，避免裸 `off` 变布尔键（本仓库已踩过）。②DSH 会话日志直读契约：`<DSH_HOME|~/.dsh>/sessions/<project>/<session>/session.jsonl[.zstd]`，zstd 是 checksummed 多帧 concat；首行 header `{"type":"session",version,id,cwd,createdAt}`，事件含 `session/title`（最新胜出）、`user/message`、`turn/start`（计轮数）；只有 header 无事件视为空会话丢弃。Rust 用 `zstd::stream::read::Decoder` 流式跨帧解码；JS 侧对应 NOTES 里 node zlib 逐帧重写的已知坑，双向互证。③`dsh web` 进程管理：按平台探测 dsh 路径（%APPDATA%\npm、/opt/homebrew/bin、/usr/local/bin 等），spawn `dsh web` 后轮询 `http://127.0.0.1:3080` 再自动开浏览器；切模型后 kill 受管实例再重启保证确定性（settings.yaml 虽热重载但外部重启更稳）；端口被占时容忍 EADDRINUSE 继续。④工具管理抽象：每工具 `tools/<id>/{config,paths}.json` 定义读/写映射与安装路径，`tool_config_manager.rs` 统一 apply/restore；若未来做桌面 App Manager 可借鉴，但 DSH 插件侧不需要。⑤外部 Agent 循环防护（低优先）：`agent_loop.rs` 用 MAX_CONTEXT_BYTES≈300KB 字节预算而非条数，工具调用哈希环形缓冲（同 tool+args 3 次判循环），MAX_TOOL_LOOPS=150 兜底；本仓库做 host 侧长任务可参考。⑥本地 LLM 管理（低优先）：vLLM/SGLang/llama.cpp 运行时 + GGUF 下载 + Anthropic↔OpenAI 代理，属于独立产品能力，仅作背景。注意=①EchoBird 是独立 Tauri 桌面产品（MIT v5+，~3k★），代码量大不宜收编，只借鉴契约/模式；②落地前仍以 Inspect Provider / npm 包产物核对 rc.6 的 settings.yaml 字段与会话事件名，EchoBird 注释写的是 rc.x 契约；③其 `dsh.json` install 注释也确认 Node >=22.19、`dsh web` 只 loopback 3080、`--host 0.0.0.0` 不支持。可复现?否（纯记录，未改代码）。

- **Yao（YaoApp/yao）可借鉴点记录（2026-08-16，记录）**：把 Yao 的 DSH 嵌入实现中值得本仓库
  参考的点落档，避免只留泛泛总结。解法=按「对本仓库可落地度」整理：①外部宿主嵌入 DSH 骨架：
  动态 Cordis 插件 + 自定义 boot bin（`@deepseek-ai/dsh-app-boot` 的 `boot(NAME, configPath,
  ...)`）+ stdio JSON-RPC；stdout 只走协议帧，退出由 `onIdle`/`shutdown` 驱动而非 stdin EOF。
  ②JSON-RPC 协议面：方法 `initialize`/`session/prompt`/`shutdown`，通知
  `session.event`/`session.status`/`subagent.started`/`subagent.finished`；initialize 传
  cwd/provider/model/maxTokens，prompt 传 sessionId+contentBlocks。③会话恢复：
  `sessionPersistence.list()` 命中后 `agents.resume({resumeSessionId, agentOptions})`，否则
  `agents.create`；用 `assistantID:chatID` SHA1 UUID 做稳定 sessionId，跨进程可续。④自动退出：
  监听 `agent/status==='idle'` 且只对 `promptedSessionId` 根会话触发；子 agent idle 不退出；
  `maxTokensAsSuccess` 把 max-tokens 视为 ok。⑤最小 headless DSH cordis.yml 组合：
  llm-deepseek + agent-spine-demo + subprocess + bash/pwsh + fs-local + tool-fs/tool-todo/
  tool-subagent + token-meter + compaction-basic + session-persistence-jsonl +
  session-checkpoint-policy；Windows 关 toolBash/toolJobs、加 shell-env/tool-pwsh。⑥宿主环境
  注入：`DSH_CWD/DSH_SESSION_ROOT/DSH_SYSTEM_PROMPT/DEEPSEEK_API_KEY/DEEPSEEK_BASE_URL`、
  `CTX_WORKSPACE_ID/CTX_ASSISTANT_ID/CTX_LOCALE/CTX_SKILLS_DIR/CTX_EXT_SKILLS_DIR/CTX_NODE_ID/
  CTX_TARGET_ID`、`HOME/WORKDIR` + git/SSH/XDG 隔离。⑦进程清理：会话级
  `pkill -9 -f 'dsh-<chatID>'` / Windows taskkill；ctx cancel 时 5s 超时强杀；正常完成不清理
  保留子进程。注意=①完整代码/配置在 Yao `agent/sandbox/v2/dsh/` 与
  `@yaoapp/dsh-sdk-jsonrpc-stream@0.1.1`，本记录是骨架；②其 npm 插件只有 peerDependencies
  （本仓库已知坑），但在 DSH 全家桶环境内可跑；③落地前用 Inspect Provider 核对 rc.6 契约，
  别硬造服务。可复现?否（纯记录，未改代码）。

- **Ouroboros 可借鉴点记录（2026-08-16，记录）**：把 Q00/ouroboros 调研中值得 DSH 插件/预设
  借鉴的点落档，避免只留泛泛总结。解法=按「对本仓库可落地度」整理：①访谈门禁（Socratic
  interview）：写码前强制澄清，Ambiguity=1-加权清晰度，阈值≤0.2，可显式 `force` 反驳；DSH 侧可
  做成 router-standard/spec 的「先访谈/先澄清」预设或工具提醒，而非直接写码。②不可变 Seed：
  意图锁进 seed 规约（本体/约束/验收标准），写码中不漂移；DSH 可用系统提示/会话元数据固化
  「目标+约束+成功标准」，压缩/新会话时保留。③三阶段评估（Mechanical→Semantic→Multi-Model
  Consensus）：先用免费机械检查，再语义评估，最后多模型共识；判分断言对 worker 隐藏（hidden
  checklist），可借鉴到 DSH 的 agent 工作流（把验收清单放 host 侧，不让执行 agent 自评）。
  ④预算化演化（Evolve）：最多30代、本体相似度≥0.95 收敛、停滞模式检测（spinning/oscillation/
  重复反馈/硬上限）；适合 DSH 做长任务自动迭代/收敛判断。⑤PAL Router：任务复杂度打分（token/
  工具数/AC深度加权）→ Frugal/Standard/Frontier，失败升级成功降级；与现有 mode-boost/
  router-standard 的成本路由方向互补。⑥事件溯源：append-only SQLite + replay/checkpoint，
  完整审计；DSH 会话已是事件式，可借鉴其「所有动作绑定 seed/记入 ledger 可回放」的表述。
  ⑦其 adoption 文档反过来列了 DSH 值得借鉴的机制（Ralph handoff、spill、end-seed marker、
  invariants），若做 DSH 插件可优先看这些。注意=①Ouroboros 是 Python 独立引擎，思想可借鉴但
  代码不可直接搬（MIT 可读，但要翻译成 Cordis/TS 生态）；②这些点多数是方法论，落地前先查 DSH
  契约，别硬造服务。可复现?否（纯记录，未改代码）。

- **dsh-memory（FuRongJun）半途集成清理（2026-08-16，清理）**：另一个会话把
  `@furongjun1999/dsh-memory` 复制进 dsh-essentials 做本地收编，但只完成一半（
  `lib/lingshu-memory/` 未跟踪、`lib/index.js`/`lib/client.js` 改接 lingshu、
  `lib/memory/{client,index}.js` 被删）。用户决定先不收编。清理=`git checkout --`
  还原 `dsh-essentials/lib/{index,client}.js` 与 `lib/memory/{client,index}.js`，
  再 `rm -rf dsh-essentials/lib/lingshu-memory`；同时确认 ~/.dsh/profiles 无
  @furongjun1999/lingshu/aeis 残留、Python aeis 未安装。可复现?是（git status 可见半成品）。

- **当前 web profile 第三方插件核查（2026-08-16 快照）**：`dsh plugin --profile web list` 仅
  1 个第三方 bundle 依赖=**@dsh-external/dsh-mode-boost**（link 到本仓库 dsh-mode-boost）；
  `~/.dsh/.agent-presets/` 有 **router-standard / router-spec** 两个第三方预设（来自
  yjh051108/dsh-router-standard）；**dsh-essentials / dsh-mac-desktop 已不在当前
  profile**（`package.json.bak-20260816-101607` 显示 10:16 时仍在 bundles+deps，现已被移除），
  仓库目录仍保留但未激活；官方 bundle 只有 `@deepseek-ai/dsh-base` + `@deepseek-ai/dsh-web-app`。
  可复现?是（读 profile package.json / `dsh plugin list`）。

- **预设描述中文化（2026-08-16）**：用户要求 router-standard/router-spec 两预设描述改中文
  （官方预设即中文）。本机 ~/.dsh/.agent-presets/ + 仓库 dsh-router-standard/preset/ 四份
  preset.yml 同步改；描述含全角括号/分号无 YAML 问题，仍保留双引号保险；js-yaml 解析验证
  通过。THIRD-PARTY 本地修改记录更新（② 加引号+中文化）。可复现?否（一次性偏好）。

- **harness 源码目录已删除，零影响（2026-08-16）**：问题=用户手动删了
  `/Users/localuser/workspace/deepseek-harness/`，担心有影响。核查=①运行实例=npm rc6
  （/opt/homebrew/bin/dsh，PID 67591）HTTP 200 正常；②profile（package.json/patch/settings）
  与插件仓库（dsh-essentials 含子模块、scripts/）**零引用**该路径（grep 全空）——此前迁移已把
  插件依赖改为 npm registry 包（0.1.0-rc.6）而非 link 到 harness，junction 指向 deepseek-plugins
  不受影响；③npm 版 dsh 自带全部组件无需源码。结论=删除是「npm 为主不存源码」的最后一环，
  **彻底安全**；AGENTS.md 已更新（契约不确定时读 npm 包产物 /opt/homebrew/lib/node_modules/
  @deepseek-ai/ 或官方 GitHub，不再指向本地源码）。NOTES 中历史记录（dsh-at-file link 路径、
  --dsh 源码路径）为档案保留。可复现?否（一次性迁移完成）。

- **mode-boost 收编+安装完成（2026-08-16，29e7ec2）**：问题=用户确认「装且收编」mode-boost。
  执行=①`git subtree add --prefix=dsh-mode-boost`（需先 unshallow 上游克隆，浅克隆被拒
  "shallow roots are not allowed"）；②**非 bundle 纯 Cordis 插件**（`export const name`+`apply`，
  无 dsh.bundle.patch/cordis.patch.yml）→ `dsh plugin add` 只装进 profile dependencies 不会
  进 loader；③激活=profile `cordis.patch.yml` **必须用 `insert:` 语法**（patch 顶层条目分两种：
  无 insert=改已存在 entry→新 entry 报 "entry not found"；带 insert 才是插入新 entry）；
  `name` 裸包名 `@dsh-external/dsh-mode-boost` 由 loader **双锚解析**（dsh 安装→profile
  node_modules，baseUrl=profile 目录）。**pnpm store 版本错位坑**：npm 版 dsh 转发系统 pnpm
  v10（/opt/homebrew/bin/pnpm）而 profile 是 v11 store 装的 → `ERR_PNPM_UNEXPECTED_STORE`；
  解法=`CI=true pnpm install` 用 v10 重装对齐（Homebrew pnpm 10.28.2），此后 `dsh plugin
  --profile web add` 直接可用。验证=dump-config 出现 mode-boost entry + 启动 HTTP 200 进程
  存活。注=mode-boost 运行时生效需新会话（system-prompt/assemble 时注入），loader 装配链路
  已通。可复现?是（非 bundle 插件激活必须 insert 语法；store 错位必现）。

- **preset.yml YAML 解析坑：description 含 `: ` 未加引号 → 设置页「无描述」（2026-08-16）**：
  问题=用户报 router-standard/router-spec 两预设「没有描述」。原因=metadata.ts 用 yaml.load
  读 preset.yml，description 行 `Task-aware routing — RL-interface restoration: ...` 里冒号后跟
  空格被 YAML 当作嵌套映射开始（bad indentation of a mapping entry）→ 整个 metadata 解析失败
  → 设置页显示「无描述」（代码 `text.description ?? t('noDescription')`）。官方预设描述无冒号
  所以正常。**上游 v0.2.0 自身 bug**（最新 main 仍未修，克隆即现）。解法=description 值加双
  引号（`description: "..."`），js-yaml 正常解析 name+description。修复点=本机
  ~/.dsh/.agent-presets/{router-standard,router-spec}/preset.yml + 仓库
  dsh-router-standard/preset/{router-standard,router-spec}/preset.yml（THIRD-PARTY 已记第二处
  本地修改，下次 subtree pull 复查）。验证=js-yaml 重新解析 OK。可复现?是（任何含 `: ` 的
  未引号 YAML 标量都会触发）。

- **决策：绕过套装仓库，直接用源仓库（2026-08-16，用户拍板）**：问题=router-standard 相关
  记录多处以「dsh-routing-suite 套装仓库」为框架（生态调研/双组件收编/辨析三条），用户要求
  套装仓库记录都去掉、直接用源仓库 `yjh051108/dsh-router-standard`（独立仓库，remote 别名
  `upstream-router-standard` 已配）。解法=NOTES 三条改写/删除：①「生态调研」整条删（内容已被
  收编+更新记录取代）；②「双组件收编落地」改写为源仓库视角（保留 super-injector 收编/构建
  细节——该插件已删但经验留档）；③「anchored-standard vs routing-suite 辨析」改写为
  anchored-standard vs router-standard（保留 anchored 调研）。AGENTS 索引去 routing-suite
  字样；THIRD-PARTY 上游列标注「源仓库，套装已弃用」。**不动**=dsh-router-standard/docs/ 下
  上游自己的文件（statement/blog/apology 里的套装引用是上游作者陈述，subtree 原样收编，改
  了破坏与上游一致性、下次 pull 冲突）。可复现?否（决策）。

- **npm 版 dsh 迁移：裸 profile 启动成功 + 端口冲突（2026-08-16，进行中）**：问题=插件
  dsh-essentials `dependencies:{}` 空、6 个 harness 内部包只声明 peerDeps（dsh-typert-protocol/
  dsh-tools/dsh-skill/dsh-settings/dsh-llm/schemastery）→ npm 版解析不到（Node ESM 从插件文件
  路径向上找 node_modules，够不到 /opt/homebrew；实验③证 cwd 在 harness 也失败）。修复=插件
  package.json 补 dependencies（含闭包 cordis/dsh-scope/dsh-session/dsh-timeout/dsh-invariants，
  版本对齐 rc.6）+ 仓库根 pnpm install → import 全部 OK。**用户决定先裸启动**：profile 三处拆
  卸（bundles 数组删 dsh-essentials/dsh-mac-desktop、dependencies 清空、node_modules junction
  删）→ npm 版 `dsh web --port 0` 启动成功（HTTP 200 + __DSH_BOOT__，只剩官方 bundle）。
  **新坑=端口冲突**：默认 `dsh web` 报 EADDRINUSE 127.0.0.1:3080——被 10:01 启动的源码实例
  （PID 63881，apps/cli/src/bin.ts，带 mac-desktop 壳 63883）占用；进程内仍是旧 profile（含
  插件）。切换=停旧实例（63881+壳）→ `dsh web` 裸启动，**当前对话会中断**（用户已确认，自切）。
  可复现?是（npm 版与源码版共用 3080 默认端口+同 profile，必然冲突；插件 peerDeps 缺陷是
  根因，源码 harness node_modules 恰好掩盖）。

- **决策：harness 源码不再本地修改，dsh 改用 npm 安装（2026-08-16，用户拍板）**：问题=之前为修
  子-agent 400 打的本地补丁 eb2ae502b7（supportsDeveloperRole，改 llm-pi-ai 3 文件）直接改了
  harness 源码，用户明确「这个不要改」。解法=①`git revert eb2ae502b7`（a73a6571fc，3 文件恢复
  官方，git diff 47f943859b 确认源码与远程一致；revert 保留历史可追溯）；②以后**不再本地改
  harness 源码**，修复走插件/settings/预设层；③本机 dsh 迁移方向=**npm 安装**（`@deepseek-ai/
  dsh@0.1.0-rc.6` 是聚合包，bin=dsh，dependencies 含 dsh-web-app/dsh-base 等全部组件，web GUI
  随依赖装，无需源码目录），插件照常 `dsh plugin add`（GitHub 子目录 URL 或本地目录），不依赖
  harness 源码。**npm 包=编译产物非源码**（拆包核实：files 白名单仅 lib/*.js + *.d.ts +
  cordis.patch.yml + config yml，无 src/ 无 .ts 实现）——本地不存 TS 源码，物理杜绝误改。
  **代价**=子-agent 400 问题（qwen/DashScope 拒 developer role，pi-ai 自动检测
  误判）回退后复发，官方 rc.6 亦不含该修复（npm pack 解包 grep 证实）——接受或待官方修复；
  插件 devDeps 的 `link:../../deepseek-harness` 仅构建/测试用，运行时不受影响。可复现?否（决策）。
  **执行进度（2026-08-16）**：①已 `npm i -g @deepseek-ai/dsh@0.1.0-rc.6`（531 包，bin=
  /opt/homebrew/bin/dsh → lib/bin.js，`dsh --version`=0.1.0-rc.6）；②只读验证 `dsh --profile web
  --dump-config` 能解析现有 profile，dsh-essentials/dsh-mac-desktop 都在组合树——**npm 版可直接
  读现有配置与插件，切换无需改 profile**；③切换时机=用户定（下次自然重启时用 `dsh web` 替代
  `pnpm dsh web`，重启会中断会话，故等下次重启；删 harness 源码目录是最后一步待用户确认）。

- **router-flash 预设来源澄清（2026-08-16）**：问题=「Router Flash (opencode-go)」预设是哪个
  插件给的。原因=易混三点：①它是**第三方 agent 预设**，来自 SheberDavid/v4-flash-godmode-
  opencode-go（8/15 手动装：clone 后复制 preset/ 到 `~/.dsh/.agent-presets/router-flash/` +
  settings.yaml `agent-presets.default: router-flash`），专为 opencode-go 供应商的
  deepseek-v4-flash 特调（/flash/i 匹配，w7 方案）；②与 dsh-router-standard **两套独立代码**
  （同名文件 md5 全不同，仅目录结构撞名；agent.cordis.yml 注释头残留原作者字样=fork 改造）；
  ③与已删 dsh-opencode-go-usage（Xenia0922 用量仪表盘 bundle）**无关**，只是都沾 opencode-go
  字眼。预设非 bundle，不在瘦身范围。解法=查 `~/.dsh/.agent-presets/<id>/preset.yml` 的 name
  + NOTES 安装记录即可溯源。可复现?是（同名目录预设撞名易混，先 md5 再下结论）。

- **NOTES.md 增长策略决策（2026-08-16，用户确认「维持现状+阈值」）**：问题=NOTES 已达 350KB，
  担心越来越大是否有影响。分析=逐维度无影响：①不注入每轮上下文（只有 AGENTS.md 进 64KB
  预算），涨到 35MB 也不影响推理成本；②按需读（read 分页 + grep 全文毫秒级）；③git delta
  压缩实际存储几十 KB，每次追加只几行 diff；④编辑冲突风险不随体积变大（追加最上方+改前必
  read 约定已覆盖）。唯一真实风险=**被整读**：350KB 中文 ≈ 9-12 万 tokens，一次读入爆上下文
  → 永远不要整读 NOTES.md，按需读、靠索引+标题 grep 定位。阈值约定=**~1MB 或活跃条目 ~100
  条再分片**，届时方案：按月分片 docs/notes/2608.md（AGENTS 索引带月份）或归档滚动（主文件
  只留近 N 条）。可复现?否（决策记录）。

- **README/THIRD-PARTY 精简（2026-08-16，README 7.2→5.0KB、THIRD-PARTY 6.4→4.8KB）**：
  问题=瘦身收尾后 README 三个安装小节重叠（--dsh 说明重复两处、历史说明重复）+ THIRD-PARTY
  头部两段信息重叠 + at-file/paste-input 详情节 commit 级细节过长。解法=README 安装合并为
  「一键全部」+「单个·批量」两小节，去掉重复 `--dsh` 与重复历史说明；「如何新增」删动态
  Cordis 形态（dsh.plugin.json+host.js/client.js 已废弃，历史在 NOTES）只提
  `dsh.bundle.patch`/`dsh.client`。THIRD-PARTY 头部合并一段（2026-08-16 变更：at-file/
  paste-input 已并入 dsh-essentials + 六插件已删）；一览表每行压缩为要点级（link 路径改两跳、
  locale/图标/token/资源优化三轮、router-standard 原样收编），commit 级细节删（NOTES 有全文）；
  保留维护流程与判定规则两节。**NOTES.md 判定为档案不精简**：349KB 不注入、按需读，靠索引
  导航，内容精简反而丢可发现性。可复现?否（一次性收尾）。

- **AGENTS.md 二轮精简（2026-08-16，19.5KB→11.2KB，-43%）**：规则部分压 1.5KB（动态插件半节废弃并入「仓库概况」一句、目录树 8 行→2 行、引言行合并、版权条 B 站示例泛化）+ 索引 51→39 条（删纯历史/已删插件时代低价值条目：GitHub 同步、super-injector 删除、paste-input 真机/脱钩、at-file 收编、Tauri 零耦合、借鉴点落地、贡献者重写、bundle link、monorepo 合并、动态插件 define、headless 合并、主题 token 与图表悬停合并为一条）+ 多条索引合并（bundle 通用套路、mac-desktop 汇总保持）+ 每条保留 1-3 行要点（完整细节仍在 NOTES）。11.2KB 占 64KB 预算 17%。可复现?是（索引价值=可发现性，压太狠会丢导航）。

- **AGENTS.md 精简重写（2026-08-16，78KB→19.5KB，-75%）**：问题=201 条索引里约 100 条指向已删除插件（notification-center/usage-dashboard/plugin-classifier/skill-manager/better-sidebar/vision-bridge/ocgo/dream-skin/agent-teams/bilibili），且 78KB 超 64KB 每轮注入预算被截断。解法=索引区重写为「仅当前有效经验」51 条精选导航：瘦身决策（essentials 合并/inject 坑/super-injector 删除/GitHub 同步）、settings.yaml 与 LLM 契约类、essentials 五子模块关键经验、mac-desktop 汇总一条、router-standard/第三方治理、scripts 守护、通用方法；已删插件经验合并为一句导航指向 NOTES.md；规则部分微调（bundle 示例改 dsh-essentials）。可复现?是（AGENTS.md 超预算必然被截断，任何大仓库都适用）。

- **GitHub 仓库内容同步（2026-08-16，25f7cdb）**：瘦身 commit 推送（21 个，92960ec..b8bea2e）+
  清理历史遗留——`.agent-teams/`（已删插件归档）与 `viz/`（历史卡片副本）在 .gitignore 却仍被
  git 跟踪（`git ls-files -ci --exclude-standard` 可查），`git rm --cached` 停止跟踪本地保留；
  `docs/agent-self-optimization.md` 是 NOTES 引用的有效契约文档，从 .gitignore 移除保留跟踪；
  根 package.json description 更新（旧文还写"自有 7 个插件 + better-sidebar/at-file"）；AGENTS
  目录计数 4→3。验证=GitHub API contents 有 CDN 缓存延迟，**以 `git ls-tree origin/main` 为准**。

- **dsh-zcode-import 清理（2026-08-16，用户决定处理掉）**：ZCode/Codex 迁移会话绑定插件
  （@dsh-external 私有包，0.0.1）——注入器删除后 junction 成死引用（重启后 boot manifest 0
  引用），随用户决定一并删除：profile junction + 仓库未跟踪目录；引用核查=settings.yaml/
  patch/package.json 均无残留。至此非官方插件只剩 dsh-essentials + dsh-mac-desktop（+ router-standard
  预设），profile node_modules 顶层仅两 junction。

- **dsh-super-injector 删除（2026-08-16，用户决定只留 router-standard 预设）**：问题=瘦身后
  剩下 4 个非官方插件，用户确认去掉注入器（保留预设）。**核实结论**：super-injector 与
  router-standard 零依赖（grep 双向无引用）；预设里的 `dev_router_status`/`dev_router_mode`/
  `dev_mode_subagent` 是预设自己 `ctx.tools.register` 注册的（`preset/router-bootstrap.mjs`），
  只是名字撞 `dev_` 前缀，与注入器的 `dev_inject_plugin` 等无关——删注入器不影响预设。
  删除点=profile package.json（dependencies + bundles 数组各一处）+ node_modules junction +
  仓库目录 + 文档三处（README/THIRD-PARTY/AGENTS）。注意=当前运行实例的 loader 还挂着
  injector（进程内），重启后才消失；`~/.dsh/super-injector/` 运行数据（self-heal.log 等）
  留存但无影响。可复现?否（一次性决策）。

- **commit 4b9bb79（memory cap/memo + ocgo 单遍/inline）只读审查=4 项全正确**：listJournals 全局 YYMM+DD
  降序取前缀，cap 恰好等于全量前 N 条，够 max 即 break 不再 listDir 旧月份（调用方仅 buildIndex:120 /
  composeSummary:maxEntries，若误传 max=0 会返空——当前无此调用）；mdHtml 单条目 memo 纯函数无过期，同输入同输出
  （undefined/'' 同键同结果）；collectDshScan 单遍合并标题/用量=旧两遍逐字等价（多标题最后一个生效/无标题 null/
  cache 增量按会话顺序/cache 非单调 Math.max 防御/标题后置回填发生在全部会话后）；删 snaps 死 Map 无残留引用；
  buildView 内联 today/month/total 复用单次 dk/costOf，membership 与 r4 舍入（只在最终合计）与旧 agg(filter) 逐字段
  浮点等价。验证：ocgo test 10/10、memory smoke 50/50、/tmp 合成数据新旧算法逐行 deepEqual。（经验=本次无新增）

- **dsh-paste-input 脱离上游（用户决定，2026-08-15）**：不再跟随上游 @dsh-community/lhh010 更新，
  本仓库副本即唯一事实来源，按第一方插件维护（与 dsh-at-file 同列「已脱离上游」，但**未做
  filter-repo 历史重写**——上游原作者仍留在历史贡献者里，这是刻意的差异；如需单作者化再按
  at-file 流程重写）。处理=THIRD-PARTY.md 表格行「已脱钩」+ 详情节改写（升级风险段→「不再升级
  上游，值得借鉴的手动 cherry-pick」）；AGENTS.md 第三方维护段（从「有本地修改的」移到「已脱离
  上游」，引言同步）；根 README 表格标注；插件 README 加维护状态块。要点=subtree add 的关联只
  存在于历史 commit message，无持久元数据文件，文档声明即脱钩；「已脱离上游」≠「重写历史」，
  两者是独立选项（at-file 都做、paste-input 只脱钩）。

- **dsh-model-selector 新 goal 实例终审（workflow 3 agent 验收）**：目标重开后用 workflow 编排 3 独立
  审计 agent（host 内存/client CPU/契约泄漏）终审——**坑=agent 失败返回 null 时 hasOptimizableItems
  恒 false，verdicts 全 null 暴露假阴性，null 过滤绝不能当收敛证据**；改脚本化验收（静态 typecheck+
  useMemo 依赖+监听 cleanup 配对+零定时器全绿；动态 PerformanceObserver 实测菜单打开仅 1 次 129ms
  一次性长任务、DOM 21 节点、搜索/切换回归通过）；结论=无待优化项，收敛成立（见 AGENTS.md 索引）。

- **AGENTS.md 膨胀超注入预算（67.6KB > 65,536B 截断，实测）**：每轮注入的工作区指令预算 64KB，
  AGENTS.md 现 67,590B（173 条索引 bullet），**尾部被静默截断**——新落档的条目/规则可能每轮都看不到；
  这是每轮固定 token 开销最大头。解法=索引区压缩到「规则 + 一行导航」、条目只留一行链接，正文规则
  保留；目标 ≤30KB 每轮省 ~35-40KB token（仓库已有「AGENTS.md 精简原则」条目但已再度膨胀）。附带：
  NOTES.md 290KB 不注入（只按需读）设计正确；viz/ 卡片 fragment 会内联进会话日志 meta 属重放依赖。

- **DeepSeek V4 API 第三轮调价（2026-08-17 峰谷定价，涨价逆转降价）**：V4 全系正式版上线采用峰谷定价
  ——高峰时段 9:00-12:00/14:00-18:00（北京），闲时=高峰一半；Pro 高峰 缓存命中 0.3（+1100%）、未命中 9
  （+200%）、输出 27（+350%）（均较 5-31 价），闲时 0.15/4.5/13.5；Pro 输出高峰 27 元已**高于调价前原价
  24 元**；Flash 现价 0.02/1/2 → 高峰 0.1/3/9（+400%/+200%/+350%）、闲时 0.05/1.5/4.5；来源=DeepSeek
  官方定价公告（21世纪经济报道、中国金融信息网、南方都市报 2026-08-13）。已把三轮价格（原价/5-31永久/
  8-17闲时/8-17高峰）做成对比卡片（viz/ 工作区副本）。

- **DeepSeek V4 API 官方调价事实（2026-04/05，对 usage-dashboard PRICING 快照相关）**：04-26 公告全系
  输入缓存命中降至首发价 1/10；05-31 起 V4-Pro **永久**按原价 1/4 执行——每百万 Tokens：缓存命中输入
  1→0.1→**0.025** 元（−97.5%、40×，创全球新低）、未命中输入 12→**3** 元、输出 24→**6** 元（均 −75%）；
  V4-Flash 缓存命中 0.2→**0.02** 元（−90%）；deepseek-chat/reasoner 旧名弃用，对应 V4-Flash 非思考/
  思考模式。来源：DeepSeek 官方定价公告（证券时报 stcn.com/article/detail/3924059、太平洋科技
  pconline.com.cn/ai/article/1584702）。已做「调价前后对比」可视化卡片验证（viz/ 工作区副本）。

- **dsh-anchored-standard vs dsh-router-standard 辨析（同族预设不同路）**：问题=用户问两仓库区别；
  事实=①**anchored-standard**（xiaobright，1621⭐/51 forks）=单一预设，两阶段「首请求用 Minimal
  完整 prompt + Minimal 真实工具 schema（bash+str_replace_editor 两工具）+ 剥离 AGENTS/skills
  自动注入（suppressedContextSources）→ 首个持久信号（tool/call 或 assistant/message，
  `promoteOn` 可选）后提升到 Standard 25 工具全集」，针对 V4 Pro 对 API 可见工具目录敏感
  （官方评测 Minimal 99/96 vs Standard 91/92，本项目 Project2 实测 98/99）；阶段从持久会话事件
  推导（resume/reload 不丢）；rc.5+Windows/Node24 实测，rc.6 有 adapterDefaults 覆盖
  bootstrapMaxTokens 的坑；MIT+NOTICE（改编官方 rc.5 Standard 预设 commit 47f9438，GitHub
  检测 NOASSERTION 实为 MIT 多版权头）；②**router-standard**（yjh051108，源仓库独立维护）
  =任务感知路由预设 v0.2.0（router-standard/router-spec 双预设，spec/react/weak 行为带 +
  按模型选 persona + 近距离引导 + 三锚 + plan 保留），MIT；关系=router-standard README 致谢
  anchored-standard「锚定机制」，是机制借鉴非 fork；结论=两者都是 agent 预设层
  （装 ~/.dsh/.agent-presets），锚定应用点不同（首请求工具目录 vs 任务收敛行为）；**可复现**：
  两仓库 README/tree/LICENSE 直查。

- **dsh plugin add 的路径解析坑（本机实测）**：`pnpm --dir <harness> dsh plugin add ./dsh-xxx`
  会把 cwd 切到 harness，**相对路径解析到 harness 下**（报 `Installing a dependency from a
  non-existent directory: <harness>/dsh-xxx`，且因目录不存在被当 plain dependency 而非 bundle
  layer）；必须用**绝对路径** add。link 包的运行时依赖（如 node-notifier）pnpm 不自动装：
  插件目录内 `npm install --legacy-peer-deps`（peer `@deepseek-ai/*` rc 版本在 registry 无
  `>=0.1.0` 匹配，npm 默认自动装 peer 会 notarget 失败；pnpm install 在插件目录会拉整个根
  workspace 11 项目、被无关项目版本问题卡死）；装完 `node -e "import('node-notifier')…"` 验证
  动态 import；验证安装= `dsh --dump-config` grep patch 行 + profile package.json 的 bundles/
  dependencies（见 AGENTS.md 索引）。

- **dsh-bilibili-player 已移除（用户决定，2025-06）**：用户认为该插件多余，`git rm -r dsh-bilibili-player`
  连同根 README/AGENTS.md 的目录树与表格行、以及失效引用（动态插件说明的 v0.1.x、同类调研条目指向的
  COMPARISON.md）一并清理；git 历史完整保留（`git log` 可随时找回，全部代码与 NOTES 经验条目仍在）。
  教训=删插件要「目录 + 根文档三处清单 + 失效链接」一次清完，别留悬空索引。**可复现**：是（commit 见下）。

- **使用统计 TokenTracker 三件套 + 设置页全屏（dsh-usage-dashboard）**：借鉴 TokenTracker
  （已原生支持 DSH）搬入——①成本估算：host 内置 PRICING 快照（USD/1M，LiteLLM 风格，
  cacheRead=0.1×in）+ modelInput/modelOutput 分开计价 → modelCosts/totalCost；②会话明细表：
  sessionRows（covered 会话取缓存精确 input/output/cache 拆分、uncovered 取扫描值、主导模型
  从扫描）→ client 可排序分页表格；③设置页全屏：settings dialog 外壳 800px 固定、hash class
  不可预测 → MutationObserver 探测「nav+≥2 个 button」特征加 .dsh-us-max-settings class →
  CSS 放大到 calc(100vw-20px)×calc(100vh-20px)，图表区改 auto-fit 两栏 grid（窄列自动单列）。
  坑：①**并行会话 git checkout 清掉未提交工作两次**（口径统一+三件套全丢）→ 改完立即提交；
  ②**host const TDZ**：touchSession 定义在 exact 循环之后，调用抛 ReferenceError 被 catch 吞掉
  静默丢数据 → 定义必须先于使用；③测试断言时间相关（Date.now() 相对 → 日键漂移）→ 用 mock
  自身时间戳+host 同款本地 dayOf 推导期望。验证：apply 冒烟 24 断言 4 场景、client 渲染 4 场景
  130 节点全绿（见 AGENTS.md 索引）。

- **盘点**（git 历史判定）：**有本地修改** 3 个——`dsh-at-file`（link 路径 16+1 处）、
  `dsh-notification-center`（深度：壳检测+原生通知+点击跳会话，3 个本地 commit，与 mac-desktop
  耦合）、`dsh-paste-input`（文案本地化）；**原样收编** 5 个——agent-teams / better-sidebar /
  plugin-jinji / router-standard / super-injector。自有原创 6 个。
- **解法**：新建根级 `THIRD-PARTY.md`——一览表（上游/许可证/本地修改/维护状态）+ 每个修改
  插件的「改了什么/升级风险/验证」细则 + 维护流程（subtree add/pull 步骤）+ 判定规则
  （无修改→跟随上游；有修改→本仓库维护，pull 后复查修改点）。README 引用块加链接；
  AGENTS.md 新增「第三方插件维护」小节（AI 每次注入可见：收编即本仓库所有、改完立即提交、
  升级对照 THIRD-PARTY.md）。
- **可复现**：是（任何新增第三方插件时照 THIRD-PARTY.md 流程收编 + 记录一行）。
- **教训**：第三方插件收编不能只记「加了什么」，要记「改了什么」——否则 `git subtree pull`
  升级时本地修改被上游静默覆盖（尤其 notification-center 这类与桌面壳深度耦合的）。

---

## AGENTS.md 精简：介绍性内容移到 README，只留 AI 高频规则
- **问题**：AGENTS.md 是每次会话注入的文档，581 行里介绍性内容（仓库是什么/参照文档表/插件清单表/
  目录树逐插件注释）与 README 重复，白白占用注入上下文。
- **解法**：①「现有子项目」9 行表格删掉→指向 README「目录」（README 表格更详细含链接）；
  ②「参照项目与文档」5 行表格→一行链接 README 对应节 + 保留 Inspect/源码提示（AI 高频）；
  ③「目录结构」逐插件注释树→压缩为根文件 + 「9 个插件见 README」；④「这个仓库是什么」压缩为
  3 条（monorepo 定位 / git subtree 历史 / 两类加载方式）。581→553 行。
- **保留不动**：硬性落档约束、两类加载方式细节、写插件最佳实践（AI 每次动手都要用）、
  踩坑索引（136 条是 NOTES.md 导航，AI 可发现性价值 > 体积，README 不需要）。
- **可复现**：是（任何 AGENTS.md 膨胀后做「介绍移 README、规则留 AGENTS」即可）。
- **教训**：AGENTS.md 是「AI 操作规则 + 经验导航」，README 是「访客介绍」；内容重复处
  以 README 为准，AGENTS 只留一行链接，避免两处维护漂移。

---

## dsh-visualize 生态调研（Nagi-ovo，86⭐，BSD-3-Clause）
- **问题**：用户问 GitHub 上 `Nagi-ovo/dsh-visualize` 项目怎么样——需要完整评估（定位/架构/安全/质量）。

- **语义澄清**：DSH 把带图请求发给「0731 这个名字」（经基元律动网关），网关返回真描述——
  「其他工具」不存在；可能是网关内部把带图请求转给了视觉后端（解释文本模型名也能出 OCR 级描述）。

- **决策背景**：移交 4 轮未处理 + 工作树完全干净（无竞态风险）+ 修复不改变任何计算 → 跨插件边界
  安全修复。client 渲染冒烟 + apply 冒烟 + 语法全过。
- **可复现**：修复前 live 可见 KPI 头 5.3k vs 副行 383 矛盾（是）；修复后数字并排但有语义标注（否）。
- **教训**：跨指标口径一致性检查（exact 求和 vs totals）在测试套件全绿时仍能抓用户可见矛盾——
  该检查应进 usage-dashboard 的冒烟（断言 exactMessages 与 sub 计数口径标注一致）。

## usage-dashboard 消息口径失效模式补全（多 agent 第三十四轮，继续移交）

**问题 → 原因 → 解法 → 可复现?**

- **核查**：3080 live 实例（运行 20 分钟）逐插件探活——bilibili `/dsh-bili/api?m=popular` 200 真实
  数据、usage `/dsh-usage/api` 200（25 字段时代）、classifier `/dsh-plugin-classifier/api` 200 真实
  loader 数据、vision-bridge 加载无崩溃（服务器存活 = 已含 round-13 inject 修复代码）、skill-manager/
  classifier client.js 200、vision-bridge client.js 404（host-only 预期）。→ **结论**：live 实例健康
  且为最新代码，无需重启。→ 可复现：是（curl 各路由即见）。
- **坑**：先用**旧路径** `/dsh-pc/api` 探活 classifier → 200 HTML（SPA fallback）误判为"路由未挂载"；
  实际是并行会话工作树把路由改成了 `/dsh-plugin-classifier/api`（在途重构，未提交）。→ 教训：
  **live 探活必须先查当前代码里的实际路由路径**（grep webServer.on/path），别凭记忆用旧路径，
  SPA fallback 200-HTML 是"路径不存在"的标准信号。

## inject 完整性守护脚本（多 agent 第十四轮）

**交付 → 验证 → 可复现?**
- **交付**：`scripts/check-inject-consistency.mjs`——把 round 13 的 vision-bridge 教训固化为
  守护：模块 export inject + patch insert inject（内联 `[a,b]` 与多行 bullet 两种形式）并集 vs
  index.js 中 `ctx.<svc>` **硬访问**（剥 /* */ 与 // 注释、排除 ctx.get 可选读取与 on/effect/
  logger 内建）。正向：7/7 OK exit 0；负向：复造 vision-bridge（inject 缺 tools + 硬访问）exit 1；
  ctx.get('shell') 不误报。→ 可复现：是（构造破坏对即失败）。

- **审查过程**：第 5 轮只读 subagent 再次挂起（共享工作区并发修改，与 NOTES 既往记录一致），
  改自查——重点排查了 plugin/standalone 互操作、Settings→WebView 传播（确认 SettingsView 直接
  bind 共享 AppSettings、updateNSView 比较 url 生效）、窗口去重边界（argv 短、不同 parent-pid
  互不干扰）、killTree ps 快照性能（数百进程时 ~百 ms 级，可接受）。

- **审查中文件被并发修改（23:27→23:35）**：classify 加 `entry.options || {}`（options undefined
  不再 500，改为跳过）、marketList 改单次 parse（原「先校验再解析」的双 parse 已消除，D3 实测
  zh 空 → 恰好一次 en fetch）、install 响应补 `error` 字段（失败时 ok:false+error，但 `note`
  仍提示「安装后需重启」——失败时文案误导，Nit）。→ 教训：审查长文件前先记 mtime，中途
  发现变化必须重跑全部套件（三套 host 回归 + 本轮 6 组单测重跑全绿）。

- **审查方式**：独立 subagent 通读 Host+Client + 对照 harness 源码，报 10 项（1 高 3 中 6 低），
  全部属实无误报。

- **审查方式**：独立 subagent 通读 Host+Client + 对照 harness 源码，报 10 项（1 高 3 中 6 低），
  全部属实无误报，commit `62b09a7` 修完。

- **3 个并行审查 agent**（host 对抗 / client 对抗 / 打包安装链路）+ 父 agent 自查，发现并修复：
  - **安全**：`/install` 是写操作但可被跨站简单请求触发（`<img src>` CSRF）→ 加自定义头
    `x-dsh-plugin-classifier: 1` 校验（跨源简单请求带不了自定义头，触发 CORS 预检被同源路由拒绝），
    client fetch 带该头；缺头 403。
  - **host 逻辑**：① searchPlugins 不搜分类名（「UI 增强」0 命中）→ haystack 拼 `category`；
    ② curl 无 `-f`（404 也 exit 0 → 空市场缓存 10min + zh→en fallback 失效）→ `curl -fsS`；
    ③ spec/limit 无上限 → spec>200 拒、limit 封顶 20（schema `maximum:20`）；④ 1 字符词噪声
    （query「a」命中 263/301）→ 忽略 len<2 词；⑤「找到 N 个」用 slice 数误导 → 返回 total
    显示「前 N 个（共 M 个）」；⑥ 工具 execute 无 try/catch（命令面有）→ 补 catch 返回友好文案；
    ⑦ 分隔符缺 `–`/`：` → 放宽；⑧ `##` 二级标题不重置分类（徽章/免责声明段落污染风险）→ 重置；
    ⑨ localeCompare 依赖环境 locale → 改按 code point；⑩ 空模块名进 custom → 跳过。
  - **client**：① 复制按钮 `clipboard.writeText` 异步失败仍显示「已复制 ✓」（假成功）→ then/catch
    分别显示「已复制 ✓ / 复制失败」；② 安装竞态：只禁用当前安装卡片，可对别的卡片连点重复提交 →
    任意安装进行中禁用全部安装按钮 + onInstall 前置守卫；③ 市场「刷新」不带 `?force=1` → Host 缓存
    命中永不刷新 → refresh 置 force 状态；④ GitHub 链接按钮缺 `text-decoration:none`；⑤ installCmd
    profile 缺失时拼 `undefined` → 回退 `web`；⑥ 市场数据防御（`c.plugins`/`p.spec` 缺失不再崩 tab）+
    跨分类重复 spec 的 React key 改 `spec:category` + 无障碍（市场 chips aria-pressed、状态点 aria-label、
    结果盒 role=status、空态悬空冒号）。
  - **打包/安装**：一键安装走 `ctx.shell` 受默认 workspace-write 沙箱约束（写 ~/.dsh/profiles 被拒）→
    README 注明需放开沙箱或改用复制命令 + install 错误加沙箱提示；README 指明持久改 config 的位置是
    **profile 自己的 cordis.patch.yml**（包内 patch 重装被覆盖）。

- **子代理审查环境结论**：两次派出的审查子代理均挂起，停止信息显示「文件在审查中被并发修改」——
  本环境共享工作区被多 agent 并发写，**子代理只读审查不可靠**，改用自查 + 单测矩阵。
- **测试**：新增 requestHeader 抛错不崩/deriveMessages 抛错回退记录表/未知 id 干净报错/配置钳制
  4 项，累计 **53 断言全绿**。
- **可复现?** 是（`node tests/apply.test.mjs`）。

## dsh-vision-bridge 第三批检测：回退/嵌套/配置/深层 4 类测试全过（46 断言）

- **契约核验（正面）**：`slots.register({name,id,order,label})` 与 harness slot-catalog
  （packages/extensions/cordis-client-runner/src/client/slot-catalog.ts:1359）逐字段一致，label
  字符串由外壳 `resolveSlotLabel` 支持；`id:'all'` 与原装 inventory tab 的阴影冲突已被
  `cordis.patch.yml` 的 `ui-settings-plugin-inventory disabled:true` 消除；两个组件全部 hooks 都在
  条件 return 之前、`[request]` 依赖不重复 fetch、fetch 副作用 alive 守卫完整（onInstall 除外）；
  CSS 用到的全部 `--dsw-alias-*`/`--ds-*` token 都能在
  `packages/client/ui-theme/src/styles/design-platform.css` / `base.css` 里找到（bg-layer-1/3、
  border-l1/l2、label-primary/secondary/tertiary、state-error/success/business-primary、
  interactive-bg-hover、button-primary-fill、label-primary-foreground、bg-module-platform、
  shadow-lv1、ds-font-family-code、ds-ease-in-out），`color-mix(in srgb, state-business-primary 18%,…)`
  写法与 harness 自带 PluginInventorySettingsTab.module.css 一致，无猜测 token。

- **三路审查**：host/client 各一子 agent 代码审查 + 一子 agent 对照 harness 源码核实契约
  （契约零硬性问题，全部签名/字段名一致：readFrom→{meta,events}、cachedSnapshot(header)→
  {asOfSeq,values}、SessionRecord={header,live,persisted}、webServer.register({kind:'exact',path,handler})
  返回 disposer、settings.section label 允许字符串）。子 agent 只读不改，落档由主 agent 统一做。

- **官方文档核查结论**：DSH 官方**没有任何**图片回退/自动图转文机制，官方唯一做法是 settings.yaml
  给模型声明 `input: [text, image]`（`docs/user/guide/providers.md`「Image input」一节，含
  `defaultInput` 路由级 fallback 与 `modelOverrides` 收窄）；官方也不提供发送拦截/图转文扩展点。

- **设计决策**：白底 `#fff`、主文字 `#18191c`、次级 `#61666d`、三级 `#9499a0`、品牌粉
  `#fb7299`、分隔线 `#f1f2f3`、边框 `#e3e5e7`；粉色 `bilibili` 字标 + `#f1f2f3` 圆角胶囊搜索框
  （focus 粉色光环）；**左导航栏**（推荐/排行榜/我的，选中=粉字+浅粉底）替代顶部 tab（mac App
  风格）；卡片=白卡内嵌圆角封面（8px）、2 行标题、灰色 meta、黑色胶囊时长角标、hover 粉边；
  播放页 18px 标题 + 灰 stat 行 + `#f1f2f3` 简介块；评论区灰用户名 + 粉链接 + 浅灰分隔线；
  画质/弹幕/排序控件与登录弹窗同步改白色系粉胶囊。


