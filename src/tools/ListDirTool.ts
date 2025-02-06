import { promises as fs } from 'fs';
import path from 'path';
import Anthropic from '@anthropic-ai/sdk';
import { AITool } from './Tool.js';

type ListDirParams = {
	/**
	 * Path to list contents of, relative to the workspace root
	 */
	relative_workspace_path: string;
};

export class ListDirTool implements AITool<ListDirParams> {
	constructor(private workspaceRoot: string) {}

	getDefinition(): Anthropic.Tool {
		const schema = {
			type: 'object' as const,
			properties: {
				relative_workspace_path: {
					type: 'string' as const,
					description: 'Path to list contents of, relative to the workspace root',
				},
			},
			required: ['relative_workspace_path'],
		};

		return {
			name: 'list_dir',
			description: 'List the contents of a directory. Use this, recursively if needed, to discover files by looking at filenames.',
			input_schema: schema,
		};
	}

	async invoke(params: ListDirParams): Promise<string> {
		const fullPath = path.join(this.workspaceRoot, params.relative_workspace_path);

		// Ensure the resolved path stays within the workspace root
		const normalizedPath = path.normalize(fullPath);
		if (!normalizedPath.startsWith(this.workspaceRoot)) {
			throw new Error(
				`Access denied: The path ${params.relative_workspace_path} resolves outside the workspace root`
			);
		}

		try {
			const entries = await fs.readdir(fullPath, { withFileTypes: true });
			const formattedEntries = entries.map((entry) => {
				return entry.name + (entry.isDirectory() ? '/' : '');
			});
			return formattedEntries.join('\n');
		} catch (error: unknown) {
			if (error instanceof Error) {
				throw new Error(
					`Failed to list directory at ${params.relative_workspace_path}: ${error.message}`
				);
			}
			throw new Error(
				`Failed to list directory at ${params.relative_workspace_path}: Unknown error`
			);
		}
	}

	describeInvocation(params: ListDirParams): string {
		return '(listing directory at ' + params.relative_workspace_path + ')';
	}
}
