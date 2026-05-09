// tests/chaos/chaos.test.ts

import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
} from "vitest";

import { spawn, ChildProcess } from "child_process";
import { RetryEngine } from "../../src";

describe("Chaos Engineering Tests", () => {
  let serverProcess: ChildProcess;
  const API_URL = "http://localhost:3001/api";

  // ------------------------------------------------
  // boot server
  // ------------------------------------------------
  beforeAll(async () => {
    serverProcess = spawn("cmd.exe", [
      "/c",
      "npx tsx tests/chaos/flaky-server.ts",
    ]);

    await new Promise((r) => setTimeout(r, 2500));
  });

  afterAll(() => {
    serverProcess?.kill();
  });

  beforeEach(async () => {
    try {
      await fetch(`${API_URL}?mode=__reset`);
    } catch { }
  });

  // ------------------------------------------------
  // helper
  // ------------------------------------------------
  const fetchWithEngine = async (engine: RetryEngine, mode: string) => {
    return engine.execute(async (signal) => {
      const res = await fetch(`${API_URL}?mode=${mode}`, { signal });

      if (!res.ok) {
        const err: any = new Error(`HTTP ${res.status}`);
        err.status = res.status;
        err.response = {
          headers: Object.fromEntries(res.headers),
        };
        throw err;
      }

      return res.json();
    });
  };

  // ------------------------------------------------
  // EXISTING TESTS
  // ------------------------------------------------

  it("should handle flaky endpoints and eventually succeed", async () => {
    const engine = new RetryEngine({
      maxAttempts: 10,
      delay: { initial: 100, strategy: "exponential", max: 1000 },
    });

    const result = await fetchWithEngine(engine, "flaky");

    expect(result.ok).toBe(true);
  }, 15000);

  it("should gracefully handle socket connection resets", async () => {
    const engine = new RetryEngine({
      maxAttempts: 3,
      delay: { initial: 100 },
    });

    await expect(fetchWithEngine(engine, "reset")).rejects.toThrow();
  });

  it("should enforce local attempt timeout if a task hangs indefinitely", async () => {
    const engine = new RetryEngine({
      maxAttempts: 2,
      timeoutMs: 1000,
      delay: { initial: 100 },
    });

    await expect(fetchWithEngine(engine, "timeout")).rejects.toThrow();
  });

  it("should respect server Retry-After headers", async () => {
    const engine = new RetryEngine({
      maxAttempts: 3,
    });

    const start = Date.now();

    await expect(fetchWithEngine(engine, "retry-after")).rejects.toThrow();

    const elapsed = Date.now() - start;

    expect(elapsed).toBeGreaterThanOrEqual(5000);
  }, 15000);

  it("should successfully handle multiple socket resets and then return success if within limit", async () => {
    const engine = new RetryEngine({
      maxAttempts: 5,
      delay: {
        initial: 100,
        strategy: "exponential",
        multiplier: 3,
        jitter: "decorrelated",
        max: 30000,
      },
    });

    const result = await fetchWithEngine(engine, "reset-retry");

    expect(result.ok).toBe(true);
    expect(result.count % 3).toBe(0);
  });

  it("should retry on HTTP 202 and succeed on 3rd attempt", async () => {
    let attempts = 0;

    const engine = new RetryEngine({
      maxAttempts: 5,
      delay: { initial: 100 },

      retryIfResult: (res: any) => res.httpStatus === 202,
    });

    const result = await engine.execute(async () => {
      attempts++;

      const res = await fetch(`${API_URL}?mode=bulk-fhir`);
      const body = await res.json();

      return {
        httpStatus: res.status,
        body,
      };
    });

    expect(result.httpStatus).toBe(200);
    expect(attempts).toBe(3);
  });

  it("should timeout first, retry on 429, and stop on 401", async () => {
    let attempts = 0;

    const engine = new RetryEngine({
      maxAttempts: 5,
      timeoutMs: 2000,
      delay: { initial: 50 },

      retryIf: (err: any) => err.status !== 401,
    });

    const resultPromise = engine.execute(async (signal) => {
      attempts++;

      const res = await fetch(
        `${API_URL}?mode=timeout-then-401`,
        { signal }
      );

      const body = await res.json();

      if (!res.ok) {
        const err: any = new Error(`HTTP ${res.status}`);
        err.status = res.status;
        err.response = {
          headers: Object.fromEntries(res.headers),
        };
        throw err;
      }

      return body;
    });

    await expect(resultPromise).rejects.toThrow(Error);

    expect(attempts).toBe(3);
  }, 15000);

  // ------------------------------------------------
  // NEW PRODUCTION STYLE TESTS
  // ------------------------------------------------

  it("should recover from temporary 503 outage", async () => {
    const engine = new RetryEngine({
      maxAttempts: 5,
      delay: { initial: 100 },
    });

    const result = await fetchWithEngine(engine, "503-then-success");

    expect(result.ok).toBe(true);
  });

  it("should recover from temporary rate limit", async () => {
    const engine = new RetryEngine({
      maxAttempts: 5,
    });

    const start = Date.now();

    const result = await fetchWithEngine(
      engine,
      "rate-limit-then-success"
    );

    const elapsed = Date.now() - start;

    expect(result.ok).toBe(true);
    expect(elapsed).toBeGreaterThanOrEqual(2000);
  });

  it("should spread retries using jitter (anti retry-storm timing)", async () => {
    const engine = new RetryEngine({
      maxAttempts: 4,
      delay: {
        initial: 100,
        strategy: "exponential",
        jitter: "decorrelated",
      },
    });

    const start = Date.now();

    await expect(
      fetchWithEngine(engine, "retry-after")
    ).rejects.toThrow();

    const elapsed = Date.now() - start;

    expect(elapsed).toBeGreaterThan(4500);
  }, 15000);

  it("should survive 50 concurrent retry events", async () => {
    const TOTAL_CLIENTS = 50;

    const start = Date.now();

    const jobs = Array.from({ length: TOTAL_CLIENTS }, async (_, i) => {
      const engine = new RetryEngine({
        maxAttempts: 5,
        delay: {
          initial: 100,
          strategy: "exponential",
          jitter: "decorrelated",
          max: 2000,
        },
      });

      return fetchWithEngine(engine, "flaky");
    });

    const results = await Promise.allSettled(jobs);

    const success = results.filter(
      (r) => r.status === "fulfilled"
    ).length;

    const failed = results.filter(
      (r) => r.status === "rejected"
    ).length;

    const elapsed = Date.now() - start;

    expect(success).toBeGreaterThanOrEqual(40);
    expect(failed).toBeLessThanOrEqual(10);
    expect(elapsed).toBeLessThan(30000);
  }, 40000);
});