"use strict";

(() => {
    const state = {
        summary: null,
        chart: [],
        days: 7
    };

    const $ = (selector) => document.querySelector(selector);
    const $$ = (selector) => Array.from(document.querySelectorAll(selector));

    const money = (value) => {
        const amount = Number(value || 0);
        return `TSh ${amount.toLocaleString("en-TZ", {
            maximumFractionDigits: 0
        })}`;
    };

    const shortMoney = (value) => {
        const amount = Number(value || 0);
        if (amount >= 1_000_000_000) return `TSh ${(amount / 1_000_000_000).toFixed(1)}B`;
        if (amount >= 1_000_000) return `TSh ${(amount / 1_000_000).toFixed(1)}M`;
        if (amount >= 1_000) return `TSh ${(amount / 1_000).toFixed(0)}K`;
        return `TSh ${amount.toLocaleString("en-TZ", { maximumFractionDigits: 0 })}`;
    };

    const escapeHtml = (value) => String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");

    const dateLabel = (value, options = {}) => {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return "—";
        return date.toLocaleDateString("sw-TZ", {
            day: "2-digit",
            month: options.short ? "short" : "short",
            ...options
        });
    };

    const timeLabel = (value) => {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return "—";
        return date.toLocaleTimeString("sw-TZ", {
            hour: "2-digit",
            minute: "2-digit"
        });
    };

    const paymentLabel = (method) => ({
        cash: "Taslimu",
        card: "Kadi",
        mobile_money: "Mobile Money",
        bank: "Benki",
        credit: "Deni",
        other: "Nyingine"
    }[String(method || "").toLowerCase()] || "Nyingine");

    const setError = (message = "") => {
        const box = $("#dashboard-error");
        if (!box) return;
        box.hidden = !message;
        box.innerHTML = message
            ? `<strong>Imeshindikana kupakia data.</strong><span>${escapeHtml(message)}</span><button type="button" id="dashboard-retry">Jaribu tena</button>`
            : "";
        $("#dashboard-retry")?.addEventListener("click", () => loadDashboard());
    };

    const setLoading = (loading) => {
        $$(".df-kpi-card .stat-value").forEach((el) => {
            if (loading) el.classList.add("df-skeleton-text");
            else el.classList.remove("df-skeleton-text");
        });
    };

    function renderGreeting() {
        const user = window.DukaAuth?.user || window.__DUKAFLOW_USER__;
        const greeting = $("#dashboard-greeting");
        const context = $("#dashboard-business-context");
        if (!greeting) return;

        const name = String(user?.name || "").trim().split(/\s+/)[0];
        greeting.textContent = name ? `Habari, ${name} 👋` : "Habari, karibu 👋";
        if (context) {
            const business = user?.business_name || user?.businessName;
            context.textContent = business
                ? `${business} · Hapa ni muhtasari wa biashara yako kwa data halisi.`
                : "Hapa ni muhtasari wa biashara yako kwa data halisi.";
        }
    }

    function renderSummary(summary) {
        const trends = summary?.trends || {};

        $("#dashboard-today-sales").textContent = money(summary?.todaySales);
        $("#dashboard-today-profit").textContent = money(summary?.todayProfit);
        $("#dashboard-sales-count").textContent = Number(summary?.salesCount || 0).toLocaleString("sw-TZ");
        $("#dashboard-outstanding-debt").textContent = money(summary?.outstandingDebt);
        $("#dashboard-total-products").textContent = Number(summary?.totalProducts || 0).toLocaleString("sw-TZ");
        $("#dashboard-inventory-value").textContent = money(summary?.inventoryValue);

        setTrend("#dashboard-sales-trend", trends.sales);
        setTrend("#dashboard-profit-trend", trends.profit);
        setTrend("#dashboard-sales-count-trend", trends.salesCount);

        $("#dashboard-debt-count").textContent = Number(summary?.debtCount || 0).toLocaleString("sw-TZ");
        $("#dashboard-low-stock-count").textContent = Number(summary?.lowStockCount || 0).toLocaleString("sw-TZ");
        $("#dashboard-total-customers").textContent = Number(summary?.totalCustomers || 0).toLocaleString("sw-TZ");
    }

    function setTrend(selector, value) {
        const element = $(selector);
        if (!element) return;
        const amount = Number(value || 0);
        const sign = amount > 0 ? "↑" : amount < 0 ? "↓" : "→";
        element.textContent = `${sign} ${Math.abs(amount).toFixed(0)}%`;
        element.classList.toggle("positive", amount > 0);
        element.classList.toggle("negative", amount < 0);
        element.classList.toggle("neutral", amount === 0);
    }

    function renderLowStock(products) {
        const body = $("#dashboard-low-stock-body");
        if (!body) return;

        if (!products.length) {
            body.innerHTML = `
                <tr><td colspan="3">
                    <div class="df-inline-empty">
                        <span class="df-empty-icon">✓</span>
                        <div><strong>Stock iko salama</strong><small>Hakuna bidhaa iliyo chini ya kiwango chake.</small></div>
                    </div>
                </td></tr>`;
            return;
        }

        body.innerHTML = products.map((product) => {
            const stock = Number(product.stock_quantity || 0);
            const threshold = Number(product.low_stock_threshold || 0);
            const status = stock <= 0 ? "Imeisha" : "Low stock";
            const tone = stock <= 0 ? "danger" : stock <= threshold ? "warning" : "success";
            return `
                <tr>
                    <td>
                        <div class="df-product-cell">
                            ${product.image_url ? `<img class="df-product-thumb-img" src="${escapeHtml(product.image_url)}" alt="" loading="lazy">` : `<span class="df-product-thumb">${escapeHtml(String(product.name || "?").charAt(0).toUpperCase())}</span>`}
                            <div><strong>${escapeHtml(product.name || "Bidhaa")}</strong><small>${escapeHtml(product.sku || "SKU —")}</small></div>
                        </div>
                    </td>
                    <td><strong>${stock.toLocaleString("sw-TZ")}</strong><small>/ ${threshold.toLocaleString("sw-TZ")} min</small></td>
                    <td><span class="df-status ${tone}">${status}</span></td>
                </tr>`;
        }).join("");
    }

    function renderRecentTransactions(transactions) {
        const body = $("#dashboard-recent-transactions-body");
        if (!body) return;

        if (!transactions.length) {
            body.innerHTML = `<tr><td colspan="4"><div class="df-inline-empty"><span class="df-empty-icon">↗</span><div><strong>Bado hakuna mauzo</strong><small>Mauzo mapya yataonekana hapa.</small></div></div></td></tr>`;
            return;
        }

        body.innerHTML = transactions.slice(0, 8).map((item) => `
            <tr>
                <td>
                    <div class="df-receipt-cell">
                        <span class="df-receipt-icon">${item.type === "payment" ? "₿" : "↗"}</span>
                        <div><strong>${escapeHtml(item.description || "Miamala")}</strong><small>${item.type === "payment" ? "Malipo" : "Mauzo"}</small></div>
                    </div>
                </td>
                <td><span class="df-time">${dateLabel(item.createdAt)} · ${timeLabel(item.createdAt)}</span></td>
                <td><span class="df-method">${escapeHtml(paymentLabel(item.paymentMethod))}</span></td>
                <td><strong class="df-amount">${money(item.amount)}</strong></td>
            </tr>
        `).join("");
    }

    function renderPayments(items) {
        const box = $("#payment-methods-content");
        if (!box) return;

        const rows = (items || []).map((item) => ({
            method: paymentLabel(item.payment_method),
            amount: Number(item.amount || 0),
            count: Number(item.transaction_count || 0)
        }));

        const total = rows.reduce((sum, item) => sum + item.amount, 0);
        if (!rows.length || total <= 0) {
            box.innerHTML = `
                <div class="df-payment-empty">
                    <div class="df-donut empty"></div>
                    <strong>Hakuna malipo leo bado</strong>
                    <span>Njia za malipo zitaonekana baada ya mauzo.</span>
                </div>`;
            return;
        }

        const palette = ["#1677FF", "#6C5CE7", "#14B8A6", "#F59E0B", "#EF4444", "#64748B"];
        let cursor = 0;
        const stops = rows.map((item, index) => {
            const start = cursor;
            cursor += (item.amount / total) * 100;
            return `${palette[index % palette.length]} ${start.toFixed(2)}% ${cursor.toFixed(2)}%`;
        }).join(", ");

        box.innerHTML = `
            <div class="df-payment-visual">
                <div class="df-donut" style="background:conic-gradient(${stops})">
                    <div><strong>${shortMoney(total)}</strong><span>leo</span></div>
                </div>
                <div class="df-payment-list">
                    ${rows.map((item, index) => `
                        <div class="df-payment-row">
                            <span class="df-payment-dot" style="background:${palette[index % palette.length]}"></span>
                            <span>${escapeHtml(item.method)}</span>
                            <strong>${Math.round((item.amount / total) * 100)}%</strong>
                        </div>
                    `).join("")}
                </div>
            </div>`;
    }

    function renderTopProducts(items) {
        const box = $("#top-products-content");
        if (!box) return;

        if (!items?.length) {
            box.innerHTML = `<div class="df-inline-empty large"><span class="df-empty-icon">▧</span><div><strong>Bado hakuna bidhaa zilizouza</strong><small>Data itaonekana baada ya mauzo.</small></div></div>`;
            return;
        }

        const max = Math.max(...items.map((item) => Number(item.quantity_sold || 0)), 1);
        box.innerHTML = items.map((item, index) => {
            const qty = Number(item.quantity_sold || 0);
            const width = Math.max(5, (qty / max) * 100);
            return `
                <div class="df-top-product">
                    <div class="df-top-product-main">
                        ${item.image_url ? `<img class="df-product-thumb-img" src="${escapeHtml(item.image_url)}" alt="" loading="lazy">` : `<span class="df-rank">${index + 1}</span>`}
                        <div><strong>${escapeHtml(item.product_name || "Bidhaa")}</strong><small>${qty.toLocaleString("sw-TZ")} units · ${money(item.revenue)}</small></div>
                    </div>
                    <div class="df-product-bar"><span style="width:${width}%"></span></div>
                </div>`;
        }).join("");
    }

    function renderInsight(summary, lowStock, expenses) {
        const box = $("#dashboard-smart-insight");
        if (!box) return;

        if (Number(summary?.lowStockCount || 0) > 0) {
            const names = lowStock.slice(0, 2).map((item) => item.name).filter(Boolean).join(" na ");
            box.innerHTML = `<strong>💡 Uangalizi wa leo</strong><span>${escapeHtml(names || "Baadhi ya bidhaa")} ${lowStock.length > 1 ? "ziko" : "iko"} low stock. Fungua Inventory ili kuchukua hatua.</span><a href="/inventory/">Angalia stock →</a>`;
            return;
        }

        if (Number(expenses?.amount || 0) > 0) {
            box.innerHTML = `<strong>💡 Muhtasari wa wiki</strong><span>Matumizi ya siku 7 zilizopita ni ${money(expenses.amount)}.</span><a href="/expenses/">Angalia matumizi →</a>`;
            return;
        }

        box.innerHTML = `<strong>✨ Uko tayari</strong><span>Hakuna alert ya haraka iliyopatikana kwenye data yako kwa sasa.</span><a href="/reports/">Fungua ripoti →</a>`;
    }

    function chartState(message = "", type = "") {
        const box = $("#sales-chart-state");
        if (!box) return;
        box.className = `df-chart-state ${type}`.trim();
        box.textContent = message;
        box.hidden = !message;
    }

    function renderChart(data) {
        const svg = $("#sales-overview-chart");
        const container = svg?.parentElement;
        if (!svg || !container) return;

        if (!data?.length) {
            svg.innerHTML = "";
            chartState("Hakuna data ya mauzo kwenye kipindi hiki.", "empty");
            return;
        }

        const width = Math.max(container.clientWidth || 700, 360);
        const height = 300;
        const pad = { top: 18, right: 18, bottom: 42, left: 58 };
        const innerW = width - pad.left - pad.right;
        const innerH = height - pad.top - pad.bottom;
        const values = data.map((item) => Number(item.sales || 0));
        const max = Math.max(...values, 1);
        const yMax = Math.ceil(max / (max >= 1000000 ? 250000 : 50000)) * (max >= 1000000 ? 250000 : 50000) || max;
        const points = data.map((item, index) => {
            const x = pad.left + (data.length === 1 ? innerW / 2 : (index / (data.length - 1)) * innerW);
            const y = pad.top + innerH - (Number(item.sales || 0) / yMax) * innerH;
            return { ...item, x, y };
        });

        const linePath = points.map((point, index) => `${index ? "L" : "M"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");
        const areaPath = `${linePath} L ${points.at(-1).x.toFixed(1)} ${(pad.top + innerH).toFixed(1)} L ${points[0].x.toFixed(1)} ${(pad.top + innerH).toFixed(1)} Z`;

        const grid = Array.from({ length: 5 }, (_, i) => {
            const value = (yMax / 4) * i;
            const y = pad.top + innerH - (i / 4) * innerH;
            return `<line x1="${pad.left}" y1="${y}" x2="${width - pad.right}" y2="${y}" class="df-chart-grid-line"/><text x="${pad.left - 10}" y="${y + 4}" text-anchor="end" class="df-chart-axis">${escapeHtml(shortMoney(value))}</text>`;
        }).join("");

        const labels = points.map((point, index) => {
            const show = data.length <= 14 || index % Math.ceil(data.length / 7) === 0 || index === data.length - 1;
            return show ? `<text x="${point.x}" y="${height - 13}" text-anchor="middle" class="df-chart-axis">${escapeHtml(dateLabel(point.sale_date, { day: "2-digit", month: "short" }))}</text>` : "";
        }).join("");

        const circles = points.map((point, index) => `
            <g class="df-chart-point" tabindex="0" role="button" data-index="${index}" aria-label="${escapeHtml(dateLabel(point.sale_date))}: ${escapeHtml(money(point.sales))}">
                <circle cx="${point.x}" cy="${point.y}" r="${data.length > 45 ? 3.5 : 4.5}" class="df-chart-hit"></circle>
                <circle cx="${point.x}" cy="${point.y}" r="${data.length > 45 ? 2 : 3}" class="df-chart-dot"></circle>
            </g>`).join("");

        svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
        svg.setAttribute("preserveAspectRatio", "none");
        svg.innerHTML = `
            <defs>
                <linearGradient id="dfSalesArea" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stop-color="#1677FF" stop-opacity=".22"/>
                    <stop offset="100%" stop-color="#1677FF" stop-opacity="0"/>
                </linearGradient>
            </defs>
            ${grid}
            <path d="${areaPath}" class="df-chart-area"/>
            <path d="${linePath}" class="df-chart-line"/>
            ${labels}
            ${circles}
        `;

        chartState("");
        $$(".df-chart-point").forEach((point) => {
            point.addEventListener("mouseenter", () => showTooltip(point.dataset.index, points));
            point.addEventListener("focus", () => showTooltip(point.dataset.index, points));
            point.addEventListener("mouseleave", hideTooltip);
            point.addEventListener("blur", hideTooltip);
        });
    }

    function showTooltip(index, points) {
        const tooltip = $("#sales-chart-tooltip");
        const point = points[Number(index)];
        if (!tooltip || !point) return;
        tooltip.hidden = false;
        tooltip.innerHTML = `<strong>${escapeHtml(dateLabel(point.sale_date))}</strong><span>${money(point.sales)}</span><small>${Number(point.transaction_count || 0).toLocaleString("sw-TZ")} mauzo</small>`;
        const container = tooltip.parentElement;
        const left = Math.min(Math.max(point.x - 55, 8), container.clientWidth - 120);
        const top = Math.max(point.y - 82, 8);
        tooltip.style.left = `${left}px`;
        tooltip.style.top = `${top}px`;
    }

    function hideTooltip() {
        const tooltip = $("#sales-chart-tooltip");
        if (tooltip) tooltip.hidden = true;
    }

    async function loadSalesOverview() {
        const buttons = $$("[data-sales-period]");
        buttons.forEach((button) => button.classList.toggle("is-active", Number(button.dataset.salesPeriod) === state.days));
        chartState("Inapakia...");
        try {
            const response = await fetch(`/api/dashboard/sales-overview?days=${state.days}`, { credentials: "include", headers: { Accept: "application/json" } });
            const payload = await response.json();
            if (!response.ok) throw new Error(payload.message || "Sales overview failed.");
            state.chart = Array.isArray(payload.overview) ? payload.overview : [];
            renderChart(state.chart);
            const total = state.chart.reduce((sum, item) => sum + Number(item.sales || 0), 0);
            $("#sales-chart-summary").textContent = `${money(total)} jumla ya mauzo · ${state.chart.length} siku`;
        } catch (error) {
            chartState("Imeshindikana kupakia chati. Jaribu tena.", "error");
            const box = $("#sales-chart-state");
            box?.addEventListener("click", loadSalesOverview, { once: true });
        }
    }

    async function loadDashboard() {
        setLoading(true);
        setError("");
        try {
            const response = await fetch("/api/dashboard/summary", { credentials: "include", headers: { Accept: "application/json" } });
            const payload = await response.json();
            if (!response.ok) throw new Error(payload.message || "Failed to load dashboard.");
            state.summary = payload.summary || {};
            renderSummary(state.summary);
            renderLowStock(payload.lowStock || []);
            renderRecentTransactions(payload.recentTransactions || []);
            renderPayments(payload.paymentMethodsToday || []);
            renderTopProducts(payload.topProducts7d || []);
            renderInsight(state.summary, payload.lowStock || [], payload.expenses7d || {});
            setLoading(false);
        } catch (error) {
            setLoading(false);
            setError(error.message || "Tafadhali jaribu tena.");
        }
    }

    function bindPeriodControls() {
        $$("[data-sales-period]").forEach((button) => {
            button.addEventListener("click", () => {
                state.days = Number(button.dataset.salesPeriod);
                loadSalesOverview();
            });
        });
    }

    function bindResize() {
        let timer;
        window.addEventListener("resize", () => {
            window.clearTimeout(timer);
            timer = window.setTimeout(() => {
                if (state.chart.length) renderChart(state.chart);
            }, 150);
        });
    }

    function setupDate() {
        const element = $("#current-date");
        if (!element) return;
        element.textContent = new Date().toLocaleDateString("sw-TZ", {
            weekday: "long",
            day: "2-digit",
            month: "long",
            year: "numeric"
        });
    }

    document.addEventListener("DOMContentLoaded", async () => {
        try {
            if (window.DukaAuth?.ready) await window.DukaAuth.ready;
        } catch {}
        renderGreeting();
        setupDate();
        bindPeriodControls();
        bindResize();
        await loadDashboard();
        await loadSalesOverview();
        window.setInterval(() => {
            loadDashboard();
            loadSalesOverview();
        }, 60000);
    });
})();
