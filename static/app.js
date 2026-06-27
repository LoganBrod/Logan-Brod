/* ============================================================
   Card Comp Scanner — app.js
   ============================================================ */

const API_BASE = '';   // same origin; Flask serves everything

// ---- DOM refs ----
const uploadZone      = document.getElementById('upload-zone');
const fileInput       = document.getElementById('file-input');
const previewContainer= document.getElementById('preview-container');
const previewImg      = document.getElementById('preview-img');
const previewClear    = document.getElementById('preview-clear');
const ocrStatus       = document.getElementById('ocr-status');
const ocrStatusText   = document.getElementById('ocr-status-text');

const cameraModal     = document.getElementById('camera-modal');
const cameraVideo     = document.getElementById('camera-video');
const cameraCanvas    = document.getElementById('camera-canvas');
const btnCamera       = document.getElementById('btn-camera');
const btnSnap         = document.getElementById('btn-snap');
const btnCameraClose  = document.getElementById('btn-camera-close');

const fieldPlayer     = document.getElementById('field-player');
const fieldYear       = document.getElementById('field-year');
const fieldNumber     = document.getElementById('field-number');
const fieldSet        = document.getElementById('field-set');
const fieldVariation  = document.getElementById('field-variation');
const fieldGrade      = document.getElementById('field-grade');
const fieldGradeValue = document.getElementById('field-grade-value');

const btnSearch       = document.getElementById('btn-search');
const btnClearForm    = document.getElementById('btn-clear-form');
const btnCopyAvg      = document.getElementById('btn-copy-avg');

const emptyState      = document.getElementById('empty-state');
const summaryStrip    = document.getElementById('summary-strip');
const resultsWrap     = document.getElementById('results-wrap');
const loadingState    = document.getElementById('loading-state');
const noResultsState  = document.getElementById('no-results-state');
const errorState      = document.getElementById('error-state');
const errorMessage    = document.getElementById('error-message');
const resultsTable    = document.getElementById('results-table');
const resultsBody     = document.getElementById('results-body');
const queryDisplay    = document.getElementById('query-display');
const queryText       = document.getElementById('query-text');
const toast           = document.getElementById('toast');

const statAvg         = document.getElementById('stat-avg');
const statHigh        = document.getElementById('stat-high');
const statLow         = document.getElementById('stat-low');
const statCount       = document.getElementById('stat-count');

const ocrDot          = document.getElementById('ocr-dot');
const ocrLabel        = document.getElementById('ocr-label');

// ---- State ----
let allResults = [];
let currentFilter = 'all';
let sortCol = 'price';
let sortDir = -1; // -1 = desc
let cameraStream = null;
let currentAvg = null;

// ============================================================
// Health check
// ============================================================
async function checkHealth() {
  try {
    const r = await fetch(`${API_BASE}/api/health`);
    const d = await r.json();
    if (d.ocr_available) {
      ocrDot.className = 'ocr-status-dot online';
      ocrLabel.textContent = 'OCR ready';
    } else {
      ocrDot.className = 'ocr-status-dot offline';
      ocrLabel.textContent = 'OCR unavailable';
    }
  } catch {
    ocrDot.className = 'ocr-status-dot offline';
    ocrLabel.textContent = 'Backend offline';
  }
}
checkHealth();

// ============================================================
// Toast
// ============================================================
let toastTimer;
function showToast(msg, type = '') {
  toast.textContent = msg;
  toast.className = 'show' + (type ? ` ${type}` : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.className = ''; }, 2800);
}

// ============================================================
// Image preview helpers
// ============================================================
function showPreview(src) {
  previewImg.src = src;
  previewContainer.style.display = 'block';
}

function clearPreview() {
  previewImg.src = '';
  previewContainer.style.display = 'none';
  fileInput.value = '';
  hideOcrStatus();
}

