import Anthropic from '@anthropic-ai/sdk';
import type { AITool, ToolParams } from './tools/Tool.js';

/**
 * Handles a single content block from Claude's response
 */
async function handleClaudeResponse(
	content: Anthropic.ContentBlock,
	tools: AITool<ToolParams>[]
): Promise<{
	text: string | null;
	toolResult: { content: string; tool_use_id: string; is_error?: boolean } | null;
}> {
	switch (content.type) {
		case 'text':
			// console.log('text block:' + content.text);
			return { text: content.text, toolResult: null };
		case 'tool_use': {
			// find the tool
			// console.log('tool request: ' + content.name + ' with ' + JSON.stringify(content.input));
			const tool = tools.find((t) => t.getDefinition().name === content.name);
			if (!tool) {
				throw new Error(`Tool ${content.name} not found`);
			}

			try {
				// execute the tool
				const result = await tool.invoke(content.input as ToolParams);
				// console.log('tool response: ' + result);
				return {
					text: tool.describeInvocation(content.input as ToolParams),
					toolResult: {
						content: result,
						tool_use_id: content.id,
					},
				};
			} catch (error) {
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
 * Creates a message with the given messages array
 */
async function createMessageFromHistory(
	anthropic: Anthropic,
	messages: Anthropic.MessageParam[],
	tools: AITool<ToolParams>[]
): Promise<string> {
	const message = await anthropic.messages.create({
		model: 'claude-3-5-sonnet-latest',
		max_tokens: 1024,
		messages,
		tools: tools.map((tool) => tool.getDefinition()),
	});

	let responseText = '';
	let needsContinuation = false;
	const newMessages = [...messages];

	// Process each content block
	for (const content of message.content) {
		const { text, toolResult } = await handleClaudeResponse(content, tools);

		if (text !== null) {
			responseText += text + '\n';
		}

		if (toolResult !== null) {
			needsContinuation = true;
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
		const continuationResponse = await createMessageFromHistory(anthropic, newMessages, tools);
		// console.log('continuation:' + continuationResponse);
		responseText += continuationResponse + '\n';
	}

	return responseText;
}

/**
 * Creates a message with Claude
 */
export async function createMessage(
	anthropic: Anthropic,
	prompt: string,
	tools: AITool<ToolParams>[]
): Promise<string> {
	return createMessageFromHistory(anthropic, [{ role: 'user', content: prompt }], tools);
}
