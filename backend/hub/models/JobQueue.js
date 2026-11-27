import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

/**
 * Print jobs waiting for a relay Agent to pull from the Hub.
 */
export default class JobQueue {
  constructor(uploadDir) {
    this.uploadDir = uploadDir;
    /** @type {Map<string, object>} */
    this.jobs = new Map();
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  enqueue({ peerId, printer, filename, body, query }) {
    const id = crypto.randomBytes(12).toString('hex');
    const safeName = path.basename(filename || 'document.bin').replace(/[^\w.\-()+ ]+/g, '_');
    const filePath = path.join(this.uploadDir, `${id}_${safeName}`);
    fs.writeFileSync(filePath, body);

    const job = {
      id,
      peerId: String(peerId),
      printer: String(printer || ''),
      filename: safeName,
      filePath,
      query: { ...(query || {}) },
      status: 'pending',
      createdAt: Date.now(),
      result: null,
      _waiters: [],
    };
    this.jobs.set(id, job);
    return job;
  }

  claimNext(peerId) {
    const id = String(peerId || '');
    for (const job of this.jobs.values()) {
      if (job.peerId === id && job.status === 'pending') {
        job.status = 'claimed';
        job.claimedAt = Date.now();
        return {
          id: job.id,
          printer: job.printer,
          filename: job.filename,
          query: job.query,
        };
      }
    }
    return null;
  }

  get(jobId) {
    return this.jobs.get(String(jobId || '')) || null;
  }

  complete(jobId, result) {
    const job = this.get(jobId);
    if (!job) return null;
    job.status = result?.success ? 'done' : 'failed';
    job.result = result || { success: false, error: 'Unknown' };
    job.finishedAt = Date.now();
    for (const resolve of job._waiters) resolve(job);
    job._waiters = [];
    setTimeout(() => this._cleanup(job.id), 60_000);
    return job;
  }

  waitFor(jobId, timeoutMs = 180_000) {
    const job = this.get(jobId);
    if (!job) return Promise.reject(new Error('Job not found'));
    if (job.status === 'done' || job.status === 'failed') {
      return Promise.resolve(job);
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        job._waiters = job._waiters.filter((w) => w !== onDone);
        if (job.status === 'pending' || job.status === 'claimed') {
          job.status = 'failed';
          job.result = { success: false, error: 'Agent did not pick up job in time' };
        }
        resolve(job);
      }, timeoutMs);

      const onDone = (finished) => {
        clearTimeout(timer);
        resolve(finished);
      };
      job._waiters.push(onDone);
    });
  }

  _cleanup(jobId) {
    const job = this.jobs.get(jobId);
    if (!job) return;
    fs.promises.unlink(job.filePath).catch(() => {});
    this.jobs.delete(jobId);
  }
}
