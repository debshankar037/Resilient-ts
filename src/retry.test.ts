import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RetryEngine } from './retry';
import { RetryError } from './Error/RetryError';

describe('RetryEngine', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('should resolve immediately if the task succeeds on the first attempt', async () => {
    const engine = new RetryEngine();
    const task = vi.fn().mockResolvedValue('success');

    const result = await engine.execute(task);

    expect(result).toBe('success');
    expect(task).toHaveBeenCalledTimes(1);
  });

  it('should retry until successful within maxAttempts', async () => {
    const engine = new RetryEngine({ maxAttempts: 3, delay: { initial: 100 } });
    const task = vi.fn()
      .mockRejectedValueOnce(new Error('fail 1'))
      .mockRejectedValueOnce(new Error('fail 2'))
      .mockResolvedValueOnce('success');

    const promise = engine.execute(task);

    // Fast-forward timers for each retry
    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(100);

    const result = await promise;

    expect(result).toBe('success');
    expect(task).toHaveBeenCalledTimes(3);
  });

  it('should throw final error if maxAttempts are exceeded', async () => {
    const engine = new RetryEngine({ maxAttempts: 3, delay: { initial: 100 } });
    const task = vi.fn().mockRejectedValue(new Error('constant failure'));

    const promise = engine.execute(task);
    promise.catch(() => { }); // Suppress unhandled rejection warning

    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(100);

    await expect(promise).rejects.toThrow(RetryError);
    expect(task).toHaveBeenCalledTimes(3);
  });

  it('should stop retrying if retryIf returns false', async () => {
    const engine = new RetryEngine({
      maxAttempts: 5,
      retryIf: (error) => error.message !== 'stop',
      delay: { initial: 100 }
    });

    const task = vi.fn()
      .mockRejectedValueOnce(new Error('continue'))
      .mockRejectedValueOnce(new Error('stop'));

    const promise = engine.execute(task);
    promise.catch(() => { }); // Suppress unhandled rejection warning

    await vi.advanceTimersByTimeAsync(100);

    await expect(promise).rejects.toThrow(RetryError);
    expect(task).toHaveBeenCalledTimes(2);
  });

  it('should retry based on retryIfResult', async () => {
    const engine = new RetryEngine({
      maxAttempts: 3,
      retryIfResult: (result) => result === 'retry_me',
      delay: { initial: 100 }
    });

    const task = vi.fn()
      .mockResolvedValueOnce('retry_me')
      .mockResolvedValueOnce('success');

    const promise = engine.execute(task);
    await vi.advanceTimersByTimeAsync(100);

    const result = await promise;
    expect(result).toBe('success');
    expect(task).toHaveBeenCalledTimes(2);
  });

  it('should respect abort signal', async () => {
    const controller = new AbortController();
    const engine = new RetryEngine({
      signal: controller.signal,
      delay: { initial: 100 }
    });

    const task = vi.fn().mockImplementation((signal) => {
      return new Promise((_, reject) => {
        if (signal?.aborted) return reject(new Error('aborted'));
        const timer = setTimeout(() => reject(new Error('fail')), 50);
        signal?.addEventListener('abort', () => {
          clearTimeout(timer);
          reject(new Error('aborted'));
        });
      });
    });

    const promise = engine.execute(task);
    promise.catch(() => { }); // Suppress unhandled rejection warning

    // Give it a tiny bit of time to start the task
    await Promise.resolve();

    controller.abort();

    await vi.advanceTimersByTimeAsync(50);

    await expect(promise).rejects.toThrow(/Execution cancelled|Aborted/i);
  });

  it('should use structured logging when enabled', async () => {
    const logs: any[] = [];
    const engine = new RetryEngine({
      maxAttempts: 2,
      delay: { initial: 100 },
      enableStructuredLogging: true,
      logger: (log) => logs.push(log)
    });

    const task = vi.fn()
      .mockRejectedValueOnce(new Error('fail 1'))
      .mockResolvedValueOnce('success');

    const promise = engine.execute(task);
    await vi.advanceTimersByTimeAsync(100);
    await promise;

    expect(logs.length).toBeGreaterThan(0);
    expect(logs[0].status).toBe('retry');
    expect(logs[0].level).toBe('warn');
    expect(logs[1].status).toBe('success');
    expect(logs[1].level).toBe('info');
  });
});

