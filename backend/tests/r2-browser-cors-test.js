"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { test } = require("node:test");
const dotenv = require("dotenv");

dotenv.config({ path: path.join(__dirname, "..", ".env"), override: true, quiet: true });

const { presignPut } = require("../services/r2");

const origin = "https://dukaflowtz.vercel.app";
const contentType = "text/plain";
const key = `businesses/42/r2-browser-cors-test/${Date.now()}.txt`;
const body = Buffer.from("DukaFlow browser CORS diagnostic");

function readCorsHeaders(response) {
    return {
        "access-control-allow-origin": response.headers.get("access-control-allow-origin") || "<missing>",
        "access-control-allow-methods": response.headers.get("access-control-allow-methods") || "<missing>",
        "access-control-allow-headers": response.headers.get("access-control-allow-headers") || "<missing>"
    };
}

function safeResponseBody(bodyText) {
    let safeBody = String(bodyText);
    for (const name of ["R2_SECRET_ACCESS_KEY", "R2_ACCESS_KEY_ID"]) {
        const value = process.env[name];
        if (value) safeBody = safeBody.replaceAll(value, "[REDACTED]");
    }
    return safeBody
        .replace(/https?:\/\/[^\s<>"']+/gi, "[URL REDACTED]")
        .replace(/<(Signature|SignatureProvided|StringToSign|CanonicalRequest|Credential|AccessKeyId|SecretAccessKey)>([\s\S]*?)<\/\1>/gi, "<$1>[REDACTED]</$1>")
        .replace(/([?&]X-Amz-(?:Signature|Credential|Security-Token)=)[^&\s<>"']+/gi, "$1[REDACTED]");
}

function includesHeader(value, expected) {
    return value.split(",").some((item) => item.trim().toLowerCase() === expected.toLowerCase() || item.trim() === "*");
}

test("R2 allows the production browser origin to preflight and PUT", async () => {
    const uploadUrl = await presignPut(key, contentType);
    let preflight;
    try {
        preflight = await fetch(uploadUrl, {
            method: "OPTIONS",
            headers: {
                Origin: origin,
                "Access-Control-Request-Method": "PUT",
                "Access-Control-Request-Headers": "content-type"
            }
        });
    } catch {
        throw new Error("R2 OPTIONS preflight failed before receiving an HTTP response.");
    }

    const preflightHeaders = readCorsHeaders(preflight);
    console.log("R2 preflight diagnostics:", JSON.stringify({
        httpStatus: preflight.status,
        headers: preflightHeaders
    }));

    let upload;
    try {
        upload = await fetch(uploadUrl, {
            method: "PUT",
            headers: {
                Origin: origin,
                "Content-Type": contentType
            },
            body
        });
    } catch {
        throw new Error("R2 PUT failed before receiving an HTTP response.");
    }

    const responseBody = safeResponseBody(await upload.text());
    const allowOrigin = upload.headers.get("access-control-allow-origin") || "<missing>";
    console.log("R2 PUT diagnostics:", JSON.stringify({
        httpStatus: upload.status,
        "access-control-allow-origin": allowOrigin,
        responseBody
    }));

    assert.equal(preflight.status, 204, `R2 preflight returned HTTP ${preflight.status}.`);
    assert.equal(
        preflightHeaders["access-control-allow-origin"],
        origin,
        `Missing or invalid Access-Control-Allow-Origin on preflight: ${preflightHeaders["access-control-allow-origin"]}`
    );
    assert.ok(
        includesHeader(preflightHeaders["access-control-allow-methods"], "PUT"),
        `Missing PUT in Access-Control-Allow-Methods: ${preflightHeaders["access-control-allow-methods"]}`
    );
    assert.ok(
        includesHeader(preflightHeaders["access-control-allow-headers"], "content-type"),
        `Missing content-type in Access-Control-Allow-Headers: ${preflightHeaders["access-control-allow-headers"]}`
    );
    assert.equal(upload.status, 200, `R2 PUT returned HTTP ${upload.status}.`);
    assert.equal(
        allowOrigin,
        origin,
        `Missing or invalid Access-Control-Allow-Origin on PUT: ${allowOrigin}`
    );
});
