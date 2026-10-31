import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const PORT = 3456;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const CHROME_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const SCREENSHOT_DIR = 'C:/dev/floodrelay/apps/web/screenshots';

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

console.log(`Starting Next.js server on port ${PORT}...`);

const nextProc = spawn('npx.cmd', ['next', 'start', '-p', String(PORT)], {
  cwd: 'C:/dev/floodrelay/apps/web',
  stdio: 'inherit',
  shell: true,
});

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const VIEWPORTS = [
  { name: '1440px-desktop', width: 1440, height: 900 },
  { name: '1024px-tablet-land', width: 1024, height: 768 },
  { name: '768px-tablet-port', width: 768, height: 1024 },
  { name: '390px-mobile', width: 390, height: 844 },
];

const ROUTES = [
  { name: 'citizen-home', path: '/citizen' },
  { name: 'citizen-request', path: '/citizen/request' },
  { name: 'citizen-confirmation', path: '/citizen/confirmation' },
  { name: 'operator-overview', path: '/operator' },
  { name: 'operator-requests', path: '/operator/requests' },
  { name: 'operator-map', path: '/operator/map' },
  { name: 'operator-assignments', path: '/operator/assignments' },
  { name: 'operator-assignment-review', path: '/operator/assignments/PR-105' },
];

async function main() {
  await sleep(4000);

  console.log(
    `\nCapturing screenshots across ${ROUTES.length} routes and ${VIEWPORTS.length} viewports...\n`,
  );

  for (const route of ROUTES) {
    for (const vp of VIEWPORTS) {
      const outFile = path.join(SCREENSHOT_DIR, `${route.name}-${vp.name}.png`);
      const url = `${BASE_URL}${route.path}`;
      const cmd = `"${CHROME_PATH}" --headless=new --disable-gpu --window-size=${vp.width},${vp.height} --screenshot="${outFile}" "${url}"`;

      try {
        execSync(cmd, { stdio: 'ignore', timeout: 15000 });
        const stat = fs.statSync(outFile);
        console.log(
          `Captured [${route.name}] at [${vp.name}]: ${stat.size} bytes -> ${path.basename(outFile)}`,
        );
      } catch (err) {
        console.error(`Failed [${route.name}] at [${vp.name}]:`, err.message);
      }
    }
  }

  nextProc.kill('SIGTERM');
  console.log('\nAll screenshots captured successfully.');
}

main().catch((err) => {
  console.error(err);
  nextProc.kill('SIGTERM');
  process.exit(1);
});
