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
let currentUserRoles = [];
let currentTab = 'inventory';

// ==================== AUTH & API ====================

async function apiFetch(url, options = {}) {
    options = options || {};
    options.headers = options.headers || {};
    const token = window.localStorage.getItem(TOKEN_KEY);
    if (token) {
        options.headers['Authorization'] = `Bearer ${token}`;
    }
    if (!options.headers['Accept']) {
        options.headers['Accept'] = 'application/json';
    }
    try {
        const resp = await fetch(url, options);
        if (resp.status === 401) handleUnauthorized();
        return resp;
    } catch (err) {
        throw err;
    }
}

function handleUnauthorized() {
    window.localStorage.removeItem(TOKEN_KEY);
    updateAuthUI();
}

async function loadCurrentUser() {
    const el = document.getElementById('authPanel');
    if (!el) return;
    const token = window.localStorage.getItem(TOKEN_KEY);
    if (!token) {
        el.innerHTML = '';
        const b = document.createElement('button');
        b.id = 'loginToggle'; b.type = 'button'; b.textContent = 'Iniciar sesi\u00f3n';
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
            b.id = 'loginToggle'; b.type = 'button'; b.textContent = 'Iniciar sesi\u00f3n';
            b.addEventListener('click', showLoginModal);
            el.appendChild(b);
            return;
        }
        const user = await resp.json();
        currentUserRoles = user.roles || [];
        el.innerHTML = `<span id="userDisplay">${esc(user.display_name || user.username)}</span> <button id="logoutButton">Cerrar sesi\u00f3n</button>`;
        document.getElementById('logoutButton').addEventListener('click', logout);
        appStarted = true;
        applyRoleUI();
        const validRoles = ['product_read', 'product_write', 'inventory_manage', 'admin'];
        const hasAny = validRoles.some(r => currentUserRoles.includes(r));
        if (hasAny) loadTab(currentTab);
    } catch (err) {
        console.error(err);
        currentUserRoles = [];
        el.innerHTML = '';
        const b = document.createElement('button');
        b.id = 'loginToggle'; b.type = 'button'; b.textContent = 'Iniciar sesi\u00f3n';
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

    const tabs = document.getElementById('mainTabs');
    const tabContents = document.querySelectorAll('.tab-content');
    const noPermMsg = document.getElementById('noPermission');

    if (!hasAny && appStarted) {
        if (tabs) tabs.style.display = 'none';
        tabContents.forEach(t => t.style.display = 'none');
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

    if (tabs) tabs.style.display = '';
    if (noPermMsg) noPermMsg.remove();

    const addBtn = document.getElementById('addProductBtn');
    if (addBtn) addBtn.style.display = hasRole('product_write') ? '' : 'none';
    if (document.getElementById('createProductModal') && !hasRole('product_write'))
        document.getElementById('createProductModal').hidden = true;

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
    if (!username || !password) { alert('Usuario y contrase\u00f1a requeridos'); return; }
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

function esc(v) {
    return String(v ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

function apiUrl(path, params = null) {
    let p = path.replace(/^\//, '');
    if (!p.includes('/')) p += '/';
    const url = new URL(`${configuredApiBase}/${p}`);
    if (params) Object.entries(params).forEach(([k, v]) => { if (v != null && v !== '') url.searchParams.set(k, v); });
    return url.toString();
}

function assetUrl(path) {
    return new URL(path, apiOrigin).toString();
}

// ==================== TAB SYSTEM ====================

(function initTabs() {
    const tabs = document.querySelectorAll('#mainTabs .tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            currentTab = tab.dataset.tab;
            const contentId = 'tab' + currentTab.charAt(0).toUpperCase() + currentTab.slice(1);
            const content = document.getElementById(contentId);
            if (content) content.classList.add('active');
            if (appStarted) loadTab(currentTab);
        });
    });
})();

function loadTab(tab) {
    if (tab === 'products') loadProducts({reset: true});
    else if (tab === 'inventory') loadInventory({reset: true});
    else loadPurchases({reset: true});
}

// ==================== PRODUCT CATALOG ====================

const prodState = {
    page: 1, perPage: 10, q: "", is_verified: null, is_manual: null,
    pages: 0, total: 0, loaded: 0, loading: false, hasNext: true
};

const productGrid = document.querySelector("#productGrid");
const emptyState = document.querySelector("#emptyState");
const prodSummary = document.querySelector("#resultSummary");
const layoutSummary = document.querySelector("#layoutSummary");
const scrollStatus = document.querySelector("#scrollStatus");
const searchForm = document.querySelector("#searchForm");
const searchInput = document.querySelector("#searchInput");
const loadSentinel = document.querySelector("#loadSentinel");
let resizeTimer = null;

function manualIcon(isManual) {
    if (!isManual) return "";
    return `<span class="manual-badge" title="Manual" aria-label="Manual"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v10"></path><path d="M8 7v8"></path><path d="M16 7v6"></path><path d="M5 12v3a7 7 0 0 0 14 0v-4"></path></svg></span>`;
}

function verifiedIcon(isVerified) {
    if (!isVerified) return "";
    return `<span class="verified-badge" title="Verificado" aria-label="Verificado"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg></span>`;
}

function imageCell(item) {
    const placeholder = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";
    if (!item.image_url) {
        return `<div class="thumb"><svg class="thumb-placeholder" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"></rect><path d="m8 14 2.5-2.5L14 15l2-2 3 3"></path><circle cx="8.5" cy="8.5" r="1.5"></circle></svg><img class="product-thumb-img" src="${placeholder}" data-product-id="${item.product_id}" data-product-name="${esc(item.product_name || "")}" alt="" style="display:none"></div>`;
    }
    return `<div class="thumb"><img class="product-thumb-img" src="${placeholder}" data-src="${esc(assetUrl(item.image_url))}" data-product-id="${item.product_id}" data-product-name="${esc(item.product_name || "Producto")}" alt="${esc(item.product_name || "Producto")}" loading="lazy"></div>`;
}

function itemCard(item) {
    return `<article class="product-card"><div class="thumb-wrap">${imageCell(item)}${verifiedIcon(item.is_verified)}</div><div class="card-body"><div class="collection-line"><span class="code">${esc(item.collection_code)}</span>${manualIcon(item.is_manual)}<span class="collection-name" title="${esc(item.collection_name || "-")}">${esc(item.collection_name || "-")}</span></div><div class="product-line"><span class="number">${esc(item.product_number || "-")}</span><span class="product-name" title="${esc(item.product_name || "-")}" data-product-id="${item.product_id}">${esc(item.product_name || "-")}</span>${item.tracker_url ? `<button class="tracker-button" data-tracker-url="${esc(item.tracker_url)}" title="Abrir precio" aria-label="Abrir precio"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12h12"></path><path d="M15 6l6 6-6 6"></path></svg></button>` : ''}</div></div></article>`;
}

function appendItems(items) {
    if (!items.length && prodState.loaded === 0) {
        productGrid.innerHTML = "";
        emptyState.hidden = false;
        return;
    }
    emptyState.hidden = true;
    productGrid.insertAdjacentHTML("beforeend", items.map(itemCard).join(""));
    loadImages(productGrid);
}

function renderProgress() {
    const first = prodState.loaded ? 1 : 0;
    prodSummary.textContent = `${first}-${prodState.loaded} de ${prodState.total} productos`;
    scrollStatus.textContent = prodState.hasNext ? "Scroll para cargar m\u00e1s" : "No hay m\u00e1s productos";
}

function calculateColumns() {
    const width = window.innerWidth;
    if (width >= 1320) return 5;
    if (width >= 1080) return 4;
    if (width >= 820) return 3;
    if (width >= 520) return 2;
    return 1;
}

function updatePageSizeFromViewport() {
    const columns = calculateColumns();
    const rowsPerLoad = 2;
    prodState.perPage = columns * rowsPerLoad;
    layoutSummary.textContent = `${columns} columna${columns === 1 ? "" : "s"} \u00b7 carga ${prodState.perPage}`;
}

function resetCatalog() {
    prodState.page = 1; prodState.pages = 0; prodState.total = 0;
    prodState.loaded = 0; prodState.hasNext = true;
    productGrid.innerHTML = ""; emptyState.hidden = true;
}

function shouldLoadMore() {
    if (prodState.loading || !prodState.hasNext) return false;
    const r = loadSentinel.getBoundingClientRect();
    return r.top <= window.innerHeight + 700;
}

function requestNextPage() { if (shouldLoadMore()) loadProducts(); }

async function loadProducts({reset = false} = {}) {
    if (!appStarted) return;
    if (prodState.loading || (!prodState.hasNext && !reset)) return;
    let _savedScroll = null;
    if (reset) {
        _savedScroll = {x: window.scrollX, y: window.scrollY};
        resetCatalog();
        productGrid.innerHTML = `<div class="loading-state">Cargando productos...</div>`;
    }
    prodState.loading = true;
    scrollStatus.textContent = "Cargando...";
    try {
        const resp = await apiFetch(apiUrl("product-catalog", {
            page: prodState.page, per_page: prodState.perPage,
            q: prodState.q, is_verified: prodState.is_verified, is_manual: prodState.is_manual
        }));
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();
        if (reset) productGrid.innerHTML = "";
        appendItems(data.items);
        prodState.pages = data.pagination.pages;
        prodState.total = data.pagination.total;
        prodState.hasNext = data.pagination.has_next;
        prodState.loaded += data.items.length;
        prodState.page += 1;
        renderProgress();
        if (_savedScroll) { try { window.scrollTo(_savedScroll.x, _savedScroll.y); } catch (e) {} }
        setTimeout(requestNextPage, 50);
    } catch (error) {
        if (prodState.loaded === 0) { productGrid.innerHTML = ""; emptyState.hidden = false; }
        prodSummary.textContent = "No se pudo cargar el cat\u00e1logo";
        scrollStatus.textContent = "Error al cargar";
        prodState.hasNext = false;
    } finally {
        prodState.loading = false;
        attachCardListeners();
    }
}

function attachCardListeners() {
    document.querySelectorAll('.tracker-button').forEach(btn => {
        if (btn.dataset.bound) return;
        btn.dataset.bound = '1';
        btn.addEventListener('click', (ev) => {
            ev.preventDefault(); ev.stopPropagation();
            const url = btn.getAttribute('data-tracker-url');
            if (url) window.open(url, '_blank', 'noopener');
        });
    });
    document.querySelectorAll('.product-thumb-img').forEach(img => img.style.cursor = 'pointer');
}

// Image loading
async function fetchAndSetImage(imgEl) {
    const url = imgEl.getAttribute('data-src');
    if (!url) return;
    try {
        const resp = await apiFetch(url, {
            method: 'GET', headers: {'Accept': 'image/*'}, cache: 'no-store'
        });
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        const blob = await resp.blob();
        const objectUrl = URL.createObjectURL(blob);
        imgEl.src = objectUrl;
    } catch (err) { console.error('Error loading image', url, err); }
}

function loadImages(root = document) {
    root.querySelectorAll('img[data-src]:not([data-loaded])').forEach(img => {
        img.setAttribute('data-loaded', '1');
        fetchAndSetImage(img);
    });
}

async function updateProductImage(productId, newImageUrl) {
    if (!productId || !newImageUrl) return false;
    const img = productGrid.querySelector(`img[data-product-id="${productId}"]`);
    if (!img) { console.warn('updateProductImage: not found', productId); return false; }
    const cacheBustedUrl = newImageUrl + (newImageUrl.includes('?') ? '&' : '?') + 'v=' + Date.now();
    img.setAttribute('data-src', cacheBustedUrl);
    if (img.src && img.src.startsWith('blob:')) URL.revokeObjectURL(img.src);
    img.removeAttribute('data-loaded');
    img.setAttribute('data-loaded', '1');
    try {
        await fetchAndSetImage(img);
        if (img.style.display === 'none') {
            img.style.display = '';
            img.alt = img.getAttribute('data-product-name') || 'Producto';
            const svg = img.closest('.thumb') && img.closest('.thumb').querySelector('svg.thumb-placeholder');
            if (svg) svg.style.display = 'none';
        }
    } catch (err) { console.error('updateProductImage: failed', productId, err); throw err; }
    return true;
}

async function replaceProductCard(productId) {
    if (!productId) throw new Error('missing productId');
    const resp = await apiFetch(apiUrl(`products/${productId}`));
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const item = await resp.json();
    const newHtml = itemCard(item).trim();
    const wrapper = document.createElement('div');
    wrapper.innerHTML = newHtml;
    const newNode = wrapper.firstElementChild;
    if (!newNode) throw new Error('rendered node missing');
    const existing = productGrid.querySelector(`[data-product-id="${productId}"]`);
    let card = existing ? existing.closest('.product-card') : null;
    if (!card) { productGrid.insertAdjacentElement('beforeend', newNode); loadImages(newNode); attachCardListeners(); return true; }
    card.replaceWith(newNode);
    loadImages(newNode);
    attachCardListeners();
    return true;
}

// Product modal
const productModal = document.getElementById("productModal");
const modalBackdrop = document.getElementById("modalBackdrop");
const modalTitle = document.getElementById("modalTitle");
const modalProductId = document.getElementById("modalProductId");
const imageUrlInput = document.getElementById("imageUrl");
const priceUrlInput = document.getElementById("priceUrl");
const productForm = document.getElementById("productForm");
const modalCancel = document.getElementById("modalCancel");
const modalSaveButton = productForm ? productForm.querySelector('button[type="submit"]') : null;
const modalDetail = document.getElementById("modalDetail");

function openModal(productId, productName) {
    modalProductId.value = productId;
    modalTitle.textContent = `Producto: ${productName}`;
    imageUrlInput.value = "";
    priceUrlInput.value = "";
    loadProductDetails(productId);
    productModal.hidden = false;
    document.body.style.overflow = "hidden";
    setTimeout(() => imageUrlInput.focus(), 50);
}

function closeModal() {
    productModal.hidden = true;
    document.body.style.overflow = "";
}

if (modalBackdrop) modalBackdrop.addEventListener("click", closeModal);
if (modalCancel) modalCancel.addEventListener("click", closeModal);

async function handleProductFormSubmit(ev) {
    if (ev && typeof ev.preventDefault === 'function') ev.preventDefault();
    if (!hasRole('product_write')) { alert('No tienes permisos para editar productos'); return; }
    const productId = Number(modalProductId.value);
    const imageUrl = imageUrlInput.value.trim();
    const priceUrl = priceUrlInput.value.trim();
    const isVerified = document.getElementById('isVerified').checked;
    modalSaveButton.disabled = true;
    modalSaveButton.textContent = "Guardando...";
    try {
        const patchResp = await apiFetch(apiUrl(`products/${productId}`), {
            method: 'PATCH', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({is_verified: isVerified})
        });
        if (!patchResp.ok) console.error('Error updating is_verified', patchResp.status);
    } catch (err) { console.error('Error updating is_verified', err); }
    let success = true;
    try {
        if (imageUrl) {
            try {
                const payload = { product_id: productId, file_url: imageUrl };
                const imgLangEl = document.getElementById('imageLanguage');
                if (imgLangEl && imgLangEl.value) payload.language_id = imgLangEl.value;
                const resp = await apiFetch(apiUrl('files/download-manual'), {
                    method: 'POST', headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify(payload)
                });
                if (!resp.ok) { success = false; const t = await resp.text().catch(() => null); console.error('Error download-manual', resp.status, t); }
                else {
                    const body = await resp.json().catch(() => null);
                    const fileId = body && body.id;
                    if (fileId) {
                        try { await updateProductImage(productId, apiUrl(`product-catalog/files/${fileId}/content`)); }
                        catch (err) { console.error('Could not update product image', err); }
                    }
                }
            } catch (err) { success = false; console.error('Invalid image URL', err); }
        }
        if (priceUrl) {
            try {
                const urlObj = new URL(priceUrl);
                const hostBase = `${urlObj.protocol}//${urlObj.host}`;
                const resp = await apiFetch(apiUrl("price-sources", {per_page: 200}));
                if (!resp.ok) { success = false; return; }
                const data = await resp.json();
                let ps = (data.items || []).find(p => p.base_url && (hostBase === p.base_url || urlObj.href.startsWith(p.base_url)));
                if (!ps) {
                    const createResp = await apiFetch(apiUrl("price-sources"), {
                        method: "POST", headers: {"Content-Type": "application/json"},
                        body: JSON.stringify({name: urlObj.hostname, base_url: hostBase})
                    });
                    if (!createResp.ok) { success = false; return; }
                    ps = await createResp.json();
                }
                if (ps && ps.id) {
                    const trackResp = await apiFetch(apiUrl("product-price-tracking"), {
                        method: "POST", headers: {"Content-Type": "application/json"},
                        body: JSON.stringify({product_id: productId, price_source_id: ps.id, url: priceUrl})
                    });
                    if (!trackResp.ok) { success = false; return; }
                }
            } catch (err) { success = false; console.error("Invalid price URL", err); }
        }
    } catch (err) { success = false; console.error(err); }
    finally {
        modalSaveButton.disabled = false;
        modalSaveButton.textContent = "Guardar";
        if (success) closeModal();
    }
}

if (productForm) {
    productForm.addEventListener('submit', (ev) => {
        ev.preventDefault();
        if (!hasRole('product_write')) { alert('No tienes permisos para editar productos'); return; }
        handleProductFormSubmit(ev);
    });
}

async function loadProductDetails(productId) {
    modalDetail.innerHTML = '<div class="loading-state">Cargando detalles...</div>';
    try {
        const productIdNum = Number(productId);
        const prodResp = await apiFetch(apiUrl(`products/${productId}`));
        const prod = prodResp.ok ? await prodResp.json() : null;
        const [transResp, filesResp, trackersResp, languagesResp] = await Promise.all([
            apiFetch(apiUrl('product-translations', {page: 1, per_page: 200, product_id: productIdNum})),
            apiFetch(apiUrl('files', {page: 1, per_page: 200, product_id: productIdNum})),
            apiFetch(apiUrl('product-price-tracking', {page: 1, per_page: 200, product_id: productIdNum})),
            apiFetch(apiUrl('languages', {page: 1, per_page: 200}))
        ]);
        const translations = transResp.ok ? (await transResp.json()).items || [] : [];
        const files = filesResp.ok ? (await filesResp.json()).items || [] : [];
        const trackers = trackersResp.ok ? (await trackersResp.json()).items || [] : [];
        const languages = languagesResp.ok ? (await languagesResp.json()).items || [] : [];
        let html = '';
        if (prod) {
            const firstTrans = translations.length ? translations[0].name : '';
            const prodName = firstTrans || '';
            const colCode = (prod.collection && prod.collection.code) || '';
            const colName = (prod.collection && (prod.collection.name || prod.collection.code)) || '';
            const searchParts = [prodName, prod.product_number, colCode].filter(Boolean).join(' ');
            const searchQ = searchParts ? encodeURIComponent(searchParts) : '';
            html += `<div class="detail-grid"><div><strong>Producto:</strong> ${esc(prodName || prod.product_number || '-')}</div><div><strong>N\u00famero:</strong> ${esc(prod.product_number || '-')}</div><div><strong>Colecci\u00f3n:</strong> ${esc(colName)} (${esc(colCode)})</div><div><strong>Force download:</strong> ${prod.force_download ? 'S\u00ed' : 'No'}</div><div><strong>Verificado:</strong> ${prod.is_verified ? 'S\u00ed' : 'No'}</div></div>`;
            html += searchQ ? `<div class="detail-actions"><a class="google-search-btn" href="https://www.google.com/search?q=${searchQ}" target="_blank" rel="noopener" title="Buscar en Google">Buscar en Google</a></div>` : '';
            const vCheck = document.getElementById('isVerified');
            if (vCheck) vCheck.checked = !!prod.is_verified;
        }
        html += `<h3>Traducciones (${translations.length})</h3><div class="trans-list" id="transList">`;
        if (translations.length === 0) html += '<div class="empty-state">Sin traducciones</div>';
        else {
            for (const t of translations) {
                const langName = t.language && t.language.name ? t.language.name : `ID ${t.language_id}`;
                html += `<div class="trans-row" data-trans-id="${t.id}"><span class="trans-lang">${esc(langName)}</span><span class="trans-name">${esc(t.name)}</span><button type="button" class="btn-delete-trans" data-trans-id="${t.id}" title="Eliminar traduccion"><svg viewBox="0 0 24 24" aria-hidden="true" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg></button></div>`;
            }
        }
        html += '</div>';
        html += `<div class="trans-add"><select id="newTransLang"><option value="">Idioma...</option>${languages.map(l => `<option value="${l.id}">${esc(l.name)}</option>`).join('')}</select><input id="newTransName" type="text" placeholder="Nombre"><button type="button" id="addTransBtn" class="btn-secondary">+</button></div>`;
        html += `<h3>Ficheros (${files.length})</h3>`;
        if (files.length === 0) html += '<div class="empty-state">Sin ficheros</div>';
        html += '<ul class="files-list">';
        for (const f of files) {
            const lang = f.language ? `(${esc(f.language.name)})` : '';
            html += `<li class="detail-row"><a href="${esc(apiUrl(`product-catalog/files/${f.id}/content`))}" target="_blank">${esc(f.original_name || f.stored_name)}</a><span class="detail-meta">${lang}</span><button type="button" class="btn-delete-file" data-file-id="${f.id}" title="Eliminar fichero"><svg viewBox="0 0 24 24" aria-hidden="true" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg></button></li>`;
        }
        html += '</ul>';
        html += `<h3>Price Trackers (${trackers.length})</h3>`;
        if (trackers.length === 0) html += '<div class="empty-state">Sin trackers de precio</div>';
        html += '<ul class="files-list">';
        for (const t of trackers) {
            const source = t.price_source && t.price_source.name ? esc(t.price_source.name) : '';
            html += `<li class="detail-row"><a href="${esc(t.url)}" target="_blank">${esc(t.url)}</a><span class="detail-meta">${source ? `(${source})` : ''}</span><button type="button" class="btn-delete-tracker" data-tracker-id="${t.id}" title="Eliminar tracker"><svg viewBox="0 0 24 24" aria-hidden="true" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg></button></li>`;
        }
        html += '</ul>';
        modalDetail.innerHTML = html;
        modalDetail.querySelectorAll('.btn-delete-file').forEach(btn => {
            btn.addEventListener('click', async () => {
                const fileId = btn.dataset.fileId;
                if (!confirm('\u00bfEliminar este fichero?')) return;
                btn.disabled = true;
                const resp = await apiFetch(apiUrl(`files/${fileId}`), {method: 'DELETE'});
                if (resp && resp.ok) {
                    btn.closest('li').remove();
                    const pid = Number(modalProductId.value);
                    const img = productGrid.querySelector(`img[data-product-id="${pid}"]`);
                    if (img) {
                        const remaining = modalDetail.querySelectorAll('.btn-delete-file');
                        if (remaining.length === 0) {
                            if (img.src && img.src.startsWith('blob:')) URL.revokeObjectURL(img.src);
                            img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';
                            img.style.display = 'none';
                            const svg = img.closest('.thumb') && img.closest('.thumb').querySelector('svg.thumb-placeholder');
                            if (svg) svg.style.display = '';
                        }
                    }
                } else { btn.disabled = false; alert('Error al eliminar el fichero'); }
            });
        });
        modalDetail.querySelectorAll('.btn-delete-tracker').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (!confirm('\u00bfEliminar este tracker de precio?')) return;
                btn.disabled = true;
                const resp = await apiFetch(apiUrl(`product-price-tracking/${btn.dataset.trackerId}`), {method: 'DELETE'});
                if (resp && resp.ok) btn.closest('li').remove();
                else { btn.disabled = false; alert('Error al eliminar el tracker'); }
            });
        });
        const addTransBtn = document.getElementById('addTransBtn');
        if (addTransBtn) {
            addTransBtn.addEventListener('click', async () => {
                const langId = document.getElementById('newTransLang').value;
                const name = document.getElementById('newTransName').value.trim();
                if (!langId || !name) { alert('Selecciona idioma y escribe un nombre'); return; }
                const resp = await apiFetch(apiUrl('product-translations'), {
                    method: 'POST', headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({product_id: Number(modalProductId.value), language_id: parseInt(langId), name})
                });
                if (resp && resp.ok) loadProductDetails(modalProductId.value);
                else alert('Error al a\u00f1adir traducci\u00f3n');
            });
        }
        modalDetail.querySelectorAll('.btn-delete-trans').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (!confirm('\u00bfEliminar esta traducci\u00f3n?')) return;
                const resp = await apiFetch(apiUrl(`product-translations/${btn.dataset.transId}`), {method: 'DELETE'});
                if (resp && resp.ok) btn.closest('.trans-row').remove();
                else alert('Error al eliminar traducci\u00f3n');
            });
        });
        const langSelect = document.getElementById('imageLanguage');
        if (langSelect) {
            langSelect.innerHTML = '<option value="">(sin idioma)</option>';
            languages.forEach(l => { const opt = document.createElement('option'); opt.value = l.id; opt.textContent = l.name; langSelect.appendChild(opt); });
        }
    } catch (err) { modalDetail.innerHTML = '<div class="empty-state">Error cargando detalles</div>'; }
}

