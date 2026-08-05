// ==================== COLLECTION TRACKING ====================

let trackingData = [];
let trackingFilter = '';

async function loadTracking() {
    const body = document.getElementById('trackingBody');
    const empty = document.getElementById('trackingEmpty');
    const summary = document.getElementById('trackingSummary');
    const assignBtn = document.getElementById('assignGroupsBtn');

    if (hasRole('product_write') || hasRole('admin')) {
        assignBtn.style.display = '';
    }

    body.innerHTML = '<tr><td colspan="5" class="loading-state">Cargando...</td></tr>';
    empty.hidden = true;

    try {
        const resp = await apiFetch(`${configuredApiBase}/collection-tracking`);
        if (!resp.ok) {
            body.innerHTML = `<tr><td colspan="5" class="loading-state">Error ${resp.status}: ${resp.statusText}</td></tr>`;
            return;
        }
        const data = await resp.json();
        trackingData = data.items || [];
    } catch (err) {
        body.innerHTML = `<tr><td colspan="5" class="loading-state">Error al cargar: ${esc(String(err))}</td></tr>`;
        return;
    }

    const filtered = trackingFilter
        ? trackingData.filter(t => t.collection_code.toLowerCase().includes(trackingFilter.toLowerCase()))
        : trackingData;

    if (filtered.length === 0 && trackingData.length === 0) {
        empty.hidden = false;
        body.innerHTML = '';
        summary.textContent = 'No sigues ninguna colección';
    } else {
        empty.hidden = true;
        if (trackingFilter && filtered.length === 0) {
            empty.hidden = false;
            body.innerHTML = '<tr><td colspan="5" class="empty-state">Sin resultados para el filtro</td></tr>';
        } else {
            body.innerHTML = trackingData.filter(t =>
                !trackingFilter || t.collection_code.toLowerCase().includes(trackingFilter.toLowerCase())
            ).map(item => renderTrackingRow(item)).join('');
        }
        const totalTracked = trackingData.length;
        const completed = trackingData.filter(t => t.missing === 0).length;
        summary.textContent = `${totalTracked} colecciones seguidas · ${completed} completadas`;
    }
}

function renderTrackingRow(item) {
    const pct = typeof item.percent === 'number' ? item.percent : 0;
    const pctDisplay = pct % 1 === 0 ? pct : Math.round(pct * 10) / 10;
    const barW = pct > 0 ? Math.max(pct, 2) : 0;
    const barColor = pct >= 100 ? 'var(--green)' : pct >= 50 ? 'var(--orange)' : 'var(--red)';
    const modeLabel = item.tracking_mode === 'master' ? 'Master' : 'Estándar';

    let groupsHtml = '';
    if (item.groups) {
        groupsHtml = Object.entries(item.groups)
            .filter(([key, g]) => g.total > 0)
            .map(([key, g]) => {
                const gpct = g.total ? Math.round((g.owned / g.total) * 100) : 0;
                return `<span title="${g.name}: ${g.owned}/${g.total}" style="display:inline-block;margin:1px 2px;padding:1px 5px;border-radius:3px;font-size:11px;background:var(--surface-hover);white-space:nowrap">${g.short_name || g.name}&nbsp;${g.owned}/${g.total}</span>`;
        }).join('');
    }

    const manualBadge = item.is_manual ? ' <span style="font-size:10px;background:var(--cyan);color:#fff;padding:1px 4px;border-radius:3px;vertical-align:middle" title="Manual">M</span>' : '';

    return `
        <tr>
            <td>
                <strong>${esc(item.collection_code)}${manualBadge}</strong>
                <div style="font-size:12px;color:var(--text-muted)">${esc(item.collection_name || '')}</div>
            </td>
            <td>${modeLabel}</td>
            <td style="min-width:200px">
                <div style="display:flex;align-items:center;gap:8px">
                    <div style="flex:1;height:8px;background:var(--border);border-radius:4px;overflow:hidden">
                        <div style="height:100%;width:${barW}%;background:${barColor};border-radius:4px;transition:width 0.3s"></div>
                    </div>
                    <span style="font-size:12px;white-space:nowrap">${item.owned}/${item.target_total} (${pctDisplay}%)</span>
                </div>
                ${item.missing > 0 ? `<div style="font-size:11px;color:var(--text-muted);margin-top:2px">Faltan ${item.missing}</div>` : ''}
            </td>
            <td>${groupsHtml}</td>
            <td>
                <button class="btn-icon" title="Dejar de seguir" onclick="untrackCollection(${item.collection_id}, '${esc(item.tracking_mode)}')" style="color:var(--red);cursor:pointer;background:none;border:none;font-size:16px">&times;</button>
            </td>
        </tr>
    `;
}

