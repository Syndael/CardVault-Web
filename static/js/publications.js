// ==================== PUBLICATIONS ====================

const pubState = {
    page: 1, perPage: 50, pages: 0, total: 0, loaded: 0, loading: false, hasNext: true,
    collection_code: '', product_number: '', product_name: '', sort: 'recent'
};

let pubViewMode = 'list';
let _pubSelectedInventories = [];
let _pubSelectedPurchases = [];
let _pubUploadedFiles = [];
let _pubIsCreating = false;
let _pubSelectedPlatforms = [];
let _pubPlatformDetails = {};
let _platformsData = {};
let _pubCurrentPubId = null;
let _pubCurrentFiles = [];
let _pubCurrentQs = '';

const _PLATFORM_LABELS = {
    instagram: 'Instagram',
    twitter: 'Twitter/X',
    tiktok: 'TikTok',
    threads: 'Threads',
    bluesky: 'BlueSky',
    telegram: 'Telegram',
};

const _PLATFORM_ORDER = {
    instagram: 10,
    twitter: 20,
    tiktok: 30,
    threads: 40,
    bluesky: 50,
    telegram: 99,
};

const _PLATFORM_CHAR_LIMITS = {
    instagram: 2200,
    twitter: 280,
    tiktok: 150,
    threads: 500,
    bluesky: 300,
    telegram: 1024,
};

function getPlatformLabel(platform) {
    return _platformsData[platform]?.name || _PLATFORM_LABELS[platform] || platform;
}

function getPlatformColor(platform) {
    return _platformsData[platform]?.color || '#666666';
}

async function loadPlatforms() {
    try {
        const resp = await apiFetch(apiUrl('types', {per_page: 200, type: 'platform'}));
        if (resp.ok) {
            const data = await resp.json();
            const platforms = data.items || data;
            platforms.forEach(p => {
                _platformsData[p.name] = p;
            });
        }
    } catch (e) {
        console.error('Error loading platforms:', e);
    }
}

loadPlatforms();

const _PUB_STATUSES = [
    {value: 'pending_review', label: 'En revisión'},
    {value: 'pending_publish', label: 'Pendiente de publicar'},
    {value: 'published', label: 'Publicado'},
    {value: 'failed', label: 'Fallido'},
    {value: 'cancelled', label: 'Cancelado'},
];

const pubBody = document.getElementById('publicationBody');
const pubEmpty = document.getElementById('publicationEmpty');
const pubSummary = document.getElementById('publicationSummary');
const pubSummaryScrollEl = document.querySelector('#tabPublications .scroll-note');
const pubSentinel = document.getElementById('publicationSentinel');

// Filter events
['pubFilterColCode', 'pubFilterNumber', 'pubFilterName', 'pubSortOrder'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', () => loadPublications({reset: true}));
    if (el && el.tagName === 'INPUT') el.addEventListener('input', debounce(() => loadPublications({reset: true}), 300));
});

function debounce(fn, ms) {
    let timer;
    return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
}

// View toggle
document.querySelectorAll('#tabPublications .view-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('#tabPublications .view-btn').forEach(b => {
            b.style.background = 'transparent';
            b.classList.remove('active');
        });
        btn.style.background = 'var(--surface-strong)';
        btn.classList.add('active');
        pubViewMode = btn.dataset.view;
        const tw = document.querySelector('#tabPublications .table-wrap');
        tw.className = 'table-wrap';
        if (pubViewMode !== 'list') tw.classList.add('view-' + pubViewMode);
        loadPublications({reset: true});
    });
});

// + New publication button
document.getElementById('btnNewPublication')?.addEventListener('click', () => openNewPub());

async function loadPublications(opts) {
    if (opts && opts.reset) {
        pubState.page = 1;
        pubState.loaded = 0;
        pubState.hasNext = true;
        pubBody.innerHTML = '';
        pubEmpty.hidden = true;
    }
    if (pubState.loading || !pubState.hasNext) return;
    pubState.loading = true;

    pubState.collection_code = document.getElementById('pubFilterColCode')?.value || '';
    pubState.product_number = document.getElementById('pubFilterNumber')?.value || '';
    pubState.product_name = document.getElementById('pubFilterName')?.value || '';
    pubState.sort = document.getElementById('pubSortOrder')?.value || 'recent';

    const params = {page: pubState.page, per_page: pubState.perPage, sort: pubState.sort};
    if (pubState.collection_code) params.collection_code = pubState.collection_code;
    if (pubState.product_number) params.product_number = pubState.product_number;
    if (pubState.product_name) params.product_name = pubState.product_name;

    try {
        const resp = await apiFetch(apiUrl('publications', params));
        if (!resp.ok) { pubBody.innerHTML = '<tr><td colspan="10" class="error-state">Error al cargar</td></tr>'; pubState.loading = false; pubState.hasNext = false; return; }
        const data = await resp.json();
        const items = data.items || [];
        const pag = data.pagination || {};
        pubState.pages = pag.pages || 0;
        pubState.total = pag.total || 0;
        pubState.hasNext = pubState.page < pubState.pages;

        if (!items.length && pubState.loaded === 0) { pubBody.innerHTML = ''; pubEmpty.hidden = false; pubSummary.textContent = '0 publicaciones'; pubState.loading = false; return; }
        pubEmpty.hidden = true;

        for (const item of items) {
            const row = buildPubRow(item);
            pubBody.insertAdjacentHTML('beforeend', row);
        }
        loadImages(pubBody);
        const prevLoaded = pubState.loaded;
        pubState.loaded += items.length;
        pubState.page++;
        const first = prevLoaded + 1;
        pubSummary.textContent = `${first}-${pubState.loaded} de ${pubState.total} publicaciones`;
        if (pubSummaryScrollEl) pubSummaryScrollEl.textContent = pubState.hasNext ? 'Scroll para cargar más' : 'No hay más publicaciones';
    } catch (e) { console.error(e); pubBody.innerHTML = '<tr><td colspan="10" class="error-state">Error de conexi\u00f3n</td></tr>'; pubState.hasNext = false; if (pubSummaryScrollEl) pubSummaryScrollEl.textContent = 'Error al cargar'; }
    pubState.loading = false;
}

