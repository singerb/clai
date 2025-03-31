import * as genai from '@google/genai';
import type { AITool, ToolParams } from '../tools/Tool.js';
import { Output } from '../output.js';
import fs from 'fs';
import path from 'path';
import { z } from 'zod';
import { Model, CreateMessageOptions } from '../model.js';

export interface GeminiMessageResult {
	state: {
		messages: genai.Content[];
		systemPrompts: string[];
	};
}

// Zod schema for function response
const FunctionResponseSchema = z.object({
	id: z.string().optional(),
	name: z.string().optional(),
	response: z.union([z.object({ output: z.string() }), z.object({ error: z.string() })]),
});

// Zod schema for message part
const PartSchema = z.union([
	z.object({
		text: z.string(),
	}),
	z.object({
		inlineData: z.object({
			mimeType: z.string(),
			data: z.string(),
		}),
	}),
	z.object({
		functionCall: z.object({
			id: z.string().optional(),
			name: z.string(),
			args: z.record(z.any()).optional(),
		}),
	}),
	z.object({
		functionResponse: FunctionResponseSchema,
	}),
]);

// Zod schema for message
const MessageSchema = z.object({
	role: z.union([z.literal('user'), z.literal('model'), z.literal('system')]),
	parts: z.array(PartSchema).optional(),
});

// Zod schema for GeminiMessageResult
const GeminiMessageResultSchema = z.object({
	state: z.object({
		messages: z.array(MessageSchema),
		systemPrompts: z.array(z.string()),
	}),
});

export class GeminiModel implements Model<GeminiMessageResult> {
	private ai;

	constructor(
		apiKey: string,
		protected modelName: string,
		protected tools: AITool<ToolParams>[],
		protected systemPrompt: string,
		protected output: Output
	) {
		// Create a new instance of the Gemini API client
		this.ai = new genai.GoogleGenAI({ apiKey });
	}

	/**
	 * Process a tool call from Gemini's response
	 */
	protected async handleToolCall(functionCall: {
		name: string;
		args: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
	}): Promise<{
		content: string;
		is_error?: boolean;
		system?: string;
	}> {
		// this.output.aiInfo('tool request: ' + functionCall.name);
		this.output.aiInfo(
			'tool request: ' + functionCall.name + ' with ' + JSON.stringify(functionCall.args)
		);

		// Find the tool
		const tool = this.tools.find((t) => t.getDefinition().gemini?.name === functionCall.name);

		try {
			if (!tool) {
				throw new Error(`Tool ${functionCall.name} not found`);
			}

			// Execute the tool
			this.output.text(tool.describeInvocation(functionCall.args));
			const result = await tool.invoke(functionCall.args);
			return {
				content: result.content,
				system: result.system,
			};
		} catch (error) {
			this.output.error('tool error: ' + error);
			return {
				content: error instanceof Error ? error.message : String(error),
				is_error: true,
			};
		}
	}

