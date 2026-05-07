export abstract class BaseDelayStrategy {
    protected baseDelay: number;

    constructor(baseDelay: number) {
        this.baseDelay = baseDelay;
    }

    abstract getDelay(attempt: number): number;
}