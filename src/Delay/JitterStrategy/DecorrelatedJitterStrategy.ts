import { BaseJitterStrategy } from "./BaseJitterStrategy";

export class DecorrelatedJitterStrategy extends BaseJitterStrategy {
    constructor(initialBaseDelay: number, previousDelay: number) {
        // Here, targetDelay acts as the 'base' (the absolute minimum floor)
        super(initialBaseDelay, previousDelay);
    }

    apply(): number {
        // 1. Establish the absolute floor (base)
        // Note: In Decorrelated, we typically ignore the 'targetDelay' 
        // argument if it represents the 2^n exponential value.
        const base = this.targetDelay ?? 0;

        // 2. Establish the previous sleep value
        // If it's the first retry, start at the base.
        const lastSleep =  this.previousDelay ?? base;

        // 3. AWS Formula: random(base, lastSleep * 3)
        const min = base;
        const max = lastSleep * 3;

        const nextDelay = Math.random() * (max - min) + min;

        // 4. Update state for the next call
        this.previousDelay = nextDelay;

        return nextDelay;
    }
}