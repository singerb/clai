import Anthropic from '@anthropic-ai/sdk';

export async function createMessage(anthropic: Anthropic, prompt: string): Promise<string> {
	const message = await anthropic.messages.create({
		model: 'claude-3-sonnet-20240229',
		max_tokens: 1024,
		messages: [{ role: 'user', content: prompt }],
	});

	return message.content[0].text;
}
