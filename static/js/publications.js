// ==================== PUBLICATIONS ====================

const pubState = {
    page: 1, perPage: 50, pages: 0, total: 0, loaded: 0, loading: false, hasNext: true,
    status: '', collection_code: '', product_number: '', product_name: '', sort: 'recent'
};

let pubViewMode = 'list';

const pubBody = document.getElementById('publicationBody');
const pubEmpty = document.getElementById('publicationEmpty');
const pubSummary = document.getElementById('publicationSummary');
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

// View toggle (matching inventory behavior)
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

async function getInventoryFilesForIg(invId, tokenQuery) {
    try {
        const resp = await apiFetch(apiUrl(`files/by-inventory/${invId}`));
        if (!resp.ok) return [];
        const files = await resp.json();
        const igFiles = files.filter(f => f.instagram_sort_order != null);
        igFiles.sort((a, b) => a.instagram_sort_order - b.instagram_sort_order);
        return igFiles.map(f => ({
            id: f.id,
            url: apiUrl(`product-catalog/files/${f.id}/content`) + tokenQuery,
            order: f.instagram_sort_order,
            name: f.original_name
        }));
    } catch (e) { return []; }
}

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
        if (!resp.ok) { pubBody.innerHTML = '<tr><td colspan="10" class="error-state">Error al cargar</td></tr>'; pubState.loading = false; return; }
        const data = await resp.json();
        const items = data.items || [];
        pubState.pages = data.pages || 0;
        pubState.total = data.total || 0;
        pubState.hasNext = pubState.page < pubState.pages;

        if (!items.length && pubState.loaded === 0) { pubBody.innerHTML = ''; pubEmpty.hidden = false; pubSummary.textContent = '0 publicaciones'; pubState.loading = false; return; }
        pubEmpty.hidden = true;

        for (const item of items) {
            const row = await buildPubRow(item);
            pubBody.insertAdjacentHTML('beforeend', row);
        }
        loadImages(pubBody);
        pubState.loaded += items.length;
        pubState.page++;
        pubSummary.textContent = pubState.total + ' publicaciones';
    } catch (e) { console.error(e); pubBody.innerHTML = '<tr><td colspan="10" class="error-state">Error de conexi\u00f3n</td></tr>'; }
    pubState.loading = false;
}

