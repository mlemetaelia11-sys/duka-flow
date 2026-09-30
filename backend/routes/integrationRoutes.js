"use strict";
const express = require("express");
const { requireAuth } = require("../middleware/authMiddleware");
const { getRuntimeConfig } = require("../config/providers");
const c = require("../controllers/integrationController");
const router = express.Router();

router.get("/status", requireAuth, (req, res) => {
    const config = getRuntimeConfig();
    res.json({ status: "ok", app: { currency: config.currency, timezone: config.timezone }, providers: config.providers, features: config.features });
});
router.post("/pesapal/ipn/register", requireAuth, c.registerPesapalIpn);
router.post("/pesapal/order", requireAuth, c.createPesapalOrder);
router.get("/pesapal/callback", c.pesapalCallback);
router.get("/pesapal/ipn", c.pesapalIpn);
router.post("/pesapal/ipn", c.pesapalIpn);
router.post("/storage/presign", requireAuth, c.presignUpload);
router.get("/storage/view", requireAuth, c.viewStorageObject);
router.post("/email/test", requireAuth, c.testEmail);
router.post("/notifications/register-token", requireAuth, c.registerPushToken);
router.post("/notifications/test", requireAuth, c.sendPushTest);
module.exports = router;
