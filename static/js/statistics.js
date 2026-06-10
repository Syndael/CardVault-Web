// ==================== STATISTICS ====================

let statsData = null;
let statsLoading = false;

async function loadStatisticsTab() {
    if (statsLoading) return;
    statsLoading = true;

    const container = document.getElementById('statsContainer');
    container.innerHTML = `<div class="loading-state" style="padding:60px;text-align:center">Cargando estadísticas...</div>`;

    try {
        const [summaryResp, valueTypeResp, collectionsResp, entitiesResp, monthsResp, langsResp, condsResp, topValueResp, topProfitResp, untrackedResp, avgSpendResp, bestInvResp] = await Promise.all([
            apiFetch(apiUrl('statistics/summary')),
            apiFetch(apiUrl('statistics/inventory-value-by-type')),
            apiFetch(apiUrl('statistics/collections-top')),
            apiFetch(apiUrl('statistics/purchases-by-entity')),
            apiFetch(apiUrl('statistics/purchases-by-month')),
            apiFetch(apiUrl('statistics/language-distribution')),
            apiFetch(apiUrl('statistics/condition-distribution')),
            apiFetch(apiUrl('statistics/top-valuable-items')),
            apiFetch(apiUrl('statistics/top-profit-items')),
            apiFetch(apiUrl('statistics/untracked-items')),
            apiFetch(apiUrl('statistics/avg-monthly-spending')),
            apiFetch(apiUrl('statistics/best-investment-entities')),
        ]);

        const summary = summaryResp.ok ? await summaryResp.json() : null;
        const valueByType = valueTypeResp.ok ? await valueTypeResp.json() : null;
        const topCollections = collectionsResp.ok ? await collectionsResp.json() : null;
        const byEntity = entitiesResp.ok ? await entitiesResp.json() : null;
        const byMonth = monthsResp.ok ? await monthsResp.json() : null;
        const langDist = langsResp.ok ? await langsResp.json() : null;
        const condDist = condsResp.ok ? await condsResp.json() : null;
        const topValue = topValueResp.ok ? await topValueResp.json() : null;
        const topProfit = topProfitResp.ok ? await topProfitResp.json() : null;
        const untracked = untrackedResp.ok ? await untrackedResp.json() : null;
        const avgSpend = avgSpendResp.ok ? await avgSpendResp.json() : null;
        const bestInv = bestInvResp.ok ? await bestInvResp.json() : null;

        renderStats(container, { summary, valueByType, topCollections, byEntity, byMonth, langDist, condDist, topValue, topProfit, untracked, avgSpend, bestInv });
    } catch (e) {
        console.error(e);
        container.innerHTML = `<div class="empty-state" style="padding:60px;text-align:center">Error al cargar estadísticas</div>`;
    } finally {
        statsLoading = false;
    }
}

