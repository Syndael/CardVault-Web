const DEFAULT_API_BASE = "http://127.0.0.1:5000/api";
const urlParams = new URLSearchParams(window.location.search);
const configuredApiBase = (
    urlParams.get("api")
    || window.localStorage.getItem("cardvault_api_base")
    || DEFAULT_API_BASE
).replace(/\/$/, "");

window.localStorage.setItem("cardvault_api_base", configuredApiBase);

const apiOrigin = new URL(configuredApiBase).origin;

// Flag to ensure the app (infinite scroll, observers) only starts once authenticated
let appStarted = false;

// Authentication token storage key
const TOKEN_KEY = "cardvault_token";

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
        if (resp.status === 401) {
            handleUnauthorized();
        }
        return resp;
    } catch (err) {
        throw err;
    }
}

function handleUnauthorized() {
    window.localStorage.removeItem(TOKEN_KEY);
    // refresh auth UI (non-blocking)
    updateAuthUI();
}

let currentUserRoles = [];

async function loadCurrentUser() {
    const authPanelEl = document.getElementById('authPanel');
    if (!authPanelEl) return;
    const token = window.localStorage.getItem(TOKEN_KEY);
    if (!token) {
        authPanelEl.innerHTML = '';
        const btn = document.createElement('button');
        btn.id = 'loginToggle';
        btn.type = 'button';
        btn.textContent = 'Iniciar sesión';
        btn.addEventListener('click', showLoginModal);
        authPanelEl.appendChild(btn);
        return;
    }

    try {
        const resp = await apiFetch(apiUrl('auth/me'));
        if (!resp.ok) {
            window.localStorage.removeItem(TOKEN_KEY);
            currentUserRoles = [];
            authPanelEl.innerHTML = '';
            const btn2 = document.createElement('button');
            btn2.id = 'loginToggle';
            btn2.type = 'button';
            btn2.textContent = 'Iniciar sesión';
            btn2.addEventListener('click', showLoginModal);
            authPanelEl.appendChild(btn2);
            return;
        }

        const user = await resp.json();
        currentUserRoles = user.roles || [];
        authPanelEl.innerHTML = `<span id="userDisplay">${escapeHtml(user.display_name || user.username)}</span> <button id="logoutButton">Cerrar sesión</button>`;
        document.getElementById('logoutButton').addEventListener('click', logout);
        appStarted = true;
        applyRoleUI();
        loadProducts();
    } catch (err) {
        console.error('Error loading current user', err);
        currentUserRoles = [];
        authPanelEl.innerHTML = '';
        const btn3 = document.createElement('button');
        btn3.id = 'loginToggle';
        btn3.type = 'button';
        btn3.textContent = 'Iniciar sesión';
        btn3.addEventListener('click', showLoginModal);
        authPanelEl.appendChild(btn3);
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
        const catalog = document.querySelector('.catalog-wrap');
        const toolbar = document.querySelector('.toolbar');
        if (catalog) catalog.style.display = 'none';
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
    const catalog = document.querySelector('.catalog-wrap');
    const toolbar = document.querySelector('.toolbar');
    if (catalog) catalog.style.display = '';
    if (toolbar) toolbar.style.display = '';

    const addBtn = document.getElementById('addProductBtn');
    if (addBtn) addBtn.style.display = hasRole('product_write') ? '' : 'none';
    const createModal = document.getElementById('createProductModal');
    if (createModal && !hasRole('product_write')) createModal.hidden = true;
}

function showLoginModal() {
    const modal = document.getElementById('loginModal');
    if (!modal) return;
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    setTimeout(() => {
        const input = modal.querySelector('input[name="username"]');
        if (input) input.focus();
    }, 50);
}

function hideLoginModal() {
    const modal = document.getElementById('loginModal');
    if (!modal) return;
    modal.hidden = true;
    document.body.style.overflow = '';
}

async function loginSubmit(ev) {
    ev && ev.preventDefault && ev.preventDefault();
    const modal = document.getElementById('loginModal');
    if (!modal) return;
    const username = modal.querySelector('input[name="username"]').value.trim();
    const password = modal.querySelector('input[name="password"]').value;
    if (!username || !password) {
        alert('username/email and password required');
        return;
    }

    try {
        const resp = await apiFetch(apiUrl('auth/login'), {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({username, password})
        });

        if (!resp.ok) {
            const text = await resp.text().catch(() => null);
            alert('Login failed: ' + (resp.status + ' ' + (text || '')));
            return;
        }

        const body = await resp.json();
        window.localStorage.setItem(TOKEN_KEY, body.token);
        appStarted = true;
        currentUserRoles = (body.user && body.user.roles) || [];
        hideLoginModal();
        applyRoleUI();
        await loadCurrentUser();
    } catch (err) {
        console.error('Login error', err);
        alert('Login error');
    }
}

async function logout() {
    try {
        await apiFetch(apiUrl('auth/logout'), {method: 'POST'});
    } catch (err) {
        console.error('Logout error', err);
    } finally {
        window.localStorage.removeItem(TOKEN_KEY);
        currentUserRoles = [];
        appStarted = false;
        updateAuthUI();
    }
}

function updateAuthUI() {
    loadCurrentUser();
}

// Image loading helpers — fetch images with auth header and set blob URL
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
    const images = root.querySelectorAll('img[data-src]:not([data-loaded])');
    images.forEach(img => {
        img.setAttribute('data-loaded', '1');
        fetchAndSetImage(img);
    });
}

// Update a single product's image in-place without touching the rest of the grid
async function updateProductImage(productId, newImageUrl) {
    if (!productId || !newImageUrl) return false;
    const img = grid.querySelector(`img[data-product-id="${productId}"]`);
    if (!img) {
        console.warn('updateProductImage: image element not found for', productId);
        return false;
    }
    // set data-src with cache-buster so fetchAndSetImage always re-fetches
    const cacheBustedUrl = newImageUrl + (newImageUrl.includes('?') ? '&' : '?') + 'v=' + Date.now();
    img.removeAttribute('data-srcset');
    img.setAttribute('data-src', cacheBustedUrl);
    img.removeAttribute('data-loaded');
    img.setAttribute('data-loaded', '1');
    try {
        await fetchAndSetImage(img);
        // If the img was hidden (product had no image before), show it and
        // hide the SVG placeholder sibling
        if (img.style.display === 'none') {
            img.style.display = '';
            img.alt = img.getAttribute('data-product-name') || 'Producto';
            const svg = img.closest('.thumb') && img.closest('.thumb').querySelector('svg.thumb-placeholder');
            if (svg) svg.style.display = 'none';
        }
    } catch (err) {
        console.error('updateProductImage: failed to fetch image for', productId, err);
        throw err;
    }
    return true;
}

