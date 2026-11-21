export function rand(min, max) {
  if (max <= min) return min;
  return min + Math.random() * (max - min);
}

export function randInt(min, max) {
  const low = Math.ceil(Math.min(min, max));
  const high = Math.floor(Math.max(min, max));
  return low + Math.floor(Math.random() * (high - low + 1));
}

export function pick(items) {
  return items[Math.floor(Math.random() * items.length)];
}

export function chance(probability) {
  return Math.random() < probability;
}

export function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function weightedPick(items, weightOf) {
  let total = 0;
  for (const item of items) total += Math.max(0, weightOf(item) || 0);
  if (total <= 0) return pick(items);
  let roll = Math.random() * total;
  for (const item of items) {
    roll -= Math.max(0, weightOf(item) || 0);
    if (roll <= 0) return item;
  }
  return items[items.length - 1];
}

export function sleep(ms) {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function randomBetween(range, integer = true) {
  if (!range) return 0;
  const min = Math.min(range.min, range.max);
  const max = Math.max(range.min, range.max);
  return integer ? randInt(min, max) : rand(min, max);
}

export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function stripAnsi(text) {
  return String(text).replace(/\u001b\[[0-9;]*[a-zA-Z]/g, '');
}

export function shortError(error, maxLength = 180) {
  const message = stripAnsi(error?.message || error || 'lỗi không rõ')
    .replace(/\s+/g, ' ')
    .trim();
  return message.length > maxLength ? `${message.slice(0, maxLength - 1)}…` : message;
}
