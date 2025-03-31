import { Command } from 'commander';
import Anthropic from '@anthropic-ai/sdk';
import { AnthropicModel, AnthropicMessageResult } from '../models/anthropic.js';
import { OllamaModel, OllamaMessageResult } from '../models/ollama.js';
import { GeminiModel, GeminiMessageResult } from '../models/gemini.js';
import { createReadWriteTools } from '../tools.js';
import { CONFIG } from '../config.js';
import { Output } from '../output.js';
import { getPrompt } from '../input.js';
import { addCommonArgs, getContextContent, CommonArgs } from './common-args.js';
import { Model } from '../model.js';

export const setupEditCommand = async (anthropic: Anthropic): Promise<Command> => {
	const command = new Command('edit')
		.description('Have Claude edit your code')
		.argument('[request]', 'The edit request for Claude')
		.action(async (request?: string, options?: CommonArgs) => {
			const output = new Output();
			let cleanup = async (): Promise<void> => {};
			try {
				const prompt = await getPrompt(request);
				const contextContent = getContextContent(options || { model: 'anthropic' });

				const { tools, cleanup: cleanupFn } = await createReadWriteTools(process.cwd());
				cleanup = cleanupFn;

				let model: Model<
					AnthropicMessageResult | OllamaMessageResult | GeminiMessageResult
				>;
				if (options?.model === 'ollama') {
					model = new OllamaModel(
						CONFIG.model.ollama,
						tools,
						CONFIG.systemPrompts.edit, // Note: Using edit system prompt here
						output
					);
				} else if (options?.model === 'gemini') {
					if (!CONFIG.api.geminiKey) {
						throw new Error('GEMINI_API_KEY not set in environment');
					}
					model = new GeminiModel(
						CONFIG.api.geminiKey,
						CONFIG.model.gemini,
						tools,
						CONFIG.systemPrompts.edit, // Note: Using edit system prompt here
						output
					);
				} else if (options === undefined || options.model === 'anthropic') {
					model = new AnthropicModel(
						anthropic,
						CONFIG.model.anthropic,
						tools,
						CONFIG.systemPrompts.edit, // Note: Using edit system prompt here
						output
					);
				} else {
					throw new Error('Unknown model specified');
				}

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