// Replace a product card by fetching the single product data and re-rendering
async function replaceProductCard(productId) {
    if (!productId) throw new Error('missing productId');
    // fetch latest product from API
    const resp = await apiFetch(apiUrl(`products/${productId}`));
    if (!resp.ok) {
        throw new Error('HTTP ' + resp.status);
    }
    const item = await resp.json();
    // render a new card HTML for this item
    const newHtml = itemCard(item).trim();
    const wrapper = document.createElement('div');
    wrapper.innerHTML = newHtml;
    const newNode = wrapper.firstElementChild;
    if (!newNode) throw new Error('rendered node missing');

    // find existing card element in the grid
    const existing = grid.querySelector(`[data-product-id="${productId}"]`);
    // existing may point to the inner img or span. Walk up to the article.product-card
    let card = existing ? existing.closest('.product-card') : null;
    if (!card) {
        // If card not found, append to grid as a last resort
        grid.insertAdjacentElement('beforeend', newNode);
        // ensure images and listeners for this new node
        loadImages(newNode);
        attachCardListeners();
        return true;
    }

    // Replace the existing card preserving its position
    card.replaceWith(newNode);
    // load images for the replaced card and reattach listeners
    loadImages(newNode);
    attachCardListeners();
    return true;
}

const state = {
    page: 1,
    perPage: 10,
    q: "",
    sort: "newest",
    is_verified: null,
    is_manual: null,
    pages: 0,
    total: 0,
    loaded: 0,
    loading: false,
    hasNext: true
};

const grid = document.querySelector("#productGrid");
const emptyState = document.querySelector("#emptyState");
const summary = document.querySelector("#resultSummary");
const layoutSummary = document.querySelector("#layoutSummary");
const scrollStatus = document.querySelector("#scrollStatus");
const searchForm = document.querySelector("#searchForm");
const searchInput = document.querySelector("#searchInput");
const loadSentinel = document.querySelector("#loadSentinel");
let resizeTimer = null;
let scrollTimer = null;

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll("\"", "&quot;")
        .replaceAll("'", "&#039;");
}

function formatName(name, nameAlter) {
    if (name && nameAlter) return `${escapeHtml(name)} (${escapeHtml(nameAlter)})`;
    return name ? escapeHtml(name) : (nameAlter ? escapeHtml(nameAlter) : '');
}

