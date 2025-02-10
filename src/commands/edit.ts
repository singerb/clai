import { Command } from 'commander';
import Anthropic from '@anthropic-ai/sdk';
import { Model } from '../model.js';
import { createTools } from '../tools.js';
import { EditFileTool } from '../tools/EditFileTool.js';
import { BuildTool } from '../tools/BuildTool.js';
import { CONFIG } from '../config.js';
import { Output } from '../output.js';

export const setupEditCommand = (anthropic: Anthropic): Command => {
	return new Command('edit')
		.description('Have Claude edit your code')
		.argument('<request>', 'The edit request for Claude')
		.action(async (request: string) => {
			const output = new Output();
			try {
				// add the edit and build tool for this command
				const tools = [
					...createTools(process.cwd()),
					new EditFileTool(process.cwd()),
					new BuildTool(process.cwd()),
				];
				const model = new Model(
					anthropic,
					CONFIG.model,
					tools,
					CONFIG.systemPrompts.edit,
					output
				);
				await model.createMessage(request);
			} catch (error) {
				output.error(
					'Error: ' +
						(error instanceof Error ? error.message : 'An unknown error occurred')
				);
				process.exit(1);
			}
		});
};