describe('Config Validation', () => {
  it('should throw if maxAttempts is invalid', () => {
    expect(() => new RetryEngine({ maxAttempts: -1 })).toThrow(/Invalid config: maxAttempts/);
    expect(() => new RetryEngine({ maxAttempts: 0 })).toThrow(/Invalid config: maxAttempts/);
    expect(() => new RetryEngine({ maxAttempts: 1.5 })).toThrow(/Invalid config: maxAttempts/);
  });

  it('should throw if delay values are invalid', () => {
    expect(() => new RetryEngine({ delay: { initial: -100 } })).toThrow(/Invalid config: delay.initial/);
    expect(() => new RetryEngine({ delay: { max: -100 } })).toThrow(/Invalid config: delay.max/);
    expect(() => new RetryEngine({ delay: { initial: 1000, max: 500 } })).toThrow(/Invalid config: delay.max/);
    expect(() => new RetryEngine({ delay: { multiplier: 0.5 } })).toThrow(/Invalid config: delay.multiplier/);
  });

  it('should throw if timeout limits are invalid', () => {
    expect(() => new RetryEngine({ timeoutMs: 0 })).toThrow(/Invalid config: timeoutMs/);
    expect(() => new RetryEngine({ timeoutMs: -100 })).toThrow(/Invalid config: timeoutMs/);
    expect(() => new RetryEngine({ totalTimeoutMs: 0 })).toThrow(/Invalid config: totalTimeoutMs/);
  });
});

describe('Advanced Timing & Execution Features', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('should respect totalTimeoutMs across multiple attempts', async () => {
    const engine = new RetryEngine({
      maxAttempts: 5,
      delay: { initial: 1000 },
      totalTimeoutMs: 1500 // Only enough time for 1 failed attempt and partial delay
    });
    const task = vi.fn().mockRejectedValue(new Error('fail'));
    const promise = engine.execute(task);
    promise.catch(() => { });
    await vi.advanceTimersByTimeAsync(1000); // Wait for the delay
    await vi.advanceTimersByTimeAsync(500);  // Hit global timeout
    await expect(promise).rejects.toThrow(/Global timeout exceeded/);
  });

  it('should respect Retry-After header in seconds', async () => {
    const engine = new RetryEngine({ maxAttempts: 3 });

    const errorWithHeaders = new Error('Rate Limited');
    (errorWithHeaders as any).response = {
      headers: { 'retry-after': '10' } // 10 seconds
    };

    const task = vi.fn()
      .mockRejectedValueOnce(errorWithHeaders)
      .mockResolvedValueOnce('success');

    const promise = engine.execute(task);

    await vi.advanceTimersByTimeAsync(1000); // 1s - shouldn't execute yet
    expect(task).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(10000); // Complete the 10s wait (+ fudge and jitter)
    await promise;

    expect(task).toHaveBeenCalledTimes(2);
  });

  it('should scale delays exponentially', async () => {
    const logs: any[] = [];
    const engine = new RetryEngine({
      maxAttempts: 4,
      delay: { strategy: 'exponential', initial: 100, multiplier: 2 },
      enableStructuredLogging: true,
      logger: (log) => logs.push(log)
    });
    const task = vi.fn().mockRejectedValue(new Error('fail'));
    const promise = engine.execute(task);
    promise.catch(() => { });
    // Fast-forward through all attempts
    await vi.advanceTimersByTimeAsync(100); // 1st delay
    await vi.advanceTimersByTimeAsync(200); // 2nd delay
    await vi.advanceTimersByTimeAsync(400); // 3rd delay
    const retryLogs = logs.filter(l => l.status === 'retry');
    expect(retryLogs[0].nextDelayMs).toBe(100);
    expect(retryLogs[1].nextDelayMs).toBe(200);
    expect(retryLogs[2].nextDelayMs).toBe(400);
  });

});