function apiUrl(path, params = null) {
    // normalize path: remove leading slash
    let p = path.replace(/^\//, "");
    // If this is a collection root (no subpath like 'products/123'),
    // ensure trailing slash to avoid Flask 308 redirects from '/api/foo' -> '/api/foo/'
    if (!p.includes('/')) {
        p = p + '/';
    }
    const url = new URL(`${configuredApiBase}/${p}`);
    if (params) {
        Object.entries(params).forEach(([key, value]) => {
            if (value !== undefined && value !== null && value !== "") {
                url.searchParams.set(key, value);
            }
        });
    }
    return url.toString();
}

function assetUrl(path) {
    return new URL(path, apiOrigin).toString();
}

function manualIcon(isManual) {
    if (!isManual) {
        return "";
    }

    return `
        <span class="manual-badge" title="Manual" aria-label="Manual">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M12 3v10"></path>
                <path d="M8 7v8"></path>
                <path d="M16 7v6"></path>
                <path d="M5 12v3a7 7 0 0 0 14 0v-4"></path>
            </svg>
        </span>
    `;
}

function verifiedIcon(isVerified) {
    if (!isVerified) {
        return "";
    }
    return `
        <span class="verified-badge" title="Verificado" aria-label="Verificado">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                <polyline points="22 4 12 14.01 9 11.01"></polyline>
            </svg>
        </span>
    `;
}

function imageCell(item) {
    const placeholder = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";

    if (!item.image_url) {
        // Render placeholder SVG but include a hidden img with data-product-id
        // so updateProductImage can find and replace it when an image is added.
        return `
            <div class="thumb">
                <svg class="thumb-placeholder" viewBox="0 0 24 24" width="42" height="42" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <rect x="3" y="3" width="18" height="18" rx="2"></rect>
                    <path d="m8 14 2.5-2.5L14 15l2-2 3 3"></path>
                    <circle cx="8.5" cy="8.5" r="1.5"></circle>
                </svg>
                <img
                    class="product-thumb-img"
                    src="${placeholder}"
                    data-product-id="${item.product_id}"
                    data-product-name="${escapeHtml(item.product_name || "")}"
                    alt=""
                    style="display:none"
                >
            </div>
        `;
    }

    const baseUrl = assetUrl(item.image_url);
    const sep = baseUrl.includes('?') ? '&' : '?';
    const smUrl = baseUrl + sep + 'size=sm';
    const mdUrl = baseUrl + sep + 'size=md';
    const lgUrl = baseUrl;
    return `
        <div class="thumb">
            <img
                class="product-thumb-img"
                src="${placeholder}"
                data-src="${escapeHtml(lgUrl)}"
                data-srcset="${escapeHtml(smUrl + ' 200w, ' + mdUrl + ' 400w, ' + lgUrl + ' 600w')}"
                sizes="(max-width:520px) 100vw, (max-width:820px) 50vw, (max-width:1080px) 33vw, (max-width:1320px) 25vw, 20vw"
                data-product-id="${item.product_id}"
                data-product-name="${escapeHtml(item.product_name || "")}"
                alt="${escapeHtml(item.product_name || "Producto")}"
                loading="lazy"
            >
        </div>
        <div class="img-preview"></div>
    `;
}

function itemCard(item) {
    return `
        <article class="product-card">
            <div class="thumb-wrap">
                ${imageCell(item)}
                ${verifiedIcon(item.is_verified)}
            </div>
            <div class="card-body">
                <div class="collection-line">
                    <span class="code">${escapeHtml(item.collection_code)}</span>
                    ${manualIcon(item.is_manual)}
                    <span class="collection-name" title="${escapeHtml(item.collection_name || "-")}">
                        ${escapeHtml(item.collection_name || "-")}
                    </span>
                </div>
                <div class="product-line">
                    <span class="number">${escapeHtml(item.product_number || "-")}</span>
                    <span class="product-name" title="${escapeHtml(item.product_name || "-")}" data-product-id="${item.product_id}">
                        ${escapeHtml(item.product_name || "-")}
                    </span>
                    ${item.tracker_url ? `<button class="tracker-button" data-tracker-url="${escapeHtml(item.tracker_url)}" title="Abrir precio" aria-label="Abrir precio"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12h12"></path><path d="M15 6l6 6-6 6"></path></svg></button>` : ''}
                </div>
            </div>
        </article>
    `;
}

function renderInitialLoading() {
    grid.innerHTML = `<div class="loading-state">Cargando productos...</div>`;
    emptyState.hidden = true;
}

function appendItems(items) {
    if (!items.length && state.loaded === 0) {
        grid.innerHTML = "";
        emptyState.hidden = false;
        return;
    }

    emptyState.hidden = true;
    grid.insertAdjacentHTML("beforeend", items.map(itemCard).join(""));
    // load images for the newly appended items (fetch via auth-aware apiFetch)
    loadImages(grid);
}

function renderProgress() {
    const first = state.loaded ? 1 : 0;
    summary.textContent = `${first}-${state.loaded} de ${state.total} productos`;
    scrollStatus.textContent = state.hasNext
        ? "Scroll para cargar mas"
        : "No hay mas productos";
}

function calculateColumns() {
    const width = window.innerWidth;
    if (width >= 1320) {
        return 5;
    }
    if (width >= 1080) {
        return 4;
    }
    if (width >= 820) {
        return 3;
    }
    if (width >= 520) {
        return 2;
    }
    return 1;
}

function updatePageSizeFromViewport() {
    const columns = calculateColumns();
    const rowsPerLoad = 2;
    state.perPage = columns * rowsPerLoad;
    layoutSummary.textContent = `${columns} columna${columns === 1 ? "" : "s"} · carga ${state.perPage}`;
}

function resetCatalog() {
    state.page = 1;
    state.pages = 0;
    state.total = 0;
    state.loaded = 0;
    state.hasNext = true;
    grid.innerHTML = "";
    emptyState.hidden = true;
}

function shouldLoadMore() {
    if (state.loading || !state.hasNext) {
        return false;
    }

    const sentinelRect = loadSentinel.getBoundingClientRect();
    return sentinelRect.top <= window.innerHeight + 700;
}

function requestNextPage() {
    if (shouldLoadMore()) {
        loadProducts();
    }
}

async function loadProducts({reset = false} = {}) {
    // don't perform API requests until the app is started after login
    if (!appStarted) return;

    if (state.loading || (!state.hasNext && !reset)) {
        return;
    }

    let _savedScroll = null;
    if (reset) {
        // preserve scroll to avoid jumping to top when we clear the grid
        _savedScroll = {x: window.scrollX, y: window.scrollY};
        resetCatalog();
        renderInitialLoading();
    }

    state.loading = true;
    scrollStatus.textContent = "Cargando...";

    try {
        const response = await apiFetch(apiUrl("product-catalog", {
            page: state.page,
            per_page: state.perPage,
            q: state.q,
            sort: state.sort,
            is_verified: state.is_verified,
            is_manual: state.is_manual
        }));

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        if (reset) {
            grid.innerHTML = "";
        }

        appendItems(data.items);
        state.pages = data.pagination.pages;
        state.total = data.pagination.total;
        state.hasNext = data.pagination.has_next;
        state.loaded += data.items.length;
        state.page += 1;
        renderProgress();
        // restore preserved scroll (after we've modified the DOM)
        if (_savedScroll) {
            try {
                window.scrollTo(_savedScroll.x, _savedScroll.y);
            } catch (e) { /* ignore */
            }
        }
    } catch (error) {
        if (state.loaded === 0) {
            grid.innerHTML = "";
            emptyState.hidden = false;
        }
        summary.textContent = "No se pudo cargar el catalogo";
        scrollStatus.textContent = "Error al cargar";
    } finally {
        state.loading = false;
        window.setTimeout(requestNextPage, 50);
        // wire up tracker button clicks and image clicks for newly added items
        attachCardListeners();
    }
}

function attachCardListeners() {
    // Tracker buttons
    document.querySelectorAll('.tracker-button').forEach(btn => {
        if (btn.dataset.bound) return;
        btn.dataset.bound = '1';
        btn.addEventListener('click', (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            const url = btn.getAttribute('data-tracker-url');
            if (url) {
                window.open(url, '_blank', 'noopener');
            }
        });
    });

    // Images: clicking is handled by delegated listener added earlier, but
    // ensure pointer cursor
    document.querySelectorAll('.product-thumb-img').forEach(img => img.style.cursor = 'pointer');

    // Hover preview: lazy-load full-res image into .img-preview on first mouseenter
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

const observer = new IntersectionObserver((entries) => {
    // only trigger loading when app has started (user logged in)
    if (!appStarted) return;
    if (entries.some((entry) => entry.isIntersecting)) {
        loadProducts();
    }
}, {
    rootMargin: "640px 0px"
});

observer.observe(loadSentinel);

window.addEventListener("scroll", () => {
    window.clearTimeout(scrollTimer);
    scrollTimer = window.setTimeout(requestNextPage, 80);
}, {
    passive: true
});

searchForm.addEventListener("submit", (event) => {
    event.preventDefault();
    state.q = searchInput.value.trim();
    loadProducts({reset: true});
});

document.getElementById('sortOrder').addEventListener('change', (e) => {
    state.sort = e.target.value;
    loadProducts({reset: true});
});

document.getElementById('filterManual').addEventListener('change', (e) => {
    state.is_manual = e.target.value || null;
    loadProducts({reset: true});
});

document.getElementById('filterVerified').addEventListener('change', (e) => {
    state.is_verified = e.target.value || null;
    loadProducts({reset: true});
});

window.addEventListener("resize", () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
        const previousPerPage = state.perPage;
        updatePageSizeFromViewport();
        if (previousPerPage !== state.perPage) {
            loadProducts({reset: true});
        } else {
            requestNextPage();
        }
    }, 160);
});

updatePageSizeFromViewport();

// initialize auth UI — if token exists, try to restore session
updateAuthUI();

// Modal logic
const productModal = document.getElementById("productModal");
const modalBackdrop = document.getElementById("modalBackdrop");
const modalTitle = document.getElementById("modalTitle");
const modalProductId = document.getElementById("modalProductId");
const imageUrlInput = document.getElementById("imageUrl");
const priceUrlInput = document.getElementById("priceUrl");
const productForm = document.getElementById("productForm");
const modalCancel = document.getElementById("modalCancel");
const modalSaveButton = productForm.querySelector('button[type="submit"]');
const modalDetail = document.getElementById("modalDetail");

function openModal(productId, productName) {
    modalProductId.value = productId;
    modalTitle.textContent = `Producto: ${productName}`;
    imageUrlInput.value = "";
    priceUrlInput.value = "";
    // load product details
    loadProductDetails(productId);
    productModal.hidden = false;
    // prevent background scrolling while modal is open
    document.body.style.overflow = "hidden";
    // small timeout to ensure modal is visible before focusing
    setTimeout(() => imageUrlInput.focus(), 50);
}

function closeModal() {
    productModal.hidden = true;
    // restore background scrolling
    document.body.style.overflow = "";
}

modalBackdrop.addEventListener("click", closeModal);
modalCancel.addEventListener("click", closeModal);

// Login modal wiring
const loginModal = document.getElementById('loginModal');
if (loginModal) {
    const loginForm = loginModal.querySelector('#loginForm');
    const loginCancel = loginModal.querySelector('#loginCancel');
    const loginBackdrop = loginModal.querySelector('#loginBackdrop');
    if (loginForm) loginForm.addEventListener('submit', loginSubmit);
    if (loginCancel) loginCancel.addEventListener('click', hideLoginModal);
    if (loginBackdrop) loginBackdrop.addEventListener('click', hideLoginModal);
}

async function handleProductFormSubmit(ev) {
    if (ev && typeof ev.preventDefault === 'function') ev.preventDefault();
    const productId = Number(modalProductId.value);
    const imageUrl = imageUrlInput.value.trim();
    const priceUrl = priceUrlInput.value.trim();

    console.log('handleProductFormSubmit', {productId, imageUrl, priceUrl});

    // disable save button to avoid duplicate submissions
    modalSaveButton.disabled = true;
    modalSaveButton.textContent = "Guardando...";

    let success = true;
    try {
        // Register file: we will store remote URL as file_path and use filename as stored_name
        if (imageUrl) {
            try {
                // call the new endpoint which downloads the image and stores it under /manual/{collection}/{...}
                const payload = {
                    product_id: productId,
                    file_url: imageUrl
                };
                // include selected language from the modal form if present
                const imgLangEl = document.getElementById('imageLanguage');
                if (imgLangEl && imgLangEl.value) payload.language_id = imgLangEl.value;

                console.log('Requesting server to download manual image', apiUrl('files/download-manual'), payload);
                const resp = await apiFetch(apiUrl('files/download-manual'), {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify(payload)
                });

                if (!resp.ok) {
                    success = false;
                    const text = await resp.text().catch(() => null);
                    console.error('Error on download-manual', resp.status, text);
                } else {
                    const body = await resp.json().catch(() => null);
                    console.log('download-manual result', body);
                    // Use the file id returned by the API to build the correct
                    // authenticated content URL. Never use file_path (a local
                    // disk path) directly as a browser URL.
                    const fileId = body && body.id;
                    if (!fileId) {
                        console.warn('download-manual did not return a file id, cannot update image in-place');
                    } else {
                        const imageUrlToUse = apiUrl(`product-catalog/files/${fileId}/content`);
                        try {
                            await updateProductImage(productId, imageUrlToUse);
                        } catch (err) {
                            console.error('Could not update product image in-place', err);
                        }
                    }
                }
            } catch (err) {
                success = false;
                console.error('Invalid image URL or network error', err);
            }
        }

        // Register price tracking: find or create price_source
        if (priceUrl) {
            try {
                const urlObj = new URL(priceUrl);
                const hostBase = `${urlObj.protocol}//${urlObj.host}`;

                // get all price sources
                console.log('Fetching price sources', apiUrl("price-sources", {per_page: 200}));
                const resp = await apiFetch(apiUrl("price-sources", {per_page: 200}));
                if (!resp.ok) {
                    success = false;
                    const text = await resp.text().catch(() => null);
                    console.error('Error fetching price sources', resp.status, text);
                } else {
                    const data = await resp.json();
                    let ps = (data.items || []).find(p => p.base_url && (hostBase === p.base_url || urlObj.href.startsWith(p.base_url)));

                    if (!ps) {
                        // create a new price source using hostname as name
                        console.log('Creating price source', {name: urlObj.hostname, base_url: hostBase});
                        const createResp = await apiFetch(apiUrl("price-sources"), {
                            method: "POST",
                            headers: {"Content-Type": "application/json"},
                            body: JSON.stringify({name: urlObj.hostname, base_url: hostBase})
                        });
                        if (!createResp.ok) {
                            success = false;
                            const text = await createResp.text().catch(() => null);
                            console.error('Error creating price source', createResp.status, text);
                        } else {
                            ps = await createResp.json();
                            console.log('Price source created', ps);
                        }
                    }

                    if (ps && ps.id) {
                        const trackPayload = {
                            product_id: productId,
                            price_source_id: ps.id,
                            url: priceUrl
                        };
                        console.log('Creating product price tracking', trackPayload);
                        const trackResp = await apiFetch(apiUrl("product-price-tracking"), {
                            method: "POST",
                            headers: {"Content-Type": "application/json"},
                            body: JSON.stringify(trackPayload)
                        });
                        if (!trackResp.ok) {
                            success = false;
                            const text = await trackResp.text().catch(() => null);
                            console.error('Error creating price tracking', trackResp.status, text);
                        } else {
                            const body = await trackResp.json().catch(() => null);
                            console.log('Price tracking created', body);
                        }
                    }
                }
            } catch (err) {
                success = false;
                console.error("Invalid price URL", err);
            }
        }
    } catch (err) {
        success = false;
        console.error('Unexpected error handling productForm submit', err);
    } finally {
        // always re-enable the button
        modalSaveButton.disabled = false;
        modalSaveButton.textContent = "Guardar";
        if (success) {
            closeModal();
        }
    }
}

