"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");

process.env.R2_ACCOUNT_ID = "test-account";
process.env.R2_BUCKET = "test-bucket";
process.env.R2_ACCESS_KEY_ID = "TESTACCESSKEY";
process.env.R2_SECRET_ACCESS_KEY = "test-secret-key";
delete process.env.R2_ENDPOINT;

const { presignPut, presignGet } = require("../services/r2");

test("PUT presign targets the tenant key and signs the requested content type", async () => {
    const signedUrl = await presignPut("businesses/42/products/image.png", "image/png");
    const url = new URL(signedUrl);
    const normalizedUrl = signedUrl.toLowerCase();

    assert.equal(url.protocol, "https:");
    assert.equal(url.hostname, "test-account.r2.cloudflarestorage.com");
    assert.equal(url.pathname, "/test-bucket/businesses/42/products/image.png");
    assert.ok(url.pathname.startsWith("/test-bucket/businesses/42/"));
    assert.ok(signedUrl.includes("X-Amz-SignedHeaders=content-type%3Bhost"));
    assert.equal(url.searchParams.get("X-Amz-SignedHeaders"), "content-type;host");
    assert.equal(url.searchParams.get("X-Amz-Expires"), "900");
    assert.equal(normalizedUrl.includes("x-amz-checksum-crc32"), false);
    assert.equal(normalizedUrl.includes("x-amz-sdk-checksum-algorithm"), false);
    assert.equal(
        [...url.searchParams.keys()].some((name) => /checksum/i.test(name)),
        false,
        "PUT URL must not contain checksum query parameters"
    );
    assert.ok(url.searchParams.has("X-Amz-Signature"));
});

test("GET presign targets the same tenant key with the requested expiry", async () => {
    const url = new URL(await presignGet("businesses/42/products/image.png", 300));

    assert.equal(url.hostname, "test-account.r2.cloudflarestorage.com");
    assert.equal(url.pathname, "/test-bucket/businesses/42/products/image.png");
    assert.equal(url.searchParams.get("X-Amz-SignedHeaders"), "host");
    assert.equal(url.searchParams.get("X-Amz-Expires"), "300");
    assert.ok(url.searchParams.has("X-Amz-Signature"));
});