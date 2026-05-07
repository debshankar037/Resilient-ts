import { RetryError } from "./Error/RetryError";

export type DelayStrategy = "fixed" | "exponential" | "linear";
export type JitterType = "full" | "equal" | "decorrelated"; 

export interface AttemptContext {
    attempt: number;
    maxAttempts: number;
    elapsedMs : number;
    nextDelayMs?: number;
    startTime: Date;
}

export type DelayConfig = {
  initial?: number;          // base delay in ms
  max?: number;             // maximum delay cap
  multiplier?: number;      // used for exponential growth
  strategy?: DelayStrategy; // delay calculation style
  jitter?: JitterType;         // add randomness to avoid retry storms
};

//Retry if an error occur
export type RetryIf = (error: any, context: AttemptContext) => boolean | Promise<boolean>;

//Retry if a response is not desired
export type RetryIfResult<T> = (result: T, context?: AttemptContext) => boolean | Promise<boolean>;

export type onRetry = (info: {
   attempt: number;
   error: Error;
   nextDelayMs: number;
   elapsedMs: number;
}) => void | Promise<void>;

export type onSuccess<T> = (info: {
   attempt: number;
   result: T;
   elapsedMs: number;
}) => void | Promise<void>;

export type onFailure = (info: {
   attempts: number;
   failures: RetryError["failures"];
   error: Error;
   elapsedMs: number;
}) => void | Promise<void>;

export interface RetryLog {
    timestamp: string;
    level: "info" | "warn" | "error";
    message: string;
    attempt: number;
    maxAttempts: number;
    status: "success" | "retry" | "failed";
    elapsedMs: number;
    error?: string;
    nextDelayMs?: number;
    result?: any;
}

export type Logger = (log: RetryLog) => void;