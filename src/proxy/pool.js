import fs from 'node:fs';
import { request } from 'playwright';
import { parseProxyLines } from './parse.js';
import { sleep, stripAnsi } from '../util/random.js';

function extractIp(text) {
  if (!text) return null;
  try {
    const data = JSON.parse(text);
    const ip = data.ip || data.query || data.origin;
    if (ip) return String(ip).split(',')[0].trim();
  } catch {
    // Không phải JSON, thử regex bên dưới.
  }
  const ipv4 = text.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/);
  if (ipv4) return ipv4[0];
  const ipv6 = text.match(/\b[0-9a-f]{1,4}(?::[0-9a-f]{1,4}){2,7}\b/i);
  return ipv6 ? ipv6[0] : null;
}

function trimError(error, max = 120) {
  const text = stripAnsi(error?.message || error || 'lỗi không rõ').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export class ProxyPool {
  constructor({ config, logger, signal }) {
    this.config = config;
    this.logger = logger;
    this.signal = signal;
    this.entries = [];
    this.geoCache = new Map();
    this.lastGeoRequestAt = 0;
  }

  load() {
    const file = this.config.paths.proxiesFile;
    if (!fs.existsSync(file)) {
      throw new Error(`Không thấy file proxy: ${file}`);
    }

    const text = fs.readFileSync(file, 'utf8');
    const { entries, errors } = parseProxyLines(text);

    for (const error of errors) {
      this.logger.warn(`Bỏ qua dòng ${error.line} trong proxies: ${error.message}`);
    }

    const seen = new Set();
    for (const entry of entries) {
      const key = entry.direct ? 'direct' : `${entry.proxy.server}|${entry.proxy.username || ''}`;
      if (seen.has(key)) {
        this.logger.debug(`Bỏ qua proxy trùng: ${entry.label}`);
        continue;
      }
      seen.add(key);
      entry.state = 'unknown';
      entry.failures = 0;
      entry.sessions = 0;
      entry.inUse = 0;
      entry.lastUsedAt = 0;
      entry.cooldownUntil = 0;
      entry.geo = null;
      entry.ip = null;
      this.entries.push(entry);
    }

    if (this.entries.length === 0) {
      throw new Error('File proxy không có dòng hợp lệ nào. Xem proxies.example.txt để biết định dạng.');
    }

    this.logger.info(`Đã nạp ${this.entries.length} proxy từ ${file}`);
    return this.entries;
  }

  async init() {
    if (this.config.proxy.checkOnStart) {
      await this.checkAll();
    } else {
      for (const entry of this.entries) entry.state = 'alive';
      this.logger.warn('proxy.checkOnStart = false: bỏ qua kiểm tra, dùng toàn bộ proxy trong file.');
    }
  }

  async checkAll() {
    const total = this.entries.length;
    const concurrency = Math.max(1, Math.min(this.config.proxy.checkConcurrency, total));
    this.logger.info(`Đang kiểm tra ${total} proxy (song song ${concurrency})...`);

    let cursor = 0;
    let completed = 0;

    const runner = async () => {
      while (true) {
        const index = cursor;
        cursor += 1;
        if (index >= total) return;
        await this.checkOne(this.entries[index]);
        completed += 1;
        this.logger.debug(`Đã kiểm tra ${completed}/${total} proxy`);
      }
    };

    await Promise.all(Array.from({ length: concurrency }, runner));

    if (this.config.proxy.geoLookup) {
      await this.lookupGeo();
    }

    const summary = this.summary();
    this.logger.info(
      `Kiểm tra xong: ${summary.alive} sống, ${summary.dead} chết${summary.direct ? `, ${summary.direct} direct` : ''}.`
    );
  }

  async checkOne(entry) {
    if (this.signal.stopped) return;

    const timeout = this.config.proxy.checkTimeoutMs;
    const attempts = Math.max(1, Math.floor(this.config.proxy.checkAttempts || 1));
    let lastError = null;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      let context = null;
      try {
        context = await request.newContext({
          proxy: entry.direct ? undefined : entry.proxy,
          ignoreHTTPSErrors: true,
          timeout
        });
        const response = await context.get(this.config.proxy.checkUrl, {
          timeout,
          failOnStatusCode: false
        });
        if (!response.ok()) {
          throw new Error(`HTTP ${response.status()}`);
        }
        const text = await response.text();
        entry.ip = extractIp(text);
        entry.state = 'alive';
        entry.checkedAt = Date.now();
        entry.failures = 0;
        entry.cooldownUntil = 0;
        entry.lastError = null;
        this.logger.success(`Proxy sống: ${entry.label}${entry.ip ? ` → IP ${entry.ip}` : ''}`);
        return;
      } catch (error) {
        lastError = error;
        if (attempt < attempts && !this.signal.stopped) {
          this.logger.debug(`Kiểm tra lại ${entry.label} (${attempt}/${attempts})...`);
          await sleep(1200);
        }
      } finally {
        if (context) await context.dispose().catch(() => {});
      }
    }

    entry.state = 'dead';
    entry.checkedAt = Date.now();
    entry.lastError = trimError(lastError);
    this.logger.warn(`Proxy chết: ${entry.label} — ${entry.lastError}`);
  }

  async lookupGeo() {
    const alive = this.entries.filter((entry) => entry.state === 'alive' && !entry.direct && entry.ip);
    const ips = [...new Set(alive.map((entry) => entry.ip))];
    if (ips.length === 0) return;

    this.logger.info(`Đang lấy thông tin quốc gia cho ${ips.length} IP...`);

    for (let offset = 0; offset < ips.length; offset += 100) {
      const chunk = ips.slice(offset, offset + 100);
      const waitMs = 1600 - (Date.now() - this.lastGeoRequestAt);
      if (waitMs > 0) await sleep(waitMs);
      this.lastGeoRequestAt = Date.now();

      try {
        const response = await fetch('http://ip-api.com/batch?fields=status,message,country,countryCode,timezone,query', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(chunk),
          signal: AbortSignal.timeout(20000)
        });
        if (!response.ok) throw new Error(`HTTP ${response.status()}`);
        const data = await response.json();
        if (!Array.isArray(data)) throw new Error('phản hồi không phải mảng');
        for (const item of data) {
          if (item?.status === 'success' && item.query) {
            this.geoCache.set(item.query, {
              country: item.country || null,
              countryCode: item.countryCode || null,
              timezone: item.timezone || null
            });
          }
        }
      } catch (error) {
        this.logger.warn(`Không lấy được geo từ ip-api.com: ${trimError(error)}`);
        break;
      }
    }

    for (const entry of alive) {
      entry.geo = this.geoCache.get(entry.ip) || null;
    }

    const withGeo = alive.filter((entry) => entry.geo?.countryCode).length;
    this.logger.info(`Đã có geo cho ${withGeo}/${alive.length} proxy.`);
  }

  refreshCooldowns() {
    const now = Date.now();
    for (const entry of this.entries) {
      if (entry.cooldownUntil && entry.cooldownUntil <= now) {
        entry.cooldownUntil = 0;
        entry.failures = 0;
      }
    }
  }

  availability() {
    this.refreshCooldowns();
    const now = Date.now();
    const usable = this.entries.filter((entry) => entry.state === 'alive' && !entry.cooldownUntil);
    const cooling = this.entries.filter((entry) => entry.state === 'alive' && entry.cooldownUntil > now);
    const dead = this.entries.filter((entry) => entry.state === 'dead');
    const nextAvailableInMs = cooling.length
      ? Math.min(...cooling.map((entry) => entry.cooldownUntil - now))
      : 0;
    return {
      total: this.entries.length,
      usable: usable.length,
      cooling: cooling.length,
      dead: dead.length,
      nextAvailableInMs
    };
  }

  acquire({ exclude = [] } = {}) {
    this.refreshCooldowns();
    const candidates = this.entries.filter((entry) => entry.state === 'alive' && !entry.cooldownUntil);
    if (candidates.length === 0) return null;

    const notExcluded = candidates.filter((entry) => !exclude.includes(entry.id));
    const pool = notExcluded.length ? notExcluded : candidates;

    const free = pool.filter((entry) => entry.inUse === 0);
    const usable = free.length ? free : pool;

    usable.sort((a, b) => (a.lastUsedAt || 0) - (b.lastUsedAt || 0));
    const shortest = usable.slice(0, Math.min(3, usable.length));
    const entry = shortest[Math.floor(Math.random() * shortest.length)];

    entry.inUse += 1;
    entry.lastUsedAt = Date.now();
    entry.sessions += 1;
    return entry;
  }

  release(entry) {
    if (!entry) return;
    entry.inUse = Math.max(0, entry.inUse - 1);
  }

  markSuccess(entry) {
    if (!entry || entry.direct) return;
    entry.failures = 0;
    entry.lastError = null;
    entry.state = 'alive';
  }

  markFailure(entry, reason) {
    if (!entry || entry.direct) return;
    entry.failures = (entry.failures || 0) + 1;
    entry.lastError = trimError(reason);
    if (entry.failures >= this.config.proxy.maxFailures) {
      entry.cooldownUntil = Date.now() + this.config.proxy.cooldownMinutes * 60000;
      entry.failures = 0;
      this.logger.warn(
        `Proxy ${entry.label} lỗi ${this.config.proxy.maxFailures} lần, tạm nghỉ ${this.config.proxy.cooldownMinutes} phút.`
      );
    }
  }

  summary() {
    this.refreshCooldowns();
    const now = Date.now();
    return {
      total: this.entries.length,
      alive: this.entries.filter((entry) => entry.state === 'alive' && !entry.cooldownUntil).length,
      dead: this.entries.filter((entry) => entry.state === 'dead').length,
      cooling: this.entries.filter((entry) => entry.state === 'alive' && entry.cooldownUntil > now).length,
      direct: this.entries.filter((entry) => entry.direct).length
    };
  }

  formatTable() {
    const rows = [
      ['ID', 'PROXY', 'IP', 'COUNTRY', 'STATUS', 'GHI CHÚ']
    ];

    for (const entry of this.entries) {
      let status = 'OK';
      if (entry.state === 'dead') status = 'DEAD';
      else if (entry.cooldownUntil > Date.now()) {
        const minutes = Math.ceil((entry.cooldownUntil - Date.now()) / 60000);
        status = `COOLDOWN ${minutes}m`;
      } else if (entry.state === 'unknown') status = 'CHƯA CHECK';

      rows.push([
        entry.id,
        entry.label,
        entry.ip || '-',
        entry.geo?.countryCode || '-',
        status,
        entry.lastError || ''
      ]);
    }

    const widths = rows[0].map((_, column) =>
      Math.min(48, Math.max(...rows.map((row) => String(row[column]).length)))
    );

    return rows
      .map((row) =>
        row
          .map((cell, column) => {
            const text = String(cell);
            const clipped = text.length > widths[column] ? `${text.slice(0, widths[column] - 1)}…` : text;
            return clipped.padEnd(widths[column]);
          })
          .join('  ')
      )
      .join('\n');
  }
}
