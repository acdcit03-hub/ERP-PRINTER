import os from 'os';
import http from 'http';
import https from 'https';

export function getLanIpv4() {
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const info of ifaces[name] || []) {
      if (info.family === 'IPv4' && !info.internal) {
        return info.address;
      }
    }
  }
  return null;
}

export function subnetPrefix24(ip) {
  if (!ip) return null;
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  return `${parts[0]}.${parts[1]}.${parts[2]}`;
}

export function normalizeAgentAddress(address, defaultPort = 8001) {
  let raw = String(address || '').trim();
  if (!raw) throw new Error('Address is required');

  if (!/^https?:\/\//i.test(raw)) {
    raw = `http://${raw}`;
  }

  const url = new URL(raw);
  if (!url.port) {
    url.port = String(defaultPort);
  }

  const host = url.hostname;
  const port = url.port;
  const baseUrl = `${url.protocol}//${host}:${port}`;

  return { host, port, baseUrl, url: baseUrl };
}

export function requestJson(targetUrl, options = {}) {
  const {
    method = 'GET',
    headers = {},
    body = null,
    timeoutMs = 5000,
  } = options;

  return new Promise((resolve, reject) => {
    const url = new URL(targetUrl);
    const lib = url.protocol === 'https:' ? https : http;
    const req = lib.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port,
        path: `${url.pathname}${url.search}`,
        method,
        headers,
        timeout: timeoutMs,
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          let data = null;
          try {
            data = raw ? JSON.parse(raw) : null;
          } catch {
            data = { raw };
          }
          resolve({
            status: res.statusCode || 0,
            headers: res.headers,
            data,
            ok: (res.statusCode || 0) >= 200 && (res.statusCode || 0) < 300,
          });
        });
      }
    );

    req.on('timeout', () => {
      req.destroy(new Error('Request timeout'));
    });
    req.on('error', reject);

    if (body) {
      if (Buffer.isBuffer(body) || typeof body === 'string') {
        req.write(body);
      } else {
        const json = JSON.stringify(body);
        req.setHeader('Content-Type', 'application/json');
        req.setHeader('Content-Length', Buffer.byteLength(json));
        req.write(json);
      }
    }
    req.end();
  });
}

export function forwardBinary(targetUrl, options = {}) {
  const {
    method = 'POST',
    headers = {},
    body,
    timeoutMs = 120000,
  } = options;

  return new Promise((resolve, reject) => {
    const url = new URL(targetUrl);
    const lib = url.protocol === 'https:' ? https : http;
    const req = lib.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port,
        path: `${url.pathname}${url.search}`,
        method,
        headers,
        timeout: timeoutMs,
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          let data = null;
          try {
            data = raw ? JSON.parse(raw) : null;
          } catch {
            data = { raw };
          }
          resolve({
            status: res.statusCode || 0,
            headers: res.headers,
            data,
            ok: (res.statusCode || 0) >= 200 && (res.statusCode || 0) < 300,
          });
        });
      }
    );

    req.on('timeout', () => {
      req.destroy(new Error('Request timeout'));
    });
    req.on('error', reject);

    if (body) req.write(body);
    req.end();
  });
}
