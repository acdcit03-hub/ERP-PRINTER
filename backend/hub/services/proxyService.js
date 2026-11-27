import { requestJson, forwardBinary } from '../../shared/utils/network.js';
import { basicAuthHeader } from '../../shared/utils/auth.js';

function peerHeaders(peer, extra = {}) {
  return {
    ...basicAuthHeader(peer.pin),
    ...extra,
  };
}

export async function getJson(peer, apiPath, timeoutMs = 5000) {
  const url = `${peer.url.replace(/\/$/, '')}${apiPath}`;
  return requestJson(url, {
    method: 'GET',
    headers: peerHeaders(peer),
    timeoutMs,
  });
}

export async function postJson(peer, apiPath, timeoutMs = 10000) {
  const url = `${peer.url.replace(/\/$/, '')}${apiPath}`;
  return requestJson(url, {
    method: 'POST',
    headers: peerHeaders(peer),
    timeoutMs,
  });
}

export async function forwardPrint(peer, queryString, body, filename) {
  const qs = queryString ? `?${queryString}` : '';
  const url = `${peer.url.replace(/\/$/, '')}/api/print${qs}`;
  return forwardBinary(url, {
    method: 'POST',
    headers: peerHeaders(peer, {
      'Content-Type': 'application/octet-stream',
      'Content-Length': Buffer.byteLength(body),
      'X-Filename': filename || 'document.bin',
    }),
    body,
    timeoutMs: 180000,
  });
}
