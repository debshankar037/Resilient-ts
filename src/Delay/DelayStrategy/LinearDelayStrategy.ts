import {  BaseDelayStrategy } from "./BaseDelayStrategy";

export class LinearDelayStrategy extends BaseDelayStrategy {

    private maxDelay?: number;

    constructor(baseDelay: number) {
        super(baseDelay);
    }

    getDelay(attempt: number): number {
        let delay = this.baseDelay * attempt;
        return delay;
    }
}