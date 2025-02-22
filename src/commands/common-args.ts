import { Command } from 'commander';
import fs from 'fs';
import path from 'path';

export interface CommonArgs {
	context?: string[];
}

export function addCommonArgs(command: Command): Command {
	return command.option(
		'-c, --context <path>',
		'path to a context file to include in system prompt',
		(value: string, previous: string[]) => [...(previous || []), value],
		[]
	);
}

export function getContextContent(args: CommonArgs): string[] {
	if (!args.context?.length) {
		return [];
	}

	return args.context.map((contextPath) => {
		const filePath = path.resolve(contextPath);
		const content = fs.readFileSync(filePath, 'utf-8');
		return `${filePath}:\n\n${content}`;
	});
}
