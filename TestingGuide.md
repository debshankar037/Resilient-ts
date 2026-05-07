# Testing Guide for `resilient-ts`

This guide explains how to run the test suite for the `resilient-ts` retry package and how to write new tests. The project uses [Vitest](https://vitest.dev/) for unit testing.

## Running the Tests

To run the test suite, use the standard npm test command. If you have npm or npx available, simply execute:

```bash
npm run test
# OR
npx vitest run
```

If you are developing and want to run the tests in watch mode, which will re-run the tests whenever you save a file:

```bash
npx vitest
```

## Understanding the Test Suite

The tests for the main `RetryEngine` logic are located in `src/retry.test.ts`. They use Vitest's fake timers to instantly test features like backoff delays and timeouts without physically waiting for the actual time to elapse.

### Using Fake Timers

When writing tests that involve timing (such as delays between retries or timeouts), you should leverage Vitest's fake timers to keep the test suite fast:

```typescript
import { vi, describe, beforeEach, afterEach, it } from 'vitest';

describe('My Time Based Tests', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('should test retry delay', async () => {
    const promise = retryEngine.execute(myTask);
    
    // Suppress unhandled rejection warnings for expected failure attempts
    promise.catch(() => {});

    // Fast-forward time
    await vi.advanceTimersByTimeAsync(100); 
    
    // assert
  });
});
```

### Key Areas to Test

When adding new features or making modifications to the retry logic, consider the following areas:

1. **Attempt Limits:** Ensure the engine respects `maxAttempts`.
2. **Conditional Retry:** Write tests for the `retryIf` and `retryIfResult` callbacks. Ensure that they correctly halt or continue retrying based on both error instances and successful results.
3. **Delay and Jitter:** Write test assertions to verify the `DelayResolver` calculates the expected backoffs.
4. **Abort Signals:** Verify that `AbortController` functionality stops any ongoing attempts and correctly cleans up pending setTimeouts.
5. **Structured Logging:** Validate that the custom `logger` callback receives correctly formatted `RetryLog` objects with accurate properties like elapsed time, next delay, and status.

## Example: Testing Structured Logs

To test structured logs, pass a spy function as the logger and verify its outputs:

```typescript
it('logs structured events correctly', async () => {
  const logs: any[] = [];
  const engine = new RetryEngine({
    enableStructuredLogging: true,
    logger: (log) => logs.push(log)
  });

  // execute task...
  // advance timers...

  expect(logs[0].status).toBe('retry');
  expect(logs[0].level).toBe('warn');
});
```
