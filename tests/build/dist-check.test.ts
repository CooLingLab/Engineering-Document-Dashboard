// @vitest-environment node
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

describe('static build safety check', () => {
  it('accepts ordinary assets and rejects a synthetic private marker', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dashboard-dist-'));
    try {
      mkdirSync(join(dir, 'assets'));
      writeFileSync(join(dir, 'index.html'), '<!doctype html><div id="root"></div>');
      writeFileSync(join(dir, 'assets', 'app.js'), 'console.log("hello")');
      const run = () => spawnSync(process.execPath, ['scripts/check-dist.mjs', dir], { encoding: 'utf8' });
      expect(run().status).toBe(0);
      writeFileSync(join(dir, 'assets', 'app.js'), 'synthetic-private-token');
      expect(run().status).not.toBe(0);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
