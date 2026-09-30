"use strict";
const express=require("express");const {requireAuth}=require("../middleware/authMiddleware");const {getPlans,getCurrent}=require("../controllers/subscriptionController");
const router=express.Router();router.get("/plans",getPlans);router.get("/current",requireAuth,getCurrent);module.exports=router;
