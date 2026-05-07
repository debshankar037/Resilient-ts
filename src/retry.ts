import { RetryConfig } from "./RetryConfigs/retryConfig";
import {
  NormalizedRetryConfig,
  normalizeConfig,
} from "./RetryConfigs/normalizeConfig";
import { AttemptContext, RetryLog, Logger } from "./types";
import { RetryError } from "./Error/RetryError";
import { DelayResolver } from "./Delay/DelayResolver";

export class RetryEngine {
  private config: NormalizedRetryConfig;

  constructor(config: RetryConfig = {}) {
    this.config = normalizeConfig(config);
  }

  async execute<T>(task: (signal?: AbortSignal) => Promise<T>): Promise<T> {
    const context = this.createContext();
    const failures: RetryError["failures"] = [];
    const delayResolver = new DelayResolver(this.config.delay);

    const globalController = this.createGlobalController();
    const globalTimer = this.startGlobalTimeout(globalController);

    let previousDelay = 0;

    try {
      for (let attempt = 1; attempt <= context.maxAttempts; attempt++) {
        context.attempt = attempt;
        context.elapsedMs = this.getElapsed(context);

        this.throwIfCancelled(globalController, attempt, failures);

        try {
          const result = await this.executeSingleAttempt(
            task,
            globalController.signal,
          );

          const shouldRetryResult =
            (await this.config.retryIfResult?.(result, context)) ?? false;

          if (!shouldRetryResult) {
            this.log("info", `Attempt ${attempt} succeeded`, context, "success", undefined, undefined, result);
            await this.config.onSuccess?.({
              attempt,
              result,
              elapsedMs: this.getElapsed(context),
            });
            return result;
          }

          const err = new Error("Retry requested by retryIfResult");

          previousDelay = await this.handleRetry(
            err,
            attempt,
            previousDelay,
            failures,
            context,
            delayResolver,
            globalController.signal,
          );
        } catch (error) {
          const err = this.normalizeError(error);

          const shouldRetry =
            (await this.config.retryIf?.(err, context)) ?? true;

          this.recordFailure(failures, attempt, err);

          if (!shouldRetry) {
            this.log("error", `Attempt ${attempt} failed with non-retryable error`, context, "failed", err);
            await this.config.onFailure?.({
              attempts: attempt,
              failures,
              error: err,
              elapsedMs: this.getElapsed(context),
            });
            throw new RetryError(
              `Retry stopped due to non-retryable error on attempt ${attempt}`,
              attempt,
              failures,
              err,
            );
          }

          previousDelay = await this.handleRetry(
            err,
            attempt,
            previousDelay,
            failures,
            context,
            delayResolver,
            globalController.signal,
          );
        }
      }

      const finalError = this.createFinalError(context, failures);
      this.log("error", `All attempts failed`, context, "failed", finalError);

      await this.config.onFailure?.({
        attempts: context.attempt,
        failures,
        error: finalError,
        elapsedMs: this.getElapsed(context),
      });

      throw finalError;
    } finally {
      if (globalTimer) clearTimeout(globalTimer);
    }
  }

  // -----------------------------
  // Main Helpers
  // -----------------------------

  private createContext(): AttemptContext {
    return {
      attempt: 0,
      maxAttempts: this.config.maxAttempts,
      elapsedMs: 0,
      startTime: new Date(),
    };
  }

  private createGlobalController(): AbortController {
    const controller = new AbortController();
    const userSignal = this.config.signal;

    if (!userSignal) return controller;

    if (userSignal.aborted) {
      controller.abort(userSignal.reason);
    } else {
      userSignal.addEventListener(
        "abort",
        () => controller.abort(userSignal.reason),
        { once: true },
      );
    }

    return controller;
  }

  private startGlobalTimeout(
    controller: AbortController,
  ): ReturnType<typeof setTimeout> | undefined {
    const timeout = this.config.totalTimeoutMs;

    if (!timeout || timeout <= 0) return undefined;

    return setTimeout(() => {
      controller.abort(new Error(`Global timeout exceeded after ${timeout}ms`));
    }, timeout);
  }

  private async executeSingleAttempt<T>(
    task: (signal?: AbortSignal) => Promise<T>,
    parentSignal: AbortSignal,
  ): Promise<T> {
    return this.runAttempt(task, this.config.timeoutMs, parentSignal);
  }

  private async waitBeforeNextRetry(
    delay: number,
    context: AttemptContext,
    failures: RetryError["failures"],
    signal: AbortSignal,
    attempt: number,
  ): Promise<void> {
    this.validateRemainingGlobalTime(delay, context, failures, attempt);

    await this.sleep(delay, signal);
  }

  // -----------------------------
  // Validation Helpers
  // -----------------------------

  private throwIfCancelled(
    controller: AbortController,
    attempt: number,
    failures: RetryError["failures"],
  ): void {
    if (controller.signal.aborted) {
      throw new RetryError("Execution cancelled", attempt - 1, failures);
    }
  }

