const configuredApiBase = (typeof CARDVAULT_API_BASE !== "undefined" ? CARDVAULT_API_BASE : "http://127.0.0.1:5000/api").replace(/\/$/, "");
const apiOrigin = new URL(configuredApiBase).origin;
const TOKEN_KEY = "cardvault_token";

let appStarted = false;
let currentUserRoles = [];
let currentTab = 'inventory';

// ==================== AUTH & API ====================

async function apiFetch(url, options = {}) {
    options = options || {};
    options.headers = options.headers || {};
    options.cache = 'no-store';
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
    const validRoles = ['product_read', 'product_write', 'inventory_manage', 'collection_read', 'collection_write', 'scheduled_task_read', 'scheduled_task_write', 'admin'];
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
    const validRoles = ['product_read', 'product_write', 'inventory_manage', 'collection_read', 'collection_write', 'admin'];
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

    const addColBtn = document.getElementById('addCollectionBtn');
    if (addColBtn) addColBtn.style.display = (hasRole('collection_write') || hasRole('product_write')) ? '' : 'none';
    if (document.getElementById('collectionModal') && !hasRole('collection_write') && !hasRole('product_write'))
        document.getElementById('collectionModal').hidden = true;

    const addInvBtn = document.getElementById('addInventoryBtn');
    if (addInvBtn) addInvBtn.style.display = hasRole('inventory_manage') ? '' : 'none';
    const addPurBtn = document.getElementById('addPurchaseBtn');
    if (addPurBtn) addPurBtn.style.display = hasRole('inventory_manage') ? '' : 'none';
    const addScheduledBtn = document.getElementById('addScheduledTaskBtn');
    if (addScheduledBtn) addScheduledBtn.style.display = hasRole('scheduled_task_write') ? '' : 'none';
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

function formatName(name, nameAlter) {
    if (name && nameAlter) return `${esc(name)} (${esc(nameAlter)})`;
    return name ? esc(name) : (nameAlter ? esc(nameAlter) : '');
}
function getProductName(translations, langId) {
    if (!translations || !translations.length) return '';
    if (langId != null && langId !== '') {
        const id = parseInt(langId, 10);
        const match = translations.find(t => t.language_id === id || (t.language && t.language.id === id));
        if (match) return match.name;
    }
    return translations[0].name;
}
function getFormattedProductName(translations, langId) {
    if (!translations || !translations.length) return '';
    let match;
    if (langId != null && langId !== '') {
        const id = parseInt(langId, 10);
        match = translations.find(t => t.language_id === id || (t.language && t.language.id === id));
    }
    if (!match) match = translations[0];
    return formatName(match.name, match.name_alter);
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
    if (tab === 'collections') loadCollections({reset: true});
    else if (tab === 'products') loadProducts({reset: true});
    else if (tab === 'inventory') loadInventory({reset: true});
    else if (tab === 'scheduledTasks') loadScheduledTasks({reset: true});
    else if (tab === 'statistics') loadStatisticsTab();
    else loadPurchases({reset: true});
}

// ==================== PRODUCT CATALOG ====================

const prodState = {
    page: 1, perPage: 10, q: "", is_verified: null, is_manual: null,
    pages: 0, total: 0, loaded: 0, loading: false, hasNext: true,
    collection_code: '', product_number: '', product_name: '', product_type_id: ''
};

const productGrid = document.querySelector("#productGrid");
const emptyState = document.querySelector("#emptyState");
const prodSummary = document.querySelector("#productSummary");
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
    const baseUrl = assetUrl(item.image_url);
    const sep = baseUrl.includes('?') ? '&' : '?';
    const smUrl = baseUrl + sep + 'size=sm';
    const mdUrl = baseUrl + sep + 'size=md';
    const lgUrl = baseUrl;
    return `<div class="thumb"><img class="product-thumb-img" src="${placeholder}" data-src="${esc(lgUrl)}" data-srcset="${esc(smUrl + ' 200w, ' + mdUrl + ' 400w, ' + lgUrl + ' 600w')}" sizes="(max-width:520px) 100vw, (max-width:820px) 50vw, (max-width:1080px) 33vw, (max-width:1320px) 25vw, 20vw" data-product-id="${item.product_id}" data-product-name="${esc(item.product_name || "Producto")}" alt="${esc(item.product_name || "Producto")}" loading="lazy"></div><div class="img-preview"></div>`;
}

function itemCard(item) {
    return `<article class="product-card"><div class="thumb-wrap">${imageCell(item)}${verifiedIcon(item.is_verified)}</div><div class="card-body"><div class="collection-line" style="grid-template-columns:auto auto 1fr auto"><span class="code">${esc(item.collection_code)}</span>${manualIcon(item.collection_is_manual)}<span class="collection-name" title="${esc(item.collection_name || "-")}">${esc(item.collection_name || "-")}</span><button type="button" class="btn-delete-prod" data-product-id="${item.product_id}" title="Eliminar" style="background:none;border:none;color:var(--red);cursor:pointer;font-size:18px;line-height:1;padding:2px 6px;justify-self:end">&times;</button></div><div class="product-line"><span class="number">${esc(item.product_number || "-")}</span><span class="product-name" title="${esc(item.product_name || "-")}" data-product-id="${item.product_id}">${esc(item.product_name || "-")}</span>${manualIcon(item.product_is_manual)}${item.tracker_url ? `<button class="tracker-button" data-tracker-url="${esc(item.tracker_url)}" title="Abrir precio" aria-label="Abrir precio"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12h12"></path><path d="M15 6l6 6-6 6"></path></svg></button>` : ''}</div></div></article>`;
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
        const params = {
            page: prodState.page, per_page: prodState.perPage,
            q: prodState.q, is_verified: prodState.is_verified, is_manual: prodState.is_manual
        };
        if (prodState.collection_code) params.collection_code = prodState.collection_code;
        if (prodState.product_number) params.product_number = prodState.product_number;
        if (prodState.product_name) params.product_name = prodState.product_name;
        if (prodState.product_type_id) params.product_type_id = prodState.product_type_id;
        const resp = await apiFetch(apiUrl("product-catalog", params));
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
    document.querySelectorAll('.thumb-wrap').forEach(wrap => {
        if (wrap.dataset.previewBound) return;
        wrap.dataset.previewBound = '1';
        const preview = wrap.querySelector('.img-preview');
        const thumbImg = wrap.querySelector('.product-thumb-img');
        if (!preview || !thumbImg) return;
        wrap.addEventListener('mouseenter', () => {
            if (preview.querySelector('img')) return;
            const src = thumbImg.getAttribute('data-src');
            if (!src) return;
            const token = window.localStorage.getItem(TOKEN_KEY);
            const sep = src.includes('?') ? '&' : '?';
            const img = document.createElement('img');
            img.src = token ? src + sep + 'token=' + encodeURIComponent(token) : src;
            img.alt = '';
            img.draggable = false;
            preview.appendChild(img);
        });
    });
}

// Image loading
function _addToken(url) {
    const token = window.localStorage.getItem(TOKEN_KEY);
    if (!token) return url;
    const sep = url.includes('?') ? '&' : '?';
    return url + sep + 'token=' + encodeURIComponent(token);
}