productForm.addEventListener('submit', (ev) => {
    ev.preventDefault();
    if (!hasRole('product_write')) { alert('No tienes permisos para editar productos'); return; }
    handleProductFormSubmit(ev);
});


async function loadProductDetails(productId) {
    // clear previous
    modalDetail.innerHTML = '<div class="loading-state">Cargando detalles...</div>';
    try {
        // ensure we compare numbers when filtering
        const productIdNum = Number(productId);

        const prodResp = await apiFetch(apiUrl(`products/${productId}`));
        const prod = prodResp.ok ? await prodResp.json() : null;

        // fetch all translations and files client-side and filter by product_id because
        // the API pagination endpoints don't accept arbitrary filtering params
        async function fetchAllItems(path) {
            const items = [];
            let page = 1;
            while (true) {
                const resp = await apiFetch(apiUrl(path, {page, per_page: 200}));
                if (!resp.ok) break;
                const data = await resp.json();
                if (Array.isArray(data)) {
                    items.push(...data);
                    break;
                }
                items.push(...(data.items || []));
                if (!data.pagination || !data.pagination.has_next) break;
                page += 1;
            }
            return items;
        }

        // Prefer server-side filtering when supported by passing product_id
        const [transResp, filesResp, trackersResp, languagesResp] = await Promise.all([
            apiFetch(apiUrl('product-translations', {page: 1, per_page: 200, product_id: productIdNum})),
            apiFetch(apiUrl('files', {page: 1, per_page: 200, product_id: productIdNum})),
            apiFetch(apiUrl('product-price-tracking', {page: 1, per_page: 200, product_id: productIdNum})),
            apiFetch(apiUrl('languages', {page: 1, per_page: 200}))
        ]);

        const allTrans = transResp.ok ? (await transResp.json()).items || [] : [];
        const allFiles = filesResp.ok ? (await filesResp.json()).items || [] : [];
        const allTrackers = trackersResp.ok ? (await trackersResp.json()).items || [] : [];

        const translations = allTrans;
        const files = allFiles;
        const trackers = allTrackers;
        const languages = languagesResp.ok ? (await languagesResp.json()).items || [] : [];

        // build HTML
        let html = '';
        if (prod) {
            const firstTrans = translations.length ? translations[0].name : '';
            const prodName = firstTrans || '';
            const colCode = (prod.collection && prod.collection.code) || '';
            const colName = (prod.collection && (prod.collection.name || prod.collection.code)) || '';
            const searchParts = [prodName, prod.product_number, colCode].filter(Boolean).join(' ');
            const searchQ = searchParts ? encodeURIComponent(searchParts) : '';
            const invDisplay = `${escapeHtml(colCode)} ${escapeHtml(prod.product_number || '')}${prodName ? ' ' + escapeHtml(prodName) : ''}`;
            const invCopy = `${colCode} ${prod.product_number || ''}${prodName ? ' ' + prodName : ''}`.replace(/'/g, "\\'");
            html += `<div class="detail-grid">
              <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:12px">
                <div style="padding-top:7px;overflow:hidden"><strong>Colección:</strong> ${escapeHtml(colName)} (${escapeHtml(colCode)})</div>
                <div style="padding-top:7px;overflow:hidden"><strong>Número:</strong> ${escapeHtml(prod.product_number || '-')}</div>
                <div style="padding-top:7px;overflow:hidden"><strong>Producto:</strong> ${escapeHtml(prodName || prod.product_number || '-')}</div>
                <div style="text-align:right;overflow:hidden">
                   <code style="display:inline-flex;align-items:center;gap:6px;padding:6px 10px;background:var(--surface);border:1px solid var(--border);border-radius:6px;font-size:13px;cursor:pointer;white-space:nowrap;vertical-align:top" onclick="navigator.clipboard.writeText('${invCopy}')" title="Copiar">
                    <span>${invDisplay}</span>
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                  </code>
                </div>
              </div>
              <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:12px;align-items:center;margin-top:6px">
                <label class="checkbox-label" style="overflow:hidden"><strong>Forzar descarga:</strong> <input type="checkbox" class="force-download-check" data-product-id="${prod.id}" ${prod.force_download ? 'checked' : ''}></label>
                <label class="checkbox-label" style="overflow:hidden"><strong>Verificado:</strong> <input type="checkbox" class="verified-check" data-product-id="${prod.id}" ${prod.is_verified ? 'checked' : ''}></label>
                <label class="checkbox-label" style="overflow:hidden"><strong>Manual:</strong> <input type="checkbox" class="manual-check" data-product-id="${prod.id}" ${prod.is_manual ? 'checked' : ''}></label>
                ${searchQ ? `<button type="button" class="btn-google-search" style="overflow:hidden" onclick="window.open('https://www.google.com/search?q=${searchQ}', '_blank', 'noopener')" title="Buscar en Google">Buscar en Google</button>` : `<span style="overflow:hidden"></span>`}
              </div>
            </div>`;
        if (hasRole('inventory_manage')) {
            var _colId = prod.collection ? prod.collection.id : '';
            html += '<div style="margin-top:10px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">';
            html += '<button type="button" class="add-to-inv-btn" data-pid="' + prod.id + '" data-colid="' + _colId + '">+ Añadir a inventario</button>';
            html += '<div class="add-inv-form" style="display:none;flex:1;gap:8px;align-items:end;min-width:280px">';
            html += '<div style="flex:1"><label style="display:block;font-size:12px;color:var(--muted);margin-bottom:2px">Idioma</label>';
            html += '<select class="inv-lang-select" style="width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:4px;background:var(--surface);color:var(--text)">';
            html += '<option value="">(sin idioma)</option>';
            for (var _i = 0; _i < languages.length; _i++) {
                html += '<option value="' + languages[_i].id + '">' + languages[_i].name + '</option>';
            }
            html += '</select></div>';
            html += '<div style="flex:1"><label style="display:block;font-size:12px;color:var(--muted);margin-bottom:2px">Estado</label>';
            html += '<select class="inv-cond-select" style="width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:4px;background:var(--surface);color:var(--text)">';
            html += '<option value="">(sin estado)</option>';
            for (var _j = 0; _j < conditions.length; _j++) {
                html += '<option value="' + conditions[_j].id + '">' + conditions[_j].name + '</option>';
            }
            html += '</select></div>';
            html += '<button type="button" class="inv-confirm-btn" style="padding:6px 14px;border:0;border-radius:4px;background:var(--cyan-strong);color:#021014;cursor:pointer;white-space:nowrap">Añadir</button>';
            html += '<button type="button" class="inv-cancel-btn" style="padding:6px 14px;border:1px solid var(--border);border-radius:4px;background:transparent;color:var(--text);cursor:pointer">Cancelar</button>';
            html += '</div></div>';
        }
        }

        html += `<h3>Traducciones (${translations.length})</h3>`;
        html += '<div class="trans-list" id="transList">';
        if (translations.length === 0) {
            html += '<div class="empty-state">Sin traducciones</div>';
        } else {
            for (const t of translations) {
                const langName = t.language && t.language.name ? t.language.name : `ID ${t.language_id}`;
                html += `<div class="trans-row" data-trans-id="${t.id}">
                    <span class="trans-lang">${escapeHtml(langName)}</span>
                    <span class="trans-name">${formatName(t.name, t.name_alter)}</span>
                    <button type="button" class="btn-delete-trans" data-trans-id="${t.id}" title="Eliminar traduccion">
                        <svg viewBox="0 0 24 24" aria-hidden="true" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
                    </button>
                </div>`;
            }
        }
        html += '</div>';
        html += `<div class="trans-add">
            <select id="newTransLang">
                <option value="">Idioma...</option>
                ${languages.map(l => `<option value="${l.id}">${escapeHtml(l.name)}</option>`).join('')}
            </select>
            <input id="newTransName" type="text" placeholder="Nombre">
            <button type="button" id="addTransBtn" class="btn-secondary">+</button>
        </div>`;

        html += `<h3>Ficheros (${files.length})</h3>`;
        if (files.length === 0) html += '<div class="empty-state">Sin ficheros</div>';
        html += '<ul class="files-list">';
        const tokenF = window.localStorage.getItem(TOKEN_KEY) || '';
        const qsF = tokenF ? `?token=${encodeURIComponent(tokenF)}` : '';
        for (const f of files) {
            const fileContentUrl = apiUrl(`product-catalog/files/${f.id}/content`) + qsF;
            const lang = f.language ? `(${escapeHtml(f.language.name)})` : '';
            html += `<li class="detail-row">
                <a href="${escapeHtml(fileContentUrl)}" target="_blank">${escapeHtml(f.original_name || f.stored_name)}</a>
                <span class="detail-meta">${lang}</span>
                <button type="button" class="btn-delete-file" data-file-id="${f.id}" title="Eliminar fichero">
                    <svg viewBox="0 0 24 24" aria-hidden="true" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
                </button>
            </li>`;
        }
        html += '</ul>';

        // Price trackers
        html += `<h3>Price Trackers (${trackers.length})</h3>`;
        if (trackers.length === 0) html += '<div class="empty-state">Sin trackers de precio</div>';
        html += '<ul class="files-list">';
        for (const t of trackers) {
            const source = t.price_source && t.price_source.name ? escapeHtml(t.price_source.name) : '';
            html += `<li class="detail-row">
                <a href="${escapeHtml(t.url)}" target="_blank">${escapeHtml(t.url)}</a>
                <span class="detail-meta">${source ? `(${source})` : ''}</span>
                <button type="button" class="btn-delete-tracker" data-tracker-id="${t.id}" title="Eliminar tracker">
                    <svg viewBox="0 0 24 24" aria-hidden="true" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
                </button>
            </li>`;
        }
        html += '</ul>';

        modalDetail.innerHTML = html;

        (function addDigimonUrls() {
            const existing = document.getElementById('digimonUrls');
            if (existing) existing.remove();
            if (!prod || !prod.product_type || prod.product_type.short_name !== 'DIG') return;
            const digiSetCode = (prod.collection && prod.collection.code) || '';
            const digiPnum = prod.product_number || '';
            const isJp = /jp$/i.test(digiPnum);
            const rawPnum = isJp ? digiPnum.replace(/jp$/i, '') : digiPnum;
            const cardId = digiSetCode + '-' + rawPnum;
            const bandaiBase = 'https://s3.amazonaws.com/prod.bandaitcgplus.files.api/card_image/DG-EN/' + digiSetCode + '/';

            function link(url) {
                return '<span class="digi-url-wrap"><a href="' + url + '" target="_blank" rel="noopener">' + url + '</a><span class="digi-preview"><img src="' + url + '" alt="" loading="lazy" onerror="this.parentElement.style.display=\'none\'"></span></span>';
            }

            let dh = '<div id="digimonUrls"><h3 style="margin-top:12px">Posibles URLs de imagen <span style="font-size:11px;color:var(--muted)">(Digimon)</span></h3>';
            dh += '<div class="digimon-urls" style="font-size:12px;word-break:break-all;line-height:1.8;padding:8px;background:var(--surface);border:1px solid var(--border);border-radius:6px">';

            dh += '<div><strong>world.digimoncard.com:</strong><br>' + link('https://world.digimoncard.com/images/cardlist/card/' + cardId + '.png') + '</div>';

            dh += '<div style="margin-top:6px"><strong>Bandai S3 (Amazon):</strong><br>';
            const bFmts = [cardId, cardId + '_dummy', 'e_' + cardId + '_dummy', 'e_' + cardId + '_D', 'e_' + cardId + '_D_sam'];
            for (let j = 0; j < bFmts.length; j++) {
                dh += link(bandaiBase + bFmts[j] + '.png') + '<br>';
            }
            if (rawPnum.indexOf('_P') !== -1) {
                const stdId = rawPnum.split('_P')[0];
                const pFmts = ['e_' + stdId + 'p_D', 'e_' + stdId + 'P_D_sam', stdId + 'P_dummy', stdId + 'P'];
                for (let k = 0; k < pFmts.length; k++) {
                    dh += link(bandaiBase + pFmts[k] + '.png') + '<br>';
                }
            }
            dh += '</div>';

            dh += '<div style="margin-top:6px"><strong>digimoncard.com (JP):</strong><br>' + link('https://digimoncard.com/images/cardlist/card/' + cardId + '.png') + '</div>';

            dh += '<div style="margin-top:6px"><strong>digimoncard.io:</strong><br>' + link('https://images.digimoncard.io/images/cards/' + cardId + '.jpg') + '</div>';

            dh += '</div></div>';
            const form = document.getElementById('productForm');
            if (form) form.insertAdjacentHTML('afterend', dh);
        })();

        // Checkboxes autoguardado
        modalDetail.querySelectorAll('.force-download-check, .verified-check, .manual-check').forEach(cb => {
            cb.addEventListener('change', async function () {
                const pid = this.dataset.productId;
                const checked = this.checked;
                let field;
                if (this.classList.contains('force-download-check')) field = 'force_download';
                else if (this.classList.contains('verified-check')) field = 'is_verified';
                else if (this.classList.contains('manual-check')) field = 'is_manual';
                const resp = await apiFetch(apiUrl(`products/${pid}`), {
                    method: 'PATCH', headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({[field]: checked})
                });
                if (!resp.ok) { this.checked = !checked; alert('Error al actualizar ' + field); }
            });
        });

        // Botones borrar fichero
        modalDetail.querySelectorAll('.btn-delete-file').forEach(btn => {
            btn.addEventListener('click', async () => {
                const fileId = btn.dataset.fileId;
                if (!confirm('¿Eliminar este fichero?')) return;
                btn.disabled = true;
                const resp = await apiFetch(apiUrl(`files/${fileId}`), {method: 'DELETE'});
                if (resp && resp.ok) {
                    btn.closest('li').remove();
                    // si era la única imagen del producto, ocultar el img y mostrar placeholder
                    const productId = Number(modalProductId.value);
                    const img = grid.querySelector(`img[data-product-id="${productId}"]`);
                    if (img) {
                        const remainingFiles = modalDetail.querySelectorAll('.btn-delete-file');
                        if (remainingFiles.length === 0) {
                            if (img.src && img.src.startsWith('blob:')) URL.revokeObjectURL(img.src);
                            img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';
                            img.style.display = 'none';
                            const svg = img.closest('.thumb') && img.closest('.thumb').querySelector('svg.thumb-placeholder');
                            if (svg) svg.style.display = '';
                        }
                    }
                } else {
                    btn.disabled = false;
                    alert('Error al eliminar el fichero');
                }
            });
        });

        // Botones borrar tracker
        modalDetail.querySelectorAll('.btn-delete-tracker').forEach(btn => {
            btn.addEventListener('click', async () => {
                const trackerId = btn.dataset.trackerId;
                if (!confirm('¿Eliminar este tracker de precio?')) return;
                btn.disabled = true;
                const resp = await apiFetch(apiUrl(`product-price-tracking/${trackerId}`), {method: 'DELETE'});
                if (resp && resp.ok) {
                    btn.closest('li').remove();
                } else {
                    btn.disabled = false;
                    alert('Error al eliminar el tracker');
                }
            });
        });

        // Boton añadir traduccion
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
                if (resp && resp.ok) {
                    loadProductDetails(modalProductId.value);
                } else {
                    alert('Error al añadir traduccion');
                }
            });
        }

        // Botones borrar traduccion
        modalDetail.querySelectorAll('.btn-delete-trans').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (!confirm('¿Eliminar esta traduccion?')) return;
                const resp = await apiFetch(apiUrl(`product-translations/${btn.dataset.transId}`), {method: 'DELETE'});
                if (resp && resp.ok) {
                    btn.closest('.trans-row').remove();
                } else {
                    alert('Error al eliminar traduccion');
                }
            });
        });

        // Populate language selector in the modal (image upload form)
        // Populate the modal image language selector (if present)
        const langSelect = document.getElementById('imageLanguage');
        if (langSelect) {
            langSelect.innerHTML = '<option value="">(sin idioma)</option>';
            languages.forEach(l => {
                const opt = document.createElement('option');
                opt.value = l.id;
                opt.textContent = l.name;
                langSelect.appendChild(opt);
            });
        }

        // Add-to-inventory button handlers
        modalDetail.querySelectorAll('.add-to-inv-btn').forEach(btn => {
            if (btn.dataset.invBound) return;
            btn.dataset.invBound = '1';
            btn.addEventListener('click', () => {
                const form = btn.parentElement.querySelector('.add-inv-form');
                if (form) {
                    btn.style.display = 'none';
                    form.style.display = 'flex';
                }
            });
        });

        modalDetail.querySelectorAll('.inv-cancel-btn').forEach(btn => {
            if (btn.dataset.invCancelBound) return;
            btn.dataset.invCancelBound = '1';
            btn.addEventListener('click', () => {
                const form = btn.closest('.add-inv-form');
                const container = form.closest('div');
                const addBtn = container.querySelector('.add-to-inv-btn');
                form.style.display = 'none';
                if (addBtn) addBtn.style.display = '';
            });
        });

        modalDetail.querySelectorAll('.inv-confirm-btn').forEach(btn => {
            if (btn.dataset.invConfirmBound) return;
            btn.dataset.invConfirmBound = '1';
            btn.addEventListener('click', async () => {
                const form = btn.closest('.add-inv-form');
                const container = form.closest('div');
                const addBtn = container.querySelector('.add-to-inv-btn');
                const pid = Number(addBtn.dataset.pid);
                const colId = Number(addBtn.dataset.colid);
                const langSelect = form.querySelector('.inv-lang-select');
                const condSelect = form.querySelector('.inv-cond-select');

                btn.disabled = true;
                btn.textContent = 'Añadiendo...';

                try {
                    const body = {
                        product_id: pid,
                        collection_id: colId,
                        quantity: 1,
                    };
                    const langId = langSelect.value;
                    const condId = condSelect.value;
                    if (langId) body.language_id = parseInt(langId);
                    if (condId) body.condition_id = parseInt(condId);

                    const resp = await apiFetch(apiUrl('inventory'), {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify(body),
                    });

                    if (resp.ok) {
                        const result = await resp.json();
                        form.style.display = 'none';
                        if (addBtn) addBtn.style.display = '';
                        alert(`Añadido a inventario (id=${result.id})`);
                    } else {
                        const text = await resp.text().catch(() => 'Error');
                        alert('Error al añadir: ' + text);
                    }
                } catch (err) {
                    alert('Error de red: ' + err.message);
                } finally {
                    btn.disabled = false;
                    btn.textContent = 'Añadir';
                }
            });
        });
    } catch (err) {
        modalDetail.innerHTML = '<div class="empty-state">Error cargando detalles</div>';
    }
}