function buildPubRow(item) {
    const inventories = item.inventories || [];
    const firstInv = inventories[0] || {};
    const prodName = firstInv.product_name || '';
    const colCode = firstInv.collection_code || '';
    const prodNumber = firstInv.product_number || '';

    let codeNum = esc(colCode || '-');
    if (prodNumber) codeNum += ' ' + esc(prodNumber);

    const nameDisplay = item.title
        ? `<strong>${esc(item.title)}</strong>`
        : (prodName ? `<strong>${esc(prodName)}</strong>` : '<em style="color:var(--muted)">(sin nombre)</em>');

    const nameCell = item.title
        ? nameDisplay
        : `<span style="color:var(--muted)">(${codeNum})</span> ${nameDisplay}`;

    const captionPreview = (item.caption || '').substring(0, 80);
    const captionDisplay = captionPreview ? esc(captionPreview) + (item.caption?.length > 80 ? '...' : '') : '<span style="color:var(--muted)">auto</span>';

    const scheduledDate = item.scheduled_at ? item.scheduled_at.slice(0, 16).replace('T', ' ') : '-';

    const photoCount = item.photo_count || 0;

    const placeholder = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";
    let thumbHtml;
    if (item.first_photo_id) {
        const imgUrl = apiUrl(`product-catalog/files/${item.first_photo_id}/content`);
        const sep = imgUrl.includes('?') ? '&' : '?';
        thumbHtml = `<div class="inv-img-thumb"><img class="product-thumb-img" src="${placeholder}" data-src="${esc(imgUrl + sep + 'size=sm')}" alt="" loading="lazy"></div>`;
    } else {
        thumbHtml = `<div class="inv-img-thumb"><svg class="thumb-placeholder" viewBox="0 0 24 24" width="42" height="42" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"></rect><path d="m8 14 2.5-2.5L14 15l2-2 3 3"></path><circle cx="8.5" cy="8.5" r="1.5"></circle></svg></div>`;
    }

    let inventoryBadges = '';
    if (inventories.length > 1) {
        inventoryBadges = `<span style="font-size:11px;color:var(--muted)">+${inventories.length - 1} m&aacute;s</span>`;
    }

    const details = item.details || [];
    const platformBadges = details.map(d => {
        const label = (getPlatformLabel(d.platform)).substring(0, 2).toUpperCase();
        const color = getPlatformColor(d.platform);
        const st = d.status || '';
        let cls = '';
        if (st === 'published') cls = 'status-ok';
        else if (st === 'failed') cls = 'status-err';
        else cls = 'status-warn';
        return `<span class="${cls}" style="font-size:10px;padding:1px 4px;margin-right:2px;color:${color};font-weight:bold" title="${esc(getPlatformLabel(d.platform))}: ${st}">${label}</span>`;
    }).join('');

    const deleteBtn = `<button type="button" class="btn-delete-pub" data-pub-id="${item.id}" title="Eliminar" style="background:none;border:none;color:var(--red);cursor:pointer;font-size:18px;line-height:1;padding:2px 6px">&times;</button>`;

    return `<tr class="clickable-row" data-pub-id="${item.id}">
        <td class="inv-img-cell">${thumbHtml}</td>
        <td>${colCode ? esc(colCode) + inventoryBadges : '<span style="color:var(--muted)">manual</span>'}</td>
        <td style="white-space:nowrap">${esc(prodNumber || '-')}</td>
        <td>${nameCell}</td>
        <td style="max-width:250px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(item.caption || '')}">${captionDisplay}</td>
        <td style="text-align:center">${photoCount > 0 ? photoCount : '<span style="color:var(--red)">0</span>'}</td>
        <td style="font-size:12px">${scheduledDate}</td>
        <td>${platformBadges || '<span style="color:var(--muted)">-</span>'}</td>
        <td style="text-align:center;white-space:nowrap">${deleteBtn}</td>
    </tr>`;
}

// Click row → open edit modal
document.addEventListener('click', (e) => {
    const row = e.target.closest('[data-pub-id]');
    if (!row) return;
    if (e.target.closest('button')) return;
    openEditPub(parseInt(row.dataset.pubId));
});

// Delete
document.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-delete-pub');
    if (!btn) return;
    e.stopPropagation();
    const pubId = parseInt(btn.dataset.pubId);
    if (!confirm('Eliminar esta publicaci\u00f3n definitivamente?')) return;
    apiFetch(apiUrl(`publications/${pubId}`), {method: 'DELETE'}).then(r => {
        if (!r.ok) { showToast('Error al eliminar', 'error'); return; }
        showToast('Publicaci\u00f3n eliminada', 'success');
        loadPublications({reset: true});
    }).catch(() => showToast('Error de conexi\u00f3n', 'error'));
});

// ============= MODAL =============
const editPubModal = document.getElementById('editPubModal');
const pubCalPanel = document.getElementById('pubCalendarPanel');

function _syncPubOverflow() {
    const anyOpen = ['editPubModal'].some(id => {
        const el = document.getElementById(id);
        return el && !el.hidden;
    });
    document.body.style.overflow = anyOpen ? 'hidden' : '';
}

function closeEditPub() {
    editPubModal.hidden = true;
    _syncPubOverflow();
    if (pubCalPanel && !pubCalPanel.hidden) loadPubCalendar().then(renderPubCalendar);
}

document.getElementById('editPubCancel')?.addEventListener('click', closeEditPub);
document.getElementById('editPubBackdrop')?.addEventListener('click', closeEditPub);

function _resetPubModal() {
    document.getElementById('editPubId').value = '';
    document.getElementById('editPubTitle').value = '';
    document.getElementById('editPubScheduled').value = '';
    document.getElementById('editPubCaption').value = '';
    document.getElementById('editPubAiText').value = '';
    document.getElementById('pubInvSearch').value = '';
    document.getElementById('pubInvResults').style.display = 'none';
    document.getElementById('pubInvSelected').innerHTML = '';
    document.getElementById('pubPurSearch').value = '';
    document.getElementById('pubPurResults').style.display = 'none';
    document.getElementById('pubPurSelected').innerHTML = '';
    document.getElementById('pubFilesPreview').innerHTML = '';
    _pubSelectedInventories = [];
    _pubSelectedPurchases = [];
    _pubUploadedFiles = [];
    _pubIsCreating = false;
    _pubSelectedPlatforms = [];
    _pubPlatformDetails = {};
    _pubCurrentPubId = null;
    _pubCurrentFiles = [];
    _pubCurrentQs = '';
    document.querySelectorAll('.pub-platform-cb').forEach(cb => cb.checked = false);
    document.getElementById('pubPlatformDetails').innerHTML = '';
}