// Delegated clicks for product name / image
document.addEventListener("click", (ev) => {
    const nameEl = ev.target.closest('.product-name');
    const imgEl = ev.target.closest('.product-thumb-img');
    if (nameEl) {
        ev.preventDefault(); ev.stopPropagation();
        const pid = nameEl.getAttribute('data-product-id');
        const name = nameEl.textContent.trim();
        if (pid) openModal(pid, name);
        return;
    }
    if (imgEl) {
        ev.preventDefault(); ev.stopPropagation();
        const pid = imgEl.getAttribute('data-product-id');
        const name = imgEl.getAttribute('data-product-name') || '';
        if (pid) openModal(pid, name);
        return;
    }
}, {capture: true});

document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && !productModal.hidden) closeModal();
    if (ev.key === "Escape" && !createModal.hidden) closeCreateModal();
});

// Create product
const createModal = document.getElementById('createProductModal');
const createBackdrop = document.getElementById('createBackdrop');
const createForm = document.getElementById('createProductForm');
const createCancel = document.getElementById('createCancel');
const newColCode = document.getElementById('newColCode');
const newColName = document.getElementById('newColName');
const newColLang = document.getElementById('newColLang');
const newCardType = document.getElementById('newCardType');
const newProductNumber = document.getElementById('newProductNumber');
const newForceDownload = document.getElementById('newForceDownload');
const colSuggestions = document.getElementById('colSuggestions');