// Inline styles for detail rows and delete buttons
(function injectDetailStyles() {
    const css = `
        .detail-row { display:flex !important; align-items:center !important; gap:8px; padding:4px 0; border-bottom:1px solid rgba(255,255,255,0.04); }
        .detail-row a { flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; min-width:0; }
        .detail-meta { color:var(--muted, #888); font-size:.8em; white-space:nowrap; flex-shrink:0; }
        .btn-delete-file, .btn-delete-tracker {
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
        .btn-delete-file:hover, .btn-delete-tracker:hover {
            color:#e53e3e !important; background:rgba(229,62,62,.12) !important; opacity:1;
        }
        .files-list li.detail-row { padding:4px 0 !important; }
        .add-to-inv-btn {
            padding:6px 14px;border:0;border-radius:4px;
            background:var(--cyan-strong);color:#021014;cursor:pointer;white-space:nowrap;font-size:13px;font-weight:600;
        }
        .add-to-inv-btn:hover { background:var(--cyan); }
        .add-inv-form select { font-size:13px; }
    `;
    const el = document.createElement('style');
    el.textContent = css;
    document.head.appendChild(el);
})();
// delegate clicks on product names
document.addEventListener("click", (ev) => {
    // open details when clicking on product name OR on the image
    const nameEl = ev.target.closest('.product-name');
    const imgEl = ev.target.closest('.product-thumb-img');
    if (nameEl) {
        ev.preventDefault();
        ev.stopPropagation();
        const pid = nameEl.getAttribute('data-product-id');
        const name = nameEl.textContent.trim();
        if (pid) openModal(pid, name);
        return;
    }
    if (imgEl) {
        ev.preventDefault();
        ev.stopPropagation();
        const pid = imgEl.getAttribute('data-product-id');
        const name = imgEl.getAttribute('data-product-name') || '';
        if (pid) openModal(pid, name);
        return;
    }
}, {capture: true});

