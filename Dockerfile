FROM node:22-alpine
WORKDIR /link

# 1. 先复制 package.json（依赖信息）
COPY package.json ./
COPY packages/llm/package.json packages/llm/
COPY packages/agent-runtime/package.json packages/agent-runtime/
COPY packages/memory/package.json packages/memory/
COPY packages/gateway/package.json packages/gateway/
COPY packages/registry/package.json packages/registry/
COPY packages/knowledge/package.json packages/knowledge/
COPY packages/create-link-app/package.json packages/create-link-app/
COPY packages/admin-ui/package.json packages/admin-ui/

# 2. 安装依赖（只依赖 package.json，不改源码就不重装）
RUN npm install && npm cache clean --force

# 3. 复制源码
COPY packages/ packages/
COPY bin/ bin/
COPY link.config.js .
COPY tools/ tools/

EXPOSE 3000

CMD ["node", "bin/link"]
