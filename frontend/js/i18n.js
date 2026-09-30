"use strict";
(() => {
    const sw = {
        Dashboard:"Dashibodi", Sales:"Mauzo", Inventory:"Stock", Customers:"Wateja", Debts:"Madeni", Expenses:"Matumizi", Reports:"Ripoti", Suppliers:"Wasambazaji", Purchases:"Manunuzi", Products:"Bidhaa", Status:"Hali", Total:"Jumla", Amount:"Kiasi", Notes:"Maelezo", Email:"Barua pepe", Action:"Kitendo", Actions:"Vitendo", Paid:"Imelipwa", Customer:"Mteja", Supplier:"Msambazaji", Profit:"Faida", Type:"Aina", Phone:"Simu", History:"Historia", Cancel:"Ghairi", Cash:"Taslimu", Bank:"Benki", Receipt:"Risiti", Name:"Jina", Reference:"Rejea", Method:"Njia", Revenue:"Mapato", Balance:"Salio", Purchase:"Manunuzi", Payment:"Malipo", Reason:"Sababu", Address:"Anwani", Search:"Tafuta", Role:"Wadhifa", Password:"Nenosiri", Close:"Funga", Details:"Maelezo", Price:"Bei", Created:"Imeundwa", Quantity:"Kiasi", Qty:"Idadi", Date:"Tarehe", Loading:"Inapakia", "Add Product":"Ongeza bidhaa", "Add Customer":"Ongeza mteja", "Add Supplier":"Ongeza msambazaji", "Add User":"Ongeza mtumiaji", "Record Payment":"Rekodi malipo", "Change Password":"Badilisha nenosiri", "New Password":"Nenosiri jipya", "Current Password":"Nenosiri la sasa", "Confirm Password":"Thibitisha nenosiri", "Buying Price":"Bei ya kununua", "Selling Price":"Bei ya kuuza", "Low Stock":"Stock ndogo", "Stock Movements":"Miondoko ya stock", "Stock Value":"Thamani ya stock", "Adjust Stock":"Rekebisha stock", "Save Changes":"Hifadhi mabadiliko", "Business Name":"Jina la biashara", "Business Settings":"Mipangilio ya biashara", "Today's Sales":"Mauzo ya leo", "Today's Profit":"Faida ya leo", "Number of Sales":"Idadi ya mauzo", "Outstanding Debts":"Madeni yanayodaiwa", "Inventory Value":"Thamani ya stock", "Recent Transactions":"Miamala ya hivi karibuni", "Top Products":"Bidhaa zinazoongoza", "Payment Methods":"Njia za malipo", "Staff Performance":"Utendaji wa wafanyakazi", "Sign in":"Ingia", "Create account":"Fungua akaunti", "Sign up with Google":"Jisajili kwa Google", "Already have an account?":"Una akaunti tayari?", "or":"au", "Mark all read":"Weka zote zimesomwa", "Open Register":"Fungua kasha", "Close Register":"Funga kasha", "Cash In":"Ingiza pesa", "Cash Out":"Toa pesa", "Generate":"Tengeneza", "Export CSV":"Hamisha CSV", "Select customer":"Chagua mteja", "Select product":"Chagua bidhaa", "Complete Sale":"Kamilisha mauzo", "Complete Return":"Kamilisha urejeshaji"
    };

    const getCookie = (name) => {
        const match = document.cookie.match(new RegExp(`(?:^|; )${name.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}=([^;]*)`));
        return match ? decodeURIComponent(match[1]) : null;
    };
    const setCookie = (name, value) => {
        document.cookie = `${name}=${encodeURIComponent(value)}; Max-Age=31536000; Path=/; SameSite=Lax`;
    };

    let lang = getCookie("dukaflow_language") === "en" ? "en" : "sw";

    function apply() {
        document.documentElement.lang = lang;
        document.querySelectorAll("body *").forEach((el) => {
            if (el.children.length || ["SCRIPT", "STYLE", "SVG"].includes(el.tagName)) return;
            const raw = el.dataset.i18nOriginal || el.textContent.trim();
            if (!raw || raw.length > 80) return;
            el.dataset.i18nOriginal = raw;
            if (lang === "sw") el.textContent = sw[raw] || raw;
            else el.textContent = raw;
        });
        const floating = document.querySelector("#dukaflow-language-toggle");
        if (floating) floating.remove();
    }

    document.addEventListener("DOMContentLoaded", apply);
    window.DukaI18n = {
        get language() { return lang; },
        setLanguage(value) {
            lang = value === "en" ? "en" : "sw";
            setCookie("dukaflow_language", lang);
            apply();
            window.location.reload();
        }
    };
})();
