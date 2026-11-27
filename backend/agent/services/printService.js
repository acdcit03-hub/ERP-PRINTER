import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFile, spawn } from 'child_process';
import { promisify } from 'util';
import { getExtension } from '../../shared/utils/files.js';

const execFileAsync = promisify(execFile);

const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'jfif', 'gif', 'bmp', 'tif', 'tiff', 'webp']);

function pathExists(filePath) {
  try {
    return Boolean(filePath) && fs.existsSync(filePath);
  } catch {
    return false;
  }
}

function uniqueExisting(paths) {
  const seen = new Set();
  const out = [];
  for (const p of paths) {
    if (!p || seen.has(p.toLowerCase())) continue;
    seen.add(p.toLowerCase());
    if (pathExists(p)) out.push(p);
  }
  return out;
}

export function resolveSumatraPath(configured = process.env.SUMATRA_PATH || 'SumatraPDF.exe') {
  const candidates = [
    configured,
    path.isAbsolute(configured) ? configured : null,
    path.join(process.cwd(), 'SumatraPDF.exe'),
    path.join('C:\\Program Files\\SumatraPDF', 'SumatraPDF.exe'),
    path.join('C:\\Program Files (x86)\\SumatraPDF', 'SumatraPDF.exe'),
    path.join(os.homedir(), 'AppData', 'Local', 'SumatraPDF', 'SumatraPDF.exe'),
    path.join(os.homedir(), 'AppData', 'Local', 'SumatraPDF', 'SumatraPDF-64.exe'),
  ].filter(Boolean);

  const found = uniqueExisting(candidates);
  if (found.length) return found[0];
  if (configured && !path.isAbsolute(configured)) return configured;
  return null;
}

export function sumatraAvailable(sumatraPath) {
  const resolved = resolveSumatraPath(sumatraPath || process.env.SUMATRA_PATH || 'SumatraPDF.exe');
  if (!resolved) return false;
  if (path.isAbsolute(resolved)) return pathExists(resolved);
  return true;
}

function resolveAdobeReaders() {
  const roots = ['C:\\Program Files\\Adobe', 'C:\\Program Files (x86)\\Adobe'];
  const names = [
    ['Acrobat DC', 'Acrobat', 'Acrobat.exe'],
    ['Adobe Acrobat', 'Acrobat', 'Acrobat.exe'],
    ['Acrobat Reader DC', 'Reader', 'AcroRd32.exe'],
    ['Acrobat Reader', 'Reader', 'AcroRd32.exe'],
  ];

  const found = [];
  for (const root of roots) {
    if (!pathExists(root)) continue;
    for (const parts of names) {
      const full = path.join(root, ...parts);
      if (pathExists(full)) found.push(full);
    }
  }
  return uniqueExisting(found);
}

function resolveFoxitReaders() {
  return uniqueExisting([
    'C:\\Program Files (x86)\\Foxit Software\\Foxit Reader\\FoxitReader.exe',
    'C:\\Program Files\\Foxit Software\\Foxit Reader\\FoxitReader.exe',
    'C:\\Program Files (x86)\\Foxit Software\\Foxit PDF Reader\\FoxitPDFReader.exe',
    'C:\\Program Files\\Foxit Software\\Foxit PDF Reader\\FoxitPDFReader.exe',
  ]);
}

export function buildSumatraSettings(settings) {
  const parts = [];
  if (settings.copies > 1) parts.push(`${settings.copies}x`);
  if (settings.color === 'mono') parts.push('monochrome');
  else parts.push('color');
  if (settings.duplex === 'long') parts.push('duplex');
  if (settings.duplex === 'short') parts.push('duplexshort');
  if (settings.orientation === 'landscape') parts.push('landscape');
  if (settings.orientation === 'portrait') parts.push('portrait');
  if (settings.paper) parts.push(`paper=${settings.paper}`);
  if (settings.nup > 1) parts.push(`${settings.nup}up`);
  if (settings.scale === 'fit') parts.push('fit');
  if (settings.scale === 'actual') parts.push('noscale');
  if (settings.range) parts.push(settings.range);
  return parts.join(',');
}

function runPowerShell(command, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', command],
      { windowsHide: true }
    );

    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('PowerShell print timed out'));
    }, timeoutMs);

    child.stdout.on('data', (d) => {
      stdout += d.toString();
    });
    child.stderr.on('data', (d) => {
      stderr += d.toString();
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error((stderr || stdout || `PowerShell exited with code ${code}`).trim()));
    });
  });
}

