import { ReadFileTool } from './tools/ReadFileTool.js';
import { ListDirTool } from './tools/ListDirTool.js';
import { GrepSearchTool } from './tools/GrepSearchTool.js';
import { AITool, ToolParams } from './tools/Tool.js';
import { MCPClient } from './mcp/mcp.js';

export type ToolsWithClients = {
	tools: AITool<ToolParams>[],
	clients: MCPClient[],
}

export async function createTools(workspaceRoot: string): Promise<ToolsWithClients> {
	const gitClient = new MCPClient("uvx", ["mcp-server-git", "--repository", workspaceRoot]);
	await gitClient.initialize();
	const gitTools = await gitClient.getTools();

	const manualTools = [
		new ReadFileTool(workspaceRoot),
		new ListDirTool(workspaceRoot),
		new GrepSearchTool(workspaceRoot),
	] as AITool<ToolParams>[];

	return {
		tools: [
			...manualTools,
			...gitTools,
		],
		clients: [
			gitClient,
		]
	}
}

export type { AITool } from './tools/Tool.js';
