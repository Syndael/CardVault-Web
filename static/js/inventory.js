const DEFAULT_API_BASE = "http://127.0.0.1:5000/api";
const urlParams = new URLSearchParams(window.location.search);
const configuredApiBase = (
    urlParams.get("api")
    || window.localStorage.getItem("cardvault_api_base")
    || DEFAULT_API_BASE
).replace(/\/$/, "");
window.localStorage.setItem("cardvault_api_base", configuredApiBase);
const apiOrigin = new URL(configuredApiBase).origin;
const TOKEN_KEY = "cardvault_token";
let appStarted = false;

async function apiFetch(url, options = {}) {
    options = options || {};
    options.headers = options.headers || {};
    const token = window.localStorage.getItem(TOKEN_KEY);
    if (token) options.headers['Authorization'] = `Bearer ${token}`;
    if (!options.headers['Accept']) options.headers['Accept'] = 'application/json';
    try {
        const resp = await fetch(url, options);
        if (resp.status === 401) handleUnauthorized();
        return resp;
    } catch (err) { throw err; }
}

function handleUnauthorized() {
    window.localStorage.removeItem(TOKEN_KEY);
    updateAuthUI();
}

let currentUserRoles = [];

async function loadCurrentUser() {
    const el = document.getElementById('authPanel');
    if (!el) return;
    const token = window.localStorage.getItem(TOKEN_KEY);
    if (!token) {
        el.innerHTML = '';
        const b = document.createElement('button');
        b.id = 'loginToggle'; b.type = 'button'; b.textContent = 'Iniciar sesion';
        b.addEventListener('click', showLoginModal);
        el.appendChild(b);
        return;
    }
    try {
        const resp = await apiFetch(apiUrl('auth/me'));
        if (!resp.ok) {
            window.localStorage.removeItem(TOKEN_KEY);
            currentUserRoles = [];
            el.innerHTML = '';
            const b = document.createElement('button');
            b.id = 'loginToggle'; b.type = 'button'; b.textContent = 'Iniciar sesion';
            b.addEventListener('click', showLoginModal);
            el.appendChild(b);
            return;
        }
        const user = await resp.json();
        currentUserRoles = user.roles || [];
        el.innerHTML = `<span id="userDisplay">${esc(user.display_name || user.username)}</span> <button id="logoutButton">Cerrar sesion</button>`;
        document.getElementById('logoutButton').addEventListener('click', logout);
        appStarted = true;
        applyRoleUI();
        loadTab(currentTab);
    } catch (err) {
        console.error(err);
        currentUserRoles = [];
        el.innerHTML = '';
        const b = document.createElement('button');
        b.id = 'loginToggle'; b.type = 'button'; b.textContent = 'Iniciar sesion';
        b.addEventListener('click', showLoginModal);
        el.appendChild(b);
    }
}

function hasRole(role) {
    return currentUserRoles.includes(role) || currentUserRoles.includes('admin');
}

function applyRoleUI() {
    const validRoles = ['product_read', 'product_write', 'inventory_manage', 'admin'];
    const hasAny = validRoles.some(r => currentUserRoles.includes(r));

    const noPermMsg = document.getElementById('noPermission');
    if (!hasAny && appStarted) {
        const tabs = document.getElementById('mainTabs');
        const tabContents = document.querySelectorAll('.tab-content');
        if (tabs) tabs.style.display = 'none';
        tabContents.forEach(t => t.style.display = 'none');
        const toolbar = document.querySelector('.toolbar');
        if (toolbar) toolbar.style.display = 'none';
        if (!noPermMsg) {
            const msg = document.createElement('div');
            msg.id = 'noPermission';
            msg.style.cssText = 'padding:60px 20px;text-align:center;color:var(--muted);font-size:18px;';
            msg.textContent = 'No tienes permisos asignados. Contacta con el administrador.';
            document.querySelector('.app-shell').appendChild(msg);
        }
        document.getElementById('resultSummary').textContent = 'Sin acceso';
        return;
    }
    if (noPermMsg) noPermMsg.remove();
    const tabs = document.getElementById('mainTabs');
    const tabContents = document.querySelectorAll('.tab-content');
    if (tabs) tabs.style.display = '';
    tabContents.forEach(t => t.style.display = '');
    const toolbar = document.querySelector('.toolbar');
    if (toolbar) toolbar.style.display = '';

    const addInvBtn = document.getElementById('addInventoryBtn');
    if (addInvBtn) addInvBtn.style.display = hasRole('inventory_manage') ? '' : 'none';
    const addPurBtn = document.getElementById('addPurchaseBtn');
    if (addPurBtn) addPurBtn.style.display = hasRole('inventory_manage') ? '' : 'none';
    const showAllLabel = document.getElementById('showAllLabel');
    if (showAllLabel) showAllLabel.style.display = currentUserRoles.includes('admin') ? '' : 'none';
}

function showLoginModal() {
    const m = document.getElementById('loginModal');
    if (!m) return;
    m.hidden = false; document.body.style.overflow = 'hidden';
    setTimeout(() => { const i = m.querySelector('input[name="username"]'); if (i) i.focus(); }, 50);
}
function hideLoginModal() {
    const m = document.getElementById('loginModal');
    if (!m) return;
    m.hidden = true; document.body.style.overflow = '';
}

