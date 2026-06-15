// ==================== WISHLIST ====================

const wlState = {
    page: 1, perPage: 50, pages: 0, total: 0, loaded: 0, loading: false, hasNext: true,
    language_id: '', condition_id: '', card_type_id: '',
    collection_code: '', product_number: '', product_name: '', w_state: ''
};

const wlBody = document.getElementById('wishlistBody');
const wlEmpty = document.getElementById('wishlistEmpty');
const wlSummary = document.getElementById('wishlistSummary');
const wlSentinel = document.getElementById('wlSentinel');

let wlViewMode = 'list';

document.querySelectorAll('.wl-view-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.wl-view-btn').forEach(b => {
            b.style.background = 'transparent';
            b.classList.remove('active');
        });
        btn.style.background = 'var(--surface-strong)';
        btn.classList.add('active');
        wlViewMode = btn.dataset.view;
        const tw = document.getElementById('wlTableView');
        tw.className = 'table-wrap';
        if (wlViewMode !== 'list') tw.classList.add('view-' + wlViewMode);
        loadWishlist({reset: true});
    });
});

function wlImageCell(url) {
    const placeholder = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";
    if (!url) {
        return `<div class="inv-img-thumb"><svg class="thumb-placeholder" viewBox="0 0 24 24" width="42" height="42" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"></rect><path d="m8 14 2.5-2.5L14 15l2-2 3 3"></path><circle cx="8.5" cy="8.5" r="1.5"></circle></svg></div>`;
    }
    const imgUrl = assetUrl(url);
    const sep = imgUrl.includes('?') ? '&' : '?';
    return `<div class="inv-img-thumb"><img class="product-thumb-img" src="${placeholder}" data-src="${esc(imgUrl + sep + 'size=sm')}" alt="" loading="lazy"></div>`;
}

function renderWishlistRow(item) {
    const target = item.target_price ? parseFloat(item.target_price) : null;
    const last = item.last_price ? parseFloat(item.last_price) : null;
    const minPrice = item.min_price ? parseFloat(item.min_price) : null;
    const maxPrice = item.max_price ? parseFloat(item.max_price) : null;

    let targetClass = '';
    if (target && last !== null) {
        targetClass = last <= target ? 'diff-pos' : '';
    }

    const typeDisplay = item.type_short ? esc(item.type_short) : '';
    const codeNum = esc(item.collection_code || '-') + (item.product_number ? ' ' + esc(item.product_number) : '');
    const nameDisplay = item.product_name ? `<strong>${esc(item.product_name)}</strong>` : '<em style="color:var(--muted)">(sin nombre)</em>';
    const noteDisplay = item.notes ? `<br><span class="inv-note">${esc(item.notes)}</span>` : '';
    const targetDisplay = target != null ? formatEuro(target) : '-';
    const lastDisplay = last != null ? `<span class="${targetClass}">${formatEuro(last)}</span>` : '-';
    const minDisplay = minPrice != null ? formatEuro(minPrice) : '-';
    const maxDisplay = maxPrice != null ? formatEuro(maxPrice) : '-';

    const wState = item.w_state || 'buscando';
    const wStateLabels = { buscando: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg> Buscando`, notificado: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg> Notificado`, inactivo: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg> Inactivo`, comprado: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg> Comprado` };
    const wStateDisplay = wStateLabels[wState] || wState;

    return `<tr class="wl-row" data-id="${item.id}">
        <td class="inv-img-cell">${wlImageCell(item.product_image_url)}</td>
        <td>${typeDisplay}</td>
        <td>${esc(item.collection_code || '')}</td>
        <td><span style="color:var(--muted)">(${codeNum})</span> ${nameDisplay}${noteDisplay}</td>
        <td>${esc(item.language_name || '-')}</td>
        <td>${esc(item.condition_name || '-')}</td>
        <td>${wStateDisplay}</td>
        <td>${targetDisplay}</td>
        <td>${lastDisplay}</td>
        <td>${minDisplay}</td>
        <td>${maxDisplay}</td>
        <td>${esc(item.notes || '')}</td>
        <td style="text-align:center">
            <button type="button" class="btn-delete-wl" data-id="${item.id}" title="Eliminar" style="background:none;border:none;color:var(--red);cursor:pointer;font-size:18px;line-height:1;padding:2px 6px">&times;</button>
        </td>
    </tr>`;
}