const addProductBtn = document.getElementById('addProductBtn');
if (addProductBtn) {
    addProductBtn.addEventListener('click', () => {
        if (!hasRole('product_write')) return;
        openCreateModal();
    });
}

if (createBackdrop) createBackdrop.addEventListener('click', closeCreateModal);
if (createCancel) createCancel.addEventListener('click', closeCreateModal);

function closeCreateModal() {
    createModal.hidden = true;
    document.body.style.overflow = '';
}

async function openCreateModal() {
    newColCode.value = ''; delete newColCode.dataset.collectionId;
    newColName.value = ''; newProductNumber.value = ''; newForceDownload.checked = false;
    closeColSuggestions();
    createModal.hidden = false;
    document.body.style.overflow = 'hidden';
    try {
        const [typesResp, langsResp] = await Promise.all([
            apiFetch(apiUrl('types', {per_page: 200})),
            apiFetch(apiUrl('languages', {per_page: 200}))
        ]);
        if (typesResp.ok) {
            const data = await typesResp.json(); const types = data.items || [];
            const cardTypes = types.filter(t => t.type === 'card');
            newCardType.innerHTML = '<option value="">Seleccionar...</option>';
            cardTypes.forEach(t => {
                const opt = document.createElement('option');
                opt.value = t.id; opt.textContent = t.name + (t.short_name ? ` (${t.short_name})` : '');
                newCardType.appendChild(opt);
            });
        }
        if (langsResp.ok) {
            const data = await langsResp.json(); const langs = data.items || [];
            newColLang.innerHTML = '<option value="">Seleccionar...</option>';
            langs.forEach(l => {
                const opt = document.createElement('option');
                opt.value = l.id; opt.textContent = l.name;
                newColLang.appendChild(opt);
            });
        }
    } catch (e) { console.error('Error loading data', e); }
    setTimeout(() => newColCode.focus(), 50);
}