async function loginSubmit(ev) {
    ev && ev.preventDefault && ev.preventDefault();
    const m = document.getElementById('loginModal');
    if (!m) return;
    const username = m.querySelector('input[name="username"]').value.trim();
    const password = m.querySelector('input[name="password"]').value;
    if (!username || !password) { alert('Usuario y contrasena requeridos'); return; }
    try {
        const resp = await apiFetch(apiUrl('auth/login'), {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({username, password})
        });
        if (!resp.ok) { alert('Login fallido: ' + resp.status); return; }
        const body = await resp.json();
        window.localStorage.setItem(TOKEN_KEY, body.token);
        appStarted = true;
        currentUserRoles = (body.user && body.user.roles) || [];
        hideLoginModal();
        applyRoleUI();
        await loadCurrentUser();
    } catch (err) { console.error(err); alert('Error de login'); }
}

async function logout() {
    try { await apiFetch(apiUrl('auth/logout'), {method: 'POST'}); } catch (e) {}
    window.localStorage.removeItem(TOKEN_KEY);
    currentUserRoles = [];
    appStarted = false;
    updateAuthUI();
}
function updateAuthUI() { loadCurrentUser(); }
function esc(v) { return String(v ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;'); }
function apiUrl(path, params = null) {
    let p = path.replace(/^\//,'');
    if (!p.includes('/')) p += '/';
    const url = new URL(`${configuredApiBase}/${p}`);
    if (params) Object.entries(params).forEach(([k,v]) => { if (v != null && v !== '') url.searchParams.set(k, v); });
    return url.toString();
}

// --- Tab system ---
let currentTab = 'inventory';
document.querySelectorAll('#mainTabs .tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('#mainTabs .tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        currentTab = tab.dataset.tab;
        document.getElementById('tab' + currentTab.charAt(0).toUpperCase() + currentTab.slice(1)).classList.add('active');
        if (appStarted) loadTab(currentTab);
    });
});

function loadTab(tab) {
    if (tab === 'inventory') loadInventory({reset: true});
    else loadPurchases({reset: true});
}

document.getElementById('tabInventory').addEventListener('click', (e) => {
    const row = e.target.closest('tr.clickable-row[data-inv-id]');
    if (row) openEntryModal(row.dataset.invId);
});

document.getElementById('tabPurchases').addEventListener('click', (e) => {
    const row = e.target.closest('tr.clickable-row[data-pur-id]');
    if (row) openPurchaseModal(row.dataset.purId);
});

// --- Shared pagination state ---
const state = {
    inventory: { page: 1, perPage: 50, q: '', pages: 0, total: 0, loaded: 0, loading: false, hasNext: true },
    purchases: { page: 1, perPage: 50, q: '', pages: 0, total: 0, loaded: 0, loading: false, hasNext: true }
};

const searchForm = document.getElementById('searchForm');
const searchInput = document.getElementById('searchInput');

searchForm.addEventListener('submit', (e) => {
    e.preventDefault();
    state.inventory.q = searchInput.value.trim();
    state.purchases.q = searchInput.value.trim();
    loadTab(currentTab);
});

// ==================== INVENTORY ====================
const invBody = document.getElementById('inventoryBody');
const invEmpty = document.getElementById('invEmpty');
const invSummary = document.getElementById('invSummary');
const invSentinel = document.getElementById('invSentinel');

function renderInvLoading() {
    invBody.innerHTML = `<tr><td colspan="7" class="loading-state">Cargando inventario...</td></tr>`;
    invEmpty.hidden = true;
}
function renderInvRow(item) {
    const prod = item.product || {};
    const col = item.collection || {};
    const lang = item.language || {};
    const cond = item.condition || {};
    const stock = item.quantity ?? 0;
    const cls = stock > 0 ? 'stock-positive' : stock < 0 ? 'stock-negative' : 'stock-zero';
    const prodName = prod.translations && prod.translations[0] ? prod.translations[0].name : '';
    const nameHtml = prodName ? `<br><span class="product-name-sub">${esc(prodName)}</span>` : '';
    const sealedIcon = item.is_sealed ? '&#10003;' : '';
    const igIcon = item.posted_instagram ? '&#10003;' : '';
    return `<tr class="clickable-row" data-inv-id="${item.id}">
        <td><strong>${esc(prod.product_number || '-')}</strong>${nameHtml}</td>
        <td>${esc(col.code || col.name || '-')}</td>
        <td>${esc(lang.name || '')}</td>
        <td>${esc(cond.name || '')}</td>
        <td class="${cls}">${stock}</td>
        <td>${sealedIcon}</td>
        <td>${igIcon}</td>
    </tr>`;
}
function appendInv(items) {
    if (!items.length && state.inventory.loaded === 0) { invBody.innerHTML = ''; invEmpty.hidden = false; return; }
    invEmpty.hidden = true;
    invBody.insertAdjacentHTML('beforeend', items.map(renderInvRow).join(''));
}
function updateInvProgress() {
    const f = state.inventory.loaded ? 1 : 0;
    invSummary.textContent = `${f}-${state.inventory.loaded} de ${state.inventory.total}`;
}