function setOcrStatus(type, text) {
  ocrStatus.classList.add('visible');
  ocrStatus.className = 'visible ' + type;
  ocrStatusText.textContent = text;
  const spinner = ocrStatus.querySelector('.spinner');
  if (type === 'loading') {
    if (!spinner) {
      const s = document.createElement('div');
      s.className = 'spinner';
      ocrStatus.prepend(s);
    }
  } else {
    if (spinner) spinner.remove();
  }
}

function hideOcrStatus() {
  ocrStatus.classList.remove('visible');
}

// ============================================================
// File upload / drag-drop
// ============================================================
uploadZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  uploadZone.classList.add('drag-over');
});
uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('drag-over'));
uploadZone.addEventListener('drop', (e) => {
  e.preventDefault();
  uploadZone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file && file.type.startsWith('image/')) handleImageFile(file);
});

fileInput.addEventListener('change', () => {
  const file = fileInput.files[0];
  if (file) handleImageFile(file);
});

previewClear.addEventListener('click', clearPreview);

async function handleImageFile(file) {
  const url = URL.createObjectURL(file);
  showPreview(url);
  await runOcr(file);
}

async function runOcr(file) {
  setOcrStatus('loading', 'Running OCR…');
  try {
    const form = new FormData();
    form.append('image', file);
    const resp = await fetch(`${API_BASE}/api/ocr`, { method: 'POST', body: form });
    const data = await resp.json();
    console.log('OCR response:', data);

    if (data.error && !data.player) {
      setOcrStatus('error', `OCR: ${data.error}`);
      return;
    }

    // Populate form fields (don't overwrite if user already typed something)
    if (data.player)      fieldPlayer.value     = fieldPlayer.value || data.player;
    if (data.year)        fieldYear.value       = fieldYear.value || data.year;
    if (data.set)         fieldSet.value        = fieldSet.value || data.set;
    if (data.number)      fieldNumber.value     = fieldNumber.value || data.number;
    if (data.variation)   fieldVariation.value  = fieldVariation.value || data.variation;
    if (data.grade)       fieldGrade.value      = fieldGrade.value || data.grade;
    if (data.grade_value) fieldGradeValue.value = fieldGradeValue.value || data.grade_value;

    setOcrStatus('success', 'OCR complete — review fields below');
    showToast('Card details extracted from image', 'success');
  } catch (e) {
    setOcrStatus('error', 'OCR failed — fill in details manually');
  }
}

// ============================================================
// Camera
// ============================================================
btnCamera.addEventListener('click', async () => {
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' } },
    });
    cameraVideo.srcObject = cameraStream;
    cameraModal.classList.add('open');
  } catch (e) {
    showToast('Camera access denied or unavailable', 'error');
  }
});

function closeCamera() {
  if (cameraStream) {
    cameraStream.getTracks().forEach(t => t.stop());
    cameraStream = null;
  }
  cameraModal.classList.remove('open');
}

btnCameraClose.addEventListener('click', closeCamera);
cameraModal.addEventListener('click', (e) => { if (e.target === cameraModal) closeCamera(); });

btnSnap.addEventListener('click', () => {
  const w = cameraVideo.videoWidth;
  const h = cameraVideo.videoHeight;
  cameraCanvas.width = w;
  cameraCanvas.height = h;
  cameraCanvas.getContext('2d').drawImage(cameraVideo, 0, 0, w, h);
  cameraCanvas.toBlob(async (blob) => {
    closeCamera();
    const file = new File([blob], 'camera.jpg', { type: 'image/jpeg' });
    const url = URL.createObjectURL(blob);
    showPreview(url);
    await runOcr(file);
  }, 'image/jpeg', 0.92);
});

// ============================================================
// Build search query from form
// ============================================================
function buildQuery() {
  const parts = [];
  const year  = fieldYear.value.trim();
  const player= fieldPlayer.value.trim();
  const set   = fieldSet.value.trim();
  const num   = fieldNumber.value.trim();
  const vari  = fieldVariation.value.trim();
  const grade = fieldGrade.value.trim();
  const grVal = fieldGradeValue.value.trim();

  if (year)   parts.push(year);
  if (player) parts.push(player);
  if (set)    parts.push(set);
  if (num)    parts.push(`#${num}`);
  if (vari)   parts.push(vari);
  if (grade && grVal) parts.push(`${grade} ${grVal}`);

  return parts.join(' ');
}

