import test from 'node:test';
import assert from 'node:assert/strict';
import { parseProxyLine, parseProxyLines } from '../src/proxy/parse.js';

test('host:port', () => {
  const entry = parseProxyLine('203.0.113.10:8080', 0);
  assert.equal(entry.direct, false);
  assert.equal(entry.proxy.server, 'http://203.0.113.10:8080');
  assert.equal(entry.proxy.username, undefined);
  assert.equal(entry.proxy.password, undefined);
  assert.equal(entry.label, '203.0.113.10:8080');
});

test('host:port:user:pass', () => {
  const entry = parseProxyLine('203.0.113.11:8080:myuser:mypassword', 0);
  assert.equal(entry.proxy.server, 'http://203.0.113.11:8080');
  assert.equal(entry.proxy.username, 'myuser');
  assert.equal(entry.proxy.password, 'mypassword');
  assert.ok(!entry.label.includes('mypassword'));
});

test('user:pass@host:port', () => {
  const entry = parseProxyLine('myuser:mypassword@203.0.113.12:8080', 0);
  assert.equal(entry.proxy.username, 'myuser');
  assert.equal(entry.proxy.password, 'mypassword');
  assert.equal(entry.proxy.server, 'http://203.0.113.12:8080');
});

test('password chứa dấu hai chấm', () => {
  const entry = parseProxyLine('203.0.113.13:8080:user:pa:ss', 0);
  assert.equal(entry.proxy.username, 'user');
  assert.equal(entry.proxy.password, 'pa:ss');
});

test('password chứa dấu @', () => {
  const entry = parseProxyLine('user:p@ss@203.0.113.14:8080', 0);
  assert.equal(entry.proxy.username, 'user');
  assert.equal(entry.proxy.password, 'p@ss');
  assert.equal(entry.proxy.server, 'http://203.0.113.14:8080');
});

test('socks5 có auth', () => {
  const entry = parseProxyLine('socks5://user:pass@203.0.113.15:1080', 0);
  assert.equal(entry.proxy.server, 'socks5://203.0.113.15:1080');
  assert.equal(entry.proxy.username, 'user');
  assert.equal(entry.proxy.password, 'pass');
});

test('IPv6', () => {
  const entry = parseProxyLine('socks5://[::1]:1080', 0);
  assert.equal(entry.proxy.server, 'socks5://[::1]:1080');
});

test('http URL mã hóa ký tự đặc biệt', () => {
  const entry = parseProxyLine('http://user%40mail:p%40ss%3Aword@203.0.113.16:3128', 0);
  assert.equal(entry.proxy.username, 'user@mail');
  assert.equal(entry.proxy.password, 'p@ss:word');
});

test('direct', () => {
  const entry = parseProxyLine('direct', 0);
  assert.equal(entry.direct, true);
  assert.equal(entry.proxy, null);
});

test('bỏ qua dòng trống và ghi chú', () => {
  const { entries, errors } = parseProxyLines(`
# ghi chú
203.0.113.20:8000

  socks5://203.0.113.21:1080
`);
  assert.equal(errors.length, 0);
  assert.equal(entries.length, 2);
});

test('báo lỗi dòng sai', () => {
  const { entries, errors } = parseProxyLines('khong-co-port\nftp://203.0.113.22:21');
  assert.equal(entries.length, 0);
  assert.equal(errors.length, 2);
  assert.match(errors[0].message, /host:port/);
  assert.match(errors[1].message, /scheme/);
});

test('từ chối port ngoài phạm vi', () => {
  assert.throws(() => parseProxyLine('203.0.113.23:70000'), /host:port/);
});
