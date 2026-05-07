import { BaseJitterStrategy } from "./BaseJitterStrategy";

export class EqualJitterStrategy extends BaseJitterStrategy {
  constructor(targetDelay: number) {
    super(targetDelay);
  }

  apply(): number {
    const half = ( this.targetDelay ?? 0) / 2;
    return half + Math.random() * half;
  }
}
