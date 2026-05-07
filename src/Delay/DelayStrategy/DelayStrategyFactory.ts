import { ExponentialDelayStrategy } from "./ExponentialDelayStrategy";
import { LinearDelayStrategy } from "./LinearDelayStrategy";
import { FixedDelayStrategy } from "./FixedDelayStrategy";
import { BaseDelayStrategy } from "./BaseDelayStrategy";

export class DelayStrategyFactory {
    static create(strategy: string = "fixed", baseDelay: number = 1000, multiplier: number = 2): BaseDelayStrategy {
        switch (strategy) {
            case "fixed":
                return new FixedDelayStrategy(baseDelay);
            case "exponential":
                return new ExponentialDelayStrategy(baseDelay, multiplier);
            case "linear":
                return new LinearDelayStrategy(baseDelay);
            default:
                throw new Error(`Unknown delay strategy: ${strategy}`);
        }
    }
}