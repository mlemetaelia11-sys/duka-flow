"use strict";

const express = require("express");

const { requireAuth } = require("../middleware/authMiddleware");
const { requireFeature } = require("../middleware/subscriptionMiddleware");
const controller = require("../controllers/assistantController");

const router = express.Router();

router.use(requireAuth);
router.use(requireFeature("copilot"));

router.get("/conversations", controller.listConversations);
router.post("/conversations", controller.createConversation);
router.get("/conversations/:id", controller.getConversation);
router.post("/conversations/:id/messages", controller.saveConversationMessage);
router.delete("/conversations/:id", controller.deleteConversation);

router.post("/confirm/:id", controller.confirmAction);
router.post("/", controller.answerAssistant);
router.get("/", controller.answerAssistant);

module.exports = router;
