import { ReadFileTool } from './tools/ReadFileTool.js';
import { ListDirTool } from './tools/ListDirTool.js';
import { GrepSearchTool } from './tools/GrepSearchTool.js';
import { AITool, ToolParams } from './tools/Tool.js';
import { MCPClient } from './mcp/mcp.js';
import { EditFileTool } from './tools/EditFileTool.js';
import { BuildTool } from './tools/BuildTool.js';

export type ToolsWithClients = {
	tools: AITool<ToolParams>[];
	clients: MCPClient[];
};

// Base function to set up common tools - not exported
async function createBaseTools(workspaceRoot: string): Promise<ToolsWithClients> {
	const gitClient = new MCPClient({
		program: 'uvx',
		args: ['mcp-server-git', '--repository', workspaceRoot],
	});
	await gitClient.initialize();
	const gitTools = await gitClient.getTools();

	const manualTools = [
		new ReadFileTool(workspaceRoot),
		new ListDirTool(workspaceRoot),
		new GrepSearchTool(workspaceRoot),
	] as AITool<ToolParams>[];

	return {
		tools: [...manualTools, ...gitTools],
		clients: [gitClient],
	};
}

// Read-only tools for asking questions
export async function createReadOnlyTools(workspaceRoot: string): Promise<ToolsWithClients> {
	return createBaseTools(workspaceRoot);
}

// Read-write tools for editing code
export async function createReadWriteTools(workspaceRoot: string): Promise<ToolsWithClients> {
	const baseToolsResult = await createBaseTools(workspaceRoot);

	const editTools = [
		new EditFileTool(workspaceRoot),
		...(BuildTool.isAvailable() ? [new BuildTool(workspaceRoot)] : []),
	] as AITool<ToolParams>[];

	return {
		tools: [...baseToolsResult.tools, ...editTools],
		clients: baseToolsResult.clients,
	};
}

export type { AITool } from './tools/Tool.js';
