const ALLOWED_SCHEMES = new Set(['http', 'https', 'socks4', 'socks5', 'socks5h']);

function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function parseHostPort(value) {
  const text = String(value || '').trim();
  let host;
  let portText;

  if (text.startsWith('[')) {
    const end = text.indexOf(']');
    if (end === -1) return null;
    host = text.slice(1, end);
    if (text[end + 1] !== ':') return null;
    portText = text.slice(end + 2);
  } else {
    const colon = text.lastIndexOf(':');
    if (colon === -1) return null;
    host = text.slice(0, colon);
    portText = text.slice(colon + 1);
  }

  host = host.trim();
  const port = Number(portText);
  if (!host || !Number.isInteger(port) || port < 1 || port > 65535) return null;
  return { host, port };
}

function formatHost(host) {
  return host.includes(':') ? `[${host}]` : host;
}

/**
 * Hỗ trợ các dạng phổ biến:
 *   host:port
 *   host:port:user:pass
 *   host:port:user
 *   user:pass@host:port
 *   http://user:pass@host:port
 *   socks5://user:pass@host:port
 *   direct
 */
export function parseProxyLine(line, index = 0) {
  const raw = String(line ?? '').trim();
  if (!raw || raw.startsWith('#')) return null;

  if (/^direct:?\/?\/?$/i.test(raw) || /^direct$/i.test(raw)) {
    return {
      id: `p${index + 1}`,
      raw,
      direct: true,
      scheme: null,
      proxy: null,
      label: 'direct (không proxy)'
    };
  }

  let scheme = 'http';
  let body = raw;
  const schemeMatch = raw.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):\/\/(.*)$/);
  if (schemeMatch) {
    scheme = schemeMatch[1].toLowerCase();
    body = schemeMatch[2];
  }

  if (!ALLOWED_SCHEMES.has(scheme)) {
    throw new Error(`Proxy #${index + 1}: scheme "${scheme}" không hỗ trợ (chỉ nhận http, https, socks4, socks5).`);
  }

  let username = '';
  let password = '';
  let hostPort = body;

  const at = body.lastIndexOf('@');
  if (at !== -1) {
    const userInfo = body.slice(0, at);
    hostPort = body.slice(at + 1);
    const colon = userInfo.indexOf(':');
    if (colon === -1) {
      username = safeDecode(userInfo);
    } else {
      username = safeDecode(userInfo.slice(0, colon));
      password = safeDecode(userInfo.slice(colon + 1));
    }
  } else {
    const parts = body.split(':');
    if (parts.length >= 4 && /^\d+$/.test(parts[1])) {
      hostPort = `${parts[0]}:${parts[1]}`;
      username = parts[2];
      password = parts.slice(3).join(':');
    } else if (parts.length === 3 && /^\d+$/.test(parts[1])) {
      hostPort = `${parts[0]}:${parts[1]}`;
      username = parts[2];
    }
  }

  const parsedHost = parseHostPort(hostPort);
  if (!parsedHost) {
    throw new Error(`Proxy #${index + 1}: địa chỉ không hợp lệ (cần host:port).`);
  }

  const serverScheme = scheme === 'socks5h' ? 'socks5' : scheme;
  const proxy = {
    server: `${serverScheme}://${formatHost(parsedHost.host)}:${parsedHost.port}`
  };
  if (username) proxy.username = username;
  if (password) proxy.password = password;

  const authLabel = username ? `${username}:***@` : '';
  return {
    id: `p${index + 1}`,
    raw,
    direct: false,
    scheme,
    proxy,
    label: `${authLabel}${formatHost(parsedHost.host)}:${parsedHost.port}`
  };
}

export function parseProxyLines(text) {
  const entries = [];
  const errors = [];
  const lines = String(text ?? '').split(/\r?\n/);

  lines.forEach((line, index) => {
    try {
      const entry = parseProxyLine(line, index);
      if (entry) entries.push(entry);
    } catch (error) {
      errors.push({ line: index + 1, message: error.message });
    }
  });

  return { entries, errors };
}
