// Load environment variables; make sure this happens absolutely first so our .env files works.
import dotenv from 'dotenv';
dotenv.config();

const basePrompt =
	"You are an AI code assistant. Be helpful but concise. Use tools to gather information about the user's codebase as needed. Make sure any tool input matches the expected schema.";

export const CONFIG = {
	systemPrompts: {
		ask:
			basePrompt +
			' If you are asked a general coding question, you can just answer without context from the codebase.',
		edit:
			basePrompt +
			" When supplying edits, you should use the edit_file tool to edit any needed files. Then use the build tool to trigger linting and building, and use the edit_file tool again to fix any lint or build issues that arise. Give up if you can't fix them after a few tries.",
	},
	model: {
		anthropic: 'claude-3-7-sonnet-latest',
		ollama: 'qwen2.5-coder:14b',
		gemini: 'gemini-2.0-flash',
		// gemini: 'gemini-1.5-pro',
	},
	api: {
		anthropicKey: process.env.ANTHROPIC_API_KEY,
		geminiKey: process.env.GEMINI_API_KEY,
	},
	buildCommands: {
		format: process.env.FORMAT_COMMAND,
		lint: process.env.LINT_COMMAND,
		type: process.env.TYPE_COMMAND,
	},
};
