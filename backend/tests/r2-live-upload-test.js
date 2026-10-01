"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { test } = require("node:test");
const dotenv = require("dotenv");

dotenv.config({ path: path.join(__dirname, "..", ".env"), override: true, quiet: true });

const { presignPut, presignGet } = require("../services/r2");

const contentType = "text/plain";
const body = Buffer.from("DukaFlow R2 live upload test");
const keyPrefix = "businesses/42/r2-live-test/";

test("live PUT uploads and reads a small object in Cloudflare R2", async () => {
    const key = `${keyPrefix}${Date.now()}.txt`;
    const uploadUrl = await presignPut(key, contentType);

    let response;
    try {
        response = await fetch(uploadUrl, {
            method: "PUT",
            headers: { "Content-Type": contentType },
            body
        });
    } catch {
        throw new Error("R2 PUT failed before receiving an HTTP response.");
    }

    const responseBody = await response.text();
    console.log("R2 live PUT diagnostics:", JSON.stringify({
        httpStatus: response.status,
        statusText: response.statusText,
        uploadSucceeded: response.ok,
        keyPrefix
    }));
    if (!response.ok) {
        console.error("R2 response body:", responseBody);
    }
    assert.ok(response.ok, `R2 PUT returned HTTP ${response.status}.`);

    const downloadUrl = await presignGet(key, 120);
    let downloadResponse;
    try {
        downloadResponse = await fetch(downloadUrl);
    } catch {
        throw new Error("R2 GET verification failed before receiving an HTTP response.");
    }

    assert.equal(downloadResponse.ok, true, "R2 GET verification did not succeed.");
    assert.equal(await downloadResponse.text(), body.toString());
});
