import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { AITool, ToolParams, ToolResult } from '../tools/Tool.js';
import { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { Tool } from '@modelcontextprotocol/sdk/types.js';
import Anthropic from '@anthropic-ai/sdk';
import { setTimeout } from 'timers/promises';

export class MCPClient {
	protected transport: Transport;
	protected client?: Client;
	protected allowedTools: string[];

	public constructor({
		program,
		args,
		allowedTools = [],
	}: {
		program: string;
		args: string[];
		allowedTools?: string[];
	}) {
		const env = {
			DEBUG: "1",
			PATH: process.env.PATH!,
			HOME: process.env.HOME!,
			SHELL: process.env.SHELL!,
			LOGNAME: process.env.LOGNAME!,
			TERM: process.env.TERM!,
			USER: process.env.USER!,
		};
		this.transport = new StdioClientTransport({
			command: program,
			args,
			env,
		});
		this.allowedTools = allowedTools;
	}

	public async initialize(): Promise<void> {
		this.client = new Client(
			{
				name: 'clai-client',
				version: '1.0.0',
			},
			{
				capabilities: {
					tools: {},
				},
			}
		);

		await this.client.connect(this.transport);

		// await setTimeout(60 * 1000);
	}

	public async getTools(): Promise<MCPToolWrapper<ToolParams>[]> {
		if (this.client === undefined) {
			throw new Error('Must call initialize() before use');
		}
		const tools = await this.client.listTools();
		return tools.tools
			.filter(
				(tool) => this.allowedTools.length === 0 || this.allowedTools.includes(tool.name)
			)
			.map((tool) => {
				if (this.client === undefined) {
					throw new Error('Must call initialize() before use');
				}
				return new MCPToolWrapper(this.client, tool);
			});
	}

	public async close(): Promise<void> {
		await this.client?.close();
	}
}

export class MCPToolWrapper<T extends ToolParams> implements AITool<T> {
	public constructor(
		protected client: Client,
		protected tool: Tool
	) {}

	/**
	 * Returns the Anthropic tool definition
	 */
	public getDefinition(): Anthropic.Tool {
		return {
			name: this.tool.name,
			description: this.tool.description,
			input_schema: this.tool.inputSchema,
		};
	}

	/**
	 * Invokes the tool with the given parameters and returns the result
	 * @param params The parameters to pass to the tool
	 * @returns The result of the tool invocation
	 */
	public async invoke(params: T): Promise<ToolResult> {
		const result = await this.client.callTool({
			name: this.tool.name,
			arguments: params,
		});

		if (result.isError) {
			throw new Error('Failed to call MCP tool ' + this.tool.name);
		}

		return {
			content: result.content as string,
		};
	}

	/**
	 * Describes what the tool will do when invoked with these params;
	 * used to add information into the output to the user about what
	 * the AI is doing.
	 * @param params The parameters to pass to the tool
	 * @returns A human readable description of the tool invocation
	 */
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	public describeInvocation(params: T): string {
		return 'Invoking MCP tool ' + this.tool.name;
	}
}