function fetchAndSetImage(imgEl) {
    const srcset = imgEl.getAttribute('data-srcset');
    if (srcset) {
        imgEl.srcset = srcset.split(',').map(part => {
            const trimmed = part.trim().split(/\s+/);
            return _addToken(trimmed[0]) + (trimmed[1] ? ' ' + trimmed[1] : '');
        }).join(', ');
    }
    const src = imgEl.getAttribute('data-src');
    if (src) imgEl.src = _addToken(src);
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
    img.removeAttribute('data-srcset');
    img.setAttribute('data-src', cacheBustedUrl);
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
    modalSaveButton.disabled = true;
    modalSaveButton.textContent = "Guardando...";
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
            html += `<div class="detail-grid"><div><strong>Producto:</strong> ${esc(prodName || prod.product_number || '-')}</div><div><strong>N\u00famero:</strong> ${esc(prod.product_number || '-')}</div><div><strong>Colecci\u00f3n:</strong> ${esc(colName)} (${esc(colCode)})</div><div><label class="checkbox-label"><strong>Forzar descarga:</strong> <input type="checkbox" class="force-download-check" data-product-id="${prod.id}" ${prod.force_download ? 'checked' : ''}></label></div><div><label class="checkbox-label"><strong>Verificado:</strong> <input type="checkbox" class="verified-check" data-product-id="${prod.id}" ${prod.is_verified ? 'checked' : ''}></label></div><div><label class="checkbox-label"><strong>Manual:</strong> <input type="checkbox" class="manual-check" data-product-id="${prod.id}" ${prod.is_manual ? 'checked' : ''}></label></div></div>`;
            html += searchQ ? `<div class="detail-actions"><a class="google-search-btn" href="https://www.google.com/search?q=${searchQ}" target="_blank" rel="noopener" title="Buscar en Google">Buscar en Google</a></div>` : '';
        }
        html += `<h3>Traducciones (${translations.length})</h3><div class="trans-list" id="transList">`;
        if (translations.length === 0) html += '<div class="empty-state">Sin traducciones</div>';
        else {
            for (const t of translations) {
                const langName = t.language && t.language.name ? t.language.name : `ID ${t.language_id}`;
                html += `<div class="trans-row" data-trans-id="${t.id}"><span class="trans-lang">${esc(langName)}</span><span class="trans-name">${formatName(t.name, t.name_alter)}</span><button type="button" class="btn-delete-trans" data-trans-id="${t.id}" title="Eliminar traduccion"><svg viewBox="0 0 24 24" aria-hidden="true" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg></button></div>`;
            }
        }
        html += '</div>';
        html += `<div class="trans-add"><select id="newTransLang"><option value="">Idioma...</option>${languages.map(l => `<option value="${l.id}">${esc(l.name)}</option>`).join('')}</select><input id="newTransName" type="text" placeholder="Nombre"><button type="button" id="addTransBtn" class="btn-secondary">+</button></div>`;
        html += `<h3>Ficheros (${files.length})</h3>`;
        if (files.length === 0) html += '<div class="empty-state">Sin ficheros</div>';
        html += '<ul class="files-list">';
        const tokenF = window.localStorage.getItem(TOKEN_KEY) || '';
        const qsF = tokenF ? `?token=${encodeURIComponent(tokenF)}` : '';
        for (const f of files) {
            const lang = f.language ? `(${esc(f.language.name)})` : '';
            const fileUrl = apiUrl(`product-catalog/files/${f.id}/content`) + qsF;
            html += `<li class="detail-row"><a href="${esc(fileUrl)}" target="_blank">${esc(f.original_name || f.stored_name)}</a><span class="detail-meta">${lang}</span><button type="button" class="btn-delete-file" data-file-id="${f.id}" title="Eliminar fichero"><svg viewBox="0 0 24 24" aria-hidden="true" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg></button></li>`;
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

        const verifiedCheck = modalDetail.querySelector('.verified-check');
        if (verifiedCheck) {
            verifiedCheck.addEventListener('change', async function () {
                const pid = this.dataset.productId;
                const checked = this.checked;
                const resp = await apiFetch(apiUrl(`products/${pid}`), {
                    method: 'PATCH', headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({is_verified: checked})
                });
                if (!resp.ok) { this.checked = !checked; alert('Error al actualizar verificado'); }
            });
        }

        const forceDownloadCheck = modalDetail.querySelector('.force-download-check');
        if (forceDownloadCheck) {
            forceDownloadCheck.addEventListener('change', async function () {
                const pid = this.dataset.productId;
                const checked = this.checked;
                const resp = await apiFetch(apiUrl(`products/${pid}`), {
                    method: 'PATCH', headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({force_download: checked})
                });
                if (!resp.ok) { this.checked = !checked; alert('Error al actualizar force download'); }
            });
        }

        const manualCheck = modalDetail.querySelector('.manual-check');
        if (manualCheck) {
            manualCheck.addEventListener('change', async function () {
                const pid = this.dataset.productId;
                const checked = this.checked;
                const resp = await apiFetch(apiUrl(`products/${pid}`), {
                    method: 'PATCH', headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({is_manual: checked})
                });
                if (!resp.ok) { this.checked = !checked; alert('Error al actualizar manual'); }
            });
        }

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

// Delegated clicks for product name / image / delete
document.addEventListener("click", async (ev) => {
    const delBtn = ev.target.closest('.btn-delete-prod');
    if (delBtn) {
        ev.preventDefault(); ev.stopPropagation();
        if (!confirm('\u00bfEliminar este producto?')) return;
        const productId = delBtn.dataset.productId;
        const resp = await apiFetch(apiUrl(`products/${productId}`), {method: 'DELETE'});
        if (resp && resp.ok) {
            delBtn.closest('.product-card').remove();
            prodState.loaded -= 1; prodState.total -= 1;
            renderProgress();
        } else {
            const msg = resp ? await resp.text().catch(() => 'Error al eliminar') : 'Error de red';
            alert(msg);
        }
        return;
    }
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
    if (ev.key !== "Escape") return;
    if (!productModal.hidden) closeModal();
    else if (!createModal.hidden) closeCreateModal();
    else if (!entryModal.hidden) closeEntryModal();
    else if (!addInvModal.hidden) closeAddInvModal();
    else if (!purModal.hidden) closePurModal();
    else if (!colModal.hidden) closeColModal();
    else if (!scheduledModal.hidden) closeScheduledModal();
    else if (!loginModal.hidden) hideLoginModal();
});

// Create product
const createModal = document.getElementById('createProductModal');
const createBackdrop = document.getElementById('createBackdrop');
const createForm = document.getElementById('createProductForm');
const createCancel = document.getElementById('createCancel');
const newColCode = document.getElementById('newColCode');
const newProductNumber = document.getElementById('newProductNumber');
const newIsManual = document.getElementById('newIsManual');
const colSuggestions = document.getElementById('colSuggestions');

const addProductBtn = document.getElementById('addProductBtn');
if (addProductBtn) {
    addProductBtn.addEventListener('click', () => {
        if (!hasRole('product_write')) return;
        openCreateModal();
    });
}

const pokeSyncBtn = document.getElementById('pokeSyncBtn');
if (pokeSyncBtn) {
    pokeSyncBtn.addEventListener('click', async () => {
        if (!hasRole('product_write')) return;
        pokeSyncBtn.disabled = true; pokeSyncBtn.textContent = 'Programando...';
        try {
            const tasksResp = await apiFetch(apiUrl('scheduled-tasks', {per_page: 200}));
            let taskId;
            if (tasksResp.ok) {
                const tasksData = await tasksResp.json();
                const existing = (tasksData.items || []).find(t => t.script_path && t.script_path.includes('sync_pokemon_products'));
                if (existing) {
                    taskId = existing.id;
                } else {
                    const createResp = await apiFetch(apiUrl('scheduled-tasks'), {
                        method: 'POST', headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({name: 'Sync Pokémon Products', script_path: 'sync_pokemon_products.py', cron_expression: '0 0 * * *', enabled: true})
                    });
                    if (createResp.ok) { const d = await createResp.json(); taskId = d.id; }
                }
            }
            if (!taskId) { alert('Error al crear/programar la tarea'); return; }
            const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
            const execResp = await apiFetch(apiUrl('task-executions'), {
                method: 'POST', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({scheduled_task_id: taskId, scheduled_date: now, status: 'pending'})
            });
            if (execResp.ok) {
                alert('Tarea programada correctamente. Se ejecutar\u00e1 en breve.');
            } else {
                alert('Error al programar la ejecuci\u00f3n');
            }
        } catch (e) { console.error(e); alert('Error al programar sync'); }
        finally { pokeSyncBtn.disabled = false; pokeSyncBtn.textContent = '+ Poke sync'; }
    });
}

if (createBackdrop) createBackdrop.addEventListener('click', closeCreateModal);
if (createCancel) createCancel.addEventListener('click', closeCreateModal);

function closeCreateModal() {
    createModal.hidden = true;
    document.body.style.overflow = '';
}

function openCreateModal() {
    newColCode.value = ''; delete newColCode.dataset.collectionId; delete newColCode.dataset.isManual;
    newProductNumber.value = ''; newIsManual.checked = true;
    closeColSuggestions();
    const preview = document.getElementById('cardPreview');
    if (preview) { preview.style.display = 'none'; preview.innerHTML = ''; }
    createModal.hidden = false;
    document.body.style.overflow = 'hidden';
    setTimeout(() => newColCode.focus(), 50);
}

let colSearchTimeout;
if (newColCode) {
    newColCode.addEventListener('input', () => {
        clearTimeout(colSearchTimeout);
        delete newColCode.dataset.collectionId; delete newColCode.dataset.isManual;
        const preview = document.getElementById('cardPreview');
        if (preview) { preview.style.display = 'none'; preview.innerHTML = ''; }
        const q = newColCode.value.trim();
        if (q.length < 2) { closeColSuggestions(); return; }
        colSearchTimeout = setTimeout(() => searchCollections(q), 300);
    });
    newColCode.addEventListener('blur', () => setTimeout(closeColSuggestions, 200));
}

let prodNumCheckTimeout = null;

async function getSettingValue(key) {
    try {
        const resp = await apiFetch(apiUrl('settings', {per_page: 200}));
        if (resp.ok) {
            const data = await resp.json();
            const setting = (data.items || []).find(s => s.setting_key === key);
            if (setting && setting.setting_value) return setting.setting_value;
        }
    } catch (e) { console.error(e); }
    return null;
}

async function checkCardInApi(collectionCode, productNumber) {
    const preview = document.getElementById('cardPreview');
    if (!preview) return;

    const cardType = newColCode ? newColCode.dataset.cardType || '' : '';
    const settingKey = cardType === 'MTG' ? 'sync.magic.collections.api.base' : cardType === 'YUG' ? 'sync.yugioh.products.api.base' : cardType === 'DIG' ? 'sync.digimon.products.api.base' : cardType === 'OP' ? 'sync.one-piece.products.api.base' : 'sync.pokemon.products.api.base';
    const apiBase = await getSettingValue(settingKey);
    if (!apiBase) { preview.style.display = 'none'; preview.innerHTML = ''; return; }

    preview.style.display = 'block';
    preview.innerHTML = '<span style="color:var(--muted)">Comprobando...</span>';
    try {
        let externalUrl, name, imageUrl;
        if (cardType === 'MTG') {
            externalUrl = `${apiBase.replace(/\/+$/, '')}/cards/${encodeURIComponent(collectionCode)}/${encodeURIComponent(productNumber)}`;
        } else if (cardType === 'YUG') {
            externalUrl = `${apiBase.replace(/\/+$/, '')}/cardinfo.php?id=${encodeURIComponent(productNumber)}`;
        } else if (cardType === 'DIG') {
            externalUrl = `${apiBase.replace(/\/+$/, '')}/search?card=${encodeURIComponent(collectionCode)}-${encodeURIComponent(productNumber)}`;
        } else if (cardType === 'OP') {
            const cardId = collectionCode.replace('-', '') + '-' + productNumber;
            externalUrl = `${apiBase.replace(/\/+$/, '')}/api/sets/card/${encodeURIComponent(cardId)}/`;
        } else {
            externalUrl = `${apiBase.replace(/\/+$/, '')}/en/cards/${encodeURIComponent(collectionCode)}-${encodeURIComponent(productNumber)}`;
        }

        const proxyResp = await apiFetch(apiUrl('proxy/external'), {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({url: externalUrl})
        });
        if (!proxyResp.ok) { preview.innerHTML = '<span style="color:var(--red)">Error al consultar API</span>'; return; }
        const data = await proxyResp.json();
        if (data.found === false) { preview.innerHTML = '<span style="color:var(--red)">No encontrado en API</span>'; return; }

        if (cardType === 'MTG') {
            name = data.name || null;
            imageUrl = data.image_uris ? (data.image_uris.small || data.image_uris.normal || null) : null;
        } else if (cardType === 'YUG') {
            const cardData = data.data ? data.data[0] : null;
            if (!cardData) { preview.innerHTML = '<span style="color:var(--red)">No encontrado en API</span>'; return; }
            name = cardData.name || null;
            const images = cardData.card_images || [];
            imageUrl = images.length > 0 ? (images[0].image_url_small || images[0].image_url || null) : null;
        } else if (cardType === 'DIG') {
            const cardData = Array.isArray(data) ? data[0] : null;
            if (!cardData) { preview.innerHTML = '<span style="color:var(--red)">No encontrado en API</span>'; return; }
            name = cardData.name || null;
            imageUrl = `https://images.digimoncard.io/images/cards/${encodeURIComponent(collectionCode)}-${encodeURIComponent(productNumber)}.jpg`;
        } else if (cardType === 'OP') {
            const cardData = Array.isArray(data) ? data[0] : null;
            if (!cardData) { preview.innerHTML = '<span style="color:var(--red)">No encontrado en API</span>'; return; }
            name = cardData.card_name || null;
            imageUrl = cardData.card_image || null;
        } else {
            name = data.name || null;
            const imageBase = data.image || null;
            imageUrl = imageBase ? `${imageBase.replace(/\/+$/, '')}/high.jpg` : null;
        }

        let html = '';
        html += `<div style="margin-bottom:4px;font-size:11px;word-break:break-all"><strong>API URL:</strong> <a href="${esc(externalUrl)}" target="_blank" rel="noopener">${esc(externalUrl)}</a></div>`;
        if (name) html += `<div><strong>Nombre:</strong> ${esc(name)}</div>`;
        else html += '<div><span style="color:var(--red)">Sin nombre</span></div>';

        if (imageUrl) {
            html += `<div style="margin-top:6px"><img src="${esc(imageUrl)}" alt="${esc(name || '')}" style="max-width:180px;border-radius:4px;border:1px solid var(--border)" onerror="this.style.display='none'"></div>`;
        } else {
            html += '<div><span style="color:var(--red)">Sin imagen</span></div>';
        }
        preview.innerHTML = html;
    } catch (e) {
        console.error(e);
        preview.innerHTML = '<span style="color:var(--red)">Error al consultar API</span>';
    }
}

if (newProductNumber) {
    newProductNumber.addEventListener('input', () => {
        clearTimeout(prodNumCheckTimeout);
        const preview = document.getElementById('cardPreview');
        if (preview) { preview.style.display = 'none'; preview.innerHTML = ''; }
        const num = newProductNumber.value.trim();
        const code = newColCode ? newColCode.value.trim() : '';
        if (!num || !code) return;
        const isManual = newColCode && newColCode.dataset.isManual === 'true';
        if (isManual) return;
        prodNumCheckTimeout = setTimeout(() => checkCardInApi(code, num), 500);
    });
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
        `<div class="suggestion-item" data-code="${esc(item.code)}" data-id="${item.id}" data-is-manual="${!!item.is_manual}" data-card-type="${item.card_type ? esc(item.card_type.short_name || '') : ''}">
            <span class="suggestion-code">${esc(item.code)}</span>
            ${item.name ? `<span class="suggestion-name">${formatName(item.name, item.name_alter)}</span>` : ''}
            ${item.card_type ? `<span class="suggestion-type">${esc(item.card_type.short_name || item.card_type.name)}</span>` : ''}
            ${item.is_manual ? '<span class="suggestion-manual" title="Manual">M</span>' : ''}
        </div>`
    ).join('');
    colSuggestions.querySelectorAll('.suggestion-item').forEach(el => {
        el.addEventListener('click', () => {
            newColCode.value = el.dataset.code;
            newColCode.dataset.collectionId = el.dataset.id;
            newColCode.dataset.isManual = el.dataset.isManual;
            newColCode.dataset.cardType = el.dataset.cardType;
            closeColSuggestions();
            if (newProductNumber && newProductNumber.value.trim()) {
                clearTimeout(prodNumCheckTimeout);
                const num = newProductNumber.value.trim();
                const isManual = newColCode.dataset.isManual === 'true';
                if (!isManual) prodNumCheckTimeout = setTimeout(() => checkCardInApi(newColCode.value.trim(), num), 500);
            }
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
        const isManual = newIsManual.checked;
        if (!code) { alert('El c\u00f3digo de colecci\u00f3n es obligatorio'); return; }
        const btn = createForm.querySelector('button[type="submit"]');
        btn.disabled = true; btn.textContent = 'Creando...';
        try {
            const colResp = await apiFetch(apiUrl('collections', {q: code, per_page: 5}));
            if (!colResp.ok) return;
            const colData = await colResp.json();
            const existing = (colData.items || []).find(c => c.code === code);
            if (!existing) { alert('Colecci\u00f3n no encontrada. Debe existir para crear un producto.'); btn.disabled = false; btn.textContent = 'Crear producto'; return; }
            const collectionId = existing.id;
            const cardTypeId = existing.card_type ? existing.card_type.id : existing.card_type_id;
            if (!cardTypeId) { alert('La colecci\u00f3n no tiene tipo de carta'); btn.disabled = false; btn.textContent = 'Crear producto'; return; }
            const prodResp = await apiFetch(apiUrl('products'), {
                method: 'POST', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({collection_id: collectionId, product_type_id: parseInt(cardTypeId), ...(productNumber ? {product_number: productNumber} : {}), is_manual: isManual})
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
    page: 1, perPage: 50, q: '', sort: 'newest', pages: 0, total: 0, loaded: 0, loading: false, hasNext: true,
    collection_code: '', product_number: '', product_name: '', card_type_id: '', tag_name: '', is_sealed: '', posted_instagram: ''
};

const purState = {
    page: 1, perPage: 50, q: '', pages: 0, total: 0, loaded: 0, loading: false, hasNext: true,
    date_from: '', date_to: '', entity_id: '', shipping_status_id: '', shipping_company_id: ''
};

const invBody = document.getElementById('inventoryBody');
const invEmpty = document.getElementById('invEmpty');
const invSummary = document.getElementById('invSummary');
const invSentinel = document.getElementById('invSentinel');

let invViewMode = 'list';

document.querySelectorAll('.view-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.view-btn').forEach(b => {
            b.style.background = 'transparent';
            b.classList.remove('active');
        });
        btn.style.background = 'var(--surface-strong)';
        btn.classList.add('active');
        invViewMode = btn.dataset.view;
        const tw = document.getElementById('invTableView');
        tw.className = 'table-wrap';
        if (invViewMode !== 'list') tw.classList.add('view-' + invViewMode);
        loadInventory({reset: true});
    });
});

function renderInvLoading() {
    invBody.innerHTML = `<tr><td colspan="13" class="loading-state">Cargando inventario...</td></tr>`;
    invEmpty.hidden = true;
}

function renderInvRow(item) {
    const prod = item.product || {};
    const col = item.collection || {};
    const lang = item.language || {};
    const cond = item.condition || {};
    const stock = item.quantity ?? 0;
    const cls = stock > 0 ? 'stock-positive' : stock < 0 ? 'stock-negative' : 'stock-zero';
    const prodName = getProductName(prod.translations, lang.id);
    const prodNameFmt = getFormattedProductName(prod.translations, lang.id);
    const cardType = prod.product_type ? (prod.product_type.name + (prod.product_type.short_name ? ' (' + prod.product_type.short_name + ')' : '')) : (item.extra_type ? (item.extra_type.name + (item.extra_type.short_name ? ' (' + item.extra_type.short_name + ')' : '')) : '');
    const sealedIcon = item.is_sealed ? '\u2713' : '';
    const igIcon = item.posted_instagram ? '\u2713' : '';
    let price = '';
    if (item.acquisition_price != null) {
        const p = parseFloat(item.acquisition_price).toFixed(2);
        price = p + '\u20AC';
        if (item.current_price != null) {
            const diff = parseFloat(item.current_price) - parseFloat(item.acquisition_price);
            const sign = diff >= 0 ? '+' : '';
            const color = diff >= 0 ? 'var(--green)' : 'var(--red)';
            price += ` <span style="color:${color}">(${sign}${diff.toFixed(2)}\u20AC)</span>`;
        }
    }
    const currentPrice = item.current_price != null ? parseFloat(item.current_price).toFixed(2) + '\u20AC' : '';
    const minPrice = item.min_price != null ? parseFloat(item.min_price).toFixed(2) + '\u20AC' : '';
    const maxPrice = item.max_price != null ? parseFloat(item.max_price).toFixed(2) + '\u20AC' : '';
    const codeNum = esc(col.code || '-') + (prod.product_number ? ' ' + esc(prod.product_number) : '');
    const nameDisplay = prodNameFmt ? `<strong>${prodNameFmt}</strong>` : '<em style="color:var(--muted)">(sin nombre)</em>';
    const noteDisplay = item.notes ? `<br><span class="inv-note">${esc(item.notes)}</span>` : '';
    const tagsHtml = renderTagBadges(item.tags);
    return `<tr class="clickable-row" data-inv-id="${item.id}"><td class="inv-img-cell">${invImageCell(item.product_image_url)}</td><td class="inv-img-cell">${invImageCell(item.inventory_image_url)}</td><td>${esc(cardType)}</td><td>${esc(col.code || col.name || '-')}</td><td><span style="color:var(--muted)">(${codeNum})</span> ${nameDisplay}${noteDisplay}</td><td>${esc(lang.name || '')}</td><td>${esc(cond.name || '')}</td><td>${price}</td><td>${currentPrice}</td><td>${minPrice}</td><td>${maxPrice}</td><td class="${cls}">${stock}</td><td>${sealedIcon}</td><td>${igIcon}</td><td>${tagsHtml}</td><td style="text-align:center"><button type="button" class="btn-delete-inv" data-inv-id="${item.id}" title="Eliminar" style="background:none;border:none;color:var(--red);cursor:pointer;font-size:18px;line-height:1;padding:2px 6px">&times;</button></td></tr>`;
}

function renderTagBadges(tags) {
    if (!tags || !tags.length) return '';
    return tags.map(t => {
        const bg = t.color || '#6c757d';
        return `<span class="tag-badge" style="display:inline-block;padding:1px 6px;margin:1px;border-radius:3px;font-size:11px;color:#fff;background:${esc(bg)}">${esc(t.name)}</span>`;
    }).join(' ');
}

function renderEntryTagBadge(tag, invId) {
    const bg = tag.color || '#6c757d';
    return `<span class="entry-tag-badge" data-tag-id="${tag.id}" data-inv-id="${invId}" style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:3px;font-size:12px;color:#fff;background:${esc(bg)}">${esc(tag.name)}<button type="button" class="btn-remove-tag" data-tag-id="${tag.id}" style="background:none;border:none;color:#fff;cursor:pointer;font-size:14px;line-height:1;padding:0">&times;</button></span>`;
}

function invImageCell(url) {
    const placeholder = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";
    if (!url) {
        return `<div class="inv-img-thumb"><svg class="thumb-placeholder" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"></rect><path d="m8 14 2.5-2.5L14 15l2-2 3 3"></path><circle cx="8.5" cy="8.5" r="1.5"></circle></svg></div>`;
    }
    const imgUrl = assetUrl(url);
    const sep = imgUrl.includes('?') ? '&' : '?';
    return `<div class="inv-img-thumb"><img class="product-thumb-img" src="${placeholder}" data-src="${esc(imgUrl + sep + 'size=sm')}" alt="" loading="lazy"></div>`;
}

function appendInv(items) {
    if (!items.length && invState.loaded === 0) { invBody.innerHTML = ''; invEmpty.hidden = false; return; }
    invEmpty.hidden = true;
    invBody.insertAdjacentHTML('beforeend', items.map(renderInvRow).join(''));
    loadImages(invBody);
}

function updateInvProgress() {
    const f = invState.loaded ? 1 : 0;
    invSummary.textContent = `${f}-${invState.loaded} de ${invState.total}`;
}

async function loadInventory({reset = false} = {}) {
    if (!appStarted) return;
    const s = invState;
    if (s.loading || (!s.hasNext && !reset)) return;
    if (reset) {
        s.page = 1; s.pages = 0; s.total = 0; s.loaded = 0; s.hasNext = true;
        invBody.innerHTML = '';
        document.getElementById('invTableView').hidden = false;
        invEmpty.hidden = true;
        renderInvLoading();
    }
    s.loading = true;
    try {
        const params = {page: s.page, per_page: s.perPage, q: s.q, sort: s.sort};
        if (s.collection_code) params.collection_code = s.collection_code;
        if (s.product_number) params.product_number = s.product_number;
        if (s.product_name) params.product_name = s.product_name;
        if (s.card_type_id) params.card_type_id = s.card_type_id;
        if (s.tag_name) params.tag_name = s.tag_name;
        if (s.is_sealed !== null && s.is_sealed !== '') params.is_sealed = s.is_sealed;
        if (s.posted_instagram !== null && s.posted_instagram !== '') params.posted_instagram = s.posted_instagram;
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
function closeEntryModal() { entryModal.hidden = true; document.body.style.overflow = ''; }
if (document.getElementById('entryBackdrop')) document.getElementById('entryBackdrop').addEventListener('click', closeEntryModal);
if (document.getElementById('entryCancel')) document.getElementById('entryCancel').addEventListener('click', closeEntryModal);

let entryPurchasesCache = [];
let entrySelectedPurchaseId = null;
let entrySelectedPurchaseItemId = null;

async function loadPurchaseItems(purchaseId, selectEl, priceDisplayId, priceValueId, langId) {
    selectEl.innerHTML = '<option value="">(seleccionar item de la compra)</option>';
    if (!purchaseId) return;
    try {
        const resp = await apiFetch(apiUrl('purchase-items', {per_page: 200, purchase_id: purchaseId}));
        if (!resp.ok) return;
        const data = await resp.json();
        const items = data.items || [];
        if (!items.length) return;
        items.forEach(it => {
            const opt = document.createElement('option');
            opt.value = it.id;
            opt.dataset.price = it.unit_price;
            const prod = it.product || {};
            const prodNum = prod.product_number || '';
            const name = getProductName(prod.translations, langId) || '';
            const nameFmt = getFormattedProductName(prod.translations, langId) || '';
            opt.textContent = `${prodNum}${nameFmt ? ' - ' + nameFmt : ''}  x${it.quantity}  ${it.unit_price}€`;
            selectEl.appendChild(opt);
        });
        if (priceDisplayId && priceValueId) {
            updatePriceDisplay(selectEl, priceDisplayId, priceValueId);
        }
    } catch (e) { console.error(e); }
}

function updatePriceDisplay(selectEl, displayId, valueId, purchaseId) {
    const display = document.getElementById(displayId);
    const valueEl = document.getElementById(valueId);
    if (!display || !valueEl) return;
    const selected = selectEl.options[selectEl.selectedIndex];
    if (selected && selected.dataset.price) {
        display.style.display = 'block';
        valueEl.textContent = parseFloat(selected.dataset.price).toFixed(2) + '\u20AC';
    } else if (purchaseId) {
        const cache = entryPurchasesCache.length ? entryPurchasesCache : addInvPurchasesCache;
        const pur = cache.find(p => p.id === purchaseId);
        if (pur && pur.total_amount) {
            display.style.display = 'block';
            valueEl.textContent = parseFloat(pur.total_amount).toFixed(2) + '\u20AC (total compra)';
            return;
        }
        display.style.display = 'none';
    } else {
        display.style.display = 'none';
    }
}

async function openEntryModal(invId) {
    document.getElementById('modalInventoryId').value = invId || '';
    document.getElementById('entryQuantity').value = '1';
    document.getElementById('entryNote').value = '';
    document.getElementById('entrySealed').checked = false;
    document.getElementById('entryInstagram').checked = false;
    document.getElementById('entryPurchase').value = '';
    entrySelectedPurchaseId = null;
    const entryPriceDisplay = document.getElementById('entryPriceDisplay');
    if (entryPriceDisplay) entryPriceDisplay.style.display = 'none';
    entrySelectedPurchaseItemId = null;
    const entryPurchaseItem = document.getElementById('entryPurchaseItem');
    if (entryPurchaseItem) { entryPurchaseItem.value = ''; }
    const gs = document.getElementById('entryGoogleSearch');
    if (gs) gs.innerHTML = '';
    const tc = document.getElementById('entryTrackers');
    if (tc) tc.innerHTML = '';
    closeEntryPurchaseSuggestions();
    try {
        const [langResp, condResp, purResp, tagsResp] = await Promise.all([
            apiFetch(apiUrl('languages', {per_page: 200})),
            apiFetch(apiUrl('product-conditions', {per_page: 200})),
            apiFetch(apiUrl('purchases', {per_page: 200})),
            apiFetch(apiUrl('tags', {per_page: 200}))
        ]);
        if (tagsResp.ok) {
            const data = await tagsResp.json();
            allTagsCache = data.items || [];
        }
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
        if (purResp.ok) {
            const data = await purResp.json();
            entryPurchasesCache = data.items || [];
        }
    } catch (e) { console.error(e); }
    if (invId) {
        try {
            const resp = await apiFetch(apiUrl(`inventory/${invId}`));
            if (resp.ok) {
                const item = await resp.json();
                const prod = item.product || {}; const col = item.collection || {};
                const lang = item.language || {}; const cond = item.condition || {}; const pur = item.purchase || {};
                const prodName = getProductName(prod.translations, lang.id);
                const prodNameFmt = getFormattedProductName(prod.translations, lang.id);
                const codeNum = esc(col.code || '-') + (prod.product_number ? ' ' + esc(prod.product_number) : '');
                document.getElementById('entryCollectionDisplay').textContent = esc(col.code || col.name || '-');
                document.getElementById('entryProductDisplay').innerHTML = `<span style="color:var(--muted)">(${codeNum})</span> ${prodNameFmt ? `<strong>${prodNameFmt}</strong>` : '<em style="color:var(--muted)">(sin nombre)</em>'}`;
                const ctShort = prod.product_type ? (prod.product_type.short_name || '') : (item.extra_type ? (item.extra_type.short_name || '') : '');
                const lAbbr = lang.abbreviation || '';
                const cName = (prodName || 'unknown').replace(/[^a-zA-Z0-9\u00C0-\u024F\s-]/g, '').trim().replace(/\s+/g, '_').substring(0, 40);
                document.getElementById('entryInvCode').textContent = `${ctShort}/${col.code || '-'}/${invId}_${lAbbr}_${cName}`;
                // Google search button
                const searchParts = [prodName, prod.product_number, col.code].filter(Boolean).join(' ');
                const searchQ = searchParts ? encodeURIComponent(searchParts) : '';
                const gs = document.getElementById('entryGoogleSearch');
                if (gs) gs.innerHTML = searchQ ? `<a class="google-search-btn" href="https://www.google.com/search?q=${searchQ}" target="_blank" rel="noopener" title="Buscar en Google">Buscar en Google</a>` : '';
                // Price trackers
                const trackersContainer = document.getElementById('entryTrackers');
                if (trackersContainer && prod.id) {
                    const fmtDate = (d) => d ? d.slice(0, 10) : '-';
                    const fmtPrice = (p) => p != null ? parseFloat(p).toFixed(2) + '\u20AC' : '-';
                    Promise.all([
                        apiFetch(apiUrl('product-price-tracking', {per_page: 200, product_id: prod.id})).then(r => r.ok ? r.json() : {items: []}),
                        apiFetch(apiUrl('inventory-price-history', {per_page: 200, inventory_id: invId})).then(r => r.ok ? r.json() : {items: []})
                    ]).then(([trackerData, priceData]) => {
                        const trackers = trackerData.items || [];
                        if (!trackers.length) { trackersContainer.innerHTML = '<span style="color:var(--muted)">Sin trackers</span>'; return; }
                        const prices = (priceData.items || []).reduce((acc, p) => {
                            if (!acc[p.product_price_tracking_id] || p.id > acc[p.product_price_tracking_id].id) {
                                acc[p.product_price_tracking_id] = p;
                            }
                            return acc;
                        }, {});
                        trackersContainer.innerHTML = trackers.map(t => {
                            let url = t.url;
                            const ps = t.price_source || {};
                            if (ps.language_param && lang.cardmarket_code) {
                                const sep = url.includes('?') ? '&' : '?';
                                url += sep + ps.language_param + '=' + encodeURIComponent(lang.cardmarket_code);
                            }
                            if (ps.condition_param && cond.cardmarket_code) {
                                const sep = url.includes('?') ? '&' : '?';
                                url += sep + ps.condition_param + '=' + encodeURIComponent(cond.cardmarket_code);
                            }
                            const p = prices[t.id];
                            const priceHtml = p ? `<div style="font-size:12px;color:var(--muted);margin-top:2px;line-height:1.5">
                                <span>Actual: <strong>${fmtPrice(p.price)}</strong> (${fmtDate(p.recorded_at)})</span>
                                <span style="margin-left:10px">Mín: ${fmtPrice(p.min_price)} (${fmtDate(p.min_price_recorded_at)})</span>
                                <span style="margin-left:10px">Máx: ${fmtPrice(p.max_price)} (${fmtDate(p.max_price_recorded_at)})</span>
                            </div>` : '<div style="font-size:12px;color:var(--muted);margin-top:2px">Sin precios</div>';
                            return `<div><div class="detail-row" style="border-bottom:none!important"><a href="${esc(url)}" target="_blank" rel="noopener">${esc(url)}</a>${ps.name ? ' <span class="detail-meta">(' + esc(ps.name) + ')</span>' : ''}</div>${priceHtml}</div>`;
                        }).join('');
                    }).catch(() => { trackersContainer.innerHTML = ''; });
                } else if (trackersContainer) {
                    trackersContainer.innerHTML = '<span style="color:var(--muted)">Sin trackers</span>';
                }
                document.getElementById('entryQuantity').value = item.quantity ?? 1;
                document.getElementById('entryLang').value = lang.id || '';
                document.getElementById('entryCondition').value = cond.id || '';
                document.getElementById('entrySealed').checked = !!item.is_sealed;
                document.getElementById('entryInstagram').checked = !!item.posted_instagram;
                document.getElementById('entryNote').value = item.notes || '';
                if (pur.id) {
                    entrySelectedPurchaseId = pur.id;
                    const purDate = (pur.purchase_date || '').slice(0,10);
                    const purEntity = (pur.entity && pur.entity.name) || '';
                    document.getElementById('entryPurchase').value = purDate ? `${purDate} - ${purEntity}` : purEntity || 'Compra #' + pur.id;
                    const purItem = item.purchase_item;
                    entrySelectedPurchaseItemId = purItem ? purItem.id : null;
                    const entryPurchaseItem = document.getElementById('entryPurchaseItem');
                    if (entrySelectedPurchaseItemId) {
                        loadPurchaseItems(entrySelectedPurchaseId, entryPurchaseItem, 'entryPriceDisplay', 'entryPriceValue', lang.id).then(() => {
                            if (entryPurchaseItem) entryPurchaseItem.value = entrySelectedPurchaseItemId;
                        });
                    } else if (entrySelectedPurchaseId) {
                        updatePriceDisplay(entryPurchaseItem, 'entryPriceDisplay', 'entryPriceValue', entrySelectedPurchaseId);
                    }
                }
                const tags = item.tags || [];
                const tagsContainer = document.getElementById('entryTags');
                if (tagsContainer) {
                    tagsContainer.innerHTML = tags.map(t => renderEntryTagBadge(t, invId)).join('');
                }
                loadInventoryFiles(invId);
                loadInventoryUrls(invId);
            }
        } catch (e) { console.error('Error loading inventory entry', e); }
    } else {
        document.getElementById('entryPhotos').innerHTML = '';
        const tagsContainer = document.getElementById('entryTags');
        if (tagsContainer) tagsContainer.innerHTML = '';
    }
    const urlContainer = document.getElementById('entryUrls');
    if (urlContainer && !invId) urlContainer.innerHTML = '';
    document.getElementById('entryUrlInput').value = '';
    document.getElementById('entryUrlNameInput').value = '';
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
        const purchaseItemEl = document.getElementById('entryPurchaseItem');
        const purchaseItemId = purchaseItemEl ? (purchaseItemEl.value || null) : null;
        const payload = {
            quantity: quantity,
            ...(languageId ? {language_id: parseInt(languageId)} : {language_id: null}),
            ...(conditionId ? {condition_id: parseInt(conditionId)} : {condition_id: null}),
            purchase_id: entrySelectedPurchaseId,
            purchase_item_id: purchaseItemId ? parseInt(purchaseItemId) : null,
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

// Entry purchase autocomplete
const entryPurchaseInput = document.getElementById('entryPurchase');
const entryPurchaseSuggestions = document.getElementById('entryPurchaseSuggestions');
let entryPurSearchTimeout;
entryPurchaseInput.addEventListener('input', () => {
    clearTimeout(entryPurSearchTimeout);
    entrySelectedPurchaseId = null;
    const q = entryPurchaseInput.value.trim().toLowerCase();
    if (q.length < 1) { closeEntryPurchaseSuggestions(); return; }
    entryPurSearchTimeout = setTimeout(() => searchEntryPurchases(q), 200);
});
entryPurchaseInput.addEventListener('blur', () => {
    setTimeout(closeEntryPurchaseSuggestions, 200);
});
function searchEntryPurchases(q) {
    const matching = entryPurchasesCache.filter(p => {
        const date = (p.purchase_date || '').slice(0, 10);
        const entity = (p.entity && p.entity.name) || '';
        return date.includes(q) || entity.toLowerCase().includes(q);
    });
    if (matching.length === 0) { closeEntryPurchaseSuggestions(); return; }
    showEntryPurchaseSuggestions(matching);
}
function showEntryPurchaseSuggestions(items) {
    closeEntryPurchaseSuggestions();
    entryPurchaseSuggestions.style.display = 'block';
    entryPurchaseSuggestions.innerHTML = items.map(p =>
        `<div class="suggestion-item" data-id="${p.id}" data-date="${(p.purchase_date || '').slice(0,10)}" data-entity="${esc((p.entity && p.entity.name) || '')}">${esc((p.purchase_date || '').slice(0,10))} - ${esc((p.entity && p.entity.name) || '?')}</div>`
    ).join('');
    entryPurchaseSuggestions.querySelectorAll('.suggestion-item').forEach(el => {
        el.addEventListener('click', () => {
            entryPurchaseInput.value = el.dataset.date + ' - ' + el.dataset.entity;
            entrySelectedPurchaseId = parseInt(el.dataset.id);
            entrySelectedPurchaseItemId = null;
            closeEntryPurchaseSuggestions();
            const entryLangVal = document.getElementById('entryLang').value;
            loadPurchaseItems(entrySelectedPurchaseId, document.getElementById('entryPurchaseItem'), null, null, entryLangVal || null);
        });
    });
}
function closeEntryPurchaseSuggestions() {
    if (entryPurchaseSuggestions) {
        entryPurchaseSuggestions.style.display = 'none';
        entryPurchaseSuggestions.innerHTML = '';
    }
}

// Entry tag management
const entryTagInput = document.getElementById('entryTagInput');
const entryTagAddBtn = document.getElementById('entryTagAddBtn');
const entryTagSuggestions = document.getElementById('entryTagSuggestions');
let entryTagSearchTimeout;
let allTagsCache = [];

async function loadAllTags() {
    try {
        const resp = await apiFetch(apiUrl('tags', {per_page: 200}));
        if (resp.ok) {
            const data = await resp.json();
            allTagsCache = data.items || [];
        }
    } catch (e) { console.error(e); }
}

function getEntryInvId() {
    return document.getElementById('modalInventoryId').value;
}

function getEntryTagNames() {
    const container = document.getElementById('entryTags');
    if (!container) return [];
    return Array.from(container.querySelectorAll('.entry-tag-badge')).map(el => el.textContent.replace('\u00d7', '').trim());
}

if (entryTagInput) {
    entryTagInput.addEventListener('input', () => {
        clearTimeout(entryTagSearchTimeout);
        const q = entryTagInput.value.trim().toLowerCase();
        if (q.length < 1) { closeEntryTagSuggestions(); return; }
        entryTagSearchTimeout = setTimeout(() => searchEntryTags(q), 200);
    });
    entryTagInput.addEventListener('blur', () => setTimeout(closeEntryTagSuggestions, 200));
    entryTagInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            addEntryTagFromInput();
        }
    });
}

function searchEntryTags(q) {
    const existing = getEntryTagNames();
    const matching = allTagsCache.filter(t => !existing.includes(t.name) && t.name.toLowerCase().includes(q));
    if (matching.length === 0) {
        showEntryTagCreateSuggestion(q);
        return;
    }
    showEntryTagSuggestions(matching);
}

function showEntryTagSuggestions(items) {
    closeEntryTagSuggestions();
    const rect = entryTagInput.getBoundingClientRect();
    entryTagSuggestions.style.display = 'block';
    entryTagSuggestions.style.top = (rect.bottom + window.scrollY) + 'px';
    entryTagSuggestions.style.left = (rect.left + window.scrollX) + 'px';
    entryTagSuggestions.style.width = rect.width + 'px';
    entryTagSuggestions.innerHTML = items.map(t =>
        `<div class="suggestion-item" data-tag-id="${t.id}" data-tag-name="${esc(t.name)}" data-tag-color="${esc(t.color || '')}"><span class="tag-badge" style="display:inline-block;padding:1px 6px;border-radius:3px;font-size:11px;color:#fff;background:${esc(t.color || '#6c757d')}">${esc(t.name)}</span></div>`
    ).join('');
    entryTagSuggestions.querySelectorAll('.suggestion-item').forEach(el => {
        el.addEventListener('click', () => {
            const tagId = parseInt(el.dataset.tagId);
            const tagName = el.dataset.tagName;
            const tagColor = el.dataset.tagColor;
            entryTagInput.value = '';
            closeEntryTagSuggestions();
            addTagToEntry(tagId, tagName, tagColor);
        });
    });
}

function showEntryTagCreateSuggestion(q) {
    closeEntryTagSuggestions();
    const rect = entryTagInput.getBoundingClientRect();
    entryTagSuggestions.style.display = 'block';
    entryTagSuggestions.style.top = (rect.bottom + window.scrollY) + 'px';
    entryTagSuggestions.style.left = (rect.left + window.scrollX) + 'px';
    entryTagSuggestions.style.width = rect.width + 'px';
    entryTagSuggestions.innerHTML = `<div class="suggestion-item create-tag" data-tag-name="${esc(q)}"><em>Crear tag "${esc(q)}"</em></div>`;
    entryTagSuggestions.querySelector('.create-tag').addEventListener('click', async () => {
        const name = q;
        entryTagInput.value = '';
        closeEntryTagSuggestions();
        try {
            const resp = await apiFetch(apiUrl('tags'), {
                method: 'POST', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({name})
            });
            if (!resp.ok) { const t = await resp.text().catch(()=>null); alert('Error al crear tag: ' + (t || resp.status)); return; }
            const tag = await resp.json();
            allTagsCache.push(tag);
            addTagToEntry(tag.id, tag.name, tag.color);
        } catch (e) { console.error(e); alert('Error al crear tag'); }
    });
}

function closeEntryTagSuggestions() {
    if (entryTagSuggestions) {
        entryTagSuggestions.style.display = 'none';
        entryTagSuggestions.innerHTML = '';
    }
}

async function addTagToEntry(tagId, tagName, tagColor) {
    const invId = getEntryInvId();
    if (!invId) return;
    try {
        const resp = await apiFetch(apiUrl(`inventory/${invId}/tags`), {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({tag_id: tagId})
        });
        if (!resp.ok) { const t = await resp.text().catch(()=>null); alert('Error al añadir tag: ' + resp.status + ' ' + (t||'')); return; }
        const container = document.getElementById('entryTags');
        if (container) container.insertAdjacentHTML('beforeend', renderEntryTagBadge({id: tagId, name: tagName, color: tagColor}, invId));
    } catch (e) { console.error(e); alert('Error al añadir tag'); }
}

if (entryTagAddBtn) {
    entryTagAddBtn.addEventListener('click', addEntryTagFromInput);
}

function addEntryTagFromInput() {
    const q = entryTagInput.value.trim();
    if (!q) return;
    const existing = allTagsCache.find(t => t.name.toLowerCase() === q.toLowerCase());
    if (existing) {
        const currentTags = getEntryTagNames();
        if (currentTags.includes(existing.name)) { alert('Tag ya añadido'); return; }
        entryTagInput.value = '';
        closeEntryTagSuggestions();
        addTagToEntry(existing.id, existing.name, existing.color);
    } else {
        showEntryTagCreateSuggestion(q);
    }
}

// Delegated remove tag
document.addEventListener('click', (e) => {
    const removeBtn = e.target.closest('.btn-remove-tag');
    if (!removeBtn) return;
    e.preventDefault();
    const badge = removeBtn.closest('.entry-tag-badge');
    if (!badge) return;
    const tagId = parseInt(removeBtn.dataset.tagId);
    const invId = getEntryInvId();
    if (!invId || !tagId) return;
    if (!confirm('¿Eliminar este tag?')) return;
    apiFetch(apiUrl(`inventory/${invId}/tags/${tagId}`), {method: 'DELETE'}).then(resp => {
        if (resp.ok) badge.remove();
        else alert('Error al eliminar tag');
    }).catch(() => alert('Error al eliminar tag'));
});

// File helpers for inventory/purchase photos
async function loadInventoryFiles(invId) {
    const container = document.getElementById('entryPhotos');
    if (!container) return;
    container.innerHTML = '<span class="loading-state" style="padding:8px;font-size:13px">Cargando...</span>';
    try {
        const resp = await apiFetch(apiUrl(`files/by-inventory/${invId}`));
        if (!resp.ok) { container.innerHTML = ''; return; }
        const files = await resp.json();
        if (!files.length) { container.innerHTML = '<span style="color:var(--muted);font-size:13px">Sin fotos</span>'; return; }
        const token = window.localStorage.getItem(TOKEN_KEY) || '';
        const qs = token ? `?token=${encodeURIComponent(token)}` : '';
        container.innerHTML = files.map(f => {
            const url = apiUrl(`product-catalog/files/${f.id}/content`) + qs;
            return `<a href="${url}" target="_blank" rel="noopener"><img class="file-thumb" src="${url}" alt="${esc(f.original_name)}"></a>`;
        }).join('');
    } catch (e) { console.error(e); container.innerHTML = ''; }
}

async function loadPurchaseFiles(purId) {
    const container = document.getElementById('purPhotos');
    if (!container) return;
    container.innerHTML = '<span class="loading-state" style="padding:8px;font-size:13px">Cargando...</span>';
    try {
        const resp = await apiFetch(apiUrl(`files/by-purchase/${purId}`));
        if (!resp.ok) { container.innerHTML = ''; return; }
        const files = await resp.json();
        const images = files.filter(f => !f.file_type || f.file_type.name === 'image');
        if (!images.length) { container.innerHTML = '<span style="color:var(--muted);font-size:13px">Sin fotos</span>'; return; }
        const token = window.localStorage.getItem(TOKEN_KEY) || '';
        const qs = token ? `?token=${encodeURIComponent(token)}` : '';
        container.innerHTML = images.map(f => {
            const url = apiUrl(`product-catalog/files/${f.id}/content`) + qs;
            return `<a href="${url}" target="_blank" rel="noopener"><img class="file-thumb" src="${url}" alt="${esc(f.original_name)}"></a>`;
        }).join('');
    } catch (e) { console.error(e); container.innerHTML = ''; }
}

async function loadPurchaseDocs(purId) {
    const container = document.getElementById('purDocs');
    if (!container) return;
    container.innerHTML = '<span class="loading-state" style="padding:8px;font-size:13px">Cargando...</span>';
    try {
        const resp = await apiFetch(apiUrl(`files/by-purchase/${purId}`));
        if (!resp.ok) { container.innerHTML = ''; return; }
        const files = await resp.json();
        const docs = files.filter(f => f.file_type && f.file_type.name === 'document');
        if (!docs.length) { container.innerHTML = '<span style="color:var(--muted);font-size:13px">Sin documentos</span>'; return; }
        const token = window.localStorage.getItem(TOKEN_KEY) || '';
        const qs = token ? `?token=${encodeURIComponent(token)}` : '';
        container.innerHTML = docs.map(f => {
            const url = apiUrl(`product-catalog/files/${f.id}/content`) + qs;
            const size = f.file_size ? ` (${(f.file_size / 1024).toFixed(1)} KB)` : '';
            return `<div class="doc-item"><a href="${url}" target="_blank" rel="noopener">${esc(f.original_name)}</a><span class="doc-size">${size}</span></div>`;
        }).join('');
    } catch (e) { console.error(e); container.innerHTML = ''; }
}

async function uploadInventoryFile(invId, file) {
    const formData = new FormData();
    formData.append('inventory_id', invId);
    formData.append('file', file);
    try {
        const resp = await apiFetch(apiUrl('files/upload-inventory'), {method: 'POST', body: formData});
        if (!resp.ok) { const t = await resp.text().catch(()=>null); alert('Error al subir foto: ' + (t || resp.status)); return; }
        loadInventoryFiles(invId);
    } catch (e) { console.error(e); alert('Error al subir foto'); }
}

async function uploadPurchaseFile(purId, file) {
    const formData = new FormData();
    formData.append('purchase_id', purId);
    formData.append('file', file);
    try {
        const resp = await apiFetch(apiUrl('files/upload-purchase'), {method: 'POST', body: formData});
        if (!resp.ok) { const t = await resp.text().catch(()=>null); alert('Error al subir foto: ' + (t || resp.status)); return; }
        loadPurchaseFiles(purId);
    } catch (e) { console.error(e); alert('Error al subir foto'); }
}

async function uploadPurchaseDoc(purId, file) {
    const formData = new FormData();
    formData.append('purchase_id', purId);
    formData.append('file', file);
    formData.append('file_type', 'document');
    try {
        const resp = await apiFetch(apiUrl('files/upload-purchase'), {method: 'POST', body: formData});
        if (!resp.ok) { const t = await resp.text().catch(()=>null); alert('Error al subir documento: ' + (t || resp.status)); return; }
        loadPurchaseDocs(purId);
    } catch (e) { console.error(e); alert('Error al subir documento'); }
}

// Wire upload buttons
document.getElementById('entryUploadBtn')?.addEventListener('click', () => {
    document.getElementById('entryPhotoInput')?.click();
});
document.getElementById('entryPhotoInput')?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    const invId = document.getElementById('modalInventoryId').value;
    if (file && invId) uploadInventoryFile(invId, file);
    e.target.value = '';
});

async function loadInventoryUrls(invId) {
    const container = document.getElementById('entryUrls');
    if (!container) return;
    container.innerHTML = '<span class="loading-state" style="padding:4px 0;font-size:13px">Cargando...</span>';
    try {
        const resp = await apiFetch(apiUrl(`inventory-urls/by-inventory/${invId}`));
        if (!resp.ok) { container.innerHTML = ''; return; }
        const urls = await resp.json();
        if (!urls.length) { container.innerHTML = '<span style="color:var(--muted);font-size:13px">Sin URLs</span>'; return; }
        container.innerHTML = urls.map(u =>
            `<div class="detail-row" style="display:flex;align-items:center;gap:6px;padding:2px 0">
                <a href="${esc(u.url)}" target="_blank" rel="noopener" style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(u.name || u.url)}</a>
                <button type="button" class="btn-delete-url" data-url-id="${u.id}" title="Eliminar URL" style="background:none;border:none;color:var(--red);cursor:pointer;font-size:16px;line-height:1;padding:0 4px">&times;</button>
            </div>`
        ).join('');
        container.querySelectorAll('.btn-delete-url').forEach(btn => {
            btn.addEventListener('click', async () => {
                const urlId = btn.dataset.urlId;
                try {
                    const r = await apiFetch(apiUrl(`inventory-urls/${urlId}`), {method: 'DELETE'});
                    if (!r.ok) { const t = await r.text().catch(()=>null); alert('Error al eliminar URL: ' + (t || r.status)); return; }
                    loadInventoryUrls(invId);
                } catch (e) { console.error(e); alert('Error al eliminar URL'); }
            });
        });
    } catch (e) { console.error(e); container.innerHTML = ''; }
}

document.getElementById('entryUrlAddBtn')?.addEventListener('click', async () => {
    const invId = document.getElementById('modalInventoryId').value;
    const urlInput = document.getElementById('entryUrlInput');
    const nameInput = document.getElementById('entryUrlNameInput');
    const url = urlInput.value.trim();
    if (!invId || !url) return;
    try {
        const resp = await apiFetch(apiUrl('inventory-urls/'), {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({inventory_id: parseInt(invId), url, name: nameInput.value.trim() || null})
        });
        if (!resp.ok) { const t = await resp.text().catch(()=>null); alert('Error al añadir URL: ' + (t || resp.status)); return; }
        urlInput.value = '';
        nameInput.value = '';
        loadInventoryUrls(invId);
    } catch (e) { console.error(e); alert('Error al añadir URL'); }
});

document.getElementById('purUploadBtn')?.addEventListener('click', () => {
    document.getElementById('purPhotoInput')?.click();
});
document.getElementById('purPhotoInput')?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    const purId = document.getElementById('modalPurchaseId').value;
    if (file && purId) uploadPurchaseFile(purId, file);
    e.target.value = '';
});

