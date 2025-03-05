import { Command } from 'commander';
import fs from 'fs';
import path from 'path';
import { z } from 'zod';
import { MessageResult } from '../model.js';
import { Output } from '../output.js';

export interface CommonArgs {
	context?: string[];
	session?: string;
}

export function addCommonArgs(command: Command): Command {
	return command
		.option(
			'-c, --context <path>',
			'path to a context file to include in system prompt',
			(value: string, previous: string[]) => [...(previous || []), value],
			[]
		)
		.option('-s, --session <path>', 'path to a session file');
}

export function getContextContent(args: CommonArgs): string[] {
	if (!args.context?.length) {
		return [];
	}

	return args.context.map((contextPath) => {
		const filePath = path.resolve(contextPath);
		const content = fs.readFileSync(filePath, 'utf-8');
		return `${filePath}:\n\n${content}`;
	});
}

// Zod schema for TextBlock
const TextBlockSchema = z.object({
	type: z.literal('text'),
	text: z.string(),
	cache_control: z
		.object({
			type: z.literal('ephemeral'),
		})
		.optional(),
});

// Zod schema for ContentBlock (simplified - covers text/tool_use/tool_result)
const ContentBlockSchema = z.union([
	z.object({
		type: z.literal('text'),
		text: z.string(),
	}),
	z.object({
		type: z.literal('tool_use'),
		id: z.string(),
		name: z.string(),
		input: z.record(z.any()),
	}),
	z.object({
		type: z.literal('tool_result'),
		tool_use_id: z.string(),
		content: z.string(),
		is_error: z.boolean().optional(),
	}),
]);

// Zod schema for MessageParam
const MessageParamSchema = z.object({
	role: z.union([z.literal('user'), z.literal('assistant')]),
	content: z.union([z.string(), z.array(ContentBlockSchema)]),
});

// Zod schema for MessageResult
const MessageResultSchema = z.object({
	state: z.object({
		messages: z.array(MessageParamSchema),
		systemPrompts: z.array(TextBlockSchema),
	}),
});

/**
 * Load a session from the provided session path
 * @param sessionPath Path to the session file
 * @param output Output instance for logging
 * @returns The loaded session or undefined if loading failed
 */
export function loadSession(
	sessionPath: string | undefined,
	output: Output
): MessageResult | undefined {
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
		const parseResult = MessageResultSchema.safeParse(sessionData);
		if (parseResult.success) {
			output.text(`Session loaded from ${resolvedPath}`);
			return parseResult.data;
		} else {
			output.text(`Invalid session format in ${resolvedPath}, starting fresh`);
			return undefined;
		}
	} catch {
		output.text(`Error parsing session file ${resolvedPath}, starting fresh`);
		return undefined;
	}
}

/**
 * Strip cache_control markers from a message result
 * @param result The session result to clean
 * @returns A cleaned copy of the session result with no cache_control markers
 */
function stripCacheControlMarkers(result: MessageResult): MessageResult {
	// Deep clone the result to avoid modifying the original
	const cleanedResult = JSON.parse(JSON.stringify(result)) as MessageResult;

	// Clean system prompts
	cleanedResult.state.systemPrompts = cleanedResult.state.systemPrompts.map((prompt) => {
		const cleanPrompt = { ...prompt };
		delete cleanPrompt.cache_control;
		return cleanPrompt;
	});

	// Clean messages
	cleanedResult.state.messages = cleanedResult.state.messages.map((message) => {
		// Handle both string and array content formats
		if (typeof message.content === 'string') {
			return message;
		}

		// For array content, clean each text block
		if (Array.isArray(message.content)) {
			const cleanedContent = message.content.map((block) => {
				if ('type' in block && block.type === 'text') {
					// Create a clean copy without cache_control
					const cleanBlock = { ...block };
					if ('cache_control' in cleanBlock) {
						delete cleanBlock.cache_control;
					}
					return cleanBlock;
				}
				return block;
			});

			return {
				...message,
				content: cleanedContent,
			};
		}

		return message;
	});

	return cleanedResult;
}

/**
 * Save a session to the provided session path
 * @param sessionPath Path to save the session to
 * @param result The session result to save
 * @param output Output instance for logging
 */
export function saveSession(
	sessionPath: string | undefined,
	result: MessageResult,
	output: Output
): void {
	if (!sessionPath) {
		return;
	}

	// Strip cache_control markers before saving
	const cleanedResult = stripCacheControlMarkers(result);

	const resolvedPath = path.resolve(sessionPath);
	fs.writeFileSync(resolvedPath, JSON.stringify(cleanedResult, null, '\t'), 'utf-8');
	output.text(`Session saved to ${resolvedPath}`);
}
