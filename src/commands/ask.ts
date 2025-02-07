import { Command } from 'commander';
import Anthropic from '@anthropic-ai/sdk';
import { Model } from '../model.js';
import { createTools } from '../tools.js';
import { CONFIG } from '../config.js';

export const setupAskCommand = (anthropic: Anthropic): Command => {
	return new Command('ask')
		.description('Ask Claude a question')
		.argument('<question>', 'The question to ask Claude')
		.action(async (question: string) => {
			try {
				const tools = createTools(process.cwd());
				const model = new Model(anthropic, CONFIG.model, tools, CONFIG.systemPrompts.ask);
				const response = await model.createMessage(question);
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