async function untrackCollection(collectionId, trackingMode) {
    if (!confirm('¿Dejar de seguir esta colección?')) return;
    try {
        const resp = await apiFetch(`${configuredApiBase}/collection-tracking/${collectionId}?tracking_mode=${encodeURIComponent(trackingMode || 'standard')}`, { method: 'DELETE' });
        if (resp.ok) {
            showToast('Colección eliminada del seguimiento', 'success');
            loadTracking();
        } else {
            showToast('Error al eliminar', 'error');
        }
    } catch (err) {
        showToast('Error de conexión', 'error');
    }
}

// ==================== TRACKING MODAL ====================

const trackingModal = document.getElementById('trackingModal');
const trackingModalBackdrop = document.getElementById('trackingModalBackdrop');
const trackingSearchCol = document.getElementById('trackingSearchCol');
const trackingColResults = document.getElementById('trackingColResults');
const trackingModalConfirm = document.getElementById('trackingModalConfirm');
const trackingModalCancel = document.getElementById('trackingModalCancel');
const trackingModalMode = document.getElementById('trackingModalMode');
const trackingModalColId = document.getElementById('trackingModalColId');

function openTrackingModal() {
    trackingModal.hidden = false;
    document.body.style.overflow = 'hidden';
    trackingSearchCol.value = '';
    trackingColResults.style.display = 'none';
    trackingColResults.innerHTML = '';
    trackingModalColId.value = '';
    setTimeout(() => trackingSearchCol.focus(), 50);
}

function closeTrackingModal() {
    trackingModal.hidden = true;
    document.body.style.overflow = '';
    trackingColResults.style.display = 'none';
}

trackingModalBackdrop.addEventListener('click', closeTrackingModal);
trackingModalCancel.addEventListener('click', closeTrackingModal);

trackingSearchCol.addEventListener('input', debounce(async () => {
    const q = trackingSearchCol.value.trim();
    if (q.length < 2) {
        trackingColResults.style.display = 'none';
        return;
    }
    try {
        const resp = await apiFetch(apiUrl('collections', { q, per_page: 15 }));
        if (resp.ok) {
            const data = await resp.json();
            const items = data.items || [];
            const currentMode = trackingModalMode.value;
            const trackedCombos = new Set(trackingData.map(t => `${t.collection_id}-${t.tracking_mode}`));
            const filtered = items.filter(c => !trackedCombos.has(`${c.id}-${currentMode}`));
            const qlower = q.toLowerCase();
            filtered.sort((a, b) => {
                const aExact = a.code.toLowerCase() === qlower ? 0 : 1;
                const bExact = b.code.toLowerCase() === qlower ? 0 : 1;
                return aExact - bExact;
            });

            if (filtered.length === 0) {
                trackingColResults.innerHTML = '<div style="padding:8px;color:var(--text-muted);font-size:13px">Sin resultados o ya seguidos</div>';
            } else {
                trackingColResults.innerHTML = filtered.map(c => `
                    <div class="tracking-col-item" data-col-id="${c.id}" data-col-code="${esc(c.code)}" style="padding:8px;cursor:pointer;border-bottom:1px solid var(--border);font-size:13px;transition:background 0.15s"
                         onmouseover="this.style.background='var(--surface-hover)'"
                         onmouseout="this.style.background=''">
                        <span class="suggestion-code">${esc(c.code)}</span>
                        ${c.name ? `<span class="suggestion-name">${formatName(c.name, c.name_alter)}</span>` : ''}
                        ${c.is_manual ? '<span class="suggestion-manual" title="Manual">M</span>' : ''}
                    </div>
                `).join('');

                trackingColResults.querySelectorAll('.tracking-col-item').forEach(el => {
                    el.addEventListener('click', () => {
                        trackingModalColId.value = el.dataset.colId;
                        trackingSearchCol.value = el.dataset.colCode;
                        trackingColResults.style.display = 'none';
                        trackingColResults.querySelectorAll('.tracking-col-item').forEach(e => e.style.background = '');
                        el.style.background = 'var(--cyan-subtle)';
                    });
                });
            }
            trackingColResults.style.display = 'block';
        }
    } catch (err) {
        trackingColResults.innerHTML = '<div style="padding:8px;color:var(--red);font-size:13px">Error al buscar</div>';
        trackingColResults.style.display = 'block';
    }
}, 300));

