#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { loadConfig, ROOT } from './config.js';
import { closeLogger, createLogger, getLogFile, initLogger } from './logger.js';
import { ProxyPool } from './proxy/pool.js';
import { BrowserWorker, NoProxyAvailableError } from './browser/worker.js';
import { detectChromiumMajor } from './browser/fingerprint.js';
import { StopSignal } from './util/stop.js';

function printHelp() {
  console.log(`
Browser Auto — mỗi cửa sổ một proxy, lướt web như người thật, tự xoay proxy.

Cách dùng:
  node src/index.js [tùy chọn]

Tùy chọn:
  -c, --config <file>       File cấu hình (mặc định: config.json)
  -w, --workers <n>         Số cửa sổ chạy song song (mặc định theo config)
      --session <a-b>       Thời gian mỗi phiên, phút (vd: 8-15)
      --sites <a-b>         Số website mỗi phiên (vd: 2-5)
      --headless            Chạy ẩn, không hiện cửa sổ
      --headed              Hiện cửa sổ (mặc định)
      --once                Mỗi worker chạy đúng 1 phiên rồi dừng
      --check-proxies       Chỉ kiểm tra proxy rồi thoát
      --proxy-file <file>   Dùng file proxy khác trong config
      --reset-profiles      Xóa profile/cookie cũ trước khi chạy
      --debug               Ghi log chi tiết
  -h, --help                Hiện trợ giúp

Ví dụ:
  npm start
  npm run check
  node src/index.js --workers 5 --session 10-20
`);
}

function parseRange(value, name) {
  const match = String(value).match(/^(\d+(?:\.\d+)?)(?:\s*-\s*(\d+(?:\.\d+)?))?$/);
  if (!match) throw new Error(`${name} phải có dạng "min-max" hoặc một số, ví dụ 8-15.`);
  const min = Number(match[1]);
  const max = match[2] === undefined ? min : Number(match[2]);
  if (min <= 0 || max <= 0 || min > max) throw new Error(`${name} không hợp lệ: ${value}`);
  return { min, max };
}

function parseArgs(argv) {
  const options = {
    config: 'config.json',
    workers: null,
    session: null,
    sites: null,
    headless: null,
    once: false,
    checkProxies: false,
    resetProfiles: false,
    debug: false,
    proxyFile: null,
    help: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const raw = argv[index];
    let name = raw;
    let inlineValue;
    if (raw.startsWith('--') && raw.includes('=')) {
      const splitAt = raw.indexOf('=');
      name = raw.slice(0, splitAt);
      inlineValue = raw.slice(splitAt + 1);
    }

    const takeValue = () => {
      if (inlineValue !== undefined) return inlineValue;
      index += 1;
      if (index >= argv.length) throw new Error(`Thiếu giá trị cho ${name}`);
      return argv[index];
    };

    switch (name) {
      case '-c':
      case '--config':
        options.config = takeValue();
        break;
      case '-w':
      case '--workers': {
        const workers = Number.parseInt(takeValue(), 10);
        if (!Number.isFinite(workers) || workers < 1) throw new Error('--workers phải là số nguyên >= 1.');
        options.workers = workers;
        break;
      }
      case '--session':
        options.session = parseRange(takeValue(), '--session');
        break;
      case '--sites':
        options.sites = parseRange(takeValue(), '--sites');
        break;
      case '--headless':
        options.headless = true;
        break;
      case '--headed':
        options.headless = false;
        break;
      case '--once':
        options.once = true;
        break;
      case '--check':
      case '--check-proxies':
        options.checkProxies = true;
        break;
      case '--reset-profiles':
        options.resetProfiles = true;
        break;
      case '--proxy-file':
        options.proxyFile = takeValue();
        break;
      case '--debug':
        options.debug = true;
        break;
      case '-h':
      case '--help':
        options.help = true;
        break;
      default:
        throw new Error(`Tham số không hợp lệ: ${raw}`);
    }
  }

  return options;
}

function ensureConfigFile(configFile) {
  if (fs.existsSync(configFile)) return;
  const example = path.join(ROOT, 'config.example.json');
  if (!fs.existsSync(example)) {
    throw new Error(`Không thấy ${configFile} và cũng không có config.example.json.`);
  }
  fs.copyFileSync(example, configFile);
  console.log(`Đã tạo ${configFile} từ config.example.json.`);
}

function ensureProxyFile(proxyFile) {
  if (fs.existsSync(proxyFile)) return;
  const template = `# Mỗi dòng một proxy. Các dạng hỗ trợ:
#   host:port
#   host:port:user:pass
#   user:pass@host:port
#   http://user:pass@host:port
#   socks5://user:pass@host:port
#   direct
#
# Thêm proxy của bạn vào bên dưới rồi chạy lại.
`;
  fs.mkdirSync(path.dirname(proxyFile), { recursive: true });
  fs.writeFileSync(proxyFile, template);
  throw new Error(`Chưa có file proxy. Đã tạo file mẫu: ${proxyFile}. Hãy thêm proxy rồi chạy lại.`);
}

