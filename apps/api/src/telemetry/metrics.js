// Minimal Prometheus-compatible metrics registry (dependency-free). Tracks request
// counts by method/status and a request-duration histogram. render() produces the
// text exposition format served at /metrics. A drop-in seam for OpenTelemetry later.
const DURATION_BUCKETS_MS = [5, 10, 25, 50, 100, 250, 500, 1000, 2500];

function labelKey(labels) {
  return Object.entries(labels)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([k, v]) => `${k}="${String(v).replace(/"/g, '\\"')}"`)
    .join(",");
}

export function createMetrics() {
  const counters = new Map(); // name|labelKey -> { name, labels, value }
  const durations = { buckets: new Map(DURATION_BUCKETS_MS.map((b) => [b, 0])), sum: 0, count: 0 };

  function inc(name, labels = {}, by = 1) {
    const key = `${name}|${labelKey(labels)}`;
    const existing = counters.get(key);
    if (existing) {
      existing.value += by;
    } else {
      counters.set(key, { name, labels, value: by });
    }
  }

  function observeDurationMs(ms) {
    durations.sum += ms;
    durations.count += 1;
    for (const bucket of DURATION_BUCKETS_MS) {
      if (ms <= bucket) {
        durations.buckets.set(bucket, durations.buckets.get(bucket) + 1);
      }
    }
  }

  function recordRequest({ method, status, durationMs }) {
    inc("xygo_http_requests_total", { method, status: String(status) });
    if (typeof durationMs === "number") {
      observeDurationMs(durationMs);
    }
  }

  function render() {
    const lines = [];
    lines.push("# HELP xygo_http_requests_total Total HTTP requests.");
    lines.push("# TYPE xygo_http_requests_total counter");
    for (const { name, labels, value } of counters.values()) {
      const lk = labelKey(labels);
      lines.push(`${name}${lk ? `{${lk}}` : ""} ${value}`);
    }
    lines.push("# HELP xygo_http_request_duration_ms Request duration histogram (ms).");
    lines.push("# TYPE xygo_http_request_duration_ms histogram");
    let cumulative = 0;
    for (const bucket of DURATION_BUCKETS_MS) {
      cumulative = durations.buckets.get(bucket);
      lines.push(`xygo_http_request_duration_ms_bucket{le="${bucket}"} ${cumulative}`);
    }
    lines.push(`xygo_http_request_duration_ms_bucket{le="+Inf"} ${durations.count}`);
    lines.push(`xygo_http_request_duration_ms_sum ${durations.sum}`);
    lines.push(`xygo_http_request_duration_ms_count ${durations.count}`);
    return `${lines.join("\n")}\n`;
  }

  return { inc, observeDurationMs, recordRequest, render };
}