let colSearchTimeout;
if (newColCode) {
    newColCode.addEventListener('input', () => {
        clearTimeout(colSearchTimeout);
        delete newColCode.dataset.collectionId;
        const q = newColCode.value.trim();
        if (q.length < 2) { closeColSuggestions(); return; }
        colSearchTimeout = setTimeout(() => searchCollections(q), 300);
    });
    newColCode.addEventListener('blur', () => setTimeout(closeColSuggestions, 200));
}

async function searchCollections(q) {
    try {
        const resp = await apiFetch(apiUrl('collections', {q, per_page: 10}));
        if (!resp.ok) return;
        const data = await resp.json();
        const items = data.items || [];
        if (items.length === 0) { closeColSuggestions(); return; }
        showColSuggestions(items);
    } catch (e) { console.error(e); }
}

function showColSuggestions(items) {
    closeColSuggestions();
    const rect = newColCode.getBoundingClientRect();
    colSuggestions.style.display = 'block';
    colSuggestions.style.top = (rect.bottom + window.scrollY) + 'px';
    colSuggestions.style.left = (rect.left + window.scrollX) + 'px';
    colSuggestions.style.width = rect.width + 'px';
    colSuggestions.innerHTML = items.map(item =>
        `<div class="suggestion-item" data-code="${esc(item.code)}" data-id="${item.id}">${esc(item.code)}${item.card_type ? ' (' + esc(item.card_type.name) + ')' : ''}</div>`
    ).join('');
    colSuggestions.querySelectorAll('.suggestion-item').forEach(el => {
        el.addEventListener('click', () => {
            newColCode.value = el.dataset.code;
            newColCode.dataset.collectionId = el.dataset.id;
            closeColSuggestions();
        });
    });
}