// close on Escape
document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && !productModal.hidden) {
        closeModal();
    }
    if (ev.key === "Escape" && !createModal.hidden) {
        closeCreateModal();
    }
});

// ==================== CREATE PRODUCT ====================
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

document.getElementById('addProductBtn').addEventListener('click', () => {
    if (!hasRole('product_write')) return;
    openCreateModal();
});
createBackdrop.addEventListener('click', closeCreateModal);
createCancel.addEventListener('click', closeCreateModal);

function closeCreateModal() {
    createModal.hidden = true;
    document.body.style.overflow = '';
}

async function openCreateModal() {
    newColCode.value = '';
    delete newColCode.dataset.collectionId;
    newColName.value = '';
    newProductNumber.value = '';
    newForceDownload.checked = false;
    closeColSuggestions();
    createModal.hidden = false;
    document.body.style.overflow = 'hidden';

    // Load types and languages
    try {
        const [typesResp, langsResp] = await Promise.all([
            apiFetch(apiUrl('types', {per_page: 200})),
            apiFetch(apiUrl('languages', {per_page: 200}))
        ]);

        if (typesResp.ok) {
            const data = await typesResp.json();
            const types = data.items || [];
            const cardTypes = types.filter(t => t.type === 'card');
            newCardType.innerHTML = '<option value="">Seleccionar...</option>';
            cardTypes.forEach(t => {
                const opt = document.createElement('option');
                opt.value = t.id;
                opt.textContent = t.name + (t.short_name ? ` (${t.short_name})` : '');
                newCardType.appendChild(opt);
            });
        }

        if (langsResp.ok) {
            const data = await langsResp.json();
            const langs = data.items || [];
            newColLang.innerHTML = '<option value="">Seleccionar...</option>';
            langs.forEach(l => {
                const opt = document.createElement('option');
                opt.value = l.id;
                opt.textContent = l.name;
                newColLang.appendChild(opt);
            });
        }
    } catch (e) {
        console.error('Error loading data', e);
    }

    setTimeout(() => newColCode.focus(), 50);
}

