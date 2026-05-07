export interface RetryAttempt {
    attempt: number;
    error: Error;
    delayBeforeNext?: number;
    timestamp: Date;
}

export class RetryError extends Error {
    constructor(message: string, public attempts: number, public failures: RetryAttempt[],public cause?: Error) {
        super(message);
        this.name = "RetryError";
    }
}