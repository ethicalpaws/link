# 贡献指南

感谢你考虑为 LINK 贡献代码！

## 项目结构

```
LINK/
├── packages/
│   ├── llm/              LLM 适配器
│   ├── memory/           记忆系统
│   ├── gateway/          HTTP 网关 + 前端 UI + 工具调用引擎
│   ├── registry/         工具注册表 + YAML 加载 + 社区包
│   ├── knowledge/        知识库
│   ├── admin-ui/         管理面板
│   └── create-link-app/  CLI 脚手架
├── bin/link              启动入口
└── link.config.js        系统配置
```

## 开发流程

```bash
# 安装依赖
npm install

# 启动开发服务器
npm start

# 创建测试项目
npm run create my-test
```

## 提交规范

- 使用语义化提交信息：`feat:` `fix:` `docs:` `chore:`
- 提交前确保 `npm start` 能正常启动
- 新功能请附带简要说明

## 代码风格

- 使用 `require` 而非 `import`（CommonJS）
- 函数命名使用 camelCase，类使用 PascalCase
- 文件尾部保留空行
