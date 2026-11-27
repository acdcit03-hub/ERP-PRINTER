import fs from 'fs';
import path from 'path';
import {
  MAX_FILE_SIZE,
  safeBasename,
  isAllowedExtension,
  parsePrintSettings,
  settingsSummary,
} from '../../shared/utils/files.js';
import { submitPrint } from '../services/printService.js';
import OrderStore from '../models/Order.js';

export default function createPrintController({ printerCache, orderStore, uploadDir, sumatraPath }) {
  return {
    async print(req, res) {
      const printer = String(req.query.printer || '').trim();
      if (!printer) {
        return res.status(400).json({ error: 'printer query parameter is required' });
      }

      if (!printerCache.findByName(printer)) {
        return res.status(404).json({ error: `Printer not found: ${printer}` });
      }

      const originalName = safeBasename(req.headers['x-filename'] || 'document.bin');
      if (!isAllowedExtension(originalName, process.platform)) {
        return res.status(400).json({
          error: `File type not allowed: ${path.extname(originalName) || '(none)'}`,
        });
      }

      const settings = parsePrintSettings(req.query);
      const tmpPath = path.join(
        uploadDir,
        `${Date.now()}_${Math.random().toString(36).slice(2)}_${originalName}`
      );

      let total = 0;
      const writeStream = fs.createWriteStream(tmpPath);

      try {
        await new Promise((resolve, reject) => {
          req.on('data', (chunk) => {
            total += chunk.length;
            if (total > MAX_FILE_SIZE) {
              reject(new Error('File exceeds 200 MiB limit'));
              req.destroy();
              writeStream.destroy();
              return;
            }
            writeStream.write(chunk);
          });
          req.on('end', () => {
            writeStream.end();
          });
          req.on('error', reject);
          writeStream.on('finish', resolve);
          writeStream.on('error', reject);
        });

        if (total === 0) {
          throw new Error('Empty file body');
        }

        const result = await submitPrint(tmpPath, printer, settings, { sumatraPath });
        const entry = OrderStore.createEntry({
          filename: originalName,
          printer,
          settingsSummary: settingsSummary(settings),
          success: true,
          jobId: result.jobId,
          message: result.message,
        });
        orderStore.add(entry);

        return res.json({
          success: true,
          message: result.message,
          jobId: result.jobId,
          order: entry,
        });
      } catch (err) {
        const entry = OrderStore.createEntry({
          filename: originalName,
          printer,
          settingsSummary: settingsSummary(settings),
          success: false,
          jobId: null,
          message: err.message || 'Print failed',
        });
        orderStore.add(entry);

        return res.status(500).json({
          success: false,
          error: err.message || 'Print failed',
          order: entry,
        });
      } finally {
        // Keep temp file briefly so Windows print apps can finish reading it
        setTimeout(() => {
          fs.promises.unlink(tmpPath).catch(() => {});
        }, 120000);
      }
    },
  };
}