// Collection autocomplete
let colSearchTimeout;
newColCode.addEventListener('input', () => {
    clearTimeout(colSearchTimeout);
    delete newColCode.dataset.collectionId;
    const q = newColCode.value.trim();
    if (q.length < 2) { closeColSuggestions(); return; }
    colSearchTimeout = setTimeout(() => searchCollections(q), 300);
});

newColCode.addEventListener('blur', () => {
    setTimeout(closeColSuggestions, 200);
});

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
        `<div class="suggestion-item" data-code="${escapeHtml(item.code)}" data-id="${item.id}" data-is-manual="${item.is_manual ? 'true' : ''}">
            <span class="suggestion-code">${escapeHtml(item.code)}</span>
            ${item.name ? `<span class="suggestion-name">${formatName(item.name, item.name_alter)}</span>` : ''}
            ${item.card_type ? `<span class="suggestion-type">${escapeHtml(item.card_type.short_name || item.card_type.name)}</span>` : ''}
            ${item.is_manual ? '<span class="suggestion-manual" title="Manual">M</span>' : ''}
        </div>`
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
    colSuggestions.style.display = 'none';
    colSuggestions.innerHTML = '';
}

createForm.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const code = newColCode.value.trim();
    const productNumber = newProductNumber.value.trim();
    const forceDownload = newForceDownload.checked;

    if (!code) { alert('El codigo de coleccion es obligatorio'); return; }

    const btn = createForm.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = 'Creando...';

    try {
        let collectionId = newColCode.dataset.collectionId;
        let cardTypeId;

        if (!collectionId) {
            // Try to find existing collection by code first
            try {
                const searchResp = await apiFetch(apiUrl('collections', {q: code, per_page: 5}));
                if (searchResp.ok) {
                    const searchData = await searchResp.json();
                    const existing = (searchData.items || []).find(c => c.code === code);
                    if (existing) {
                        collectionId = existing.id;
                        cardTypeId = existing.card_type ? existing.card_type.id : existing.card_type_id;
                    }
                }
            } catch (e) { console.error(e); }
        }

        if (!collectionId) {
            cardTypeId = newCardType.value;
            if (!cardTypeId) {
                alert('Selecciona un tipo de carta para crear la coleccion');
                btn.disabled = false;
                btn.textContent = 'Crear producto';
                return;
            }
            // Create collection
            const colResp = await apiFetch(apiUrl('collections'), {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    code: code,
                    card_type_id: parseInt(cardTypeId),
                    is_manual: true
                })
            });
            if (!colResp.ok) {
                const t = await colResp.text().catch(()=>null);
                alert('Error al crear coleccion: ' + colResp.status + ' ' + (t||''));
                return;
            }
            const newCol = await colResp.json();
            collectionId = newCol.id;

            // Create collection translation if name provided
            const colName = newColName.value.trim();
            const colLangId = newColLang.value;
            if (colName && colLangId) {
                await apiFetch(apiUrl('collection-translations'), {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({
                        collection_id: collectionId,
                        language_id: parseInt(colLangId),
                        name: colName
                    })
                });
            }
        } else {
            collectionId = parseInt(collectionId);
            // Get card_type from existing collection
            try {
                const colResp = await apiFetch(apiUrl(`collections/${collectionId}`));
                if (colResp.ok) {
                    const colData = await colResp.json();
                    cardTypeId = colData.card_type ? colData.card_type.id : (colData.card_type_id || null);
                }
            } catch (e) { console.error(e); }
        }

        if (!cardTypeId) {
            alert('No se pudo determinar el tipo de carta');
            return;
        }

        // Create product with same type as card type
        const prodResp = await apiFetch(apiUrl('products'), {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                collection_id: collectionId,
                product_type_id: parseInt(cardTypeId),
                ...(productNumber ? {product_number: productNumber} : {}),
                force_download: forceDownload
            })
        });

        if (!prodResp.ok) {
            const t = await prodResp.text().catch(()=>null);
            alert('Error al crear producto: ' + prodResp.status + ' ' + (t||''));
            return;
        }

        closeCreateModal();
        loadProducts({reset: true});
    } catch (e) {
        console.error(e);
        alert('Error al crear producto');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Crear producto';
    }
});