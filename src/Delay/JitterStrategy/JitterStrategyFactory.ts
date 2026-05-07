import { BaseJitterStrategy } from "./BaseJitterStrategy";
import { DecorrelatedJitterStrategy } from "./DecorrelatedJitterStrategy";
import { EqualJitterStrategy } from "./EqualJitterStrategy";
import { FullJitterStrategy } from "./FullJitterStrategy";

export class JitterStrategyFactory {
    static create(strategy: "full" | "equal" | "decorrelated", targetDelay: number, previousDelay: number) : BaseJitterStrategy {
        switch (strategy) {
            case "full":
                return new FullJitterStrategy(targetDelay);
            case "equal":
                return new EqualJitterStrategy(targetDelay);
            case "decorrelated":
                return new DecorrelatedJitterStrategy(previousDelay, targetDelay);
            default:
                throw new Error(`Unknown jitter strategy: ${strategy}`);
        }
    }
}