async function loadInventory({reset = false} = {}) {
    if (!appStarted) return;
    const s = state.inventory;
    if (s.loading || (!s.hasNext && !reset)) return;
    if (reset) { s.page = 1; s.pages = 0; s.total = 0; s.loaded = 0; s.hasNext = true; invBody.innerHTML = ''; invEmpty.hidden = true; renderInvLoading(); }
    s.loading = true;
    try {
        const params = {page: s.page, per_page: s.perPage, q: s.q};
        const showAllCb = document.getElementById('showAllInv');
        if (showAllCb && showAllCb.checked) params.all = 'true';
        const resp = await apiFetch(apiUrl('inventory', params));
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        const data = await resp.json();
        if (reset) invBody.innerHTML = '';
        appendInv(data.items);
        s.pages = data.pagination.pages; s.total = data.pagination.total; s.hasNext = data.pagination.has_next;
        s.loaded += data.items.length; s.page += 1;
        updateInvProgress();
    } catch (e) {
        if (s.loaded === 0) { invBody.innerHTML = ''; invEmpty.hidden = false; }
        invSummary.textContent = 'Error al cargar';
    } finally {
        s.loading = false;
        setTimeout(checkInvScroll, 50);
    }
}
function checkInvScroll() {
    if (state.inventory.loading || !state.inventory.hasNext) return;
    const r = invSentinel.getBoundingClientRect();
    if (r.top <= window.innerHeight + 700) loadInventory();
}
const invObs = new IntersectionObserver(entries => {
    if (!appStarted) return;
    if (entries.some(e => e.isIntersecting)) loadInventory();
}, {rootMargin: '640px 0px'});
invObs.observe(invSentinel);

// Inventory entry modal
const entryModal = document.getElementById('entryModal');
document.getElementById('entryBackdrop').addEventListener('click', () => entryModal.hidden = true);
document.getElementById('entryCancel').addEventListener('click', () => entryModal.hidden = true);

async function openEntryModal(invId) {
    document.getElementById('modalInventoryId').value = invId || '';
    document.getElementById('entryQuantity').value = '1';
    document.getElementById('entryNote').value = '';
    document.getElementById('entrySealed').checked = false;
    document.getElementById('entryInstagram').checked = false;

    // Load languages and conditions for dropdowns
    try {
        const [langResp, condResp] = await Promise.all([
            apiFetch(apiUrl('languages', {per_page: 200})),
            apiFetch(apiUrl('product-conditions', {per_page: 200}))
        ]);
        if (langResp.ok) {
            const data = await langResp.json();
            const langs = data.items || [];
            const sel = document.getElementById('entryLang');
            sel.innerHTML = '<option value="">(sin idioma)</option>';
            langs.forEach(l => {
                const opt = document.createElement('option');
                opt.value = l.id; opt.textContent = l.name;
                sel.appendChild(opt);
            });
        }
        if (condResp.ok) {
            const data = await condResp.json();
            const conds = data.items || [];
            const sel = document.getElementById('entryCondition');
            sel.innerHTML = '<option value="">(sin estado)</option>';
            conds.forEach(c => {
                const opt = document.createElement('option');
                opt.value = c.id; opt.textContent = c.name;
                sel.appendChild(opt);
            });
        }
    } catch (e) { console.error(e); }

    // Load entry data
    if (invId) {
        try {
            const resp = await apiFetch(apiUrl(`inventory/${invId}`));
            if (resp.ok) {
                const item = await resp.json();
                const prod = item.product || {};
                const col = item.collection || {};
                const lang = item.language || {};
                const cond = item.condition || {};
                const pur = item.purchase || {};
                const prodName = prod.translations && prod.translations[0] ? prod.translations[0].name : '';
                document.getElementById('entryProductDisplay').innerHTML = `<strong>${esc(prod.product_number || '-')}</strong>${prodName ? ' <span style="color:var(--muted)">' + esc(prodName) + '</span>' : ''}`;
                document.getElementById('entryCollectionDisplay').textContent = esc(col.code || col.name || '-');
                document.getElementById('entryQuantity').value = item.quantity ?? 1;
                document.getElementById('entryLang').value = lang.id || '';
                document.getElementById('entryCondition').value = cond.id || '';
                document.getElementById('entrySealed').checked = !!item.is_sealed;
                document.getElementById('entryInstagram').checked = !!item.posted_instagram;
                document.getElementById('entryNote').value = item.notes || '';
                const purInfo = pur.id ? `${(pur.purchase_date || '').slice(0,10)} - ${(pur.entity && pur.entity.name) || ''}` : 'Sin compra';
                document.getElementById('entryPurchaseDisplay').textContent = purInfo;
            }
        } catch (e) { console.error('Error loading inventory entry', e); }
    }

    entryModal.hidden = false;
    document.body.style.overflow = 'hidden';
}

