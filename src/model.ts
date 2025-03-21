import Anthropic from '@anthropic-ai/sdk';
import type { AITool, ToolParams } from './tools/Tool.js';
import { Output } from './output.js';

type CacheControl = { type: 'ephemeral' };
type TextBlock = Anthropic.TextBlockParam & { cache_control?: CacheControl };

export interface MessageResult {
	state: {
		messages: Anthropic.MessageParam[];
		systemPrompts: TextBlock[];
	};
}

export interface CreateMessageOptions {
	prompt: string;
	context?: string[];
	session?: MessageResult;
}

export class Model {
	constructor(
		protected anthropic: Anthropic,
		protected model: string,
		protected tools: AITool<ToolParams>[],
		protected systemPrompt: string,
		protected output: Output
	) {}
	/**
	 * Handles a single content block from Claude's response
	 */
	protected async handleClaudeResponse(content: Anthropic.ContentBlock): Promise<{
		text: string | null;
		toolResult: {
			content: string;
			tool_use_id: string;
			is_error?: boolean;
			system?: string;
		} | null;
	}> {
		switch (content.type) {
			case 'text':
				this.output.text(content.text);
				return { text: content.text, toolResult: null };
			case 'tool_use': {
				// find the tool
				this.output.aiInfo(
					// 'tool request: ' + content.name + ' with ' + JSON.stringify(content.input)
					'tool request: ' + content.name
				);
				const tool = this.tools.find((t) => t.getDefinition().name === content.name);
				if (!tool) {
					throw new Error(`Tool ${content.name} not found`);
				}

				try {
					// execute the tool
					this.output.text(tool.describeInvocation(content.input as ToolParams));
					const result = await tool.invoke(content.input as ToolParams);
					// this.output.aiInfo('tool response: ' + result);
					return {
						text: tool.describeInvocation(content.input as ToolParams),
						toolResult: {
							content: result.content,
							tool_use_id: content.id,
							system: result.system,
						},
					};
				} catch (error) {
					this.output.error('tool error: ' + error);
					return {
						text: tool.describeInvocation(content.input as ToolParams),
						toolResult: {
							content: error instanceof Error ? error.message : String(error),
							tool_use_id: content.id,
							is_error: true,
						},
					};
				}
			}
		}
	}

	/**
	 * Applies caching strategy to messages array
	 * Simply adds cache_control to the last content block in the last user message
	 */
	protected applyCachingStrategy(messages: Anthropic.MessageParam[]): Anthropic.MessageParam[] {
		if (!messages || messages.length === 0) return messages;

		// Deep clone the messages to avoid modifying the original
		const processedMessages = JSON.parse(JSON.stringify(messages)) as Anthropic.MessageParam[];

		// Get the last message and ensure it's a user message
		const lastMessage = processedMessages[processedMessages.length - 1];
		if (lastMessage.role !== 'user') return processedMessages;

		// Ensure the content is an array
		if (typeof lastMessage.content === 'string') {
			lastMessage.content = [{ type: 'text', text: lastMessage.content }];
		}

		// Add cache_control to the last content block if content is now an array
		if (Array.isArray(lastMessage.content) && lastMessage.content.length > 0) {
			const lastBlock = lastMessage.content[lastMessage.content.length - 1] as TextBlock;
			lastBlock.cache_control = { type: 'ephemeral' };
			this.output.aiInfo('Added cache_control marker to last user message content block');
		}

		return processedMessages;
	}

	/**
	 * Creates a message with the given messages array and system prompts
	 */
	protected async createMessageFromHistory(
		messages: Anthropic.MessageParam[],
		systemPrompts: TextBlock[] = [{ type: 'text' as const, text: this.systemPrompt }]
	): Promise<MessageResult> {
		// Add cache_control to the last system prompt
		const processedSystemPrompts = systemPrompts.map((prompt, index) => {
			const cleanPrompt = { ...prompt };
			delete cleanPrompt.cache_control;
			if (index === systemPrompts.length - 1) {
				return { ...cleanPrompt, cache_control: { type: 'ephemeral' as const } };
			}
			return cleanPrompt;
		});

		// Apply the caching strategy to add cache_control to the last user message
		// Clones it so we can use the unmodified ones for the next round and not have to clean up old cache_control headers
		const processedMessages = this.applyCachingStrategy(messages);

		const message = await this.anthropic.beta.messages.create({
			model: this.model,
			max_tokens: 4096 * 2,
			messages: processedMessages,
			tools: this.tools.map((tool) => tool.getDefinition()),
			system: processedSystemPrompts,
			betas: ['token-efficient-tools-2025-02-19'],
		});

		let needsContinuation = false;
		const newMessages = [...messages];
		let newSystemPrompts = [...processedSystemPrompts];

		// log useful info
		this.output.aiInfo('stop reason: ' + message.stop_reason);
		this.output.aiInfo('usage: ' + JSON.stringify(message.usage));

		// Add the assistant's response to the messages
		newMessages.push({
			role: 'assistant',
			content: message.content,
		});

		// Process each content block
		for (const content of message.content) {
			const { toolResult } = await this.handleClaudeResponse(content);

			if (toolResult !== null) {
				needsContinuation = true;

				// If the tool provided new system prompt content, add it
				if (toolResult.system) {
					newSystemPrompts = [
						...newSystemPrompts,
						{ type: 'text' as const, text: toolResult.system },
					];
				}

				newMessages.push({
					role: 'user',
					content: [
						{
							tool_use_id: toolResult.tool_use_id,
							type: 'tool_result',
							content: toolResult.content,
							...(toolResult.is_error ? { is_error: true } : {}),
						},
					],
				});
			}
		}

		// If any tool was used, continue the conversation
		if (needsContinuation) {
			const continuationResponse = await this.createMessageFromHistory(
				newMessages,
				newSystemPrompts
			);

			// Return the final conversation state from the continuation
			return continuationResponse;
		}

		return {
			state: {
				messages: newMessages,
				systemPrompts: newSystemPrompts,
			},
		};
	}

	/**
	 * Creates a message with Claude, combining any previous session data if provided
	 */
	public async createMessage(options: CreateMessageOptions): Promise<MessageResult> {
		// Start with default system prompt
		let systemPrompts: TextBlock[] = [{ type: 'text' as const, text: this.systemPrompt }];

		// Merge with previous session's system prompts if available
		if (options.session) {
			systemPrompts = options.session.state.systemPrompts;
		}

		// Add context if provided
		if (options.context && options.context.length > 0) {
			systemPrompts = [
				...systemPrompts,
				...options.context.map((text) => ({ type: 'text' as const, text })),
			];
		}

		// Start with either previous messages or empty array
		const messages = options.session ? [...options.session.state.messages] : [];

		// Add the new prompt as a user message
		messages.push({ role: 'user', content: options.prompt });

		return this.createMessageFromHistory(messages, systemPrompts);
	}
}
