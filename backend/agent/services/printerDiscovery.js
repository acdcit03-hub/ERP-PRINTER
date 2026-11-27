import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export async function discoverWindowsPrinters() {
  const script = `
$ErrorActionPreference = 'Stop'
Get-CimInstance Win32_Printer | ForEach-Object {
  [PSCustomObject]@{
    name = $_.Name
    driver = $_.DriverName
    port = $_.PortName
    isDefault = [bool]$_.Default
    status = $_.PrinterStatus
  }
} | ConvertTo-Json -Compress
`;
  const { stdout } = await execFileAsync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', script],
    { windowsHide: true, maxBuffer: 10 * 1024 * 1024 }
  );

  const trimmed = stdout.trim();
  if (!trimmed) return [];
  const parsed = JSON.parse(trimmed);
  const list = Array.isArray(parsed) ? parsed : [parsed];
  return list.map((p) => ({
    name: p.name || '',
    driver: p.driver || '',
    port: p.port || '',
    isDefault: Boolean(p.isDefault),
    status: p.status != null ? String(p.status) : '',
  }));
}

export async function discoverCupsPrinters() {
  const printers = [];
  let defaultName = '';

  try {
    const { stdout: dOut } = await execFileAsync('lpstat', ['-d'], { maxBuffer: 1024 * 1024 });
    const match = dOut.match(/:\s*(.+)$/m);
    if (match) defaultName = match[1].trim();
  } catch {
    // no default destination
  }

  let names = [];
  try {
    const { stdout } = await execFileAsync('lpstat', ['-p'], { maxBuffer: 2 * 1024 * 1024 });
    names = stdout
      .split('\n')
      .map((line) => {
        const m = line.match(/^printer\s+(\S+)/i);
        return m ? m[1] : null;
      })
      .filter(Boolean);
  } catch {
    names = [];
  }

  let ports = {};
  try {
    const { stdout } = await execFileAsync('lpstat', ['-v'], { maxBuffer: 2 * 1024 * 1024 });
    for (const line of stdout.split('\n')) {
      const m = line.match(/^device for\s+(\S+):\s*(.+)$/i);
      if (m) ports[m[1]] = m[2].trim();
    }
  } catch {
    ports = {};
  }

  for (const name of names) {
    printers.push({
      name,
      driver: '',
      port: ports[name] || '',
      isDefault: name === defaultName,
      status: 'idle',
    });
  }

  return printers;
}

export async function discoverPrinters(platform = process.platform) {
  if (platform === 'win32') {
    return discoverWindowsPrinters();
  }
  return discoverCupsPrinters();
}
