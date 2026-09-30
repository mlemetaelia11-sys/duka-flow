"use strict";

const express = require("express");

const {
    requireAuth
} = require("../middleware/authMiddleware");

const {
    getRuntimeConfig
} = require("../config/providers");

const c = require("../controllers/integrationController");

const router = express.Router();


/* =========================================================
   INTEGRATION STATUS
========================================================= */

router.get(
    "/status",
    requireAuth,
    (req, res) => {
        const config = getRuntimeConfig();

        return res.json({
            status: "ok",
            app: {
                currency: config.currency,
                timezone: config.timezone
            },
            providers: config.providers,
            features: config.features
        });
    }
);


/* =========================================================
   PESAPAL
========================================================= */

router.post(
    "/pesapal/ipn/register",
    requireAuth,
    c.registerPesapalIpn
);

router.post(
    "/pesapal/order",
    requireAuth,
    c.createPesapalOrder
);

router.get(
    "/pesapal/callback",
    c.pesapalCallback
);

router.get(
    "/pesapal/ipn",
    c.pesapalIpn
);

router.post(
    "/pesapal/ipn",
    c.pesapalIpn
);


/* =========================================================
   CLOUDFLARE R2
========================================================= */

/*
 * Existing presigned upload endpoint.
 * Kept for compatibility.
 */
router.post(
    "/storage/presign",
    requireAuth,
    c.presignUpload
);


/*
 * NEW SERVER-SIDE IMAGE UPLOAD
 *
 * Browser -> DukaFlow -> R2
 *
 * This completely avoids browser -> R2 CORS/upload problems.
 */
router.post(
    "/storage/upload",
    requireAuth,
    express.raw({
        type: (req) => {
            const contentType =
                String(req.headers["content-type"] || "")
                    .split(";")[0]
                    .trim()
                    .toLowerCase();

            return /^image\//i.test(contentType);
        },
        limit: "4mb"
    }),
    c.uploadStorageObject
);


router.get(
    "/storage/view",
    requireAuth,
    c.viewStorageObject
);


/* =========================================================
   EMAIL
========================================================= */

router.post(
    "/email/test",
    requireAuth,
    c.testEmail
);


/* =========================================================
   PUSH NOTIFICATIONS
========================================================= */

router.post(
    "/notifications/register-token",
    requireAuth,
    c.registerPushToken
);

router.post(
    "/notifications/test",
    requireAuth,
    c.sendPushTest
);


module.exports = router;