function _renderPlatformDetails() {
    const container = document.getElementById('pubPlatformDetails');
    const globalScheduled = document.getElementById('editPubScheduled')?.value || '';
    const sorted = [..._pubSelectedPlatforms].sort((a, b) => (_PLATFORM_ORDER[a] || 50) - (_PLATFORM_ORDER[b] || 50));
    const broadcastPlatforms = ['twitter', 'threads', 'bluesky', 'telegram'];
    const statusOptions = _PUB_STATUSES.map(s => `<option value="${s.value}">${s.label}</option>`).join('');

    container.style.display = 'grid';
    container.style.gridTemplateColumns = '1fr 1fr';
    container.style.gap = '8px';

    container.innerHTML = sorted.map(platform => {
        const label = getPlatformLabel(platform);
        const color = getPlatformColor(platform);
        const detail = _pubPlatformDetails[platform] || {};
        const caption = detail.caption || '';
        const scheduled = detail.scheduled_at ? detail.scheduled_at.slice(0, 16) : globalScheduled;
        const publishedAt = detail.published_at ? detail.published_at.slice(0, 16).replace('T', ' ') : '';
        const permalink = detail.permalink || '';
        const errorMessage = detail.error_message || '';
        const status = detail.status || 'pending_review';
        const charLimit = _PLATFORM_CHAR_LIMITS[platform] || 9999;
        const isBroadcast = broadcastPlatforms.includes(platform);
        const tagHelp = isBroadcast ? `<div style="font-size:10px;color:var(--muted);margin-top:2px">Tags: <code>&lt;TITULO&gt;</code> <code>&lt;URL_IG&gt;</code> <code>&lt;URL_TIKTOK&gt;</code></div>` : '';
        const errorRow = errorMessage ? `<div style="font-size:11px;color:var(--red);padding:4px;background:rgba(255,0,0,0.05);border-radius:3px;margin-bottom:4px">${esc(errorMessage)}</div>` : '';
        const permalinkDisplay = permalink
            ? `<a href="${esc(permalink)}" target="_blank" rel="noopener" style="font-size:11px;color:var(--cyan);word-break:break-all">${esc(permalink)}</a>`
            : `<span style="font-size:11px;color:var(--muted)">-</span>`;
        const broadcastCheck = isBroadcast
            ? `<label style="display:flex;align-items:center;gap:4px;font-size:11px;cursor:pointer;margin-bottom:4px"><input type="checkbox" class="pub-platform-broadcast" data-platform="${platform}" ${detail.is_broadcast ? 'checked' : ''}> Texto difusión (autogenerado)</label>`
            : '';

        return `<div class="pub-platform-section" data-platform="${platform}" style="border:1px solid var(--border);border-radius:6px;padding:8px;background:var(--surface)">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
                <strong style="font-size:12px;color:${color}">${esc(label)}</strong>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-bottom:4px">
                <div class="field" style="margin-bottom:0">
                    <label style="font-size:11px">Estado</label>
                    <select class="pub-platform-status" data-platform="${platform}" style="width:100%;padding:3px;border:1px solid var(--border);border-radius:3px;background:var(--surface-strong);color:var(--text);font-size:11px">${statusOptions.replace(`value="${status}"`, `value="${status}" selected`)}</select>
                </div>
                <div class="field" style="margin-bottom:0">
                    <label style="font-size:11px">Programado</label>
                    <input type="datetime-local" class="pub-platform-scheduled" data-platform="${platform}" value="${esc(scheduled)}" style="width:100%;padding:3px;border:1px solid var(--border);border-radius:3px;background:var(--surface-strong);color:var(--text);font-size:11px">
                </div>
                <div class="field" style="margin-bottom:0">
                    <label style="font-size:11px">Publicado</label>
                    <input type="text" value="${esc(publishedAt)}" readonly style="width:100%;padding:3px;border:1px solid var(--border);border-radius:3px;background:var(--surface-strong);color:var(--muted);font-size:11px" placeholder="-">
                </div>
            </div>
            <div class="field" style="margin-bottom:4px">
                <label style="font-size:11px">Enlace</label>
                <div style="padding:3px">${permalinkDisplay}</div>
            </div>
            ${errorRow}
            ${broadcastCheck}
            <div class="field" style="margin-bottom:0">
                <label style="font-size:11px">Caption <span style="color:var(--muted)">(vacío = global)</span></label>
                <textarea class="pub-platform-caption" data-platform="${platform}" rows="3" style="width:100%;padding:4px;border:1px solid var(--border);border-radius:3px;background:var(--surface-strong);color:var(--text);font-size:11px;resize:vertical;font-family:inherit" placeholder="(usa texto global)">${esc(caption)}</textarea>
                <div style="display:flex;justify-content:space-between;align-items:center;margin-top:2px">
                    ${tagHelp}
                    <span class="pub-platform-chars" data-platform="${platform}" style="font-size:10px;color:var(--muted)">${caption.length}/${charLimit}</span>
                </div>
            </div>
        </div>`;
    }).join('');

    container.querySelectorAll('.pub-platform-caption').forEach(ta => {
        ta.addEventListener('input', () => {
            const p = ta.dataset.platform;
            _pubPlatformDetails[p] = _pubPlatformDetails[p] || {};
            _pubPlatformDetails[p].caption = ta.value;
            const charLimit = _PLATFORM_CHAR_LIMITS[p] || 9999;
            const counter = container.querySelector(`.pub-platform-chars[data-platform="${p}"]`);
            if (counter) {
                counter.textContent = `${ta.value.length}/${charLimit}`;
                counter.style.color = ta.value.length > charLimit ? 'var(--red)' : 'var(--muted)';
            }
        });
    });
    container.querySelectorAll('.pub-platform-scheduled').forEach(inp => {
        inp.addEventListener('change', () => {
            const p = inp.dataset.platform;
            _pubPlatformDetails[p] = _pubPlatformDetails[p] || {};
            _pubPlatformDetails[p].scheduled_at = inp.value ? inp.value + ':00' : null;
        });
    });
    container.querySelectorAll('.pub-platform-status').forEach(sel => {
        sel.addEventListener('change', () => {
            const p = sel.dataset.platform;
            _pubPlatformDetails[p] = _pubPlatformDetails[p] || {};
            _pubPlatformDetails[p].status = sel.value;
        });
    });
    container.querySelectorAll('.pub-platform-broadcast').forEach(cb => {
        cb.addEventListener('change', () => {
            const p = cb.dataset.platform;
            _pubPlatformDetails[p] = _pubPlatformDetails[p] || {};
            _pubPlatformDetails[p].is_broadcast = cb.checked;
            if (cb.checked) {
                const broadcastText = _generateBroadcastText(p);
                _pubPlatformDetails[p].caption = broadcastText;
                const textarea = container.querySelector(`.pub-platform-caption[data-platform="${p}"]`);
                if (textarea) {
                    textarea.value = broadcastText;
                    const charLimit = _PLATFORM_CHAR_LIMITS[p] || 9999;
                    const counter = container.querySelector(`.pub-platform-chars[data-platform="${p}"]`);
                    if (counter) counter.textContent = `${broadcastText.length}/${charLimit}`;
                }
            }
        });
    });
}

function _generateBroadcastText(platform) {
    const title = document.getElementById('editPubTitle')?.value || '';
    const contentPlatforms = {instagram: 'URL_IG', tiktok: 'URL_TIKTOK'};
    const titleText = title || '<TITULO>';
    const lines = [`¡Nueva publicación! ${titleText}`];
    const availableLines = [];
    for (const [cp, tag] of Object.entries(contentPlatforms)) {
        if (_pubSelectedPlatforms.includes(cp)) {
            const label = cp === 'instagram' ? 'Instagram' : 'TikTok';
            availableLines.push(`${label}: <${tag}>`);
        }
    }
    if (availableLines.length > 0) {
        lines.push('Disponible en:');
        lines.push(...availableLines);
    }
    return lines.join('\n');
}

document.addEventListener('change', (e) => {
    if (e.target.classList.contains('pub-platform-cb')) {
        const platform = e.target.value;
        if (e.target.checked) {
            if (!_pubSelectedPlatforms.includes(platform)) {
                _pubSelectedPlatforms.push(platform);
                const globalScheduled = document.getElementById('editPubScheduled')?.value || '';
                const broadcastPlatforms = ['twitter', 'threads', 'bluesky', 'telegram'];
                const isBroadcast = broadcastPlatforms.includes(platform);
                _pubPlatformDetails[platform] = _pubPlatformDetails[platform] || {
                    scheduled_at: globalScheduled ? globalScheduled + ':00' : '',
                    status: 'pending_publish',
                    is_broadcast: isBroadcast,
                    caption: isBroadcast ? _generateBroadcastText(platform) : ''
                };
            }
        } else {
            _pubSelectedPlatforms = _pubSelectedPlatforms.filter(p => p !== platform);
            delete _pubPlatformDetails[platform];
        }
        _renderPlatformDetails();
        if (_pubCurrentPubId) {
            _renderPubFilesPreview(_pubCurrentPubId, _pubCurrentFiles, _pubCurrentQs);
        }
    }
});

