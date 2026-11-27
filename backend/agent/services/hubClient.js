import fs from 'fs';
import path from 'path';
import http from 'http';
import https from 'https';
import { basicAuthHeader } from '../../shared/utils/auth.js';
import { parsePrintSettings, settingsSummary, safeBasename } from '../../shared/utils/files.js';
import { submitPrint } from './printService.js';
import OrderStore from '../models/Order.js';

function request(hubUrl, apiPath, { method = 'GET', pin = '', body = null, timeoutMs = 15000 } = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(apiPath, hubUrl.endsWith('/') ? hubUrl : `${hubUrl}/`);
    const lib = url.protocol === 'https:' ? https : http;
    const payload = body == null ? null : Buffer.from(JSON.stringify(body), 'utf8');
    const headers = {
      ...basicAuthHeader(pin),
      Accept: 'application/json',
    };
    if (payload) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = payload.length;
    }

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
          const raw = Buffer.concat(chunks);
          let data = null;
          try {
            data = raw.length ? JSON.parse(raw.toString('utf8')) : null;
          } catch {
            data = { raw: raw.toString('utf8') };
          }
          resolve({ status: res.statusCode || 0, ok: (res.statusCode || 0) >= 200 && (res.statusCode || 0) < 300, data, raw });
        });
      }
    );
    req.on('timeout', () => req.destroy(new Error('Hub request timeout')));
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function downloadFile(hubUrl, apiPath, destPath, pin = '') {
  return new Promise((resolve, reject) => {
    const url = new URL(apiPath, hubUrl.endsWith('/') ? hubUrl : `${hubUrl}/`);
    const lib = url.protocol === 'https:' ? https : http;
    const req = lib.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port,
        path: `${url.pathname}${url.search}`,
        method: 'GET',
        headers: { ...basicAuthHeader(pin) },
        timeout: 180000,
      },
      (res) => {
        if ((res.statusCode || 0) >= 400) {
          reject(new Error(`Download failed HTTP ${res.statusCode}`));
          res.resume();
          return;
        }
        const out = fs.createWriteStream(destPath);
        res.pipe(out);
        out.on('finish', () => resolve(destPath));
        out.on('error', reject);
      }
    );
    req.on('timeout', () => req.destroy(new Error('Download timeout')));
    req.on('error', reject);
    req.end();
  });
}

/**
 * Office Agent dials out to cloud Hub (Render). Hub never needs to reach 192.168.x.x.
 */
export function startHubClient({
  hubUrl,
  peerId,
  address,
  name,
  pin,
  hubPin,
  printerCache,
  orderStore,
  uploadDir,
  sumatraPath,
}) {
  const base = String(hubUrl || '').replace(/\/$/, '');
  if (!base) return () => {};

  let stopped = false;
  const authPin = hubPin || pin || '';

  async function heartbeat() {
    const { printers, error } = printerCache.list();
    await request(base, '/api/agent/heartbeat', {
      method: 'POST',
      pin: authPin,
      body: {
        peerId,
        id: peerId,
        name,
        address,
        url: `http://${address}`,
        printers,
        info: { name, platform: process.platform, error: error || null, mode: 'relay' },
      },
    });
  }

  async function processJob(job) {
    const filename = safeBasename(job.filename || 'document.bin');
    const tmpPath = path.join(
      uploadDir,
      `hub_${job.id}_${Math.random().toString(36).slice(2)}_${filename}`
    );
    try {
      await downloadFile(base, `/api/agent/jobs/${job.id}/file`, tmpPath, authPin);
      const settings = parsePrintSettings(job.query || {});
      const result = await submitPrint(tmpPath, job.printer, settings, { sumatraPath });
      const entry = OrderStore.createEntry({
        filename,
        printer: job.printer,
        settingsSummary: settingsSummary(settings),
        success: true,
        jobId: result.jobId,
        message: result.message,
      });
      orderStore.add(entry);
      await request(base, `/api/agent/jobs/${job.id}/complete`, {
        method: 'POST',
        pin: authPin,
        body: {
          success: true,
          message: result.message,
          jobId: result.jobId,
          order: entry,
        },
      });
    } catch (err) {
      const entry = OrderStore.createEntry({
        filename,
        printer: job.printer,
        settingsSummary: settingsSummary(parsePrintSettings(job.query || {})),
        success: false,
        jobId: null,
        message: err.message || 'Print failed',
      });
      orderStore.add(entry);
      await request(base, `/api/agent/jobs/${job.id}/complete`, {
        method: 'POST',
        pin: authPin,
        body: {
          success: false,
          error: err.message || 'Print failed',
          order: entry,
        },
      }).catch(() => {});
    } finally {
      setTimeout(() => fs.promises.unlink(tmpPath).catch(() => {}), 60_000);
    }
  }

  async function pollOnce() {
    const res = await request(
      base,
      `/api/agent/jobs/next?peerId=${encodeURIComponent(peerId)}&address=${encodeURIComponent(address)}`,
      { method: 'GET', pin: authPin, timeoutMs: 20000 }
    );
    if (!res.ok) {
      throw new Error(res.data?.error || `Hub poll HTTP ${res.status}`);
    }
    if (res.data?.job) {
      await processJob(res.data.job);
    }
  }

  async function loop() {
    console.log(`Hub relay enabled → ${base} (peer ${peerId || address})`);
    while (!stopped) {
      try {
        await heartbeat();
        await pollOnce();
      } catch (err) {
        console.error('Hub relay error:', err.message);
        await new Promise((r) => setTimeout(r, 5000));
        continue;
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  loop().catch((err) => console.error('Hub relay stopped:', err.message));
  return () => {
    stopped = true;
  };
}
