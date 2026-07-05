/**
 * LINK Registry · MCP Bridge
 *
 * 职责：连接 MCP Server，发现工具，注册到 ToolRegistry。
 * 每个 MCP Server 作为一个独立的"执行器"接入 LINK 工具系统。
 */

const { Client } = require('@modelcontextprotocol/sdk/client');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');

/** MCP Server 断线重连间隔 */
const RECONNECT_DELAY = 5000;

class MCPBridge {
  constructor() {
    this.servers = new Map();   // name → { client, transport, config, tools, connected }
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
    };
    this.servers.set(config.name, serverEntry);

    // 监听断线
    transport.onclose = () => {
      serverEntry.connected = false;
      console.warn(`  ⚠ MCP Server "${config.name}" 断开，${RECONNECT_DELAY / 1000}s 后重连`);
      setTimeout(() => this._reconnect(config.name), RECONNECT_DELAY);
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

      newTransport.onclose = () => {
        server.connected = false;
        console.warn(`  ⚠ MCP Server "${name}" 断开，${RECONNECT_DELAY / 1000}s 后重连`);
        setTimeout(() => this._reconnect(name), RECONNECT_DELAY);
      };

      console.log(`  ✓ MCP Server "${name}" 已重连`);
    } catch (err) {
      console.warn(`  ⚠ MCP Server "${name}" 重连失败，${RECONNECT_DELAY / 1000}s 后重试`);
      setTimeout(() => this._reconnect(name), RECONNECT_DELAY);
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
      };
    }
    return status;
  }
}

module.exports = { MCPBridge };
