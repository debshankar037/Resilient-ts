import {  BaseJitterStrategy } from "./BaseJitterStrategy";

export class FullJitterStrategy extends BaseJitterStrategy {
    
    constructor(targetDelay: number) {
        super(targetDelay);
    }

    apply(): number {
        return Math.random() * ( this.targetDelay ?? 0);
    }
}