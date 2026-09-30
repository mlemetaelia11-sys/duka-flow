"use strict";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const CURRENT_DEFAULT_MODEL = "openai/gpt-oss-120b";
const RETIRED_MODELS = new Set([
    "llama-3.3-70b-versatile",
    "llama-3.1-8b-instant"
]);

function resolveModel(model) {
    const requested = String(model || process.env.GROQ_MODEL || "").trim();
    if (!requested || RETIRED_MODELS.has(requested)) return CURRENT_DEFAULT_MODEL;
    return requested;
}

async function request({ key, model, messages, tools, toolChoice, temperature }) {
    const response = await fetch(GROQ_URL, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            model,
            messages,
            tools,
            tool_choice: toolChoice,
            temperature,
            max_tokens: 1200
        })
    });
    const payload = await response.json().catch(() => ({}));
    return { response, payload };
}

async function chat({ model, messages, tools = [], toolChoice = "auto", temperature = 0.2 }) {
    const key = process.env.GROQ_API_KEY;
    if (!key) throw new Error("Groq is not configured.");

    const primaryModel = resolveModel(model);
    let { response, payload } = await request({
        key,
        model: primaryModel,
        messages,
        tools,
        toolChoice,
        temperature
    });

    // Backward compatibility for old .env files that still request a retired model.
    // Groq retired llama-3.3-70b-versatile on 2026-08-16, so retry once on the
    // current tool-capable production model when an old model ID is rejected.
    const requestedModel = String(model || process.env.GROQ_MODEL || "").trim();
    const shouldFallback = !response.ok && RETIRED_MODELS.has(requestedModel)
        && primaryModel !== CURRENT_DEFAULT_MODEL;

    if (shouldFallback) {
        ({ response, payload } = await request({
            key,
            model: CURRENT_DEFAULT_MODEL,
            messages,
            tools,
            toolChoice,
            temperature
        }));
    }

    if (!response.ok) {
        throw new Error(payload.error?.message || `Groq request failed (HTTP ${response.status}).`);
    }
    return payload;
}

module.exports = { chat, resolveModel, CURRENT_DEFAULT_MODEL };
