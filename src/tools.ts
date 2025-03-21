import { ReadFileTool } from './tools/ReadFileTool.js';
import { ListDirTool } from './tools/ListDirTool.js';
import { GrepSearchTool } from './tools/GrepSearchTool.js';
import { AITool, ToolParams } from './tools/Tool.js';
import { MCPClient } from './mcp/mcp.js';
import { EditFileTool } from './tools/EditFileTool.js';
import { BuildTool } from './tools/BuildTool.js';

export type ToolsWithCleanup = {
	tools: AITool<ToolParams>[];
	cleanup: () => Promise<void>;
};

// List of client configurations
const clientsList = [
	/*
	{
		program: 'uvx',
		args: ['mcp-server-git', '--repository', 'WORKSPACE_ROOT'],
		readOnlyTools: [
			'git_status',
			'git_diff',
			'git_diff_staged',
			'git_diff_unstaged',
			'git_log',
			'git_show',
		],
		readWriteTools: [], // Empty array means all tools are allowed
	},
	*/
	/* This should be a nice replacement for my tools, but it's more verbose and also doesn't shut down properly. Plus mcp-text-editor replaces the read/write anyway.
	{
		program: 'npx',
		args: ['-y', '@modelcontextprotocol/server-filesystem', 'WORKSPACE_ROOT'],
		// note: removing the search_files tool in both since it doesn't consistently ignore node_modules and blows up our token rate limits
		readOnlyTools: [
			'read_file',
			'read_multiple_files',
			'list_directory',
			'get_file_info',
			'list_allowed_directories',
		],
		// note: removeing the write/edit tools here in favor of the mcp-text-editor tools
		// may also remove the read tools in favor of that, TBD
		readWriteTools: [
			'read_file',
			'read_multiple_files',
			'list_directory',
			'get_file_info',
			'list_allowed_directories',
			'create_directory',
			'move_file',
		],
	},
	{
		program: 'uvx',
		args: ['mcp-text-editor'],
		readOnlyTools: [
			'get_text_file_contents',
		],
		readWriteTools: [
			'get_text_file_contents',
			'patch_text_file_contents',
		],
	},
	*/
	{
		program: 'go',
		args: ['run', 'github.com/isaacphi/mcp-language-server@latest', '--workspace', 'WORKSPACE_ROOT', '--lsp', 'node_modules/.bin/typescript-language-server', '--', '--stdio', '--log-level', '4'],
		readWriteTools: [],
		readOnlyTools: [],
	},
	/*{
		program: 'npx',
		// args: ["-y", "--silent", "git+https://github.com/jonrad/lsp-mcp", "--lsp", "npx -y --silent -p 'typescript' -p 'typescript-language-server' typescript-language-server --stdio"],
		args: ["git+https://github.com/jonrad/lsp-mcp", "--lsp", "node_modules/.bin/typescript-language-server --stdio"],
		readWriteTools: [],
		readOnlyTools: [],
	},*/
];

// Helper function to get clients and tools based on mode
async function getClientsAndTools(
	workspaceRoot: string,
	mode: 'readOnly' | 'readWrite'
): Promise<{
	clients: MCPClient[];
	tools: AITool<ToolParams>[];
}> {
	const clients: MCPClient[] = [];
	const allTools: AITool<ToolParams>[] = [];

	for (const clientConfig of clientsList) {
		const allowedTools =
			mode === 'readOnly' ? clientConfig.readOnlyTools : clientConfig.readWriteTools;

		// Create a copy of the args array
		const args = clientConfig.args.map((arg) =>
			arg === 'WORKSPACE_ROOT' ? workspaceRoot : arg
		);

		const client = new MCPClient({
			program: clientConfig.program,
			args,
			allowedTools,
		});

		console.log(clientConfig.program + ' ' + clientConfig.args.join(' '));
		await client.initialize();
		const tools = await client.getTools();
		console.log(JSON.stringify(tools.map((tool)=>tool.getDefinition())));

		clients.push(client);
		allTools.push(...tools);
	}

	return { clients, tools: allTools };
}

// Helper function to create a cleanup function from a list of clients
function createCleanupFunction(
	clients: MCPClient[],
	previousCleanup?: () => Promise<void>
): () => Promise<void> {
	return async () => {
		for (const client of clients) {
			await client.close();
		}
		if (previousCleanup) {
			await previousCleanup();
		}
	};
}

// Base function to set up common tools - not exported
async function createBaseTools(workspaceRoot: string): Promise<ToolsWithCleanup> {
	const manualTools = [
		new ReadFileTool(workspaceRoot),
		new ListDirTool(workspaceRoot),
		new GrepSearchTool(workspaceRoot),
	] as AITool<ToolParams>[];

	return {
		tools: manualTools,
		cleanup: createCleanupFunction([]),
	};
}

// Read-only tools for asking questions
export async function createReadOnlyTools(workspaceRoot: string): Promise<ToolsWithCleanup> {
	const baseTools = await createBaseTools(workspaceRoot);
	const { clients, tools } = await getClientsAndTools(workspaceRoot, 'readOnly');

	return {
		tools: [...baseTools.tools, ...tools],
		cleanup: createCleanupFunction(clients, baseTools.cleanup),
	};
}

// Read-write tools for editing code
export async function createReadWriteTools(workspaceRoot: string): Promise<ToolsWithCleanup> {
	const baseToolsResult = await createBaseTools(workspaceRoot);
	const { clients, tools } = await getClientsAndTools(workspaceRoot, 'readWrite');

	const editTools = [
		new EditFileTool(workspaceRoot),
		...(BuildTool.isAvailable() ? [new BuildTool(workspaceRoot)] : []),
	] as AITool<ToolParams>[];

	return {
		tools: [...baseToolsResult.tools, ...editTools, ...tools],
		cleanup: createCleanupFunction(clients, baseToolsResult.cleanup),
	};
}

export type { AITool } from './tools/Tool.js';
