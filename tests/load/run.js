#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve, join } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '../..');
const localK6Windows = join(projectRoot, 'tools/k6-bin/k6.exe');

let k6Command = 'k6';
if (process.platform === 'win32' && existsSync(localK6Windows)) {
  k6Command = localK6Windows;
}

const rawArgs = process.argv.slice(2);
let args;

if (
  rawArgs.length > 0 &&
  (rawArgs[0] === 'version' || rawArgs[0] === '--version' || rawArgs[0] === '-v')
) {
  args = ['version'];
} else if (
  rawArgs.length > 0 &&
  (rawArgs[0] === 'help' || rawArgs[0] === '--help' || rawArgs[0] === '-h')
) {
  args = ['--help'];
} else {
  args = ['run', ...rawArgs];
  if (!args.some((arg) => arg.endsWith('.js'))) {
    args.push(join(projectRoot, 'tests/load/index.js'));
  }
}

// Sanitize logged command to strictly prevent leaking credentials in stdout or CI logs
const sanitizedArgs = args.map((arg) => {
  if (/password|token|secret/i.test(arg)) {
    return arg.replace(/(=)[^\s]+/i, '$1[REDACTED]');
  }
  return arg;
});

console.log(`[LoadTest] Executing: ${k6Command} ${sanitizedArgs.join(' ')}`);

const result = spawnSync(k6Command, args, {
  stdio: 'inherit',
  shell: true,
  env: process.env,
});

process.exit(result.status ?? 0);