trackingModalConfirm.addEventListener('click', async () => {
    const collectionId = parseInt(trackingModalColId.value);
    const mode = trackingModalMode.value;

    if (!collectionId) { showToast('Selecciona una colección', 'error'); return; }

    try {
        const resp = await apiFetch(`${configuredApiBase}/collection-tracking`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ collection_id: collectionId, tracking_mode: mode })
        });
        if (resp.ok) {
            showToast('Colección añadida al seguimiento', 'success');
            closeTrackingModal();
            loadTracking();
        } else {
            const err = await resp.json();
            showToast(err.message || 'Error al seguir colección', 'error');
        }
    } catch (err) {
        showToast('Error de conexión', 'error');
    }
});

// ==================== EVENT LISTENERS ====================

document.getElementById('addTrackingBtn').addEventListener('click', openTrackingModal);

document.getElementById('trackingFilterCode').addEventListener('input', debounce((e) => {
    trackingFilter = e.target.value;
    loadTracking();
}, 300));

trackingModalMode.addEventListener('change', () => {
    if (trackingSearchCol.value.trim().length >= 2) {
        trackingSearchCol.dispatchEvent(new Event('input'));
    }
});

// ==================== GROUP ASSIGN ====================

const agModal = document.getElementById('assignGroupsModal');
const agBackdrop = document.getElementById('assignGroupsBackdrop');
const agSearchCol = document.getElementById('assignGroupsSearchCol');
const agColResults = document.getElementById('assignGroupsColResults');
const agBody = document.getElementById('assignGroupsBody');
const agBar = document.getElementById('assignGroupsBar');
const agCount = document.getElementById('assignGroupsCount');
const agPicker = document.getElementById('assignGroupsPicker');
const agPickerBackdrop = document.getElementById('assignGroupsPickerBackdrop');
const agGroupSelect = document.getElementById('assignGroupsGroupSelect');
let agSelectedPids = new Set();
let agColId = null;
let agGroupTypes = [];

async function loadAgGroupTypes() {
    try {
        const resp = await apiFetch(apiUrl('types', {per_page: 50, type: 'completion_group'}));
        if (resp.ok) {
            const data = await resp.json();
            agGroupTypes = data.items || [];
            agGroupSelect.innerHTML = agGroupTypes.map(t =>
                `<option value="${t.id}">${esc(t.name)}</option>`
            ).join('');
        }
    } catch (e) { console.error(e); }
}

function openAgModal() {
    agModal.hidden = false;
    document.body.style.overflow = 'hidden';
    agSearchCol.value = '';
    agColId = null;
    agSelectedPids = new Set();
    agBody.innerHTML = '<tr><td colspan="6" class="loading-state">Busca y selecciona una colección para ver sus productos</td></tr>';
    agBar.style.display = 'none';
    agColResults.style.display = 'none';
    setTimeout(() => agSearchCol.focus(), 50);
}

function closeAgModal() {
    agModal.hidden = true;
    document.body.style.overflow = '';
    agColResults.style.display = 'none';
}

agBackdrop.addEventListener('click', closeAgModal);
document.getElementById('assignGroupsBtn').addEventListener('click', () => { loadAgGroupTypes(); openAgModal(); });

