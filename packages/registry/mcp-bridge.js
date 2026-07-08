/**
 * LINK Registry · MCP Bridge
 *
 * 职责：连接 MCP Server，发现工具，注册到 ToolRegistry。
 * 每个 MCP Server 作为一个独立的"执行器"接入 LINK 工具系统。
 */

const { Client } = require('@modelcontextprotocol/sdk/client');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');

/** 初始重连延迟（毫秒） */
const INITIAL_RECONNECT_DELAY = 5000;
/** 最大重连延迟上限（毫秒） */
const MAX_RECONNECT_DELAY = 60_000;
/** 退避倍率 */
const BACKOFF_MULTIPLIER = 2;
/** Jitter 范围：±jitter/2 ~ +jitter/2（毫秒） */
const JITTER = 2000;

class MCPBridge {
  constructor() {
    this.servers = new Map();   // name → { client, transport, config, tools, connected, retryCount }
  }

  /**
   * 计算带 jitter 的退避延迟
   * @param {number} retryCount - 当前重试次数
   * @returns {number} 延迟毫秒数
   */
  _backoffDelay(retryCount) {
    const base = Math.min(INITIAL_RECONNECT_DELAY * Math.pow(BACKOFF_MULTIPLIER, retryCount), MAX_RECONNECT_DELAY);
    // 添加 ±1s jitter 防止 thundering herd
    const jitter = Math.floor(Math.random() * JITTER) - JITTER / 2;
    return Math.round(base + jitter);
  }

  /**
   * 连接一个 MCP Server 并返回发现的工具列表
   * @param {object} config - { name, command, args, env }
   * @returns {Promise<Array<{ name, description, parameters }>>}
   */
  async connectServer(config) {
    if (this.servers.has(config.name)) {
      throw new Error(`MCP Server "${config.name}" 已连接`);
    }

    const client = new Client({
      name: 'LINK',
      version: '0.1.0',
    });

    const transport = new StdioClientTransport({
      command: config.command,
      args: config.args || [],
      env: config.env || undefined,
    });

    try {
      await client.connect(transport);
    } catch (err) {
      throw new Error(`MCP Server "${config.name}" 连接失败: ${err.message}`);
    }

    // 发现工具
    const { tools } = await client.listTools();

    // 存服务器状态
    const serverEntry = {
      client, transport, config, tools,
      connected: true,
      retryCount: 0,
    };
    this.servers.set(config.name, serverEntry);

    // 监听断线
    transport.onclose = () => {
      serverEntry.connected = false;
      const delay = this._backoffDelay(serverEntry.retryCount);
      serverEntry.retryCount++;
      console.warn(`  ⚠ MCP Server "${config.name}" 断开，${(delay / 1000).toFixed(1)}s 后重连（第 ${serverEntry.retryCount} 次）`);
      setTimeout(() => this._reconnect(config.name), delay);
    };

    return this._formatTools(config.name, tools);
  }

  /**
   * 将 MCP 工具转为 LINK 工具格式
   */
  _formatTools(serverName, tools) {
    return (tools || []).map(tool => {
      // MCP 工具名用 serverName 做前缀，避免多服务重名
      const prefixedName = `${serverName}/${tool.name}`;
      return {
        name: prefixedName,
        description: tool.description || `MCP: ${serverName}/${tool.name}`,
        parameters: tool.inputSchema || {},
        _mcp: { serverName, toolName: tool.name },
        execute: async (args) => {
          return await this._callTool(serverName, tool.name, args);
        },
      };
    });
  }

  /**
   * 调用 MCP 工具
   */
  async _callTool(serverName, toolName, args) {
    const server = this.servers.get(serverName);
    if (!server || !server.connected) {
      throw new Error(`MCP Server "${serverName}" 未连接`);
    }
    try {
      const result = await server.client.callTool({
        name: toolName,
        arguments: args,
      });
      if (result.content && Array.isArray(result.content)) {
        return result.content.map(c => c.text || '').join('\n').trim();
      }
      return result?.content || '';
    } catch (err) {
      throw new Error(`MCP 工具 "${toolName}" 调用失败: ${err.message}`);
    }
  }

  /**
   * 断线重连
   */
  async _reconnect(name) {
    const server = this.servers.get(name);
    if (!server) return;
    try {
      const newClient = new Client({ name: 'LINK', version: '0.1.0' });
      const newTransport = new StdioClientTransport(server.config);
      await newClient.connect(newTransport);
      server.client = newClient;
      server.transport = newTransport;
      server.connected = true;
      server.retryCount = 0;  // 重连成功，重置计数器

      newTransport.onclose = () => {
        server.connected = false;
        const delay = this._backoffDelay(server.retryCount);
        server.retryCount++;
        console.warn(`  ⚠ MCP Server "${name}" 断开，${(delay / 1000).toFixed(1)}s 后重连（第 ${server.retryCount} 次）`);
        setTimeout(() => this._reconnect(name), delay);
      };

      console.log(`  ✓ MCP Server "${name}" 已重连`);
    } catch (err) {
      const delay = this._backoffDelay(server.retryCount);
      server.retryCount++;
      console.warn(`  ⚠ MCP Server "${name}" 重连失败，${(delay / 1000).toFixed(1)}s 后重试（第 ${server.retryCount} 次）`);
      setTimeout(() => this._reconnect(name), delay);
    }
  }

  /**
   * 断开所有 MCP Server
   */
  async disconnectAll() {
    for (const [name, server] of this.servers) {
      try {
        await server.client.close();
        console.log(`  ✓ MCP Server "${name}" 已断开`);
      } catch { /* 忽略关闭异常 */ }
    }
    this.servers.clear();
  }

  /**
   * 获取连接状态
   */
  getStatus() {
    const status = {};
    for (const [name, server] of this.servers) {
      status[name] = {
        connected: server.connected,
        toolCount: (server.tools || []).length,
        command: server.config.command,
        retryCount: server.retryCount,
      };
    }
    return status;
  }
}

module.exports = { MCPBridge };
