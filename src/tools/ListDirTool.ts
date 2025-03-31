import { promises as fs } from 'fs';
import path from 'path';
import { LocalTool, ToolDescriptions, ToolResult } from './Tool.js';
import { z } from 'zod';
import { Type } from '@google/genai';

type ListDirParams = {
	/**
	 * Path to list contents of, relative to the workspace root
	 */
	relative_workspace_path: string;
};

export class ListDirTool implements LocalTool<ListDirParams> {
	private paramsSchema = z.object({
		relative_workspace_path: z.string().min(1),
	});

	constructor(private workspaceRoot: string) {}

	getDefinition(): ToolDescriptions {
		const name = 'list_dir';
		const description =
			'List the contents of a directory. Use this, recursively if needed, to discover files by looking at filenames.';
		const schema = {
			type: 'object' as const,
			properties: {
				relative_workspace_path: {
					type: 'string' as const,
					description:
						'Path to list contents of, relative to the workspace root; specify . to examine the current working directory',
				},
			},
			required: ['relative_workspace_path'],
		};

		return {
			anthropic: {
				name,
				description,
				input_schema: schema,
			},
			ollama: {
				type: 'function',
				function: {
					name,
					description,
					parameters: schema,
				},
			},
			gemini: {
				name,
				description,
				parameters: {
					type: Type.OBJECT,
					properties: {
						relative_workspace_path: {
							type: Type.STRING,
							description: 'Path to list contents of, relative to the workspace root',
						},
					},
					required: ['relative_workspace_path'],
				},
			},
		};
	}

	checkParams(params: ListDirParams): void {
		this.paramsSchema.parse(params);
	}

	async invoke(params: ListDirParams): Promise<ToolResult> {
		this.checkParams(params);
		const fullPath = path.join(this.workspaceRoot, params.relative_workspace_path);

		// Ensure the resolved path stays within the workspace root
		const normalizedPath = path.normalize(fullPath);
		if (!normalizedPath.startsWith(this.workspaceRoot)) {
			throw new Error(
				`Access denied: The path ${params.relative_workspace_path} resolves outside the workspace root.`
			);
		}

		try {
			const entries = await fs.readdir(fullPath, { withFileTypes: true });
			const formattedEntries = entries.map((entry) => {
				return entry.name + (entry.isDirectory() ? '/' : '');
			});
			return {
				content: formattedEntries.join('\n'),
			};
		} catch (error: unknown) {
			if (error instanceof Error) {
				throw new Error(
					`Failed to list directory at ${params.relative_workspace_path}: ${error.message}`
				);
			}
			throw new Error(
				`Failed to list directory at ${params.relative_workspace_path}: Unknown error.`
			);
		}
	}

	describeInvocation(params: ListDirParams): string {
		this.checkParams(params);
		return '(listing directory at ' + params.relative_workspace_path + ')';
	}
}
