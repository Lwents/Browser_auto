import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const DEFAULT_CONFIG = {
  browser: {
    headless: false,
    profileMode: 'persistent',
    profilesDir: 'data/profiles',
    dataDir: 'data',
    logDir: 'logs',
    defaultLocale: 'vi-VN',
    defaultTimezone: 'Asia/Ho_Chi_Minh',
    navigationTimeoutMs: 45000,
    actionTimeoutMs: 20000,
    slowMoMs: 0,
    viewport: {
      widthMin: 1280,
      widthMax: 1536,
      heightMin: 720,
      heightMax: 864
    },
    closePopups: true,
    extraArgs: []
  },
  pool: {
    concurrency: 3,
    sessionMinutes: { min: 8, max: 15 },
    idleBetweenSessionsSeconds: { min: 15, max: 45 },
    sitesPerSession: { min: 2, max: 5 },
    maxCyclesPerWorker: 0,
    recentProxyMemory: 3
  },
  proxy: {
    file: 'proxies.txt',
    checkOnStart: true,
    checkUrl: 'https://api.ipify.org?format=json',
    checkTimeoutMs: 20000,
    checkConcurrency: 3,
    checkAttempts: 2,
    maxFailures: 3,
    cooldownMinutes: 15,
    geoLookup: true
  },
  behavior: {
    clickLinkChance: 0.75,
    readSeconds: { min: 35, max: 100 },
    shortReadSeconds: { min: 15, max: 40 },
    idleBreakChance: 0.2,
    idleBreakSeconds: { min: 10, max: 30 },
    dismissOverlays: true
  },
  sites: {
    categories: {
      news: {
        weight: 45,
        behavior: 'news',
        sites: [
          { name: 'VnExpress', url: 'https://vnexpress.net/' },
          { name: 'Dân trí', url: 'https://dantri.com.vn/' },
          { name: 'Tuổi Trẻ', url: 'https://tuoitre.vn/' },
          { name: 'Thanh Niên', url: 'https://thanhnien.vn/' },
          { name: 'Nhân Dân', url: 'https://nhandan.vn/' },
          { name: 'VietnamNet', url: 'https://vietnamnet.vn/' },
          { name: 'Kenh14', url: 'https://kenh14.vn/' },
          { name: 'Soha', url: 'https://soha.vn/' }
        ]
      },
      shopping: {
        weight: 40,
        behavior: 'shopping',
        sites: [
          { name: 'Shopee', url: 'https://shopee.vn/' },
          { name: 'Tiki', url: 'https://tiki.vn/' },
          { name: 'Lazada', url: 'https://www.lazada.vn/' },
          { name: 'Thế Giới Di Động', url: 'https://www.thegioididong.com/' },
          { name: 'CellphoneS', url: 'https://cellphones.com.vn/' },
          { name: 'FPT Shop', url: 'https://fptshop.com.vn/' },
          { name: 'Nguyễn Kim', url: 'https://www.nguyenkim.com/' },
          { name: 'Điện Máy Xanh', url: 'https://www.dienmayxanh.com/' }
        ]
      },
      tech: {
        weight: 15,
        behavior: 'news',
        sites: [
          { name: 'GenK', url: 'https://genk.vn/' },
          { name: 'Tinh Tế', url: 'https://tinhte.vn/' },
          { name: 'Quản Trị Mạng', url: 'https://quantrimang.com/' },
          { name: 'GameK', url: 'https://gamek.vn/' }
        ]
      }
    }
  }
};

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function deepMerge(base, override) {
  if (!isPlainObject(override)) return override === undefined ? base : override;
  const result = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (isPlainObject(value) && isPlainObject(base?.[key])) {
      result[key] = deepMerge(base[key], value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

function resolvePath(value, base = ROOT) {
  return path.isAbsolute(value) ? value : path.resolve(base, value);
}

function assertRange(value, name, { allowZero = false } = {}) {
  if (!isPlainObject(value) || typeof value.min !== 'number' || typeof value.max !== 'number') {
    throw new Error(`Cấu hình "${name}" phải có dạng {"min": số, "max": số}.`);
  }
  if (value.min < 0 || value.max < 0 || (!allowZero && value.min === 0 && value.max === 0)) {
    throw new Error(`Cấu hình "${name}" không hợp lệ: ${value.min} - ${value.max}.`);
  }
  if (value.min > value.max) {
    throw new Error(`Cấu hình "${name}": min (${value.min}) phải nhỏ hơn hoặc bằng max (${value.max}).`);
  }
}

function normalizeConfig(config) {
  const browser = config.browser;
  const pool = config.pool;

  if (!['persistent', 'ephemeral'].includes(browser.profileMode)) {
    throw new Error('browser.profileMode chỉ nhận "persistent" hoặc "ephemeral".');
  }

  pool.concurrency = Math.round(Number(pool.concurrency));
  if (!Number.isFinite(pool.concurrency) || pool.concurrency < 1 || pool.concurrency > 20) {
    throw new Error('pool.concurrency phải là số nguyên từ 1 đến 20.');
  }

  assertRange(pool.sessionMinutes, 'pool.sessionMinutes');
  assertRange(pool.idleBetweenSessionsSeconds, 'pool.idleBetweenSessionsSeconds', { allowZero: true });
  assertRange(pool.sitesPerSession, 'pool.sitesPerSession');
  const viewport = browser.viewport;
  if (
    !viewport ||
    !['widthMin', 'widthMax', 'heightMin', 'heightMax'].every((key) => Number.isFinite(viewport[key]))
  ) {
    throw new Error('browser.viewport phải có widthMin, widthMax, heightMin, heightMax.');
  }
  if (viewport.widthMin > viewport.widthMax || viewport.heightMin > viewport.heightMax) {
    throw new Error('browser.viewport: giá trị min phải nhỏ hơn hoặc bằng max.');
  }
  assertRange(config.behavior.readSeconds, 'behavior.readSeconds');
  assertRange(config.behavior.shortReadSeconds, 'behavior.shortReadSeconds');
  assertRange(config.behavior.idleBreakSeconds, 'behavior.idleBreakSeconds', { allowZero: true });

  if (!Number.isFinite(pool.maxCyclesPerWorker) || pool.maxCyclesPerWorker < 0) {
    throw new Error('pool.maxCyclesPerWorker phải >= 0 (0 = chạy mãi).');
  }
  if (!Number.isFinite(config.proxy.checkTimeoutMs) || config.proxy.checkTimeoutMs < 1000) {
    throw new Error('proxy.checkTimeoutMs phải >= 1000.');
  }
  if (!Number.isFinite(config.proxy.checkConcurrency) || config.proxy.checkConcurrency < 1) {
    throw new Error('proxy.checkConcurrency phải >= 1.');
  }
  if (!Number.isFinite(config.proxy.checkAttempts) || config.proxy.checkAttempts < 1) {
    throw new Error('proxy.checkAttempts phải >= 1.');
  }

  const categories = config.sites?.categories;
  if (!isPlainObject(categories) || Object.keys(categories).length === 0) {
    throw new Error('sites.categories phải có ít nhất một nhóm website.');
  }
  for (const [name, category] of Object.entries(categories)) {
    if (!Array.isArray(category.sites) || category.sites.length === 0) {
      throw new Error(`Nhóm website "${name}" chưa có danh sách sites.`);
    }
    if (!['news', 'shopping', 'generic'].includes(category.behavior || 'generic')) {
      throw new Error(`Nhóm "${name}": behavior chỉ nhận news, shopping hoặc generic.`);
    }
    category.weight = Number(category.weight) > 0 ? Number(category.weight) : 1;
    category.behavior = category.behavior || 'generic';
    for (const site of category.sites) {
      if (!site?.url || !/^https?:\/\//i.test(site.url)) {
        throw new Error(`Nhóm "${name}" có site thiếu url http(s) hợp lệ.`);
      }
      site.name = site.name || new URL(site.url).hostname;
    }
  }

  if (!Object.values(categories).some((category) => category.enabled !== false)) {
    throw new Error('Cần bật ít nhất một nhóm website trong sites.categories.');
  }

  config.paths = {
    root: ROOT,
    configFile: config._configFile || path.join(ROOT, 'config.json'),
    proxiesFile: resolvePath(config.proxy.file),
    dataDir: resolvePath(browser.dataDir),
    profilesDir: resolvePath(browser.profilesDir),
    logDir: resolvePath(browser.logDir)
  };

  return config;
}

export function loadConfig({ configPath, overrides = {} } = {}) {
  const file = path.resolve(configPath || path.join(ROOT, 'config.json'));
  let userConfig = {};
  if (fs.existsSync(file)) {
    try {
      userConfig = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (error) {
      throw new Error(`Không đọc được ${file}: ${error.message}`);
    }
  }

  const config = deepMerge(structuredClone(DEFAULT_CONFIG), userConfig);
  config._configFile = file;

  if (overrides.headless !== null && overrides.headless !== undefined) {
    config.browser.headless = Boolean(overrides.headless);
  }
  if (overrides.concurrency !== null && overrides.concurrency !== undefined) {
    config.pool.concurrency = overrides.concurrency;
  }
  if (overrides.proxyFile) {
    config.proxy.file = overrides.proxyFile;
  }
  if (overrides.maxCycles !== null && overrides.maxCycles !== undefined) {
    config.pool.maxCyclesPerWorker = overrides.maxCycles;
  }
  if (overrides.sitesPerSessionMax !== null && overrides.sitesPerSessionMax !== undefined) {
    config.pool.sitesPerSession.max = overrides.sitesPerSessionMax;
  }

  return normalizeConfig(config);
}
