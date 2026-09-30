"use strict";

const {
    S3Client,
    PutObjectCommand,
    GetObjectCommand
} = require("@aws-sdk/client-s3");

const {
    getSignedUrl
} = require("@aws-sdk/s3-request-presigner");


function getConfig() {
    const accountId =
        String(process.env.R2_ACCOUNT_ID || "").trim();

    const bucket =
        String(process.env.R2_BUCKET || "").trim();

    const accessKeyId =
        String(process.env.R2_ACCESS_KEY_ID || "").trim();

    const secretAccessKey =
        String(process.env.R2_SECRET_ACCESS_KEY || "").trim();

    if (
        !accountId ||
        !bucket ||
        !accessKeyId ||
        !secretAccessKey
    ) {
        throw new Error(
            "Cloudflare R2 is not configured."
        );
    }

    const endpoint =
        String(
            process.env.R2_ENDPOINT ||
            `https://${accountId}.r2.cloudflarestorage.com`
        ).replace(/\/+$/, "");

    const client =
        new S3Client({
            endpoint,
            region: "auto",
            forcePathStyle: true,

            requestChecksumCalculation:
                "WHEN_REQUIRED",

            responseChecksumValidation:
                "WHEN_REQUIRED",

            credentials: {
                accessKeyId,
                secretAccessKey
            }
        });

    return {
        client,
        bucket
    };
}


/* =========================================================
   PRESIGNED PUT
========================================================= */

async function presignPut(
    key,
    contentType,
    expires = 900
) {
    const {
        client,
        bucket
    } = getConfig();

    const command =
        new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            ContentType: contentType
        });

    return getSignedUrl(
        client,
        command,
        {
            expiresIn: expires,
            signableHeaders:
                new Set(["content-type"])
        }
    );
}


/* =========================================================
   SERVER-SIDE PUT
========================================================= */

async function putObject(
    key,
    body,
    contentType
) {
    const {
        client,
        bucket
    } = getConfig();

    if (!key) {
        throw new Error(
            "R2 object key is required."
        );
    }

    if (!Buffer.isBuffer(body)) {
        throw new TypeError(
            "R2 object body must be a Buffer."
        );
    }

    if (!body.length) {
        throw new Error(
            "R2 object body is empty."
        );
    }

    const command =
        new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: body,
            ContentType: contentType,

            /*
             * Explicitly do not request a checksum.
             * The S3 client is configured to calculate
             * checksums only when required.
             */
        });

    return client.send(command);
}


/* =========================================================
   PRESIGNED GET
========================================================= */

async function presignGet(
    key,
    expires = 900
) {
    const {
        client,
        bucket
    } = getConfig();

    const command =
        new GetObjectCommand({
            Bucket: bucket,
            Key: key
        });

    return getSignedUrl(
        client,
        command,
        {
            expiresIn: expires
        }
    );
}


/* =========================================================
   OPTIONAL PUBLIC URL
========================================================= */

function publicUrl(key) {
    const base =
        String(
            process.env.R2_PUBLIC_BASE_URL || ""
        ).trim();

    if (!base) {
        return null;
    }

    return (
        base.replace(/\/+$/, "") +
        "/" +
        String(key)
            .split("/")
            .map(
                encodeURIComponent
            )
            .join("/")
    );
}


/* =========================================================
   EXPORTS
========================================================= */

module.exports = {
    presignPut,
    putObject,
    presignGet,
    publicUrl
};