document.getElementById('entryForm').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const invId = document.getElementById('modalInventoryId').value;
    const quantity = parseInt(document.getElementById('entryQuantity').value, 10);
    const languageId = document.getElementById('entryLang').value;
    const conditionId = document.getElementById('entryCondition').value;
    const isSealed = document.getElementById('entrySealed').checked;
    const postedInstagram = document.getElementById('entryInstagram').checked;
    const note = document.getElementById('entryNote').value.trim();
    if (!quantity || quantity < 1) { alert('Cantidad debe ser > 0'); return; }
    const btn = ev.target.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = 'Guardando...';
    try {
        const payload = {
            quantity: quantity,
            ...(languageId ? {language_id: parseInt(languageId)} : {language_id: null}),
            ...(conditionId ? {condition_id: parseInt(conditionId)} : {condition_id: null}),
            is_sealed: isSealed,
            posted_instagram: postedInstagram,
            ...(note ? {notes: note} : {notes: null})
        };
        const resp = await apiFetch(apiUrl(`inventory/${invId}`), {
            method: 'PATCH', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload)
        });
        if (!resp.ok) { const t = await resp.text().catch(()=>null); alert('Error: ' + resp.status + ' ' + (t||'')); return; }
        entryModal.hidden = true; document.body.style.overflow = '';
        loadInventory({reset: true});
    } catch (e) { console.error(e); alert('Error al guardar'); }
    finally { btn.disabled = false; btn.textContent = 'Guardar'; }
});

// ==================== ADD INVENTORY ====================
const addInvModal = document.getElementById('addInvModal');
document.getElementById('addInvBackdrop').addEventListener('click', closeAddInvModal);
document.getElementById('addInvCancel').addEventListener('click', closeAddInvModal);

document.getElementById('addInventoryBtn').addEventListener('click', openAddInvModal);

function closeAddInvModal() { addInvModal.hidden = true; document.body.style.overflow = ''; }

let addInvProductCache = {};

let addInvPurchasesCache = [];
let addInvSelectedPurchaseId = null;

async function openAddInvModal() {
    document.getElementById('addInvProduct').value = '';
    delete document.getElementById('addInvProduct').dataset.productId;
    document.getElementById('addInvQty').value = '1';
    document.getElementById('addInvPurchase').value = '';
    addInvSelectedPurchaseId = null;
    document.getElementById('addInvNotes').value = '';
    document.getElementById('addInvSealed').checked = false;
    document.getElementById('addInvInstagram').checked = false;
    closeAddInvSuggestions();
    closeAddInvPurchaseSuggestions();

    // Load languages, conditions and purchases
    try {
        const [langResp, condResp, purResp] = await Promise.all([
            apiFetch(apiUrl('languages', {per_page: 200})),
            apiFetch(apiUrl('product-conditions', {per_page: 200})),
            apiFetch(apiUrl('purchases', {per_page: 200}))
        ]);
        if (langResp.ok) {
            const data = await langResp.json();
            const langs = data.items || [];
            const sel = document.getElementById('addInvLang');
            sel.innerHTML = '<option value="">(sin idioma)</option>';
            langs.forEach(l => {
                const opt = document.createElement('option');
                opt.value = l.id; opt.textContent = l.name;
                sel.appendChild(opt);
            });
        }
        if (condResp.ok) {
            const data = await condResp.json();
            const conds = data.items || [];
            const sel = document.getElementById('addInvCondition');
            sel.innerHTML = '<option value="">(sin estado)</option>';
            conds.forEach(c => {
                const opt = document.createElement('option');
                opt.value = c.id; opt.textContent = c.name;
                sel.appendChild(opt);
            });
        }
        if (purResp.ok) {
            const data = await purResp.json();
            addInvPurchasesCache = data.items || [];
        }
    } catch (e) { console.error(e); }

    addInvModal.hidden = false;
    document.body.style.overflow = 'hidden';
    setTimeout(() => document.getElementById('addInvProduct').focus(), 50);
}

// Product autocomplete for add inventory
const addInvProductInput = document.getElementById('addInvProduct');
const addInvSuggestions = document.getElementById('addInvSuggestions');

let addInvSearchTimeout;
addInvProductInput.addEventListener('input', () => {
    clearTimeout(addInvSearchTimeout);
    delete addInvProductInput.dataset.productId;
    const q = addInvProductInput.value.trim();
    if (q.length < 2) { closeAddInvSuggestions(); return; }
    addInvSearchTimeout = setTimeout(() => searchAddInvProducts(q), 300);
});

addInvProductInput.addEventListener('blur', () => {
    setTimeout(closeAddInvSuggestions, 200);
});

async function searchAddInvProducts(q) {
    try {
        const resp = await apiFetch(apiUrl('product-catalog', {q, per_page: 10}));
        if (!resp.ok) return;
        const data = await resp.json();
        const items = data.items || [];
        if (items.length === 0) { closeAddInvSuggestions(); return; }
        showAddInvSuggestions(items);
    } catch (e) { console.error(e); }
}

function showAddInvSuggestions(items) {
    closeAddInvSuggestions();
    const rect = addInvProductInput.getBoundingClientRect();
    addInvSuggestions.style.display = 'block';
    addInvSuggestions.style.top = (rect.bottom + window.scrollY) + 'px';
    addInvSuggestions.style.left = (rect.left + window.scrollX) + 'px';
    addInvSuggestions.style.width = rect.width + 'px';
    addInvSuggestions.innerHTML = items.map(item =>
        `<div class="suggestion-item" data-id="${item.product_id}" data-name="${esc(item.product_name || item.product_number || '')}" data-collection="${esc(item.collection_code || '')}">${esc(item.product_name || item.product_number || '')} [${esc(item.collection_code || '')}]</div>`
    ).join('');
    addInvSuggestions.querySelectorAll('.suggestion-item').forEach(el => {
        el.addEventListener('click', () => {
            addInvProductInput.value = el.dataset.name || el.textContent;
            addInvProductInput.dataset.productId = el.dataset.id;
            closeAddInvSuggestions();
        });
    });
}

