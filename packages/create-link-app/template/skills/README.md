# 工作流定义目录

将你的工作流放在 `skills/*.yaml` 中，LINK 启动时自动加载。

## 快速开始

复制 `skills/_example.yaml` 为 `skills/my-skill.yaml`，按模板修改即可。

## 什么是工作流

工作流是多个工具的编排组合，前一个步骤的输出可传给后一步。

```yaml
name: daily_digest
description: 每日摘要
steps:
  - tool: fetch_rss
    params:
      feedUrl: "https://example.com/rss"
  - tool: summarize
    params:
      text: "{{steps.step_0.result}}"
```