function closeColSuggestions() {
    if (colSuggestions) { colSuggestions.style.display = 'none'; colSuggestions.innerHTML = ''; }
}

if (createForm) {
    createForm.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const code = newColCode.value.trim();
        const productNumber = newProductNumber.value.trim();
        const forceDownload = newForceDownload.checked;
        if (!code) { alert('El c\u00f3digo de colecci\u00f3n es obligatorio'); return; }
        const btn = createForm.querySelector('button[type="submit"]');
        btn.disabled = true; btn.textContent = 'Creando...';
        try {
            let collectionId = newColCode.dataset.collectionId;
            let cardTypeId;
            if (!collectionId) {
                try {
                    const searchResp = await apiFetch(apiUrl('collections', {q: code, per_page: 5}));
                    if (searchResp.ok) {
                        const searchData = await searchResp.json();
                        const existing = (searchData.items || []).find(c => c.code === code);
                        if (existing) { collectionId = existing.id; cardTypeId = existing.card_type ? existing.card_type.id : existing.card_type_id; }
                    }
                } catch (e) { console.error(e); }
            }
            if (!collectionId) {
                cardTypeId = newCardType.value;
                if (!cardTypeId) { alert('Selecciona un tipo de carta'); btn.disabled = false; btn.textContent = 'Crear producto'; return; }
                const colResp = await apiFetch(apiUrl('collections'), {
                    method: 'POST', headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({code: code, card_type_id: parseInt(cardTypeId), is_manual: true})
                });
                if (!colResp.ok) { const t = await colResp.text().catch(()=>null); alert('Error al crear colecci\u00f3n: ' + colResp.status + ' ' + (t||'')); return; }
                const newCol = await colResp.json();
                collectionId = newCol.id;
                const colName = newColName.value.trim();
                const colLangId = newColLang.value;
                if (colName && colLangId) {
                    await apiFetch(apiUrl('collection-translations'), {
                        method: 'POST', headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({collection_id: collectionId, language_id: parseInt(colLangId), name: colName})
                    });
                }
            } else {
                collectionId = parseInt(collectionId);
                try {
                    const colResp = await apiFetch(apiUrl(`collections/${collectionId}`));
                    if (colResp.ok) { const colData = await colResp.json(); cardTypeId = colData.card_type ? colData.card_type.id : (colData.card_type_id || null); }
                } catch (e) { console.error(e); }
            }
            if (!cardTypeId) { alert('No se pudo determinar el tipo de carta'); return; }
            const prodResp = await apiFetch(apiUrl('products'), {
                method: 'POST', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({collection_id: collectionId, product_type_id: parseInt(cardTypeId), ...(productNumber ? {product_number: productNumber} : {}), force_download: forceDownload})
            });
            if (!prodResp.ok) { const t = await prodResp.text().catch(()=>null); alert('Error al crear producto: ' + prodResp.status + ' ' + (t||'')); return; }
            closeCreateModal();
            loadProducts({reset: true});
        } catch (e) { console.error(e); alert('Error al crear producto'); }
        finally { btn.disabled = false; btn.textContent = 'Crear producto'; }
    });
}

// ==================== INVENTORY ====================

const invState = {
    page: 1, perPage: 50, q: '', pages: 0, total: 0, loaded: 0, loading: false, hasNext: true
};

