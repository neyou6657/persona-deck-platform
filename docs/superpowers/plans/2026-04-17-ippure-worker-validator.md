# IPPure Worker Validator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the existing Cloudflare-only ProxyIP validator with a Worker that performs real `https://ippure.com/` probing through ProxyIP and can be deployed behind password protection.

**Architecture:** Extract pure helper functions for parsing ProxyIP targets, building the IPPure HTTPS probe request, and classifying success or Cloudflare block pages. Keep the Worker entrypoint thin: validate input, run the probe, and return structured JSON diagnostics.

**Tech Stack:** Cloudflare Workers, JavaScript ES modules, `node:test`, `node:assert/strict`, Wrangler

---

### Task 1: Define failing validator behavior

**Files:**
- Create: `/workspace/CF-Workers-CheckProxyIP/tests/worker.test.mjs`
- Create: `/workspace/CF-Workers-CheckProxyIP/src/worker-helpers.mjs`

- [ ] **Step 1: Write failing tests for ProxyIP parsing**

```js
test("parseProxyTarget handles ipv4 with explicit port", () => {
  assert.deepEqual(parseProxyTarget("1.2.3.4:8443"), { hostname: "1.2.3.4", port: 8443 });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test /workspace/CF-Workers-CheckProxyIP/tests/worker.test.mjs`
Expected: FAIL because helper module and functions are missing.

- [ ] **Step 3: Add failing tests for IPPure block-page detection**

```js
test("classifyProbeResult rejects Cloudflare 1034 pages", () => {
  const result = classifyProbeResult({
    statusCode: 200,
    bodyText: "Please enable cookies. Error 1034 Edge IP Restricted",
  });
  assert.equal(result.success, false);
  assert.equal(result.failureReason, "edge_ip_restricted");
});
```

- [ ] **Step 4: Add failing tests for success classification**

```js
test("classifyProbeResult accepts a normal IPPure page", () => {
  const result = classifyProbeResult({
    statusCode: 200,
    bodyText: "<html><title>IPPure</title><body>Welcome</body></html>",
  });
  assert.equal(result.success, true);
});
```

- [ ] **Step 5: Commit**

```bash
git -C /workspace/CF-Workers-CheckProxyIP add tests/worker.test.mjs src/worker-helpers.mjs
git -C /workspace/CF-Workers-CheckProxyIP commit -m "test: define ippure probe behavior"
```

### Task 2: Implement the Worker probe helpers and wire them into `_worker.js`

**Files:**
- Modify: `/workspace/CF-Workers-CheckProxyIP/_worker.js`
- Modify: `/workspace/CF-Workers-CheckProxyIP/src/worker-helpers.mjs`
- Test: `/workspace/CF-Workers-CheckProxyIP/tests/worker.test.mjs`

- [ ] **Step 1: Implement pure helper functions**

```js
export function parseProxyTarget(proxyip) {
  // normalize ipv4 / ipv6 / domain plus default port 443
}

export function classifyProbeResult({ statusCode, bodyText }) {
  // reject Error 1034 / Edge IP Restricted / cookie wall block pages
}
```

- [ ] **Step 2: Run tests to verify helper behavior passes**

Run: `node --test /workspace/CF-Workers-CheckProxyIP/tests/worker.test.mjs`
Expected: PASS

- [ ] **Step 3: Replace Cloudflare-only detection in `_worker.js`**

```js
const probe = await probeIppureThroughProxy(proxyTarget, targetHost);
return jsonResponseFromProbe(probe);
```

- [ ] **Step 4: Run tests again**

Run: `node --test /workspace/CF-Workers-CheckProxyIP/tests/worker.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git -C /workspace/CF-Workers-CheckProxyIP add _worker.js src/worker-helpers.mjs tests/worker.test.mjs
git -C /workspace/CF-Workers-CheckProxyIP commit -m "feat: validate proxyip with ippure probe"
```

### Task 3: Add deployment config and verify live behavior

**Files:**
- Create: `/workspace/CF-Workers-CheckProxyIP/wrangler.toml`
- Modify: `/workspace/CF-Workers-CheckProxyIP/README.md`

- [ ] **Step 1: Add Wrangler config with `nodejs_compat`**

```toml
name = "check-proxyip-ippure"
main = "_worker.js"
compatibility_date = "2026-04-17"
compatibility_flags = ["nodejs_compat"]
```

- [ ] **Step 2: Install Wrangler**

Run: `npm install --prefix /workspace/CF-Workers-CheckProxyIP wrangler`
Expected: install completes successfully.

- [ ] **Step 3: Deploy with secrets**

Run: `npx wrangler deploy`
Expected: deployment succeeds and returns a Worker URL.

- [ ] **Step 4: Verify the live endpoint**

Run: `curl "<worker-url>/check?proxyip=..." ...`
Expected: live JSON clearly distinguishes success from `Error 1034` failures.

- [ ] **Step 5: Commit**

```bash
git -C /workspace/CF-Workers-CheckProxyIP add wrangler.toml README.md package.json package-lock.json
git -C /workspace/CF-Workers-CheckProxyIP commit -m "chore: add worker deployment config"
```
