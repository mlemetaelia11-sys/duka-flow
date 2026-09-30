"use strict";

(async () => {
    const target = document.querySelector("[data-provider-status]");
    if (!target) return;

    try {
        const response = await fetch("/api/integrations/status", {
            credentials: "include",
            headers: { Accept: "application/json" }
        });
        if (!response.ok) return;

        const data = await response.json();
        const providers = Object.values(data.providers || {});
        const live = providers.filter((p) => p.configured && p.mode !== "disabled").length;
        const total = providers.length;

        target.dataset.configured = String(live);
        target.dataset.total = String(total);
        target.textContent = `${live}/${total} integrations configured`;
    } catch {
        // Provider status is informational; never block the application.
    }
})();
