import { promises as fs } from 'fs';
import { join, normalize } from 'path';
import Anthropic from '@anthropic-ai/sdk';
import { AITool } from './Tool.js';

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
		const lint = '';
		const build = '';

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

		// TODO: run `npm run format` here, don't care about the output
		// TODO: run `npm run lint` and grab output here for lint string
		// TODO: run `npm run type` and grab output here for build string

		return (
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
			'\n\n'
		);
	}

	describeInvocation(params: EditFilesParams): string {
		const fileList = Object.keys(params.files).join(', ');
		return `(editing and checking files: ${fileList})`;
	}
}
