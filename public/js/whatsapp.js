"use strict";

const $ = (selector) => document.querySelector(selector);
let selectedConversation = null;
let settings = null;

const esc = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

async function api(url, options = {}) {
	const response = await fetch(url, {
		credentials: "include",
		...options,
		headers: { Accept: "application/json", "Content-Type": "application/json", ...(options.headers || {}) }
	});
	const data = await response.json().catch(() => ({}));
	if (!response.ok) throw new Error(data.message || `Request failed (${response.status})`);
	return data;
}

function connected() {
	return settings?.account?.status === "connected" && settings.account.is_enabled;
}

function showConnectionState(text) {
	const state = $("#wa-connection-state");
	state.textContent = text;
	state.hidden = !text;
}

function renderConnection() {
	const account = settings?.account;
	const isConnected = connected();
	const pill = $("#wa-status-pill");
	pill.className = `wa-pill ${isConnected ? "online" : "offline"}`;
	pill.textContent = isConnected ? "Connected" : "Not connected";
	$("#wa-agent-toggle").textContent = `AI Sales Agent: ${isConnected && account.ai_enabled ? "ON" : "OFF"}`;
	$("#wa-agent-toggle").disabled = !isConnected;
	$("#wa-connect-panel").hidden = isConnected;
	$("#wa-connected-panel").hidden = !isConnected;
	$("#wa-settings-details").hidden = !isConnected;
	$("#wa-business-name").textContent = account?.business_name || "WhatsApp Business";
	$("#wa-connected-phone").textContent = account?.display_phone_number || account?.phone_number_id || "—";
	$("#wa-auto").checked = account?.auto_create_orders !== false;
	$("#wa-welcome").value = account?.welcome_message || "";

	const note = $("#wa-meta-note");
	note.hidden = Boolean(settings?.provider?.metaConfigured);
	note.textContent = note.hidden ? "" : "Meta WhatsApp configuration required";
	if (!isConnected && account?.status === "needs_attention") showConnectionState("WhatsApp connection needs attention");

	const configNote = $("#wa-config-note");
	configNote.textContent = settings?.provider?.verifyConfigured
		? `${location.origin}/api/whatsapp/webhook · Subscribe to the messages webhook field in Meta.`
		: "Configure Meta webhook credentials to receive customer messages.";
}

async function loadSettings() {
	settings = await api("/api/whatsapp/settings");
	renderConnection();
}

async function loadAnalytics() {
	try {
		const data = await api("/api/whatsapp/analytics");
		const analytics = data.analytics || {};
		$("#wa-stat-messages").textContent = Number(analytics.messages_today || 0).toLocaleString();
		$("#wa-stat-ai").textContent = Number(analytics.ai_replies_today || 0).toLocaleString();
		$("#wa-stat-orders").textContent = Number(analytics.orders_today || 0).toLocaleString();
		$("#wa-stat-revenue").textContent = `TZS ${Number(analytics.revenue_today || 0).toLocaleString()}`;
	} catch {
		$("#wa-stat-messages").textContent = "—";
	}
}

async function loadConversations() {
	const data = await api("/api/whatsapp/conversations");
	const list = $("#wa-conversation-list");
	if (!data.conversations?.length) {
		list.innerHTML = '<div class="wa-empty">No conversations yet.<small>Customer messages will appear here.</small></div>';
		return;
	}
	list.innerHTML = data.conversations.map((conversation) => `<button class="wa-conversation ${Number(conversation.conversation_id) === Number(selectedConversation) ? "active" : ""}" data-id="${conversation.conversation_id}"><span class="wa-avatar">${esc((conversation.name || "WA").slice(0, 2).toUpperCase())}</span><span><strong>${esc(conversation.name || conversation.wa_id)}</strong><small>${esc(conversation.last_message || "No messages")}</small></span><time>${conversation.last_message_at ? new Date(conversation.last_message_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}</time></button>`).join("");
	list.querySelectorAll("[data-id]").forEach((button) => button.addEventListener("click", () => openConversation(Number(button.dataset.id), button.querySelector("strong").textContent)));
}

