"use strict";
const express=require("express");const {requireAuth}=require("../middleware/authMiddleware");const {globalSearch}=require("../controllers/searchController");
const router=express.Router();router.get("/",requireAuth,globalSearch);module.exports=router;
