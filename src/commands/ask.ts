import { Command } from 'commander';
import Anthropic from '@anthropic-ai/sdk';
import { Model } from '../model.js';
import { createTools } from '../tools.js';
import { CONFIG } from '../config.js';
import { Output } from '../output.js';
import { getPrompt } from '../input.js';
import {
	addCommonArgs,
	getContextContent,
	CommonArgs,
	loadSession,
	saveSession,
} from './common-args.js';

export const setupAskCommand = (anthropic: Anthropic): Command => {
	const command = new Command('ask')
		.description('Ask Claude a question')
		.argument('[question]', 'The question to ask Claude')
		.action(async (question?: string, options?: CommonArgs) => {
			const output = new Output();
			try {
				const prompt = await getPrompt(question);
				const contextContent = getContextContent(options || {});

				// Load session if provided
				const session = loadSession(options?.session, output);

				const tools = createTools(process.cwd());
				const model = new Model(
					anthropic,
					CONFIG.model,
					tools,
					CONFIG.systemPrompts.ask,
					output
				);
				const result = await model.createMessage({
					prompt,
					context: contextContent.length > 0 ? contextContent : undefined,
					session,
				});

				// Save session if path is provided
				saveSession(options?.session, result, output);
			} catch (error) {
				output.error(
					'Error: ' +
						(error instanceof Error ? error.message : 'An unknown error occurred')
				);
				process.exit(1);
			}
		});

	return addCommonArgs(command);
};
