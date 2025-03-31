import { promises as fs } from 'fs';
import path from 'path';
import { LocalTool, ToolDescriptions, ToolResult } from './Tool.js';
import { z } from 'zod';
import { Type } from '@google/genai';

type ReadFileParams = {
	/**
	 * The path of the file to read, relative to the workspace root
	 */
	relative_workspace_path: string;
};

export class ReadFileTool implements LocalTool<ReadFileParams> {
	private paramsSchema = z.object({
		relative_workspace_path: z.string().min(1),
	});

	constructor(private workspaceRoot: string) {}

	getDefinition(): ToolDescriptions {
		const name = 'read_file';
		const description = 'Read the contents of a file at the specified path.';
		const schema = {
			type: 'object' as const,
			properties: {
				relative_workspace_path: {
					type: 'string' as const,
					description: 'The path of the file to read, relative to the workspace root',
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
							description:
								'The path of the file to read, relative to the workspace root',
						},
					},
					required: ['relative_workspace_path'],
				},
			},
		};
	}

	checkParams(params: ReadFileParams): void {
		this.paramsSchema.parse(params);
	}

	async invoke(params: ReadFileParams): Promise<ToolResult> {
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
			const content = await fs.readFile(fullPath, 'utf-8');
			return {
				system: `${params.relative_workspace_path}:\n\n${content}`,
				content: `File ${params.relative_workspace_path} read successfully and included in the context.`,
			};
		} catch (error: unknown) {
			if (error instanceof Error) {
				throw new Error(
					`Failed to read file at ${params.relative_workspace_path}: ${error.message}`
				);
			}
			throw new Error(
				`Failed to read file at ${params.relative_workspace_path}: Unknown error.`
			);
		}
	}

	describeInvocation(params: ReadFileParams): string {
		this.checkParams(params);
		return '(reading file at ' + params.relative_workspace_path + ')';
	}
}
