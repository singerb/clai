import { Command } from 'commander';
import Anthropic from '@anthropic-ai/sdk';
import { Model } from '../model.js';
import { createTools } from '../tools.js';
import { CONFIG } from '../config.js';
import { Output } from '../output.js';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Buffer } from 'buffer';

const getStdinInput = async (): Promise<string> => {
	// Check if we have stdin input
	if (!process.stdin.isTTY) {
		const chunks: Uint8Array[] = [];
		for await (const chunk of process.stdin) {
			chunks.push(new Uint8Array(chunk));
		}
		const concatenated = Buffer.concat(chunks);
		return concatenated.toString().trim();
	}
	return '';
};

const getPromptFromEditor = async (): Promise<string> => {
	const tmpFile = path.join(os.tmpdir(), `claude-prompt-${Date.now()}.txt`);

	// Create empty temp file
	fs.writeFileSync(tmpFile, '');

	return new Promise((resolve, reject) => {
		const editor = spawn('nvim', [tmpFile], {
			stdio: 'inherit',
		});

		editor.on('close', (code) => {
			if (code === 0) {
				const content = fs.readFileSync(tmpFile, 'utf8').trim();
				fs.unlinkSync(tmpFile);
				resolve(content);
			} else {
				fs.unlinkSync(tmpFile);
				reject(new Error('Editor exited with non-zero code'));
			}
		});

		editor.on('error', (err) => {
			fs.unlinkSync(tmpFile);
			reject(err);
		});
	});
};

export const setupAskCommand = (anthropic: Anthropic): Command => {
	return new Command('ask')
		.description('Ask Claude a question')
		.argument('[question]', 'The question to ask Claude')
		.action(async (question?: string) => {
			const output = new Output();
			try {
				// Try to get prompt from stdin first
				let prompt = await getStdinInput();

				// If no stdin, use argument if provided
				if (!prompt && question) {
					prompt = question;
				}

				// If still no prompt, open editor
				if (!prompt) {
					try {
						prompt = await getPromptFromEditor();
					} catch (err: unknown) {
						output.error(
							'Failed to get prompt from editor: ' +
								(err instanceof Error ? err.message : String(err))
						);
						process.exit(1);
					}
				}

				// Check if we have a prompt after all attempts
				if (!prompt) {
					throw new Error('No prompt provided via stdin, argument, or editor');
				}

				const tools = createTools(process.cwd());
				const model = new Model(
					anthropic,
					CONFIG.model,
					tools,
					CONFIG.systemPrompts.ask,
					output
				);
				await model.createMessage(prompt);
			} catch (error) {
				output.error(
					'Error: ' +
						(error instanceof Error ? error.message : 'An unknown error occurred')
				);
				process.exit(1);
			}
		});
};