async function openConversation(id, name) {
	selectedConversation = id;
	$("#wa-reply-form").hidden = false;
	$("#wa-chat-head").innerHTML = `<div class="wa-avatar">${esc((name || "WA").slice(0, 2).toUpperCase())}</div><div><strong>${esc(name)}</strong><small>WhatsApp customer</small></div>`;
	const data = await api(`/api/whatsapp/conversations/${id}/messages`);
	$("#wa-messages").innerHTML = data.messages.map((message) => `<div class="wa-bubble ${message.direction === "inbound" ? "in" : "out"}"><span>${esc(message.body || "")}</span><small>${esc(message.sender_type)} · ${new Date(message.created_at).toLocaleString()}</small></div>`).join("");
	$("#wa-messages").scrollTop = $("#wa-messages").scrollHeight;
	await loadConversations();
}

function loadFacebookSdk(appId, version) {
	if (window.FB) {
		window.FB.init({ appId, xfbml: false, version });
		return Promise.resolve();
	}
	return new Promise((resolve, reject) => {
		window.fbAsyncInit = () => {
			window.FB.init({ appId, xfbml: false, version });
			resolve();
		};
		const script = document.createElement("script");
		script.async = true;
		script.defer = true;
		script.crossOrigin = "anonymous";
		script.src = "https://connect.facebook.net/en_US/sdk.js";
		script.onerror = () => reject(new Error("Meta SDK unavailable"));
		document.head.append(script);
	});
}

function embeddedSignup(config) {
	return new Promise((resolve, reject) => {
		let code = null;
		let signup = null;
		let settled = false;
		const timeout = window.setTimeout(() => finish(new Error("Meta signup timed out")), 180000);
		const finish = (error) => {
			if (settled) return;
			settled = true;
			window.clearTimeout(timeout);
			window.removeEventListener("message", onMessage);
			if (error) reject(error);
			else resolve({ code, ...signup });
		};
		const onMessage = (event) => {
			if (!/^https:\/\/(www\.)?facebook\.com$/i.test(event.origin)) return;
			let payload;
			try { payload = typeof event.data === "string" ? JSON.parse(event.data) : event.data; } catch { return; }
			if (payload?.type !== "WA_EMBEDDED_SIGNUP") return;
			if (payload.event === "CANCEL" || payload.event === "ERROR") return finish(new Error("Meta signup cancelled"));
			if (payload.event !== "FINISH") return;
			const data = payload.data || {};
			signup = { wabaId: String(data.waba_id || ""), phoneNumberId: String(data.phone_number_id || "") };
			if (code) finish();
		};
		window.addEventListener("message", onMessage);
		window.FB.login((response) => {
			code = String(response?.authResponse?.code || "");
			if (!code) return finish(new Error("Meta authorization cancelled"));
			if (signup) finish();
		}, {
			config_id: config.configId,
			response_type: "code",
			override_default_response_type: true,
			extras: { setup: {} }
		});
	});
}

async function startConnection() {
	const button = $("#wa-connect");
	const retry = $("#wa-connect-retry");
	button.disabled = true;
	retry.disabled = true;
	$("#wa-connection-error").hidden = true;
	showConnectionState("Connecting...");
	try {
		const config = await api("/api/whatsapp/connect/start", { method: "POST", body: "{}" });
		if (!config.configured) {
			$("#wa-meta-note").hidden = false;
			$("#wa-meta-note").textContent = "Meta WhatsApp configuration required";
			showConnectionState("");
			return;
		}
		await loadFacebookSdk(config.appId, config.graphVersion);
		showConnectionState("Waiting for Meta...");
		const signup = await embeddedSignup(config);
		showConnectionState("Verifying WhatsApp...");
		await api("/api/whatsapp/connect", { method: "POST", body: JSON.stringify(signup) });
		await loadSettings();
		showConnectionState("Connected successfully!");
	} catch {
		showConnectionState("");
		$("#wa-connection-error").hidden = false;
	} finally {
		button.disabled = false;
		retry.disabled = false;
	}
}