function closeAddInvSuggestions() {
    addInvSuggestions.style.display = 'none';
    addInvSuggestions.innerHTML = '';
}

// Purchase autocomplete for add inventory
const addInvPurchaseInput = document.getElementById('addInvPurchase');
const addInvPurchaseSuggestions = document.getElementById('addInvPurchaseSuggestions');

let addInvPurSearchTimeout;
addInvPurchaseInput.addEventListener('input', () => {
    clearTimeout(addInvPurSearchTimeout);
    addInvSelectedPurchaseId = null;
    const q = addInvPurchaseInput.value.trim().toLowerCase();
    if (q.length < 1) { closeAddInvPurchaseSuggestions(); return; }
    addInvPurSearchTimeout = setTimeout(() => searchAddInvPurchases(q), 200);
});

addInvPurchaseInput.addEventListener('blur', () => {
    setTimeout(closeAddInvPurchaseSuggestions, 200);
});

function searchAddInvPurchases(q) {
    const matching = addInvPurchasesCache.filter(p => {
        const date = (p.purchase_date || '').slice(0, 10);
        const entity = (p.entity && p.entity.name) || '';
        return date.includes(q) || entity.toLowerCase().includes(q);
    });
    if (matching.length === 0) { closeAddInvPurchaseSuggestions(); return; }
    showAddInvPurchaseSuggestions(matching);
}

function showAddInvPurchaseSuggestions(items) {
    closeAddInvPurchaseSuggestions();
    const rect = addInvPurchaseInput.getBoundingClientRect();
    addInvPurchaseSuggestions.style.display = 'block';
    addInvPurchaseSuggestions.style.top = (rect.bottom + window.scrollY) + 'px';
    addInvPurchaseSuggestions.style.left = (rect.left + window.scrollX) + 'px';
    addInvPurchaseSuggestions.style.width = rect.width + 'px';
    addInvPurchaseSuggestions.innerHTML = items.map(p =>
        `<div class="suggestion-item" data-id="${p.id}" data-date="${(p.purchase_date || '').slice(0,10)}" data-entity="${esc((p.entity && p.entity.name) || '')}">${esc((p.purchase_date || '').slice(0,10))} - ${esc((p.entity && p.entity.name) || '?')}</div>`
    ).join('');
    addInvPurchaseSuggestions.querySelectorAll('.suggestion-item').forEach(el => {
        el.addEventListener('click', () => {
            addInvPurchaseInput.value = el.dataset.date + ' - ' + el.dataset.entity;
            addInvSelectedPurchaseId = parseInt(el.dataset.id);
            closeAddInvPurchaseSuggestions();
        });
    });
}

function closeAddInvPurchaseSuggestions() {
    addInvPurchaseSuggestions.style.display = 'none';
    addInvPurchaseSuggestions.innerHTML = '';
}

document.getElementById('addInvForm').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const productId = addInvProductInput.dataset.productId;
    if (!productId) { alert('Selecciona un producto de la lista'); return; }

    const quantity = parseInt(document.getElementById('addInvQty').value, 10) || 1;
    const languageId = document.getElementById('addInvLang').value;
    const conditionId = document.getElementById('addInvCondition').value;
    const isSealed = document.getElementById('addInvSealed').checked;
    const postedInstagram = document.getElementById('addInvInstagram').checked;
    const purchaseId = addInvSelectedPurchaseId;
    const notes = document.getElementById('addInvNotes').value.trim();

    // We need collection_id for the inventory entry. Fetch the product to get it.
    let collectionId;
    try {
        const prodResp = await apiFetch(apiUrl(`products/${productId}`));
        if (prodResp.ok) {
            const prod = await prodResp.json();
            collectionId = prod.collection_id || (prod.collection && prod.collection.id);
        }
    } catch (e) { console.error(e); }

    if (!collectionId) { alert('No se pudo determinar la coleccion del producto'); return; }

    const btn = ev.target.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = 'Guardando...';

    try {
        const payload = {
            product_id: parseInt(productId),
            collection_id: collectionId,
            quantity: quantity,
            ...(languageId ? {language_id: parseInt(languageId)} : {}),
            ...(conditionId ? {condition_id: parseInt(conditionId)} : {}),
            ...(purchaseId ? {purchase_id: purchaseId} : {}),
            is_sealed: isSealed,
            posted_instagram: postedInstagram,
            ...(notes ? {notes: notes} : {})
        };
        const resp = await apiFetch(apiUrl('inventory'), {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload)
        });
        if (!resp.ok) {
            const t = await resp.text().catch(()=>null);
            alert('Error al crear inventario: ' + resp.status + ' ' + (t||''));
            return;
        }
        closeAddInvModal();
        loadInventory({reset: true});
    } catch (e) {
        console.error(e);
        alert('Error al guardar');
    } finally {
        btn.disabled = false; btn.textContent = 'Guardar';
    }
});