function openNewPub() {
    _resetPubModal();
    _pubIsCreating = true;
    document.getElementById('pubModalTitle').textContent = 'Nueva publicaci\u00f3n';
    editPubModal.hidden = false;
    _syncPubOverflow();
    _bindAiButton();
}

function _renderInvBadges() {
    const container = document.getElementById('pubInvSelected');
    container.innerHTML = _pubSelectedInventories.map(inv => {
        const label = `${inv.collection_code || ''} ${inv.product_number || ''} ${inv.product_name || ''}`.trim() || `#${inv.id}`;
        return `<span class="tag-badge" style="display:inline-flex;align-items:center;gap:4px;padding:3px 8px;background:var(--surface-strong);border:1px solid var(--border);border-radius:12px;font-size:12px">
            ${esc(label)}
            <button type="button" data-remove-inv="${inv.id}" style="background:none;border:none;cursor:pointer;font-size:14px;line-height:1;color:var(--red);padding:0">&times;</button>
        </span>`;
    }).join('');
}

function _renderPurBadges() {
    const container = document.getElementById('pubPurSelected');
    container.innerHTML = _pubSelectedPurchases.map(pur => {
        const seller = pur.entity?.name || 'Compra';
        const ref = pur.external_reference ? ` (${pur.external_reference})` : '';
        const label = `${seller}${ref} #${pur.id}`;
        return `<span class="tag-badge" style="display:inline-flex;align-items:center;gap:4px;padding:3px 8px;background:var(--surface-strong);border:1px solid var(--border);border-radius:12px;font-size:12px">
            ${esc(label)}
            <button type="button" data-remove-pur="${pur.id}" style="background:none;border:none;cursor:pointer;font-size:14px;line-height:1;color:var(--red);padding:0">&times;</button>
        </span>`;
    }).join('');
}

document.addEventListener('click', (e) => {
    const rmInv = e.target.closest('[data-remove-inv]');
    if (rmInv) {
        const id = parseInt(rmInv.dataset.removeInv);
        _pubSelectedInventories = _pubSelectedInventories.filter(i => i.id !== id);
        _renderInvBadges();
        return;
    }
    const rmPur = e.target.closest('[data-remove-pur]');
    if (rmPur) {
        const id = parseInt(rmPur.dataset.removePur);
        _pubSelectedPurchases = _pubSelectedPurchases.filter(p => p.id !== id);
        _renderPurBadges();
        return;
    }
});

// Inventory search
document.getElementById('pubInvSearch')?.addEventListener('input', debounce(async () => {
    const q = document.getElementById('pubInvSearch').value.trim();
    const resultsDiv = document.getElementById('pubInvResults');
    if (!q || q.length < 2) { resultsDiv.style.display = 'none'; return; }
    try {
        const resp = await apiFetch(apiUrl('inventory', {product_name: q, all: '1', per_page: 8}));
        if (!resp.ok) { resultsDiv.style.display = 'none'; return; }
        const data = await resp.json();
        const items = (data.items || []).filter(item => !_pubSelectedInventories.some(s => s.id === item.id));
        if (!items.length) { resultsDiv.innerHTML = '<div style="padding:8px;color:var(--muted);font-size:12px">Sin resultados</div>'; resultsDiv.style.display = 'block'; return; }
        const token = localStorage.getItem(TOKEN_KEY) || '';
        resultsDiv.innerHTML = items.map(item => {
            const prod = item.product || {};
            const col = item.collection || {};
            const name = getProductName(prod.translations || [], item.language_id);
            const label = `${col.code || ''} ${prod.product_number || ''} ${name}`.trim() || `#${item.id}`;
            return `<div data-select-inv="${item.id}" style="padding:6px 8px;cursor:pointer;border-bottom:1px solid var(--border);font-size:12px;display:flex;align-items:center;gap:8px"
                onmouseover="this.style.background='var(--surface-strong)'" onmouseout="this.style.background=''">
                <span style="color:var(--muted);font-weight:600">#${item.id}</span> ${esc(label)}
            </div>`;
        }).join('');
        resultsDiv.style.display = 'block';
        resultsDiv.querySelectorAll('[data-select-inv]').forEach(el => {
            el.addEventListener('click', () => {
                const id = parseInt(el.dataset.selectInv);
                const item = items.find(i => i.id === id);
                if (item) {
                    _pubSelectedInventories.push(item);
                    _renderInvBadges();
                    document.getElementById('pubInvSearch').value = '';
                    resultsDiv.style.display = 'none';
                }
            });
        });
    } catch (e) { console.error(e); }
}, 300));

// Purchase search
document.getElementById('pubPurSearch')?.addEventListener('input', debounce(async () => {
    const q = document.getElementById('pubPurSearch').value.trim();
    const resultsDiv = document.getElementById('pubPurResults');
    if (!q || q.length < 2) { resultsDiv.style.display = 'none'; return; }
    try {
        const resp = await apiFetch(apiUrl('purchases', {external_reference: q, per_page: 8}));
        if (!resp.ok) { resultsDiv.style.display = 'none'; return; }
        const data = await resp.json();
        const items = (data.items || []).filter(item => !_pubSelectedPurchases.some(s => s.id === item.id));
        if (!items.length) {
            // try entity name search
            try {
                const resp2 = await apiFetch(apiUrl('purchases', {per_page: 8}));
                if (resp2.ok) {
                    const data2 = await resp2.json();
                    const all = (data2.items || []).filter(item => {
                        const ename = (item.entity?.name || '').toLowerCase();
                        return ename.includes(q.toLowerCase()) && !_pubSelectedPurchases.some(s => s.id === item.id);
                    });
                    if (all.length) {
                        resultsDiv.innerHTML = all.map(pur => {
                            const seller = pur.entity?.name || 'Compra';
                            const ref = pur.external_reference ? ` (${pur.external_reference})` : '';
                            const amt = pur.total_amount ? ` - ${pur.total_amount} ${pur.currency || 'EUR'}` : '';
                            return `<div data-select-pur="${pur.id}" style="padding:6px 8px;cursor:pointer;border-bottom:1px solid var(--border);font-size:12px"
                                onmouseover="this.style.background='var(--surface-strong)'" onmouseout="this.style.background=''">
                                <span style="color:var(--muted);font-weight:600">#${pur.id}</span> ${esc(seller + ref)}${amt}
                            </div>`;
                        }).join('');
                        resultsDiv.style.display = 'block';
                        _bindPurClicks();
                        return;
                    }
                }
            } catch (_) {}
            resultsDiv.innerHTML = '<div style="padding:8px;color:var(--muted);font-size:12px">Sin resultados</div>';
            resultsDiv.style.display = 'block';
            return;
        }
        resultsDiv.innerHTML = items.map(pur => {
            const seller = pur.entity?.name || 'Compra';
            const ref = pur.external_reference ? ` (${pur.external_reference})` : '';
            const amt = pur.total_amount ? ` - ${pur.total_amount} ${pur.currency || 'EUR'}` : '';
            return `<div data-select-pur="${pur.id}" style="padding:6px 8px;cursor:pointer;border-bottom:1px solid var(--border);font-size:12px"
                onmouseover="this.style.background='var(--surface-strong)'" onmouseout="this.style.background=''">
                <span style="color:var(--muted);font-weight:600">#${pur.id}</span> ${esc(seller + ref)}${amt}
            </div>`;
        }).join('');
        resultsDiv.style.display = 'block';
        _bindPurClicks();
    } catch (e) { console.error(e); }
}, 300));