async function printWithSumatra(filePath, printerName, settings, sumatraPath) {
  const exe = resolveSumatraPath(sumatraPath);
  if (!exe || (path.isAbsolute(exe) && !pathExists(exe))) {
    throw new Error('SumatraPDF.exe not found');
  }

  const printSettings = buildSumatraSettings(settings);
  const args = ['-print-to', printerName, '-silent', '-exit-when-done'];
  if (printSettings) {
    args.push('-print-settings', printSettings);
  }
  args.push(filePath);

  await execFileAsync(exe, args, {
    windowsHide: true,
    maxBuffer: 2 * 1024 * 1024,
    timeout: 180000,
  });

  return {
    success: true,
    message: `Submitted via SumatraPDF (${path.basename(exe)})`,
    jobId: null,
  };
}

async function printWithAdobe(filePath, printerName) {
  const readers = resolveAdobeReaders();
  if (!readers.length) throw new Error('Adobe Reader/Acrobat not found');

  let lastError = null;
  for (const exe of readers) {
    try {
      await execFileAsync(exe, ['/t', filePath, printerName], {
        windowsHide: true,
        maxBuffer: 2 * 1024 * 1024,
        timeout: 180000,
      });
      return {
        success: true,
        message: `Submitted via Adobe (${path.basename(exe)})`,
        jobId: null,
      };
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error('Adobe print failed');
}

async function printWithFoxit(filePath, printerName) {
  const readers = resolveFoxitReaders();
  if (!readers.length) throw new Error('Foxit Reader not found');

  let lastError = null;
  for (const exe of readers) {
    try {
      await execFileAsync(exe, ['/t', filePath, printerName], {
        windowsHide: true,
        maxBuffer: 2 * 1024 * 1024,
        timeout: 180000,
      });
      return {
        success: true,
        message: `Submitted via Foxit (${path.basename(exe)})`,
        jobId: null,
      };
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error('Foxit print failed');
}

/** Print image to a named Windows printer via System.Drawing (no file association needed). */
async function printImageWithDotNet(filePath, printerName, settings) {
  const safeFile = String(filePath).replace(/'/g, "''");
  const safePrinter = String(printerName).replace(/'/g, "''");
  const copies = Math.max(1, Number(settings.copies) || 1);

  const script = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$printer = '${safePrinter}'
$path = '${safeFile}'
$copies = ${copies}

$installed = Get-CimInstance Win32_Printer | Where-Object { $_.Name -eq $printer }
if (-not $installed) { throw "Printer not found: $printer" }

$img = [System.Drawing.Image]::FromFile($path)
try {
  for ($c = 1; $c -le $copies; $c++) {
    $doc = New-Object System.Drawing.Printing.PrintDocument
    $doc.PrinterSettings.PrinterName = $printer
    if (-not $doc.PrinterSettings.IsValid) { throw "Invalid printer: $printer" }
    $doc.DocumentName = [IO.Path]::GetFileName($path)
    $script:done = $false
    $script:printError = $null
    $doc.add_PrintPage({
      param($sender, $e)
      try {
        $bounds = $e.MarginBounds
        $e.Graphics.DrawImage($img, $bounds)
        $e.HasMorePages = $false
      } catch {
        $script:printError = $_.Exception.Message
      }
    })
    $doc.add_EndPrint({ $script:done = $true })
    $doc.Print()
    $wait = 0
    while (-not $script:done -and $wait -lt 120) {
      Start-Sleep -Milliseconds 250
      $wait++
    }
    $doc.Dispose()
    if ($script:printError) { throw $script:printError }
  }
} finally {
  $img.Dispose()
}
Write-Output 'OK'
`;

  await runPowerShell(script, 180000);
  return {
    success: true,
    message: 'Submitted via System.Drawing to selected printer',
    jobId: null,
  };
}

async function printWithPrintToVerb(filePath, printerName) {
  const safeFile = String(filePath).replace(/'/g, "''");
  const safePrinter = String(printerName).replace(/'/g, "''");
  await runPowerShell(
    `$ErrorActionPreference='Stop'; Start-Process -FilePath '${safeFile}' -Verb PrintTo -ArgumentList '"${safePrinter}"' -WindowStyle Hidden -Wait`,
    180000
  );
  return { success: true, message: 'Submitted via Windows PrintTo verb', jobId: null };
}

async function printPdf(filePath, printerName, settings, sumatraPath) {
  const errors = [];

  try {
    return await printWithSumatra(filePath, printerName, settings, sumatraPath);
  } catch (err) {
    errors.push(`SumatraPDF: ${err.message}`);
    console.warn('SumatraPDF print failed:', err.message);
  }

  try {
    return await printWithAdobe(filePath, printerName);
  } catch (err) {
    errors.push(`Adobe: ${err.message}`);
    console.warn('Adobe print failed:', err.message);
  }

  try {
    return await printWithFoxit(filePath, printerName);
  } catch (err) {
    errors.push(`Foxit: ${err.message}`);
    console.warn('Foxit print failed:', err.message);
  }

  try {
    return await printWithPrintToVerb(filePath, printerName);
  } catch (err) {
    errors.push(`PrintTo: ${err.message}`);
    console.warn('PrintTo verb failed:', err.message);
  }

  throw new Error(
    'PDF print failed. On the printer PC install SumatraPDF, then restart Agent. ' +
      'https://www.sumatrapdfreader.org/download-free-pdf-viewer | ' +
      errors.join(' | ')
  );
}

async function printImage(filePath, printerName, settings, sumatraPath) {
  const errors = [];

  try {
    return await printImageWithDotNet(filePath, printerName, settings);
  } catch (err) {
    errors.push(`Drawing: ${err.message}`);
    console.warn('System.Drawing print failed:', err.message);
  }

  // Sumatra can also print many image formats to a named printer
  try {
    return await printWithSumatra(filePath, printerName, settings, sumatraPath);
  } catch (err) {
    errors.push(`SumatraPDF: ${err.message}`);
  }

  try {
    return await printWithPrintToVerb(filePath, printerName);
  } catch (err) {
    errors.push(`PrintTo: ${err.message}`);
  }

  throw new Error(`Image print failed: ${errors.join(' | ')}`);
}

async function printOther(filePath, printerName) {
  try {
    return await printWithPrintToVerb(filePath, printerName);
  } catch (err) {
    throw new Error(
      `Print failed for selected printer "${printerName}". ` +
        'Ensure a default app can print this file type. ' +
        err.message
    );
  }
}

async function printWindows(filePath, printerName, settings, sumatraPath) {
  const ext = getExtension(filePath);

  if (ext === 'pdf') {
    return printPdf(filePath, printerName, settings, sumatraPath);
  }
  if (IMAGE_EXTS.has(ext)) {
    return printImage(filePath, printerName, settings, sumatraPath);
  }
  return printOther(filePath, printerName);
}

function cupsSides(duplex) {
  if (duplex === 'long') return 'two-sided-long-edge';
  if (duplex === 'short') return 'two-sided-short-edge';
  return 'one-sided';
}

function cupsColor(color) {
  return color === 'mono' ? 'monochrome' : 'color';
}

function cupsQuality(quality) {
  if (quality === 'draft') return '3';
  if (quality === 'high') return '5';
  return '4';
}

function cupsOrientation(orientation) {
  if (orientation === 'portrait') return '3';
  if (orientation === 'landscape') return '4';
  return null;
}

async function printCups(filePath, printerName, settings) {
  const args = ['-d', printerName, '-n', String(settings.copies)];

  args.push('-o', `sides=${cupsSides(settings.duplex)}`);
  args.push('-o', `print-color-mode=${cupsColor(settings.color)}`);
  args.push('-o', `print-quality=${cupsQuality(settings.quality)}`);

  if (settings.paper) args.push('-o', `media=${settings.paper}`);
  const orient = cupsOrientation(settings.orientation);
  if (orient) args.push('-o', `orientation-requested=${orient}`);
  if (settings.range) args.push('-o', `page-ranges=${settings.range}`);
  if (settings.nup > 1) args.push('-o', `number-up=${settings.nup}`);
  if (settings.scale === 'fit') args.push('-o', 'fit-to-page');
  if (settings.collate) args.push('-o', 'Collate=True');

  args.push(filePath);

  const { stdout } = await execFileAsync('lp', args, {
    maxBuffer: 2 * 1024 * 1024,
    timeout: 120000,
  });

  const jobMatch = stdout.match(/request id is\s+(\S+)/i) || stdout.match(/(\S+-\d+)/);
  return {
    success: true,
    message: stdout.trim() || 'Submitted via CUPS lp',
    jobId: jobMatch ? jobMatch[1] : null,
  };
}

export async function submitPrint(filePath, printerName, settings, options = {}) {
  const platform = options.platform || process.platform;
  const sumatraPath = options.sumatraPath || process.env.SUMATRA_PATH || 'SumatraPDF.exe';

  if (platform === 'win32') {
    return printWindows(filePath, printerName, settings, sumatraPath);
  }
  return printCups(filePath, printerName, settings);
}