document.getElementById('purUploadDocBtn')?.addEventListener('click', () => {
    document.getElementById('purDocInput')?.click();
});
document.getElementById('purDocInput')?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    const purId = document.getElementById('modalPurchaseId').value;
    if (file && purId) uploadPurchaseDoc(purId, file);
    e.target.value = '';
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
let addInvSelectedPurchaseItemId = null;

async function openAddInvModal() {
    document.getElementById('addInvProduct').value = '';
    delete document.getElementById('addInvProduct').dataset.productId;
    document.getElementById('addInvQty').value = '1';
    document.getElementById('addInvPurchase').value = '';
    addInvSelectedPurchaseId = null;
    addInvSelectedPurchaseItemId = null;
    const addInvPurchaseItem = document.getElementById('addInvPurchaseItem');
    if (addInvPurchaseItem) { addInvPurchaseItem.innerHTML = '<option value="">(seleccionar item de la compra)</option>'; addInvPurchaseItem.value = ''; }
    const addInvPriceDisplay = document.getElementById('addInvPriceDisplay');
    if (addInvPriceDisplay) addInvPriceDisplay.style.display = 'none';
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
        `<div class="suggestion-item" data-id="${item.product_id}" data-name="${esc(item.collection_code || '')} ${esc(item.product_number || '')}" data-collection="${esc(item.collection_code || '')}"><span style="color:var(--muted)">(${esc(item.collection_code || '-')} ${esc(item.product_number || '-')})</span> ${esc(item.product_name || '')}</div>`
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
            addInvSelectedPurchaseItemId = null;
            closeAddInvPurchaseSuggestions();
            const addInvLangVal = document.getElementById('addInvLang').value;
            const addInvPurchaseItem = document.getElementById('addInvPurchaseItem');
            loadPurchaseItems(addInvSelectedPurchaseId, addInvPurchaseItem, 'addInvPriceDisplay', 'addInvPriceValue', addInvLangVal || null);
            updatePriceDisplay(addInvPurchaseItem, 'addInvPriceDisplay', 'addInvPriceValue', addInvSelectedPurchaseId);
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
    const purchaseItemEl = document.getElementById('addInvPurchaseItem');
    const purchaseItemId = purchaseItemEl ? (purchaseItemEl.value || null) : null;
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
            ...(purchaseItemId ? {purchase_item_id: parseInt(purchaseItemId)} : {}),
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
    purBody.innerHTML = `<tr><td colspan="12" class="loading-state">Cargando compras...</td></tr>`;
    purEmpty.hidden = true;
}

