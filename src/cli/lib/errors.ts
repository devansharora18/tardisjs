export class CLIError extends Error {
	constructor(message: string) {
		super(message)
		this.name = 'CLIError'
	}
}
