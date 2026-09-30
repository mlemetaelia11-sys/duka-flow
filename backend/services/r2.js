"use strict";
const crypto = require("crypto");

function hmac(key, value, encoding) {
    return crypto.createHmac("sha256", key).update(value).digest(encoding);
}
function sha256(value) { return crypto.createHash("sha256").update(value).digest("hex"); }
function awsKey(secret, date) { return hmac(hmac(hmac(hmac(`AWS4${secret}`, date), "auto"), "s3"), "aws4_request"); }

function config() {
    const account = process.env.R2_ACCOUNT_ID;
    const bucket = process.env.R2_BUCKET;
    const access = process.env.R2_ACCESS_KEY_ID;
    const secret = process.env.R2_SECRET_ACCESS_KEY;
    if (!account || !bucket || !access || !secret) throw new Error("Cloudflare R2 is not configured.");
    return { account, bucket, access, secret, endpoint: process.env.R2_ENDPOINT || `https://${account}.r2.cloudflarestorage.com` };
}

function presignPut(key, contentType, expires = 900) {
    const c = config();
    const host = new URL(c.endpoint).host;
    const now = new Date();
    const amzDate = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
    const date = amzDate.slice(0, 8);
    const credential = `${c.access}/${date}/auto/s3/aws4_request`;
    const canonicalUri = `/${encodeURIComponent(c.bucket)}/${String(key).split("/").map(encodeURIComponent).join("/")}`;
    const query = new URLSearchParams({
        "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
        "X-Amz-Credential": credential,
        "X-Amz-Date": amzDate,
        "X-Amz-Expires": String(expires),
        "X-Amz-SignedHeaders": "content-type;host"
    });
    const canonicalQuery = [...query.entries()].sort(([a],[b]) => a.localeCompare(b)).map(([k,v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&");
    const canonicalHeaders = `content-type:${contentType}\nhost:${host}\n`;
    const signedHeaders = "content-type;host";
    const canonicalRequest = `PUT\n${canonicalUri}\n${canonicalQuery}\n${canonicalHeaders}\n${signedHeaders}\nUNSIGNED-PAYLOAD`;
    const scope = `${date}/auto/s3/aws4_request`;
    const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${scope}\n${sha256(canonicalRequest)}`;
    const signature = hmac(awsKey(c.secret, date), stringToSign, "hex");
    query.set("X-Amz-Signature", signature);
    return `${c.endpoint}${canonicalUri}?${query.toString()}`;
}

function presignGet(key, expires = 900) {
    const c = config();
    const host = new URL(c.endpoint).host;
    const now = new Date();
    const amzDate = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
    const date = amzDate.slice(0, 8);
    const credential = `${c.access}/${date}/auto/s3/aws4_request`;
    const canonicalUri = `/${encodeURIComponent(c.bucket)}/${String(key).split("/").map(encodeURIComponent).join("/")}`;
    const query = new URLSearchParams({
        "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
        "X-Amz-Credential": credential,
        "X-Amz-Date": amzDate,
        "X-Amz-Expires": String(expires),
        "X-Amz-SignedHeaders": "host"
    });
    const canonicalQuery = [...query.entries()].sort(([a],[b]) => a.localeCompare(b)).map(([k,v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&");
    const canonicalHeaders = `host:${host}\n`;
    const canonicalRequest = `GET\n${canonicalUri}\n${canonicalQuery}\n${canonicalHeaders}\nhost\nUNSIGNED-PAYLOAD`;
    const scope = `${date}/auto/s3/aws4_request`;
    const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${scope}\n${sha256(canonicalRequest)}`;
    query.set("X-Amz-Signature", hmac(awsKey(c.secret, date), stringToSign, "hex"));
    return `${c.endpoint}${canonicalUri}?${query.toString()}`;
}

function publicUrl(key) {
    const base = process.env.R2_PUBLIC_BASE_URL;
    return base ? `${base.replace(/\/$/, "")}/${String(key).split("/").map(encodeURIComponent).join("/")}` : null;
}

module.exports = { presignPut, presignGet, publicUrl };