function renderPurRow(item) {
    const itemsCount = (item.items || []).length;
    const total = item.total_amount || '0.00';
    const ship = item.shipping_cost || '0.00';
    const tracking = item.tracking_code || '-';
    const status = item.shipping_status ? item.shipping_status.name : '-';
    const company = item.shipping_company ? item.shipping_company.name : '-';
    const docIcon = item.has_docs
        ? `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle" title="Tiene documentos"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>`
        : '';
    const photoIcon = item.has_photos
        ? `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle" title="Tiene fotos"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>`
        : '';
    const delivery = item.delivery_date ? item.delivery_date.slice(0,10) : null;
    const dateHtml = `${esc(item.purchase_date ? item.purchase_date.slice(0,10) : '-')}${delivery ? ` <span style="font-size:9px;color:var(--text-muted)">/\u2009${esc(delivery)}</span>` : ''}`;
    return `<tr class="clickable-row" data-pur-id="${item.id}"><td>${dateHtml}</td><td>${esc(item.entity ? item.entity.name : '-')}</td><td>${esc(tracking)}</td><td>${esc(status)}</td><td>${esc(company)}</td><td>${total}</td><td>${ship}</td><td>${esc(item.currency || 'EUR')}</td><td>${itemsCount}</td><td style="text-align:center">${docIcon}</td><td style="text-align:center">${photoIcon}</td><td style="text-align:center"><button type="button" class="btn-delete-pur" data-pur-id="${item.id}" title="Eliminar" style="background:none;border:none;color:var(--red);cursor:pointer;font-size:18px;line-height:1;padding:2px 6px">&times;</button></td></tr>`;
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
        const params = {page: s.page, per_page: s.perPage, q: s.q};
        if (s.date_from) params.date_from = s.date_from;
        if (s.date_to) params.date_to = s.date_to;
        if (s.entity_id) params.entity_id = s.entity_id;
        if (s.shipping_status_id) params.shipping_status_id = s.shipping_status_id;
        if (s.shipping_company_id) params.shipping_company_id = s.shipping_company_id;
        const resp = await apiFetch(apiUrl('purchases', params));
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
    document.getElementById('purDeliveryDate').value = '';
    document.getElementById('purTotal').value = '';
    document.getElementById('purShipping').value = '';
    document.getElementById('purCurrency').value = 'EUR';
    document.getElementById('purRef').value = '';
    document.getElementById('purTracking').value = '';
    document.getElementById('purShippingStatus').value = '';
    document.getElementById('purShippingCompany').value = '';
    document.getElementById('purNotes').value = '';
    document.getElementById('purchaseItemsBody').innerHTML = '<tr class="empty-row"><td colspan="5" class="empty-state">Sin items</td></tr>';
    itemCounter = 0;
    try {
        const [entResp, typesResp] = await Promise.all([
            apiFetch(apiUrl('entities', {per_page: 200})),
            apiFetch(apiUrl('types', {per_page: 200}))
        ]);

        const [entData, typesData] = await Promise.all([
            entResp.ok ? entResp.json() : {items: []},
            typesResp.ok ? typesResp.json() : {items: []}
        ]);

        const allTypes = typesData.items || [];
        allEntities = entData.items || entData || [];

        // Populate entity dropdown (stores, platforms, persons)
        const sel = document.getElementById('purEntity');
        sel.innerHTML = '<option value="">Seleccionar...</option>';
        allEntities.slice().sort((a, b) => (a.name || '').localeCompare(b.name)).forEach(e => { const opt = document.createElement('option'); opt.value = e.id; opt.textContent = e.name; sel.appendChild(opt); });

        // Populate shipping company dropdown (entities with type 'shipping_company')
        const shipType = allTypes.find(t => t.type === 'entity' && t.name === 'shipping_company');
        const shippingCompanyTypeId = shipType ? shipType.id : null;
        const shipSel = document.getElementById('purShippingCompany');
        shipSel.innerHTML = '<option value="">Seleccionar...</option>';
        const shippingEntities = shippingCompanyTypeId
            ? allEntities.filter(e => e.entity_type === shippingCompanyTypeId)
            : [];
        shippingEntities.forEach(e => { const opt = document.createElement('option'); opt.value = e.id; opt.textContent = e.name; opt.dataset.url = e.url || ''; shipSel.appendChild(opt); });

        // Populate shipping status dropdown (p_status types)
        const statusSel = document.getElementById('purShippingStatus');
        statusSel.innerHTML = '<option value="">Seleccionar...</option>';
        allTypes.filter(t => t.type === 'p_status').forEach(t => {
            const opt = document.createElement('option'); opt.value = t.id; opt.textContent = t.name; statusSel.appendChild(opt);
        });

        // Wire up tracking button
        const purTracking = document.getElementById('purTracking');
        const purShipCompany = document.getElementById('purShippingCompany');
        const purTrackingBtn = document.getElementById('purTrackingBtn');
        function updateTrackingBtn() {
            const code = purTracking.value.trim();
            const opt = purShipCompany.options[purShipCompany.selectedIndex];
            const url = opt && opt.dataset.url;
            if (code && url) {
                purTrackingBtn.disabled = false;
                purTrackingBtn.dataset.url = url.replace('<SEGUIMIENTO>', encodeURIComponent(code));
            } else {
                purTrackingBtn.disabled = true;
                delete purTrackingBtn.dataset.url;
            }
        }
        purTracking.addEventListener('input', updateTrackingBtn);
        purShipCompany.addEventListener('change', updateTrackingBtn);
        purTrackingBtn.addEventListener('click', (e) => {
            e.preventDefault();
            const u = purTrackingBtn.dataset.url;
            if (u) window.open(u, '_blank', 'noopener');
        });
    } catch (e) { console.error('Error loading data', e); }
    if (purchaseId) {
        try {
            const resp = await apiFetch(apiUrl(`purchases/${purchaseId}`));
            if (resp.ok) {
                const p = await resp.json();
                document.getElementById('purDate').value = p.purchase_date ? p.purchase_date.slice(0,10) : '';
                document.getElementById('purDeliveryDate').value = p.delivery_date ? p.delivery_date.slice(0,10) : '';
                document.getElementById('purEntity').value = (p.entity && p.entity.id) || '';
                document.getElementById('purTotal').value = p.total_amount || '';
                document.getElementById('purShipping').value = p.shipping_cost || '';
                document.getElementById('purCurrency').value = p.currency || 'EUR';
                document.getElementById('purRef').value = p.external_reference || '';
                document.getElementById('purTracking').value = p.tracking_code || '';
                document.getElementById('purShippingStatus').value = (p.shipping_status && p.shipping_status.id) || '';
                document.getElementById('purShippingCompany').value = (p.shipping_company && p.shipping_company.id) || '';
                document.getElementById('purNotes').value = p.notes || '';
                const purDateCode = p.purchase_date ? p.purchase_date.slice(0, 10).replace(/-/g, '') : '????????';
                const purYear = purDateCode.slice(0, 4);
                const storeName = (p.entity ? p.entity.name : '-').replace(/[^a-zA-Z0-9\u00C0-\u024F\s]/g, '').trim().replace(/\s+/g, '_');
                document.getElementById('purComputedCode').textContent = `${purYear}/${purDateCode}_${purchaseId}_${storeName}`;
                if (typeof updateTrackingBtn === 'function') updateTrackingBtn();
                try {
                    const iresp = await apiFetch(apiUrl('purchase-items', {per_page: 200, purchase_id: purchaseId}));
                    if (iresp.ok) {
                        const idata = await iresp.json();
                        const items = idata.items || [];
                        document.getElementById('purchaseItemsBody').innerHTML = '';
                        for (const it of items) await addItemRow(it);
                        updatePurchaseTotal();
                    }
                } catch (e) { console.error(e); }
                loadPurchaseFiles(purchaseId);
                loadPurchaseDocs(purchaseId);
            }
        } catch (e) { console.error('Error loading purchase', e); }
    } else {
        document.getElementById('purPhotos').innerHTML = '';
        document.getElementById('purDocs').innerHTML = '';
        document.getElementById('purComputedCode').textContent = '';
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
        updatePurchaseTotal();
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
    updatePurchaseTotal();
}

function recalcItemTotal(ev) {
    const id = ev.target.dataset.itemId;
    const row = ev.target.closest('tr');
    const qty = parseInt(row.querySelector('.item-qty').value, 10) || 0;
    const price = parseFloat(row.querySelector('.item-price').value) || 0;
    row.querySelector('.item-total').textContent = (qty * price).toFixed(2);
    updatePurchaseTotal();
}

function updatePurchaseTotal() {
    const tbody = document.getElementById('purchaseItemsBody');
    const tfoot = document.getElementById('purchaseItemsFoot');
    if (!tfoot) return;
    const rows = tbody.querySelectorAll('tr:not(.empty-row)');
    if (rows.length === 0) {
        tfoot.style.display = 'none';
        return;
    }
    let total = 0;
    rows.forEach(tr => {
        total += parseFloat(tr.querySelector('.item-total').textContent) || 0;
    });
    tfoot.style.display = 'table-footer-group';
    document.getElementById('purchaseTotalAmount').textContent = total.toFixed(2);
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
        const code = item.collection_code || '';
        const num = item.product_number || '';
        const name = item.product_name || '';
        opt.innerHTML = `<span style="color:var(--muted)">(${esc(code || '-')} ${esc(num || '-')})</span> ${esc(name)}`;
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
    const deliveryDate = document.getElementById('purDeliveryDate').value;
    const entityId = document.getElementById('purEntity').value;
    const total = document.getElementById('purTotal').value;
    const shipping = document.getElementById('purShipping').value || '0';
    const currency = document.getElementById('purCurrency').value;
    const ref = document.getElementById('purRef').value.trim();
    const tracking = document.getElementById('purTracking').value.trim();
    const shippingStatusId = document.getElementById('purShippingStatus').value;
    const shippingCompanyId = document.getElementById('purShippingCompany').value;
    const notes = document.getElementById('purNotes').value.trim();
    if (!entityId) { alert('La tienda es obligatoria'); return; }
    const itemRows = document.querySelectorAll('#purchaseItemsBody tr:not(.empty-row)');
    const items = [];
    itemRows.forEach(tr => {
        const prodInput = tr.querySelector('.item-product');
        const qty = parseInt(tr.querySelector('.item-qty').value, 10) || 0;
        const price = parseFloat(tr.querySelector('.item-price').value) || 0;
        const productId = prodInput.dataset.productId;
        if (productId && qty > 0) items.push({_rowId: tr.dataset.itemId, product_id: parseInt(productId), quantity: qty, unit_price: price});
    });
    const btn = ev.target.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = 'Guardando...';
    try {
        let purResp;
        const payload = {
            entity_id: parseInt(entityId), purchase_date: date || null,
            delivery_date: deliveryDate || null,
            total_amount: total || null, shipping_cost: shipping, currency: currency,
            ...(ref ? {external_reference: ref} : {}),
            ...(tracking ? {tracking_code: tracking} : {}),
            ...(shippingStatusId ? {shipping_status_id: parseInt(shippingStatusId)} : {}),
            ...(shippingCompanyId ? {shipping_company_id: parseInt(shippingCompanyId)} : {}),
            ...(notes ? {notes: notes} : {})
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
        // Save items: update existing, delete removed, create new
        if (purchaseId) {
            const oldResp = await apiFetch(apiUrl('purchase-items', {per_page: 200, purchase_id: purchaseId}));
            if (oldResp.ok) {
                const oldData = await oldResp.json();
                const currentIds = new Set(items.filter(i => i._rowId && !i._rowId.startsWith('new_')).map(i => parseInt(i._rowId)));
                for (const oldItem of (oldData.items || [])) {
                    if (!currentIds.has(oldItem.id)) {
                        await apiFetch(apiUrl(`purchase-items/${oldItem.id}`), {method: 'DELETE'});
                    }
                }
            }
        }
        for (const item of items) {
            if (item._rowId && !item._rowId.startsWith('new_')) {
                await apiFetch(apiUrl(`purchase-items/${item._rowId}`), {
                    method: 'PATCH', headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({product_id: item.product_id, unit_price: item.unit_price, quantity: item.quantity})
                });
            } else {
                await apiFetch(apiUrl('purchase-items'), {
                    method: 'POST', headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({purchase_id: savedId, product_id: item.product_id, unit_price: item.unit_price, quantity: item.quantity})
                });
            }
        }
        closePurModal();
        loadPurchases({reset: true});
    } catch (e) { console.error(e); alert('Error al guardar'); }
    finally { btn.disabled = false; btn.textContent = 'Guardar compra'; }
});

// ==================== SCHEDULED TASKS (executions) ====================

const scheduledState = {
    page: 1, perPage: 50, pages: 0, total: 0, loaded: 0, loading: false, hasNext: true
};

const scheduledBody = document.getElementById('scheduledTasksBody');
const scheduledEmpty = document.getElementById('scheduledEmpty');
const scheduledSummary = document.getElementById('scheduledSummary');
const scheduledSentinel = document.getElementById('scheduledSentinel');

function renderScheduledLoading() {
    scheduledBody.innerHTML = `<tr><td colspan="7" class="loading-state">Cargando ejecuciones...</td></tr>`;
    scheduledEmpty.hidden = true;
}

const statusLabels = {
    pending: 'Pendiente', running: 'Ejecutando', completed: 'Completado', error: 'Error'
};

function renderScheduledRow(item) {
    const taskName = item.scheduled_task ? item.scheduled_task.name : (item.scheduled_task_id || '-');
    const status = item.status || '-';
    const label = statusLabels[status] || status;
    const cls = status === 'error' ? 'stock-negative' : (status === 'completed' ? 'stock-positive' : '');
    const scheduledDate = item.scheduled_date ? item.scheduled_date.slice(0, 16).replace('T', ' ') : '-';
    const startedAt = item.started_at ? item.started_at.slice(0, 16).replace('T', ' ') : '-';
    const finishedAt = item.finished_at ? item.finished_at.slice(0, 16).replace('T', ' ') : '-';
    const output = item.output ? item.output.slice(0, 80) + (item.output.length > 80 ? '...' : '') : '';
    return `<tr class="clickable-row" data-exec-id="${item.id}">
        <td><strong>${esc(taskName)}</strong></td>
        <td><span class="${cls}">${esc(label)}</span></td>
        <td>${scheduledDate}</td>
        <td>${startedAt}</td>
        <td>${finishedAt}</td>
        <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(output)}">${esc(output)}</td>
        <td style="text-align:center"><button type="button" class="btn-delete-scheduled" data-exec-id="${item.id}" title="Eliminar" style="background:none;border:none;color:var(--red);cursor:pointer;font-size:18px;line-height:1;padding:2px 6px">&times;</button></td>
    </tr>`;
}

function appendScheduled(items) {
    if (!items.length && scheduledState.loaded === 0) { scheduledBody.innerHTML = ''; scheduledEmpty.hidden = false; return; }
    scheduledEmpty.hidden = true;
    scheduledBody.insertAdjacentHTML('beforeend', items.map(renderScheduledRow).join(''));
}

function updateScheduledProgress() {
    const f = scheduledState.loaded ? 1 : 0;
    scheduledSummary.textContent = `${f}-${scheduledState.loaded} de ${scheduledState.total} ejecuciones`;
}

async function loadScheduledTasks({reset = false} = {}) {
    if (!appStarted) return;
    const s = scheduledState;
    if (s.loading || (!s.hasNext && !reset)) return;
    if (reset) { s.page = 1; s.pages = 0; s.total = 0; s.loaded = 0; s.hasNext = true; scheduledBody.innerHTML = ''; scheduledEmpty.hidden = true; renderScheduledLoading(); }
    s.loading = true;
    try {
        const params = {page: s.page, per_page: s.perPage};
        const resp = await apiFetch(apiUrl('task-executions', params));
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        const data = await resp.json();
        if (reset) scheduledBody.innerHTML = '';
        appendScheduled(data.items || []);
        s.pages = data.pagination.pages; s.total = data.pagination.total; s.hasNext = data.pagination.has_next;
        s.loaded += (data.items || []).length; s.page += 1;
        updateScheduledProgress();
        setTimeout(checkScheduledScroll, 50);
    } catch (e) {
        if (s.loaded === 0) { scheduledBody.innerHTML = ''; scheduledEmpty.hidden = false; }
        scheduledSummary.textContent = 'Error al cargar';
        s.hasNext = false;
    } finally {
        s.loading = false;
    }
}

function checkScheduledScroll() {
    if (scheduledState.loading || !scheduledState.hasNext) return;
    const r = scheduledSentinel.getBoundingClientRect();
    if (r.top <= window.innerHeight + 700) loadScheduledTasks();
}

const scheduledObs = new IntersectionObserver(entries => {
    if (!appStarted) return;
    if (entries.some(e => e.isIntersecting)) loadScheduledTasks();
}, {rootMargin: '640px 0px'});
if (scheduledSentinel) scheduledObs.observe(scheduledSentinel);

// Scheduled Task Execution modal
const scheduledModal = document.getElementById('scheduledTaskModal');
if (document.getElementById('scheduledBackdrop')) document.getElementById('scheduledBackdrop').addEventListener('click', closeScheduledModal);
if (document.getElementById('scheduledCancel')) document.getElementById('scheduledCancel').addEventListener('click', closeScheduledModal);

function closeScheduledModal() { scheduledModal.hidden = true; document.body.style.overflow = ''; }

document.getElementById('addScheduledTaskBtn').addEventListener('click', () => openScheduledTaskModal());

async function openScheduledTaskModal() {
    document.getElementById('scheduledModalTitle').textContent = 'Nueva ejecución';
    const nowLocal = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    document.getElementById('scheduledDateInput').value =
        `${nowLocal.getFullYear()}-${pad(nowLocal.getMonth()+1)}-${pad(nowLocal.getDate())}T${pad(nowLocal.getHours())}:${pad(nowLocal.getMinutes())}`;
    const select = document.getElementById('scheduledTaskSelect');
    select.innerHTML = '<option value="">Seleccionar...</option>';
    try {
        const resp = await apiFetch(apiUrl('scheduled-tasks', {per_page: 200}));
        if (resp.ok) {
            const data = await resp.json();
            (data.items || []).forEach(t => {
                const opt = document.createElement('option');
                opt.value = t.id;
                opt.textContent = t.name + (t.script_path ? ' (' + t.script_path + ')' : '');
                select.appendChild(opt);
            });
        }
    } catch (e) { console.error('Error loading tasks', e); }
    scheduledModal.hidden = false;
    document.body.style.overflow = 'hidden';
}

document.getElementById('scheduledTaskForm').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const taskId = document.getElementById('scheduledTaskSelect').value;
    const scheduledDate = document.getElementById('scheduledDateInput').value;
    if (!taskId) { alert('Selecciona una tarea'); return; }
    if (!scheduledDate) { alert('Selecciona fecha y hora'); return; }
    const btn = ev.target.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = 'Guardando...';
    try {
        const payload = {
            scheduled_task_id: parseInt(taskId),
            scheduled_date: scheduledDate + ':00',
            status: 'pending'
        };
        const resp = await apiFetch(apiUrl('task-executions'), {
            method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload)
        });
        if (!resp.ok) { const t = await resp.text().catch(()=>null); alert('Error al crear: ' + resp.status + ' ' + (t||'')); return; }
        closeScheduledModal();
        loadScheduledTasks({reset: true});
    } catch (e) { console.error(e); alert('Error al guardar'); }
    finally { btn.disabled = false; btn.textContent = 'Crear ejecución'; }
});

