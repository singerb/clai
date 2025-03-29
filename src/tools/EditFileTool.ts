import { promises as fs } from 'fs';
import { join, normalize } from 'path';
import { LocalTool, ToolResult, ToolDescriptions } from './Tool.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import { z } from 'zod';

type EditFileParams = {
	/**
	 */
	relative_workspace_path: string;
	content: string;
};

export class EditFileTool implements LocalTool<EditFileParams> {
	private schema = z.object({
		relative_workspace_path: z.string(),
		content: z.string(),
	});

	constructor(private workspaceRoot: string) {}

	getDefinition(): ToolDescriptions {
		const name = 'edit_file';
		const description =
			'Write new content to one file, specified by a path and the new content for that path. The results will include whether the file was written successfully or any errors.';
		const schema = {
			type: 'object' as const,
			properties: {
				relative_workspace_path: {
					type: 'string' as const,
					description: 'File path relative to workspace root to write to',
				},
				content: {
					type: 'string' as const,
					description: 'New file content to write',
				},
			},
			required: ['path', 'content'],
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
		};
	}

	checkParams(params: EditFileParams): void {
		this.schema.parse(params);
	}

	async invoke(params: EditFileParams): Promise<ToolResult> {
		const execAsync = promisify(exec);

		this.checkParams(params);

		// Verify all paths are within workspace root first
		const fullPath = join(this.workspaceRoot, params.relative_workspace_path);
		const normalizedPath = normalize(fullPath);
		if (!normalizedPath.startsWith(this.workspaceRoot)) {
			throw new Error(
				`Access denied: The path ${params.relative_workspace_path} resolves outside the workspace root.`
			);
		}

		const successful = [];
		const failed = [];

		// Now perform all writes
		try {
			await fs.writeFile(fullPath, params.content);
			successful.push(`Successfully wrote to ${params.relative_workspace_path}.`);
		} catch (error: unknown) {
			if (error instanceof Error) {
				failed.push(
					`Failed to write file at ${params.relative_workspace_path}: ${error.message}.`
				);
			} else {
				failed.push(
					`Failed to write file at ${params.relative_workspace_path}: Unknown error.`
				);
			}
		}

		// Run format command and discard output
		try {
			await execAsync('npm run format', { cwd: this.workspaceRoot });
		} catch {
			// Ignore any formatting errors
		}
		const returnString =
			'Successful writes:\n' +
			successful.join('\n') +
			'\n\n' +
			'Failed writes:\n' +
			failed.join('\n') +
			'\n\n';

		console.log(returnString);
		return {
			content: returnString,
		};
	}

	describeInvocation(params: EditFileParams): string {
		this.checkParams(params);
		return `(editing file: ${params.relative_workspace_path})`;
	}
}