// ==================== PURCHASES ====================
const purBody = document.getElementById('purchasesBody');
const purEmpty = document.getElementById('purEmpty');
const purSummary = document.getElementById('purSummary');
const purSentinel = document.getElementById('purSentinel');
let allEntities = [];

function renderPurLoading() {
    purBody.innerHTML = `<tr><td colspan="6" class="loading-state">Cargando compras...</td></tr>`;
    purEmpty.hidden = true;
}
function renderPurRow(item) {
    const itemsCount = (item.items || []).length;
    const total = item.total_amount || '0.00';
    const ship = item.shipping_cost || '0.00';
    return `<tr class="clickable-row" data-pur-id="${item.id}">
        <td>${esc(item.purchase_date ? item.purchase_date.slice(0,10) : '-')}</td>
        <td>${esc(item.entity ? item.entity.name : '-')}</td>
        <td>${total}</td>
        <td>${ship}</td>
        <td>${esc(item.currency || 'EUR')}</td>
        <td>${itemsCount}</td>
    </tr>`;
}
function appendPur(items) {
    if (!items.length && state.purchases.loaded === 0) { purBody.innerHTML = ''; purEmpty.hidden = false; return; }
    purEmpty.hidden = true;
    purBody.insertAdjacentHTML('beforeend', items.map(renderPurRow).join(''));
}
function updatePurProgress() {
    const f = state.purchases.loaded ? 1 : 0;
    purSummary.textContent = `${f}-${state.purchases.loaded} de ${state.purchases.total} compras`;
}

async function loadPurchases({reset = false} = {}) {
    if (!appStarted) return;
    const s = state.purchases;
    if (s.loading || (!s.hasNext && !reset)) return;
    if (reset) { s.page = 1; s.pages = 0; s.total = 0; s.loaded = 0; s.hasNext = true; purBody.innerHTML = ''; purEmpty.hidden = true; renderPurLoading(); }
    s.loading = true;
    try {
        const resp = await apiFetch(apiUrl('purchases', {page: s.page, per_page: s.perPage, q: s.q}));
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        const data = await resp.json();
        if (reset) purBody.innerHTML = '';
        appendPur(data.items);
        s.pages = data.pagination.pages; s.total = data.pagination.total; s.hasNext = data.pagination.has_next;
        s.loaded += data.items.length; s.page += 1;
        updatePurProgress();
    } catch (e) {
        if (s.loaded === 0) { purBody.innerHTML = ''; purEmpty.hidden = false; }
        purSummary.textContent = 'Error al cargar';
    } finally {
        s.loading = false;
        setTimeout(checkPurScroll, 50);
    }
}
function checkPurScroll() {
    if (state.purchases.loading || !state.purchases.hasNext) return;
    const r = purSentinel.getBoundingClientRect();
    if (r.top <= window.innerHeight + 700) loadPurchases();
}
const purObs = new IntersectionObserver(entries => {
    if (!appStarted) return;
    if (entries.some(e => e.isIntersecting)) loadPurchases();
}, {rootMargin: '640px 0px'});
purObs.observe(purSentinel);

// --- Purchase modal ---
const purModal = document.getElementById('purchaseModal');
document.getElementById('purBackdrop').addEventListener('click', closePurModal);
document.getElementById('purCancel').addEventListener('click', closePurModal);
function closePurModal() { purModal.hidden = true; document.body.style.overflow = ''; }

document.getElementById('addPurchaseBtn').addEventListener('click', () => openPurchaseModal(null));

async function openPurchaseModal(purchaseId) {
    document.getElementById('modalPurchaseId').value = purchaseId || '';
    document.getElementById('purModalTitle').textContent = purchaseId ? 'Editar compra' : 'Nueva compra';
    document.getElementById('purDate').value = new Date().toISOString().slice(0,10);
    document.getElementById('purTotal').value = '';
    document.getElementById('purShipping').value = '';
    document.getElementById('purCurrency').value = 'EUR';
    document.getElementById('purRef').value = '';
    document.getElementById('purNotes').value = '';
    document.getElementById('purchaseItemsBody').innerHTML = '<tr class="empty-row"><td colspan="5" class="empty-state">Sin items</td></tr>';
    itemCounter = 0;

    // Load entities
    try {
        const resp = await apiFetch(apiUrl('entities', {per_page: 200}));
        if (resp.ok) {
            const data = await resp.json();
            allEntities = data.items || data || [];
            const sel = document.getElementById('purEntity');
            sel.innerHTML = '<option value="">Seleccionar...</option>';
            allEntities.forEach(e => {
                const opt = document.createElement('option');
                opt.value = e.id; opt.textContent = e.name;
                sel.appendChild(opt);
            });
        }
    } catch (e) { console.error('Error loading entities', e); }

    if (purchaseId) {
        try {
            const resp = await apiFetch(apiUrl(`purchases/${purchaseId}`));
            if (resp.ok) {
                const p = await resp.json();
                document.getElementById('purDate').value = p.purchase_date ? p.purchase_date.slice(0,10) : '';
                document.getElementById('purEntity').value = (p.entity && p.entity.id) || '';
                document.getElementById('purTotal').value = p.total_amount || '';
                document.getElementById('purShipping').value = p.shipping_cost || '';
                document.getElementById('purCurrency').value = p.currency || 'EUR';
                document.getElementById('purRef').value = p.external_reference || '';
                document.getElementById('purNotes').value = p.notes || '';
                // Load items
                try {
                    const iresp = await apiFetch(apiUrl('purchase-items', {per_page: 200, purchase_id: purchaseId}));
                    if (iresp.ok) {
                        const idata = await iresp.json();
                        const items = idata.items || [];
                        document.getElementById('purchaseItemsBody').innerHTML = '';
                        for (const it of items) await addItemRow(it);
                    }
                } catch (e) { console.error(e); }
            }
        } catch (e) { console.error('Error loading purchase', e); }
    }

    purModal.hidden = false;
    document.body.style.overflow = 'hidden';
}