// Execution output modal
if (document.getElementById('execOutputBackdrop')) document.getElementById('execOutputBackdrop').addEventListener('click', () => { document.getElementById('execOutputModal').hidden = true; document.body.style.overflow = ''; });
if (document.getElementById('execOutputClose')) document.getElementById('execOutputClose').addEventListener('click', () => { document.getElementById('execOutputModal').hidden = true; document.body.style.overflow = ''; });

// ==================== COLLECTIONS ====================

const colState = {
    page: 1, perPage: 50, q: '', pages: 0, total: 0, loaded: 0, loading: false, hasNext: true,
    code: '', name: '', card_type_id: '', is_manual: '', force_download: '', sort: 'code'
};

const colBody = document.getElementById('collectionsBody');
const colEmpty = document.getElementById('colEmpty');
const colSummary = document.getElementById('colSummary');
const colSentinel = document.getElementById('colSentinel');

function renderColLoading() {
    colBody.innerHTML = `<tr><td colspan="7" class="loading-state">Cargando colecciones...</td></tr>`;
    colEmpty.hidden = true;
}

function renderColRow(item) {
    const cardType = item.card_type ? (item.card_type.name + (item.card_type.short_name ? ' (' + item.card_type.short_name + ')' : '')) : '-';
    const manual = item.is_manual ? '\u2713' : '';
    const releaseDate = item.release_date ? item.release_date.slice(0, 10) : '-';
    const forceDl = item.force_url ? (item.force_download ? '\u26A1' : '\u2139\uFE0F') : '';
    const displayName = formatName(item.name, item.name_alter) || '-';
    return `<tr class="clickable-row" data-col-id="${item.id}">
        <td><strong>${esc(item.code)}</strong></td>
        <td>${displayName}</td>
        <td>${esc(cardType)}</td>
        <td>${manual}</td>
        <td>${releaseDate}</td>
        <td style="text-align:center;font-size:16px" title="${item.force_url ? (item.force_download ? 'Descarga forzada pendiente' : 'URL asignada') : ''}">${forceDl}</td>
        <td style="text-align:center"><button type="button" class="btn-delete-col" data-col-id="${item.id}" title="Eliminar" style="background:none;border:none;color:var(--red);cursor:pointer;font-size:18px;line-height:1;padding:2px 6px">&times;</button></td>
    </tr>`;
}

