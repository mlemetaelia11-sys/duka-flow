"use strict";
const express=require("express");
const {requireAuth,authorizeRoles}=require("../middleware/authMiddleware");
const c=require("../controllers/productionController");
const router=express.Router();
router.get("/health",c.health);
router.get("/backups",requireAuth,authorizeRoles("owner"),c.backupHistory);
module.exports=router;
