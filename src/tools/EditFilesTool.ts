import { promises as fs } from 'fs';
import { join, normalize } from 'path';
import Anthropic from '@anthropic-ai/sdk';
import { AITool } from './Tool.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import { z } from 'zod';

type EditFilesParams = {
	/**
	 * Array of objects mapping relative file paths to their new content
	 */
	files: { path: string; content: string }[];
};

export class EditFilesTool implements AITool<EditFilesParams> {
	private schema = z.object({
		files: z.array(
			z.object({
				path: z.string(),
				content: z.string(),
			})
		),
	});

	constructor(private workspaceRoot: string) {}

	getDefinition(): Anthropic.Tool {
		const schema = {
			type: 'object' as const,
			properties: {
				files: {
					type: 'array' as const,
					description:
						'Array of record objects, where each object has the file path and new content for that file',
					items: {
						type: 'object' as const,
						properties: {
							path: {
								type: 'string' as const,
								description: 'File path to write to',
							},
							content: {
								type: 'string' as const,
								description: 'New file content to write',
							},
						},
						required: ['path', 'content'],
					},
				},
			},
			required: ['files'],
		};

		return {
			name: 'edit_files',
			description:
				"Write new content to one or more files, specified as an array of record objects each with a path and the new content for that path. The results will include the files written successfully or any errors, and then any linting or compile errors present after these changes. Use this tool again to fix those, but give up if you can't after a few times.",
			input_schema: schema,
		};
	}

	checkParams(params: EditFilesParams): void {
		this.schema.parse(params);
	}

	async invoke(params: EditFilesParams): Promise<string> {
		const execAsync = promisify(exec);

		this.checkParams(params);

		// Verify all paths are within workspace root first
		for (const { path } of params.files) {
			const fullPath = join(this.workspaceRoot, path);
			const normalizedPath = normalize(fullPath);
			if (!normalizedPath.startsWith(this.workspaceRoot)) {
				throw new Error(
					`Access denied: The path ${path} resolves outside the workspace root`
				);
			}
		}

		const successful = [];
		const failed = [];
		let lint = '';
		let build = '';

		// Now perform all writes
		for (const { path, content } of params.files) {
			const fullPath = join(this.workspaceRoot, path);
			try {
				await fs.writeFile(fullPath, content);
				successful.push(`Successfully wrote to ${path}`);
			} catch (error: unknown) {
				if (error instanceof Error) {
					failed.push(`Failed to write file at ${path}: ${error.message}`);
				} else {
					failed.push(`Failed to write file at ${path}: Unknown error`);
				}
			}
		}

		// Run format command and discard output
		try {
			await execAsync('npm run format', { cwd: this.workspaceRoot });
		} catch {
			// Ignore any formatting errors
		}

		// Run lint command and collect output
		try {
			const { stdout, stderr } = await execAsync('npm run lint', { cwd: this.workspaceRoot });
			lint = stdout + stderr;
		} catch (error: unknown) {
			if (error instanceof Error && 'stdout' in error && 'stderr' in error) {
				const execError = error as { stdout: string; stderr: string };
				lint = execError.stdout + execError.stderr;
			} else {
				lint = 'Error running lint command';
			}
		}

		// Run type check command and collect output
		try {
			const { stdout, stderr } = await execAsync('npm run type', { cwd: this.workspaceRoot });
			build = stdout + stderr;
		} catch (error: unknown) {
			if (error instanceof Error && 'stdout' in error && 'stderr' in error) {
				const execError = error as { stdout: string; stderr: string };
				build = execError.stdout + execError.stderr;
			} else {
				build = 'Error running type check command';
			}
		}

		const returnString =
			'Successful writes:\n' +
			successful.join('\n') +
			'\n\n' +
			'Failed writes:\n' +
			failed.join('\n') +
			'\n\n' +
			'Lint errors:\n' +
			lint +
			'\n\n' +
			'Compile errors:\n' +
			build +
			'\n\n';

		console.log(returnString);
		return returnString;
	}

	describeInvocation(params: EditFilesParams): string {
		this.checkParams(params);
		const fileList = params.files.map(({ path }) => path).join(', ');
		return `(editing and checking files: ${fileList})`;
	}
}
