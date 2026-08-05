// ==================== PUBLICATIONS ====================

const pubState = {
    page: 1, perPage: 50, pages: 0, total: 0, loaded: 0, loading: false, hasNext: true,
    status: '', collection_code: '', product_number: '', product_name: '', sort: 'recent'
};

let pubViewMode = 'list';
let _pubSelectedInventories = [];
let _pubSelectedPurchases = [];
let _pubUploadedFiles = [];
let _pubIsCreating = false;

const pubBody = document.getElementById('publicationBody');
const pubEmpty = document.getElementById('publicationEmpty');
const pubSummary = document.getElementById('publicationSummary');
const pubSummaryScrollEl = document.querySelector('#tabPublications .scroll-note');
const pubSentinel = document.getElementById('publicationSentinel');

// Filter events
['pubFilterStatus', 'pubFilterColCode', 'pubFilterNumber', 'pubFilterName', 'pubSortOrder'].forEach(id => {
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

    pubState.status = document.getElementById('pubFilterStatus')?.value || '';
    pubState.collection_code = document.getElementById('pubFilterColCode')?.value || '';
    pubState.product_number = document.getElementById('pubFilterNumber')?.value || '';
    pubState.product_name = document.getElementById('pubFilterName')?.value || '';
    pubState.sort = document.getElementById('pubSortOrder')?.value || 'recent';

    const params = {page: pubState.page, per_page: pubState.perPage, sort: pubState.sort};
    if (pubState.status) params.status = pubState.status;
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
    const publishedDate = item.published_at ? item.published_at.slice(0, 16).replace('T', ' ') : '-';

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

    let statusClass = '';
    let statusLabel = item.status || '';
    if (item.status === 'published') { statusClass = 'status-ok'; statusLabel = 'Publicado'; }
    else if (item.status === 'pending_review') { statusClass = 'status-warn'; statusLabel = 'Revisi\u00f3n'; }
    else if (item.status === 'pending_publish') { statusClass = 'status-warn'; statusLabel = 'Pendiente'; }
    else if (item.status === 'processing') { statusClass = 'status-warn'; statusLabel = 'En proceso'; }
    else if (item.status === 'failed') { statusClass = 'status-err'; statusLabel = 'Fallido'; }
    else if (item.status === 'cancelled') { statusClass = ''; statusLabel = 'Cancelado'; }

    const deleteBtn = `<button type="button" class="btn-delete-pub" data-pub-id="${item.id}" title="Eliminar" style="background:none;border:none;color:var(--red);cursor:pointer;font-size:18px;line-height:1;padding:2px 6px">&times;</button>`;

    return `<tr class="clickable-row" data-pub-id="${item.id}">
        <td class="inv-img-cell">${thumbHtml}</td>
        <td>${colCode ? esc(colCode) + inventoryBadges : '<span style="color:var(--muted)">manual</span>'}</td>
        <td style="white-space:nowrap">${esc(prodNumber || '-')}</td>
        <td>${nameCell}</td>
        <td style="max-width:250px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(item.caption || '')}">${captionDisplay}</td>
        <td style="text-align:center">${photoCount > 0 ? photoCount : '<span style="color:var(--red)">0</span>'}</td>
        <td style="font-size:12px">${scheduledDate}</td>
        <td style="font-size:12px">${publishedDate}</td>
        <td><span class="${statusClass}">${statusLabel}</span></td>
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

function closeEditPub() {
    editPubModal.hidden = true;
    document.body.style.overflow = '';
}

document.getElementById('editPubCancel')?.addEventListener('click', closeEditPub);
document.getElementById('editPubBackdrop')?.addEventListener('click', closeEditPub);

function _resetPubModal() {
    document.getElementById('editPubId').value = '';
    document.getElementById('editPubTitle').value = '';
    document.getElementById('editPubScheduled').value = '';
    document.getElementById('editPubStatus').value = 'pending_review';
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
}

function openNewPub() {
    _resetPubModal();
    _pubIsCreating = true;
    document.getElementById('pubModalTitle').textContent = 'Nueva publicaci\u00f3n';
    editPubModal.hidden = false;
    document.body.style.overflow = 'hidden';
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
        container.innerHTML += `<div class="${wrapClass}" style="display:flex;flex-direction:column;align-items:center;gap:4px">
            ${preview}
            <input type="number" class="pub-ig-order" data-file-idx="${idx}" placeholder="IG" min="0" step="1" style="width:50px;padding:2px 4px;border:1px solid var(--border);border-radius:3px;font-size:11px;text-align:center">
            <button type="button" data-remove-pub-file="${idx}" style="background:none;border:none;cursor:pointer;font-size:14px;color:var(--red);padding:0" title="Eliminar">&times;</button>
        </div>`;
    });

    container.querySelectorAll('.pub-ig-order').forEach(inp => {
        inp.addEventListener('change', () => {
            const idx = parseInt(inp.dataset.fileIdx);
            const val = inp.value.trim();
            _pubUploadedFiles[idx]._igOrder = val ? parseInt(val) : null;
        });
    });
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

        document.getElementById('editPubStatus').value = item.status || 'pending_review';

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

        // Load publication files
        const token = localStorage.getItem(TOKEN_KEY) || '';
        const qs = token ? `?token=${encodeURIComponent(token)}` : '';

        let allFiles = [];
        try {
            const fr = await apiFetch(apiUrl(`files/by-publication/${pubId}`));
            if (fr.ok) allFiles = await fr.json();
        } catch (_) {}

        const container = document.getElementById('pubFilesPreview');
        if (allFiles.length) {
            container.innerHTML = allFiles.map(f => {
                const fileUrl = apiUrl(`product-catalog/files/${f.id}/content`) + qs;
                const igOrder = f.instagram_sort_order;
                const igVal = igOrder != null ? igOrder : '';
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
                return `<div class="${wrapClass}" data-file-id="${f.id}">
                    <div class="pub-file-preview">${linkedBadge}${delBtn}${isVideo ? preview : `<a href="${esc(fileUrl)}" target="_blank" rel="noopener">${preview}</a>`}</div>
                    <div class="file-ig-order">
                        <input type="number" class="ig-order-input" value="${igVal}" placeholder="-" min="0" step="1" data-file-id="${f.id}">
                    </div>
                </div>`;
            }).join('');

            container.querySelectorAll('.ig-order-input').forEach(inp => {
                inp.addEventListener('change', () => savePubIgOrders(pubId));
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
        } else {
            container.innerHTML = '<span style="color:var(--muted);font-size:13px">Sin archivos directos</span>';
        }

        editPubModal.hidden = false;
        document.body.style.overflow = 'hidden';

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
    const status = document.getElementById('editPubStatus').value;

    if (_pubIsCreating) {
        // Create new publication
        const body = {title, caption, status: status || 'pending_review'};
        if (scheduledVal) body.scheduled_at = scheduledVal;
        body.inventory_ids = _pubSelectedInventories.map(i => i.id);
        body.purchase_ids = _pubSelectedPurchases.map(p => p.id);

        try {
            const resp = await apiFetch(apiUrl('publications'), {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(body)
            });
            if (!resp.ok) { const t = await resp.text().catch(()=>null); showToast('Error: ' + (t || resp.status), 'error'); return; }
            const created = await resp.json();
            const newPubId = created.id;

            // Upload files if any
            if (_pubUploadedFiles.length) {
                const fd = new FormData();
                _pubUploadedFiles.forEach(f => fd.append('files', f));
                const upResp = await apiFetch(apiUrl(`publications/${newPubId}/files`), {method: 'POST', body: fd});
                if (upResp.ok) {
                    // Apply IG sort order
                    const igOrders = {};
                    _pubUploadedFiles.forEach((f, idx) => {
                        if (f._igOrder) igOrders[`ig_order_${idx}`] = f._igOrder;
                    });
                    if (Object.keys(igOrders).length) {
                        // Get file IDs from uploaded files response
                        const uploadedData = await upResp.json();
                        const reorderBody = {file_ids: uploadedData.files.map(uf => uf.id)};
                        for (let i = 0; i < uploadedData.files.length; i++) {
                            const igKey = `ig_order_${uploadedData.files[i].id}`;
                            if (_pubUploadedFiles[i]?._igOrder) {
                                reorderBody[igKey] = _pubUploadedFiles[i]._igOrder;
                            }
                        }
                        await apiFetch(apiUrl(`publications/${newPubId}/files/reorder`), {
                            method: 'PATCH',
                            headers: {'Content-Type': 'application/json'},
                            body: JSON.stringify(reorderBody)
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
    body.status = status;
    body.inventory_ids = _pubSelectedInventories.map(i => i.id);
    body.purchase_ids = _pubSelectedPurchases.map(p => p.id);

    try {
        const resp = await apiFetch(apiUrl(`publications/${pubId}`), {
            method: 'PATCH',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(body)
        });
        if (!resp.ok) { const t = await resp.text().catch(()=>null); showToast('Error: ' + (t || resp.status), 'error'); return; }
        showToast('Publicaci\u00f3n actualizada', 'success');

        // Upload new files if any
        if (_pubUploadedFiles.length) {
            const fd = new FormData();
            _pubUploadedFiles.forEach(f => fd.append('files', f));
            await apiFetch(apiUrl(`publications/${pubId}/files`), {method: 'POST', body: fd});
        }

        closeEditPub();
        loadPublications({reset: true});
    } catch (err) { console.error(err); showToast('Error de conexi\u00f3n', 'error'); }
});

// Auto-save IG order
async function savePubIgOrders(pubId) {
    const container = document.getElementById('pubFilesPreview');
    if (!container) return;
    const thumbWraps = container.querySelectorAll('.file-thumb-wrap');
    const fileIds = Array.from(thumbWraps).map(w => parseInt(w.dataset.fileId)).filter(id => id > 0);
    const igOrders = {};
    container.querySelectorAll('.ig-order-input').forEach(inp => {
        const fid = parseInt(inp.dataset.fileId);
        const val = inp.value.trim();
        igOrders[`ig_order_${fid}`] = val !== '' ? parseInt(val, 10) : null;
    });
    try {
        const resp = await apiFetch(apiUrl(`publications/${pubId}/files/reorder`), {
            method: 'PATCH',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({file_ids: fileIds, ...igOrders})
        });
        if (!resp.ok) { const t = await resp.text().catch(()=>null); console.error('Save IG error:', t); return; }
        showToast('Orden IG actualizado', 'success');
    } catch (e) { console.error(e); }
}

// Infinite scroll
if (pubSentinel) {
    const pubObserver = new IntersectionObserver(entries => {
        if (entries[0].isIntersecting && pubState.hasNext && !pubState.loading) loadPublications({});
    }, {rootMargin: '400px'});
    pubObserver.observe(pubSentinel);
}
