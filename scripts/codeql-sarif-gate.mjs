#!/usr/bin/env node
/**
 * Fail CI when CodeQL SARIF contains any security finding (ENG-132).
 * Used when GitHub code scanning upload is unavailable (private repo without GHAS).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2];
if (!dir) {
  console.error('Usage: node scripts/codeql-sarif-gate.mjs <sarif-dir>');
  process.exit(2);
}

const files = readdirSync(dir).filter((f) => f.endsWith('.sarif'));
if (files.length === 0) {
  console.error(`No SARIF files in ${dir}`);
  process.exit(2);
}

const findings = [];
for (const file of files) {
  const sarif = JSON.parse(readFileSync(join(dir, file), 'utf8'));
  for (const run of sarif.runs ?? []) {
    for (const result of run.results ?? []) {
      const level = (result.level ?? 'warning').toLowerCase();
      const rule = result.ruleId ?? 'unknown';
      const msg =
        result.message?.text ??
        result.message?.markdown ??
        '(no message)';
      const loc =
        result.locations?.[0]?.physicalLocation?.artifactLocation?.uri ??
        'unknown';
      findings.push({ file, level, rule, msg, loc });
    }
  }
}

if (findings.length === 0) {
  console.log('codeql-sarif-gate OK — no findings');
  process.exit(0);
}

console.error(`codeql-sarif-gate FAILED — ${findings.length} finding(s):`);
for (const f of findings) {
  console.error(`  [${f.level}] ${f.rule} @ ${f.loc}: ${f.msg}`);
}
process.exit(1);
