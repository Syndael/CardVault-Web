// ==================== SETTINGS ====================

const settingsBody = document.getElementById('settingsBody');
const settingsEmpty = document.getElementById('settingsEmpty');
const settingsSummary = document.getElementById('settingsSummary');
const settingsFilterKey = document.getElementById('settingsFilterKey');
const settingsFilterValue = document.getElementById('settingsFilterValue');
const settingModal = document.getElementById('settingModal');
const settingForm = document.getElementById('settingForm');

const settingsState = {
    page: 1,
    perPage: 50,
    loading: false,
    loaded: 0,
    hasMore: true,
    filterKey: '',
    filterValue: '',
};

let _settingsFilterTimer = null;

function renderSettingRow(item) {
    const value = item.setting_value || '';
    const displayValue = value.length > 80 ? value.slice(0, 77) + '...' : value;
    const desc = item.description || '';
    return `<tr class="clickable-row" data-setting-id="${item.id}">
        <td><code style="font-size:12px">${esc(item.setting_key)}</code></td>
        <td style="font-family:monospace;font-size:12px;max-width:400px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--muted)" title="${esc(value)}">${esc(displayValue)}</td>
        <td style="font-size:12px;color:var(--muted);max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(desc)}">${esc(desc)}</td>
        <td style="text-align:center"><button type="button" class="btn-delete-setting" data-setting-id="${item.id}" title="Eliminar" style="background:none;border:none;cursor:pointer;font-size:18px;line-height:1;padding:2px 6px;color:var(--red)">&times;</button></td>
    </tr>`;
}

function appendSettings(items) {
    if (!items.length && settingsState.loaded === 0) {
        settingsBody.innerHTML = '';
        settingsEmpty.hidden = false;
        return;
    }
    settingsEmpty.hidden = true;
    settingsBody.insertAdjacentHTML('beforeend', items.map(renderSettingRow).join(''));
    settingsState.loaded += items.length;
}

async function loadSettings(reset = false) {
    if (settingsState.loading) return;
    if (!reset && !settingsState.hasMore) return;

    if (reset) {
        settingsState.page = 1;
        settingsState.loaded = 0;
        settingsState.hasMore = true;
        settingsBody.innerHTML = '';
    }

    settingsState.loading = true;
    settingsSummary.textContent = 'Cargando...';

    const params = { page: settingsState.page, per_page: settingsState.perPage };
    if (settingsState.filterKey) params.setting_key = settingsState.filterKey;
    if (settingsState.filterValue) params.setting_value = settingsState.filterValue;

    try {
        const resp = await apiFetch(apiUrl('settings', params));
        if (!resp.ok) {
            settingsSummary.textContent = 'Error al cargar';
            return;
        }
        const data = await resp.json();
        const items = data.items || [];
        appendSettings(items);
        settingsState.hasMore = !!(data.pagination && data.pagination.has_next);
        settingsState.page++;
        settingsSummary.textContent = `${settingsState.loaded} settings cargados`;
    } catch (e) {
        console.error(e);
        settingsSummary.textContent = 'Error de conexión';
    } finally {
        settingsState.loading = false;
    }
}

async function openSettingModal(settingId) {
    document.getElementById('settingModalTitle').textContent = 'Editar setting';
    document.getElementById('modalSettingId').value = settingId;
    document.getElementById('settingKey').value = '';
    document.getElementById('settingKeyDisplay').value = '';
    document.getElementById('settingValue').value = '';
    document.getElementById('settingDesc').value = '';

    try {
        const resp = await apiFetch(apiUrl(`settings/${settingId}`));
        if (!resp.ok) return;
        const setting = await resp.json();
        document.getElementById('settingKey').value = setting.setting_key || '';
        document.getElementById('settingKeyDisplay').value = setting.setting_key || '';
        document.getElementById('settingValue').value = setting.setting_value || '';
        document.getElementById('settingDesc').value = setting.description || '';
    } catch (e) {
        console.error(e);
        return;
    }

    settingModal.hidden = false;
    document.body.style.overflow = 'hidden';
}

function closeSettingModal() {
    settingModal.hidden = true;
    document.body.style.overflow = '';
}

document.getElementById('settingCancel').addEventListener('click', closeSettingModal);
document.getElementById('settingBackdrop').addEventListener('click', closeSettingModal);

settingForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('modalSettingId').value;
    const body = {
        setting_key: document.getElementById('settingKey').value.trim(),
        setting_value: document.getElementById('settingValue').value,
        description: document.getElementById('settingDesc').value.trim(),
    };

    try {
        const url = apiUrl(`settings/${id}`);
        const resp = await apiFetch(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        if (!resp.ok) {
            const err = await resp.json().catch(() => ({}));
            showToast(err.message || 'Error al guardar', 'error');
            return;
        }
        showToast('Setting guardado', 'success');
        closeSettingModal();
        loadSettings(true);
    } catch (e) {
        console.error(e);
        showToast('Error de conexión', 'error');
    }
});

// Click en fila para editar, click en botón para eliminar
document.getElementById('tabSettings').addEventListener('click', async (e) => {
    const delBtn = e.target.closest('.btn-delete-setting');
    if (delBtn) {
        e.stopPropagation();
        if (!confirm('¿Eliminar este setting?')) return;
        const id = delBtn.dataset.settingId;
        try {
            const resp = await apiFetch(apiUrl(`settings/${id}`), { method: 'DELETE' });
            if (!resp.ok) {
                showToast('Error al eliminar', 'error');
                return;
            }
            delBtn.closest('tr').remove();
            settingsState.loaded -= 1;
            showToast('Setting eliminado', 'success');
        } catch (e) {
            console.error(e);
            showToast('Error de conexión', 'error');
        }
        return;
    }
    const row = e.target.closest('tr.clickable-row[data-setting-id]');
    if (row) openSettingModal(row.dataset.settingId);
});

function onSettingsFilterChange() {
    clearTimeout(_settingsFilterTimer);
    _settingsFilterTimer = setTimeout(() => {
        settingsState.filterKey = settingsFilterKey.value.trim();
        settingsState.filterValue = settingsFilterValue.value.trim();
        loadSettings(true);
    }, 300);
}

settingsFilterKey.addEventListener('input', onSettingsFilterChange);
settingsFilterValue.addEventListener('input', onSettingsFilterChange);

const settingsSentinel = document.getElementById('settingsSentinel');
if (settingsSentinel) {
    const settingsObserver = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && !settingsState.loading && settingsState.hasMore) {
            loadSettings();
        }
    }, { rootMargin: '200px' });
    settingsObserver.observe(settingsSentinel);
}