function appendCol(items) {
    if (!items.length && colState.loaded === 0) { colBody.innerHTML = ''; colEmpty.hidden = false; return; }
    colEmpty.hidden = true;
    colBody.insertAdjacentHTML('beforeend', items.map(renderColRow).join(''));
}

function updateColProgress() {
    const f = colState.loaded ? 1 : 0;
    colSummary.textContent = `${f}-${colState.loaded} de ${colState.total} colecciones`;
}

async function loadCollections({reset = false} = {}) {
    if (!appStarted) return;
    const s = colState;
    if (s.loading || (!s.hasNext && !reset)) return;
    if (reset) { s.page = 1; s.pages = 0; s.total = 0; s.loaded = 0; s.hasNext = true; colBody.innerHTML = ''; colEmpty.hidden = true; renderColLoading(); }
    s.loading = true;
    try {
        const params = {page: s.page, per_page: s.perPage};
        if (s.q) params.q = s.q;
        if (s.code) params.code = s.code;
        if (s.name) params.name = s.name;
        if (s.card_type_id) params.card_type_id = s.card_type_id;
        if (s.is_manual !== null && s.is_manual !== '') params.is_manual = s.is_manual;
        if (s.force_download !== null && s.force_download !== '') params.force_download = s.force_download;
        if (s.sort) params.sort_by = s.sort;
        const resp = await apiFetch(apiUrl('collections', params));
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        const data = await resp.json();
        if (reset) colBody.innerHTML = '';
        appendCol(data.items);
        s.pages = data.pagination.pages; s.total = data.pagination.total; s.hasNext = data.pagination.has_next;
        s.loaded += data.items.length; s.page += 1;
        updateColProgress();
        setTimeout(checkColScroll, 50);
        attachColListeners();
    } catch (e) {
        if (s.loaded === 0) { colBody.innerHTML = ''; colEmpty.hidden = false; }
        colSummary.textContent = 'Error al cargar';
        s.hasNext = false;
    } finally {
        s.loading = false;
    }
}

