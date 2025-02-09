import Anthropic from '@anthropic-ai/sdk';

export type ToolParams = Record<string, unknown>;

/**
 * Represents the base interface for all tools in the system
 */
export interface AITool<T extends ToolParams> {
	/**
	 * Returns the Anthropic tool definition
	 */
	getDefinition(): Anthropic.Tool;

	/**
	 * Invokes the tool with the given parameters and returns the result
	 * @param params The parameters to pass to the tool
	 * @returns The result of the tool invocation
	 */
	invoke(params: T): Promise<string>;

	/**
	 * Describes what the tool will do when invoked with these params;
	 * used to add information into the output to the user about what
	 * the AI is doing.
	 * @param params The parameters to pass to the tool
	 * @returns A human readable description of the tool invocation
	 */
	describeInvocation(params: T): string;

	/**
	 * Validates the parameters passed to the tool
	 * @param params The parameters to validate
	 * @throws Error if the parameters are invalid
	 */
	checkParams(params: T): void;
}
