#!/bin/sh
':' //# http://sambal.org/?p=1014 ; exec `dirname $0`/node_modules/.bin/tsx "$0" "$@"

import { Command } from 'commander';
import Anthropic from '@anthropic-ai/sdk';
import { setupAskCommand } from './commands/ask.js';
import { setupEditCommand } from './commands/edit.js';
import { CONFIG } from './config.js';

const program = new Command();
const anthropic = new Anthropic({
	apiKey: CONFIG.api.key,
});

program.name('clai').description('Command Line AI Assistant powered by Claude').version('1.0.0');

program.addCommand(await setupAskCommand(anthropic));
program.addCommand(await setupEditCommand(anthropic));

program.parse();
