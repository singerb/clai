import { Command } from 'commander';
import Anthropic from '@anthropic-ai/sdk';
import { Model } from '../model.js';
import { createTools } from '../tools.js';
import { EditFilesTool } from '../tools/EditFilesTool.js';
import { CONFIG } from '../config.js';

export const setupEditCommand = (anthropic: Anthropic): Command => {
	return new Command('edit')
		.description('Have Claude edit your code')
		.argument('<request>', 'The edit request for Claude')
		.action(async (request: string) => {
			try {
				// add the edit tool for this command
				const tools = [...createTools(process.cwd()), new EditFilesTool(process.cwd())];
				const model = new Model(anthropic, CONFIG.model, tools, CONFIG.systemPrompts.edit);
				const response = await model.createMessage(request);

				console.log(response);
			} catch (error) {
				console.error(
					'Error:',
					error instanceof Error ? error.message : 'An unknown error occurred'
				);
				process.exit(1);
			}
		});
};
