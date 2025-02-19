import Anthropic from '@anthropic-ai/sdk';
import type { AITool, ToolParams } from './tools/Tool.js';
import { Output } from './output.js';

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
	 * Creates a message with the given messages array and system prompts
	 */
	protected async createMessageFromHistory(
		messages: Anthropic.MessageParam[],
		systemPrompts: Anthropic.TextBlockParam[] = [{ type: 'text', text: this.systemPrompt }]
	): Promise<string> {
		// Add cache_control: 'ephemeral' to the last system prompt
		const finalSystemPrompts = [...systemPrompts];
		if (finalSystemPrompts.length > 0) {
			const lastPrompt = { ...finalSystemPrompts[finalSystemPrompts.length - 1] };
			lastPrompt.cache_control = { type: 'ephemeral' };
			finalSystemPrompts[finalSystemPrompts.length - 1] = lastPrompt;
		}

		const message = await this.anthropic.messages.create({
			model: this.model,
			max_tokens: 4096,
			messages,
			tools: this.tools.map((tool) => tool.getDefinition()),
			system: finalSystemPrompts,
		});

		let responseText = '';
		let needsContinuation = false;
		const newMessages = [...messages];
		let newSystemPrompts = [...systemPrompts];

		// log useful info
		this.output.aiInfo('stop reason: ' + message.stop_reason);
		this.output.aiInfo('usage: ' + JSON.stringify(message.usage));

		// Process each content block
		for (const content of message.content) {
			const { text, toolResult } = await this.handleClaudeResponse(content);

			if (text !== null) {
				responseText += text + '\n';
			}

			if (toolResult !== null) {
				needsContinuation = true;

				// If the tool provided new system prompt content, add it
				if (toolResult.system) {
					newSystemPrompts = [
						...newSystemPrompts,
						{ type: 'text', text: toolResult.system },
					];
				}

				newMessages.push(
					{ role: 'assistant', content: [content] },
					{
						role: 'user',
						content: [
							{
								tool_use_id: toolResult.tool_use_id,
								type: 'tool_result',
								content: toolResult.content,
								...(toolResult.is_error ? { is_error: true } : {}),
							},
						],
					}
				);
			}
		}

		// If any tool was used, continue the conversation
		if (needsContinuation) {
			const continuationResponse = await this.createMessageFromHistory(
				newMessages,
				newSystemPrompts
			);
			responseText += continuationResponse + '\n';
		}

		return responseText;
	}

	/**
	 * Creates a message with Claude
	 */
	public async createMessage(prompt: string): Promise<string> {
		return this.createMessageFromHistory([{ role: 'user', content: prompt }]);
	}
}
