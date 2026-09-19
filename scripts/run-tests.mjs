#!/usr/bin/env node
/**
 * Test runner for the TypeScript suites.
 *
 * Each test file is a standalone script that prints its own summary and exits
 * non-zero on failure (see any `__tests__/*.test.ts`). This runner discovers
 * them, executes each in its own process, and aggregates the results — so
 * adding a test file needs no change to package.json.
 *
 * Usage: node scripts/run-tests.mjs [nameFilter]
 */
import { spawn } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const PACKAGES_DIR = join(root, 'packages');
const nameFilter = process.argv[2] ?? '';

/** Collect every `packages/<pkg>/__tests__/*.test.ts`. */
function findTestFiles() {
  const found = [];
  for (const pkg of readdirSync(PACKAGES_DIR)) {
    const dir = join(PACKAGES_DIR, pkg, '__tests__');
    let names;
    try {
      if (!statSync(dir).isDirectory()) continue;
      names = readdirSync(dir);
    } catch {
      continue; // package has no __tests__ directory
    }
    for (const name of names.filter((n) => n.endsWith('.test.ts')).sort()) {
      found.push(join(dir, name));
    }
  }
  return found
    .filter((f) => f.includes(nameFilter))
    .sort();
}

/** Run one test file in its own process via the tsx loader. */
function run(file) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['--import', 'tsx', file], {
      cwd: root,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (out += d));
    child.on('close', (code) => resolve({ code, out }));
  });
}

const files = findTestFiles();
if (files.length === 0) {
  console.error(
    nameFilter
      ? `No test files matching "${nameFilter}"`
      : 'No test files found under packages/*/__tests__/',
  );
  process.exit(1);
}

console.log(`Running ${files.length} test file(s)...\n`);

let failedFiles = 0;
let totalPassed = 0;
let totalFailed = 0;

for (const file of files) {
  const label = relative(root, file).replace(/\\/g, '/');
  console.log(`── ${label}`);

  const { code, out } = await run(file);
  const lines = out.split('\n');

  for (const line of lines) {
    const t = line.trim();
    if (/^(✅|❌)/.test(t) || /Results:/.test(t)) console.log(`   ${t}`);
  }

  const match = out.match(/Results:\s*(\d+)\/(\d+)\s*passed,\s*(\d+)\s*failed/);
  if (match) {
    totalPassed += Number(match[1]);
    totalFailed += Number(match[3]);
  }

  if (code !== 0) {
    failedFiles++;
    console.log(`   ⚠ exited with code ${code}`);
    for (const l of lines.filter((l) => l.trim()).slice(-8)) {
      console.log(`     ${l.trim()}`);
    }
  }
  console.log('');
}

console.log('─'.repeat(48));
console.log(
  `Total: ${totalPassed} passed, ${totalFailed} failed across ${files.length} file(s)`,
);
if (failedFiles > 0) {
  console.error(`${failedFiles} test file(s) failed`);
  process.exit(1);
}
