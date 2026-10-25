const base = process.env.API_URL ?? "http://localhost:4000";

async function time(name, run, iterations) {
  const samples = [];
  for (let i = 0; i < iterations; i += 1) {
    const started = performance.now();
    const response = await run();
    samples.push(performance.now() - started);
    if (!response.ok && response.status !== 401) {
      throw new Error(`${name} failed with ${response.status}`);
    }
  }
  samples.sort((a, b) => a - b);
  const percentile = (p) => samples[Math.min(samples.length - 1, Math.floor((samples.length - 1) * p))];
  return {
    name,
    iterations,
    p50Ms: Number(percentile(0.5).toFixed(1)),
    p95Ms: Number(percentile(0.95).toFixed(1)),
    maxMs: Number(samples[samples.length - 1].toFixed(1)),
  };
}

async function main() {
  const login = await fetch(`${base}/api/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "admin@payguard.local", password: "PayGuard-Admin-Demo-1" }),
  });
  const body = await login.json();
  const cookie = (login.headers.getSetCookie?.() ?? []).map((item) => item.split(";")[0]).join("; ");
  const results = [];
  results.push(await time("GET /health/live", () => fetch(`${base}/health/live`), 50));
  results.push(
    await time(
      "GET /api/v1/payments",
      () => fetch(`${base}/api/v1/payments?pageSize=20`, { headers: { cookie } }),
      30,
    ),
  );
  console.log(JSON.stringify({ api: base, csrfPresent: Boolean(body?.data?.csrfToken), results }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
