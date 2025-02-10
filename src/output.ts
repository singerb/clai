import chalk from 'chalk';

export class Output {
	/**
	 * Output standard text to console
	 */
	public text(message: string): void {
		console.log(message);
	}

	/**
	 * Output error message in red
	 */
	public error(message: string): void {
		console.error(chalk.red(message));
	}

	/**
	 * Output AI informational message in dimmed text
	 */
	public aiInfo(message: string): void {
		console.log(chalk.dim(message));
	}
}