function _bindPurClicks() {
    document.querySelectorAll('#pubPurResults [data-select-pur]').forEach(el => {
        el.addEventListener('click', () => {
            const id = parseInt(el.dataset.selectPur);
            fetchItem(id);
        });
    });
}

async function fetchItem(purId) {
    try {
        const resp = await apiFetch(apiUrl(`purchases/${purId}`));
        if (!resp.ok) return;
        const pur = await resp.json();
        _pubSelectedPurchases.push(pur);
        _renderPurBadges();
        document.getElementById('pubPurSearch').value = '';
        document.getElementById('pubPurResults').style.display = 'none';
    } catch (_) {}
}

// File upload
const dropzone = document.getElementById('pubFileDropzone');
const fileInput = document.getElementById('pubFileInput');

if (dropzone && fileInput) {
    dropzone.addEventListener('click', () => fileInput.click());
    dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.style.borderColor = 'var(--primary)'; });
    dropzone.addEventListener('dragleave', () => { dropzone.style.borderColor = 'var(--border)'; });
    dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.style.borderColor = 'var(--border)';
        handlePubFiles(e.dataTransfer.files);
    });
    fileInput.addEventListener('change', () => {
        handlePubFiles(fileInput.files);
        fileInput.value = '';
    });
}

function handlePubFiles(fileList) {
    _pubUploadedFiles.push(...Array.from(fileList));
    _renderFilePreviews();
}

function _renderFilePreviews() {
    const container = document.getElementById('pubFilesPreview');
    const token = localStorage.getItem(TOKEN_KEY) || '';
    container.querySelectorAll('[data-remove-pub-file]').forEach(el => el.closest('.file-thumb-wrap')?.remove());
    const platforms = _pubSelectedPlatforms;
    _pubUploadedFiles.forEach((file, idx) => {
        const isImg = file.type.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|bmp|svg|ico|tiff|avif)$/i.test(file.name);
        const isVideo = file.type.startsWith('video/') || /\.(mp4|mov|webm|avi|mkv|m4v|ogg|ogv|wmv|flv|3gp|3g2)$/i.test(file.name);
        const blobUrl = URL.createObjectURL(file);
        const isOther = !isImg && !isVideo;
        const preview = isImg
            ? `<img src="${blobUrl}" alt="${esc(file.name)}" class="pub-img-thumb">`
            : isVideo
            ? `<video src="${blobUrl}" preload="auto" playsinline controls class="pub-video-thumb"></video>`
            : `<div class="pub-other-thumb">${esc(file.name.split('.').pop().toUpperCase())}</div>`;
        const wrapClass = isVideo ? 'file-thumb-wrap pub-video-wrap' : 'file-thumb-wrap';
        const orderInputs = platforms.map(p => {
            const label = getPlatformLabel(p);
            const color = getPlatformColor(p);
            const shortLabel = label.substring(0, 2).toUpperCase();
            return `<label style="font-size:11px;color:var(--muted);display:flex;align-items:center;gap:3px;justify-content:space-between" title="${label}"><span style="color:${color};font-weight:bold">${shortLabel}</span><input type="number" class="pub-platform-order" data-file-idx="${idx}" data-platform="${p}" placeholder="-" min="0" step="1" style="width:50px;padding:3px 4px;border:1px solid var(--border);border-radius:3px;font-size:12px;text-align:center"></label>`;
        }).join('');
        container.innerHTML += `<div class="${wrapClass}" style="display:flex;flex-direction:column;align-items:center;gap:3px">
            ${preview}
            <div style="display:flex;flex-wrap:wrap;gap:4px;justify-content:center">${orderInputs}</div>
            <button type="button" data-remove-pub-file="${idx}" style="background:none;border:none;cursor:pointer;font-size:14px;color:var(--red);padding:0" title="Eliminar">&times;</button>
        </div>`;
    });

    container.querySelectorAll('.pub-platform-order').forEach(inp => {
        inp.addEventListener('change', () => {
            const idx = parseInt(inp.dataset.fileIdx);
            const platform = inp.dataset.platform;
            const val = inp.value.trim();
            if (!_pubUploadedFiles[idx]._platformOrders) _pubUploadedFiles[idx]._platformOrders = {};
            _pubUploadedFiles[idx]._platformOrders[platform] = val ? parseInt(val) : null;
        });
    });
}

function _renderPubFilesPreview(pubId, allFiles, qs) {
    const container = document.getElementById('pubFilesPreview');
    const platforms = _pubSelectedPlatforms;

    if (!allFiles.length) {
        container.innerHTML = '<span style="color:var(--muted);font-size:13px">Sin archivos directos</span>';
        return;
    }

    container.innerHTML = allFiles.map(f => {
        const fileUrl = apiUrl(`product-catalog/files/${f.id}/content`) + qs;
        const typeName = f.file_type?.name || '';
        const origName = (f.original_name || '');
        const isVideo = typeName.startsWith('video') || /\.(mp4|mov|webm|avi|mkv|m4v|ogg|ogv|wmv|flv|3gp|3g2)$/i.test(origName);
        const isLinked = !!(f.inventory || f.purchase);
        const delBtn = !isLinked
            ? `<button type="button" class="pub-file-delete" data-del-file-id="${f.id}" title="Eliminar archivo">&times;</button>`
            : '';
        const linkedBadge = isLinked
            ? `<span class="pub-file-linked" title="Archivo vinculado desde ${f.inventory ? 'inventario' : 'compra'}, no se puede eliminar aquí">&#128279;</span>`
            : '';
        const preview = isVideo
            ? `<video src="${esc(fileUrl)}" preload="metadata" playsinline controls class="pub-video-thumb"></video>`
            : `<img class="file-thumb pub-img-thumb" src="${esc(fileUrl)}" alt="${esc(f.original_name || '')}">`;
        const wrapClass = isVideo ? 'file-thumb-wrap pub-video-wrap' : 'file-thumb-wrap';

        const orderInputs = platforms.map(p => {
            const label = getPlatformLabel(p);
            const color = getPlatformColor(p);
            const shortLabel = label.substring(0, 2).toUpperCase();
            const detail = _pubPlatformDetails[p] || {};
            const detailFiles = detail.files || [];
            const fileEntry = detailFiles.find(df => df.file_id === f.id);
            const val = fileEntry ? fileEntry.sort_order : '';
            return `<label style="font-size:11px;color:var(--muted);display:flex;align-items:center;gap:3px;justify-content:space-between" title="${label}"><span style="color:${color};font-weight:bold">${shortLabel}</span><input type="number" class="pub-detail-order-input" data-file-id="${f.id}" data-platform="${p}" value="${val}" placeholder="-" min="0" step="1" style="width:50px;padding:3px 4px;border:1px solid var(--border);border-radius:3px;font-size:12px;text-align:center"></label>`;
        }).join('');

        return `<div class="${wrapClass}" data-file-id="${f.id}">
            <div class="pub-file-preview">${linkedBadge}${delBtn}${isVideo ? preview : `<a href="${esc(fileUrl)}" target="_blank" rel="noopener">${preview}</a>`}</div>
            <div style="display:flex;flex-wrap:wrap;gap:4px;justify-content:center;padding:3px 0">${orderInputs}</div>
        </div>`;
    }).join('');

    container.querySelectorAll('.pub-detail-order-input').forEach(inp => {
        inp.addEventListener('change', () => savePubDetailOrders(pubId));
    });
    container.querySelectorAll('.pub-file-delete').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            const fileId = parseInt(btn.dataset.delFileId);
            if (!confirm('¿Eliminar este archivo de la publicación?')) return;
            btn.disabled = true;
            try {
                const resp = await apiFetch(apiUrl(`files/${fileId}`), {method: 'DELETE'});
                if (resp.ok) {
                    btn.closest('.file-thumb-wrap')?.remove();
                    showToast('Archivo eliminado', 'success');
                } else {
                    showToast('Error al eliminar', 'error');
                    btn.disabled = false;
                }
            } catch (e) {
                console.error(e);
                showToast('Error de conexión', 'error');
                btn.disabled = false;
            }
        });
    });
}

