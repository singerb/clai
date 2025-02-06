import { spawn } from 'child_process';
// import { promisify } from 'util';
import { AITool, ToolParams } from './Tool.js';
import Anthropic from '@anthropic-ai/sdk';

// const execAsync = promisify(exec);

type ProcessResult = { code: number; stdout: string; stderr: string };

interface GrepSearchParams extends ToolParams {
	/**
	 * The search query to find in files
	 */
	query: string;
}

export class GrepSearchTool implements AITool<GrepSearchParams> {
	constructor(private workspaceRoot: string) {}

	getDefinition(): Anthropic.Tool {
		const schema = {
			type: 'object' as const,
			properties: {
				query: {
					type: 'string' as const,
					description: 'The search query to find in files',
				},
			},
			required: ['query'],
		};

		return {
			name: 'grep_search',
			description:
				'Search for content in all files recursively from the workspace root using ripgrep. Use this to look for content within files.',
			input_schema: schema,
		};
	}

	async invoke(params: GrepSearchParams): Promise<string> {
		try {
			// console.log('running rg, query: ' + params.query.replace(/"/g, '\\"'));
			// Use ripgrep with smart case (-S), line numbers (-n), and limit to 50 matches (-m 50)
			const { stdout, stderr } = await this.spawnAsync('rg', [
				'-Sn',
				'-m',
				'50',
				params.query.replace(/"/g, '\\"'),
				'./',
			]);
			// console.log('got code, stdout, stderr ' + code + ', ' + stdout + ', ' + stderr);

			if (stderr) {
				// rg writes some info to stderr that isn't errors
				if (!stdout) {
					return `No matches found${stderr ? ` (${stderr})` : ''}`;
				}
			}

			return stdout || 'No matches found';
		} catch (error: unknown) {
			// console.log('caught error ' + error);
			// ripgrep exits with code 1 when no matches are found
			if (error && typeof error === 'object' && 'code' in error && error.code === 1) {
				return 'No matches found';
			}

			throw new Error(
				`Failed to search: ${error instanceof Error ? error.message : 'Unknown error'}`
			);
		}
	}

	describeInvocation(params: GrepSearchParams): string {
		return '(searching for ' + params.query + ')';
	}

	spawnAsync(cmd: string, args: string[]): Promise<ProcessResult> {
		return new Promise((resolve, reject) => {
			let done = false;
			let ret = { code: 0, stdout: '', stderr: '' };
			const child = spawn(cmd, args, {
				cwd: this.workspaceRoot,
				timeout: 10000,
			});

			child.on('error', (err) => {
				// console.log('err ' + err);
				if (!done) {
					done = true;
					reject(err);
					return;
				}
			});

			child.on('exit', (code, signal) => {
				// console.log('exit: ' + code + ', ' + signal);
				if (!done) {
					done = true;
					if (signal) {
						reject(new Error(signal));
						return;
					}

					if (code !== null) {
						ret.code = code;
						resolve(ret);
						return;
					}
				}
			});

			child.stderr.on('data', (data) => {
				// console.log('stderr: ' + data);
				ret.stderr += data;
			});

			child.stdout.on('data', (data) => {
				// console.log('stdout: ' + data);
				ret.stdout += data;
			});
		});
	}
}
