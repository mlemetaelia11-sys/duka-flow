"use strict";
const crypto = require("crypto");
const pool = require("../db");
const { chat: groqChat } = require("../services/groq");
const { logAudit } = require("../utils/audit");
const { getContext } = require("../requestContext");
const {
  RESPONSE_GUIDANCE,
  getBusinessDateContext,
  selectBusinessQuery,
  readBusinessData,
  businessInsights,
  formatBusinessAnswer
} = require("../services/assistantBusinessData");

function getCookieValue(cookieHeader, name) {
  if (!cookieHeader) return "";
  for (const part of cookieHeader.split(";")) {
    const entry = part.trim();
    if (!entry) continue;
    if (entry.startsWith(`${name}=`)) {
      return decodeURIComponent(entry.slice(name.length + 1));
    }
  }
  return "";
}

function selectedLanguage(req) {
  const cookieValue = getCookieValue(req?.headers?.cookie || "", "dukaflow_language");
  return cookieValue === "en" ? "en" : "sw";
}

const bid = (req) => {
  const businessId = Number(req.businessId || req.user?.businessId || getContext()?.businessId || 0);
  return Number.isFinite(businessId) && businessId > 0 ? businessId : null;
};

const branchId = (req) => {
  const branchIdValue = Number(req.branchId || req.user?.default_branch_id || getContext()?.branchId || 0);
  return Number.isFinite(branchIdValue) && branchIdValue > 0 ? branchIdValue : null;
};

const fn = (name, description, properties = {}) => ({
  type: "function",
  function: {
    name,
    description,
    parameters: {
      type: "object",
      properties,
      additionalProperties: false
    }
  }
});

const tools = [
  fn("get_business_summary", "Read sales, products, low stock and outstanding debts for the authenticated business and active branch."),
  fn("get_today_sales", "Read sales, transaction count, quantity, stored profit and leading products for a business-local calendar period.", { period: { type: "string", enum: ["today", "yesterday", "week", "days"] }, days: { type: "integer", minimum: 1, maximum: 365 } }),
  fn("get_sales_report", "Read sales, transactions, sold quantity and stored profit for a business-local period.", { period: { type: "string", enum: ["today", "yesterday", "week", "days"] }, days: { type: "integer", minimum: 1, maximum: 365 } }),
  fn("get_sales_history", "Read recent sale transactions for the authenticated business and active branch.", { period: { type: "string", enum: ["today", "yesterday", "week", "days"] }, days: { type: "integer", minimum: 1, maximum: 365 }, limit: { type: "integer", minimum: 1, maximum: 30 } }),
  fn("get_top_products", "Read top selling products for a business-local period.", { period: { type: "string", enum: ["today", "yesterday", "week", "days"] }, days: { type: "integer", minimum: 1, maximum: 365 }, limit: { type: "integer", minimum: 1, maximum: 20 } }),
  fn("get_low_stock_products", "Get low stock products.", { limit: { type: "integer", minimum: 1, maximum: 30 } }),
  fn("get_inventory", "Search inventory.", { query: { type: "string" }, limit: { type: "integer", minimum: 1, maximum: 30 } }),
  fn("get_customer", "Find a customer by name or phone.", { query: { type: "string" } }),
  fn("get_customer_debts", "Get customer debts.", { limit: { type: "integer", minimum: 1, maximum: 30 } }),
  fn("get_profit", "Read revenue, stored sale-item profit and recorded expenses for a business-local period.", { period: { type: "string", enum: ["today", "yesterday", "week", "days"] }, days: { type: "integer", minimum: 1, maximum: 365 } }),
  fn("get_expenses", "Read expenses by category for a business-local period.", { period: { type: "string", enum: ["today", "yesterday", "week", "days"] }, days: { type: "integer", minimum: 1, maximum: 365 } }),
  fn("get_cashflow", "Read sales inflow and expenses for a business-local period.", { period: { type: "string", enum: ["today", "yesterday", "week", "days"] }, days: { type: "integer", minimum: 1, maximum: 365 } }),
  fn("get_staff_activity", "Get staff sales activity.", { days: { type: "integer", minimum: 1, maximum: 365 } }),
  fn("create_product", "Prepare product creation; confirmation required.", { name: { type: "string" }, buyingPrice: { type: "number" }, sellingPrice: { type: "number" }, stockQuantity: { type: "integer" }, lowStockThreshold: { type: "integer" } }),
  fn("create_customer", "Prepare customer creation; confirmation required.", { name: { type: "string" }, phone: { type: "string" }, email: { type: "string" } }),
  fn("record_expense", "Prepare expense; confirmation required.", { category: { type: "string" }, description: { type: "string" }, amount: { type: "number" }, paymentMethod: { type: "string" } }),
  fn("adjust_stock", "Prepare stock adjustment; confirmation required.", { productId: { type: "integer" }, quantityChange: { type: "integer" }, reason: { type: "string" } }),
  fn("record_payment", "Prepare debt payment; confirmation required.", { debtId: { type: "integer" }, amount: { type: "number" }, paymentMethod: { type: "string" } })
];

