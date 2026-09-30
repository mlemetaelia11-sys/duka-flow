"use strict";

(() => {
    const nativeFetch = window.fetch.bind(window);
    const path = window.location.pathname.replace(/\/+$/, "") || "/";
    const pageKey = path.split("/").filter(Boolean)[0] || "dashboard";
    if (document.body) document.body.dataset.page = pageKey;
    const savedSidebarState = document.cookie.match(/(?:^|; )dukaflow_sidebar_state=(open|closed)(?:;|$)/)?.[1];
    if (document.body) document.body.dataset.sidebarState = savedSidebarState || (window.matchMedia("(max-width: 760px)").matches ? "closed" : "open");
    const isPublicAuthPage = /^\/(login|register|password-reset|verify-email)(\/index\.html)?$/.test(path);
    const isOwnerPage = /^\/(users|business|subscriptions|audit-logs)(\/|$)/.test(path);
    let currentUser = null;

    window.fetch = (input, init = {}) => {
        const nextInit = { ...init };
        if (!("credentials" in nextInit)) nextInit.credentials = "include";
        return nativeFetch(input, nextInit);
    };

    const ICONS = {
        dashboard: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 13h6V4H4v9Zm0 7h6v-5H4v5Zm10 0h6V11h-6v9Zm0-16v5h6V4h-6Z"/></svg>`,
        products: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 3 10 0 3 5-8 11L4 8l3-5Zm1 4h8M9 11h6"/></svg>`,
        sales: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h16v16H4zM8 15l2-2 2 2 4-5"/></svg>`,
        customers: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 20v-1.5A3.5 3.5 0 0 0 12.5 15h-5A3.5 3.5 0 0 0 4 18.5V20m6-9a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm4.5-6.5a3 3 0 0 1 0 5.9"/></svg>`,
        debts: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4h12v16H6zM9 8h6M9 12h6M9 16h3"/></svg>`,
        suppliers: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 19h18M5 17V8l7-4 7 4v9M9 17v-5h6v5"/></svg>`,
        purchases: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h2l2 10h9l2-7H7m1 11h.01M17 19h.01"/></svg>`,
        inventory: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 8 4v10l-8 4-8-4V7l8-4Zm-8 4 8 4 8-4M12 11v10"/></svg>`,
        returns: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 7H5l4-4m-4 4 4 4M5 7h8a6 6 0 1 1-3.8 10.7"/></svg>`,
        reports: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19V5h16v14M7 16v-3m4 3V9m4 7v-6"/></svg>`,
        notifications: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Zm-8 11h4"/></svg>`,
        settings: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 1.3 2.5 2.8.4-2 2 .5 2.8-2.6-1.3-2.6 1.3.5-2.8-2-2 2.8-.4L12 3Zm0 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z"/></svg>`,
        users: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 20v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2m6-9a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm7-3a3 3 0 1 0 0-6m2 15v-2a4 4 0 0 0-3-3.9"/></svg>`,
        search: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m21 21-4.5-4.5M10.8 18a7.2 7.2 0 1 0 0-14.4 7.2 7.2 0 0 0 0 14.4Z"/></svg>`,
        spark: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7L12 3Zm7 11 .8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8L19 14Z"/></svg>`
    };

    function roleLabel(role) {
        return String(role || "")
            .replaceAll("_", " ")
            .replace(/\b\w/g, (letter) => letter.toUpperCase());
    }

    function getLanguage() { const match = document.cookie.match(/(?:^|; )dukaflow_language=([^;]+)/); return match?.[1] === "en" ? "en" : "sw"; }
    function setLanguage(language) { document.cookie = `dukaflow_language=${language === "en" ? "en" : "sw"}; Path=/; Max-Age=31536000; SameSite=Lax`; window.location.reload(); }
    const I18N_NAV = {
        sw: { Dashboard:"Dashibodi", Products:"Bidhaa", "Sales / POS":"Mauzo / POS", Customers:"Wateja", Debts:"Madeni", Inventory:"Stock", Returns:"Marejesho", Suppliers:"Wasambazaji", Purchases:"Manunuzi", "Purchase Returns":"Marejesho ya Manunuzi", "Cash Register":"Kasha", Reports:"Ripoti", Notifications:"Arifa", "Business Insights":"Maarifa ya Biashara", "Business Assistant":"DukaFlow Copilot", Approvals:"Idhini", "Customer Display":"Display ya Mteja", "Global Search":"Tafuta Kila Kitu", "My Account":"Akaunti Yangu", "Business Settings":"Mipangilio ya Biashara", Subscription:"Usajili", "Users & Staff":"Wafanyakazi", "Audit Logs":"Historia ya Mfumo", Overview:"Muhtasari", Operations:"Uendeshaji", Purchasing:"Manunuzi", Finance:"Fedha", Management:"Usimamizi", Account:"Akaunti", Administration:"Utawala" },
        en: {}
    };

    function navigationItems(user) {
        const items = [
            ["/", "Dashboard", "dashboard", null, "Primary"],
            ["/sales/", "Sales / POS", "sales", null, "Primary"],
            ["/products/", "Products", "products", null, "Primary"],
            ["/customers/", "Customers", "customers", null, "Primary"],
            ["/inventory/", "Inventory", "inventory", null, "Primary"],
            ["/reports/", "Reports", "reports", ["owner", "manager"], "Primary"],

            ["/debts/", "Debts", "debts", null, "Business"],
            ["/suppliers/", "Suppliers", "suppliers", ["owner", "manager"], "Business"],
            ["/purchases/", "Purchases", "purchases", ["owner", "manager"], "Business"],
            ["/purchase-returns/", "Purchase Returns", "returns", ["owner", "manager"], "Business"],
            ["/returns/", "Returns", "returns", ["owner", "manager"], "Business"],
            ["/expenses/", "Expenses", "reports", ["owner", "manager"], "Business"],
            ["/cash-register/", "Cash Register", "sales", null, "Business"],

            ["/assistant/", "Business Assistant", "spark", null, "Management"],
            ["/whatsapp/", "WhatsApp AI Agent", "spark", ["owner", "manager"], "Management"],
            ["/insights/", "Business Insights", "spark", null, "Management"],
            ["/notifications/", "Notifications", "notifications", null, "Management"],
            ["/approvals/", "Approvals", "settings", null, "Management"],
            ["/customer-display/", "Customer Display", "customers", null, "Management"],
            ["/search/", "Global Search", "search", null, "Management"],

            ["/account/", "My Account", "settings", null, "System"],
            ["/business/", "Business Settings", "settings", ["owner"], "System"],
            ["/subscriptions/", "Subscription", "settings", ["owner"], "System"],
            ["/users/", "Users & Staff", "users", ["owner"], "System"],
            ["/audit-logs/", "Audit Logs", "reports", ["owner"], "System"]
        ];

        const groupLabels = {
            Primary: { sw: "Msingi", en: "Primary" },
            Business: { sw: "Biashara", en: "Business" },
            Management: { sw: "Usimamizi", en: "Management" },
            System: { sw: "Mfumo", en: "System" }
        };

        const language = getLanguage();
        return items
            .filter((item) => !item[3] || item[3].includes(user.role))
            .map((item) => {
                const label = language === "sw" ? (I18N_NAV.sw[item[1]] || item[1]) : item[1];
                return [item[0], label, item[2], item[3], item[4], groupLabels[item[4]]?.[language] || item[4]];
            });
    }

    function decorateStaticBrand() {
        document.querySelectorAll(".auth-brand").forEach((brand) => {
            brand.innerHTML = `<img src="../assets/dukaflow-logo.png" alt="DukaFlow" class="brand-image brand-image-auth">`;
            brand.setAttribute("aria-label", "DukaFlow");
        });
    }

    function createSidebar() {
        const aside = document.createElement("aside");
        aside.className = "sidebar";
        aside.innerHTML = `
            <div class="sidebar-brand">
                <a href="/" class="sidebar-brand-link" aria-label="DukaFlow home">
                    <img src="/assets/dukaflow-mark.png" alt="" class="sidebar-logo-mark">
                    <span class="sidebar-wordmark"><strong>Duka</strong><b>Flow</b></span>
                </a>
                <span class="sidebar-tagline">Smart business. Better growth.</span>
            </div>
            <nav class="sidebar-nav" aria-label="Main navigation"></nav>
            <div class="sidebar-footer">
                <a class="sidebar-help" href="/assistant/">${ICONS.spark}<span>${getLanguage() === "sw" ? "Copilot & Maarifa" : "Get help & insights"}</span></a>
                <button type="button" class="sidebar-language-toggle" data-language-toggle>🌐 ${getLanguage() === "sw" ? "English" : "Swahili"}</button>
            </div>
        `;
        aside.querySelector("[data-language-toggle]")?.addEventListener("click", () => setLanguage(getLanguage() === "sw" ? "en" : "sw"));
        return aside;
    }

    function upgradeLegacyShell() {
        if (document.querySelector(".app-layout") || isPublicAuthPage) return;

        const siteHeader = document.querySelector(".site-header");
        const main = document.querySelector("main.container");
        if (!siteHeader || !main) return;

        const layout = document.createElement("div");
        layout.className = "app-layout";
        const sidebar = createSidebar();
        const mainContent = document.createElement("main");
        mainContent.className = `main-content ${Array.from(main.classList).filter((name) => name !== "container").join(" ")}`.trim();

        while (main.firstChild) mainContent.appendChild(main.firstChild);

        layout.append(sidebar, mainContent);
        siteHeader.remove();
        main.remove();
        document.body.prepend(layout);
    }

    function normalizeExistingSidebars() {
        document.querySelectorAll(".sidebar-brand").forEach((brand) => {
            brand.innerHTML = `
                <a href="/" class="sidebar-brand-link" aria-label="DukaFlow home">
                    <img src="/assets/dukaflow-mark.png" alt="" class="sidebar-logo-mark">
                    <span class="sidebar-wordmark"><strong>Duka</strong><b>Flow</b></span>
                </a>
                <span class="sidebar-tagline">Smart business. Better growth.</span>
            `;
        });
    }

    function renderNavigation(user) {
        const navs = document.querySelectorAll(".sidebar-nav, .main-nav");
        if (!navs.length) return;

        for (const nav of navs) {
            nav.innerHTML = "";
            const items = navigationItems(user);
            const normalizedPath = window.location.pathname.replace(/index\.html$/, "");

            const isActive = (href) =>
                href === "/"
                    ? normalizedPath === "/" || normalizedPath === "/index.html"
                    : normalizedPath.startsWith(href.replace(/\/$/, ""));

            if (nav.classList.contains("sidebar-nav")) {
                const groups = new Map();
                items.forEach((item) => {
                    const group = item[4] || "Primary";
                    if (!groups.has(group)) groups.set(group, []);
                    groups.get(group).push(item);
                });

                for (const [group, groupItems] of groups) {
                    if (group === "Primary") {
                        groupItems.forEach(([href, label, key]) => {
                            nav.appendChild(createNavLink(href, label, key, isActive(href)));
                        });
                        continue;
                    }

                    const details = document.createElement("details");
                    details.className = "nav-group";
                    details.open = groupItems.some(([href]) => isActive(href));

                    const summary = document.createElement("summary");
                    summary.className = "nav-group-summary";
                    summary.innerHTML = `<span>${escapeHtml(groupItems[0][5] || group)}</span><span class="nav-group-chevron">⌄</span>`;
                    details.appendChild(summary);

                    const list = document.createElement("div");
                    list.className = "nav-group-items";
                    groupItems.forEach(([href, label, key]) => {
                        list.appendChild(createNavLink(href, label, key, isActive(href)));
                    });
                    details.appendChild(list);
                    nav.appendChild(details);
                }
            } else {
                items.filter((item) => item[4] === "Primary").forEach(([href, label, key]) => {
                    nav.appendChild(createNavLink(href, label, key, isActive(href)));
                });
            }
        }

        function createNavLink(href, label, key, active) {
            const link = document.createElement("a");
            link.href = href;
            link.dataset.dukaNav = key;
            if (active) link.classList.add("active");

            const icon = document.createElement("span");
            icon.className = "nav-icon";
            icon.innerHTML = ICONS[key] || ICONS.settings;

            const text = document.createElement("span");
            text.className = "nav-label";
            text.textContent = label;

            link.append(icon, text);
            return link;
        }
    }

    function createTopbar(user) {
        const topbar = document.createElement("header");
        topbar.className = "app-topbar";
        const initial = String(user.name || "U").trim().charAt(0).toUpperCase();
        const businessName = user.business_name || user.businessName || "DukaFlow";
        topbar.innerHTML = `
            <div class="topbar-left">
                <button class="mobile-menu-toggle" type="button" aria-label="Open navigation" aria-expanded="false"><span class="menu-icon" aria-hidden="true"><i></i><i></i><i></i></span></button>
                <div class="topbar-heading">
                    <span class="topbar-eyebrow">${escapeHtml(businessName)}</span>
                    <strong class="topbar-title">${getLanguage() === "sw" ? "Business workspace" : "Business workspace"}</strong>
                </div>
            </div>
            <div class="topbar-center">
                <a href="/search/" class="global-search-trigger" aria-label="Global search">
                    ${ICONS.search}
                    <span>${getLanguage() === "sw" ? "Tafuta bidhaa, wateja, mauzo..." : "Search products, customers, sales..."}</span>
                    <kbd>Ctrl K</kbd>
                </a>
            </div>
            <div class="topbar-right">
                <label class="branch-switcher"><span>${getLanguage() === "sw" ? "Tawi" : "Branch"}</span><select data-branch-select><option>Loading...</option></select></label>
                <button type="button" class="topbar-language-button" data-topbar-language aria-label="Change language">${getLanguage() === "sw" ? "SW" : "EN"}</button>
                <a href="/notifications/" class="topbar-icon-button" aria-label="Notifications">
                    ${ICONS.notifications}
                    <b data-notification-badge hidden>0</b>
                </a>
                <div class="topbar-account">
                    <button type="button" class="topbar-account-trigger" aria-expanded="false" aria-haspopup="menu">
                        <div class="topbar-avatar">${escapeHtml(initial)}</div>
                        <div class="topbar-user-copy">
                            <strong>${escapeHtml(user.name || "User")}</strong>
                            <span>${escapeHtml(roleLabel(user.role))}</span>
                        </div>
                        <span class="topbar-account-chevron">⌄</span>
                    </button>
                    <div class="topbar-account-menu" role="menu" hidden>
                        <div class="topbar-menu-profile">
                            <div class="topbar-avatar large">${escapeHtml(initial)}</div>
                            <div><strong>${escapeHtml(user.name || "User")}</strong><span>${escapeHtml(user.email || "")}</span></div>
                        </div>
                        <a href="/account/" role="menuitem">Akaunti yangu</a>
                        ${user.role === "owner" ? '<a href="/business/" role="menuitem">Mipangilio ya biashara</a>' : ""}
                        ${user.role === "owner" ? '<a href="/subscriptions/" role="menuitem">Usajili</a>' : ""}
                        <button type="button" data-topbar-logout role="menuitem">Toka</button>
                    </div>
                </div>
            </div>
        `;

        topbar.querySelector("[data-topbar-language]")?.addEventListener("click", () => setLanguage(getLanguage() === "sw" ? "en" : "sw"));
        topbar.querySelector("[data-topbar-logout]").addEventListener("click", logout);
        const trigger = topbar.querySelector(".topbar-account-trigger");
        const menu = topbar.querySelector(".topbar-account-menu");
        trigger.addEventListener("click", (event) => {
            event.stopPropagation();
            const open = menu.hidden;
            menu.hidden = !open;
            trigger.setAttribute("aria-expanded", open ? "true" : "false");
        });
        document.addEventListener("click", () => {
            if (!menu.hidden) {
                menu.hidden = true;
                trigger.setAttribute("aria-expanded", "false");
            }
        }, { once: false });
        loadBranches(topbar.querySelector("[data-branch-select]"));
        const menuButton = topbar.querySelector(".mobile-menu-toggle");
        initializeSidebarState(menuButton, topbar);
        menuButton.addEventListener("click", toggleSidebar);
        return topbar;
    }

    async function loadBranches(select){if(!select)return;try{const a=await fetch("/api/branches/"),d=await a.json(),c=await fetch("/api/branches/current"),cur=await c.json();select.innerHTML=(d.branches||[]).filter(x=>x.is_active).map(x=>`<option value="${x.id}" ${Number(x.id)===Number(cur.branch?.id)?"selected":""}>${escapeHtml(x.name)}</option>`).join("");select.onchange=async()=>{const r=await fetch("/api/branches/select",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({branchId:Number(select.value)})});if(r.ok)location.reload()}}catch{select.innerHTML="<option>Branch</option>"}}

    function ensureTopbar(user) {
        const main = document.querySelector(".main-content");
        if (!main || main.querySelector(":scope > .app-topbar")) return;
        const topbar = createTopbar(user);
        main.prepend(topbar);
    }

    function ensureMobileBottomNav(user) {
        if (document.querySelector(".mobile-bottom-nav")) return;
        const nav = document.createElement("nav");
        nav.className = "mobile-bottom-nav";
        const items = navigationItems(user).slice(0, 4);
        items.forEach(([href, label, key]) => {
            const link = document.createElement("a");
            link.href = href;
            link.className = href !== "/" && window.location.pathname.startsWith(href.replace(/\/$/, "")) ? "active" : (href === "/" && window.location.pathname === "/" ? "active" : "");
            link.innerHTML = `<span class="nav-icon">${ICONS[key] || ICONS.settings}</span><span>${escapeHtml(label.replace(" / POS", ""))}</span>`;
            nav.appendChild(link);
        });
        const more = document.createElement("button");
        more.type = "button";
        more.innerHTML = `<span class="nav-icon">${ICONS.settings}</span><span>More</span>`;
        more.addEventListener("click", toggleSidebar);
        nav.appendChild(more);
        document.body.appendChild(nav);
    }

    function addUserArea(user) {
        document.querySelectorAll(".auth-user-area").forEach((element) => element.remove());
        ensureTopbar(user);

        if (!document.querySelector(".app-topbar") && document.querySelector(".header-content")) {
            const area = document.createElement("div");
            area.className = "auth-user-area";
            area.textContent = `${user.name || "User"} · ${roleLabel(user.role)}`;
            document.querySelector(".header-content")?.appendChild(area);
        }

        refreshNotificationBadge();
    }

    async function refreshNotificationBadge() {
        const badges = document.querySelectorAll("[data-notification-badge]");
        if (!badges.length || !currentUser) return;

        try {
            const response = await nativeFetch("/api/notifications/unread-count", {
                credentials: "include",
                headers: { Accept: "application/json" }
            });
            if (!response.ok) return;
            const payload = await response.json();
            const count = Number(payload.count || 0);
            badges.forEach((badge) => {
                badge.textContent = count > 99 ? "99+" : String(count);
                badge.hidden = count === 0;
            });
        } catch {
            badges.forEach((badge) => { badge.hidden = true; });
        }
    }

    async function logout() {
        try {
            await nativeFetch("/api/auth/logout", {
                method: "POST",
                credentials: "include",
                headers: { Accept: "application/json" }
            });
        } finally {
            window.location.replace("/login/");
        }
    }

    function setupNetworkStatus() {
        if (document.querySelector("#dukaflow-network-status")) return;

        const banner = document.createElement("div");
        banner.id = "dukaflow-network-status";
        banner.className = "network-status-banner";
        banner.setAttribute("role", "status");
        document.body.appendChild(banner);

        const update = () => {
            if (navigator.onLine) {
                banner.textContent = "Back online.";
                banner.dataset.online = "true";
                window.setTimeout(() => {
                    if (navigator.onLine) banner.classList.remove("visible");
                }, 1800);
            } else {
                banner.textContent = "You are offline. Server-backed actions are unavailable until connection returns.";
                banner.dataset.online = "false";
                banner.classList.add("visible");
            }
        };

        window.addEventListener("offline", update);
        window.addEventListener("online", update);
        update();
    }

    function initializeSidebarState(button, topbar) {
        const mobile = window.matchMedia("(max-width: 760px)").matches;
        const saved = document.cookie.match(/(?:^|; )dukaflow_sidebar_state=(open|closed)(?:;|$)/)?.[1];
        const isOpen = saved ? saved === "open" : !mobile;
        let backdrop = document.querySelector(".sidebar-backdrop");
        if (!backdrop) {
            backdrop = document.createElement("div");
            backdrop.className = "sidebar-backdrop";
            backdrop.setAttribute("aria-hidden", "true");
            document.body.append(backdrop);
            backdrop.addEventListener("click", () => setSidebarOpen(false, button, topbar));
        }
        setSidebarOpen(isOpen, button, topbar, false);
        document.addEventListener("keydown", (event) => {
            if (event.key === "Escape" && document.body.dataset.sidebarState === "open") {
                setSidebarOpen(false, button, topbar);
            }
        });
    }

    function setSidebarOpen(isOpen, button = document.querySelector(".mobile-menu-toggle"), topbar = document.querySelector(".app-topbar"), persist = true) {
        document.body.dataset.sidebarState = isOpen ? "open" : "closed";
        if (!button) return;
        const sidebarBrand = document.querySelector(".sidebar-brand");
        const topbarLeft = topbar?.querySelector(".topbar-left");
        if (isOpen && sidebarBrand) sidebarBrand.append(button);
        else if (!isOpen && topbarLeft) {
            if (persist && button.parentElement === sidebarBrand) {
                window.setTimeout(() => topbarLeft.prepend(button), 280);
            } else {
                topbarLeft.prepend(button);
            }
        }
        button.setAttribute("aria-label", isOpen ? "Close navigation" : "Open navigation");
        button.setAttribute("aria-expanded", isOpen ? "true" : "false");
        button.tabIndex = 0;
        if (persist) document.cookie = `dukaflow_sidebar_state=${isOpen ? "open" : "closed"}; Path=/; Max-Age=31536000; SameSite=Lax`;
    }

    function toggleSidebar() {
        const button = document.querySelector(".mobile-menu-toggle");
        setSidebarOpen(document.body.dataset.sidebarState !== "open", button);
    }

    function setupSplash() {
        if (isPublicAuthPage || window.location.pathname !== "/") return;
        if (document.querySelector("#app-splash")) return;

        const splash = document.createElement("div");
        splash.id = "app-splash";
        splash.innerHTML = `
            <div class="splash-wave splash-wave-top"></div>
            <div class="splash-content">
                <img src="/assets/dukaflow-logo.png" alt="DukaFlow" class="splash-logo">
                <p>Duka Lako, Biashara Iko Flow</p>
                <div class="splash-loader"><span></span></div>
            </div>
            <div class="splash-wave splash-wave-bottom"></div>
        `;
        document.body.appendChild(splash);
    }

    function hideSplash() {
        const splash = document.querySelector("#app-splash");
        if (!splash) return;
        window.setTimeout(() => splash.classList.add("is-hidden"), 700);
        window.setTimeout(() => splash.remove(), 1300);
    }

    function escapeHtml(value) {
        return String(value)
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    }

    async function checkSession() {
        setupSplash();
        upgradeLegacyShell();
        decorateStaticBrand();
        normalizeExistingSidebars();

        try {
            const response = await nativeFetch("/api/auth/me", {
                credentials: "include",
                headers: { Accept: "application/json" }
            });

            if (!response.ok) {
                if (!isPublicAuthPage) window.location.replace("/login/");
                hideSplash();
                return null;
            }

            const payload = await response.json();
            currentUser = payload.user || null;

            if (!currentUser) {
                if (!isPublicAuthPage) window.location.replace("/login/");
                hideSplash();
                return null;
            }

            window.__DUKAFLOW_USER__ = currentUser;

            if (isPublicAuthPage) {
                window.location.replace("/");
                return currentUser;
            }

            if (isOwnerPage && currentUser.role !== "owner") {
                window.location.replace("/");
                return currentUser;
            }

            setupNetworkStatus();
            renderNavigation(currentUser);
            addUserArea(currentUser);
            ensureMobileBottomNav(currentUser);
            hideSplash();
            return currentUser;
        } catch (error) {
            hideSplash();
            if (!isPublicAuthPage) window.location.replace("/login/");
            else console.error("Session check failed:", error);
            return null;
        }
    }

    document.addEventListener("click", (event) => {
        if (event.target.closest(".sidebar a") && window.matchMedia("(max-width: 760px)").matches) {
            setSidebarOpen(false);
        }
    });

    decorateStaticBrand();
    const ready = checkSession();

    if ("serviceWorker" in navigator) {
        window.addEventListener("load", () => {
            navigator.serviceWorker.register("/sw.js").catch(() => {});
        });
    }

    window.DukaAuth = {
        ready,
        logout,
        refreshNotificationBadge,
        get user() {
            return currentUser;
        }
    };
})();

