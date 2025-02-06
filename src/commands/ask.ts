import { Command } from 'commander';
import Anthropic from '@anthropic-ai/sdk';
import { createMessage } from '../messages.js';
import { createTools } from '../tools.js';

export const setupAskCommand = (anthropic: Anthropic): Command => {
	return new Command('ask')
		.description('Ask Claude a question')
		.argument('<question>', 'The question to ask Claude')
		.action(async (question: string) => {
			try {
				const tools = createTools(process.cwd());
				const response = await createMessage(anthropic, question, tools);
				console.log('\nClaude:', response);
			} catch (error) {
				console.error(
					'Error:',
					error instanceof Error ? error.message : 'An unknown error occurred'
				);
				process.exit(1);
			}
		});
};