function renderStats(container, data) {
    const { summary, valueByType, topCollections, byEntity, byMonth, langDist, condDist, topValue, topProfit, untracked, avgSpend, bestInv } = data;

    let html = '<div class="stats-dashboard">';

    // Fila 1 — Resumen general (wide)
    html += '<section class="stats-section stats-section--wide"><h2>Resumen general</h2><div class="stats-cards">';
    if (summary) {
        html += statCard('Items', summary.total_inventory_items, '📦');
        html += statCard('Productos', summary.total_products, '🃏');
        html += statCard('Compras', summary.total_purchases, '🛒');
        html += statCard('Total gastado', formatEuro(summary.total_spent), '💰');
        html += statCard('Envío', formatEuro(summary.total_shipping_costs), '📬');
        html += statCard('Trackeados', summary.price_tracked_items, '📊');
    }
    html += '</div></section>';

    // Fila 2 — Idioma | Estado | Valoración (3 cols)
    if (langDist && langDist.length) {
        html += '<section class="stats-section"><h2>Distribución por idioma</h2>';
        html += '<div class="table-wrap"><table><thead><tr><th>Idioma</th><th>Items</th><th>Unidades</th><th>%</th></tr></thead><tbody>';
        langDist.slice(0, 5).forEach((l, i) => { html += `<tr><td>${esc(l.language_name)}</td><td>${l.item_count}</td><td>${l.total_quantity}</td><td>${l.percentage}%</td></tr>`; });
        if (langDist.length > 5) {
            langDist.slice(5).forEach((l, i) => { html += `<tr class="langMore" style="display:none"><td>${esc(l.language_name)}</td><td>${l.item_count}</td><td>${l.total_quantity}</td><td>${l.percentage}%</td></tr>`; });
            html += `<tr><td colspan="4"><button class="stats-expand" onclick="toggleRows('langMore',this)">+${langDist.length - 5} más</button></td></tr>`;
        }
        html += '</tbody></table></div></section>';
    }

    if (condDist && condDist.length) {
        html += '<section class="stats-section"><h2>Distribución por estado</h2>';
        html += '<div class="table-wrap"><table><thead><tr><th>Estado</th><th>Items</th><th>Unidades</th><th>%</th></tr></thead><tbody>';
        condDist.slice(0, 5).forEach((c, i) => { html += `<tr><td>${esc(c.condition_name)}</td><td>${c.item_count}</td><td>${c.total_quantity}</td><td>${c.percentage}%</td></tr>`; });
        if (condDist.length > 5) {
            condDist.slice(5).forEach((c, i) => { html += `<tr class="condMore" style="display:none"><td>${esc(c.condition_name)}</td><td>${c.item_count}</td><td>${c.total_quantity}</td><td>${c.percentage}%</td></tr>`; });
            html += `<tr><td colspan="4"><button class="stats-expand" onclick="toggleRows('condMore',this)">+${condDist.length - 5} más</button></td></tr>`;
        }
        html += '</tbody></table></div></section>';
    }

    if (valueByType) {
        html += '<section class="stats-section"><h2>Valoración del inventario</h2>';
        html += '<div class="table-wrap"><table><thead><tr><th>Tipo</th><th>Items</th><th>Unidades</th><th>Valor adquisición</th><th>%</th></tr></thead><tbody>';
        valueByType.types.slice(0, 5).forEach((t, i) => { html += `<tr><td><strong>${esc(t.type_name)}</strong>${t.type_short ? ` <span class="detail-meta">(${esc(t.type_short)})</span>` : ''}</td><td>${t.item_count}</td><td>${t.total_quantity}</td><td>${formatEuro(t.acquisition_value)}</td><td>${t.percentage}%</td></tr>`; });
        if (valueByType.types.length > 5) {
            valueByType.types.slice(5).forEach((t, i) => { html += `<tr class="valTypeMore" style="display:none"><td><strong>${esc(t.type_name)}</strong>${t.type_short ? ` <span class="detail-meta">(${esc(t.type_short)})</span>` : ''}</td><td>${t.item_count}</td><td>${t.total_quantity}</td><td>${formatEuro(t.acquisition_value)}</td><td>${t.percentage}%</td></tr>`; });
            html += `<tr><td colspan="5"><button class="stats-expand" onclick="toggleRows('valTypeMore',this)">+${valueByType.types.length - 5} más</button></td></tr>`;
        }
        html += '</tbody></table></div>';
        html += `<p class="stats-subtitle">Total valor adquisición: <strong>${formatEuro(valueByType.total_value)}</strong> · Total unidades: <strong>${valueByType.total_quantity}</strong></p>`;
        html += '</section>';
    }

    // Fila 3 — Gastos entidad | Gastos mes | Gasto medio mensual (3 cols)
    if (byEntity) {
        html += '<section class="stats-section"><h2>Gastos por entidad</h2>';
        html += '<div class="table-wrap"><table><thead><tr><th>Entidad</th><th>Compras</th><th>Total</th><th>Envío</th><th>Total + Envío</th></tr></thead><tbody>';
        byEntity.entities.slice(0, 5).forEach((e, i) => {
            const rowspan = e.children && e.children.length ? e.children.length + 1 : 1;
            html += `<tr><td rowspan="${rowspan}"><strong>${esc(e.name)}</strong></td><td>${e.purchase_count}</td><td>${formatEuro(e.total_amount)}</td><td>${formatEuro(e.total_shipping)}</td><td>${formatEuro(e.total_spent)}</td></tr>`;
            for (const child of (e.children || [])) {
                html += `<tr class="child-row"><td>${child.purchase_count}</td><td>${formatEuro(child.total_amount)}</td><td>${formatEuro(child.total_shipping)}</td><td>${formatEuro(child.total_amount + child.total_shipping)}</td></tr>`;
            }
        });
        if (byEntity.entities.length > 5) {
            byEntity.entities.slice(5).forEach((e, i) => {
                const rowspan = e.children && e.children.length ? e.children.length + 1 : 1;
                html += `<tr class="entityMore" style="display:none"><td rowspan="${rowspan}"><strong>${esc(e.name)}</strong></td><td>${e.purchase_count}</td><td>${formatEuro(e.total_amount)}</td><td>${formatEuro(e.total_shipping)}</td><td>${formatEuro(e.total_spent)}</td></tr>`;
                for (const child of (e.children || [])) {
                    html += `<tr class="entityMore" style="display:none"><td class="child-row">${child.purchase_count}</td><td>${formatEuro(child.total_amount)}</td><td>${formatEuro(child.total_shipping)}</td><td>${formatEuro(child.total_amount + child.total_shipping)}</td></tr>`;
                }
            });
            html += `<tr><td colspan="5"><button class="stats-expand" onclick="toggleRows('entityMore',this)">+${byEntity.entities.length - 5} más</button></td></tr>`;
        }
        html += '</tbody></table></div>';
        html += `<p class="stats-subtitle">Total gastado en compras: <strong>${formatEuro(byEntity.total_spent)}</strong></p>`;
        html += '</section>';
    }

    if (byMonth && byMonth.length) {
        html += '<section class="stats-section"><h2>Gastos por mes</h2>';
        html += '<div class="table-wrap"><table><thead><tr><th>Mes</th><th>Compras</th><th>Total</th><th>Envío</th><th>Total+Envío</th></tr></thead><tbody>';
        byMonth.slice(0, 5).forEach((m, i) => { html += `<tr><td>${esc(m.month)}</td><td>${m.count}</td><td>${formatEuro(m.total_amount)}</td><td>${formatEuro(m.total_shipping)}</td><td>${formatEuro(m.total_spent)}</td></tr>`; });
        if (byMonth.length > 5) {
            byMonth.slice(5).forEach((m, i) => { html += `<tr class="monthMore" style="display:none"><td>${esc(m.month)}</td><td>${m.count}</td><td>${formatEuro(m.total_amount)}</td><td>${formatEuro(m.total_shipping)}</td><td>${formatEuro(m.total_spent)}</td></tr>`; });
            html += `<tr><td colspan="5"><button class="stats-expand" onclick="toggleRows('monthMore',this)">+${byMonth.length - 5} más</button></td></tr>`;
        }
        html += '</tbody></table></div></section>';
    }

    if (avgSpend && avgSpend.length) {
        html += '<section class="stats-section"><h2>Gasto medio mensual</h2>';
        html += '<div class="table-wrap"><table><thead><tr><th>Mes</th><th>Compras</th><th>Gasto medio</th><th>Total</th><th>Envío</th></tr></thead><tbody>';
        avgSpend.slice(0, 5).forEach((m, i) => { html += `<tr><td>${esc(m.month)}</td><td>${m.count}</td><td>${formatEuro(m.avg_spent)}</td><td>${formatEuro(m.total_amount)}</td><td>${formatEuro(m.total_shipping)}</td></tr>`; });
        if (avgSpend.length > 5) {
            avgSpend.slice(5).forEach((m, i) => { html += `<tr class="avgMore" style="display:none"><td>${esc(m.month)}</td><td>${m.count}</td><td>${formatEuro(m.avg_spent)}</td><td>${formatEuro(m.total_amount)}</td><td>${formatEuro(m.total_shipping)}</td></tr>`; });
            html += `<tr><td colspan="5"><button class="stats-expand" onclick="toggleRows('avgMore',this)">+${avgSpend.length - 5} más</button></td></tr>`;
        }
        html += '</tbody></table></div></section>';
    }

    // Fila 4 — Items más valiosos | Mayor rentabilidad | Mejores entidades (3 cols)
    if (topValue && topValue.length) {
        html += '<section class="stats-section"><h2>Items más valiosos</h2>';
        html += '<div class="table-wrap"><table><thead><tr><th>#</th><th>Producto</th><th>Colección</th><th>Tipo</th><th>Ud.</th><th>Precio ud.</th><th>Total</th></tr></thead><tbody>';
        topValue.slice(0, 5).forEach((item, i) => { html += `<tr><td>${i + 1}</td><td><strong>${esc(item.product_number)}</strong> ${esc(item.product_name)}</td><td>${esc(item.collection_code)}</td><td>${esc(item.type)}</td><td>${item.quantity}</td><td>${formatEuro(item.unit_price)}</td><td>${formatEuro(item.total_value)}</td></tr>`; });
        if (topValue.length > 5) {
            topValue.slice(5).forEach((item, i) => { html += `<tr class="topValMore" style="display:none"><td>${i + 6}</td><td><strong>${esc(item.product_number)}</strong> ${esc(item.product_name)}</td><td>${esc(item.collection_code)}</td><td>${esc(item.type)}</td><td>${item.quantity}</td><td>${formatEuro(item.unit_price)}</td><td>${formatEuro(item.total_value)}</td></tr>`; });
            html += `<tr><td colspan="7"><button class="stats-expand" onclick="toggleRows('topValMore',this)">+${topValue.length - 5} más</button></td></tr>`;
        }
        html += '</tbody></table></div></section>';
    }

    if (topProfit && topProfit.length) {
        html += '<section class="stats-section"><h2>Mayor rentabilidad potencial</h2>';
        html += '<div class="table-wrap"><table><thead><tr><th>#</th><th>Producto</th><th>Colección</th><th>Tipo</th><th>Ud.</th><th>Coste ud.</th><th>Valor ud.</th><th>Beneficio total</th></tr></thead><tbody>';
        topProfit.slice(0, 5).forEach((item, i) => {
            const cls = item.total_profit >= 0 ? 'diff-pos' : 'diff-neg';
            html += `<tr><td>${i + 1}</td><td><strong>${esc(item.product_number)}</strong> ${esc(item.product_name)}</td><td>${esc(item.collection_code)}</td><td>${esc(item.type)}</td><td>${item.quantity}</td><td>${formatEuro(item.unit_price)}</td><td>${formatEuro(item.current_price)}</td><td class="${cls}">${formatEuro(item.total_profit)}</td></tr>`;
        });
        if (topProfit.length > 5) {
            topProfit.slice(5).forEach((item, i) => {
                const cls = item.total_profit >= 0 ? 'diff-pos' : 'diff-neg';
                html += `<tr class="topProfMore" style="display:none"><td>${i + 6}</td><td><strong>${esc(item.product_number)}</strong> ${esc(item.product_name)}</td><td>${esc(item.collection_code)}</td><td>${esc(item.type)}</td><td>${item.quantity}</td><td>${formatEuro(item.unit_price)}</td><td>${formatEuro(item.current_price)}</td><td class="${cls}">${formatEuro(item.total_profit)}</td></tr>`;
            });
            html += `<tr><td colspan="8"><button class="stats-expand" onclick="toggleRows('topProfMore',this)">+${topProfit.length - 5} más</button></td></tr>`;
        }
        html += '</tbody></table></div></section>';
    }

    if (bestInv && bestInv.length) {
        html += '<section class="stats-section"><h2>Mejores entidades de inversión</h2>';
        html += '<div class="table-wrap"><table><thead><tr><th>#</th><th>Entidad</th><th>Items</th><th>Coste</th><th>Valor actual</th><th>Beneficio</th><th>%</th></tr></thead><tbody>';
        bestInv.slice(0, 5).forEach((e, i) => {
            const cls = e.profit >= 0 ? 'diff-pos' : 'diff-neg';
            html += `<tr><td>${i + 1}</td><td><strong>${esc(e.name)}</strong></td><td>${e.items_count}</td><td>${formatEuro(e.acquisition_cost)}</td><td>${formatEuro(e.current_value)}</td><td class="${cls}">${formatEuro(e.profit)}</td><td class="${cls}">${e.profit_pct}%</td></tr>`;
        });
        if (bestInv.length > 5) {
            bestInv.slice(5).forEach((e, i) => {
                const cls = e.profit >= 0 ? 'diff-pos' : 'diff-neg';
                html += `<tr class="bestInvMore" style="display:none"><td>${i + 6}</td><td><strong>${esc(e.name)}</strong></td><td>${e.items_count}</td><td>${formatEuro(e.acquisition_cost)}</td><td>${formatEuro(e.current_value)}</td><td class="${cls}">${formatEuro(e.profit)}</td><td class="${cls}">${e.profit_pct}%</td></tr>`;
            });
            html += `<tr><td colspan="7"><button class="stats-expand" onclick="toggleRows('bestInvMore',this)">+${bestInv.length - 5} más</button></td></tr>`;
        }
        html += '</tbody></table></div></section>';
    }

    // Fila 5 — Colecciones + Items sin seguimiento (2 cols, wide)
    html += '<div class="stats-section stats-section--wide" style="display:grid;grid-template-columns:1fr 1fr;gap:14px">';
    if (topCollections && topCollections.length) {
        html += '<section><h2>Colecciones con más inventario</h2>';
        html += '<div class="table-wrap"><table><thead><tr><th>#</th><th>Colección</th><th>Items</th><th>Unidades</th><th>Coste</th><th>Valor actual</th><th>Dif.</th></tr></thead><tbody>';
        topCollections.slice(0, 5).forEach((c, i) => {
            const cost = c.acquisition_cost || 0;
            const value = c.current_value || 0;
            const diff = value - cost;
            const diffClass = diff >= 0 ? 'diff-pos' : 'diff-neg';
            html += `<tr><td>${i + 1}</td><td><strong>${esc(c.code)}</strong> — ${esc(c.name)}</td><td>${c.item_count}</td><td>${c.total_quantity}</td><td>${formatEuro(cost)}</td><td>${formatEuro(value)}</td><td class="${diffClass}">${formatEuro(diff)}</td></tr>`;
        });
        if (topCollections.length > 5) {
            topCollections.slice(5).forEach((c, i) => {
                const cost = c.acquisition_cost || 0;
                const value = c.current_value || 0;
                const diff = value - cost;
                const diffClass = diff >= 0 ? 'diff-pos' : 'diff-neg';
                html += `<tr class="colMore" style="display:none"><td>${i + 6}</td><td><strong>${esc(c.code)}</strong> — ${esc(c.name)}</td><td>${c.item_count}</td><td>${c.total_quantity}</td><td>${formatEuro(cost)}</td><td>${formatEuro(value)}</td><td class="${diffClass}">${formatEuro(diff)}</td></tr>`;
            });
            html += `<tr><td colspan="7"><button class="stats-expand" onclick="toggleRows('colMore',this)">+${topCollections.length - 5} más</button></td></tr>`;
        }
        html += '</tbody></table></div></section>';
    }
    if (untracked && untracked.length) {
        html += '<section><h2>Items sin seguimiento de precio</h2>';
        html += '<div class="table-wrap"><table><thead><tr><th>#</th><th>Producto</th><th>Colección</th><th>Ud.</th></tr></thead><tbody>';
        untracked.slice(0, 5).forEach((item, i) => { html += `<tr><td>${i + 1}</td><td><strong>${esc(item.product_number)}</strong></td><td>${esc(item.collection_code)}</td><td>${item.quantity}</td></tr>`; });
        if (untracked.length > 5) {
            untracked.slice(5).forEach((item, i) => { html += `<tr class="untrackedMore" style="display:none"><td>${i + 6}</td><td><strong>${esc(item.product_number)}</strong></td><td>${esc(item.collection_code)}</td><td>${item.quantity}</td></tr>`; });
            html += `<tr><td colspan="4"><button class="stats-expand" onclick="toggleRows('untrackedMore',this)">+${untracked.length - 5} más</button></td></tr>`;
        }
        html += '</tbody></table></div></section>';
    }
    html += '</div>';

    html += '</div>';
    container.innerHTML = html;
}

function statCard(label, value, icon) {
    return `<div class="stat-card"><div class="stat-icon">${icon}</div><div class="stat-value">${esc(String(value))}</div><div class="stat-label">${esc(label)}</div></div>`;
}

function toggleRows(cls, btn) {
    const rows = document.querySelectorAll('tr.' + cls);
    const hidden = rows[0]?.style.display === 'none';
    rows.forEach(r => r.style.display = hidden ? '' : 'none');
    if (!btn._origText) btn._origText = btn.textContent;
    btn.textContent = hidden ? '− menos' : btn._origText;
}

function formatEuro(v) {
    if (v == null) return '-';
    return parseFloat(v).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}
