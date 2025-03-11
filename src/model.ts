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
	 * Estimates the number of tokens in a text string
	 * using a rough approximation of 4 characters per token
	 * after stripping whitespace for better estimation
	 */
	protected estimateTokens(text: string): number {
		// Strip whitespace for better token estimation
		const strippedText = text.replace(/\s+/g, '');
		return Math.ceil(strippedText.length / 4);
	}

	/**
	 * Applies caching strategy to messages array
	 * based on the number of existing cache_control markers and token estimation
	 */
	protected applyCachingStrategy(messages: Anthropic.MessageParam[]): Anthropic.MessageParam[] {
		if (!messages || messages.length === 0) return messages;

		// Deep clone the messages to avoid modifying the original
		const processedMessages = JSON.parse(JSON.stringify(messages)) as Anthropic.MessageParam[];

		// First pass: count existing cache_control markers
		let cacheControlCount = 0;
		let tokensSinceLastMarker = 0;
		let lastMarkerIndex: [number, number] | null = null; // [messageIndex, contentIndex]

		// Traverse all messages and their content blocks to count cache_control markers and tokens
		for (let msgIndex = 0; msgIndex < processedMessages.length; msgIndex++) {
			const message = processedMessages[msgIndex];
			let content = message.content;

			// Convert string content to array of blocks if needed
			if (typeof content === 'string') {
				content = [{ type: 'text', text: content }];
				// Update the message to use the array format
				message.content = content;
			}

			if (Array.isArray(content)) {
				for (let blockIndex = 0; blockIndex < content.length; blockIndex++) {
					const block = content[blockIndex];
					if ('type' in block) {
						if (block.type === 'text' && 'text' in block) {
							tokensSinceLastMarker += this.estimateTokens(block.text);
						} else if (block.type === 'tool_use' && 'input' in block) {
							// For tool_use blocks, stringify the input for token estimation
							const inputString = JSON.stringify(block.input);
							tokensSinceLastMarker += this.estimateTokens(inputString);
						}
					}

					if ('cache_control' in block) {
						cacheControlCount++;
						tokensSinceLastMarker = 0; // Reset token count
						lastMarkerIndex = [msgIndex, blockIndex];
					}
				}
			}
		}

		// Get the last message
		const lastMessage = processedMessages[processedMessages.length - 1];

		// Ensure the content is an array
		if (typeof lastMessage.content === 'string') {
			lastMessage.content = [{ type: 'text', text: lastMessage.content }];
		}

		// Get the last content block of the last message (assuming content is now an array)
		if (Array.isArray(lastMessage.content) && lastMessage.content.length > 0) {
			const lastBlock = lastMessage.content[lastMessage.content.length - 1] as TextBlock;

			// Apply caching strategy
			if (cacheControlCount === 0 && tokensSinceLastMarker > 1024) {
				this.output.aiInfo(
					`Caching: Case 1 - Adding first cache_control marker. tokensSinceLastMarker: ${tokensSinceLastMarker}`
				);
				// Add one cache_control if none exist and tokens > 1024
				lastBlock.cache_control = { type: 'ephemeral' };
			} else if (
				cacheControlCount > 0 &&
				cacheControlCount < 3 &&
				tokensSinceLastMarker > 2048
			) {
				this.output.aiInfo(
					`Caching: Case 2 - Adding additional cache_control marker. cacheControlCount: ${cacheControlCount}, tokensSinceLastMarker: ${tokensSinceLastMarker}`
				);
				// Add one more cache_control if fewer than 3 exist and tokens since last marker > 2048
				lastBlock.cache_control = { type: 'ephemeral' };
			} else if (cacheControlCount >= 3 && lastMarkerIndex) {
				this.output.aiInfo(
					`Caching: Case 3 - Moving cache_control marker. cacheControlCount: ${cacheControlCount}, lastMarkerIndex: [${lastMarkerIndex[0]}, ${lastMarkerIndex[1]}]`
				);
				// Remove only the last cache_control marker
				const [msgIndex, blockIndex] = lastMarkerIndex;
				const message = processedMessages[msgIndex];

				if (Array.isArray(message.content)) {
					const block = message.content[blockIndex] as TextBlock;
					delete block.cache_control;
				}

				// Add to the last block
				lastBlock.cache_control = { type: 'ephemeral' };
			} else {
				this.output.aiInfo(
					`Caching: No cache_control changes. cacheControlCount: ${cacheControlCount}, tokensSinceLastMarker: ${tokensSinceLastMarker}`
				);
			}
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
		// Clean up and set cache_control on system prompts
		const processedSystemPrompts = systemPrompts.map((prompt, index) => {
			const cleanPrompt = { ...prompt };
			delete cleanPrompt.cache_control;
			if (index === systemPrompts.length - 1) {
				return { ...cleanPrompt, cache_control: { type: 'ephemeral' as const } };
			}
			return cleanPrompt;
		});

		// Apply the caching strategy to the whole messages array
		const processedMessages = this.applyCachingStrategy(messages);

		const message = await this.anthropic.messages.create({
			model: this.model,
			max_tokens: 4096*2,
			messages: processedMessages,
			tools: this.tools.map((tool) => tool.getDefinition()),
			system: processedSystemPrompts,
		});

		let needsContinuation = false;
		const newMessages = [...processedMessages];
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