async function savePubDetailOrders(pubId) {
    const container = document.getElementById('pubFilesPreview');
    if (!container) return;

    const platformFileIds = {};
    container.querySelectorAll('.pub-detail-order-input').forEach(inp => {
        const fid = parseInt(inp.dataset.fileId);
        const platform = inp.dataset.platform;
        const val = inp.value.trim();
        if (val !== '') {
            if (!platformFileIds[platform]) platformFileIds[platform] = [];
            platformFileIds[platform].push({fileId: fid, order: parseInt(val, 10)});
        }
    });

    console.log('Saving orders:', platformFileIds);

    for (const platform of Object.keys(platformFileIds)) {
        const detail = _pubPlatformDetails[platform] || {};
        if (!detail.id) {
            console.warn(`No detail ID for platform ${platform}`);
            continue;
        }
        const entries = platformFileIds[platform].sort((a, b) => a.order - b.order);
        const fileIds = entries.map(e => e.fileId);
        console.log(`PUT publication-details/${detail.id}/files`, {file_ids: fileIds});
        try {
            const resp = await apiFetch(apiUrl(`publication-details/${detail.id}/files`), {
                method: 'PUT',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({file_ids: fileIds})
            });
            if (!resp.ok) {
                const err = await resp.text();
                console.error(`Error saving order for ${platform}:`, err);
            }
        } catch (e) {
            console.error(e);
        }
    }
    showToast('Orden actualizado', 'success');
}

document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-remove-pub-file]');
    if (btn) {
        const idx = parseInt(btn.dataset.removePubFile);
        _pubUploadedFiles.splice(idx, 1);
        _renderFilePreviews();
    }
});

// ============= openEditPub (existing publication) =============
async function openEditPub(pubId) {
    _resetPubModal();
    _pubIsCreating = false;

    try {
        const resp = await apiFetch(apiUrl(`publications/${pubId}`));
        if (!resp.ok) { showToast('Error al cargar publicaci\u00f3n', 'error'); return; }
        const item = await resp.json();

        document.getElementById('pubModalTitle').textContent = 'Editar publicaci\u00f3n';
        document.getElementById('editPubId').value = item.id;
        document.getElementById('editPubTitle').value = item.title || '';
        document.getElementById('editPubCaption').value = item.caption || '';

        const schedInput = document.getElementById('editPubScheduled');
        schedInput.value = item.scheduled_at ? item.scheduled_at.slice(0, 16) : '';

        _pubSelectedInventories = (item.inventories || []).map(inv => ({
            id: inv.id,
            product_name: inv.product_name || '',
            collection_code: inv.collection_code || '',
            product_number: inv.product_number || ''
        }));
        _renderInvBadges();

        _pubSelectedPurchases = (item.purchases || []).map(p => ({
            id: p.id,
            entity: p.entity || {},
            external_reference: p.external_reference || '',
            total_amount: p.total_amount || ''
        }));
        _renderPurBadges();

        const details = item.details || [];
        _pubSelectedPlatforms = details.map(d => d.platform);
        _pubPlatformDetails = {};
        details.forEach(d => {
            _pubPlatformDetails[d.platform] = {
                id: d.id,
                caption: d.caption || '',
                scheduled_at: d.scheduled_at || item.scheduled_at || '',
                published_at: d.published_at || '',
                permalink: d.permalink || '',
                error_message: d.error_message || '',
                status: d.status || 'pending_review',
                files: d.files || [],
                is_broadcast: d.is_broadcast || false,
            };
        });
        _pubSelectedPlatforms.forEach(p => {
            const cb = document.querySelector(`.pub-platform-cb[value="${p}"]`);
            if (cb) cb.checked = true;
        });
        _renderPlatformDetails();

        // Load publication files
        const token = localStorage.getItem(TOKEN_KEY) || '';
        const qs = token ? `?token=${encodeURIComponent(token)}` : '';

        let allFiles = [];
        try {
            const fr = await apiFetch(apiUrl(`files/by-publication/${pubId}`));
            if (fr.ok) allFiles = await fr.json();
        } catch (_) {}

        _pubCurrentPubId = pubId;
        _pubCurrentFiles = allFiles;
        _pubCurrentQs = qs;
        _renderPubFilesPreview(pubId, allFiles, qs);

        editPubModal.hidden = false;
        _syncPubOverflow();

        _bindAiButton();
    } catch (e) { console.error(e); showToast('Error de conexi\u00f3n', 'error'); }
}

function _bindAiButton() {
    const genBtn = document.getElementById('generateTextBtn');
    const newGenBtn = genBtn.cloneNode(true);
    genBtn.parentNode.replaceChild(newGenBtn, genBtn);
    newGenBtn.addEventListener('click', async () => {
        const pid = document.getElementById('editPubId').value;
        newGenBtn.disabled = true; newGenBtn.textContent = 'Generando...';
        try {
            const body = {
                inventory_ids: _pubSelectedInventories.map(i => i.id),
                purchase_ids: _pubSelectedPurchases.map(p => p.id)
            };
            const url = pid
                ? apiUrl(`ai/publications/${pid}/generate-text`)
                : apiUrl('ai/publications/generate-text');
            const resp = await apiFetch(url, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(body)
            });
            if (!resp.ok) { showToast('Error al generar', 'error'); return; }
            const data = await resp.json();
            document.getElementById('editPubAiText').value = data.text || '';
        } catch (e) { console.error(e); showToast('Error de conexi\u00f3n', 'error'); }
        finally { newGenBtn.disabled = false; newGenBtn.textContent = 'Generar texto + tags con IA'; }
    });
}

