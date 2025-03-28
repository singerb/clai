export interface CreateMessageOptions<T> {
	prompt: string;
	context?: string[];
	session?: T;
}

export interface Model<T> {
	/**
	 * Creates a message with the model, combining any previous session data if provided
	 */
	createMessage(options: CreateMessageOptions<T>): Promise<T>;

	/**
	 * Load a session from the provided session path
	 * @param sessionPath Path to the session file
	 * @returns The loaded session or undefined if loading failed
	 */
	loadSession(sessionPath: string | undefined): T | undefined;

	/**
	 * Save a session to the provided session path
	 * @param sessionPath Path to save the session to
	 * @param result The session result to save
	 */
	saveSession(sessionPath: string | undefined, result: T): void;
}