const actions = new Set(["create_product", "create_customer", "record_expense", "adjust_stock", "record_payment"]);

async function read(name, args = {}, businessId, branchIdValue, clock) {
  const dateContext = clock || await getBusinessDateContext(businessId);
  return readBusinessData(name, args, businessId, branchIdValue, dateContext);
}

async function prepare(name, payload, businessId, userId) {
  if (name === "create_product" && String(payload?.name || "").trim().length < 2) {
    throw new Error("Product name is required.");
  }
  if (name === "create_customer" && String(payload?.name || "").trim().length < 2) {
    throw new Error("Customer name is required.");
  }
  if (name === "record_expense" && !(Number(payload?.amount) > 0)) {
    throw new Error("Expense amount is required.");
  }

  const currentBranchId = Number(getContext()?.branchId || 0) || null;
  const token = crypto.randomBytes(32).toString("hex");
  const hash = crypto.createHash("sha256").update(token).digest("hex");
  const result = await pool.query(
    `INSERT INTO ai_actions (business_id, branch_id, user_id, action_name, payload, confirmation_token_hash)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, expires_at`,
    [businessId, currentBranchId, userId, name, payload || {}, hash]
  );

  return {
    actionId: result.rows[0].id,
    action: name,
    payload: payload || {},
    confirmationToken: token,
    expiresAt: result.rows[0].expires_at,
    requiresConfirmation: true
  };
}

function branchIdValueForAction() {
  return Number(getContext()?.branchId || 0) || null;
}

