const basePrompt =
	"You are an AI code assistant. Be helpful but concise. Use tools to gather information about the user's codebase as needed.";

export const CONFIG = {
	systemPrompts: {
		ask:
			basePrompt +
			' If you are asked a general coding question, you can just answer without context from the codebase.',
		edit:
			basePrompt +
			' When supplying edits, you should use the edit_files tool, and then use it again to fix any lint or build issues that arise.',
	},
	model: 'claude-3-5-sonnet-latest',
};
