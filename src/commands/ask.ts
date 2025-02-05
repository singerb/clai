import { Command } from 'commander';
import Anthropic from '@anthropic-ai/sdk';
import { createMessage } from '../messages.js';

export const setupAskCommand = (anthropic: Anthropic): Command => {
	return new Command('ask')
		.description('Ask Claude a question')
		.argument('<question>', 'The question to ask Claude')
		.action(async (question: string) => {
			try {
				const response = await createMessage(anthropic, question);
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
