'use strict';

const state = {
  hosts: [],
  printers: [],
  selected: new Set(),
  previewUrl: null,
};

const $ = (id) => document.getElementById(id);

function toast(message, type = 'success') {
  const el = $('toast');
  el.textContent = message;
  el.className = `toast show ${type}`;
  setTimeout(() => {
    el.className = 'toast';
  }, 3500);
}

async function api(path, options = {}) {
  const res = await fetch(path, options);
  let data = null;
  const text = await res.text();
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const msg = data?.error || data?.message || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

function renderHosts() {
  const list = $('hostList');
  if (!state.hosts.length) {
    list.innerHTML = '<li class="empty">No registered PCs</li>';
    return;
  }

  list.innerHTML = state.hosts
    .map((h) => {
      const online = h.online
        ? '<span class="status-dot online"></span>Online'
        : '<span class="status-dot offline"></span>Offline';
      return `
        <li class="host-item">
          <div>
            <div><strong>${escapeHtml(h.name)}</strong></div>
            <div class="host-meta">${escapeHtml(h.address)} · ${online}</div>
            ${h.error ? `<div class="host-meta">${escapeHtml(h.error)}</div>` : ''}
          </div>
          <button type="button" class="danger" data-remove="${escapeAttr(h.id)}">Remove</button>
        </li>`;
    })
    .join('');

  list.querySelectorAll('[data-remove]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        await api(`/api/peers/remove?id=${encodeURIComponent(btn.dataset.remove)}`, {
          method: 'POST',
        });
        toast('PC removed');
        await refreshAll();
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  });
}

function renderPrinters() {
  const list = $('printerList');
  if (!state.printers.length) {
    list.innerHTML = '<li class="empty">No printers available from online Agents</li>';
    return;
  }

  list.innerHTML = state.printers
    .map((p) => {
      const key = `${p.host}::${p.name}`;
      const checked = state.selected.has(key) ? 'checked' : '';
      return `
        <li class="printer-item">
          <label>
            <input type="checkbox" data-key="${escapeAttr(key)}" ${checked} />
            <span>
              <strong>${escapeHtml(p.name)}</strong>
              <div class="printer-meta">
                ${escapeHtml(p.hostName || p.host)}
                ${p.isDefault ? ' · default' : ''}
                ${p.port ? ` · ${escapeHtml(p.port)}` : ''}
                ${p.status != null && p.status !== '' ? ` · status ${escapeHtml(String(p.status))}` : ''}
              </div>
            </span>
          </label>
        </li>`;
    })
    .join('');

  list.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
    cb.addEventListener('change', () => {
      if (cb.checked) state.selected.add(cb.dataset.key);
      else state.selected.delete(cb.dataset.key);
      updateSelectionHint();
    });
  });

  updateSelectionHint();
}

function updateSelectionHint() {
  const n = state.selected.size;
  $('selectionHint').textContent =
    n === 0 ? 'Select one or more printers above' : `${n} printer(s) selected`;
}

function renderOrders(orders) {
  const list = $('orderList');
  if (!orders?.length) {
    list.innerHTML = '<li class="empty">No orders yet</li>';
    return;
  }

  const sorted = [...orders].sort((a, b) => {
    const tb = Number(b.ts) || 0;
    const ta = Number(a.ts) || 0;
    if (tb !== ta) return tb - ta; // latest first
    return String(b.time || '').localeCompare(String(a.time || ''));
  });

  list.innerHTML = sorted
    .slice(0, 40)
    .map((o) => {
      const badge = o.success
        ? '<span class="badge ok">OK</span>'
        : '<span class="badge fail">FAIL</span>';
      return `
        <li class="order-item">
          <div>
            <div>${badge} <strong>${escapeHtml(o.filename || '')}</strong></div>
            <div class="printer-meta">
              ${escapeHtml(o.host || '')} · ${escapeHtml(o.printer || '')} · ${escapeHtml(o.time || '')}
            </div>
            <div class="printer-meta">${escapeHtml(o.settings || '')}</div>
            ${o.message ? `<div class="printer-meta">${escapeHtml(o.message)}</div>` : ''}
          </div>
        </li>`;
    })
    .join('');
}

