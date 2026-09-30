"use strict";
const express=require("express");const {requireAuth}=require("../middleware/authMiddleware");const {changePassword,getProfile}=require("../controllers/accountController");
const router=express.Router();router.get("/profile",requireAuth,getProfile);router.post("/change-password",requireAuth,changePassword);module.exports=router;
