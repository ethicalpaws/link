# AI 战友定义目录

每个战友一个独立目录，身份被多个 Markdown 文件完整定义。

## 目录结构

```
agents/
├── anchor/              ← 一个战友一个目录
│   ├── SOUL.md          ← 灵魂底色、核心信条（必需）
│   ├── AGENTS.md        ← 工作规范、职责、权限（必需）
│   ├── TOOLS.md         ← 工具使用说明（可选）
│   └── USER.md          ← 对用户的了解（可选，不公开）
├── coach/               ← 另一个战友
│   └── ...
└── README.md
```

## 在 link.config.js 中引用

```javascript
agents: [
  {
    id: 'anchor', name: '岸舟', emoji: '⚓',
    agentDir: './agents/anchor',   // ← 指向战友目录
    autoReply: true,
  },
]
```

## 注意事项

- `USER.md` 包含你对用户的了解，属于隐私数据。LINK 默认 `.gitignore` 已包含 `agents/*/USER.md`。
- `SOUL.md` 和 `AGENTS.md` 是必须的，缺少会有警告。
- 你也可以用简单的 `prompt` 字段替代目录方式（见 link.config.js 注释）。