	/**
	 * Creates a message with the given chat history and system prompts
	 */
	protected async createMessageFromHistory(
		messages: genai.Content[],
		systemPrompts: string[] = [this.systemPrompt]
	): Promise<GeminiMessageResult> {
		// Get the last user message
		const lastMessage = messages.pop();
		if (!lastMessage || lastMessage.role !== 'user') {
			throw new Error('Expected last message to be from user');
		}

		// Create a chat session
		// console.log('starting messages: ' + JSON.stringify(messages));
		const chat = this.ai.chats.create({
			model: this.modelName,
			history: messages,
			config: {
				systemInstruction: {
					role: 'system',
					parts: systemPrompts.map((p) => ({ text: p })),
				},
				tools: [
					{
						functionDeclarations: this.tools
							.filter((t) => t.getDefinition().gemini !== undefined)
							.map((t) => t.getDefinition().gemini!),
					},
				],
			},
		});

		let toSend = lastMessage.parts!;

		while (true) {
			// Send the message to the model
			// console.log('parts to send: ' + JSON.stringify(toSend));
			const result = await chat.sendMessage({ message: toSend });

			// Log useful info
			this.output.aiInfo('response received from Gemini');
			// console.log('history now:' + JSON.stringify(chat.getHistory()));

			// Check for function calls
			const functionCalls = result.functionCalls;
			let needsContinuation = false;

			// Output the text response; assume there isn't one if we're calling functions to avoid the warning message
			if (!functionCalls || functionCalls.length === 0) {
				this.output.text(result.text!);
			}

			if (functionCalls && functionCalls.length > 0) {
				needsContinuation = true;
				toSend = [];

				// Handle each function call
				for (const functionCall of functionCalls) {
					const toolResult = await this.handleToolCall({
						name: functionCall.name!,
						args: functionCall.args!,
					});

					// If the tool provided new system prompt content, add it to the messages, we don't support this
					if (toolResult.system) {
						toSend.push({ text: toolResult.system });
					}

					// Add tool result
					let toolResponse;
					if (toolResult.is_error) {
						toolResponse = { error: toolResult.content };
					} else {
						toolResponse = { output: toolResult.content };
					}
					toSend.push({
						functionResponse: {
							id: functionCall.id,
							name: functionCall.name,
							response: toolResponse,
						},
					});
				}
			}

			// If any tool was used, continue the conversation
			if (!needsContinuation) {
				break;
			}
		}

		return {
			state: {
				messages: chat.getHistory(),
				systemPrompts,
			},
		};
	}

	/**
	 * Creates a message with Gemini, combining any previous session data if provided
	 */
	public async createMessage(
		options: CreateMessageOptions<GeminiMessageResult>
	): Promise<GeminiMessageResult> {
		// Start with default system prompt
		let systemPrompts: string[] = [this.systemPrompt];

		// Merge with previous session's system prompts if available
		if (options.session) {
			systemPrompts = options.session.state.systemPrompts;
		}

		// Add context if provided
		if (options.context && options.context.length > 0) {
			systemPrompts = [...systemPrompts, ...options.context];
		}

		// Start with either previous messages or empty array
		const messages = options.session ? [...options.session.state.messages] : [];

		// Add the new prompt as a user message
		messages.push({
			role: 'user',
			parts: [{ text: options.prompt }],
		});

		return this.createMessageFromHistory(messages, systemPrompts);
	}

	/**
	 * Load a session from the provided session path
	 * @param sessionPath Path to the session file
	 * @returns The loaded session or undefined if loading failed
	 */
	public loadSession(sessionPath: string | undefined): GeminiMessageResult | undefined {
		if (!sessionPath) {
			return undefined;
		}

		const resolvedPath = path.resolve(sessionPath);
		if (!fs.existsSync(resolvedPath)) {
			return undefined;
		}

		try {
			const sessionData = JSON.parse(fs.readFileSync(resolvedPath, 'utf-8'));
			// Validate session data
			const parseResult = GeminiMessageResultSchema.safeParse(sessionData);
			if (parseResult.success) {
				this.output.text(`Session loaded from ${resolvedPath}`);
				return parseResult.data;
			} else {
				this.output.text(`Invalid session format in ${resolvedPath}, starting fresh`);
				return undefined;
			}
		} catch {
			this.output.text(`Error parsing session file ${resolvedPath}, starting fresh`);
			return undefined;
		}
	}

	/**
	 * Save a session to the provided session path
	 * @param sessionPath Path to save the session to
	 * @param result The session result to save
	 */
	public saveSession(sessionPath: string | undefined, result: GeminiMessageResult): void {
		if (!sessionPath) {
			return;
		}

		const resolvedPath = path.resolve(sessionPath);
		fs.writeFileSync(resolvedPath, JSON.stringify(result, null, '\t'), 'utf-8');
		this.output.text(`Session saved to ${resolvedPath}`);
	}
}
