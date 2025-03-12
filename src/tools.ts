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
	const manualTools = [
		new ReadFileTool(workspaceRoot),
		new ListDirTool(workspaceRoot),
		new GrepSearchTool(workspaceRoot),
	] as AITool<ToolParams>[];

	return {
		tools: manualTools,
		clients: [],
	};
}

// Read-only tools for asking questions
export async function createReadOnlyTools(workspaceRoot: string): Promise<ToolsWithClients> {
	// For read-only mode, restrict git tools to non-modifying operations
	const allowedGitTools = ['git_status', 'git_diff', 'git_diff_staged', 'git_diff_unstaged', 'git_log', 'git_show'];
	const gitClient = new MCPClient({
		program: 'uvx',
		args: ['mcp-server-git', '--repository', workspaceRoot],
		allowedTools: allowedGitTools,
	});
	await gitClient.initialize();
	const gitTools = await gitClient.getTools();

	const baseTools = await createBaseTools(workspaceRoot);

	return {
		tools: [...baseTools.tools, ...gitTools],
		clients: [...baseTools.clients, gitClient],
	}
}

// Read-write tools for editing code
export async function createReadWriteTools(workspaceRoot: string): Promise<ToolsWithClients> {
	// For read-write mode, allow all git tools
	const gitClient = new MCPClient({
		program: 'uvx',
		args: ['mcp-server-git', '--repository', workspaceRoot],
	});
	await gitClient.initialize();
	const gitTools = await gitClient.getTools();
	const baseToolsResult = await createBaseTools(workspaceRoot);

	const editTools = [
		new EditFileTool(workspaceRoot),
		...(BuildTool.isAvailable() ? [new BuildTool(workspaceRoot)] : []),
	] as AITool<ToolParams>[];

	return {
		tools: [...baseToolsResult.tools, ...editTools, ...gitTools],
		clients: [...baseToolsResult.clients, gitClient],
	};
}

export type { AITool } from './tools/Tool.js';
