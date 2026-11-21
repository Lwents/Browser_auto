import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { createLogger } from '../logger.js';
import { chance, pick, randomBetween, shortError } from '../util/random.js';
import { buildInitScript, ensureFingerprint, languageList, resolveLocale } from './fingerprint.js';
import { idleBreak, pause } from './human.js';
import { browseSite, pickCategory } from './sites.js';

const PROXY_ERROR_PATTERN =
  /(ERR_PROXY|ERR_TUNNEL|ERR_PROXY_AUTH|ERR_NO_SUPPORTED_PROXIES|ERR_INTERNET_DISCONNECTED|ERR_NAME_NOT_RESOLVED|ECONNREFUSED|ECONNRESET|ETIMEDOUT|HTTP 407|407 Proxy)/i;

export class NoProxyAvailableError extends Error {
  constructor(message) {
    super(message);
    this.name = 'NoProxyAvailableError';
  }
}

function isProxyError(message) {
  return PROXY_ERROR_PATTERN.test(String(message || ''));
}

function acceptLanguage(languages) {
  return languages
    .map((language, index) => (index === 0 ? language : `${language};q=${Math.max(0.3, 1 - index * 0.1).toFixed(1)}`))
    .join(',');
}

export class BrowserWorker {
  constructor({ id, config, pool, signal, stats, chromeMajor }) {
    this.id = id;
    this.config = config;
    this.pool = pool;
    this.signal = signal;
    this.stats = stats;
    this.chromeMajor = chromeMajor;
    this.log = createLogger(`w${id}`);
    this.profileDir = path.join(config.paths.profilesDir, `w${id}`);
    this.fingerprintFile = path.join(config.paths.dataDir, 'workers', `w${id}.json`);
    this.recentProxies = [];
    this.cycles = 0;
    this.activeSession = null;
  }

  async run() {
    this.log.info(`sẵn sàng — profile: ${this.profileDir}`);

    while (!this.signal.stopped) {
      const proxy = this.pool.acquire({ exclude: this.recentProxies });

      if (!proxy) {
        const availability = this.pool.availability();
        if (availability.cooling > 0) {
          const waitMs = Math.min(availability.nextAvailableInMs + 1000, 60000);
          this.log.warn(`chưa có proxy rảnh, chờ ${Math.ceil(waitMs / 1000)}s...`);
          await this.signal.sleep(waitMs);
          continue;
        }
        this.signal.stop();
        throw new NoProxyAvailableError(
          'Không còn proxy khả dụng. Kiểm tra lại proxies.txt hoặc tăng proxy.cooldownMinutes.'
        );
      }

      this.stats.proxiesUsed.add(proxy.id);
      let session = null;
      let sessionOpened = false;
      let sessionOk = false;
      let failureReason = null;

      try {
        session = await this.openSession(proxy);
        sessionOpened = true;
        const result = await this.browseSession(session, proxy);
        sessionOk = result.pages > 0;
      } catch (error) {
        if (this.signal.stopped) break;
        failureReason = shortError(error);
        this.stats.errors += 1;
        this.log.error(`phiên thất bại: ${failureReason}`);
        if (/Executable doesn't exist|please run the following command/i.test(failureReason)) {
          throw error;
        }
      } finally {
        await this.closeSession(session);
        this.pool.release(proxy);
      }

      if (sessionOk) {
        this.pool.markSuccess(proxy);
      } else if (sessionOpened && !proxy.direct) {
        this.pool.markFailure(proxy, failureReason || 'không mở được trang nào');
      }

      this.recentProxies = [proxy.id, ...this.recentProxies.filter((id) => id !== proxy.id)].slice(
        0,
        Math.max(1, this.config.pool.recentProxyMemory)
      );

      this.cycles += 1;
      if (this.config.pool.maxCyclesPerWorker > 0 && this.cycles >= this.config.pool.maxCyclesPerWorker) {
        this.log.info(`đã đủ ${this.cycles} chu kỳ, dừng worker.`);
        break;
      }

      if (!this.signal.stopped) {
        const waitSeconds = randomBetween(this.config.pool.idleBetweenSessionsSeconds, false);
        this.log.info(`nghỉ ${Math.round(waitSeconds)}s trước phiên tiếp theo.`);
        await this.signal.sleep(waitSeconds * 1000);
      }
    }

    this.log.info('worker đã dừng.');
  }