/* =========================================================
   PRODUCTION UX: BRANCH + LANGUAGE + OFFLINE STATUS
   ========================================================= */
(() => {
    const api = async (url, options={}) => {
        const response = await fetch(url, { ...options, credentials: "include", headers: { "Content-Type": "application/json", ...(options.headers||{}) } });
        const data = await response.json().catch(()=>({}));
        if (!response.ok) throw new Error(data.message || "Request failed");
        return data;
    };
    async function mountBranchSwitcher(){
        const topbar=document.querySelector(".app-topbar");
        if(!topbar || topbar.querySelector("[data-branch-switcher]")) return;
        try{
            const [list,current]=await Promise.all([api("/api/branches"),api("/api/branches/current")]);
            const wrap=document.createElement("div"); wrap.dataset.branchSwitcher="1"; wrap.className="branch-switcher";
            const select=document.createElement("select"); select.setAttribute("aria-label","Business branch");
            (list.branches||[]).filter(b=>b.is_active).forEach(b=>{const o=document.createElement("option");o.value=b.id;o.textContent=b.name;select.appendChild(o)});
            if(current.branch) select.value=String(current.branch.id);
            select.addEventListener("change",async()=>{select.disabled=true;try{await api("/api/branches/select",{method:"POST",body:JSON.stringify({branchId:Number(select.value)})});window.location.reload()}catch(e){alert(e.message);select.disabled=false}});
            wrap.appendChild(select); topbar.querySelector(".topbar-center")?.before(wrap) || topbar.querySelector(".topbar-left")?.appendChild(wrap);
        }catch{}
    }
    function mountOfflineIndicator(){
        if(document.querySelector("[data-offline-indicator]"))return;
        const el=document.createElement("div");el.dataset.offlineIndicator="1";el.className="offline-indicator";el.setAttribute("aria-live","polite");document.body.appendChild(el);
        const render=()=>{const offline=!navigator.onLine;const pending=window.DukaFlowOffline?.pending?.()||0;el.textContent=offline?`Offline · ${pending} pending`:pending?`Syncing · ${pending} pending`:"";el.classList.toggle("visible",offline||pending>0)};
        window.addEventListener("online",render);window.addEventListener("offline",render);window.addEventListener("dukaflow:offline-queue",render);render();
    }
    function init(){mountBranchSwitcher();mountOfflineIndicator();}
    if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
})();
