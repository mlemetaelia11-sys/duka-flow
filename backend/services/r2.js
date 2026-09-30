"use strict";

const { S3Client, PutObjectCommand, GetObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

function config() {
    const account = process.env.R2_ACCOUNT_ID;
    const bucket = process.env.R2_BUCKET;
    const accessKeyId = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
    if (!account || !bucket || !accessKeyId || !secretAccessKey) {
        throw new Error("Cloudflare R2 is not configured.");
    }

    const endpoint = process.env.R2_ENDPOINT || `https://${account}.r2.cloudflarestorage.com`;
    const client = new S3Client({
        endpoint,
        region: "auto",
        forcePathStyle: true,
        credentials: { accessKeyId, secretAccessKey }
    });

    return { client, bucket };
}

async function presignPut(key, contentType, expires = 900) {
    const { client, bucket } = config();
    const command = new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        ContentType: contentType
    });
    return getSignedUrl(client, command, {
        expiresIn: expires,
        signableHeaders: new Set(["content-type"])
    });
}

async function presignGet(key, expires = 900) {
    const { client, bucket } = config();
    const command = new GetObjectCommand({ Bucket: bucket, Key: key });
    return getSignedUrl(client, command, { expiresIn: expires });
}

function publicUrl(key) {
    const base = process.env.R2_PUBLIC_BASE_URL;
    return base ? `${base.replace(/\/$/, "")}/${String(key).split("/").map(encodeURIComponent).join("/")}` : null;
}

module.exports = { presignPut, presignGet, publicUrl };