function attachColListeners() {
}

function checkColScroll() {
    if (colState.loading || !colState.hasNext) return;
    const r = colSentinel.getBoundingClientRect();
    if (r.top <= window.innerHeight + 700) loadCollections();
}

const colObs = new IntersectionObserver(entries => {
    if (!appStarted) return;
    if (entries.some(e => e.isIntersecting)) loadCollections();
}, {rootMargin: '640px 0px'});
if (colSentinel) colObs.observe(colSentinel);

// Collection modal
const colModal = document.getElementById('collectionModal');
if (document.getElementById('colBackdrop')) document.getElementById('colBackdrop').addEventListener('click', closeColModal);
if (document.getElementById('colCancel')) document.getElementById('colCancel').addEventListener('click', closeColModal);

function closeColModal() { colModal.hidden = true; document.body.style.overflow = ''; }

document.getElementById('addCollectionBtn').addEventListener('click', () => openCollectionModal(null));

let colTranslations = [];

async function openCollectionModal(collectionId) {
    document.getElementById('modalCollectionId').value = collectionId || '';
    document.getElementById('colModalTitle').textContent = collectionId ? 'Editar colecci\u00f3n' : 'Nueva colecci\u00f3n';
    document.getElementById('colCode').value = '';
    document.getElementById('colManual').checked = true;
    document.getElementById('colReleaseDate').value = '';
    document.getElementById('colForceUrl').value = '';
    document.getElementById('colForceDownload').checked = false;
    colTranslations = [];
    renderColTranslations();

    try {
        const [typesResp, langsResp] = await Promise.all([
            apiFetch(apiUrl('types', {per_page: 200})),
            apiFetch(apiUrl('languages', {per_page: 200}))
        ]);
        if (typesResp.ok) {
            const data = await typesResp.json();
            const types = data.items || [];
            const cardTypes = types.filter(t => t.type === 'card');
            const sel = document.getElementById('colCardType');
            sel.innerHTML = '<option value="">Seleccionar...</option>';
            cardTypes.forEach(t => {
                const opt = document.createElement('option');
                opt.value = t.id; opt.textContent = t.name + (t.short_name ? ' (' + t.short_name + ')' : '');
                sel.appendChild(opt);
            });
        }
        if (langsResp.ok) {
            const data = await langsResp.json();
            const langs = data.items || [];
            const sel = document.getElementById('colTransLang');
            sel.innerHTML = '<option value="">Idioma...</option>';
            langs.forEach(l => {
                const opt = document.createElement('option');
                opt.value = l.id; opt.textContent = l.name;
                sel.appendChild(opt);
            });
        }
    } catch (e) { console.error('Error loading data', e); }

    if (collectionId) {
        try {
            const resp = await apiFetch(apiUrl(`collections/${collectionId}`));
            if (resp.ok) {
                const col = await resp.json();
                document.getElementById('colCode').value = col.code || '';
                document.getElementById('colManual').checked = !!col.is_manual;
                document.getElementById('colReleaseDate').value = col.release_date ? col.release_date.slice(0, 10) : '';
                document.getElementById('colForceUrl').value = col.force_url || '';
                document.getElementById('colForceDownload').checked = !!col.force_download;
                const cardTypeEl = document.getElementById('colCardType');
                if (col.card_type_id) cardTypeEl.value = col.card_type_id;
                else if (col.card_type && col.card_type.id) cardTypeEl.value = col.card_type.id;
            }
            // load translations
            const transResp = await apiFetch(apiUrl('collection-translations', {page: 1, per_page: 200, collection_id: collectionId}));
            if (transResp.ok) {
                const transData = await transResp.json();
                colTranslations = (transData.items || []).map(t => ({
                    id: t.id,
                    language_id: t.language_id,
                    language_name: t.language ? t.language.name : 'ID ' + t.language_id,
                    name: t.name,
                    name_alter: t.name_alter
                }));
                renderColTranslations();
            }
        } catch (e) { console.error('Error loading collection', e); }
    }
    colModal.hidden = false;
    document.body.style.overflow = 'hidden';
    setTimeout(() => document.getElementById('colCode').focus(), 50);
}

function renderColTranslations() {
    const container = document.getElementById('colTransList');
    if (colTranslations.length === 0) {
        container.innerHTML = '<div class="empty-state" style="padding:8px;font-size:13px">Sin traducciones</div>';
        return;
    }
    container.innerHTML = colTranslations.map((t, i) =>
        `<div class="trans-item" data-trans-index="${i}">
            <span class="trans-lang">${esc(t.language_name)}</span>
            <span class="trans-name">${formatName(t.name, t.name_alter)}</span>
            <button type="button" class="btn-delete-trans" data-trans-index="${i}" title="Eliminar traduccion">
                <svg viewBox="0 0 24 24" aria-hidden="true" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
            </button>
        </div>`
    ).join('');
    container.querySelectorAll('.btn-delete-trans').forEach(btn => {
        btn.addEventListener('click', () => {
            const idx = parseInt(btn.dataset.transIndex);
            colTranslations.splice(idx, 1);
            renderColTranslations();
        });
    });
}

document.getElementById('addColTransBtn').addEventListener('click', () => {
    const langId = document.getElementById('colTransLang').value;
    const name = document.getElementById('colTransName').value.trim();
    if (!langId || !name) { alert('Selecciona idioma y escribe un nombre'); return; }
    const langName = document.getElementById('colTransLang').selectedOptions[0].textContent;
    colTranslations.push({language_id: parseInt(langId), language_name: langName, name: name});
    document.getElementById('colTransName').value = '';
    renderColTranslations();
});

document.getElementById('collectionForm').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const collectionId = document.getElementById('modalCollectionId').value;
    const code = document.getElementById('colCode').value.trim();
    const cardTypeId = document.getElementById('colCardType').value;
    const isManual = document.getElementById('colManual').checked;
    const releaseDate = document.getElementById('colReleaseDate').value;
    if (!code) { alert('El c\u00f3digo es obligatorio'); return; }
    if (!cardTypeId) { alert('Selecciona un tipo de carta'); return; }
    const btn = ev.target.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = 'Guardando...';
    try {
        const forceUrl = document.getElementById('colForceUrl').value.trim();
        const forceDownload = document.getElementById('colForceDownload').checked;
        const payload = {
            code: code,
            card_type_id: parseInt(cardTypeId),
            is_manual: isManual,
            ...(releaseDate ? {release_date: releaseDate} : {}),
            force_url: forceUrl || null,
            force_download: forceDownload
        };
        let savedCol;
        if (collectionId) {
            const resp = await apiFetch(apiUrl(`collections/${collectionId}`), {
                method: 'PATCH', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(payload)
            });
            if (!resp.ok) { const t = await resp.text().catch(()=>null); alert('Error al actualizar: ' + resp.status + ' ' + (t||'')); return; }
            savedCol = await resp.json();
        } else {
            const resp = await apiFetch(apiUrl('collections'), {
                method: 'POST', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(payload)
            });
            if (!resp.ok) { const t = await resp.text().catch(()=>null); alert('Error al crear: ' + resp.status + ' ' + (t||'')); return; }
            savedCol = await resp.json();
        }

        // Sync translations
        const savedId = savedCol.id;
        const oldTransResp = await apiFetch(apiUrl('collection-translations', {page: 1, per_page: 200, collection_id: savedId}));
        if (oldTransResp.ok) {
            const oldData = await oldTransResp.json();
            for (const ot of (oldData.items || [])) {
                await apiFetch(apiUrl(`collection-translations/${ot.id}`), {method: 'DELETE'});
            }
        }
        for (const t of colTranslations) {
            await apiFetch(apiUrl('collection-translations'), {
                method: 'POST', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({collection_id: savedId, language_id: t.language_id, name: t.name})
            });
        }

        closeColModal();
        loadCollections({reset: true});
    } catch (e) { console.error(e); alert('Error al guardar'); }
    finally { btn.disabled = false; btn.textContent = 'Guardar'; }
});

// Collection filter wiring
let colFilterTimers = {};

function setupColFilters() {
    const codeInput = document.getElementById('colFilterCode');
    const nameInput = document.getElementById('colFilterName');
    const typeSelect = document.getElementById('colFilterType');
    const manualSelect = document.getElementById('colFilterManual');

    if (codeInput) {
        codeInput.addEventListener('input', () => {
            clearTimeout(colFilterTimers.code);
            colFilterTimers.code = setTimeout(() => {
                colState.code = codeInput.value.trim();
                loadCollections({reset: true});
            }, 300);
        });
    }
    if (nameInput) {
        nameInput.addEventListener('input', () => {
            clearTimeout(colFilterTimers.name);
            colFilterTimers.name = setTimeout(() => {
                colState.name = nameInput.value.trim();
                loadCollections({reset: true});
            }, 300);
        });
    }
    if (typeSelect) {
        typeSelect.addEventListener('change', () => {
            colState.card_type_id = typeSelect.value;
            loadCollections({reset: true});
        });
    }
    if (manualSelect) {
        manualSelect.addEventListener('change', () => {
            colState.is_manual = manualSelect.value;
            loadCollections({reset: true});
        });
    }
    const forceDlSelect = document.getElementById('colFilterForceDl');
    if (forceDlSelect) {
        forceDlSelect.addEventListener('change', () => {
            colState.force_download = forceDlSelect.value;
            loadCollections({reset: true});
        });
    }
    const sortSelect = document.getElementById('colSortOrder');
    if (sortSelect) {
        sortSelect.addEventListener('change', () => {
            colState.sort = sortSelect.value;
            loadCollections({reset: true});
        });
    }
}

async function loadColFilterTypes() {
    const sel = document.getElementById('colFilterType');
    if (!sel) return;
    try {
        const resp = await apiFetch(apiUrl('types', {per_page: 200}));
        if (resp.ok) {
            const data = await resp.json();
            const types = data.items || [];
            const cardTypes = types.filter(t => t.type === 'card');
            sel.innerHTML = '<option value="">Todos</option>';
            cardTypes.forEach(t => {
                const opt = document.createElement('option');
                opt.value = t.id;
                opt.textContent = t.name + (t.short_name ? ' (' + t.short_name + ')' : '');
                sel.appendChild(opt);
            });
        }
    } catch (e) { console.error('Error loading types', e); }
}

setupInvFilters();
loadInvFilterTypes();
setupColFilters();
loadColFilterTypes();

// ==================== EVENTS & INIT ====================

// Tab click on collections rows
document.getElementById('tabCollections').addEventListener('click', async (e) => {
    const delBtn = e.target.closest('.btn-delete-col');
    if (delBtn) {
        e.stopPropagation();
        if (!confirm('\u00bfEliminar esta colecci\u00f3n?')) return;
        const colId = delBtn.dataset.colId;
        const resp = await apiFetch(apiUrl(`collections/${colId}`), {method: 'DELETE'});
        if (resp && resp.ok) {
            delBtn.closest('tr').remove();
            colState.loaded -= 1; colState.total -= 1;
            updateColProgress();
        } else {
            const msg = resp ? (await resp.json().catch(() => null))?.message || 'Error al eliminar' : 'Error de red';
            alert(msg);
        }
        return;
    }
    const row = e.target.closest('tr.clickable-row[data-col-id]');
    if (row) openCollectionModal(row.dataset.colId);
});

// Tab click on inventory rows
document.getElementById('tabInventory').addEventListener('click', async (e) => {
    const delBtn = e.target.closest('.btn-delete-inv');
    if (delBtn) {
        e.stopPropagation();
        if (!confirm('\u00bfEliminar este registro de inventario?')) return;
        const invId = delBtn.dataset.invId;
        const resp = await apiFetch(apiUrl(`inventory/${invId}`), {method: 'DELETE'});
        if (resp && resp.ok) {
            delBtn.closest('tr').remove();
            invState.loaded -= 1; invState.total -= 1;
            updateInvProgress();
        } else {
            const msg = resp ? await resp.text().catch(() => 'Error al eliminar') : 'Error de red';
            alert(msg);
        }
        return;
    }
    const row = e.target.closest('tr.clickable-row[data-inv-id]');
    if (row) openEntryModal(row.dataset.invId);
});

