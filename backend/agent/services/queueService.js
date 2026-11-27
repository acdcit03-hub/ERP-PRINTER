import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

async function listWindowsJobs(printerName) {
  const safe = String(printerName).replace(/'/g, "''");
  const script = `
$ErrorActionPreference = 'Stop'
Get-PrintJob -PrinterName '${safe}' | ForEach-Object {
  [PSCustomObject]@{
    id = $_.Id
    document = $_.DocumentName
    status = $_.JobStatus
    pages = $_.TotalPages
    size = $_.Size
    submitted = $_.SubmittedTime
  }
} | ConvertTo-Json -Compress
`;
  try {
    const { stdout } = await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      { windowsHide: true, maxBuffer: 5 * 1024 * 1024 }
    );
    const trimmed = stdout.trim();
    if (!trimmed) return [];
    const parsed = JSON.parse(trimmed);
    const list = Array.isArray(parsed) ? parsed : [parsed];
    return list.map((j) => ({
      id: String(j.id),
      document: j.document || '',
      status: j.status || '',
      pages: j.pages != null ? j.pages : null,
      size: j.size != null ? j.size : null,
      submitted: j.submitted || null,
    }));
  } catch (err) {
    if (/No matching/i.test(err.message || '') || /ObjectNotFound/i.test(err.message || '')) {
      return [];
    }
    throw err;
  }
}

async function listCupsJobs(printerName) {
  const { stdout } = await execFileAsync('lpstat', ['-o', printerName], {
    maxBuffer: 2 * 1024 * 1024,
  }).catch(() => ({ stdout: '' }));

  const jobs = [];
  for (const line of stdout.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parts = trimmed.split(/\s+/);
    const idPart = parts[0] || '';
    const idMatch = idPart.match(/-(\d+)$/);
    jobs.push({
      id: idMatch ? idMatch[1] : idPart,
      document: idPart,
      status: 'queued',
      pages: null,
      size: parts[2] ? Number(parts[2]) || null : null,
      submitted: parts.slice(3).join(' ') || null,
    });
  }
  return jobs;
}

export async function listJobs(printerName, platform = process.platform) {
  if (platform === 'win32') {
    return listWindowsJobs(printerName);
  }
  return listCupsJobs(printerName);
}

async function cancelWindowsJob(printerName, jobId) {
  const safePrinter = String(printerName).replace(/'/g, "''");
  const safeId = String(jobId).replace(/'/g, "''");
  const script = `
$ErrorActionPreference = 'Stop'
Remove-PrintJob -PrinterName '${safePrinter}' -ID ${safeId}
`;
  await execFileAsync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', script],
    { windowsHide: true, maxBuffer: 1024 * 1024 }
  );
  return { success: true, message: 'Job cancelled' };
}

async function cancelCupsJob(printerName, jobId) {
  const jobRef = String(jobId).includes('-') ? String(jobId) : `${printerName}-${jobId}`;
  await execFileAsync('cancel', [jobRef], { maxBuffer: 1024 * 1024 });
  return { success: true, message: 'Job cancelled' };
}

export async function cancelJob(printerName, jobId, platform = process.platform) {
  if (platform === 'win32') {
    return cancelWindowsJob(printerName, jobId);
  }
  return cancelCupsJob(printerName, jobId);
}