function appendWishlist(items) {
    if (!items.length && wlState.loaded === 0) { wlBody.innerHTML = ''; wlEmpty.hidden = false; return; }
    wlEmpty.hidden = true;
    wlBody.insertAdjacentHTML('beforeend', items.map(renderWishlistRow).join(''));
    loadImages(wlBody);
}

function updateWishlistProgress() {
    const f = wlState.loaded ? 1 : 0;
    wlSummary.textContent = `${f}-${wlState.loaded} de ${wlState.total} productos`;
}

async function loadWishlist({reset = false} = {}) {
    const s = wlState;
    if (s.loading || (!s.hasNext && !reset)) return;
    if (reset) { s.page = 1; s.pages = 0; s.total = 0; s.loaded = 0; s.hasNext = true; wlBody.innerHTML = ''; wlEmpty.hidden = true; wlBody.innerHTML = '<tr><td colspan="13" class="loading-state">Cargando...</td></tr>'; }
    s.loading = true;
    try {
        const params = {page: s.page, per_page: s.perPage};
        if (s.language_id) params.language_id = s.language_id;
        if (s.condition_id) params.condition_id = s.condition_id;
        if (s.card_type_id) params.card_type_id = s.card_type_id;
        if (s.collection_code) params.collection_code = s.collection_code;
        if (s.product_number) params.product_number = s.product_number;
        if (s.product_name) params.product_name = s.product_name;
        if (s.w_state) params.w_state = s.w_state;
        const resp = await apiFetch(apiUrl('wishlist-items', params));
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        const data = await resp.json();
        if (reset) wlBody.innerHTML = '';
        appendWishlist(data.items);
        s.pages = data.pagination.pages; s.total = data.pagination.total; s.hasNext = data.pagination.has_next;
        s.loaded += data.items.length; s.page += 1;
        updateWishlistProgress();
        setTimeout(checkWlScroll, 50);
    } catch (e) {
        if (s.loaded === 0) { wlBody.innerHTML = ''; wlEmpty.hidden = false; }
        wlSummary.textContent = 'Error al cargar';
        s.hasNext = false;
    } finally {
        s.loading = false;
    }
}

function checkWlScroll() {
    if (wlState.loading || !wlState.hasNext) return;
    const r = wlSentinel.getBoundingClientRect();
    if (r.top <= window.innerHeight + 700) loadWishlist();
}

const wlObs = new IntersectionObserver(entries => {
    if (entries.some(e => e.isIntersecting)) loadWishlist();
}, {rootMargin: '640px 0px'});
if (wlSentinel) wlObs.observe(wlSentinel);

// Wishlist filters
let wlFilterTimers = {};

function setupWishlistFilters() {
    const typeSelect = document.getElementById('wlFilterType');
    const colCodeInput = document.getElementById('wlFilterColCode');
    const numberInput = document.getElementById('wlFilterNumber');
    const nameInput = document.getElementById('wlFilterName');
    const langSelect = document.getElementById('wlFilterLang');
    const condSelect = document.getElementById('wlFilterCondition');
    const wStateSelect = document.getElementById('wlFilterWState');

    if (typeSelect) {
        typeSelect.addEventListener('change', () => {
            wlState.card_type_id = typeSelect.value;
            loadWishlist({reset: true});
        });
    }
    if (colCodeInput) {
        colCodeInput.addEventListener('input', () => {
            clearTimeout(wlFilterTimers.colCode);
            wlFilterTimers.colCode = setTimeout(() => {
                wlState.collection_code = colCodeInput.value.trim();
                loadWishlist({reset: true});
            }, 300);
        });
    }
    if (numberInput) {
        numberInput.addEventListener('input', () => {
            clearTimeout(wlFilterTimers.number);
            wlFilterTimers.number = setTimeout(() => {
                wlState.product_number = numberInput.value.trim();
                loadWishlist({reset: true});
            }, 300);
        });
    }
    if (nameInput) {
        nameInput.addEventListener('input', () => {
            clearTimeout(wlFilterTimers.name);
            wlFilterTimers.name = setTimeout(() => {
                wlState.product_name = nameInput.value.trim();
                loadWishlist({reset: true});
            }, 300);
        });
    }
    if (langSelect) {
        langSelect.addEventListener('change', () => {
            wlState.language_id = langSelect.value;
            loadWishlist({reset: true});
        });
    }
    if (condSelect) {
        condSelect.addEventListener('change', () => {
            wlState.condition_id = condSelect.value;
            loadWishlist({reset: true});
        });
    }
    if (wStateSelect) {
        wStateSelect.addEventListener('change', () => {
            wlState.w_state = wStateSelect.value;
            loadWishlist({reset: true});
        });
    }
}

