import { getLanIpv4, subnetPrefix24, requestJson } from '../../shared/utils/network.js';

export async function probeAgent(ip, port, timeoutMs = 800) {
  try {
    const result = await requestJson(`http://${ip}:${port}/api/info`, {
      method: 'GET',
      timeoutMs,
    });
    if (result.ok && result.data && result.data.agent === 'printer-live') {
      return {
        address: `${ip}:${port}`,
        url: `http://${ip}:${port}`,
        info: result.data,
      };
    }
  } catch {
    // unreachable
  }
  return null;
}

export async function scanNetwork(agentPort, registeredUrls = []) {
  const ip = getLanIpv4();
  const prefix = subnetPrefix24(ip);
  if (!prefix) {
    return { network: null, discovered: [], error: 'No non-internal IPv4 interface found' };
  }

  const registered = new Set(
    registeredUrls.map((u) => String(u).replace(/\/$/, '').toLowerCase())
  );

  const tasks = [];
  for (let i = 1; i <= 254; i += 1) {
    const host = `${prefix}.${i}`;
    tasks.push(probeAgent(host, agentPort));
  }

  const results = await Promise.all(tasks);
  const discovered = [];
  for (const item of results) {
    if (!item) continue;
    if (registered.has(item.url.toLowerCase())) continue;
    discovered.push(item);
  }

  return {
    network: `${prefix}.0/24`,
    sourceIp: ip,
    agentPort,
    discovered,
  };
}
