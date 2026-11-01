import { spawn } from 'node:child_process';
import http from 'node:http';

const PORT = 3456;
const BASE_URL = `http://127.0.0.1:${PORT}`;

console.log(`Starting Next.js production server on port ${PORT}...`);

const nextProc = spawn('npx.cmd', ['next', 'start', '-p', String(PORT)], {
  cwd: 'C:/dev/floodrelay/apps/web',
  stdio: 'inherit',
  shell: true,
});

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function checkUrl(path) {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, { redirect: 'manual' });
  const text = await res.text();
  return {
    status: res.status,
    redirect: res.headers.get('location'),
    contentLength: text.length,
    hasSimulatedDisclaimer: text.includes('SIMULATED') || text.includes('PREVIEW'),
    titleMatch: text.match(/<title>([^<]*)<\/title>/)?.[1] || 'no-title',
  };
}

async function main() {
  await sleep(4000);

  const routes = [
    '/',
    '/citizen',
    '/citizen/request',
    '/citizen/confirmation',
    '/operator',
    '/operator/requests',
    '/operator/map',
    '/operator/assignments',
    '/operator/assignments/PR-105',
    '/operator/assignments/PR-999',
  ];

  console.log('\n--- PROBING ALL 8 FLOODRELAY ROUTES ---\n');
  const results = [];

  for (const r of routes) {
    try {
      const res = await checkUrl(r);
      console.log(
        `Route [${r}] -> Status: ${res.status}, Title: "${res.titleMatch}", Len: ${res.contentLength}, SimTag: ${res.hasSimulatedDisclaimer}`,
      );
      results.push({ route: r, ...res });
    } catch (err) {
      console.error(`Route [${r}] FAILED:`, err.message);
      results.push({ route: r, error: err.message });
    }
  }

  nextProc.kill('SIGTERM');
  console.log('\nFinished probe.');
  process.exit(
    results.every((r) => !r.error && (r.status === 200 || r.status === 307 || r.status === 308))
      ? 0
      : 1,
  );
}

main().catch((err) => {
  console.error(err);
  nextProc.kill('SIGTERM');
  process.exit(1);
});
