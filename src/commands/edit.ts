import { Command } from 'commander';
import Anthropic from '@anthropic-ai/sdk';
import { Model } from '../model.js';
import { createReadWriteTools } from '../tools.js';
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
import { MCPClient } from '../mcp/mcp.js';

export const setupEditCommand = async (anthropic: Anthropic): Promise<Command> => {
	const command = new Command('edit')
		.description('Have Claude edit your code')
		.argument('[request]', 'The edit request for Claude')
		.action(async (request?: string, options?: CommonArgs) => {
			const output = new Output();
			let clients: MCPClient[] = [];
			try {
				const prompt = await getPrompt(request);
				const contextContent = getContextContent(options || {});

				// Load session if provided
				const session = loadSession(options?.session, output);

				const { tools, clients: clientList } = await createReadWriteTools(process.cwd());
				clients = clientList;

				const model = new Model(
					anthropic,
					CONFIG.model,
					tools,
					CONFIG.systemPrompts.edit,
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
			} finally {
				for (const client of clients) {
					await client.close();
				}
			}
		});

	return addCommonArgs(command);
};