  async openSession(proxy) {
    const fingerprint = ensureFingerprint(this.fingerprintFile, this.chromeMajor);
    const localeInfo = resolveLocale(proxy.geo, this.config);
    const languages = languageList(localeInfo.locale);
    const initScript = buildInitScript(
      languages,
      fingerprint.hardwareConcurrency,
      fingerprint.deviceMemory
    );

    const contextOptions = {
      proxy: proxy.direct ? undefined : proxy.proxy,
      userAgent: fingerprint.userAgent,
      viewport: fingerprint.viewport,
      locale: localeInfo.locale,
      timezoneId: localeInfo.timezone,
      colorScheme: 'light',
      deviceScaleFactor: fingerprint.deviceScaleFactor,
      acceptDownloads: false,
      extraHTTPHeaders: {
        'Accept-Language': acceptLanguage(languages)
      }
    };

    const launchOptions = {
      headless: this.config.browser.headless,
      slowMo: this.config.browser.slowMoMs,
      ignoreDefaultArgs: ['--enable-automation'],
      args: [
        '--disable-blink-features=AutomationControlled',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-notifications',
        '--lang=' + localeInfo.locale,
        ...this.config.browser.extraArgs
      ]
    };

    let browser = null;
    let context = null;

    if (this.config.browser.profileMode === 'persistent') {
      fs.mkdirSync(this.profileDir, { recursive: true });
      context = await chromium.launchPersistentContext(this.profileDir, {
        ...launchOptions,
        ...contextOptions
      });
    } else {
      browser = await chromium.launch(launchOptions);
      context = await browser.newContext(contextOptions);
    }

    context.setDefaultTimeout(this.config.browser.actionTimeoutMs);
    context.setDefaultNavigationTimeout(this.config.browser.navigationTimeoutMs);
    await context.addInitScript(initScript);

    const page = context.pages()[0] || (await context.newPage());
    await page.addInitScript(initScript).catch(() => {});
    page.on('dialog', (dialog) => dialog.dismiss().catch(() => {}));
    page.on('pageerror', (error) => this.log.debug(`pageerror: ${shortError(error)}`));

    context.on('page', (extraPage) => {
      if (extraPage === page || !this.config.browser.closePopups) return;
      setTimeout(() => {
        if (extraPage !== page) extraPage.close().catch(() => {});
      }, 12000).unref();
    });

    this.log.debug(
      `mở trình duyệt: locale=${localeInfo.locale}, timezone=${localeInfo.timezone}, profile=${this.config.browser.profileMode}`
    );

    const session = {
      context,
      browser,
      page,
      proxy,
      localeInfo,
      startedAt: Date.now()
    };
    this.activeSession = session;
    return session;
  }

  async browseSession(session, proxy) {
    const { page } = session;
    const minutes = randomBetween(this.config.pool.sessionMinutes, false);
    const deadline = Date.now() + minutes * 60000;
    const targetSites = randomBetween(this.config.pool.sitesPerSession);
    const sessionStats = { pages: 0, clicks: 0 };

    let visited = 0;
    let consecutiveErrors = 0;

    const geo = proxy.geo?.countryCode ? `, ${proxy.geo.countryCode}` : '';
    this.log.info(
      `phiên ${minutes.toFixed(1)} phút | ${proxy.label}${proxy.ip ? ` | IP ${proxy.ip}${geo}` : ''}`
    );

    try {
      while (!this.signal.stopped && Date.now() < deadline && visited < targetSites) {
        const category = pickCategory(this.config);
        const site = pick(category.sites);

        try {
          await browseSite({
            page,
            category,
            site,
            config: this.config,
            logger: this.log,
            signal: this.signal,
            deadline,
            stats: sessionStats
          });
          visited += 1;
          consecutiveErrors = 0;

          if (Date.now() < deadline - 30000 && !this.signal.stopped) {
            await pause(3000, 9000, this.signal);
            if (chance(this.config.behavior.idleBreakChance)) {
              const idleSeconds = randomBetween(this.config.behavior.idleBreakSeconds, false);
              this.log.debug(`nghỉ tại chỗ ${Math.round(idleSeconds)}s`);
              await idleBreak(page, { durationMs: idleSeconds * 1000, signal: this.signal });
            }
          }
        } catch (error) {
          if (this.signal.stopped) break;
          consecutiveErrors += 1;
          this.stats.errors += 1;
          const message = shortError(error);
          this.log.warn(`lỗi tại ${site.name}: ${message}`);

          if (isProxyError(message)) {
            throw new Error(`proxy không phản hồi (${proxy.label}): ${message}`);
          }
          if (consecutiveErrors >= 3) {
            throw new Error(`3 lỗi liên tiếp, đổi proxy: ${message}`);
          }
          await pause(2000, 5000, this.signal);
        }
      }
    } finally {
      this.stats.pages += sessionStats.pages;
      this.stats.clicks += sessionStats.clicks;
    }

    const pages = sessionStats.pages;
    const clicks = sessionStats.clicks;
    const duration = ((Date.now() - session.startedAt) / 60000).toFixed(1);

    if (pages > 0) {
      this.stats.sessions += 1;
      this.log.success(`xong phiên ${duration} phút — ${pages} trang, ${clicks} click, ${visited} website`);
      this.log.event('session_end', {
        proxy: proxy.label,
        ip: proxy.ip,
        country: proxy.geo?.countryCode || null,
        minutes: Number(duration),
        pages,
        clicks,
        sites: visited
      });
    } else {
      this.log.warn(`phiên ${duration} phút không mở được trang nào.`);
    }

    return { pages, clicks, visited };
  }

  async closeSession(session) {
    if (this.activeSession === session) this.activeSession = null;
    if (!session) return;
    try {
      await session.context.close();
    } catch {
      // Context có thể đã bị đóng do lỗi trình duyệt.
    }
    if (session.browser) {
      await session.browser.close().catch(() => {});
    }
  }

  async abort() {
    const session = this.activeSession;
    if (!session) return;
    await session.context.close().catch(() => {});
  }
}
