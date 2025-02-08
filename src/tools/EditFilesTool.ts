import { promises as fs } from 'fs';
import { join, normalize } from 'path';
import Anthropic from '@anthropic-ai/sdk';
import { AITool } from './Tool.js';
import { exec } from 'child_process';
import { promisify } from 'util';

type EditFilesParams = {
	/**
	 * Object mapping relative file paths to their new content
	 */
	files: Record<string, string>;
};

export class EditFilesTool implements AITool<EditFilesParams> {
	constructor(private workspaceRoot: string) {}

	getDefinition(): Anthropic.Tool {
		const schema = {
			type: 'object' as const,
			properties: {
				files: {
					type: 'object' as const,
					description: 'Object mapping relative file paths to their new content',
					additionalProperties: {
						type: 'string' as const,
					},
				},
			},
			required: ['files'],
		};

		return {
			name: 'edit_files',
			description:
				"Write new content to one or more files, specified as a map of paths to content. The results will include the files written successfully or any errors, and then any linting or compile errors present after these changes. Use this tool again to fix those, but give up if you can't after a few times.",
			input_schema: schema,
		};
	}

	async invoke(params: EditFilesParams): Promise<string> {
		const execAsync = promisify(exec);

		if (params === undefined || params.files === undefined) {
			throw new Error('Bad edit files input parameters: ' + JSON.stringify(params));
		}

		// Verify all paths are within workspace root first
		for (const relativePath of Object.keys(params.files)) {
			const fullPath = join(this.workspaceRoot, relativePath);
			const normalizedPath = normalize(fullPath);
			if (!normalizedPath.startsWith(this.workspaceRoot)) {
				throw new Error(
					`Access denied: The path ${relativePath} resolves outside the workspace root`
				);
			}
		}

		const successful = [];
		const failed = [];
		let lint = '';
		let build = '';

		// Now perform all writes
		for (const [relativePath, content] of Object.entries(params.files)) {
			const fullPath = join(this.workspaceRoot, relativePath);
			try {
				await fs.writeFile(fullPath, content);
				successful.push(`Successfully wrote to ${relativePath}`);
			} catch (error: unknown) {
				if (error instanceof Error) {
					failed.push(`Failed to write file at ${relativePath}: ${error.message}`);
				} else {
					failed.push(`Failed to write file at ${relativePath}: Unknown error`);
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
		const fileList = Object.keys(params.files).join(', ');
		return `(editing and checking files: ${fileList})`;
	}
}
