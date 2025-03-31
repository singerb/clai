import type { AITool, ToolParams } from '../tools/Tool.js';
import { Output } from '../output.js';
import { Model, CreateMessageOptions } from '../model.js';
import ollama, { ChatResponse, Message } from 'ollama';
import path from 'path';
import fs from 'fs';
import { z } from 'zod';

export interface OllamaMessageResult {
	state: {
		messages: Message[];
		systemPrompts: string[];
	};
}

// Zod schema for Message
const MessageSchema = z.object({
	role: z.union([z.literal('user'), z.literal('assistant'), z.literal('system')]),
	content: z.string(),
});

// Zod schema for OllamaMessageResult
const OllamaMessageResultSchema = z.object({
	state: z.object({
		messages: z.array(MessageSchema),
		systemPrompts: z.array(z.string()),
	}),
});

type ResponseResult = {
	text: string | null;
	toolResults: {
		content: string;
		is_error?: boolean;
		system?: string;
	}[];
};

export class OllamaModel implements Model<OllamaMessageResult> {
	constructor(
		protected model: string,
		protected tools: AITool<ToolParams>[],
		protected systemPrompt: string,
		protected output: Output
	) {}

	/**
	 * Handles a ChatResponse from Ollama
	 */
	protected async handleOllamaResponse(response: ChatResponse): Promise<ResponseResult> {
		const ret: ResponseResult = {
			text: null,
			toolResults: [],
		};

		// output the message content, if length > 0
		if (response.message.content.length > 0) {
			this.output.text(response.message.content);
			ret.text = response.message.content;
		}

		// if there is a tool calls in the message, do it (throw an error for now if multiple tool calls)
		if (response.message.tool_calls && response.message.tool_calls.length > 0) {
			for (const toolCall of response.message.tool_calls) {
				this.output.aiInfo('tool request: ' + toolCall.function.name);

				// find the tool
				const tool = this.tools.find(
					(t) => t.getDefinition().ollama?.function.name === toolCall.function.name
				);
				if (!tool) {
					throw new Error(`Tool ${toolCall.function.name} not found`);
				}

				try {
					const toolParams = toolCall.function.arguments;

					// execute the tool
					this.output.text(tool.describeInvocation(toolParams));
					const result = await tool.invoke(toolParams);

					ret.toolResults.push({
						content: result.content,
						system: result.system,
					});
				} catch (error) {
					this.output.error('tool error: ' + error);
					ret.toolResults.push({
						content: error instanceof Error ? error.message : String(error),
						is_error: true,
					});
				}
			}
		}

		// Return the message content (or null if length === 0), and the tool result (if there was one)
		return ret;
	}

	/**
	 * Creates a message with the given messages array and system prompts
	 */
	protected async createMessageFromHistory(
		messages: Message[],
		systemPrompts: string[] = [this.systemPrompt]
	): Promise<OllamaMessageResult> {
		const allMessages = [
			...systemPrompts.map((p) => {
				return { role: 'system', content: p };
			}),
			...messages,
		];

		const response = await ollama.chat({
			model: this.model,
			keep_alive: '30s',
			messages: allMessages,
			tools: this.tools
				.filter((t) => t.getDefinition().ollama !== undefined)
				.map((t) => t.getDefinition().ollama!),
		});
		console.log(JSON.stringify(response));

		// don't double-include the system prompts
		const newMessages = [...messages, response.message];
		const newPrompts = [...systemPrompts];

		// log useful info
		this.output.aiInfo('stop reason: ' + response.done_reason);

		const { toolResults } = await this.handleOllamaResponse(response);

		// handle tool calls and recurse
		if (toolResults.length > 0) {
			console.log(JSON.stringify(toolResults));
			for (const toolResult of toolResults) {
				// If the tool provided new system prompt content, add it
				if (toolResult.system) {
					newPrompts.push(toolResult.system);
				}

				newMessages.push({
					role: 'tool',
					content: toolResult.content,
				});
			}

			// If any tool was used, continue the conversation
			const continuationResponse = await this.createMessageFromHistory(
				newMessages,
				newPrompts
			);

			// Return the final conversation state from the continuation
			return continuationResponse;
		}

		return {
			state: {
				messages: newMessages,
				systemPrompts,
			},
		};
	}

	/**
	 * Creates a message with Ollama, combining any previous session data if provided
	 */
	public async createMessage(
		options: CreateMessageOptions<OllamaMessageResult>
	): Promise<OllamaMessageResult> {
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
		messages.push({ role: 'user', content: options.prompt });

		return this.createMessageFromHistory(messages, systemPrompts);
	}

	/**
	 * Load a session from the provided session path
	 * @param sessionPath Path to the session file
	 * @returns The loaded session or undefined if loading failed
	 */
	public loadSession(sessionPath: string | undefined): OllamaMessageResult | undefined {
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
			const parseResult = OllamaMessageResultSchema.safeParse(sessionData);
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
	public saveSession(sessionPath: string | undefined, result: OllamaMessageResult): void {
		if (!sessionPath) {
			return;
		}

		const resolvedPath = path.resolve(sessionPath);
		fs.writeFileSync(resolvedPath, JSON.stringify(result, null, '\t'), 'utf-8');
		this.output.text(`Session saved to ${resolvedPath}`);
	}
}