document.getElementById('tabScheduledTasks').addEventListener('click', async (e) => {
    const delBtn = e.target.closest('.btn-delete-scheduled');
    if (delBtn) {
        e.stopPropagation();
        if (!confirm('\u00bfEliminar esta ejecuci\u00f3n?')) return;
        const execId = delBtn.dataset.execId;
        const resp = await apiFetch(apiUrl(`task-executions/${execId}`), {method: 'DELETE'});
        if (resp && resp.ok) {
            delBtn.closest('tr').remove();
            scheduledState.loaded -= 1; scheduledState.total -= 1;
            updateScheduledProgress();
        } else {
            const msg = resp ? await resp.text().catch(() => 'Error al eliminar') : 'Error de red';
            alert(msg);
        }
        return;
    }
    const row = e.target.closest('tr.clickable-row[data-exec-id]');
    if (row) {
        const execId = row.dataset.execId;
        try {
            const resp = await apiFetch(apiUrl(`task-executions/${execId}`));
            if (resp.ok) {
                const exec = await resp.json();
                document.getElementById('execOutputTitle').textContent = 'Salida de ejecuci\u00f3n #' + execId;
                document.getElementById('execOutputText').value = exec.output || '(sin salida)';
                const logBtn = document.getElementById('execOutputViewLog');
                const logStatus = document.getElementById('execLogStatus');
                logBtn.style.display = exec.log_file_path ? '' : 'none';
                logStatus.textContent = '';
                logBtn.dataset.execId = execId;
                const m = document.getElementById('execOutputModal');
                m.hidden = false;
                document.body.style.overflow = 'hidden';
            }
        } catch (e) { console.error(e); }
    }
});

document.getElementById('execOutputViewLog').addEventListener('click', async () => {
    const execId = document.getElementById('execOutputViewLog').dataset.execId;
    if (!execId) return;
    const logStatus = document.getElementById('execLogStatus');
    logStatus.textContent = 'Cargando...';
    try {
        const resp = await apiFetch(apiUrl(`task-executions/${execId}/log`));
        if (resp.ok) {
            const data = await resp.json();
            const textarea = document.getElementById('execOutputText');
            textarea.value = data.content || '(log vac\u00edo)';
            textarea.scrollTop = textarea.scrollHeight;
            logStatus.textContent = 'Log completo cargado';
        } else {
            logStatus.textContent = 'Error al cargar log';
        }
    } catch (e) {
        logStatus.textContent = 'Error de red';
        console.error(e);
    }
});

document.getElementById('tabPurchases').addEventListener('click', async (e) => {
    const delBtn = e.target.closest('.btn-delete-pur');
    if (delBtn) {
        e.stopPropagation();
        if (!confirm('\u00bfEliminar esta compra?')) return;
        const purId = delBtn.dataset.purId;
        const resp = await apiFetch(apiUrl(`purchases/${purId}`), {method: 'DELETE'});
        if (resp && resp.ok) {
            delBtn.closest('tr').remove();
            purState.loaded -= 1; purState.total -= 1;
            updatePurProgress();
        } else {
            const msg = resp ? await resp.text().catch(() => 'Error al eliminar') : 'Error de red';
            alert(msg);
        }
        return;
    }
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
    colState.q = q;
    loadTab(currentTab);
});

// Filters (products)
let prodFilterTimers = {};

function setupProdFilters() {
    const colCodeInput = document.getElementById('filterColCode');
    const prodNumInput = document.getElementById('filterProdNumber');
    const prodNameInput = document.getElementById('filterProdName');
    const prodTypeSelect = document.getElementById('filterProdType');
    const filterManualEl = document.getElementById('filterManual');
    const filterVerifiedEl = document.getElementById('filterVerified');

    if (colCodeInput) {
        colCodeInput.addEventListener('input', () => {
            clearTimeout(prodFilterTimers.colCode);
            prodFilterTimers.colCode = setTimeout(() => {
                prodState.collection_code = colCodeInput.value.trim();
                loadProducts({reset: true});
            }, 300);
        });
    }
    if (prodNumInput) {
        prodNumInput.addEventListener('input', () => {
            clearTimeout(prodFilterTimers.prodNum);
            prodFilterTimers.prodNum = setTimeout(() => {
                prodState.product_number = prodNumInput.value.trim();
                loadProducts({reset: true});
            }, 300);
        });
    }
    if (prodNameInput) {
        prodNameInput.addEventListener('input', () => {
            clearTimeout(prodFilterTimers.prodName);
            prodFilterTimers.prodName = setTimeout(() => {
                prodState.product_name = prodNameInput.value.trim();
                loadProducts({reset: true});
            }, 300);
        });
    }
    if (prodTypeSelect) {
        prodTypeSelect.addEventListener('change', () => {
            prodState.product_type_id = prodTypeSelect.value;
            loadProducts({reset: true});
        });
    }
    if (filterManualEl) {
        filterManualEl.addEventListener('change', (e) => {
            prodState.is_manual = e.target.value || null;
            loadProducts({reset: true});
        });
    }
    if (filterVerifiedEl) {
        filterVerifiedEl.addEventListener('change', (e) => {
            prodState.is_verified = e.target.value || null;
            loadProducts({reset: true});
        });
    }
}

async function loadProdFilterTypes() {
    const sel = document.getElementById('filterProdType');
    if (!sel) return;
    try {
        const resp = await apiFetch(apiUrl('types', {per_page: 200}));
        if (resp.ok) {
            const data = await resp.json();
            const types = data.items || [];
            const cardTypes = types.filter(t => t.type === 'card');
            sel.innerHTML = '<option value="">Todos</option>';
            cardTypes.forEach(t => {
                const opt = document.createElement('option');
                opt.value = t.id;
                opt.textContent = t.name + (t.short_name ? ' (' + t.short_name + ')' : '');
                sel.appendChild(opt);
            });
        }
    } catch (e) { console.error('Error loading types', e); }
}

setupProdFilters();
loadProdFilterTypes();

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
let invScrollTimer, purScrollTimer, colScrollTimer, scheduledScrollTimer;
window.addEventListener('scroll', () => {
    clearTimeout(invScrollTimer);
    invScrollTimer = setTimeout(() => { if (currentTab === 'inventory') checkInvScroll(); }, 80);
    clearTimeout(purScrollTimer);
    purScrollTimer = setTimeout(() => { if (currentTab === 'purchases') checkPurScroll(); }, 80);
    clearTimeout(colScrollTimer);
    colScrollTimer = setTimeout(() => { if (currentTab === 'collections') checkColScroll(); }, 80);
    clearTimeout(scheduledScrollTimer);
    scheduledScrollTimer = setTimeout(() => { if (currentTab === 'scheduledTasks') checkScheduledScroll(); }, 80);
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

// Inventory filters
let invFilterTimers = {};

function setupInvFilters() {
    const colCodeInput = document.getElementById('invFilterColCode');
    const numberInput = document.getElementById('invFilterNumber');
    const nameInput = document.getElementById('invFilterName');
    const typeSelect = document.getElementById('invFilterType');

    if (colCodeInput) {
        colCodeInput.addEventListener('input', () => {
            clearTimeout(invFilterTimers.colCode);
            invFilterTimers.colCode = setTimeout(() => {
                invState.collection_code = colCodeInput.value.trim();
                loadInventory({reset: true});
            }, 300);
        });
    }
    if (numberInput) {
        numberInput.addEventListener('input', () => {
            clearTimeout(invFilterTimers.number);
            invFilterTimers.number = setTimeout(() => {
                invState.product_number = numberInput.value.trim();
                loadInventory({reset: true});
            }, 300);
        });
    }
    if (nameInput) {
        nameInput.addEventListener('input', () => {
            clearTimeout(invFilterTimers.name);
            invFilterTimers.name = setTimeout(() => {
                invState.product_name = nameInput.value.trim();
                loadInventory({reset: true});
            }, 300);
        });
    }
    if (typeSelect) {
        typeSelect.addEventListener('change', () => {
            invState.card_type_id = typeSelect.value;
            loadInventory({reset: true});
        });
    }
    const tagInput = document.getElementById('invFilterTag');
    if (tagInput) {
        tagInput.addEventListener('input', () => {
            clearTimeout(invFilterTimers.tag);
            invFilterTimers.tag = setTimeout(() => {
                invState.tag_name = tagInput.value.trim();
                loadInventory({reset: true});
            }, 300);
        });
    }
    const sealedSelect = document.getElementById('invFilterSealed');
    if (sealedSelect) {
        sealedSelect.addEventListener('change', () => {
            invState.is_sealed = sealedSelect.value;
            loadInventory({reset: true});
        });
    }
    const igSelect = document.getElementById('invFilterIg');
    if (igSelect) {
        igSelect.addEventListener('change', () => {
            invState.posted_instagram = igSelect.value;
            loadInventory({reset: true});
        });
    }
    const sortEl = document.getElementById('invSortOrder');
    if (sortEl) {
        sortEl.addEventListener('change', (e) => {
            invState.sort = e.target.value;
            loadInventory({reset: true});
        });
    }
}

async function loadInvFilterTypes() {
    const sel = document.getElementById('invFilterType');
    if (!sel) return;
    try {
        const resp = await apiFetch(apiUrl('types', {per_page: 200}));
        if (resp.ok) {
            const data = await resp.json();
            const types = data.items || [];
            const cardTypes = types.filter(t => t.type === 'card');
            sel.innerHTML = '<option value="">Todos</option>';
            cardTypes.forEach(t => {
                const opt = document.createElement('option');
                opt.value = t.id;
                opt.textContent = t.name + (t.short_name ? ' (' + t.short_name + ')' : '');
                sel.appendChild(opt);
            });
        }
    } catch (e) { console.error('Error loading types', e); }
}

// Purchase filters
let purFilterTimers = {};
let purStatusTypes = [];

function setupPurFilters() {
    const dateFromInput = document.getElementById('purFilterDateFrom');
    const dateToInput = document.getElementById('purFilterDateTo');
    const entitySelect = document.getElementById('purFilterEntity');
    const statusSelect = document.getElementById('purFilterStatus');
    const companySelect = document.getElementById('purFilterCompany');

    if (dateFromInput) {
        dateFromInput.addEventListener('change', () => {
            purState.date_from = dateFromInput.value;
            loadPurchases({reset: true});
        });
    }
    if (dateToInput) {
        dateToInput.addEventListener('change', () => {
            purState.date_to = dateToInput.value;
            loadPurchases({reset: true});
        });
    }
    if (entitySelect) {
        entitySelect.addEventListener('change', () => {
            purState.entity_id = entitySelect.value;
            loadPurchases({reset: true});
        });
    }
    if (statusSelect) {
        statusSelect.addEventListener('change', () => {
            const val = statusSelect.value;
            if (val === '__in_progress__') {
                const ids = purStatusTypes
                    .filter(t => ['reservado', 'pedido', 'enviado'].includes(t.name.toLowerCase()))
                    .map(t => t.id);
                purState.shipping_status_id = ids.length ? ids.join(',') : '';
            } else {
                purState.shipping_status_id = val;
            }
            loadPurchases({reset: true});
        });
    }
    if (companySelect) {
        companySelect.addEventListener('change', () => {
            purState.shipping_company_id = companySelect.value;
            loadPurchases({reset: true});
        });
    }
}

async function loadPurFilterData() {
    try {
        const [entResp, typesResp] = await Promise.all([
            apiFetch(apiUrl('entities', {per_page: 200})),
            apiFetch(apiUrl('types', {per_page: 200}))
        ]);
        const [entData, typesData] = await Promise.all([
            entResp.ok ? entResp.json() : {items: []},
            typesResp.ok ? typesResp.json() : {items: []}
        ]);
        const allTypes = typesData.items || [];
        const allEntities = entData.items || [];

        purStatusTypes = allTypes.filter(t => t.type === 'p_status');

        // Entity/Store dropdown
        const entitySel = document.getElementById('purFilterEntity');
        if (entitySel) {
            entitySel.innerHTML = '<option value="">Todas</option>';
            allEntities.slice().sort((a, b) => (a.name || '').localeCompare(b.name)).forEach(e => {
                const opt = document.createElement('option');
                opt.value = e.id;
                opt.textContent = e.name;
                entitySel.appendChild(opt);
            });
        }

        // Status dropdown
        const statusSel = document.getElementById('purFilterStatus');
        if (statusSel) {
            statusSel.innerHTML = '<option value="">Todos</option>';
            purStatusTypes.forEach(t => {
                const opt = document.createElement('option');
                opt.value = t.id;
                opt.textContent = t.name;
                statusSel.appendChild(opt);
            });
            const inProgressOpt = document.createElement('option');
            inProgressOpt.value = '__in_progress__';
            inProgressOpt.textContent = 'En curso';
            statusSel.appendChild(inProgressOpt);
        }

        // Shipping company dropdown
        const shipType = allTypes.find(t => t.type === 'entity' && t.name === 'shipping_company');
        const shippingCompanyTypeId = shipType ? shipType.id : null;
        const companySel = document.getElementById('purFilterCompany');
        if (companySel) {
            companySel.innerHTML = '<option value="">Todos</option>';
            const shippingEntities = shippingCompanyTypeId
                ? allEntities.filter(e => e.entity_type === shippingCompanyTypeId)
                : [];
            shippingEntities.forEach(e => {
                const opt = document.createElement('option');
                opt.value = e.id;
                opt.textContent = e.name;
                companySel.appendChild(opt);
            });
        }
    } catch (e) {
        console.error('Error loading purchase filter data', e);
    }
}

setupPurFilters();
loadPurFilterData();

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

document.getElementById('entryPurchaseItem').addEventListener('change', function() {
    updatePriceDisplay(this, 'entryPriceDisplay', 'entryPriceValue', entrySelectedPurchaseId);
});
document.getElementById('addInvPurchaseItem').addEventListener('change', function() {
    updatePriceDisplay(this, 'addInvPriceDisplay', 'addInvPriceValue', addInvSelectedPurchaseId);
});

// Initialize
updateAuthUI();