function printBanner(logger, { config, chromeMajor, poolSummary }) {
  logger.info('================================================');
  logger.info(' Browser Auto — mỗi cửa sổ một proxy');
  logger.info('================================================');
  logger.info(
    `Trình duyệt : Chromium ${chromeMajor} (${config.browser.headless ? 'headless' : 'hiển thị'})`
  );
  logger.info(`Proxy       : ${poolSummary.alive}/${poolSummary.total} sống, ${poolSummary.dead} chết`);
  logger.info(`Cửa sổ      : ${config.pool.concurrency}`);
  logger.info(
    `Phiên       : ${config.pool.sessionMinutes.min}-${config.pool.sessionMinutes.max} phút, ${config.pool.sitesPerSession.min}-${config.pool.sitesPerSession.max} website/phiên`
  );
  logger.info(`Log         : ${getLogFile() || config.paths.logDir}`);
  logger.info('================================================');
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const configFile = path.resolve(ROOT, options.config);
  ensureConfigFile(configFile);

  const config = loadConfig({
    configPath: configFile,
    overrides: {
      headless: options.headless,
      concurrency: options.workers,
      proxyFile: options.proxyFile,
      maxCycles: options.once ? 1 : null
    }
  });

  if (options.session) config.pool.sessionMinutes = options.session;
  if (options.sites) config.pool.sitesPerSession = options.sites;

  ensureProxyFile(config.paths.proxiesFile);
  initLogger({ logDir: config.paths.logDir, debug: options.debug });
  const logger = createLogger('main');

  if (options.resetProfiles) {
    fs.rmSync(config.paths.profilesDir, { recursive: true, force: true });
    logger.warn(`Đã xóa profile cũ: ${config.paths.profilesDir}`);
  }

  const signal = new StopSignal();
  const pool = new ProxyPool({ config, logger, signal });
  pool.load();

  if (options.checkProxies) {
    await pool.checkAll();
    logger.info(`\n${pool.formatTable()}\n`);
    const summary = pool.summary();
    logger.info(
      `Tổng: ${summary.total} proxy | ${summary.alive} sống | ${summary.dead} chết | ${summary.cooling} đang nghỉ`
    );
    await closeLogger();
    process.exitCode = summary.alive > 0 ? 0 : 1;
    return;
  }

  await pool.init();
  const poolSummary = pool.summary();
  if (poolSummary.alive === 0) {
    throw new Error('Không có proxy nào sống. Sửa proxies.txt hoặc kiểm tra kết nối mạng.');
  }

  const executable = chromium.executablePath();
  if (!fs.existsSync(executable)) {
    throw new Error(
      `Chưa cài Chromium cho Playwright. Chạy: npm run setup\nĐường dẫn mong đợi: ${executable}`
    );
  }

  const chromeMajor = await detectChromiumMajor();
  printBanner(logger, { config, chromeMajor, poolSummary });

  const stats = {
    sessions: 0,
    pages: 0,
    clicks: 0,
    errors: 0,
    proxiesUsed: new Set(),
    startedAt: Date.now()
  };

  const workers = Array.from(
    { length: config.pool.concurrency },
    (_, index) =>
      new BrowserWorker({
        id: index + 1,
        config,
        pool,
        signal,
        stats,
        chromeMajor
      })
  );

  let shuttingDown = false;
  const requestShutdown = (reason) => {
    if (shuttingDown) {
      logger.warn('Thoát ngay theo yêu cầu.');
      process.exit(130);
    }
    shuttingDown = true;
    logger.warn(`${reason}: đang đóng trình duyệt... (Ctrl+C lần nữa để thoát ngay)`);
    signal.stop();
    for (const worker of workers) worker.abort().catch(() => {});
    setTimeout(() => {
      logger.warn('Quá thời gian chờ, thoát.');
      process.exit(0);
    }, 20000).unref();
  };

  process.on('SIGINT', () => requestShutdown('Nhận SIGINT'));
  process.on('SIGTERM', () => requestShutdown('Nhận SIGTERM'));
  process.on('unhandledRejection', (error) => {
    logger.error(`unhandledRejection: ${error?.stack || error}`);
  });

  logger.info(`Khởi động ${workers.length} cửa sổ...`);
  const results = await Promise.allSettled(workers.map((worker) => worker.run()));

  let fatal = null;
  for (const result of results) {
    if (result.status === 'rejected') {
      fatal = result.reason;
      if (result.reason instanceof NoProxyAvailableError) {
        logger.error(result.reason.message);
      } else {
        logger.error(`worker lỗi: ${result.reason?.stack || result.reason}`);
      }
    }
  }

  const minutes = ((Date.now() - stats.startedAt) / 60000).toFixed(1);
  logger.info('---------------- Tổng kết ----------------');
  logger.info(
    `Thời gian: ${minutes} phút | Phiên: ${stats.sessions} | Trang: ${stats.pages} | Click: ${stats.clicks} | Proxy đã dùng: ${stats.proxiesUsed.size} | Lỗi: ${stats.errors}`
  );
  logger.event('summary', {
    minutes: Number(minutes),
    sessions: stats.sessions,
    pages: stats.pages,
    clicks: stats.clicks,
    errors: stats.errors,
    proxiesUsed: stats.proxiesUsed.size
  });

  if (fatal) process.exitCode = 1;
  await closeLogger();
}

main().catch(async (error) => {
  console.error(`\nLỖI: ${error?.message || error}`);
  if (process.env.DEBUG) console.error(error?.stack || error);
  await closeLogger().catch(() => {});
  process.exitCode = 1;
});
