# 自定义工具目录

将你的自定义工具放在 `tools/*.yaml` 中，LINK 启动时自动加载，**不需要写代码**。

## 快速开始

复制 `tools/_example.yaml` 为 `tools/my-tool.yaml`，按模板修改即可。

## 支持的执行类型

| 类型 | 用途 |
|:----|:-----|
| `http` | 调 HTTP API、搜索、抓网页 |
| `command` | 本机执行命令、脚本 |
| `ssh` | 远程服务器管理 |
