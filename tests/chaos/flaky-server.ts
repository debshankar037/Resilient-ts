// tests/chaos/flaky-server.ts

import express from "express";

const app = express();

// --------------------------------------------------
// GLOBAL TEST STATE
// --------------------------------------------------
let requestCount = 0;
let bulkCount = 0;

const attemptMap = new Map<string, number>();

function resetState() {
    requestCount = 0;
    bulkCount = 0;
    attemptMap.clear();
}

const delay = (ms: number) =>
    new Promise((resolve) => setTimeout(resolve, ms));

// --------------------------------------------------
// SERVER
// --------------------------------------------------
app.get("/api", async (req, res) => {
    const mode = String(req.query.mode || "random");
    requestCount++;

    // test isolation reset
    if (mode === "__reset") {
        resetState();
        return res.json({ ok: true });
    }

    // ---------------------------------------
    // BASIC MODES
    // ---------------------------------------
    if (mode === "success") {
        return res.json({ ok: true, count: requestCount });
    }

    if (mode === "fail") {
        return res.status(500).json({ error: "hard fail" });
    }

    if (mode === "retry-after") {
        return res
            .status(429)
            .set("Retry-After", "2")
            .json({ error: "rate limited" });
    }

    if (mode === "timeout") {
        await new Promise(() => { });
    }

    if (mode === "slow") {
        await delay(5000);
        return res.json({ ok: true });
    }

    if (mode === "reset") {
        req.socket.destroy();
        return;
    }

    // ---------------------------------------
    // FLAKY RANDOM
    // ---------------------------------------
    if (mode === "flaky") {
        const r = Math.random();

        await delay(Math.random() * 250);

        if (r < 0.20) return res.status(500).json({ error: "500" });
        if (r < 0.35) return res.status(503).json({ error: "503" });

        if (r < 0.50) {
            return res
                .status(429)
                .set("Retry-After", "1")
                .json({ error: "rate limit" });
        }

        if (r < 0.60) {
            req.socket.destroy();
            return;
        }

        return res.json({ ok: true, count: requestCount });
    }

    // ---------------------------------------
    // deterministic reset twice then success
    // ---------------------------------------
    if (mode === "reset-retry") {
        const count = requestCount;

        if (count % 3 !== 0) {
            req.socket.destroy();
            return;
        }

        return res.json({ ok: true, count });
    }

    // ---------------------------------------
    // bulk processing style
    // ---------------------------------------
    if (mode === "bulk-fhir") {
        bulkCount++;

        await delay(150);

        if (bulkCount <= 2) {
            return res.status(202).json({
                status: "processing",
                progress: bulkCount * 40,
            });
        }

        return res.status(200).json({
            ok: true,
            status: "completed",
            records: 1200,
        });
    }

    // ---------------------------------------
    // timeout -> 429 -> 401
    // ---------------------------------------
    if (mode === "timeout-then-401") {
        const key = "timeout401";
        const count = (attemptMap.get(key) || 0) + 1;
        attemptMap.set(key, count);

        // first request timeout
        if (count === 1) {
            await new Promise(() => { });
        }

        // second request retryable
        if (count === 2) {
            return res
                .status(429)
                .set("Retry-After", "1")
                .json({ error: "rate limited" });
        }

        // third request stop retry
        if (count === 3) {
            return res.status(401).json({
                error: "unauthorized"
            });
        }

        return res.status(401).json({
            error: "unauthorized"
        });
    }

    // ---------------------------------------
    // 503 x 2 then success
    // ---------------------------------------
    if (mode === "503-then-success") {
        const key = mode;
        const count = (attemptMap.get(key) || 0) + 1;
        attemptMap.set(key, count);

        if (count <= 2) {
            return res.status(503).json({ error: "service unavailable" });
        }

        return res.json({ ok: true, count });
    }

    // ---------------------------------------
    // 429 x 2 then success
    // ---------------------------------------
    if (mode === "rate-limit-then-success") {
        const key = mode;
        const count = (attemptMap.get(key) || 0) + 1;
        attemptMap.set(key, count);

        if (count <= 2) {
            return res
                .status(429)
                .set("Retry-After", "1")
                .json({ error: "busy" });
        }

        return res.json({ ok: true, count });
    }

    // ---------------------------------------
    // default chaos
    // ---------------------------------------
    const r = Math.random();

    await delay(Math.random() * 100);

    if (r < 0.2) return res.status(500).json({ error: "500" });
    if (r < 0.4) return res.status(503).json({ error: "503" });
    if (r < 0.5) req.socket.destroy();

    return res.json({ ok: true });
});

app.listen(3001, () => {
    console.log("🔥 Flaky Chaos Server running on http://localhost:3001");
});