async function loadWishlistFilterData() {
    try {
        const [typeResp, langResp, condResp] = await Promise.all([
            apiFetch(apiUrl('types', {per_page: 200})),
            apiFetch(apiUrl('languages')),
            apiFetch(apiUrl('product-conditions')),
        ]);
        const [typeData, langData, condData] = await Promise.all([
            typeResp.ok ? typeResp.json() : [],
            langResp.ok ? langResp.json() : [],
            condResp.ok ? condResp.json() : [],
        ]);
        const types = (typeData.items || []).filter(t => t.type === 'card');
        const wStates = (typeData.items || []).filter(t => t.type === 'w_state');
        const languages = langData.items || langData || [];
        const conditions = condData.items || condData || [];

        const typeSel = document.getElementById('wlFilterType');
        if (typeSel) {
            typeSel.innerHTML = '<option value="">Todos</option>';
            (types || []).forEach(t => {
                const opt = document.createElement('option');
                opt.value = t.id;
                opt.textContent = t.name + (t.short_name ? ' (' + t.short_name + ')' : '');
                typeSel.appendChild(opt);
            });
        }
        const langSel = document.getElementById('wlFilterLang');
        if (langSel) {
            langSel.innerHTML = '<option value="">Todos</option>';
            (languages || []).forEach(l => {
                const opt = document.createElement('option');
                opt.value = l.id;
                opt.textContent = l.name;
                langSel.appendChild(opt);
            });
        }
        const condSel = document.getElementById('wlFilterCondition');
        if (condSel) {
            condSel.innerHTML = '<option value="">Todos</option>';
            (conditions || []).forEach(c => {
                const opt = document.createElement('option');
                opt.value = c.id;
                opt.textContent = c.name;
                condSel.appendChild(opt);
            });
        }
        const wStateSel = document.getElementById('wlFilterWState');
        if (wStateSel) {
            wStateSel.innerHTML = '<option value="">Todos</option>';
            (wStates || []).forEach(s => {
                const opt = document.createElement('option');
                opt.value = s.name.toLowerCase();
                opt.textContent = s.name.charAt(0).toUpperCase() + s.name.slice(1);
                wStateSel.appendChild(opt);
            });
        }
    } catch (e) {
        console.error('Error loading wishlist filter data:', e);
    }
}

// Event delegation: row click → edit, × button → delete
document.getElementById('tabWishlist').addEventListener('click', (e) => {
    const delBtn = e.target.closest('.btn-delete-wl');
    if (delBtn) {
        deleteWishlistItem(parseInt(delBtn.dataset.id));
        return;
    }

    const row = e.target.closest('.wl-row');
    if (row) editWishlistItem(parseInt(row.dataset.id));
});

async function deleteWishlistItem(id) {
    if (!confirm('¿Eliminar este producto de la wishlist?')) return;
    try {
        const resp = await apiFetch(apiUrl(`wishlist-items/${id}`), { method: 'DELETE' });
        if (resp.ok) {
            loadWishlist({reset: true});
        } else {
            alert('Error al eliminar');
        }
    } catch (e) {
        console.error(e);
        alert('Error al eliminar');
    }
}