const purState = {
    page: 1, perPage: 50, q: '', pages: 0, total: 0, loaded: 0, loading: false, hasNext: true
};

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
    const sealedIcon = item.is_sealed ? '\u2713' : '';
    const igIcon = item.posted_instagram ? '\u2713' : '';
    return `<tr class="clickable-row" data-inv-id="${item.id}"><td><strong>${esc(prod.product_number || '-')}</strong>${nameHtml}</td><td>${esc(col.code || col.name || '-')}</td><td>${esc(lang.name || '')}</td><td>${esc(cond.name || '')}</td><td class="${cls}">${stock}</td><td>${sealedIcon}</td><td>${igIcon}</td></tr>`;
}

function appendInv(items) {
    if (!items.length && invState.loaded === 0) { invBody.innerHTML = ''; invEmpty.hidden = false; return; }
    invEmpty.hidden = true;
    invBody.insertAdjacentHTML('beforeend', items.map(renderInvRow).join(''));
}

function updateInvProgress() {
    const f = invState.loaded ? 1 : 0;
    invSummary.textContent = `${f}-${invState.loaded} de ${invState.total}`;
}

async function loadInventory({reset = false} = {}) {
    if (!appStarted) return;
    const s = invState;
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
        setTimeout(checkInvScroll, 50);
    } catch (e) {
        if (s.loaded === 0) { invBody.innerHTML = ''; invEmpty.hidden = false; }
        invSummary.textContent = 'Error al cargar';
        s.hasNext = false;
    } finally {
        s.loading = false;
    }
}

function checkInvScroll() {
    if (invState.loading || !invState.hasNext) return;
    const r = invSentinel.getBoundingClientRect();
    if (r.top <= window.innerHeight + 700) loadInventory();
}

const invObs = new IntersectionObserver(entries => {
    if (!appStarted) return;
    if (entries.some(e => e.isIntersecting)) loadInventory();
}, {rootMargin: '640px 0px'});
if (invSentinel) invObs.observe(invSentinel);

// Inventory entry modal
const entryModal = document.getElementById('entryModal');
if (document.getElementById('entryBackdrop')) document.getElementById('entryBackdrop').addEventListener('click', () => entryModal.hidden = true);
if (document.getElementById('entryCancel')) document.getElementById('entryCancel').addEventListener('click', () => entryModal.hidden = true);

async function openEntryModal(invId) {
    document.getElementById('modalInventoryId').value = invId || '';
    document.getElementById('entryQuantity').value = '1';
    document.getElementById('entryNote').value = '';
    document.getElementById('entrySealed').checked = false;
    document.getElementById('entryInstagram').checked = false;
    try {
        const [langResp, condResp] = await Promise.all([
            apiFetch(apiUrl('languages', {per_page: 200})),
            apiFetch(apiUrl('product-conditions', {per_page: 200}))
        ]);
        if (langResp.ok) {
            const data = await langResp.json(); const langs = data.items || [];
            const sel = document.getElementById('entryLang');
            sel.innerHTML = '<option value="">(sin idioma)</option>';
            langs.forEach(l => { const opt = document.createElement('option'); opt.value = l.id; opt.textContent = l.name; sel.appendChild(opt); });
        }
        if (condResp.ok) {
            const data = await condResp.json(); const conds = data.items || [];
            const sel = document.getElementById('entryCondition');
            sel.innerHTML = '<option value="">(sin estado)</option>';
            conds.forEach(c => { const opt = document.createElement('option'); opt.value = c.id; opt.textContent = c.name; sel.appendChild(opt); });
        }
    } catch (e) { console.error(e); }
    if (invId) {
        try {
            const resp = await apiFetch(apiUrl(`inventory/${invId}`));
            if (resp.ok) {
                const item = await resp.json();
                const prod = item.product || {}; const col = item.collection || {};
                const lang = item.language || {}; const cond = item.condition || {}; const pur = item.purchase || {};
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
            is_sealed: isSealed, posted_instagram: postedInstagram,
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

// Add inventory modal
const addInvModal = document.getElementById('addInvModal');
if (document.getElementById('addInvBackdrop')) document.getElementById('addInvBackdrop').addEventListener('click', closeAddInvModal);
if (document.getElementById('addInvCancel')) document.getElementById('addInvCancel').addEventListener('click', closeAddInvModal);

const addInventoryBtn = document.getElementById('addInventoryBtn');
if (addInventoryBtn) addInventoryBtn.addEventListener('click', openAddInvModal);

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
    try {
        const [langResp, condResp, purResp] = await Promise.all([
            apiFetch(apiUrl('languages', {per_page: 200})),
            apiFetch(apiUrl('product-conditions', {per_page: 200})),
            apiFetch(apiUrl('purchases', {per_page: 200}))
        ]);
        if (langResp.ok) {
            const data = await langResp.json(); const langs = data.items || [];
            const sel = document.getElementById('addInvLang');
            sel.innerHTML = '<option value="">(sin idioma)</option>';
            langs.forEach(l => { const opt = document.createElement('option'); opt.value = l.id; opt.textContent = l.name; sel.appendChild(opt); });
        }
        if (condResp.ok) {
            const data = await condResp.json(); const conds = data.items || [];
            const sel = document.getElementById('addInvCondition');
            sel.innerHTML = '<option value="">(sin estado)</option>';
            conds.forEach(c => { const opt = document.createElement('option'); opt.value = c.id; opt.textContent = c.name; sel.appendChild(opt); });
        }
        if (purResp.ok) { const data = await purResp.json(); addInvPurchasesCache = data.items || []; }
    } catch (e) { console.error(e); }
    addInvModal.hidden = false;
    document.body.style.overflow = 'hidden';
    setTimeout(() => document.getElementById('addInvProduct').focus(), 50);
}

const addInvProductInput = document.getElementById('addInvProduct');
const addInvSuggestions = document.getElementById('addInvSuggestions');
let addInvSearchTimeout;

if (addInvProductInput) {
    addInvProductInput.addEventListener('input', () => {
        clearTimeout(addInvSearchTimeout);
        delete addInvProductInput.dataset.productId;
        const q = addInvProductInput.value.trim();
        if (q.length < 2) { closeAddInvSuggestions(); return; }
        addInvSearchTimeout = setTimeout(() => searchAddInvProducts(q), 300);
    });
    addInvProductInput.addEventListener('blur', () => setTimeout(closeAddInvSuggestions, 200));
}

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

const addInvPurchaseInput = document.getElementById('addInvPurchase');
const addInvPurchaseSuggestions = document.getElementById('addInvPurchaseSuggestions');
let addInvPurSearchTimeout;

if (addInvPurchaseInput) {
    addInvPurchaseInput.addEventListener('input', () => {
        clearTimeout(addInvPurSearchTimeout);
        addInvSelectedPurchaseId = null;
        const q = addInvPurchaseInput.value.trim().toLowerCase();
        if (q.length < 1) { closeAddInvPurchaseSuggestions(); return; }
        addInvPurSearchTimeout = setTimeout(() => searchAddInvPurchases(q), 200);
    });
    addInvPurchaseInput.addEventListener('blur', () => setTimeout(closeAddInvPurchaseSuggestions, 200));
}

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
    const productId = addInvProductInput ? addInvProductInput.dataset.productId : null;
    if (!productId) { alert('Selecciona un producto de la lista'); return; }
    const quantity = parseInt(document.getElementById('addInvQty').value, 10) || 1;
    const languageId = document.getElementById('addInvLang').value;
    const conditionId = document.getElementById('addInvCondition').value;
    const isSealed = document.getElementById('addInvSealed').checked;
    const postedInstagram = document.getElementById('addInvInstagram').checked;
    const purchaseId = addInvSelectedPurchaseId;
    const notes = document.getElementById('addInvNotes').value.trim();
    let collectionId;
    try {
        const prodResp = await apiFetch(apiUrl(`products/${productId}`));
        if (prodResp.ok) { const prod = await prodResp.json(); collectionId = prod.collection_id || (prod.collection && prod.collection.id); }
    } catch (e) { console.error(e); }
    if (!collectionId) { alert('No se pudo determinar la colecci\u00f3n del producto'); return; }
    const btn = ev.target.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = 'Guardando...';
    try {
        const payload = {
            product_id: parseInt(productId), collection_id: collectionId, quantity: quantity,
            ...(languageId ? {language_id: parseInt(languageId)} : {}),
            ...(conditionId ? {condition_id: parseInt(conditionId)} : {}),
            ...(purchaseId ? {purchase_id: purchaseId} : {}),
            is_sealed: isSealed, posted_instagram: postedInstagram,
            ...(notes ? {notes: notes} : {})
        };
        const resp = await apiFetch(apiUrl('inventory'), {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload)
        });
        if (!resp.ok) { const t = await resp.text().catch(()=>null); alert('Error al crear inventario: ' + resp.status + ' ' + (t||'')); return; }
        closeAddInvModal();
        loadInventory({reset: true});
    } catch (e) { console.error(e); alert('Error al guardar'); }
    finally { btn.disabled = false; btn.textContent = 'Guardar'; }
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
    return `<tr class="clickable-row" data-pur-id="${item.id}"><td>${esc(item.purchase_date ? item.purchase_date.slice(0,10) : '-')}</td><td>${esc(item.entity ? item.entity.name : '-')}</td><td>${total}</td><td>${ship}</td><td>${esc(item.currency || 'EUR')}</td><td>${itemsCount}</td></tr>`;
}

function appendPur(items) {
    if (!items.length && purState.loaded === 0) { purBody.innerHTML = ''; purEmpty.hidden = false; return; }
    purEmpty.hidden = true;
    purBody.insertAdjacentHTML('beforeend', items.map(renderPurRow).join(''));
}

function updatePurProgress() {
    const f = purState.loaded ? 1 : 0;
    purSummary.textContent = `${f}-${purState.loaded} de ${purState.total} compras`;
}

async function loadPurchases({reset = false} = {}) {
    if (!appStarted) return;
    const s = purState;
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
        setTimeout(checkPurScroll, 50);
    } catch (e) {
        if (s.loaded === 0) { purBody.innerHTML = ''; purEmpty.hidden = false; }
        purSummary.textContent = 'Error al cargar';
        s.hasNext = false;
    } finally {
        s.loading = false;
    }
}