async function toggleAgent() {
	if (!connected()) return;
	const enabled = !settings.account.ai_enabled;
	try {
		await api("/api/whatsapp/agent/toggle", { method: "POST", body: JSON.stringify({ enabled }) });
		await loadSettings();
	} catch {
		showConnectionState("Could not update the AI Sales Agent. Please try again.");
	}
}

async function testConnection() {
	const button = $("#wa-test-connection");
	button.disabled = true;
	showConnectionState("Verifying WhatsApp...");
	try {
		const result = await api("/api/whatsapp/connection/test", { method: "POST", body: "{}" });
		showConnectionState(result.healthy ? "WhatsApp connection is healthy" : "WhatsApp connection needs attention");
		await loadSettings();
	} catch {
		showConnectionState("WhatsApp connection needs attention");
	} finally {
		button.disabled = false;
	}
}

async function disconnect() {
	const button = $("#wa-disconnect-confirm");
	button.disabled = true;
	try {
		await api("/api/whatsapp/connection", { method: "DELETE" });
		$("#wa-disconnect-dialog").close();
		showConnectionState("WhatsApp disconnected");
		await loadSettings();
		await loadConversations();
	} catch {
		showConnectionState("Could not disconnect WhatsApp. Please try again.");
	} finally {
		button.disabled = false;
	}
}

document.addEventListener("DOMContentLoaded", async () => {
	await DukaAuth.ready;
	try {
		await loadSettings();
		await Promise.all([loadAnalytics(), loadConversations()]);
		if (settings.provider.metaConfigured) loadFacebookSdk(settings.provider.metaAppId, settings.provider.graphVersion).catch(() => {});
	} catch {
		$("#wa-config-note").textContent = "WhatsApp settings could not be loaded.";
	}

	$("#wa-refresh").addEventListener("click", async () => { await loadAnalytics(); await loadConversations(); });
	$("#wa-agent-toggle").addEventListener("click", toggleAgent);
	$("#wa-connect").addEventListener("click", startConnection);
	$("#wa-connect-retry").addEventListener("click", startConnection);
	$("#wa-test-connection").addEventListener("click", testConnection);
	$("#wa-settings-open").addEventListener("click", () => { $("#wa-settings-details").open = !$("#wa-settings-details").open; });
	$("#wa-disconnect-open").addEventListener("click", () => $("#wa-disconnect-dialog").showModal());
	$("#wa-disconnect-cancel").addEventListener("click", () => $("#wa-disconnect-dialog").close());
	$("#wa-disconnect-confirm").addEventListener("click", (event) => { event.preventDefault(); disconnect(); });

	$("#wa-settings-form").addEventListener("submit", async (event) => {
		event.preventDefault();
		try {
			await api("/api/whatsapp/settings", { method: "POST", body: JSON.stringify({ autoCreateOrders: $("#wa-auto").checked, welcomeMessage: $("#wa-welcome").value }) });
			await loadSettings();
			showConnectionState("WhatsApp settings saved");
		} catch {
			showConnectionState("Could not save WhatsApp settings. Please try again.");
		}
	});

	$("#wa-reply-form").addEventListener("submit", async (event) => {
		event.preventDefault();
		const input = $("#wa-reply-input");
		if (!selectedConversation || !input.value.trim()) return;
		try {
			await api(`/api/whatsapp/conversations/${selectedConversation}/reply`, { method: "POST", body: JSON.stringify({ message: input.value.trim() }) });
			input.value = "";
			await openConversation(selectedConversation, $("#wa-chat-head strong").textContent);
		} catch {
			showConnectionState("Could not send your message. Please try again.");
		}
	});

	$("#wa-takeover").addEventListener("click", async () => {
		if (!selectedConversation) return;
		const human = $("#wa-takeover").dataset.human !== "true";
		try {
			await api(`/api/whatsapp/conversations/${selectedConversation}/takeover`, { method: "POST", body: JSON.stringify({ human }) });
			$("#wa-takeover").dataset.human = String(human);
			$("#wa-takeover").textContent = human ? "Return to AI" : "Human takeover";
		} catch {
			showConnectionState("Could not update conversation takeover. Please try again.");
		}
	});
});
