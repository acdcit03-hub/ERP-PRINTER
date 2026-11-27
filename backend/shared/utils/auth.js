import crypto from 'crypto';
import os from 'os';

export function timingSafeEqualString(a, b) {
  const bufA = Buffer.from(String(a || ''), 'utf8');
  const bufB = Buffer.from(String(b || ''), 'utf8');
  if (bufA.length !== bufB.length) {
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

/** Tailscale / CGNAT 100.64.0.0/10 */
function isTailscaleIp(ip) {
  const m = String(ip).match(/^100\.(\d+)\./);
  if (!m) return false;
  const second = Number(m[1]);
  return second >= 64 && second <= 127;
}

export function isPrivateOrLocalIp(ip) {
  if (!ip) return false;
  const normalized = String(ip).replace(/^::ffff:/i, '');
  if (normalized === '::1' || normalized === '127.0.0.1') return true;
  if (normalized.startsWith('10.')) return true;
  if (normalized.startsWith('192.168.')) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(normalized)) return true;
  if (isTailscaleIp(normalized)) return true;
  return false;
}

export function createAuthMiddleware(pin) {
  const allowRemote =
    String(process.env.PRINT_ALLOW_REMOTE || '').toLowerCase() === '1' ||
    String(process.env.PRINT_ALLOW_REMOTE || '').toLowerCase() === 'true';

  return function authMiddleware(req, res, next) {
    const remote =
      req.headers['x-forwarded-for']?.toString().split(',')[0].trim() ||
      req.socket.remoteAddress ||
      '';

    if (!allowRemote && !isPrivateOrLocalIp(remote) && remote !== '::1') {
      return res.status(403).json({ error: 'Access denied: non-local network' });
    }

    if (!pin) return next();

    const header = req.headers.authorization || '';
    if (!header.startsWith('Basic ')) {
      res.set('WWW-Authenticate', 'Basic realm="Printer"');
      return res.status(401).json({ error: 'Authentication required' });
    }

    let decoded;
    try {
      decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
    } catch {
      return res.status(401).json({ error: 'Invalid authorization header' });
    }

    const colon = decoded.indexOf(':');
    const password = colon >= 0 ? decoded.slice(colon + 1) : decoded;

    if (!timingSafeEqualString(password, pin)) {
      return res.status(401).json({ error: 'Invalid PIN' });
    }

    return next();
  };
}

export function basicAuthHeader(pin) {
  if (!pin) return {};
  const token = Buffer.from(`:${pin}`, 'utf8').toString('base64');
  return { Authorization: `Basic ${token}` };
}

export function hostnameDefault() {
  try {
    return os.hostname() || 'printer-agent';
  } catch {
    return 'printer-agent';
  }
}