// --- Purchase items ---
let itemCounter = 0;
let productCache = {};

document.getElementById('addItemBtn').addEventListener('click', () => { addItemRow(); });

async function addItemRow(data) {
    const tbody = document.getElementById('purchaseItemsBody');
    const emptyRow = tbody.querySelector('.empty-row');
    if (emptyRow) emptyRow.remove();
    const id = data ? (data.id || 'new_' + (++itemCounter)) : 'new_' + (++itemCounter);
    const qty = data ? (data.quantity || 1) : 1;
    const price = data ? (data.unit_price || '') : '';
    const tr = document.createElement('tr');
    tr.dataset.itemId = id;
    tr.innerHTML = `
        <td>
            <input class="item-product" type="text" placeholder="Buscar producto..." value="${esc(data && data.product ? (data.product.product_number || '') : '')}" data-item-id="${id}">
            <span class="product-name-view"></span>
        </td>
        <td><input class="item-qty" type="number" min="1" step="1" value="${qty}" data-item-id="${id}"></td>
        <td><input class="item-price" type="number" step="0.01" min="0" value="${price}" data-item-id="${id}"></td>
        <td><span class="item-total" data-item-id="${id}">${price ? (qty * parseFloat(price)).toFixed(2) : '0.00'}</span></td>
        <td><button type="button" class="btn-danger remove-item" data-item-id="${id}" title="Eliminar item">&times;</button></td>
    `;
    tbody.appendChild(tr);

    // Wire product search
    const prodInput = tr.querySelector('.item-product');
    if (!data || !data.product_id) {
        // Setup autocomplete-like search on typing
        let timeout;
        prodInput.addEventListener('input', () => {
            clearTimeout(timeout);
            timeout = setTimeout(() => searchProducts(prodInput), 300);
        });
    }

    // Wire qty/price changes
    tr.querySelector('.item-qty').addEventListener('input', recalcItemTotal);
    tr.querySelector('.item-price').addEventListener('input', recalcItemTotal);

    // Wire remove
    tr.querySelector('.remove-item').addEventListener('click', () => {
        tr.remove();
        const rows = tbody.querySelectorAll('tr');
        if (rows.length === 0) tbody.innerHTML = '<tr class="empty-row"><td colspan="5" class="empty-state">Sin items</td></tr>';
    });

    if (data && data.product) {
        prodInput.dataset.productId = data.product.id;
        prodInput.dataset.productName = data.product.product_number || '';
        // fetch and display product name
        const nameSpan = tr.querySelector('.product-name-view');
        if (nameSpan) {
            try {
                const trResp = await apiFetch(apiUrl('product-translations', {per_page: 1, product_id: data.product.id}));
                if (trResp.ok) {
                    const trData = await trResp.json();
                    const trans = (trData.items || [])[0];
                    if (trans && trans.name) nameSpan.textContent = trans.name;
                }
            } catch (e) { /* ignore */ }
        }
    }
}

function recalcItemTotal(ev) {
    const id = ev.target.dataset.itemId;
    const row = ev.target.closest('tr');
    const qty = parseInt(row.querySelector('.item-qty').value, 10) || 0;
    const price = parseFloat(row.querySelector('.item-price').value) || 0;
    row.querySelector('.item-total').textContent = (qty * price).toFixed(2);
}

let searchTimeout;
async function searchProducts(input) {
    const q = input.value.trim();
    if (!q || q.length < 2) return;
    try {
        const resp = await apiFetch(apiUrl('product-catalog', {q, per_page: 10}));
        if (!resp.ok) return;
        const data = await resp.json();
        const items = data.items || [];
        // Simple dropdown-like: show in console for now, or we can replace input
        // For simplicity, auto-select if unique match
        if (items.length === 1) {
            const item = items[0];
            input.value = `${item.collection_code || ''} ${item.product_number || ''}`;
            input.dataset.productId = item.product_id;
            input.dataset.productName = item.product_name || '';
            const nameSpan = input.closest('td').querySelector('.product-name-view');
            if (nameSpan) nameSpan.textContent = item.product_name || '';
        } else if (items.length > 0) {
            // Show a simple suggestions list
            showSuggestions(input, items);
        }
    } catch (e) { console.error(e); }
}