async function editWishlistItem(id) {
    const resp = await apiFetch(apiUrl(`wishlist-items/${id}`));
    if (!resp.ok) return;
    const item = await resp.json();
    if (!item) return;

    document.getElementById('modalWishlistId').value = id;
    document.getElementById('wishlistTargetPrice').value = item.target_price || '';
    document.getElementById('wishlistNotes').value = item.notes || '';
    document.getElementById('wishlistWState').value = item.w_state || 'buscando';
    document.getElementById('wishlistProduct').value = '';
    document.getElementById('wishlistProduct').dataset.productId = item.product_id;
    document.getElementById('wishlistLang').value = item.language_id || '';
    document.getElementById('wishlistCondition').value = item.condition_id || '';
    document.getElementById('wishlistModalTitle').textContent = 'Editar wishlist';

    document.getElementById('wishlistProductSearch').style.display = 'none';
    document.getElementById('wishlistProductSection').style.display = 'flex';
    document.getElementById('wishlistCollectionDisplay').textContent = item.collection_code || '-';
    const codeNum = item.collection_code ? (item.collection_code + (item.product_number ? ' ' + esc(item.product_number) : '')) : (item.product_number ? esc(item.product_number) : '');
    const prodNameFmt = esc(item.product_name || '');
    document.getElementById('wishlistProductDisplay').innerHTML = codeNum
        ? '<span style="color:var(--muted)">' + codeNum + '</span>' + (prodNameFmt ? ' <strong>' + prodNameFmt + '</strong>' : '')
        : (prodNameFmt ? '<strong>' + prodNameFmt + '</strong>' : '<em style="color:var(--muted)">(sin nombre)</em>');

    loadWishlistSelects(() => {
        document.getElementById('wishlistLang').value = item.language_id || '';
        document.getElementById('wishlistCondition').value = item.condition_id || '';
    });

    showModal('wishlistModal');
}

function showWishlistModal() {
    document.getElementById('modalWishlistId').value = '';
    document.getElementById('wishlistForm').reset();
    document.getElementById('wishlistProduct').value = '';
    document.getElementById('wishlistProduct').dataset.productId = '';
    document.getElementById('wishlistTargetPrice').value = '';
    document.getElementById('wishlistNotes').value = '';
    document.getElementById('wishlistLang').value = '';
    document.getElementById('wishlistCondition').value = '';
    document.getElementById('wishlistModalTitle').textContent = 'Añadir a wishlist';
    document.getElementById('wishlistProductSearch').style.display = '';
    document.getElementById('wishlistProductSection').style.display = 'none';
    loadWishlistSelects();
    showModal('wishlistModal');
}

function loadWishlistSelects(callback) {
    const langSel = document.getElementById('wishlistLang');
    const condSel = document.getElementById('wishlistCondition');

    const langProm = langSel.options.length <= 1 ? loadSelectOptions(langSel, apiUrl('languages'), 'name', 'id', '(cualquier idioma)') : Promise.resolve();
    const condProm = condSel.options.length <= 1 ? loadSelectOptions(condSel, apiUrl('product-conditions'), 'name', 'id', '(cualquier estado)') : Promise.resolve();

    Promise.all([langProm, condProm]).then(() => { if (callback) callback(); });
}

// Product search for wishlist
(function initWishlistSearch() {
    document.addEventListener('DOMContentLoaded', () => {
        const input = document.getElementById('wishlistProduct');
        const suggestions = document.getElementById('wishlistSuggestions');
        if (!input) return;

        let debounceTimer;

        input.addEventListener('input', () => {
            clearTimeout(debounceTimer);
            delete input.dataset.productId;
            const q = input.value.trim();
            if (q.length < 2) { suggestions.style.display = 'none'; return; }
            debounceTimer = setTimeout(async () => {
                try {
                    const resp = await apiFetch(apiUrl('product-catalog', { q, page: 1, per_page: 10 }));
                    if (!resp.ok) return;
                    const data = await resp.json();
                    const items = data.items || data;
                    suggestions.innerHTML = items.map(p =>
                        `<div class="suggestion-item" data-id="${p.product_id || p.id}" data-name="${esc(p.collection_code || '')} ${esc(p.product_number || '')}" data-collection="${esc(p.collection_code || '')}" data-number="${esc(p.product_number || '')}" data-productname="${esc(p.product_name || '')}">
                            <span style="color:var(--muted)">(${esc(p.collection_code || '-')} ${esc(p.product_number || '-')})</span> ${esc(p.product_name || '')}
                        </div>`
                    ).join('');
                    suggestions.style.display = items.length ? '' : 'none';

                    suggestions.querySelectorAll('.suggestion-item').forEach(el => {
                        el.addEventListener('click', () => {
                            const colCode = el.dataset.collection || '';
                            const num = el.dataset.number || '';
                            const prodName = el.dataset.productname || '';
                            const parts = [colCode, num, prodName].filter(Boolean);
                            input.value = parts.join(' ');
                            input.dataset.productId = el.dataset.id;
                            suggestions.style.display = 'none';
                        });
                    });
                } catch (e) { console.error(e); }
            }, 300);
        });

        document.addEventListener('click', (e) => {
            if (!suggestions.contains(e.target) && e.target !== input) {
                suggestions.style.display = 'none';
            }
        });
    });
})();

