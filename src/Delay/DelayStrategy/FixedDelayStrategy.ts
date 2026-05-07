import { BaseDelayStrategy } from "./BaseDelayStrategy";

export class FixedDelayStrategy extends BaseDelayStrategy {
    constructor(baseDelay: number) {
        super(baseDelay);
    }

    getDelay(attempt: number): number {
        return this.baseDelay;
    }
}