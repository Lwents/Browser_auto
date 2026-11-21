import { chance, clamp, randInt, sleep } from '../util/random.js';

const DEFAULT_EXCLUDE =
  /(login|signin|sign-in|signup|sign-up|register|logout|cart|checkout|account|profile|dang-nhap|dang-ky|dang-xuat|gio-hang|thanh-toan|javascript:|mailto:|tel:|\/ads?\/|affiliate|\.(pdf|zip|rar|7z|exe|msi|apk|dmg|mp4|mp3)(\?|$))/i;

export async function pause(min = 400, max = 1800, signal) {
  const duration = randInt(min, max);
  if (signal) await signal.sleep(duration);
  else await sleep(duration);
}

function pageAlive(page) {
  return page && !page.isClosed();
}

export async function humanMove(page, { signal } = {}) {
  if (!pageAlive(page) || signal?.stopped) return;
  const viewport = page.viewportSize() || { width: 1366, height: 768 };
  const moves = randInt(1, 3);
  for (let i = 0; i < moves; i += 1) {
    if (!pageAlive(page) || signal?.stopped) return;
    try {
      await page.mouse.move(
        randInt(0, Math.max(1, viewport.width - 1)),
        randInt(0, Math.max(1, viewport.height - 1)),
        { steps: randInt(8, 24) }
      );
      if (chance(0.45)) await pause(120, 650, signal);
    } catch {
      return;
    }
  }
}

export async function humanScroll(page, { steps = 3, signal, minDelta = 220, maxDelta = 650 } = {}) {
  if (!pageAlive(page) || signal?.stopped) return;
  const count = randInt(1, Math.max(1, steps));
  for (let i = 0; i < count; i += 1) {
    if (!pageAlive(page) || signal?.stopped) return;
    try {
      const backwards = chance(0.1);
      const delta = randInt(minDelta, maxDelta) * (backwards ? -1 : 1);
      await page.mouse.wheel(0, delta);
      await pause(350, 1500, signal);
      if (chance(0.28)) await humanMove(page, { signal });
    } catch {
      return;
    }
  }
}

export async function readPage(page, { durationMs = 30000, deadline = Infinity, signal } = {}) {
  const end = Math.min(Date.now() + durationMs, deadline);
  while (pageAlive(page) && !signal?.stopped && Date.now() < end) {
    await humanScroll(page, { steps: randInt(1, 3), signal });
    await pause(1200, 4200, signal);
    if (chance(0.5)) await humanMove(page, { signal });
    if (chance(0.12) && pageAlive(page)) {
      try {
        await page.mouse.wheel(0, -randInt(150, 380));
      } catch {
        return;
      }
    }
  }
}

export async function humanClick(page, element) {
  if (!pageAlive(page) || !element) return false;

  try {
    await element.scrollIntoViewIfNeeded({ timeout: 4000 });
  } catch {
    // Vẫn thử click nếu phần tử đã nằm trong khung nhìn.
  }

  let box = null;
  try {
    box = await element.boundingBox();
  } catch {
    box = null;
  }

  if (box && box.width > 2 && box.height > 2) {
    const viewport = page.viewportSize() || { width: 1366, height: 768 };
    const points = [
      { rx: 0.5, ry: 0.5 },
      { rx: 0.5, ry: 0.35 },
      { rx: 0.35, ry: 0.5 },
      { rx: 0.65, ry: 0.5 },
      { rx: 0.5, ry: 0.65 }
    ];

    for (const point of points) {
      const x = clamp(box.x + box.width * point.rx, 2, viewport.width - 3);
      const y = clamp(box.y + box.height * point.ry, 2, viewport.height - 3);

      const hitsElement = await element
        .evaluate((target, coordinates) => {
          const top = document.elementFromPoint(coordinates.x, coordinates.y);
          return Boolean(top && (top === target || target.contains(top)));
        }, { x, y })
        .catch(() => false);

      if (!hitsElement) continue;

      try {
        await page.mouse.move(x, y, { steps: randInt(6, 18) });
        await pause(80, 320);
        await page.mouse.down();
        await pause(40, 120);
        await page.mouse.up();
        return true;
      } catch {
        break;
      }
    }
  }

  try {
    await element.click({ timeout: 5000, delay: randInt(30, 100) });
    return true;
  } catch {
    return false;
  }
}

/**
 * Chọn ngẫu nhiên một link nội bộ đang nhìn thấy, ưu tiên link khớp mẫu
 * (bài viết / sản phẩm) và link nằm trong khung nhìn.
 */
