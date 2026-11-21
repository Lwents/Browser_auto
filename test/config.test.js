import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadConfig, ROOT } from '../src/config.js';

test('config mặc định có đủ nhóm website', () => {
  const config = loadConfig({ configPath: path.join(ROOT, 'khong-ton-tai.json') });
  assert.ok(config.sites.categories.news.sites.length > 0);
  assert.ok(config.sites.categories.shopping.sites.length > 0);
  assert.equal(config.pool.concurrency, 3);
  assert.equal(config.browser.profileMode, 'persistent');
});

test('override số worker và headless', () => {
  const config = loadConfig({
    configPath: path.join(ROOT, 'khong-ton-tai.json'),
    overrides: { concurrency: 5, headless: true, maxCycles: 1 }
  });
  assert.equal(config.pool.concurrency, 5);
  assert.equal(config.browser.headless, true);
  assert.equal(config.pool.maxCyclesPerWorker, 1);
});

test('từ chối concurrency sai', () => {
  assert.throws(
    () =>
      loadConfig({
        configPath: path.join(ROOT, 'khong-ton-tai.json'),
        overrides: { concurrency: 0 }
      }),
    /concurrency/
  );
});

test('từ chối prototype pollution trong config', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'browser-auto-'));
  const file = path.join(dir, 'config.json');
  fs.writeFileSync(file, '{"__proto__":{"polluted":true}}');
  try {
    assert.throws(() => loadConfig({ configPath: file }), /__proto__/);
    assert.equal({}.polluted, undefined);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
