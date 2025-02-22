import { Command } from 'commander';
import Anthropic from '@anthropic-ai/sdk';
import { Model } from '../model.js';
import { createTools } from '../tools.js';
import { EditFileTool } from '../tools/EditFileTool.js';
import { BuildTool } from '../tools/BuildTool.js';
import { CONFIG } from '../config.js';
import { Output } from '../output.js';
import { getPrompt } from '../input.js';
import { addCommonArgs, getContextContent, CommonArgs } from './common-args.js';

export const setupEditCommand = (anthropic: Anthropic): Command => {
	const command = new Command('edit')
		.description('Have Claude edit your code')
		.argument('[request]', 'The edit request for Claude')
		.action(async (request?: string, options?: CommonArgs) => {
			const output = new Output();
			try {
				const prompt = await getPrompt(request);
				const contextContent = getContextContent(options || {});

				// add the edit and build tool for this command
				const tools = [
					...createTools(process.cwd()),
					new EditFileTool(process.cwd()),
					...(BuildTool.isAvailable() ? [new BuildTool(process.cwd())] : []),
				];
				const model = new Model(
					anthropic,
					CONFIG.model,
					tools,
					CONFIG.systemPrompts.edit,
					output
				);
				await model.createMessageWithContext(prompt, contextContent);
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