async function execute(actionRow, businessId, userId) {
  const payload = actionRow.payload || {};
  const actionName = actionRow.action_name;

  if (actionName === "create_product") {
    const result = await pool.query(
      `INSERT INTO products (business_id, branch_id, name, buying_price, selling_price, stock_quantity, low_stock_threshold)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, name, stock_quantity, selling_price`,
      [businessId, branchIdValueForAction(), payload.name, Number(payload.buyingPrice || 0), Number(payload.sellingPrice || 0), Number(payload.stockQuantity || 0), Number(payload.lowStockThreshold || 5)]
    );
    return result.rows[0];
  }

  if (actionName === "create_customer") {
    const result = await pool.query(
      `INSERT INTO customers (business_id, branch_id, name, phone, email)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, phone, email`,
      [businessId, branchIdValueForAction(), payload.name, payload.phone || null, payload.email || null]
    );
    return result.rows[0];
  }

  if (actionName === "record_expense") {
    const result = await pool.query(
      `INSERT INTO expenses (business_id, branch_id, category, description, amount, payment_method, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, category, description, amount, payment_method`,
      [businessId, branchIdValueForAction(), payload.category, payload.description || payload.category, Number(payload.amount || 0), payload.paymentMethod || "cash", userId]
    );
    return result.rows[0];
  }

  if (actionName === "adjust_stock") {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query(
        `UPDATE products
         SET stock_quantity = stock_quantity + $1, updated_at = NOW()
         WHERE id = $2 AND business_id = $3 AND branch_id = $4 AND stock_quantity + $1 >= 0
         RETURNING id, name, stock_quantity`,
        [Number(payload.quantityChange || 0), Number(payload.productId), businessId, branchIdValueForAction()]
      );

      if (!result.rowCount) {
        throw new Error("Product not found or stock would become negative.");
      }

      await client.query(
        `INSERT INTO stock_movements (business_id, branch_id, product_id, movement_type, quantity_change, notes, created_by)
         VALUES ($1, $2, $3, 'adjustment', $4, $5, $6)`,
        [businessId, branchIdValueForAction(), Number(payload.productId), Number(payload.quantityChange || 0), payload.reason || "Copilot adjustment", userId]
      );

      await client.query("COMMIT");
      return result.rows[0];
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  if (actionName === "record_payment") {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const debt = await client.query(
        `SELECT id, balance, amount_paid FROM debts WHERE id = $1 AND business_id = $2 AND branch_id = $3 FOR UPDATE`,
        [Number(payload.debtId), businessId, branchIdValueForAction()]
      );

      if (!debt.rowCount || Number(payload.amount || 0) > Number(debt.rows[0].balance || 0)) {
        throw new Error("Debt payment exceeds the outstanding balance.");
      }

      const paid = Number(debt.rows[0].amount_paid || 0) + Number(payload.amount || 0);
      const balance = Number(debt.rows[0].balance || 0) - Number(payload.amount || 0);
      const updatedDebt = await client.query(
        `UPDATE debts SET amount_paid = $1, balance = $2, updated_at = NOW() WHERE id = $3 AND business_id = $4 RETURNING id, amount_paid, balance`,
        [paid, balance, Number(payload.debtId), businessId]
      );

      await client.query(
        `INSERT INTO debt_payments (business_id, branch_id, debt_id, amount, payment_method, created_by)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [businessId, branchIdValueForAction(), Number(payload.debtId), Number(payload.amount || 0), payload.paymentMethod || "cash", userId]
      );

      await client.query("COMMIT");
      return updatedDebt.rows[0];
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  throw new Error("Unsupported AI action.");
}

async function listConversations(req, res) {
  const businessIdValue = bid(req);
  if (!businessIdValue) {
    return res.status(401).json({ message: "Business context is missing." });
  }

  try {
    const result = await pool.query(
      `SELECT id, title, summary, created_at, updated_at
        FROM ai_conversations
        WHERE business_id = $1 AND user_id = $2 AND branch_id = $3
       ORDER BY updated_at DESC LIMIT 20`,
        [businessIdValue, req.user.id, branchId(req)]
    );
    return res.json({ conversations: result.rows });
  } catch (error) {
    return res.status(500).json({ message: "Unable to load conversations.", details: error.message });
  }
}

async function createConversation(req, res) {
  const businessIdValue = bid(req);
  if (!businessIdValue) {
    return res.status(401).json({ message: "Business context is missing." });
  }

  try {
    const title = String(req.body?.title || "New conversation").trim().slice(0, 160) || "New conversation";
    const result = await pool.query(
      `INSERT INTO ai_conversations (business_id, branch_id, user_id, title)
       VALUES ($1, $2, $3, $4)
       RETURNING id, title, created_at, updated_at`,
      [businessIdValue, branchId(req), req.user.id, title]
    );
    return res.status(201).json({ conversation: result.rows[0] });
  } catch (error) {
    return res.status(500).json({ message: "Unable to create conversation.", details: error.message });
  }
}

async function getConversation(req, res) {
  const businessIdValue = bid(req);
  const conversationId = Number(req.params.id);

  if (!businessIdValue || !conversationId) {
    return res.status(400).json({ message: "Valid conversation id is required." });
  }

  try {
    const conversation = await pool.query(
      `SELECT id, title, summary, created_at, updated_at
       FROM ai_conversations
        WHERE business_id = $1 AND id = $2 AND user_id = $3 AND branch_id = $4`,
        [businessIdValue, conversationId, req.user.id, branchId(req)]
    );

    if (!conversation.rowCount) {
      return res.status(404).json({ message: "Conversation not found." });
    }

    const messages = await pool.query(
      `SELECT id, role, content, metadata, created_at
       FROM ai_messages
        WHERE business_id = $1 AND conversation_id = $2 AND user_id = $3 AND branch_id = $4
       ORDER BY id ASC`,
            [businessIdValue, conversationId, req.user.id, branchId(req)]
    );

    return res.json({ conversation: conversation.rows[0], messages: messages.rows });
  } catch (error) {
    return res.status(500).json({ message: "Unable to load conversation.", details: error.message });
  }
}

async function saveConversationMessage(req, res) {
  const businessIdValue = bid(req);
  const conversationId = Number(req.params.id);
  const role = String(req.body?.role || "user").toLowerCase();
  const content = String(req.body?.content || "").trim();

  if (!businessIdValue || !conversationId || !content) {
    return res.status(400).json({ message: "Valid content is required." });
  }

  if (!(["user", "assistant", "tool", "system"]).includes(role)) {
    return res.status(400).json({ message: "Unsupported message role." });
  }

  try {
    const conversation = await pool.query(
      `SELECT id FROM ai_conversations
       WHERE business_id = $1 AND id = $2 AND user_id = $3 AND branch_id = $4`,
      [businessIdValue, conversationId, req.user.id, branchId(req)]
    );
    if (!conversation.rowCount) return res.status(404).json({ message: "Conversation not found." });

    const result = await pool.query(
      `INSERT INTO ai_messages (business_id, branch_id, conversation_id, user_id, role, content, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, role, content, metadata, created_at`,
      [businessIdValue, branchId(req), conversationId, req.user.id, role, content, JSON.stringify(req.body?.metadata || {})]
    );
    return res.status(201).json({ message: result.rows[0] });
  } catch (error) {
    return res.status(500).json({ message: "Unable to save message.", details: error.message });
  }
}

async function deleteConversation(req, res) {
  const businessIdValue = bid(req);
  const conversationId = Number(req.params.id);

  if (!businessIdValue || !conversationId) {
    return res.status(400).json({ message: "Valid conversation id is required." });
  }

  try {
    await pool.query(
      `DELETE FROM ai_conversations WHERE business_id = $1 AND id = $2 AND user_id = $3 AND branch_id = $4`,
      [businessIdValue, conversationId, req.user.id, branchId(req)]
    );
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ message: "Unable to delete conversation.", details: error.message });
  }
}

async function ensureConversationSummary(conversationId, businessIdValue, branchIdValue, userId) {
  try {
    const countResult = await pool.query(
      `SELECT COUNT(*) AS total FROM ai_messages WHERE business_id = $1 AND branch_id = $2 AND user_id = $3 AND conversation_id = $4`,
      [businessIdValue, branchIdValue, userId, conversationId]
    );

    if (Number(countResult.rows[0]?.total || 0) <= 8) {
      return null;
    }

    const history = await pool.query(
      `SELECT role, content FROM ai_messages WHERE business_id = $1 AND branch_id = $2 AND user_id = $3 AND conversation_id = $4 ORDER BY id ASC LIMIT 40`,
      [businessIdValue, branchIdValue, userId, conversationId]
    );

    const text = history.rows
      .map((row) => `${row.role}: ${String(row.content || "").replace(/\s+/g, " ").trim()}`)
      .join(" | ");

    const summary = text.length > 500 ? `${text.slice(0, 500)}...` : text;
    await pool.query(
      `UPDATE ai_conversations SET summary = $1, updated_at = NOW() WHERE business_id = $2 AND branch_id = $3 AND id = $4 AND user_id = $5`,
      [summary, businessIdValue, branchIdValue, conversationId, userId]
    );
    return summary;
  } catch (error) {
    console.error("CONVERSATION_SUMMARY_ERROR", error);
    return null;
  }
}

async function confirmAction(req, res) {
  const businessIdValue = bid(req);
  const actionId = Number(req.params.id);
  const confirmationToken = String(req.body?.confirmationToken || "");

  if (!businessIdValue || !actionId || confirmationToken.length < 32) {
    return res.status(400).json({ message: "Valid confirmation is required." });
  }

  try {
    const hash = crypto.createHash("sha256").update(confirmationToken).digest("hex");
    const result = await pool.query(
      `SELECT * FROM ai_actions
       WHERE id = $1 AND business_id = $2 AND user_id = $3 AND status = 'pending' AND expires_at > NOW() AND confirmation_token_hash = $4`,
      [actionId, businessIdValue, req.user.id, hash]
    );

    if (!result.rowCount) {
      return res.status(404).json({ message: "Action confirmation is invalid or expired." });
    }

    const actionResult = await execute(result.rows[0], businessIdValue, req.user.id);

    await pool.query(
      `UPDATE ai_actions SET status = 'executed', result = $1, executed_at = NOW() WHERE id = $2`,
      [actionResult, actionId]
    );

    await logAudit(req, `copilot.${result.rows[0].action_name}`, "ai_action", actionId, { result: actionResult });

    return res.json({
      message: selectedLanguage(req) === "en" ? "Action completed successfully." : "Kitendo kimekamilika.",
      result: actionResult
    });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
}

async function answerAssistant(req, res) {
  const businessIdValue = bid(req);
  const branchIdValue = branchId(req);
  const userId = Number(req.user?.id || 0);
  const currentLanguage = selectedLanguage(req);
  const question = String(req.body?.question || req.query?.q || "").trim();

  if (!businessIdValue || !branchIdValue || !userId) {
    return res.status(401).json({ message: "Business context is missing." });
  }

  if (!question) {
    return res.status(400).json({ message: "Ask a business question." });
  }

  if (req.body?.pendingActionId && /^(yes|y|ndio|fanya|confirm|thibitisha|endelea|ok|okay)$/i.test(question)) {
    return confirmAction({ ...req, params: { id: req.body.pendingActionId } }, res);
  }

  let conversationId = Number(req.body?.conversationId || req.query?.conversationId || 0);
  try {
    const dateContext = await getBusinessDateContext(businessIdValue);
    let conversation = null;
    if (conversationId) {
      const existing = await pool.query(
        `SELECT id, summary FROM ai_conversations
         WHERE business_id = $1 AND branch_id = $2 AND user_id = $3 AND id = $4`,
        [businessIdValue, branchIdValue, userId, conversationId]
      );
      conversation = existing.rows[0] || null;
      if (!conversation) conversationId = 0;
    }

    if (!conversationId) {
      const inserted = await pool.query(
        `INSERT INTO ai_conversations (business_id, branch_id, user_id, title)
         VALUES ($1, $2, $3, $4)
         RETURNING id, summary`,
        [businessIdValue, branchIdValue, userId, question.slice(0, 120)]
      );
      conversation = inserted.rows[0];
      conversationId = Number(conversation?.id || 0);
    }

    const recentMessagesResult = await pool.query(
      `SELECT m.role, m.content, m.metadata
       FROM ai_messages m
       JOIN ai_conversations c ON c.id = m.conversation_id
                              AND c.business_id = m.business_id
                              AND c.user_id = m.user_id
                              AND c.branch_id = m.branch_id
       WHERE m.business_id = $1 AND m.branch_id = $2 AND m.user_id = $3
         AND m.conversation_id = $4 AND m.role IN ('user', 'assistant')
       ORDER BY m.id DESC LIMIT 12`,
      [businessIdValue, branchIdValue, userId, conversationId]
    );
    const recentMessages = recentMessagesResult.rows.slice().reverse();

    await pool.query(
      `INSERT INTO ai_messages (business_id, branch_id, conversation_id, user_id, role, content, metadata)
       VALUES ($1, $2, $3, $4, 'user', $5, $6)`,
      [businessIdValue, branchIdValue, conversationId, userId, question, JSON.stringify({ language: currentLanguage })]
    );
    const summary = await ensureConversationSummary(conversationId, businessIdValue, branchIdValue, userId)
      || conversation?.summary
      || null;

    if (process.env.NODE_ENV === "development") {
      console.info("COPILOT_MEMORY", JSON.stringify({ businessId: businessIdValue, branchId: branchIdValue, userId, conversationId, loadedMessages: recentMessages.length }));
    }

    const selectedQuery = selectBusinessQuery(question, recentMessages);
    if (selectedQuery) {
      const data = selectedQuery.name === "clarify_branch"
        ? {}
        : await readBusinessData(selectedQuery.name, selectedQuery.args, businessIdValue, branchIdValue, dateContext);
      const answer = formatBusinessAnswer(selectedQuery.name, data, currentLanguage);
      const insights = businessInsights(selectedQuery.name, data, currentLanguage);
      const metadata = {
        language: currentLanguage,
        source: "postgresql",
        tool: selectedQuery.name,
        dateRange: data.range ? { timezone: data.range.timezone, startDate: data.range.startDate, endDateExclusive: data.range.endDate } : null,
        insights
      };
      await pool.query(
        `INSERT INTO ai_messages (business_id, branch_id, conversation_id, user_id, role, content, metadata)
         VALUES ($1, $2, $3, $4, 'assistant', $5, $6)`,
        [businessIdValue, branchIdValue, conversationId, userId, answer, JSON.stringify(metadata)]
      );
      await pool.query(
        `UPDATE ai_conversations SET title = $1, updated_at = NOW()
         WHERE business_id = $2 AND branch_id = $3 AND user_id = $4 AND id = $5`,
        [String(question).slice(0, 120), businessIdValue, branchIdValue, userId, conversationId]
      );
      return res.json({ question, answer, insights, generatedBy: "DukaFlow PostgreSQL", conversationId, pendingAction: null });
    }

    if (!process.env.GROQ_API_KEY) {
      const answer = currentLanguage === "en"
        ? "I can answer business questions from branch data, but Copilot actions are unavailable until the AI provider is configured."
        : "Naweza kujibu maswali ya biashara kwa data ya tawi, lakini vitendo vya Copilot havipatikani hadi mtoa huduma wa AI awekewe mipangilio.";
      await pool.query(
        `INSERT INTO ai_messages (business_id, branch_id, conversation_id, user_id, role, content, metadata)
         VALUES ($1, $2, $3, $4, 'assistant', $5, $6)`,
        [businessIdValue, branchIdValue, conversationId, userId, answer, JSON.stringify({ language: currentLanguage, source: "configuration" })]
      );
      return res.json({ question, answer, generatedBy: "DukaFlow fallback", conversationId, pendingAction: null });
    }

    const promptMessages = [
      {
        role: "system",
        content: `You are DukaFlow Copilot. Reply only in ${currentLanguage === "en" ? "English" : "Swahili"}. The authenticated scope is business ${businessIdValue}, active branch ${branchIdValue}; the business timezone is ${dateContext.timezone} and its local date is ${dateContext.localDate}. Always use relevant PostgreSQL tools for business data and only report values returned by them. Never invent or turn missing data into zero. State the exact period/branch checked, explain empty results, give a concise interpretation and a data-grounded next step. Ask a concise clarification if branch or period is ambiguous. Confirm all write actions before execution. ${RESPONSE_GUIDANCE}${summary ? ` Recent conversation summary: ${summary}` : ""}`
      },
      ...recentMessages.map((row) => ({ role: row.role, content: String(row.content || "") })),
      { role: "user", content: question }
    ];

    let response = await groqChat({
      messages: promptMessages,
      tools,
      tool_choice: "auto"
    });

    let message = response.choices?.[0]?.message;
    let pendingAction = null;

    for (let round = 0; round < 3 && message?.tool_calls?.length; round += 1) {
      promptMessages.push({ role: "assistant", content: message.content || "", tool_calls: message.tool_calls });

      for (const call of message.tool_calls) {
        const toolName = call.function?.name;
        let args = {};
        try {
          args = JSON.parse(call.function?.arguments || "{}");
        } catch {
          args = {};
        }

        const output = actions.has(toolName)
          ? await prepare(toolName, args, businessIdValue, userId)
          : await read(toolName, args, businessIdValue, branchIdValue, dateContext);
        if (output?.requiresConfirmation) {
          pendingAction = output;
        }
        promptMessages.push({ role: "tool", tool_call_id: call.id, name: toolName, content: JSON.stringify(output) });
      }

      response = await groqChat({ messages: promptMessages, tools, tool_choice: "auto" });
      message = response.choices?.[0]?.message;
    }

    const finalAnswer = String(message?.content || "").trim() || (currentLanguage === "en"
      ? "I could not verify a result from the available business data. Please clarify the period or metric."
      : "Sikuweza kuthibitisha jibu kutoka kwenye data ya biashara iliyopo. Tafadhali fafanua kipindi au kipimo unachoulizia.");

    await pool.query(
      `INSERT INTO ai_messages (business_id, branch_id, conversation_id, user_id, role, content, metadata)
       VALUES ($1, $2, $3, $4, 'assistant', $5, $6)`,
      [businessIdValue, branchIdValue, conversationId, userId, finalAnswer, JSON.stringify({ language: currentLanguage, tool_calls: message?.tool_calls || [] })]
    );

    await pool.query(
      `UPDATE ai_conversations SET title = $1, updated_at = NOW()
       WHERE business_id = $2 AND branch_id = $3 AND id = $4 AND user_id = $5`,
      [String(question).slice(0, 120), businessIdValue, branchIdValue, conversationId, userId]
    );

    return res.json({
      question,
      answer: finalAnswer || "I did not find a verified result for that question.",
      generatedBy: "Groq tool mode",
      conversationId,
      pendingAction
    });
  } catch (error) {
    const errorAnswer = currentLanguage === "en"
      ? "I could not verify the requested data just now. Please try again shortly."
      : "Sikuweza kuthibitisha data uliyoomba kwa sasa. Tafadhali jaribu tena baada ya muda mfupi.";
    if (conversationId) {
      await pool.query(
        `INSERT INTO ai_messages (business_id, branch_id, conversation_id, user_id, role, content, metadata)
         VALUES ($1, $2, $3, $4, 'assistant', $5, $6)`,
        [businessIdValue, branchIdValue, conversationId, userId, errorAnswer, JSON.stringify({ language: currentLanguage, source: "error" })]
      ).catch(() => {});
    }
    if (process.env.NODE_ENV === "development") {
      console.error("COPILOT_REQUEST_ERROR", { name: error?.name || "Error", code: error?.code || null });
    }
    return res.status(500).json({
      message: currentLanguage === "en" ? "The assistant could not process that request." : "Msaidizi hakuweza kushughulikia ombi hilo.",
      conversationId
    });
  }
}

module.exports = {
  answerAssistant,
  confirmAction,
  listConversations,
  createConversation,
  getConversation,
  saveConversationMessage,
  deleteConversation
};
