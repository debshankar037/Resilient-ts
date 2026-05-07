import { RetryConfig } from "./retryConfig";
import { DelayStrategy, JitterType } from "../types";

export interface NormalizedRetryConfig<T = unknown>
  extends Omit<RetryConfig<T>, "maxAttempts" | "delay"> {
  maxAttempts: number;

  delay: {
    initial: number;
    strategy: DelayStrategy;

    max: number;
    multiplier?: number;
    jitter?: JitterType;
  };
  enableStructuredLogging?: boolean;
  logger?: (log: any) => void;
}

export function normalizeConfig<T = unknown>(
  config: RetryConfig<T> = {}
): NormalizedRetryConfig<T> {
  validateConfig(config);

  return {
    maxAttempts: config.maxAttempts ?? 3,

    delay: {
      initial: config.delay?.initial ?? 500,
      strategy: config.delay?.strategy ?? "fixed",
      max: config.delay?.max ?? 30000, // default max delay of 30 seconds

      ...(config.delay?.multiplier !== undefined && {
        multiplier: config.delay.multiplier
      }),

      ...(config.delay?.jitter !== undefined && {
        jitter: config.delay.jitter
      })
    },

    ...(config.retryIf && {
      retryIf: config.retryIf
    }),

    ...(config.retryIfResult && {
      retryIfResult: config.retryIfResult
    }),

    ...(config.onRetry && {
      onRetry: config.onRetry
    }),

    ...(config.onSuccess && {
      onSuccess: config.onSuccess
    }),

    ...(config.onFailure && {
      onFailure: config.onFailure
    }),

    ...(config.timeoutMs !== undefined && {
      timeoutMs: config.timeoutMs
    }),

    ...(config.totalTimeoutMs !== undefined && {
      totalTimeoutMs: config.totalTimeoutMs
    }),

    ...(config.signal && {
      signal: config.signal
    }),

    ...(config.enableStructuredLogging !== undefined && {
      enableStructuredLogging: config.enableStructuredLogging
    }),

    ...(config.logger && {
      logger: config.logger
    })
  };
}

function validateConfig(config: RetryConfig<any>): void {
  if (config.maxAttempts !== undefined && (config.maxAttempts < 1 || !Number.isInteger(config.maxAttempts))) {
    throw new Error(`Invalid config: maxAttempts must be an integer greater than or equal to 1. Received: ${config.maxAttempts}`);
  }

  if (config.delay) {
    if (config.delay.initial !== undefined && config.delay.initial < 0) {
      throw new Error(`Invalid config: delay.initial must be greater than or equal to 0. Received: ${config.delay.initial}`);
    }

    if (config.delay.max !== undefined) {
      if (config.delay.max < 0) {
        throw new Error(`Invalid config: delay.max must be greater than or equal to 0. Received: ${config.delay.max}`);
      }
      const initial = config.delay.initial ?? 500;
      if (config.delay.max < initial) {
        throw new Error(`Invalid config: delay.max (${config.delay.max}) cannot be less than delay.initial (${initial}).`);
      }
    }

    if (config.delay.multiplier !== undefined && config.delay.multiplier < 1) {
      throw new Error(`Invalid config: delay.multiplier must be greater than or equal to 1. Received: ${config.delay.multiplier}`);
    }
  }

  if (config.timeoutMs !== undefined && config.timeoutMs <= 0) {
    throw new Error(`Invalid config: timeoutMs must be greater than 0. Received: ${config.timeoutMs}`);
  }

  if (config.totalTimeoutMs !== undefined && config.totalTimeoutMs <= 0) {
    throw new Error(`Invalid config: totalTimeoutMs must be greater than 0. Received: ${config.totalTimeoutMs}`);
  }
}