export async function clickRandomInternalLink(
  page,
  { preferPattern = null, excludePattern = DEFAULT_EXCLUDE, minTextLength = 8, requirePrefer = false, signal } = {}
) {
  if (!pageAlive(page) || signal?.stopped) return null;

  const preferSource = preferPattern ? preferPattern.source : '';
  const excludeSource = excludePattern ? excludePattern.source : '';

  let handle;
  try {
    handle = await page.evaluateHandle(
      ({ preferSource: prefer, excludeSource: exclude, minTextLength: minLength, requirePrefer: mustPrefer }) => {
        const preferRe = prefer ? new RegExp(prefer, 'i') : null;
        const excludeRe = exclude ? new RegExp(exclude, 'i') : null;
        const stripWww = (host) => host.replace(/^www\./i, '');
        const current = location.href.split('#')[0];
        const viewportHeight = window.innerHeight;
        const candidates = [];

        for (const anchor of document.querySelectorAll('a[href]')) {
          try {
            const url = new URL(anchor.href, location.href);
            if (!/^https?:$/.test(url.protocol)) continue;
            if (stripWww(url.hostname) !== stripWww(location.hostname)) continue;
            if (url.href.split('#')[0] === current) continue;
            if (excludeRe && (excludeRe.test(anchor.href) || excludeRe.test(anchor.textContent || ''))) continue;

            const text = (anchor.textContent || '').replace(/\s+/g, ' ').trim();
            if (text.length < minLength) continue;

            const rect = anchor.getBoundingClientRect();
            if (rect.width < 20 || rect.height < 10) continue;
            if (rect.right < 0 || rect.left > window.innerWidth) continue;

            const style = window.getComputedStyle(anchor);
            if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) continue;
            if (style.pointerEvents === 'none') continue;

            let weight = 1;
            if (rect.top >= -50 && rect.top < viewportHeight) weight += 3;
            else if (rect.bottom > -200 && rect.top < viewportHeight * 1.5) weight += 1;
            if (preferRe && preferRe.test(url.pathname + url.search)) weight += 4;
            else if (mustPrefer) continue;

            candidates.push({ element: anchor, weight });
          } catch {
            // Bỏ qua link lỗi.
          }
        }

        if (candidates.length === 0) return null;
        const total = candidates.reduce((sum, item) => sum + item.weight, 0);
        let roll = Math.random() * total;
        for (const item of candidates) {
          roll -= item.weight;
          if (roll <= 0) {
            item.element.setAttribute('target', '_self');
            return item.element;
          }
        }
        candidates[0].element.setAttribute('target', '_self');
        return candidates[0].element;
      },
      { preferSource, excludeSource, minTextLength, requirePrefer }
    );
  } catch {
    return null;
  }

  const element = handle.asElement();
  if (!element) {
    await handle.dispose().catch(() => {});
    return null;
  }

  let info = null;
  try {
    info = await element.evaluate((anchor) => ({
      href: anchor.href,
      text: (anchor.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 90)
    }));
  } catch {
    info = { href: '', text: '' };
  }

  const beforeUrl = page.url();
  const clicked = await humanClick(page, element);
  if (!clicked) {
    await element.dispose().catch(() => {});
    await handle.dispose().catch(() => {});
    return null;
  }

  await page.waitForURL((url) => url.href !== beforeUrl, { timeout: 4000 }).catch(() => {});

  if (page.url() === beforeUrl) {
    try {
      await element.click({ timeout: 5000 });
    } catch {
      // Link có thể bị che; bỏ qua.
    }
    await page.waitForURL((url) => url.href !== beforeUrl, { timeout: 5000 }).catch(() => {});
  }

  await closeExtraPages(page.context(), page);

  const navigated = page.url() !== beforeUrl;
  await element.dispose().catch(() => {});
  await handle.dispose().catch(() => {});
  if (!navigated) return null;

  await pause(800, 1800, signal);
  return info;
}

export async function hoverRandomImage(page, { signal } = {}) {
  if (!pageAlive(page) || signal?.stopped) return;
  try {
    const box = await page.evaluate(() => {
      const images = Array.from(document.images).slice(0, 120);
      const visible = [];
      for (const image of images) {
        const rect = image.getBoundingClientRect();
        if (rect.width < 80 || rect.height < 60) continue;
        if (rect.top < 0 || rect.bottom > window.innerHeight) continue;
        visible.push({
          x: rect.left + rect.width * (0.25 + Math.random() * 0.5),
          y: rect.top + rect.height * (0.25 + Math.random() * 0.5)
        });
      }
      return visible.length ? visible[Math.floor(Math.random() * visible.length)] : null;
    });
    if (box) {
      await page.mouse.move(box.x, box.y, { steps: randInt(8, 20) });
      await pause(500, 1600, signal);
    }
  } catch {
    // Ảnh có thể biến mất do trang cập nhật.
  }
}

export async function safeGoto(page, url, { referer, timeout = 45000, signal } = {}) {
  if (!pageAlive(page) || signal?.stopped) return null;
  const options = { waitUntil: 'domcontentloaded', timeout };
  if (referer) options.referer = referer;
  const response = await page.goto(url, options);
  await pause(900, 2400, signal);
  if (pageAlive(page)) {
    await page.waitForSelector('body', { timeout: 8000 }).catch(() => {});
  }
  return response;
}