function getCardPayload() {
  return {
    player:      fieldPlayer.value.trim(),
    year:        fieldYear.value.trim(),
    set:         fieldSet.value.trim(),
    number:      fieldNumber.value.trim(),
    variation:   fieldVariation.value.trim(),
    grade:       fieldGrade.value.trim(),
    grade_value: fieldGradeValue.value.trim(),
    query:       buildQuery(),
  };
}

// ============================================================
// Search comps
// ============================================================
btnSearch.addEventListener('click', searchComps);

document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') searchComps();
});

async function searchComps() {
  const query = buildQuery();
  if (!query) {
    showToast('Please fill in at least one card detail', 'error');
    fieldPlayer.focus();
    return;
  }

  // Show loading UI
  emptyState.style.display = 'none';
  summaryStrip.style.display = 'none';
  resultsWrap.style.display = 'block';
  resultsBody.innerHTML = '';
  loadingState.style.display = 'flex';
  noResultsState.style.display = 'none';
  errorState.style.display = 'none';
  resultsTable.style.display = 'none';
  queryDisplay.classList.add('visible');
  queryText.textContent = query;

  btnSearch.disabled = true;
  btnSearch.textContent = '⏳ Searching…';

  try {
    const resp = await fetch(`${API_BASE}/api/comps`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(getCardPayload()),
    });

    if (!resp.ok) {
      const d = await resp.json().catch(() => ({}));
      throw new Error(d.error || `HTTP ${resp.status}`);
    }

    const data = await resp.json();
    allResults = data.results || [];

    loadingState.style.display = 'none';

    // Always show quick links
    renderQuickLinks(data.quick_links || []);

    if (allResults.length === 0) {
      noResultsState.style.display = 'flex';
    } else {
      renderSummary(data.summary);
      renderTable();
      showToast(`Found ${allResults.length} comp${allResults.length !== 1 ? 's' : ''}`, 'success');
    }
  } catch (e) {
    loadingState.style.display = 'none';
    errorState.style.display = 'flex';
    errorMessage.textContent = e.message || 'Search failed. Is the backend running?';
  } finally {
    btnSearch.disabled = false;
    btnSearch.textContent = '🔍 Search Comps';
  }
}

// ============================================================
// Summary
// ============================================================
function renderQuickLinks(links) {
  let wrap = document.getElementById('quick-links-wrap');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.id = 'quick-links-wrap';
    wrap.style.cssText = 'margin:12px 0 8px;display:flex;flex-wrap:wrap;gap:8px;align-items:center;';
    const label = document.createElement('span');
    label.textContent = 'Search on:';
    label.style.cssText = 'color:var(--text-muted,#aaa);font-size:0.8rem;';
    wrap.appendChild(label);
    resultsWrap.insertBefore(wrap, resultsWrap.firstChild);
  }
  // Remove old link buttons
  wrap.querySelectorAll('a.ql-btn').forEach(el => el.remove());
  links.forEach(({ label, url }) => {
    const a = document.createElement('a');
    a.className = 'ql-btn';
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = label;
    a.style.cssText = 'background:var(--surface2,#1e2a3a);color:var(--gold,#f0b429);border:1px solid var(--gold,#f0b429);border-radius:6px;padding:4px 10px;font-size:0.78rem;text-decoration:none;white-space:nowrap;';
    wrap.appendChild(a);
  });
}

function renderSummary(summary) {
  if (!summary || !summary.count) {
    summaryStrip.style.display = 'none';
    return;
  }
  summaryStrip.style.display = 'block';
  currentAvg = summary.avg;
  statAvg.textContent   = formatPrice(summary.avg);
  statHigh.textContent  = formatPrice(summary.high);
  statLow.textContent   = formatPrice(summary.low);
  statCount.textContent = summary.count;
}

