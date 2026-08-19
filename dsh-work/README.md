# dsh-work

DSH **工作 / 协作场景包**：多 Agent 团队协作（原 `dsh-agent-teams` 改名收编，第一方维护）。

- 9 个 `agent_teams_*` 工具：创建团队 / 添加成员 / 移除成员 / 建任务 / 领任务 /
  更新任务 / 发消息 / 查状态 / 删除归档。
- Web 活动面板 + 对话流卡片，状态存本地磁盘（`.agent-teams/<teamId>/`），可复盘。
- 依赖 `dsh-essentials` 作为基础包。

## 安装

```sh
bash scripts/install.sh --scenario work
# 或低层
node scripts/install-plugins.mjs -p web --only dsh-work
```

## 上游关系

已接受脱钩，按第一方维护；上游 NanmiCoder/dsh-agent-teams 更新以 cherry-pick 方式参考。
