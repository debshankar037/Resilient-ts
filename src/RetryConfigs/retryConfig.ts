import { DelayConfig, RetryIf, RetryIfResult, onRetry, onSuccess, onFailure, Logger } from "../types";

export interface RetryConfig<T = unknown> {
    maxAttempts?: number;          // maximum retry attempts
    delay?: DelayConfig;          // delay strategy and parameters
    retryIf?: RetryIf;           // function to determine if retry should occur based on error
    retryIfResult?: RetryIfResult<T>; // function to determine if retry should occur based on result
    onRetry?: onRetry;           // callback for each retry attempt
    onSuccess?: onSuccess<T>;  // callback for successful execution
    onFailure?: onFailure;       // callback after all retries fail
    timeoutMs?: number;           // overall timeout for all attempts
    totalTimeoutMs?: number;      // total timeout for all attempts (alternative to timeoutMs)
    signal?: AbortSignal;          // signal for cancellation
    enableStructuredLogging?: boolean; // toggle to enable structured logging
    logger?: Logger;               // custom logger function
}