function renderJobs(jobs, printer) {
  const list = $('jobList');
  if (!jobs?.length) {
    list.innerHTML = `<li class="empty">Queue empty for ${escapeHtml(printer || 'printer')}</li>`;
    return;
  }

  list.innerHTML = jobs
    .map(
      (j) => `
      <li class="job-item">
        <div>
          <div><strong>#${escapeHtml(String(j.id))}</strong> ${escapeHtml(j.document || '')}</div>
          <div class="printer-meta">${escapeHtml(j.status || '')}</div>
        </div>
        <button type="button" class="danger" data-cancel-id="${escapeAttr(String(j.id))}">Cancel</button>
      </li>`
    )
    .join('');

  const selected = getSingleSelection();
  list.querySelectorAll('[data-cancel-id]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!selected) return;
      try {
        const qs = new URLSearchParams({
          host: selected.host,
          printer: selected.printer,
          id: btn.dataset.cancelId,
        });
        await api(`/api/cancel?${qs}`, { method: 'POST' });
        toast('Cancel requested');
        await loadQueue();
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  });
}

function getSingleSelection() {
  if (state.selected.size !== 1) return null;
  const key = [...state.selected][0];
  const [host, ...rest] = key.split('::');
  return { host, printer: rest.join('::') };
}

function getPrintSettings() {
  return {
    copies: $('copies').value || '1',
    color: $('color').value,
    duplex: $('duplex').value,
    orientation: $('orientation').value,
    paper: $('paper').value.trim(),
    range: $('range').value.trim(),
    nup: $('nup').value || '1',
    scale: $('scale').value,
    zoom: $('zoom').value || '100',
    quality: $('quality').value,
    collate: $('collate').value,
  };
}

async function refreshAll() {
  const data = await api('/api/all');
  state.hosts = data.hosts || [];
  state.printers = data.printers || [];

  const valid = new Set(state.printers.map((p) => `${p.host}::${p.name}`));
  for (const key of [...state.selected]) {
    if (!valid.has(key)) state.selected.delete(key);
  }

  renderHosts();
  renderPrinters();
}

async function refreshOrders() {
  const data = await api('/api/all_orders');
  renderOrders(data.orders || []);
}

async function scanNetwork() {
  $('scanList').innerHTML = '<li class="empty">Scanning /24 subnet…</li>';
  const data = await api('/api/scan');
  const found = data.discovered || [];
  if (!found.length) {
    $('scanList').innerHTML = `<li class="empty">No new Agents found${
      data.network ? ` on ${escapeHtml(data.network)}` : ''
    }</li>`;
    return;
  }

  $('scanList').innerHTML = found
    .map((d) => {
      const name = d.info?.name || d.address;
      return `
        <li class="scan-item">
          <div>
            <strong>${escapeHtml(name)}</strong>
            <div class="printer-meta">${escapeHtml(d.address)}</div>
          </div>
          <button type="button" class="secondary" data-add-address="${escapeAttr(d.address)}" data-add-name="${escapeAttr(name)}">Add</button>
        </li>`;
    })
    .join('');

  $('scanList').querySelectorAll('[data-add-address]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        await api('/api/peers/add', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            address: btn.dataset.addAddress,
            name: btn.dataset.addName,
            pin: '',
          }),
        });
        toast('Agent added');
        await refreshAll();
        btn.disabled = true;
        btn.textContent = 'Added';
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  });
}

async function loadQueue() {
  const selected = getSingleSelection();
  if (!selected) {
    $('jobList').innerHTML = '<li class="empty">Select exactly one printer to view its queue</li>';
    return;
  }
  const qs = new URLSearchParams({
    host: selected.host,
    printer: selected.printer,
  });
  const data = await api(`/api/jobs?${qs}`);
  renderJobs(data.jobs || [], selected.printer);
}

function isImageFile(file) {
  const type = (file.type || '').toLowerCase();
  const name = file.name.toLowerCase();
  return (
    type.startsWith('image/') ||
    /\.(png|jpe?g|jfif|gif|bmp|webp|tif|tiff)$/i.test(name)
  );
}

function toGrayscalePngBuffer(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
          const gray = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
          data[i] = gray;
          data[i + 1] = gray;
          data[i + 2] = gray;
        }
        ctx.putImageData(imageData, 0, 0);
        canvas.toBlob(
          (blob) => {
            URL.revokeObjectURL(url);
            if (!blob) {
              reject(new Error('Failed to convert image to black & white'));
              return;
            }
            blob.arrayBuffer().then(resolve).catch(reject);
          },
          'image/png'
        );
      } catch (err) {
        URL.revokeObjectURL(url);
        reject(err);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image for black & white conversion'));
    };
    img.src = url;
  });
}

function applyPreviewColorMode() {
  const frame = $('filePreviewFrame');
  if (!frame) return;
  const isBw = $('color').value === 'mono';
  frame.classList.toggle('is-bw', isBw);
}