agSearchCol.addEventListener('input', debounce(async () => {
    const q = agSearchCol.value.trim();
    if (q.length < 2) { agColResults.style.display = 'none'; return; }
    try {
        const resp = await apiFetch(apiUrl('collections', {q, per_page: 10}));
        if (resp.ok) {
            const data = await resp.json();
            const items = data.items || [];
            if (!items.length) { agColResults.style.display = 'none'; return; }
            // Sort exact code matches first
            const qlower = q.toLowerCase();
            items.sort((a, b) => {
                const aExact = a.code.toLowerCase() === qlower ? 0 : 1;
                const bExact = b.code.toLowerCase() === qlower ? 0 : 1;
                return aExact - bExact;
            });
            agColResults.innerHTML = items.map(c => `
                <div class="ag-col-item" data-col-id="${c.id}" data-col-code="${esc(c.code)}"
                     style="padding:8px;cursor:pointer;border-bottom:1px solid var(--border);font-size:13px"
                     onmouseover="this.style.background='var(--surface-hover)'"
                     onmouseout="this.style.background=''">
                    <span class="suggestion-code">${esc(c.code)}</span>
                    ${c.name ? `<span class="suggestion-name">${formatName(c.name, c.name_alter)}</span>` : ''}
                    ${c.is_manual ? '<span class="suggestion-manual" title="Manual">M</span>' : ''}
                </div>
            `).join('');
            agColResults.style.display = 'block';
            agColResults.querySelectorAll('.ag-col-item').forEach(el => {
                el.addEventListener('click', () => {
                    agSearchCol.value = el.dataset.colCode;
                    agColId = el.dataset.colId;
                    agColResults.style.display = 'none';
                    loadAgProducts();
                });
            });
        }
    } catch (e) { console.error(e); }
}, 300));

document.addEventListener('click', (e) => {
    if (!agSearchCol.contains(e.target) && !agColResults.contains(e.target)) {
        agColResults.style.display = 'none';
    }
});

async function loadAgProducts() {
    agBody.innerHTML = '<tr><td colspan="6" class="loading-state">Cargando productos...</td></tr>';
    agSelectedPids = new Set();
    agBar.style.display = 'none';
    agCount.textContent = '0 productos seleccionados';
    const selAll = document.getElementById('agSelectAll');
    if (selAll) selAll.checked = false;
    try {
        const params = { per_page: 500 };
        if (agColId) {
            params.collection_id = agColId;
        } else {
            params.collection_code = agSearchCol.value.trim();
        }
        const resp = await apiFetch(apiUrl('product-catalog', params));
        if (!resp.ok) { agBody.innerHTML = '<tr><td colspan="6" class="loading-state">Error al cargar</td></tr>'; return; }
        const data = await resp.json();
        const items = data.items || [];
        if (!items.length) { agBody.innerHTML = '<tr><td colspan="6" class="empty-state">Sin productos</td></tr>'; return; }

        agBody.innerHTML = items.map(p => {
            const sep = p.image_url && p.image_url.includes('?') ? '&' : '?';
            const imgUrl = p.image_url ? `${apiOrigin}${p.image_url}${sep}size=sm` : '';
            const fullImgUrl = p.image_url ? `${apiOrigin}${p.image_url}` : '';
            const thumb = imgUrl
                ? `<div class="thumb-wrap ag-thumb"><img class="product-thumb-img" data-src="${esc(imgUrl)}" alt="" loading="lazy"><div class="ag-preview" style="display:none;position:fixed;z-index:9999;pointer-events:none;background:var(--surface-strong);border:1px solid var(--border);border-radius:8px;box-shadow:0 8px 32px rgba(0,0,0,0.6);padding:4px"><img data-src="${esc(fullImgUrl)}" alt="" loading="lazy" style="display:block;max-height:70vh;max-width:40vw;border-radius:4px"></div></div>`
                : `<div class="inv-img-thumb"><svg class="thumb-placeholder" viewBox="0 0 24 24" width="42" height="42" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"></rect><path d="m8 14 2.5-2.5L14 15l2-2 3 3"></path><circle cx="8.5" cy="8.5" r="1.5"></circle></svg></div>`;

            return `
                <tr class="ag-row clickable-row" data-pid="${p.product_id}">
                    <td class="ag-img-cell" style="padding:4px;vertical-align:middle;width:1%">${thumb}</td>
                    <td>
                        <span style="font-weight:600;font-size:13px">${esc(p.collection_code)}</span>
                        ${p.collection_is_manual ? ' <span class="suggestion-manual" title="Manual">M</span>' : ''}
                        <div style="font-size:11px;color:var(--text-muted);margin-top:1px">${esc(p.collection_name || '')}</div>
                    </td>
                    <td>${esc(p.product_number || '-')}</td>
                    <td>${esc(p.product_name || '-')}</td>
                    <td style="color:var(--cyan);font-size:13px">${esc(p.completion_group || 'Standard')}</td>
                    <td style="text-align:center"><input type="checkbox" class="ag-checkbox" data-pid="${p.product_id}"></td>
                </tr>
            `;
        }).join('');

        const allCbs = agBody.querySelectorAll('.ag-checkbox');

        agBody.querySelectorAll('.ag-row').forEach(row => {
            row.addEventListener('click', () => {
                const cb = row.querySelector('.ag-checkbox');
                if (!cb) return;
                cb.checked = !cb.checked;
                const pid = parseInt(cb.dataset.pid);
                if (cb.checked) {
                    agSelectedPids.add(pid);
                    row.style.background = 'var(--cyan-subtle)';
                } else {
                    agSelectedPids.delete(pid);
                    row.style.background = '';
                }
                if (selAll) selAll.checked = agSelectedPids.size === allCbs.length;
                updateAgBar();
            });
        });

        if (selAll) {
            selAll.onchange = () => {
                allCbs.forEach(cb => {
                    const pid = parseInt(cb.dataset.pid);
                    cb.checked = selAll.checked;
                    const row = cb.closest('tr');
                    if (selAll.checked) {
                        agSelectedPids.add(pid);
                        if (row) row.style.background = 'var(--cyan-subtle)';
                    } else {
                        agSelectedPids.delete(pid);
                        if (row) row.style.background = '';
                    }
                });
                updateAgBar();
            };
        }

        if (typeof loadImages === 'function') loadImages(agBody);

        agBody.querySelectorAll('.ag-thumb').forEach(thumb => {
            const preview = thumb.querySelector('.ag-preview');
            if (!preview) return;
            thumb.addEventListener('mouseenter', (e) => {
                preview.style.display = '';
                const rect = thumb.getBoundingClientRect();
                preview.style.top = Math.min(rect.top, window.innerHeight - 300) + 'px';
                preview.style.left = Math.min(rect.right + 8, window.innerWidth - 400) + 'px';
            });
            thumb.addEventListener('mouseleave', () => { preview.style.display = 'none'; });
        });
    } catch (e) {
        agBody.innerHTML = '<tr><td colspan="6" class="loading-state">Error al cargar</td></tr>';
    }
}

