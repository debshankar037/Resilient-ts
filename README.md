# 🛡️ resilient-ts

[![npm version](https://img.shields.io/npm/v/resilient-ts.svg)](https://npmjs.org/package/resilient-ts)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict-blue.svg)](https://www.typescriptlang.org/)

**A production-grade, highly configurable retry utility for modern TypeScript applications.** 

`resilient-ts` goes beyond simple `setTimeout` loops. It is engineered for distributed systems, handling everything from advanced **exponential backoff with decorrelated jitter**, to **native HTTP `Retry-After` header parsing**, **global timeouts**, and **structured logging**.

Whether you are fetching data from flaky APIs, connecting to a database, or performing heavy asynchronous jobs, `resilient-ts` keeps your application stable.

---

## 📦 Installation

```bash
npm install resilient-ts
# or
yarn add resilient-ts
# or
pnpm add resilient-ts
```

---

## 🚀 Quick Start

Wrap any promise-returning function with `RetryEngine.execute`. By default, it gives you 3 attempts with a fixed 500ms delay.

```typescript
import { RetryEngine } from 'resilient-ts';

// 1. Initialize the engine
const engine = new RetryEngine({
  maxAttempts: 3,
  delay: {
    initial: 1000,
    strategy: 'exponential' // 1s -> 2s -> 4s
  }
});

// 2. Wrap your async logic
async function fetchUserProfile(userId: string) {
  return await engine.execute(async (signal) => {
    const response = await fetch(`https://api.example.com/users/${userId}`, { signal });
    
    if (!response.ok) {
      throw new Error(`HTTP Error! Status: ${response.status}`);
    }
    
    return await response.json();
  });
}
```

---

## ✨ Core Features & Examples

### 1. Delay & Jitter Strategies
To prevent the "Thundering Herd" problem (where hundreds of clients retry at the exact same millisecond and crash your server), `resilient-ts` supports advanced mathematical jitter.

```typescript
const engine = new RetryEngine({
  maxAttempts: 5,
  delay: {
    initial: 500,           // Start with 500ms
    max: 30000,             // Never wait longer than 30 seconds
    multiplier: 2,          // Double the delay each time
    strategy: 'exponential', // Use exponential growth
    jitter: 'decorrelated'   // The gold-standard jitter algorithm for AWS/Microservices
  }
});
```
*Supported Strategies:* `'fixed'`, `'linear'`, `'exponential'`  
*Supported Jitters:* `'none'`, `'full'`, `'equal'`, `'decorrelated'`

### 2. Intelligent HTTP Header Parsing (`Retry-After`)
If your API returns a `429 Too Many Requests` or `503 Service Unavailable`, `resilient-ts` can automatically read the HTTP headers to calculate the exact wait time—*even accounting for local vs. server clock skew!*

```typescript
const engine = new RetryEngine({ maxAttempts: 5 });

engine.execute(async () => {
  try {
    return await axios.get('https://api.my-service.com/data');
  } catch (error) {
    // If the error object has `error.response.headers`, 
    // resilient-ts will automatically parse `Retry-After` or `X-RateLimit-Reset`!
    throw error;
  }
});
```

### 3. Conditional Retrying
Sometimes you only want to retry on network timeouts, but fail immediately on `401 Unauthorized`. You can also retry based on the *result* of a successful promise!

```typescript
const engine = new RetryEngine({
  maxAttempts: 3,
  
  // Conditionally retry based on the Error thrown
  retryIf: (error, context) => {
    // Don't retry auth errors
    if (error.status === 401 || error.status === 403) return false;
    return true; // Retry everything else
  },

  // Conditionally retry based on a SUCCESSFUL payload
  retryIfResult: (result, context) => {
    // If the server returns 200 OK, but the body says "status: pending", 
    // force a retry to check again later!
    if (result.status === 'pending') return true; 
    return false;
  }
});
```

### 4. Global & Per-Attempt Timeouts
Native support for `AbortController`. You can enforce strict time budgets.

```typescript
const engine = new RetryEngine({
  maxAttempts: 10,
  timeoutMs: 2000,         // Abort any individual attempt if it takes > 2 seconds
  totalTimeoutMs: 15000,   // Abort the ENTIRE retry chain if > 15 seconds have passed
});

// The `signal` is automatically provided to your callback!
engine.execute(async (signal) => {
  return await fetch('https://slow-api.com/data', { signal });
});
```

### 5. Lifecycle Callbacks & Structured Logging
Need to log metrics to Datadog or print to the console? 

```typescript
const engine = new RetryEngine({
  maxAttempts: 3,
  
  // Lifecycle hooks
  onRetry: ({ attempt, error, nextDelayMs, elapsedMs }) => {
    console.warn(`Attempt ${attempt} failed. Retrying in ${nextDelayMs}ms...`);
  },
  onFailure: ({ attempts, error, elapsedMs }) => {
    console.error(`Gave up after ${attempts} attempts! Total time: ${elapsedMs}ms`);
  },
  onSuccess: ({ attempt, result, elapsedMs }) => {
    console.log(`Success on attempt ${attempt}!`);
  },

  // Or use built-in Structured Logging
  enableStructuredLogging: true,
  logger: (logEntry) => {
    // logEntry contains { timestamp, level, status, attempt, error, etc }
    myMonitoringService.send(logEntry); 
  }
});
```

---

## 🛠️ API Reference

### `RetryConfig`
| Property | Type | Description |
|---|---|---|
| `maxAttempts` | `number` | Maximum number of times to try the task (default: `3`). |
| `delay` | `DelayConfig` | Object containing `initial`, `max`, `multiplier`, `strategy`, and `jitter`. |
| `retryIf` | `(error, context) => boolean` | Return `false` to abort retrying on specific errors. |
| `retryIfResult` | `(result, context) => boolean` | Return `true` to force a retry even if the promise resolved. |
| `timeoutMs` | `number` | Time limit per-attempt in milliseconds. |
| `totalTimeoutMs` | `number` | Time limit for the entire engine run (including wait times). |
| `signal` | `AbortSignal` | Pass a parent `AbortSignal` to cancel the engine externally. |
| `onRetry` / `onSuccess` / `onFailure` | `function` | Lifecycle hooks. |
| `enableStructuredLogging` | `boolean` | Set to true to emit structured JSON logs. |
| `logger` | `(log) => void` | Custom logging function (defaults to `console.log/warn/error`). |

---

## 👨‍💻 Contributing & Testing

If you want to contribute, clone the repo and run the tests. Tests are incredibly fast thanks to `vitest` fake timers.

```bash
npm install
npm run test
```

## 📄 License
MIT © Debshankar Dey