async function printSelected() {
  const file = $('fileInput').files?.[0];
  if (!file) {
    toast('Choose a document first', 'error');
    return;
  }
  if (!state.selected.size) {
    toast('Select at least one printer', 'error');
    return;
  }

  const settings = getPrintSettings();
  let filename = file.name;
  let buffer;

  if (settings.color === 'mono' && isImageFile(file)) {
    buffer = await toGrayscalePngBuffer(file);
    filename = file.name.replace(/\.[^.]+$/, '') + '-bw.png';
  } else {
    buffer = await file.arrayBuffer();
  }

  const btn = $('btnPrint');
  btn.disabled = true;

  let ok = 0;
  let fail = 0;
  const failMessages = [];

  try {
    for (const key of state.selected) {
      const [host, ...rest] = key.split('::');
      const printer = rest.join('::');
      const qs = new URLSearchParams({
        host,
        printer,
        ...settings,
      });
      try {
        await api(`/api/print?${qs}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/octet-stream',
            'X-Filename': filename,
          },
          body: buffer,
        });
        ok += 1;
      } catch (err) {
        fail += 1;
        failMessages.push(`${printer}: ${err.message}`);
        console.error(err);
      }
    }
    if (fail && failMessages.length) {
      toast(failMessages[0].slice(0, 180), 'error');
    } else {
      toast(`Print done: ${ok} ok, ${fail} failed`, fail ? 'error' : 'success');
    }
    await refreshOrders();
  } finally {
    btn.disabled = false;
  }
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/'/g, '&#39;');
}

$('addPeerForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  try {
    await api('/api/peers/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        address: fd.get('address'),
        name: fd.get('name'),
        pin: fd.get('pin'),
      }),
    });
    e.target.reset();
    toast('PC registered');
    await refreshAll();
  } catch (err) {
    toast(err.message, 'error');
  }
});

$('btnRefresh').addEventListener('click', async () => {
  try {
    await refreshAll();
    toast('Printers refreshed');
  } catch (err) {
    toast(err.message, 'error');
  }
});

$('btnScan').addEventListener('click', async () => {
  try {
    await scanNetwork();
  } catch (err) {
    toast(err.message, 'error');
  }
});

$('btnOrders').addEventListener('click', async () => {
  try {
    await refreshOrders();
    toast('History refreshed');
  } catch (err) {
    toast(err.message, 'error');
  }
});

$('btnQueue').addEventListener('click', async () => {
  try {
    await loadQueue();
  } catch (err) {
    toast(err.message, 'error');
  }
});

$('btnPrint').addEventListener('click', () => {
  printSelected().catch((err) => toast(err.message, 'error'));
});

function clearFilePreview() {
  if (state.previewUrl) {
    URL.revokeObjectURL(state.previewUrl);
    state.previewUrl = null;
  }
  $('filePreviewMeta').textContent = 'No file selected';
  $('filePreviewFrame').innerHTML =
    '<div class="file-preview-placeholder">Select a document to preview</div>';
}

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function showFilePreview(file) {
  if (state.previewUrl) {
    URL.revokeObjectURL(state.previewUrl);
    state.previewUrl = null;
  }

  const meta = $('filePreviewMeta');
  const frame = $('filePreviewFrame');
  frame.innerHTML = '';

  if (!file) {
    clearFilePreview();
    return;
  }

  meta.textContent = `${file.name} · ${formatFileSize(file.size)} · ${file.type || 'unknown type'}`;

  const type = (file.type || '').toLowerCase();
  const name = file.name.toLowerCase();
  const isImage =
    type.startsWith('image/') ||
    /\.(png|jpe?g|jfif|gif|bmp|webp|tif|tiff)$/i.test(name);
  const isPdf = type === 'application/pdf' || name.endsWith('.pdf');

  state.previewUrl = URL.createObjectURL(file);

  if (isImage) {
    const img = document.createElement('img');
    img.src = state.previewUrl;
    img.alt = file.name;
    frame.appendChild(img);
    applyPreviewColorMode();
    return;
  }

  if (isPdf) {
    const iframe = document.createElement('iframe');
    iframe.src = state.previewUrl;
    iframe.title = file.name;
    frame.appendChild(iframe);
    applyPreviewColorMode();
    return;
  }

  frame.innerHTML = `<div class="file-preview-placeholder">Preview not available for this file type.<br/>Selected: ${escapeHtml(file.name)}</div>`;
  applyPreviewColorMode();
}

$('fileInput').addEventListener('change', () => {
  const file = $('fileInput').files?.[0] || null;
  showFilePreview(file);
});

$('color').addEventListener('change', () => {
  applyPreviewColorMode();
});

(async function init() {
  try {
    await refreshAll();
    await refreshOrders();
  } catch (err) {
    toast(err.message, 'error');
  }
})();
