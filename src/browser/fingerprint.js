import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { pick } from '../util/random.js';

const COUNTRY_LOCALE = {
  VN: 'vi-VN',
  US: 'en-US',
  GB: 'en-GB',
  AU: 'en-AU',
  CA: 'en-CA',
  NZ: 'en-NZ',
  IE: 'en-IE',
  SG: 'en-SG',
  MY: 'ms-MY',
  PH: 'en-PH',
  IN: 'en-IN',
  ID: 'id-ID',
  TH: 'th-TH',
  JP: 'ja-JP',
  KR: 'ko-KR',
  CN: 'zh-CN',
  TW: 'zh-TW',
  HK: 'zh-HK',
  DE: 'de-DE',
  FR: 'fr-FR',
  ES: 'es-ES',
  IT: 'it-IT',
  NL: 'nl-NL',
  PL: 'pl-PL',
  PT: 'pt-PT',
  BR: 'pt-BR',
  RU: 'ru-RU',
  TR: 'tr-TR',
  AE: 'ar-AE',
  SA: 'ar-SA',
  EG: 'ar-EG',
  IL: 'he-IL',
  MX: 'es-MX',
  AR: 'es-AR',
  CL: 'es-CL',
  ZA: 'en-ZA'
};

const COUNTRY_TIMEZONE = {
  VN: 'Asia/Ho_Chi_Minh',
  US: 'America/New_York',
  GB: 'Europe/London',
  AU: 'Australia/Sydney',
  CA: 'America/Toronto',
  SG: 'Asia/Singapore',
  MY: 'Asia/Kuala_Lumpur',
  PH: 'Asia/Manila',
  IN: 'Asia/Kolkata',
  ID: 'Asia/Jakarta',
  TH: 'Asia/Bangkok',
  JP: 'Asia/Tokyo',
  KR: 'Asia/Seoul',
  CN: 'Asia/Shanghai',
  TW: 'Asia/Taipei',
  HK: 'Asia/Hong_Kong',
  DE: 'Europe/Berlin',
  FR: 'Europe/Paris',
  ES: 'Europe/Madrid',
  IT: 'Europe/Rome',
  NL: 'Europe/Amsterdam',
  PL: 'Europe/Warsaw',
  PT: 'Europe/Lisbon',
  BR: 'America/Sao_Paulo',
  RU: 'Europe/Moscow',
  TR: 'Europe/Istanbul',
  AE: 'Asia/Dubai',
  SA: 'Asia/Riyadh',
  EG: 'Africa/Cairo',
  IL: 'Asia/Jerusalem',
  MX: 'America/Mexico_City',
  AR: 'America/Argentina/Buenos_Aires',
  CL: 'America/Santiago',
  ZA: 'Africa/Johannesburg'
};

function buildUserAgent(major) {
  return `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Safari/537.36`;
}

export async function detectChromiumMajor() {
  let browser = null;
  try {
    browser = await chromium.launch({ headless: true });
    const version = browser.version();
    const major = Number.parseInt(version.split('.')[0], 10);
    return Number.isFinite(major) ? major : 131;
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

export function ensureFingerprint(file, chromeMajor) {
  let fingerprint = null;
  try {
    fingerprint = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    fingerprint = null;
  }

  if (!fingerprint || !fingerprint.userAgent || !fingerprint.viewport) {
    fingerprint = {
      userAgent: buildUserAgent(chromeMajor),
      viewport: {
        width: pick([1280, 1366, 1440, 1536]),
        height: pick([720, 768, 800, 864])
      },
      deviceScaleFactor: 1,
      hardwareConcurrency: pick([4, 8, 8, 12, 16]),
      deviceMemory: pick([4, 8, 8, 8, 16]),
      createdAt: new Date().toISOString()
    };
  } else {
    const versionMatch = fingerprint.userAgent.match(/Chrome\/(\d+)\./);
    if (versionMatch && Number(versionMatch[1]) !== chromeMajor) {
      fingerprint.userAgent = fingerprint.userAgent.replace(/Chrome\/\d+\./, `Chrome/${chromeMajor}.`);
    }
  }

  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(fingerprint, null, 2)}\n`);
  return fingerprint;
}

export function resolveLocale(geo, config) {
  if (!geo) {
    return {
      locale: config.browser.defaultLocale,
      timezone: config.browser.defaultTimezone,
      country: null,
      countryName: null
    };
  }

  const countryCode = geo.countryCode || null;
  return {
    locale: COUNTRY_LOCALE[countryCode] || 'en-US',
    timezone: geo.timezone || COUNTRY_TIMEZONE[countryCode] || config.browser.defaultTimezone,
    country: countryCode,
    countryName: geo.country || null
  };
}

export function languageList(locale) {
  const base = locale.split('-')[0];
  const languages = [locale];
  if (base && base !== locale) languages.push(base);
  if (!languages.includes('en-US')) languages.push('en-US');
  if (!languages.includes('en')) languages.push('en');
  return [...new Set(languages)];
}

export function buildInitScript(languages, hardwareConcurrency, deviceMemory) {
  return `(() => {
  try {
    Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => undefined, configurable: true });
  } catch (e) {}
  try {
    Object.defineProperty(Navigator.prototype, 'languages', { get: () => ${JSON.stringify(languages)}, configurable: true });
  } catch (e) {}
  try {
    Object.defineProperty(Navigator.prototype, 'hardwareConcurrency', { get: () => ${hardwareConcurrency}, configurable: true });
  } catch (e) {}
  try {
    Object.defineProperty(Navigator.prototype, 'deviceMemory', { get: () => ${deviceMemory}, configurable: true });
  } catch (e) {}
  if (!window.chrome) window.chrome = {};
  if (!window.chrome.runtime) window.chrome.runtime = {};
})();`;
}