export async function safeGoBack(page, { signal } = {}) {
  if (!pageAlive(page) || signal?.stopped) return false;
  try {
    const response = await page.goBack({ waitUntil: 'domcontentloaded', timeout: 20000 });
    await pause(900, 2200, signal);
    return Boolean(response);
  } catch {
    return false;
  }
}

export async function dismissOverlays(page, { signal } = {}) {
  if (!pageAlive(page) || signal?.stopped) return;

  try {
    await page.keyboard.press('Escape');
  } catch {
    return;
  }

  let closed = false;
  const selectors = [
    'button[aria-label="Close"]',
    'button[aria-label="Đóng"]',
    '[class*="popup"] [class*="close"]',
    '[class*="modal"] [class*="close"]',
    '[data-dismiss="modal"]'
  ];

  for (const selector of selectors) {
    if (!pageAlive(page) || signal?.stopped) return;
    try {
      const locator = page.locator(selector).first();
      if (await locator.isVisible({ timeout: 200 })) {
        await locator.click({ timeout: 1500 });
        closed = true;
        await pause(300, 900, signal);
        break;
      }
    } catch {
      // Không có overlay khớp selector này.
    }
  }

  if (!closed && pageAlive(page)) {
    const result = await page
      .evaluate(() => {
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const overlays = [...document.querySelectorAll('body *')].filter((element) => {
          const style = window.getComputedStyle(element);
          if (style.position !== 'fixed' && style.position !== 'absolute') return false;
          if (Number(style.zIndex) < 1000) return false;
          const rect = element.getBoundingClientRect();
          return rect.width >= viewportWidth * 0.85 && rect.height >= viewportHeight * 0.85;
        });

        if (overlays.length === 0) return { clicked: false, overlays: 0 };

        const candidates = [];
        for (const overlay of overlays) {
          for (const element of overlay.querySelectorAll('button,[role="button"],a,div,span')) {
            const style = window.getComputedStyle(element);
            const rect = element.getBoundingClientRect();
            if (rect.width < 8 || rect.height < 8 || rect.width > 220 || rect.height > 90) continue;

            const label = `${element.getAttribute('aria-label') || ''} ${
              element.getAttribute('title') || ''
            } ${element.className || ''} ${element.textContent || ''}`.toLowerCase();

            let score = 0;
            if (/close|đóng|dong|bỏ qua|skip|×|✕/.test(label)) score += 100;
            else if (/accept|đồng ý|dong y|allow|cookie|ok|tiếp tục|tiep tuc/.test(label)) score += 60;
            if (style.cursor === 'pointer') score += 20;
            if (rect.top < viewportHeight * 0.45) score += 10;
            if (rect.left > viewportWidth * 0.5) score += 5;

            if (score > 0) candidates.push({ element, score });
          }
        }

        candidates.sort((a, b) => b.score - a.score);
        if (candidates.length === 0) return { clicked: false, overlays: overlays.length };

        const target = candidates[0].element;
        target.addEventListener('click', (event) => event.preventDefault(), {
          once: true,
          capture: true
        });
        target.click();
        return { clicked: true, overlays: overlays.length };
      })
      .catch(() => ({ clicked: false, overlays: 0 }));

    if (result?.clicked) {
      closed = true;
      await pause(500, 1100, signal);
    }
  }

  if (!pageAlive(page) || signal?.stopped) return;

  // Một số popup không có nút đóng rõ ràng: ẩn lớp phủ toàn màn hình
  // để không chặn thao tác, sau khi đã thử Escape và nút đóng.
  await page
    .evaluate(() => {
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      let hidden = 0;

      for (const element of document.querySelectorAll('body *')) {
        const style = window.getComputedStyle(element);
        if (style.position !== 'fixed' && style.position !== 'absolute') continue;
        if (Number(style.zIndex) < 1000) continue;
        const rect = element.getBoundingClientRect();
        if (rect.width < viewportWidth * 0.85 || rect.height < viewportHeight * 0.85) continue;

        const text = (element.textContent || '').trim();
        const signature = `${element.className || ''} ${element.getAttribute('role') || ''}`.toLowerCase();
        const modalLike = text.length < 500 || /overlay|modal|popup|backdrop|dialog|cookie|consent/.test(signature);
        if (!modalLike) continue;

        element.style.setProperty('display', 'none', 'important');
        hidden += 1;
      }

      if (hidden > 0) {
        document.body.style.removeProperty('overflow');
        document.documentElement.style.removeProperty('overflow');
      }
      return hidden;
    })
    .catch(() => {});

  if (closed) await pause(200, 600, signal);
}

export async function closeExtraPages(context, keepPage) {
  if (!context) return;
  for (const page of context.pages()) {
    if (page === keepPage) continue;
    await page.close().catch(() => {});
  }
}

export async function idleBreak(page, { durationMs = 15000, signal } = {}) {
  const end = Date.now() + durationMs;
  while (pageAlive(page) && !signal?.stopped && Date.now() < end) {
    await pause(2500, 6500, signal);
    if (chance(0.5)) await humanMove(page, { signal });
  }
}