  private validateRemainingGlobalTime(
    nextDelay: number,
    context: AttemptContext,
    failures: RetryError["failures"],
    attempt: number,
  ): void {
    const globalTimeout = this.config.totalTimeoutMs;

    if (!globalTimeout) return;

    const elapsed = this.getElapsed(context);
    const remaining = globalTimeout - elapsed;

    if (remaining <= nextDelay) {
      throw new RetryError(
        "Global timeout exceeded before next retry",
        attempt,
        failures,
      );
    }
  }

  // -----------------------------
  // Attempt Execution
  // -----------------------------

  private async runAttempt<T>(
    task: (signal?: AbortSignal) => Promise<T>,
    timeoutMs?: number,
    parentSignal?: AbortSignal,
  ): Promise<T> {
    const controller = this.createAttemptController(parentSignal);
    const timer = this.startAttemptTimeout(controller, timeoutMs);

    try {
      return await task(controller.signal);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private createAttemptController(parentSignal?: AbortSignal): AbortController {
    const controller = new AbortController();

    if (!parentSignal) return controller;

    if (parentSignal.aborted) {
      controller.abort(parentSignal.reason);
    } else {
      parentSignal.addEventListener(
        "abort",
        () => controller.abort(parentSignal.reason),
        { once: true },
      );
    }

    return controller;
  }

  private startAttemptTimeout(
    controller: AbortController,
    timeoutMs?: number,
  ): ReturnType<typeof setTimeout> | undefined {
    if (!timeoutMs || timeoutMs <= 0) return undefined;

    return setTimeout(() => {
      controller.abort(new Error(`Attempt timeout after ${timeoutMs}ms`));
    }, timeoutMs);
  }

  // -----------------------------
  // Utility Helpers
  // -----------------------------

  private async handleRetry(
    err: Error,
    attempt: number,
    previousDelay: number,
    failures: RetryError["failures"],
    context: AttemptContext,
    delayResolver: DelayResolver,
    signal: AbortSignal,
  ): Promise<number> {
    this.recordFailure(failures, attempt, err);

    if (attempt >= context.maxAttempts) {
      return previousDelay;
    }

    const nextDelay = delayResolver.resolveDelay(attempt, err, previousDelay);

    await this.config.onRetry?.({
      attempt,
      error: err,
      nextDelayMs: nextDelay,
      elapsedMs: this.getElapsed(context),
    });

    this.log("warn", `Attempt ${attempt} failed, retrying in ${nextDelay}ms`, context, "retry", err, nextDelay);

    await this.waitBeforeNextRetry(
      nextDelay,
      context,
      failures,
      signal,
      attempt,
    );

    return nextDelay;
  }

  private recordFailure(
    failures: RetryError["failures"],
    attempt: number,
    error: Error,
  ): void {
    failures.push({
      attempt,
      error,
      timestamp: new Date(),
    });
  }

  private normalizeError(error: unknown): Error {
    return error instanceof Error ? error : new Error(String(error));
  }

  private getElapsed(context: AttemptContext): number {
    return Date.now() - context.startTime.getTime();
  }

  private createFinalError(
    context: AttemptContext,
    failures: RetryError["failures"],
  ): RetryError {
    const totalElapsed = this.getElapsed(context);
    context.elapsedMs = totalElapsed;

    const lastFailure =
      failures.length > 0 ? failures[failures.length - 1].error : undefined;

    return new RetryError(
      `All ${context.maxAttempts} attempts failed after ${totalElapsed}ms`,
      context.maxAttempts,
      failures,
      lastFailure,
    );
  }

  private sleep(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(signal.reason ?? new Error("Aborted"));
        return;
      }

      const timer = setTimeout(() => {
        cleanup();
        resolve();
      }, ms);

      const onAbort = () => {
        clearTimeout(timer);
        cleanup();
        reject(signal?.reason ?? new Error("Aborted"));
      };

      const cleanup = () => {
        signal?.removeEventListener("abort", onAbort);
      };

      signal?.addEventListener("abort", onAbort, { once: true });
    });
  }

  private log(
    level: "info" | "warn" | "error",
    message: string,
    context: AttemptContext,
    status: "success" | "retry" | "failed",
    error?: any,
    nextDelayMs?: number,
    result?: any
  ): void {
    if (!this.config.enableStructuredLogging) return;

    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      attempt: context.attempt,
      maxAttempts: context.maxAttempts,
      status,
      elapsedMs: this.getElapsed(context),
      ...(error && { error: error instanceof Error ? error.message : String(error) }),
      ...(nextDelayMs !== undefined && { nextDelayMs }),
      ...(result !== undefined && { result }),
    };

    if (this.config.logger) {
      this.config.logger(logEntry);
    } else {
      console[level](JSON.stringify(logEntry));
    }
  }
}