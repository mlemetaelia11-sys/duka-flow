"use strict";
const express=require("express");const {requireAuth,authorizeRoles}=require("../middleware/authMiddleware");
const { requireFeature } = require("../middleware/subscriptionMiddleware");const {listAuditLogs}=require("../controllers/auditController");
const router=express.Router();router.get("/",requireAuth,authorizeRoles("owner"),requireFeature("audit_logs"),listAuditLogs);module.exports=router;
