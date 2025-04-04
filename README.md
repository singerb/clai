# clai

I was finally impressed by modern LLMs after using Cursor with Claude Sonnet 3.5; however, I rather like neovim as my text editor, and as I tested out various "inspired by Cursor" neovim plugins, I realized that even apart from my various disappointments with them, I didn't really want this capability in my editor but in my project as a whole. I also realized that a command-line, UNIX-y approach to the issue would provide a lot of benefits:

- Prompts can be written in the command (short, easy), in a text editor of your choice and piped in (longer, more involved), or constructed by a pipeline (harder, more automated, e.g. combining a static prompt with a list of issues extracted via `jq` from a JSON report).
- History is provided by shell history, or the prompt files themselves.
- Output can be piped to other programs, or `tee`d to a file for review.
- Saving sessions in JSON files allows easy searching by standard tools.
- Configuration can come via environment variables, a `.env` file, and later a JSON file that those point to.
- Undo or rollback can be handled by Git, or the VCS of your choice, with short-lived branches if needed; same with reviewing diffs from the models.

Additionally, I wanted this utility to be heavily tool driven and able to find its own context, up to the point of ideally incorporating LSP knowledge to do better than file level context and text searches. This last part has proven trickier than hoped, unfortunately. I also wanted to integrate lint/build/test steps, such that the tool can check and fix its own work; this has been much more successful.

This is by no means a unique take on this; apart from Claude Code (which was actually released after I'd written the first version of this!), there are other CLI LLM tools out there. I was motivated to write one for myself to make it work exactly how I wanted it to, and also to investigate the potential future where it's increasingly easy to spin up custom tools and apps aided by AI coding assistance.

I intially drafted a specification in conjunction with Claude to clarify my thinking on exactly what the commands, arguments, and behavior looked like; then I wrote the initial part with Cursor and by hand, aiming to get as quickly as possible to basic tool usage so that it could edit a copy of itself. Subsequent development was then done by hand, and by itself.

## Already included

- Ask (read-only tools) and edit (read-write tools) commands/modes.
- Anthropic, Ollama, and Gemini model support.
- Basic tools: directory listing, grep searching, file reading, file editing, project building.
- MCP support, though none have impressed me yet so all are disabled.

## Potential roadmap ideas:

- Move to bun, rather than node.js and `tsx`. This would allow distributing a single executable, but it's not a high priority for a tool I use on my own machine.
- LSP integration.
- Provide project context in the system prompt for models with large context windows.
- Auto session saving to a single file, to enable the "I didn't realize I wanted to continue this chat but now I need to" workflow.
- For larger changes with less manual prompting, investigate a `plan` and `execute` mode, powered by something like Gemini with a context window that can hold enough of the project (planning) and Claude (executing).
- Add a glob search tool (the LLMs keep trying to use grep content search to look for files by name or pattern).