function checkPurScroll() {
    if (purState.loading || !purState.hasNext) return;
    const r = purSentinel.getBoundingClientRect();
    if (r.top <= window.innerHeight + 700) loadPurchases();
}

const purObs = new IntersectionObserver(entries => {
    if (!appStarted) return;
    if (entries.some(e => e.isIntersecting)) loadPurchases();
}, {rootMargin: '640px 0px'});
if (purSentinel) purObs.observe(purSentinel);

// Purchase modal
const purModal = document.getElementById('purchaseModal');
if (document.getElementById('purBackdrop')) document.getElementById('purBackdrop').addEventListener('click', closePurModal);
if (document.getElementById('purCancel')) document.getElementById('purCancel').addEventListener('click', closePurModal);
function closePurModal() { purModal.hidden = true; document.body.style.overflow = ''; }

if (document.getElementById('addPurchaseBtn')) document.getElementById('addPurchaseBtn').addEventListener('click', () => openPurchaseModal(null));

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
    try {
        const resp = await apiFetch(apiUrl('entities', {per_page: 200}));
        if (resp.ok) {
            const data = await resp.json();
            allEntities = data.items || data || [];
            const sel = document.getElementById('purEntity');
            sel.innerHTML = '<option value="">Seleccionar...</option>';
            allEntities.forEach(e => { const opt = document.createElement('option'); opt.value = e.id; opt.textContent = e.name; sel.appendChild(opt); });
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

// Purchase items
let itemCounter = 0;
let productCache = {};

if (document.getElementById('addItemBtn')) document.getElementById('addItemBtn').addEventListener('click', () => { addItemRow(); });

async function addItemRow(data) {
    const tbody = document.getElementById('purchaseItemsBody');
    const emptyRow = tbody.querySelector('.empty-row');
    if (emptyRow) emptyRow.remove();
    const id = data ? (data.id || 'new_' + (++itemCounter)) : 'new_' + (++itemCounter);
    const qty = data ? (data.quantity || 1) : 1;
    const price = data ? (data.unit_price || '') : '';
    const tr = document.createElement('tr');
    tr.dataset.itemId = id;
    tr.innerHTML = `<td><input class="item-product" type="text" placeholder="Buscar producto..." value="${esc(data && data.product ? (data.product.product_number || '') : '')}" data-item-id="${id}"><span class="product-name-view"></span></td><td><input class="item-qty" type="number" min="1" step="1" value="${qty}" data-item-id="${id}"></td><td><input class="item-price" type="number" step="0.01" min="0" value="${price}" data-item-id="${id}"></td><td><span class="item-total" data-item-id="${id}">${price ? (qty * parseFloat(price)).toFixed(2) : '0.00'}</span></td><td><button type="button" class="btn-danger remove-item" data-item-id="${id}" title="Eliminar item">&times;</button></td>`;
    tbody.appendChild(tr);
    const prodInput = tr.querySelector('.item-product');
    if (!data || !data.product_id) {
        let timeout;
        prodInput.addEventListener('input', () => {
            clearTimeout(timeout);
            timeout = setTimeout(() => searchProducts(prodInput), 300);
        });
    }
    tr.querySelector('.item-qty').addEventListener('input', recalcItemTotal);
    tr.querySelector('.item-price').addEventListener('input', recalcItemTotal);
    tr.querySelector('.remove-item').addEventListener('click', () => {
        tr.remove();
        const rows = tbody.querySelectorAll('tr');
        if (rows.length === 0) tbody.innerHTML = '<tr class="empty-row"><td colspan="5" class="empty-state">Sin items</td></tr>';
    });
    if (data && data.product) {
        prodInput.dataset.productId = data.product.id;
        prodInput.dataset.productName = data.product.product_number || '';
        const nameSpan = tr.querySelector('.product-name-view');
        if (nameSpan) {
            try {
                const trResp = await apiFetch(apiUrl('product-translations', {per_page: 1, product_id: data.product.id}));
                if (trResp.ok) { const trData = await trResp.json(); const trans = (trData.items || [])[0]; if (trans && trans.name) nameSpan.textContent = trans.name; }
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
        if (items.length === 1) {
            const item = items[0];
            input.value = `${item.collection_code || ''} ${item.product_number || ''}`;
            input.dataset.productId = item.product_id;
            input.dataset.productName = item.product_name || '';
            const nameSpan = input.closest('td').querySelector('.product-name-view');
            if (nameSpan) nameSpan.textContent = item.product_name || '';
        } else if (items.length > 0) { showSuggestions(input, items); }
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
    const itemRows = document.querySelectorAll('#purchaseItemsBody tr:not(.empty-row)');
    const items = [];
    itemRows.forEach(tr => {
        const prodInput = tr.querySelector('.item-product');
        const qty = parseInt(tr.querySelector('.item-qty').value, 10) || 0;
        const price = parseFloat(tr.querySelector('.item-price').value) || 0;
        const productId = prodInput.dataset.productId;
        if (productId && qty > 0) items.push({product_id: parseInt(productId), quantity: qty, unit_price: price});
    });
    const btn = ev.target.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = 'Guardando...';
    try {
        let purResp;
        const payload = {
            entity_id: parseInt(entityId), purchase_date: date,
            total_amount: total || null, shipping_cost: shipping, currency: currency,
            ...(ref ? {external_reference: ref} : {}), ...(notes ? {notes: notes} : {})
        };
        if (purchaseId) {
            purResp = await apiFetch(apiUrl(`purchases/${purchaseId}`), {
                method: 'PATCH', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload)
            });
        } else {
            purResp = await apiFetch(apiUrl('purchases'), {
                method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload)
            });
        }
        if (!purResp.ok) { const t = await purResp.text().catch(()=>null); alert('Error al guardar compra: ' + purResp.status + ' ' + (t||'')); return; }
        const savedPurchase = await purResp.json();
        const savedId = savedPurchase.id;
        if (purchaseId) {
            const oldResp = await apiFetch(apiUrl('purchase-items', {per_page: 200, purchase_id: purchaseId}));
            if (oldResp.ok) { const oldData = await oldResp.json(); for (const oldItem of (oldData.items || [])) { await apiFetch(apiUrl(`purchase-items/${oldItem.id}`), {method: 'DELETE'}); } }
        }
        for (const item of items) {
            await apiFetch(apiUrl('purchase-items'), {
                method: 'POST', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({purchase_id: savedId, product_id: item.product_id, unit_price: item.unit_price, quantity: item.quantity})
            });
        }
        closePurModal();
        loadPurchases({reset: true});
    } catch (e) { console.error(e); alert('Error al guardar'); }
    finally { btn.disabled = false; btn.textContent = 'Guardar compra'; }
});

// ==================== EVENTS & INIT ====================

// Tab click on inventory rows
document.getElementById('tabInventory').addEventListener('click', (e) => {
    const row = e.target.closest('tr.clickable-row[data-inv-id]');
    if (row) openEntryModal(row.dataset.invId);
});

document.getElementById('tabPurchases').addEventListener('click', (e) => {
    const row = e.target.closest('tr.clickable-row[data-pur-id]');
    if (row) openPurchaseModal(row.dataset.purId);
});

// Product observers
const prodObserver = new IntersectionObserver((entries) => {
    if (!appStarted) return;
    if (entries.some((entry) => entry.isIntersecting)) loadProducts();
}, {rootMargin: "640px 0px"});
if (loadSentinel) prodObserver.observe(loadSentinel);

// Search
searchForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const q = searchInput.value.trim();
    prodState.q = q;
    invState.q = q;
    purState.q = q;
    loadTab(currentTab);
});