// Form submit
(function initWishlistForm() {
    const form = document.getElementById('wishlistForm');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const id = document.getElementById('modalWishlistId').value;
        const productInput = document.getElementById('wishlistProduct');
        const productId = productInput.dataset.productId;
        const targetPrice = document.getElementById('wishlistTargetPrice').value;
        const languageId = document.getElementById('wishlistLang').value;
        const conditionId = document.getElementById('wishlistCondition').value;
        const notes = document.getElementById('wishlistNotes').value;

        if (!productId && !id) {
            alert('Selecciona un producto');
            return;
        }

        const wState = document.getElementById('wishlistWState').value;
        const body = {};
        if (targetPrice) body.target_price = targetPrice;
        if (languageId) body.language_id = parseInt(languageId);
        if (conditionId) body.condition_id = parseInt(conditionId);
        if (wState) body.w_state = wState;
        if (notes) body.notes = notes;
        if (productId) body.product_id = parseInt(productId);

        try {
            let resp;
            if (id) {
                resp = await apiFetch(apiUrl(`wishlist-items/${id}`), {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                });
            } else {
                resp = await apiFetch(apiUrl('wishlist-items'), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                });
            }

            if (resp.ok) {
                hideModal('wishlistModal');
                loadWishlist({reset: true});
            } else {
                const err = await resp.json();
                alert(err.message || 'Error al guardar');
            }
        } catch (e) {
            console.error(e);
            alert('Error al guardar');
        }
    });

    document.getElementById('wishlistCancel').addEventListener('click', () => {
        hideModal('wishlistModal');
    });
})();

// User profile modal
(function initUserProfile() {
    document.addEventListener('DOMContentLoaded', () => {
        const form = document.getElementById('userProfileForm');
        if (!form) return;

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('profileEmail').value.trim();
            const telegram = document.getElementById('profileTelegram').value.trim();

            const body = {};
            if (email) body.email = email;
            if (telegram) body.telegram_id = telegram;

            try {
                const resp = await apiFetch(apiUrl('auth/me'), {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                });
                if (resp.ok) {
                    hideModal('userProfileModal');
                    alert('Perfil actualizado');
                } else {
                    alert('Error al actualizar perfil');
                }
            } catch (e) {
                console.error(e);
                alert('Error al actualizar perfil');
            }
        });

        document.getElementById('userProfileCancel').addEventListener('click', () => {
            hideModal('userProfileModal');
        });
    });
})();

document.addEventListener('DOMContentLoaded', () => {
    const addBtn = document.getElementById('addWishlistBtn');
    if (addBtn) addBtn.addEventListener('click', showWishlistModal);

    const wlBackdrop = document.getElementById('wishlistBackdrop');
    if (wlBackdrop) wlBackdrop.addEventListener('click', () => {
        hideModal('wishlistModal');
    });

    const profileBackdrop = document.getElementById('userProfileBackdrop');
    if (profileBackdrop) profileBackdrop.addEventListener('click', () => hideModal('userProfileModal'));

    loadWishlistFilterData();
    setupWishlistFilters();
});

function showUserProfile() {
    const emailInput = document.getElementById('profileEmail');
    const telegramInput = document.getElementById('profileTelegram');

    apiFetch(apiUrl('auth/me')).then(resp => {
        if (!resp.ok) return;
        resp.json().then(user => {
            emailInput.value = user.email || '';
            telegramInput.value = user.telegram_id || '';
        });
    });

    showModal('userProfileModal');
}
