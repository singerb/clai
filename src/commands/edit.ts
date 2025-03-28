import { Command } from 'commander';
import Anthropic from '@anthropic-ai/sdk';
import { AnthropicModel } from '../models/anthropic.js';
import { createReadWriteTools } from '../tools.js';
import { CONFIG } from '../config.js';
import { Output } from '../output.js';
import { getPrompt } from '../input.js';
import { addCommonArgs, getContextContent, CommonArgs } from './common-args.js';

export const setupEditCommand = async (anthropic: Anthropic): Promise<Command> => {
	const command = new Command('edit')
		.description('Have Claude edit your code')
		.argument('[request]', 'The edit request for Claude')
		.action(async (request?: string, options?: CommonArgs) => {
			const output = new Output();
			let cleanup = async (): Promise<void> => {};
			try {
				const prompt = await getPrompt(request);
				const contextContent = getContextContent(options || {});

				const { tools, cleanup: cleanupFn } = await createReadWriteTools(process.cwd());
				cleanup = cleanupFn;

				const model = new AnthropicModel(
					anthropic,
					CONFIG.model,
					tools,
					CONFIG.systemPrompts.edit,
					output
				);

				// Load session if provided
				const session = model.loadSession(options?.session);

				const result = await model.createMessage({
					prompt,
					context: contextContent.length > 0 ? contextContent : undefined,
					session,
				});

				// Save session if path is provided
				model.saveSession(options?.session, result);
			} catch (error) {
				output.error(
					'Error: ' +
						(error instanceof Error ? error.message : 'An unknown error occurred')
				);
				process.exit(1);
			} finally {
				await cleanup();
			}
		});

	return addCommonArgs(command);
};
