import { Command } from 'commander';
import Anthropic from '@anthropic-ai/sdk';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const program = new Command();
const anthropic = new Anthropic({
	apiKey: process.env.ANTHROPIC_API_KEY,
});

program.name('clai').description('Command Line AI Assistant powered by Claude').version('1.0.0');

program
	.command('ask')
	.description('Ask Claude a question')
	.argument('<question>', 'The question to ask Claude')
	.action(async (question: string) => {
		try {
			const message = await anthropic.messages.create({
				model: 'claude-3-sonnet-20240229',
				max_tokens: 1024,
				messages: [{ role: 'user', content: question }],
			});

			console.log('\nClaude:', message.content[0].text);
		} catch (error) {
			console.error(
				'Error:',
				error instanceof Error ? error.message : 'An unknown error occurred'
			);
			process.exit(1);
		}
	});

program.parse();
