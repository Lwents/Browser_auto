import { chance, randomBetween, randInt, weightedPick } from '../util/random.js';
import {
  clickRandomInternalLink,
  dismissOverlays,
  hoverRandomImage,
  humanScroll,
  pause,
  readPage,
  safeGoBack,
  safeGoto
} from './human.js';

const NEWS_LINK = /-\d{5,}\.html|\.html?(\?|$)|\/article\/|\/tin-|\/news\//i;
const SHOP_LINK = /\/p\/|-p\d+|\/product\/|\/san-pham\/|\/chi-tiet\/|-p-|-i\.\d+\.\d+|\.html?(\?|$)/i;

function truncate(text, max = 72) {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function hasTime(deadline, reserveMs = 15000) {
  return Date.now() < deadline - reserveMs;
}

async function maybeDismissOverlays(page, config, signal) {
  if (config.behavior.dismissOverlays !== false) {
    await dismissOverlays(page, { signal });
  }
}

export function pickCategory(config) {
  const categories = Object.entries(config.sites.categories)
    .filter(([, category]) => category.enabled !== false && category.sites?.length)
    .map(([name, category]) => ({ name, ...category }));
  if (categories.length === 0) {
    throw new Error('Không có nhóm website nào được bật trong config.sites.categories.');
  }
  return weightedPick(categories, (category) => category.weight);
}

async function browseNews({ page, config, logger, signal, deadline, stats }) {
  await humanScroll(page, { steps: randInt(2, 5), signal });
  await pause(1200, 3600, signal);
  await hoverRandomImage(page, { signal });
  await maybeDismissOverlays(page, config, signal);

  const readMs = randomBetween(config.behavior.readSeconds, false) * 1000;
  const shortMs = randomBetween(config.behavior.shortReadSeconds, false) * 1000;

  if (!chance(config.behavior.clickLinkChance)) {
    await readPage(page, { durationMs: Math.min(readMs, 30000), deadline, signal });
    return;
  }

  const article = await clickRandomInternalLink(page, {
    preferPattern: NEWS_LINK,
    minTextLength: 12,
    requirePrefer: true,
    signal
  });

  if (!article) {
    await readPage(page, { durationMs: Math.min(readMs, 30000), deadline, signal });
    return;
  }

  stats.clicks += 1;
  logger.info(`đọc bài: ${truncate(article.text)}`);
  await pause(1800, 3800, signal);
  await maybeDismissOverlays(page, config, signal);
  await humanScroll(page, { steps: randInt(1, 3), signal });
  await readPage(page, { durationMs: readMs, deadline, signal });

  if (chance(0.3) && hasTime(deadline, 25000)) {
    const related = await clickRandomInternalLink(page, {
      preferPattern: NEWS_LINK,
      minTextLength: 12,
      requirePrefer: true,
      signal
    });
    if (related) {
      stats.clicks += 1;
      logger.info(`đọc tiếp: ${truncate(related.text)}`);
      await pause(1200, 3000, signal);
      await humanScroll(page, { steps: randInt(1, 2), signal });
      await readPage(page, { durationMs: shortMs, deadline, signal });
    }
  }

  if (chance(0.35) && hasTime(deadline, 30000)) {
    if (await safeGoBack(page, { signal })) {
      stats.pages += 1;
      await humanScroll(page, { steps: randInt(1, 3), signal });
      await pause(1000, 2600, signal);
    }
  }
}

async function browseShopping({ page, config, logger, signal, deadline, stats }) {
  await humanScroll(page, { steps: randInt(3, 6), signal });
  await hoverRandomImage(page, { signal });
  await pause(1500, 4000, signal);
  await maybeDismissOverlays(page, config, signal);

  const shortMs = randomBetween(config.behavior.shortReadSeconds, false) * 1000;

  if (!chance(config.behavior.clickLinkChance)) {
    await readPage(page, { durationMs: Math.min(shortMs, 25000), deadline, signal });
    return;
  }

  const product = await clickRandomInternalLink(page, {
    preferPattern: SHOP_LINK,
    minTextLength: 10,
    signal
  });

  if (!product) {
    await readPage(page, { durationMs: Math.min(shortMs, 25000), deadline, signal });
    return;
  }

  stats.clicks += 1;
  logger.info(`xem sản phẩm: ${truncate(product.text)}`);
  await pause(2000, 4500, signal);
  await maybeDismissOverlays(page, config, signal);
  await humanScroll(page, { steps: randInt(2, 4), signal });
  await hoverRandomImage(page, { signal });
  await readPage(page, { durationMs: shortMs, deadline, signal });

  if (chance(0.4) && hasTime(deadline, 30000)) {
    if (await safeGoBack(page, { signal })) {
      stats.pages += 1;
      await humanScroll(page, { steps: randInt(1, 3), signal });
      await pause(1000, 2600, signal);

      const second = await clickRandomInternalLink(page, {
        preferPattern: SHOP_LINK,
        minTextLength: 10,
        signal
      });
      if (second) {
        stats.clicks += 1;
        logger.info(`xem sản phẩm: ${truncate(second.text)}`);
        await pause(1500, 3200, signal);
        await humanScroll(page, { steps: randInt(1, 3), signal });
        await readPage(page, { durationMs: shortMs, deadline, signal });
      }
    }
  }
}

async function browseGeneric({ page, config, logger, signal, deadline, stats }) {
  await humanScroll(page, { steps: randInt(2, 4), signal });
  await pause(1200, 3000, signal);
  await readPage(page, {
    durationMs: randomBetween(config.behavior.shortReadSeconds, false) * 1000,
    deadline,
    signal
  });

  if (!chance(0.6) || !hasTime(deadline, 20000)) return;

  const link = await clickRandomInternalLink(page, { minTextLength: 10, signal });
  if (!link) return;

  stats.clicks += 1;
  logger.info(`mở link: ${truncate(link.text)}`);
  await pause(1500, 3200, signal);
  await humanScroll(page, { steps: randInt(1, 3), signal });
  await readPage(page, {
    durationMs: randomBetween(config.behavior.shortReadSeconds, false) * 1000,
    deadline,
    signal
  });
}

export async function browseSite({ page, category, site, config, logger, signal, deadline, stats }) {
  const behavior = category.behavior || 'generic';
  const startedAt = Date.now();

  logger.info(`mở ${site.name} [${behavior}]`);

  const response = await safeGoto(page, site.url, {
    referer: chance(0.5) ? 'https://www.google.com/' : undefined,
    timeout: config.browser.navigationTimeoutMs,
    signal
  });
  stats.pages += 1;

  if (response && response.status() >= 400) {
    logger.debug(`${site.name} trả về HTTP ${response.status()}`);
  }

  await maybeDismissOverlays(page, config, signal);

  if (behavior === 'news') {
    await browseNews({ page, config, logger, signal, deadline, stats });
  } else if (behavior === 'shopping') {
    await browseShopping({ page, config, logger, signal, deadline, stats });
  } else {
    await browseGeneric({ page, config, logger, signal, deadline, stats });
  }

  const seconds = Math.round((Date.now() - startedAt) / 1000);
  logger.debug(`rời ${site.name} sau ${seconds}s`);
}