function updateAgBar() {
    if (agSelectedPids.size === 0) {
        agBar.style.display = 'none';
    } else {
        agBar.style.display = 'flex';
        agCount.textContent = agSelectedPids.size + ' productos seleccionados';
    }
}

document.getElementById('assignGroupsClearBtn').addEventListener('click', () => {
    agSelectedPids = new Set();
    agBody.querySelectorAll('.ag-row').forEach(row => { row.style.background = ''; });
    agBody.querySelectorAll('.ag-checkbox').forEach(cb => { cb.checked = false; });
    const selAll = document.getElementById('agSelectAll');
    if (selAll) selAll.checked = false;
    updateAgBar();
});

document.getElementById('assignGroupsApplyBtn').addEventListener('click', () => {
    if (agSelectedPids.size === 0) return;
    agPicker.hidden = false;
});

agPickerBackdrop.addEventListener('click', () => { agPicker.hidden = true; });
document.getElementById('assignGroupsPickerCancel').addEventListener('click', () => { agPicker.hidden = true; });

document.getElementById('assignGroupsPickerConfirm').addEventListener('click', async () => {
    const gid = parseInt(agGroupSelect.value);
    if (!gid) { showToast('Selecciona un grupo', 'error'); return; }
    const btn = document.getElementById('assignGroupsPickerConfirm');
    btn.disabled = true;
    btn.textContent = 'Aplicando...';
    let ok = 0, fail = 0;
    for (const pid of agSelectedPids) {
        try {
            const resp = await apiFetch(apiUrl(`products/${pid}`), {
                method: 'PATCH', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({completion_group_id: gid})
            });
            if (resp.ok) ok++; else fail++;
        } catch (e) { fail++; }
    }
    btn.disabled = false;
    btn.textContent = 'Aplicar';
    agPicker.hidden = true;
    showToast(`${ok} actualizados${fail ? ', ' + fail + ' fallos' : ''}`, fail ? 'error' : 'success');
    if (ok > 0) await loadAgProducts();
});
