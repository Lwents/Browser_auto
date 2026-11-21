import fs from 'node:fs';
import path from 'node:path';

const COLORS = {
  reset: '\u001b[0m',
  dim: '\u001b[90m',
  red: '\u001b[31m',
  green: '\u001b[32m',
  yellow: '\u001b[33m',
  cyan: '\u001b[36m',
  magenta: '\u001b[35m'
};

const LEVEL_COLORS = {
  INFO: COLORS.cyan,
  OK: COLORS.green,
  WARN: COLORS.yellow,
  ERROR: COLORS.red,
  DEBUG: COLORS.dim
};

const state = {
  stream: null,
  eventStream: null,
  debug: false,
  color: Boolean(process.stdout.isTTY) && !process.env.NO_COLOR,
  logFile: null,
  eventFile: null
};

function dateStamp(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function clock(date = new Date()) {
  return date.toTimeString().slice(0, 8);
}

function stringifyMeta(meta) {
  if (meta === undefined) return '';
  try {
    const text = typeof meta === 'string' ? meta : JSON.stringify(meta);
    return text.length > 600 ? `${text.slice(0, 599)}…` : text;
  } catch {
    return '[meta không tuần tự hóa được]';
  }
}

function write(level, scope, message, meta) {
  const time = clock();
  const scopeText = scope ? String(scope).padEnd(4) : '';
  const metaText = stringifyMeta(meta);
  const plain = `[${time}] ${level.padEnd(5)} ${scopeText} ${message}${metaText ? ` ${metaText}` : ''}`;

  if (state.color) {
    const color = LEVEL_COLORS[level] || '';
    process.stdout.write(
      `${COLORS.dim}[${time}]${COLORS.reset} ${color}${level.padEnd(5)}${COLORS.reset} ${COLORS.dim}${scopeText}${COLORS.reset} ${message}${metaText ? ` ${COLORS.dim}${metaText}${COLORS.reset}` : ''}\n`
    );
  } else {
    process.stdout.write(`${plain}\n`);
  }

  if (state.stream) {
    state.stream.write(`${plain}\n`);
  }
}

export function initLogger({ logDir, debug = false } = {}) {
  state.debug = Boolean(debug);
  state.color = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;

  if (logDir) {
    try {
      fs.mkdirSync(logDir, { recursive: true });
      const file = path.join(logDir, `activity-${dateStamp()}.log`);
      state.logFile = file;
      state.stream = fs.createWriteStream(file, { flags: 'a' });
      state.stream.on('error', () => {
        state.stream = null;
      });

      const eventsFile = path.join(logDir, `events-${dateStamp()}.jsonl`);
      state.eventFile = eventsFile;
      state.eventStream = fs.createWriteStream(eventsFile, { flags: 'a' });
      state.eventStream.on('error', () => {
        state.eventStream = null;
      });
    } catch {
      state.stream = null;
      state.eventStream = null;
    }
  }
}

export function getLogFile() {
  return state.logFile;
}

export async function closeLogger() {
  const streams = [state.stream, state.eventStream].filter(Boolean);
  state.stream = null;
  state.eventStream = null;
  await Promise.all(
    streams.map(
      (stream) =>
        new Promise((resolve) => {
          stream.end(resolve);
        })
    )
  );
}

export function createLogger(scope = '') {
  return {
    scope,
    child(childScope) {
      return createLogger(scope ? `${scope}:${childScope}` : childScope);
    },
    info(message, meta) {
      write('INFO', scope, message, meta);
    },
    success(message, meta) {
      write('OK', scope, message, meta);
    },
    warn(message, meta) {
      write('WARN', scope, message, meta);
    },
    error(message, meta) {
      write('ERROR', scope, message, meta);
    },
    debug(message, meta) {
      if (state.debug) write('DEBUG', scope, message, meta);
    },
    event(type, data = {}) {
      if (!state.eventStream) return;
      try {
        const line = JSON.stringify({
          ts: new Date().toISOString(),
          scope: scope || 'main',
          event: type,
          ...data
        });
        state.eventStream.write(`${line}\n`);
      } catch {
        // Bỏ qua lỗi log sự kiện để không ảnh hưởng tiến trình chính.
      }
    }
  };
}