let currentSuggestions = null;
function showSuggestions(input, items) {
    closeSuggestions();
    const div = document.createElement('div');
    div.className = 'suggestions';
    div.style.position = 'absolute';
    const rect = input.getBoundingClientRect();
    div.style.top = (rect.bottom + window.scrollY) + 'px';
    div.style.left = (rect.left + window.scrollX) + 'px';
    div.style.width = rect.width + 'px';
    div.style.zIndex = '9999';
    items.forEach(item => {
        const opt = document.createElement('div');
        opt.className = 'suggestion-item';
        const name = item.product_name || item.product_number || '';
        const code = item.collection_code || '';
        opt.textContent = `${name} [${code}]`;
        opt.addEventListener('click', () => {
            input.value = `${item.collection_code || ''} ${item.product_number || ''}`;
            input.dataset.productId = item.product_id;
            input.dataset.productName = name;
            const nameSpan = input.closest('td').querySelector('.product-name-view');
            if (nameSpan) nameSpan.textContent = name;
            closeSuggestions();
        });
        div.appendChild(opt);
    });
    document.body.appendChild(div);
    currentSuggestions = div;
}
function closeSuggestions() {
    if (currentSuggestions) { currentSuggestions.remove(); currentSuggestions = null; }
}
document.addEventListener('click', (e) => {
    if (!e.target.closest('.suggestions')) closeSuggestions();
});

// Submit purchase
document.getElementById('purchaseForm').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const purchaseId = document.getElementById('modalPurchaseId').value;
    const date = document.getElementById('purDate').value;
    const entityId = document.getElementById('purEntity').value;
    const total = document.getElementById('purTotal').value;
    const shipping = document.getElementById('purShipping').value || '0';
    const currency = document.getElementById('purCurrency').value;
    const ref = document.getElementById('purRef').value.trim();
    const notes = document.getElementById('purNotes').value.trim();

    if (!date || !entityId) { alert('Fecha y tienda son obligatorios'); return; }

    // Collect items
    const itemRows = document.querySelectorAll('#purchaseItemsBody tr:not(.empty-row)');
    const items = [];
    itemRows.forEach(tr => {
        const prodInput = tr.querySelector('.item-product');
        const qty = parseInt(tr.querySelector('.item-qty').value, 10) || 0;
        const price = parseFloat(tr.querySelector('.item-price').value) || 0;
        const productId = prodInput.dataset.productId;
        if (productId && qty > 0) {
            items.push({product_id: parseInt(productId), quantity: qty, unit_price: price});
        }
    });

    const btn = ev.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = 'Guardando...';

    try {
        let purResp;
        const payload = {
            entity_id: parseInt(entityId),
            purchase_date: date,
            total_amount: total || null,
            shipping_cost: shipping,
            currency: currency,
            ...(ref ? {external_reference: ref} : {}),
            ...(notes ? {notes: notes} : {})
        };

        if (purchaseId) {
            purResp = await apiFetch(apiUrl(`purchases/${purchaseId}`), {
                method: 'PATCH', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(payload)
            });
        } else {
            purResp = await apiFetch(apiUrl('purchases'), {
                method: 'POST', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(payload)
            });
        }

        if (!purResp.ok) {
            const t = await purResp.text().catch(()=>null);
            alert('Error al guardar compra: ' + purResp.status + ' ' + (t||''));
            return;
        }

        const savedPurchase = await purResp.json();
        const savedId = savedPurchase.id;

        // Save items: delete existing and recreate
        if (purchaseId) {
            // Fetch existing items to delete them
            const oldResp = await apiFetch(apiUrl('purchase-items', {per_page: 200, purchase_id: purchaseId}));
            if (oldResp.ok) {
                const oldData = await oldResp.json();
                for (const oldItem of (oldData.items || [])) {
                    await apiFetch(apiUrl(`purchase-items/${oldItem.id}`), {method: 'DELETE'});
                }
            }
        }

        for (const item of items) {
            await apiFetch(apiUrl('purchase-items'), {
                method: 'POST', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    purchase_id: savedId,
                    product_id: item.product_id,
                    unit_price: item.unit_price,
                    quantity: item.quantity
                })
            });
        }

        closePurModal();
        loadPurchases({reset: true});
    } catch (e) {
        console.error(e);
        alert('Error al guardar');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Guardar compra';
    }
});

// --- Scroll handlers ---
let invScrollTimer, purScrollTimer;
window.addEventListener('scroll', () => {
    clearTimeout(invScrollTimer);
    invScrollTimer = setTimeout(() => { if (currentTab === 'inventory') checkInvScroll(); }, 80);
    clearTimeout(purScrollTimer);
    purScrollTimer = setTimeout(() => { if (currentTab === 'purchases') checkPurScroll(); }, 80);
}, {passive: true});

// --- Login modal wiring ---
(function() {
    const lm = document.getElementById('loginModal');
    if (!lm) return;
    const lf = lm.querySelector('#loginForm');
    const lc = lm.querySelector('#loginCancel');
    const lb = lm.querySelector('#loginBackdrop');
    if (lf) lf.addEventListener('submit', loginSubmit);
    if (lc) lc.addEventListener('click', hideLoginModal);
    if (lb) lb.addEventListener('click', hideLoginModal);
})();

document.getElementById('showAllInv').addEventListener('change', () => {
    loadInventory({reset: true});
});

updateAuthUI();