btnCopyAvg.addEventListener('click', () => {
  if (currentAvg === null) return;
  const text = formatPrice(currentAvg);
  navigator.clipboard.writeText(text).then(() => {
    showToast(`Copied ${text} to clipboard`, 'success');
  }).catch(() => {
    // Fallback
    const el = document.createElement('textarea');
    el.value = text;
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    el.remove();
    showToast(`Copied ${text} to clipboard`, 'success');
  });
});

// ============================================================
// Table rendering
// ============================================================
function getFilteredResults() {
  if (currentFilter === 'all') return [...allResults];
  return allResults.filter(r => r.source === currentFilter);
}

function renderTable() {
  const data = getFilteredResults();

  // Sort
  data.sort((a, b) => {
    let av = a[sortCol], bv = b[sortCol];
    if (sortCol === 'price') {
      av = av || 0; bv = bv || 0;
    } else {
      av = (av || '').toLowerCase();
      bv = (bv || '').toLowerCase();
    }
    if (av < bv) return -1 * sortDir;
    if (av > bv) return  1 * sortDir;
    return 0;
  });

  resultsTable.style.display = 'table';
  resultsBody.innerHTML = '';

  if (data.length === 0) {
    noResultsState.style.display = 'flex';
    resultsTable.style.display = 'none';
    return;
  }
  noResultsState.style.display = 'none';

  data.forEach(row => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="td-title" title="${esc(row.title)}">${esc(row.title)}</td>
      <td class="td-price">${formatPrice(row.price)}</td>
      <td class="td-date">${esc(row.date) || '—'}</td>
      <td class="td-source">${sourceBadge(row.source)}</td>
      <td class="td-link">${row.link ? `<a href="${esc(row.link)}" target="_blank" rel="noopener">↗ view</a>` : '—'}</td>
    `;
    resultsBody.appendChild(tr);
  });
}

// ---- Sort by column header ----
resultsTable.querySelectorAll('thead th[data-col]').forEach(th => {
  th.addEventListener('click', () => {
    const col = th.dataset.col;
    if (sortCol === col) {
      sortDir *= -1;
    } else {
      sortCol = col;
      sortDir = col === 'price' ? -1 : 1;
    }
    // Update header classes
    resultsTable.querySelectorAll('thead th').forEach(h => {
      h.classList.remove('sorted');
      const icon = h.querySelector('.sort-icon');
      if (icon) icon.textContent = '↕';
    });
    th.classList.add('sorted');
    const icon = th.querySelector('.sort-icon');
    if (icon) icon.textContent = sortDir === -1 ? '↓' : '↑';

    renderTable();
  });
});

// ---- Source filter pills ----
document.querySelectorAll('.filter-pill').forEach(pill => {
  pill.addEventListener('click', () => {
    document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
    currentFilter = pill.dataset.source;
    renderTable();
  });
});

// ============================================================
// Clear form
// ============================================================
btnClearForm.addEventListener('click', () => {
  fieldPlayer.value = '';
  fieldYear.value = '';
  fieldSet.value = '';
  fieldNumber.value = '';
  fieldVariation.value = '';
  fieldGrade.value = '';
  fieldGradeValue.value = '';
  clearPreview();
  // Reset results
  emptyState.style.display = 'block';
  summaryStrip.style.display = 'none';
  resultsWrap.style.display = 'none';
  queryDisplay.classList.remove('visible');
  allResults = [];
  currentAvg = null;
});

// ============================================================
// Utilities
// ============================================================
function formatPrice(val) {
  if (val === null || val === undefined || val === '') return '—';
  return '$' + Number(val).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function sourceBadge(source) {
  const cls = source === 'eBay' ? 'ebay' : source === '130point' ? 'point130' : 'goldin';
  return `<span class="source-badge ${cls}">${esc(source)}</span>`;
}
