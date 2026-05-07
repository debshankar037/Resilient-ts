export abstract class BaseJitterStrategy {
  /**
   * @param targetDelay The raw delay calculated by the Backoff strategy.
   * @param previousDelay The actual delay used in the previous attempt (required for Decorrelated).
   */
  protected targetDelay?: number;
  protected previousDelay?: number;
  
  constructor(targetDelay: number, previousDelay?: number) {
    this.targetDelay = targetDelay;
    this.previousDelay = previousDelay;
  }

  abstract apply(): number;
}
