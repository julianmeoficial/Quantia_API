#!/usr/bin/env node
/**
 * Fail CI when npm audit reports high/critical on *direct* dependencies
 * (dependencies + devDependencies in package.json). Transitives are tracked
 * via Dependabot but do not block the pipeline (ENG-132 / S6 policy).
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

const direct = new Set([
  ...Object.keys(pkg.dependencies ?? {}),
  ...Object.keys(pkg.devDependencies ?? {}),
]);

/** @type {{ vulnerabilities?: Record<string, { severity?: string; via?: unknown[]; effects?: string[] }> } } */
let report;
try {
  const raw = execFileSync('npm', ['audit', '--json', '--omit=peer'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  });
  report = JSON.parse(raw);
} catch (error) {
  // npm audit exits non-zero when vulns exist; stdout still has JSON.
  const err = /** @type {{ stdout?: string; message?: string }} */ (error);
  if (err.stdout) {
    report = JSON.parse(err.stdout);
  } else {
    console.error('npm audit failed without JSON output:', err.message);
    process.exit(2);
  }
}

const blocking = [];
for (const [name, vuln] of Object.entries(report.vulnerabilities ?? {})) {
  const severity = (vuln.severity ?? '').toLowerCase();
  if (severity !== 'high' && severity !== 'critical') {
    continue;
  }
  if (!direct.has(name)) {
    continue;
  }
  blocking.push({ name, severity });
}

if (blocking.length === 0) {
  console.log(
    'audit:ci OK — no high/critical vulnerabilities in direct dependencies',
  );
  process.exit(0);
}

console.error('audit:ci FAILED — direct dependency vulnerabilities:');
for (const item of blocking) {
  console.error(`  - ${item.name} (${item.severity})`);
}
process.exit(1);
