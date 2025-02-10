import Anthropic from '@anthropic-ai/sdk';
import { AITool } from './Tool.js';
import { exec } from 'child_process';
import { promisify } from 'util';

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

	async invoke(): Promise<string> {
		const execAsync = promisify(exec);

		this.checkParams();

		let lint = '';
		let build = '';

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
			'Lint errors:\n' + lint + '\n\n' + 'Compile errors:\n' + build + '\n\n';

		console.log(returnString);
		return returnString;
	}

	describeInvocation(): string {
		this.checkParams();
		return `(linting and building)`;
	}
}