// Filters (products)
const filterManual = document.getElementById('filterManual');
if (filterManual) {
    filterManual.addEventListener('change', (e) => {
        prodState.is_manual = e.target.value || null;
        loadProducts({reset: true});
    });
}

const filterVerified = document.getElementById('filterVerified');
if (filterVerified) {
    filterVerified.addEventListener('change', (e) => {
        prodState.is_verified = e.target.value || null;
        loadProducts({reset: true});
    });
}

// Resize
window.addEventListener("resize", () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
        const previousPerPage = prodState.perPage;
        updatePageSizeFromViewport();
        if (previousPerPage !== prodState.perPage) loadProducts({reset: true});
        else requestNextPage();
    }, 160);
});

// Scroll handlers
let invScrollTimer, purScrollTimer;
window.addEventListener('scroll', () => {
    clearTimeout(invScrollTimer);
    invScrollTimer = setTimeout(() => { if (currentTab === 'inventory') checkInvScroll(); }, 80);
    clearTimeout(purScrollTimer);
    purScrollTimer = setTimeout(() => { if (currentTab === 'purchases') checkPurScroll(); }, 80);
}, {passive: true});

// Login modal wiring
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

// Show all checkbox
const showAllCb = document.getElementById('showAllInv');
if (showAllCb) {
    showAllCb.addEventListener('change', () => { loadInventory({reset: true}); });
}

// Inline detail styles
(function injectDetailStyles() {
    const css = `
        .detail-row { display:flex !important; align-items:center !important; gap:8px; padding:4px 0; border-bottom:1px solid rgba(255,255,255,0.04); }
        .detail-row a { flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; min-width:0; }
        .detail-meta { color:var(--muted, #888); font-size:.8em; white-space:nowrap; flex-shrink:0; }
        .btn-delete-file, .btn-delete-tracker, .btn-delete-trans {
            flex-shrink:0 !important;
            display:flex !important; align-items:center !important; justify-content:center !important;
            width:22px !important; height:22px !important;
            padding:0 !important;
            border:none !important; border-radius:4px !important;
            background:transparent !important;
            color:var(--muted, #888) !important;
            cursor:pointer !important;
            opacity:0.6;
            transition:opacity .15s, color .15s, background .15s;
        }
        .btn-delete-file:hover, .btn-delete-tracker:hover, .btn-delete-trans:hover {
            color:#e53e3e !important; background:rgba(229,62,62,.12) !important; opacity:1;
        }
        .files-list { list-style:none; padding-left:0; margin:6px 0 0 0; }
        .files-list li { padding:4px 0 !important; }
    `;
    const el = document.createElement('style');
    el.textContent = css;
    document.head.appendChild(el);
})();

updatePageSizeFromViewport();

// Initialize
updateAuthUI();
