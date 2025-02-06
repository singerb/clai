import { ReadFileTool } from './tools/ReadFileTool.js';
import { ListDirTool } from './tools/ListDirTool.js';
import { GrepSearchTool } from './tools/GrepSearchTool.js';
import { AITool, ToolParams } from './tools/Tool.js';

export function createTools(workspaceRoot: string): AITool<ToolParams>[] {
	return [
		new ReadFileTool(workspaceRoot),
		new ListDirTool(workspaceRoot),
		new GrepSearchTool(workspaceRoot),
	];
}

export type { AITool } from './tools/Tool.js';
