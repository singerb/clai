import Anthropic from '@anthropic-ai/sdk';
import { AITool, ToolResult } from './Tool.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import { CONFIG } from '../config.js';

type BuildParams = Record<string, string>;

export class BuildTool implements AITool<BuildParams> {
	constructor(private workspaceRoot: string) {}

	getDefinition(): Anthropic.Tool {
		const schema = {
			type: 'object' as const,
			properties: {},
			required: [],
		};

		return {
			name: 'build',
			description:
				'Trigger a format, lint, and type check for the codebase. The results will include any linting or compile errors present.',
			input_schema: schema,
		};
	}

	checkParams(): void {}

	async invoke(): Promise<ToolResult> {
		const execAsync = promisify(exec);

		this.checkParams();

		let lint = '';
		let build = '';

		// Run format command if defined
		if (CONFIG.buildCommands.format) {
			try {
				await execAsync(CONFIG.buildCommands.format, { cwd: this.workspaceRoot });
			} catch {
				// Ignore any formatting errors
			}
		}

		// Run lint command if defined and collect output
		if (CONFIG.buildCommands.lint) {
			try {
				const { stdout, stderr } = await execAsync(CONFIG.buildCommands.lint, {
					cwd: this.workspaceRoot,
				});
				lint = stdout + stderr;
			} catch (error: unknown) {
				if (error instanceof Error && 'stdout' in error && 'stderr' in error) {
					const execError = error as { stdout: string; stderr: string };
					lint = execError.stdout + execError.stderr;
				} else {
					lint = 'Error running lint command.';
				}
			}
		}

		// Run type check command if defined and collect output
		if (CONFIG.buildCommands.type) {
			try {
				const { stdout, stderr } = await execAsync(CONFIG.buildCommands.type, {
					cwd: this.workspaceRoot,
				});
				build = stdout + stderr;
			} catch (error: unknown) {
				if (error instanceof Error && 'stdout' in error && 'stderr' in error) {
					const execError = error as { stdout: string; stderr: string };
					build = execError.stdout + execError.stderr;
				} else {
					build = 'Error running type check command.';
				}
			}
		}

		const returnString =
			(CONFIG.buildCommands.lint ? 'Lint errors:\n' + lint + '\n\n' : '') +
			(CONFIG.buildCommands.type ? 'Compile errors:\n' + build + '\n\n' : '');

		console.log(returnString);
		return {
			content: returnString || 'No build commands were defined or executed.',
		};
	}

	static isAvailable(): boolean {
		return !!(
			CONFIG.buildCommands.format ||
			CONFIG.buildCommands.lint ||
			CONFIG.buildCommands.type
		);
	}

	describeInvocation(): string {
		this.checkParams();
		return `(linting and building)`;
	}
}
