import fs from 'fs';
import path from 'path';
import os from 'os';

export const MAX_FILE_SIZE = 200 * 1024 * 1024; // 200 MiB

export const COMMON_EXTENSIONS = [
  'pdf', 'txt', 'png', 'jpg', 'jpeg', 'jfif', 'gif', 'bmp', 'tif', 'tiff', 'webp', 'ps',
];

export const WINDOWS_EXTENSIONS = [
  'xps', 'doc', 'docx', 'rtf', 'odt', 'xls', 'xlsx', 'ppt', 'pptx',
];

export function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
  return dirPath;
}

export function uploadDir(name) {
  return ensureDir(path.join(os.tmpdir(), name));
}

export function safeBasename(filename) {
  const base = path.basename(String(filename || 'document.bin')).replace(/[^\w.\-()+ ]+/g, '_');
  return base.slice(0, 180) || 'document.bin';
}

export function getExtension(filename) {
  return path.extname(String(filename || '')).replace(/^\./, '').toLowerCase();
}

export function isAllowedExtension(filename, platform) {
  const ext = getExtension(filename);
  if (!ext) return false;
  if (COMMON_EXTENSIONS.includes(ext)) return true;
  if (platform === 'win32' && WINDOWS_EXTENSIONS.includes(ext)) return true;
  return false;
}

export function sanitizePaper(paper) {
  if (!paper) return '';
  const cleaned = String(paper).trim();
  if (!/^[A-Za-z0-9._\-]+$/.test(cleaned)) return '';
  return cleaned.slice(0, 64);
}

export function parsePageRange(range) {
  if (!range) return '';
  const cleaned = String(range).trim();
  if (!/^[0-9,\-\s]+$/.test(cleaned)) return '';
  return cleaned.replace(/\s+/g, '');
}

export function clampInt(value, min, max, fallback) {
  const n = parseInt(value, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function parsePrintSettings(query) {
  const copies = clampInt(query.copies, 1, 999, 1);
  const collate = query.collate === '1' || query.collate === 'true';
  const color = query.color === 'mono' ? 'mono' : 'color';
  const duplex = ['one', 'long', 'short'].includes(query.duplex) ? query.duplex : 'one';
  const paper = sanitizePaper(query.paper);
  const orientation = ['auto', 'portrait', 'landscape'].includes(query.orientation)
    ? query.orientation
    : 'auto';
  const range = parsePageRange(query.range);
  const nup = clampInt(query.nup, 1, 16, 1);
  const scale = ['fit', 'actual', 'custom'].includes(query.scale) ? query.scale : 'fit';
  const zoom = clampInt(query.zoom, 10, 400, 100);
  const quality = ['draft', 'normal', 'high'].includes(query.quality) ? query.quality : 'normal';

  let extra = null;
  if (query.extra) {
    try {
      extra = JSON.parse(String(query.extra));
    } catch {
      extra = null;
    }
  }

  return {
    copies,
    collate,
    color,
    duplex,
    paper,
    orientation,
    range,
    nup,
    scale,
    zoom,
    quality,
    extra,
  };
}

export function settingsSummary(settings) {
  return [
    `copies=${settings.copies}`,
    `color=${settings.color}`,
    `duplex=${settings.duplex}`,
    `orientation=${settings.orientation}`,
    `nup=${settings.nup}`,
    `scale=${settings.scale}`,
    `quality=${settings.quality}`,
    settings.paper ? `paper=${settings.paper}` : null,
    settings.range ? `range=${settings.range}` : null,
    settings.collate ? 'collate' : null,
  ]
    .filter(Boolean)
    .join(', ');
}
