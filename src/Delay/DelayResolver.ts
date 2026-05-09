import { JitterStrategyFactory } from "./JitterStrategy/JitterStrategyFactory";
import { DelayStrategyFactory } from "./DelayStrategy/DelayStrategyFactory";
import { DelayConfig, DelayStrategy } from "../types";

export class DelayResolver {
  private DelayConfiguration: DelayConfig;
  private readonly DEFAULT_FUDGE = 500; // Safety buffer for network/server lag
  private readonly RANDOM_JITTER_MAX = 200; // Prevents "Retry Storms"

  constructor(delayConfig: DelayConfig) {
    this.DelayConfiguration = delayConfig;
  }


  private getHeader(headers: any, name: string): string | undefined {
    if (!headers) return undefined;

    // Fetch Headers object
    if (typeof headers.get === "function") {
      return headers.get(name) ?? headers.get(name.toLowerCase()) ?? undefined;
    }

    // Plain object direct hit
    if (headers[name] !== undefined) return headers[name];

    // Case-insensitive object search
    const lower = name.toLowerCase();

    for (const key in headers) {
      if (key.toLowerCase() === lower) {
        return headers[key];
      }
    }

    return undefined;
  }
  /**
   * Calculates the difference between our clock and the server's clock.
   * Positive = Our clock is ahead. Negative = Our clock is behind.
   */
  private getClockSkew(headers: any): number {
    const serverDateStr = this.getHeader(headers, "date");
    if (!serverDateStr) return 0;

    const serverTime = Date.parse(serverDateStr);
    return isNaN(serverTime) ? 0 : Date.now() - serverTime;
  }

  fetchServerSpecifiedDelay(header: any): number | null {
    if (!header) return null;

    const skew = this.getClockSkew(header);
    const correctedNow = Date.now() - skew; // This is the "Server's Time" on our machine
    let delayMs: number | null = null;

    // 1. Check RFC 7231: Retry-After
    const retryAfter = this.getHeader(header, "retry-after");
    if (retryAfter !== undefined) {
      if (/^\d+$/.test(retryAfter)) {
        delayMs = parseInt(retryAfter, 10) * 1000;
      } else {
        const date = Date.parse(retryAfter);
        if (!isNaN(date)) {
          delayMs = date - correctedNow;
        }
      }
    }

    // 2. Check Rate Limit Reset Headers (IETF & Legacy)
    if (delayMs === null) {
      const resetHeader =
        this.getHeader(header, "ratelimit-reset") ||
        this.getHeader(header, "x-ratelimit-reset") ||
        this.getHeader(header, "x-rate-limit-reset");

      if (resetHeader && /^\d+$/.test(resetHeader)) {
        const value = parseInt(resetHeader, 10);
        const ONE_YEAR_IN_SECONDS = 31536000;

        if (value < ONE_YEAR_IN_SECONDS) {
          delayMs = value * 1000;
        } else {
          const resetMs = value < 10000000000 ? value * 1000 : value;
          delayMs = resetMs - correctedNow;
        }
      }
    }

    if (delayMs !== null) {
      // Add Fudge + Small Jitter to prevent Thundering Herd
      const safetyBuffer = this.DEFAULT_FUDGE + Math.random() * this.RANDOM_JITTER_MAX;
      return Math.max(0, delayMs + safetyBuffer);
    }

    return null;
  }

  resolveDelay(attempt: number, error: any, previousDelay: number): number {
    // 1. Check for server-specified delay (includes Skew, Fudge, and Jitter)
    const serverDelay: number | null = this.fetchServerSpecifiedDelay(error?.response?.headers);

    if (serverDelay !== null) {
      return Math.min(serverDelay, this.DelayConfiguration.max || 30000);
    }

    // 2. Fallback to Mathematical Strategy
    const delayStrategy: DelayStrategy = this.DelayConfiguration.strategy || "fixed";
    const delayStrategyInstance = DelayStrategyFactory.create(
      delayStrategy,
      this.DelayConfiguration.initial,
      this.DelayConfiguration.multiplier
    );

    let delay: number = delayStrategyInstance.getDelay(attempt);

    // 3. Apply configured Jitter (e.g., Decorrelated Jitter)
    if (this.DelayConfiguration.jitter) {
      if (this.DelayConfiguration.jitter === "decorrelated") {
        const decorrelated = JitterStrategyFactory.create(
          "decorrelated",
          previousDelay,
          this.DelayConfiguration.initial || 1000
        );
        delay = decorrelated.apply();
      } else {
        const jitterInstance = JitterStrategyFactory.create(this.DelayConfiguration.jitter, delay, 0);
        delay = jitterInstance.apply();
      }
    }

    return Math.min(delay, this.DelayConfiguration.max || 30000);
  }
}