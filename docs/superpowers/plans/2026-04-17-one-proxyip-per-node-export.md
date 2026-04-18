# One ProxyIP Per Node Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a FOFA export script that validates many candidate ProxyIP values, selects only high-quality unique ProxyIP entries, and produces a Clash YAML where each final node uses exactly one ProxyIP.

**Architecture:** Keep the FOFA fetch and ProxyIP validation flow from the earlier exporter, but change subscription generation from one bulk `proxyip=a,b,c` request into per-ProxyIP template fetches plus YAML assembly. The final config uses the template structure from the first subscription response, replaces the `proxies` list with one proxy per reverse node, and trims proxy groups to only the retained node names.

**Tech Stack:** Python 3.11, `urllib`, `concurrent.futures`, `time`, `statistics`, `yaml`, `unittest`

---

### Task 1: Define failing end-to-end behavior tests

**Files:**
- Create: `/workspace/test_fofa_proxyip_export.py`
- Test: `/workspace/test_fofa_proxyip_export.py`

- [ ] **Step 1: Write the failing test**

```python
def test_script_generates_one_proxyip_per_node_yaml(self):
    proc = subprocess.run(
        [sys.executable, SCRIPT_PATH, raw_url, "5"],
        text=True,
        capture_output=True,
        cwd=workdir,
        env=env,
        timeout=30,
    )
    self.assertEqual(proc.returncode, 0, proc.stderr)
    config = yaml.safe_load(open(output_path, "r", encoding="utf-8").read())
    self.assertEqual(
        [item["ws-opts"]["path"] for item in config["proxies"]],
        ["/proxyip=203.0.113.1:1441", "/proxyip=203.0.113.2:1442", "/proxyip=203.0.113.3:1443"],
    )
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python3 -m unittest /workspace/test_fofa_proxyip_export.py -v`
Expected: FAIL because `/workspace/fofa_proxyip_export.py` does not exist yet.

- [ ] **Step 3: Expand the failing coverage**

```python
def test_script_keeps_fewer_nodes_when_high_quality_proxyips_are_insufficient(self):
    self.assertEqual(len(config["proxies"]), 2)
    self.assertEqual(config["proxy-groups"][0]["proxies"], ["node-a", "node-b"])
```

- [ ] **Step 4: Run test suite again**

Run: `python3 -m unittest /workspace/test_fofa_proxyip_export.py -v`
Expected: FAIL with missing script or missing behavior.

- [ ] **Step 5: Commit**

```bash
git add /workspace/test_fofa_proxyip_export.py /workspace/docs/superpowers/plans/2026-04-17-one-proxyip-per-node-export.md
git commit -m "test: define one-proxyip-per-node exporter behavior"
```

### Task 2: Implement FOFA export and YAML assembly

**Files:**
- Create: `/workspace/fofa_proxyip_export.py`
- Modify: `/workspace/test_fofa_proxyip_export.py`
- Test: `/workspace/test_fofa_proxyip_export.py`

- [ ] **Step 1: Write the minimal implementation for target collection and ProxyIP validation**

```python
def collect_targets(raw_url, want):
    parts, params = parse_base(raw_url)
    params["fields"] = "ip,port"
    ...

def validate_proxyip(candidate):
    timings = []
    for _ in range(VALIDATION_PASSES):
        started = time.perf_counter()
        result = query_proxyip_service(candidate)
        elapsed = time.perf_counter() - started
        if result != candidate:
            return None
        timings.append(elapsed)
    return {
        "proxyip": candidate,
        "avg_latency": statistics.fmean(timings),
        "jitter": max(timings) - min(timings),
    }
```

- [ ] **Step 2: Run tests to verify the implementation is still incomplete**

Run: `python3 -m unittest /workspace/test_fofa_proxyip_export.py -v`
Expected: FAIL on final YAML assembly assertions.

- [ ] **Step 3: Implement per-ProxyIP subscription fetch and config merge**

```python
def build_final_config(proxyips):
    base_config = fetch_template_config(proxyips[0])
    proxy_count = len(base_config.get("proxies") or [])
    selected_proxyips = proxyips[:proxy_count]
    assembled = []
    for index, proxyip in enumerate(selected_proxyips):
        config = fetch_template_config(proxyip)
        assembled.append(config["proxies"][index])
    base_config["proxies"] = assembled
    base_config["proxy-groups"] = trim_proxy_groups(base_config.get("proxy-groups") or [], assembled)
    return base_config
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python3 -m unittest /workspace/test_fofa_proxyip_export.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add /workspace/fofa_proxyip_export.py /workspace/test_fofa_proxyip_export.py
git commit -m "feat: export clash yaml with one proxyip per node"
```

### Task 3: Run with the recovered FOFA input and produce the final YAML

**Files:**
- Modify: `/workspace/proxyip.yaml`
- Test: `/workspace/fofa_proxyip_export.py`

- [ ] **Step 1: Run the exporter with the recovered FOFA URL and sample size**

```bash
python3 /workspace/fofa_proxyip_export.py "<recovered_fofa_url>" "1000"
```

- [ ] **Step 2: Verify output structure**

Run: `python3 - <<'PY'`
Expected: the YAML loads successfully, `len(proxies)` is less than or equal to the template reverse-node count, and every proxy `ws-opts.path` contains exactly one `proxyip=host:port` value with no comma.

- [ ] **Step 3: Deliver the file**

```bash
cc-connect send --file /workspace/proxyip.yaml
```

- [ ] **Step 4: Commit**

```bash
git add /workspace/proxyip.yaml
git commit -m "build: generate one-proxyip-per-node clash yaml"
```