// ============= FORM SUBMIT =============
document.getElementById('editPubForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const pubId = document.getElementById('editPubId').value;

    const caption = document.getElementById('editPubCaption').value;
    const title = document.getElementById('editPubTitle').value;
    const scheduledVal = document.getElementById('editPubScheduled').value;

    if (_pubIsCreating) {
        // Create new publication
        if (_pubSelectedPlatforms.length === 0) {
            showToast('Selecciona al menos una plataforma', 'error');
            return;
        }
        const body = {title, caption};
        if (scheduledVal) body.scheduled_at = scheduledVal;
        body.inventory_ids = _pubSelectedInventories.map(i => i.id);
        body.purchase_ids = _pubSelectedPurchases.map(p => p.id);
        body.platforms = _pubSelectedPlatforms;

        try {
            const resp = await apiFetch(apiUrl('publications'), {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(body)
            });
            if (!resp.ok) { const t = await resp.text().catch(()=>null); showToast('Error: ' + (t || resp.status), 'error'); return; }
            const created = await resp.json();
            const newPubId = created.id;

            // Update platform details with specific fields
            const createdDetails = created.details || [];
            for (const detail of createdDetails) {
                const platform = detail.platform;
                const platformDetail = _pubPlatformDetails[platform] || {};
                const patchBody = {};
                if (platformDetail.caption) patchBody.caption = platformDetail.caption;
                if (platformDetail.scheduled_at) patchBody.scheduled_at = platformDetail.scheduled_at;
                if (platformDetail.status) patchBody.status = platformDetail.status;
                if (platformDetail.permalink) patchBody.permalink = platformDetail.permalink;
                if (platformDetail.is_broadcast !== undefined) patchBody.is_broadcast = platformDetail.is_broadcast;
                if (Object.keys(patchBody).length) {
                    await apiFetch(apiUrl(`publication-details/${detail.id}`), {
                        method: 'PATCH',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify(patchBody)
                    });
                }
            }

            // Upload files if any
            if (_pubUploadedFiles.length) {
                const fd = new FormData();
                _pubUploadedFiles.forEach(f => fd.append('files', f));
                const upResp = await apiFetch(apiUrl(`publications/${newPubId}/files`), {method: 'POST', body: fd});
                if (upResp.ok) {
                    const uploadedData = await upResp.json();
                    const uploadedFiles = uploadedData.files || [];

                    // Apply platform orders
                    const platformOrders = {};
                    uploadedFiles.forEach((uf, idx) => {
                        const orders = _pubUploadedFiles[idx]?._platformOrders || {};
                        for (const [platform, order] of Object.entries(orders)) {
                            if (order != null) {
                                if (!platformOrders[platform]) platformOrders[platform] = [];
                                platformOrders[platform].push({fileId: uf.id, order});
                            }
                        }
                    });

                    for (const [platform, entries] of Object.entries(platformOrders)) {
                        const detail = createdDetails.find(d => d.platform === platform);
                        if (!detail) continue;
                        entries.sort((a, b) => a.order - b.order);
                        await apiFetch(apiUrl(`publication-details/${detail.id}/files`), {
                            method: 'PUT',
                            headers: {'Content-Type': 'application/json'},
                            body: JSON.stringify({file_ids: entries.map(e => e.fileId)})
                        });
                    }
                }
            }

            showToast('Publicaci\u00f3n creada', 'success');
            closeEditPub();
            loadPublications({reset: true});
        } catch (err) { console.error(err); showToast('Error de conexi\u00f3n', 'error'); }
        return;
    }

    // Update existing publication
    const body = {title, caption};
    if (scheduledVal) body.scheduled_at = scheduledVal;
    body.inventory_ids = _pubSelectedInventories.map(i => i.id);
    body.purchase_ids = _pubSelectedPurchases.map(p => p.id);

    try {
        const resp = await apiFetch(apiUrl(`publications/${pubId}`), {
            method: 'PATCH',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(body)
        });
        if (!resp.ok) { const t = await resp.text().catch(()=>null); showToast('Error: ' + (t || resp.status), 'error'); return; }

        // Sync platforms: add new ones, remove unselected ones
        for (const platform of _pubSelectedPlatforms) {
            const detail = _pubPlatformDetails[platform] || {};
            if (!detail.id) {
                const created = await apiFetch(apiUrl(`publications/${pubId}/platforms`), {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({
                        platform,
                        status: detail.status || 'pending_review',
                        caption: detail.caption || null,
                        scheduled_at: detail.scheduled_at || null,
                        is_broadcast: detail.is_broadcast || false,
                    })
                });
                if (created.ok) {
                    const newDetail = await created.json();
                    _pubPlatformDetails[platform] = { ...detail, id: newDetail.id };
                }
            } else {
                const patchBody = {};
                if (detail.caption !== undefined) patchBody.caption = detail.caption || null;
                if (detail.scheduled_at !== undefined) patchBody.scheduled_at = detail.scheduled_at || null;
                if (detail.status !== undefined) patchBody.status = detail.status;
                if (detail.permalink !== undefined) patchBody.permalink = detail.permalink || null;
                if (detail.is_broadcast !== undefined) patchBody.is_broadcast = detail.is_broadcast;
                if (Object.keys(patchBody).length) {
                    await apiFetch(apiUrl(`publication-details/${detail.id}`), {
                        method: 'PATCH',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify(patchBody)
                    });
                }
            }
        }
        for (const platform of Object.keys(_pubPlatformDetails)) {
            if (!_pubSelectedPlatforms.includes(platform)) {
                const detail = _pubPlatformDetails[platform] || {};
                if (detail.id) {
                    await apiFetch(apiUrl(`publication-details/${detail.id}`), {
                        method: 'DELETE'
                    });
                }
            }
        }

        // Save file orders for all platforms (including newly created ones)
        const filesContainer = document.getElementById('pubFilesPreview');
        if (filesContainer) {
            const platformFileIds = {};
            filesContainer.querySelectorAll('.pub-detail-order-input').forEach(inp => {
                const fid = parseInt(inp.dataset.fileId);
                const platform = inp.dataset.platform;
                const val = inp.value.trim();
                if (val !== '') {
                    if (!platformFileIds[platform]) platformFileIds[platform] = [];
                    platformFileIds[platform].push({fileId: fid, order: parseInt(val, 10)});
                }
            });
            for (const platform of Object.keys(platformFileIds)) {
                const detail = _pubPlatformDetails[platform] || {};
                if (!detail.id) continue;
                const entries = platformFileIds[platform].sort((a, b) => a.order - b.order);
                const fileIds = entries.map(e => e.fileId);
                await apiFetch(apiUrl(`publication-details/${detail.id}/files`), {
                    method: 'PUT',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({file_ids: fileIds})
                });
            }
        }

        showToast('Publicaci\u00f3n actualizada', 'success');

        // Upload new files if any
        if (_pubUploadedFiles.length) {
            const fd = new FormData();
            _pubUploadedFiles.forEach(f => fd.append('files', f));
            const upResp = await apiFetch(apiUrl(`publications/${pubId}/files`), {method: 'POST', body: fd});
            if (upResp.ok) {
                const uploadedData = await upResp.json();
                const uploadedFiles = uploadedData.files || [];

                const platformOrders = {};
                uploadedFiles.forEach((uf, idx) => {
                    const orders = _pubUploadedFiles[idx]?._platformOrders || {};
                    for (const [platform, order] of Object.entries(orders)) {
                        if (order != null) {
                            if (!platformOrders[platform]) platformOrders[platform] = [];
                            platformOrders[platform].push({fileId: uf.id, order});
                        }
                    }
                });

                for (const [platform, entries] of Object.entries(platformOrders)) {
                    const detail = _pubPlatformDetails[platform] || {};
                    if (!detail.id) continue;
                    entries.sort((a, b) => a.order - b.order);
                    await apiFetch(apiUrl(`publication-details/${detail.id}/files`), {
                        method: 'PUT',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({file_ids: entries.map(e => e.fileId)})
                    });
                }
            }
        }

        closeEditPub();
        loadPublications({reset: true});
    } catch (err) { console.error(err); showToast('Error de conexi\u00f3n', 'error'); }
});