async function buildPubRow(item) {
    const prod = item.inventory?.product || {};
    const col = item.inventory?.collection || {};
    const lang = item.inventory?.language || {};
    const prodName = getProductName(prod.translations, lang.id);
    const prodNameFmt = getFormattedProductName(prod.translations, lang.id);
    const codeNum = esc(col.code || '-') + (prod.product_number ? ' ' + esc(prod.product_number) : '');
    const nameDisplay = prodNameFmt ? `<strong>${prodNameFmt}</strong>` : '<em style="color:var(--muted)">(sin nombre)</em>';

    const captionPreview = (item.caption || '').substring(0, 80);
    const captionDisplay = captionPreview ? esc(captionPreview) + (item.caption?.length > 80 ? '...' : '') : '<span style="color:var(--muted)">auto</span>';

    const scheduledDate = item.scheduled_at ? item.scheduled_at.slice(0, 16).replace('T', ' ') : '-';
    const publishedDate = item.published_at ? item.published_at.slice(0, 16).replace('T', ' ') : '-';

    // Load IG files for thumbnail and count
    let igFiles = [];
    try {
        const resp = await apiFetch(apiUrl(`files/by-inventory/${item.inventory_id}`));
        if (resp.ok) {
            const files = await resp.json();
            igFiles = files.filter(f => f.instagram_sort_order != null);
            igFiles.sort((a, b) => a.instagram_sort_order - b.instagram_sort_order);
        }
    } catch (e) {}
    const photoCount = igFiles.length;

    const placeholder = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";
    let thumbHtml;
    if (igFiles.length > 0) {
        const imgUrl = apiUrl(`product-catalog/files/${igFiles[0].id}/content`);
        const sep = imgUrl.includes('?') ? '&' : '?';
        thumbHtml = `<div class="inv-img-thumb"><img class="product-thumb-img" src="${placeholder}" data-src="${esc(imgUrl + sep + 'size=sm')}" alt="" loading="lazy"></div>`;
    } else {
        thumbHtml = `<div class="inv-img-thumb"><svg class="thumb-placeholder" viewBox="0 0 24 24" width="42" height="42" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"></rect><path d="m8 14 2.5-2.5L14 15l2-2 3 3"></path><circle cx="8.5" cy="8.5" r="1.5"></circle></svg></div>`;
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

    return `<tr class="clickable-row" data-pub-id="${item.id}" data-inv-id="${item.inventory_id}">
        <td class="inv-img-cell">${thumbHtml}</td>
        <td>${esc(col.code || col.name || '-')}</td>
        <td style="white-space:nowrap">${esc(prod.product_number || '-')}</td>
        <td><span style="color:var(--muted)">(${codeNum})</span> ${nameDisplay}</td>
        <td style="max-width:250px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(item.caption || '')}">${captionDisplay}</td>
        <td style="text-align:center">${photoCount > 0 ? photoCount : '<span style="color:var(--red)">0</span>'}</td>
        <td style="font-size:12px">${scheduledDate}</td>
        <td style="font-size:12px">${publishedDate}</td>
        <td><span class="${statusClass}">${statusLabel}</span></td>
        <td style="text-align:center;white-space:nowrap">${deleteBtn}</td>
    </tr>`;
}

// Click row/card → open edit modal
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

// Edit modal
const editPubModal = document.getElementById('editPubModal');

function closeEditPub() {
    editPubModal.hidden = true;
    document.body.style.overflow = '';
}

document.getElementById('editPubCancel')?.addEventListener('click', closeEditPub);
document.getElementById('editPubBackdrop')?.addEventListener('click', closeEditPub);

async function openEditPub(pubId) {
    try {
        const resp = await apiFetch(apiUrl(`publications/${pubId}`));
        if (!resp.ok) { showToast('Error al cargar publicaci\u00f3n', 'error'); return; }
        const item = await resp.json();

        document.getElementById('editPubId').value = item.id;
        document.getElementById('editPubCaption').value = item.caption || '';

        const schedInput = document.getElementById('editPubScheduled');
        if (item.scheduled_at) {
            schedInput.value = item.scheduled_at.slice(0, 16);
        } else {
            schedInput.value = '';
        }

        const statusSel = document.getElementById('editPubStatus');
        statusSel.value = item.status || 'pending_review';

        // Load IG photos
        const token = window.localStorage.getItem(TOKEN_KEY) || '';
        const qs = token ? `?token=${encodeURIComponent(token)}` : '';
        const igFiles = await getInventoryFilesForIg(item.inventory_id, qs);
        const photosContainer = document.getElementById('editPubPhotos');
        if (igFiles.length) {
            photosContainer.innerHTML = igFiles.map(f =>
                `<div class="file-thumb-wrap">
                    <img class="file-thumb" src="${esc(f.url)}" alt="${esc(f.name)}" style="width:80px;height:80px;object-fit:cover;border-radius:4px;border:1px solid var(--border)">
                    <div style="font-size:11px;color:var(--muted);text-align:center;margin-top:2px">IG: ${f.order}</div>
                </div>`
            ).join('');
        } else {
            photosContainer.innerHTML = '<span style="color:var(--muted);font-size:13px">No hay fotos con orden IG asignado</span>';
        }

        editPubModal.hidden = false;
        document.body.style.overflow = 'hidden';
    } catch (e) { console.error(e); showToast('Error de conexi\u00f3n', 'error'); }
}

document.getElementById('editPubForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const pubId = document.getElementById('editPubId').value;
    if (!pubId) return;
    const caption = document.getElementById('editPubCaption').value;
    const scheduledVal = document.getElementById('editPubScheduled').value;
    const status = document.getElementById('editPubStatus').value;

    const body = {caption};
    if (scheduledVal) {
        body.scheduled_at = new Date(scheduledVal).toISOString();
    }
    body.status = status;

    try {
        const resp = await apiFetch(apiUrl(`publications/${pubId}`), {
            method: 'PATCH',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(body)
        });
        if (!resp.ok) { const t = await resp.text().catch(()=>null); showToast('Error: ' + (t || resp.status), 'error'); return; }
        showToast('Publicaci\u00f3n actualizada', 'success');
        closeEditPub();
        loadPublications({reset: true});
    } catch (err) { console.error(err); showToast('Error de conexi\u00f3n', 'error'); }
});

// Infinite scroll
if (pubSentinel) {
    const pubObserver = new IntersectionObserver(entries => {
        if (entries[0].isIntersecting && pubState.hasNext && !pubState.loading) loadPublications({});
    }, {rootMargin: '400px'});
    pubObserver.observe(pubSentinel);
}
