import {  BaseDelayStrategy } from "./BaseDelayStrategy";

export class ExponentialDelayStrategy extends BaseDelayStrategy {

    private multiplier: number;
    private maxDelay?: number;

    constructor(baseDelay: number, multiplier: number = 2) {
        super(baseDelay);
        this.multiplier = multiplier;
    }

    getDelay(attempt: number): number {
        let delay = this.baseDelay * Math.pow(this.multiplier, attempt - 1);
        return delay;
    }
}