// Infinite scroll
if (pubSentinel) {
    let pubLoadDebounce = false;
    const pubObserver = new IntersectionObserver(entries => {
        if (pubLoadDebounce) return;
        if (entries[0].isIntersecting && pubState.hasNext && !pubState.loading) {
            pubLoadDebounce = true;
            loadPublications({});
            setTimeout(() => { pubLoadDebounce = false; }, 300);
        }
    }, {rootMargin: '200px'});
    pubObserver.observe(pubSentinel);
}

// ==================== PUBLICATION CALENDAR ====================
const MONTH_NAMES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const calState = { year: new Date().getFullYear(), month: new Date().getMonth(), data: {} };

function openPubCalendar() {
    calState.year = new Date().getFullYear();
    calState.month = new Date().getMonth();
    pubCalPanel.hidden = false;
    renderPubCalendar();
}

function closePubCalendar() {
    pubCalPanel.hidden = true;
}

function fillPubCalSelects() {
    const m = document.getElementById('pubCalMonth');
    m.innerHTML = MONTH_NAMES.map((n, i) => `<option value="${i}">${n}</option>`).join('');
    m.value = calState.month;
    const y = document.getElementById('pubCalYear');
    y.innerHTML = '';
    for (let i = calState.year - 5; i <= calState.year + 5; i++) {
        y.insertAdjacentHTML('beforeend', `<option value="${i}">${i}</option>`);
    }
    y.value = calState.year;
}

async function loadPubCalendar() {
    const startDate = new Date(calState.year, calState.month, 1);
    const endDate = new Date(calState.year, calState.month + 1, 0);
    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(23, 59, 59, 999);
    const start = startDate.toISOString();
    const end = endDate.toISOString();
    try {
        const resp = await apiFetch(apiUrl('publications/calendar', {start, end}));
        if (!resp.ok) { calState.data = {}; return; }
        const data = await resp.json();
        calState.data = (data.days || {});
    } catch (e) { console.error(e); calState.data = {}; }
}

function renderPubCalendar() {
    fillPubCalSelects();
    const detail = document.getElementById('pubCalDetail');
    detail.hidden = true;
    const grid = document.getElementById('pubCalDays');
    grid.innerHTML = '';

    const firstDay = new Date(calState.year, calState.month, 1).getDay();
    const offset = (firstDay + 6) % 7; // Monday first
    const daysInMonth = new Date(calState.year, calState.month + 1, 0).getDate();
    const today = new Date();

    for (let i = 0; i < offset; i++) {
        grid.insertAdjacentHTML('beforeend', '<div class="pub-cal-cell pub-cal-empty"></div>');
    }

    for (let day = 1; day <= daysInMonth; day++) {
        const key = `${calState.year}-${String(calState.month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const info = calState.data[key];
        const scheduled = info ? info.scheduled : 0;
        const published = info ? info.published : 0;

        let classes = 'pub-cal-cell';
        if (today.getFullYear() === calState.year && today.getMonth() === calState.month && today.getDate() === day) classes += ' pub-cal-today';
        if (scheduled > 0) classes += ' pub-cal-scheduled';
        if (published > 0) classes += ' pub-cal-published';

        let badges = '';
        if (scheduled > 0) badges += `<span class="pub-cal-count pub-cal-count-scheduled" title="${scheduled} por publicar">${scheduled}</span>`;
        if (published > 0) badges += `<span class="pub-cal-count pub-cal-count-published" title="${published} publicadas">${published}</span>`;

        grid.insertAdjacentHTML('beforeend', `<div class="${classes}" data-day="${key}"><span class="pub-cal-daynum">${day}</span>${badges}</div>`);
    }

    document.querySelectorAll('#pubCalDays [data-day]').forEach(cell => {
        cell.addEventListener('click', () => showPubCalDay(cell.dataset.day));
    });
}

function showPubCalDay(key) {
    const info = calState.data[key] || {items: []};
    const detail = document.getElementById('pubCalDetail');
    if (!info.items || !info.items.length) { detail.hidden = true; return; }
    const rows = info.items.map(it => {
        const platformStatuses = it.platform_statuses || {};
        const allPublished = Object.keys(platformStatuses).length > 0 && Object.values(platformStatuses).every(s => s === 'published');
        const st = allPublished ? 'Publicado' : 'Por publicar';
        const code = it.collection_code ? `${it.collection_code} ${it.product_number || ''}`.trim() : '';
        const name = it.title || code || `#${it.id}`;
        const platformBadges = Object.entries(platformStatuses).map(([p, s]) => {
            const label = (getPlatformLabel(p)).substring(0, 2).toUpperCase();
            const color = getPlatformColor(p);
            const cls = s === 'published' ? 'status-ok' : 'status-warn';
            return `<span class="${cls}" style="font-size:10px;padding:1px 3px;color:${color};font-weight:bold" title="${p}: ${s}">${label}</span>`;
        }).join(' ');
        return `<div class="pub-cal-detail-row" data-pub-id="${it.id}" title="Editar">
            <span class="${allPublished ? 'status-ok' : 'status-warn'}">${st}</span>
            <span>${esc(name)}</span>
            <span style="color:var(--muted);font-size:12px">${it.scheduled_at || ''}</span>
            <span>${platformBadges}</span>
            <span style="color:var(--cyan);font-size:12px">Editar</span>
        </div>`;
    }).join('');
    detail.innerHTML = `<div style="font-weight:600;margin-bottom:6px;font-size:13px">Publicaciones del ${key} (clic para editar)</div>${rows}`;
    detail.hidden = false;
}

document.getElementById('btnPubCalendar')?.addEventListener('click', () => {
    if (!pubCalPanel.hidden) {
        closePubCalendar();
    } else {
        openPubCalendar();
        loadPubCalendar().then(renderPubCalendar);
    }
});

document.getElementById('pubCalNewPub')?.addEventListener('click', openNewPub);

document.getElementById('pubCalendarClose')?.addEventListener('click', closePubCalendar);

document.getElementById('pubCalPrev')?.addEventListener('click', () => {
    calState.month--;
    if (calState.month < 0) { calState.month = 11; calState.year--; }
    loadPubCalendar().then(renderPubCalendar);
});
document.getElementById('pubCalNext')?.addEventListener('click', () => {
    calState.month++;
    if (calState.month > 11) { calState.month = 0; calState.year++; }
    loadPubCalendar().then(renderPubCalendar);
});
document.getElementById('pubCalMonth')?.addEventListener('change', (e) => {
    calState.month = parseInt(e.target.value);
    loadPubCalendar().then(renderPubCalendar);
});
document.getElementById('pubCalYear')?.addEventListener('change', (e) => {
    calState.year = parseInt(e.target.value);
    loadPubCalendar().then(renderPubCalendar);
});
