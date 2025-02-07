#!./node_modules/.bin/tsx

import { Command } from 'commander';
import Anthropic from '@anthropic-ai/sdk';
import dotenv from 'dotenv';
import { setupAskCommand } from './commands/ask.js';
import { setupEditCommand } from './commands/edit.js';

// Load environment variables
dotenv.config();

const program = new Command();
const anthropic = new Anthropic({
	apiKey: process.env.ANTHROPIC_API_KEY,
});

program.name('clai').description('Command Line AI Assistant powered by Claude').version('1.0.0');

program.addCommand(setupAskCommand(anthropic));
program.addCommand(setupEditCommand(anthropic));

program.parse();
