"use strict";

const $ = (selector) => document.querySelector(selector);
let pending = null;
let conversationId = null;
let isFollowingLatest = true;
let isBusy = false;

function getLanguage() {
  const match = document.cookie.match(/(?:^|; )dukaflow_language=([^;]+)/);
  return match?.[1] === "en" ? "en" : "sw";
}

const COPILOT_COPY = {
  sw: {
    heroLabel: "AKILI YA DUKAFLOW", heroDescription: "Uliza kuhusu mauzo, faida, stock, madeni na wateja. Majibu hutumia rekodi halisi za biashara na tawi lako.",
    assistantLabel: "MSAIDIZI WA BIASHARA", assistantTitle: "Maarifa na vitendo vya biashara", live: "Inapatikana",
    welcomeTitle: "Habari", welcomeText: "Uliza swali ili kuchunguza data halisi ya tawi lako.",
    askTitle: "Unaweza kuniuliza", askText: "Mauzo, faida, stock, wateja, madeni, matumizi, mtiririko wa fedha na shughuli za wafanyakazi.",
    actionsTitle: "Vitendo salama", actionsText: "Mabadiliko ya bidhaa, stock au matumizi yanahitaji uthibitisho wako kwanza.",
    whatsappTitle: "Wakala wa WhatsApp", whatsappText: "Unganisha wakala wa mauzo ili kusaidia kujibu wateja.", whatsappLink: "Fungua Wakala wa WhatsApp →",
    placeholder: "Uliza Copilot kuhusu biashara yako...", inputLabel: "Ujumbe kwa Copilot", send: "Tuma ujumbe", inputHint: "Enter kutuma · Shift + Enter kwenda mstari mpya",
    user: "Wewe", thinking: "Copilot inachambua data...", restored: "Mazungumzo ya awali yamerejeshwa.",
    confirmTitle: "Uthibitisho unahitajika", confirm: "Thibitisha", cancel: "Ghairi", cancelled: "Kitendo kimeghairiwa",
    actionCompleted: "Kitendo kimekamilika", actionSuccess: "Kitendo ulichoomba kimekamilika.", errorFallback: "Sikuweza kukamilisha ombi hilo kwa sasa. Tafadhali jaribu tena.",
    retry: "Jaribu tena", copilot: "DukaFlow Copilot", noResponse: "Hakuna jibu lililorejeshwa.",
    prompts: [
      ["Mauzo ya leo", "Nimeuza kiasi gani leo?"], ["Miamala ya leo", "Nimefanya miamala mingapi leo?"],
      ["Bidhaa zilizouza zaidi", "Ni bidhaa gani imeuza zaidi leo?"], ["Stock inayokaribia kuisha", "Nina bidhaa gani zinazokaribia kuisha?"],
      ["Wateja wenye madeni", "Ni wateja gani wana madeni?"], ["Faida ya wiki hii", "Faida ya wiki hii ni kiasi gani?"],
      ["Ushauri wa biashara", "Nipe ushauri wa biashara"], ["Historia ya mauzo", "Nionyeshe historia ya mauzo ya leo"],
      ["Muhtasari wa siku 30", "Nionyeshe muhtasari wa siku 30"]
    ]
  },
  en: {
    heroLabel: "DUKAFLOW INTELLIGENCE", heroDescription: "Ask about sales, profit, inventory, debts, and customers. Answers use verified records for your business and active branch.",
    assistantLabel: "BUSINESS ASSISTANT", assistantTitle: "Business intelligence and actions", live: "Live",
    welcomeTitle: "Hello", welcomeText: "Ask a question to explore your live branch data.",
    askTitle: "Ask about", askText: "Sales, profit, inventory, customers, debts, expenses, cash flow, and staff activity.",
    actionsTitle: "Safe actions", actionsText: "Product, stock, and expense changes require your confirmation first.",
    whatsappTitle: "WhatsApp Agent", whatsappText: "Connect the sales agent to help respond to customers.", whatsappLink: "Open WhatsApp Agent →",
    placeholder: "Ask Copilot about your business...", inputLabel: "Message Copilot", send: "Send message", inputHint: "Enter to send · Shift + Enter for a new line",
    user: "You", thinking: "Copilot is checking your business data...", restored: "Previous conversation restored.",
    confirmTitle: "Confirmation required", confirm: "Confirm", cancel: "Cancel", cancelled: "Action cancelled",
    actionCompleted: "Action completed", actionSuccess: "The requested action completed successfully.", errorFallback: "I couldn't complete that request right now. Please try again.",
    retry: "Try again", copilot: "DukaFlow Copilot", noResponse: "No response was returned.",
    prompts: [
      ["Today sales", "How much did I sell today?"], ["Today's transactions", "How many transactions did I make today?"],
      ["Top-selling products", "Which product sold most today?"], ["Low stock", "Which products are close to running out?"],
      ["Customers with debts", "Which customers have outstanding debts?"], ["Profit this week", "What is my profit this week?"],
      ["Business advice", "Give me advice based on my business data"], ["Sales history", "Show me today's sales history"],
      ["30-day summary", "Show my 30-day business summary"]
    ]
  }
};

function copilotText(key) {
  return COPILOT_COPY[getLanguage()][key];
}

function applyPromptLanguage() {
  const language = getLanguage();
  const copy = COPILOT_COPY[language];
  document.documentElement.lang = language;
  const setText = (selector, value) => {
    const element = $(selector);
    if (element) element.textContent = value;
  };

  setText(".df-copilot-hero .section-label", copy.heroLabel);
  setText(".df-copilot-hero p", copy.heroDescription);
  setText(".df-copilot-chat-head .section-label", copy.assistantLabel);
  setText(".df-copilot-chat-head strong", copy.assistantTitle);
  setText(".df-copilot-welcome h2", copy.welcomeTitle);
  setText(".df-copilot-welcome p", copy.welcomeText);
  const status = $(".df-copilot-status");
  if (status?.lastChild?.nodeType === Node.TEXT_NODE) status.lastChild.nodeValue = ` ${copy.live}`;
  const sideHeadings = document.querySelectorAll(".df-copilot-side h3");
  const sideDescriptions = document.querySelectorAll(".df-copilot-side > section > p");
  [copy.askTitle, copy.actionsTitle, copy.whatsappTitle].forEach((text, index) => { if (sideHeadings[index]) sideHeadings[index].textContent = text; });
  [copy.askText, copy.actionsText, copy.whatsappText].forEach((text, index) => { if (sideDescriptions[index]) sideDescriptions[index].textContent = text; });
  setText(".df-copilot-side a", copy.whatsappLink);

  document.querySelectorAll(".df-copilot-chip").forEach((chip, index) => {
    const prompt = copy.prompts[index];
    if (!prompt) return;
    chip.textContent = prompt[0];
    chip.dataset.question = prompt[1];
  });

  const input = $("#assistant-question");
  if (input) {
    input.placeholder = copy.placeholder;
    input.setAttribute("aria-label", copy.inputLabel);
  }
  $("#assistant-submit")?.setAttribute("aria-label", copy.send);
  setText(".df-copilot-input-hint", copy.inputHint);
}

function appendInline(parent, source) {
  const token = /(\*\*\*|___)(.+?)\1|(\*\*|__)(.+?)\3|(\*|_)(.+?)\5|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g;
  let cursor = 0;
  let match;

  while ((match = token.exec(source))) {
    parent.append(document.createTextNode(source.slice(cursor, match.index)));
    if (match[1]) {
      const strong = document.createElement("strong");
      const emphasis = document.createElement("em");
      emphasis.textContent = match[2];
      strong.append(emphasis);
      parent.append(strong);
    } else if (match[3]) {
      const strong = document.createElement("strong");
      strong.textContent = match[4];
      parent.append(strong);
    } else if (match[5]) {
      const emphasis = document.createElement("em");
      emphasis.textContent = match[6];
      parent.append(emphasis);
    } else if (match[7]) {
      const code = document.createElement("code");
      code.textContent = match[7];
      parent.append(code);
    } else {
      const href = match[9];
      const safeHref = href.startsWith("/") && !href.startsWith("//")
        ? href
        : href.startsWith("#")
          ? href
          : /^https?:\/\//i.test(href) ? href : null;
      if (!safeHref) {
        parent.append(document.createTextNode(match[0]));
      } else {
        const link = document.createElement("a");
        link.href = safeHref;
        link.textContent = match[8];
        if (/^https?:\/\//i.test(safeHref)) {
          link.target = "_blank";
          link.rel = "noopener noreferrer";
        }
        if (match[10]) link.title = match[10];
        parent.append(link);
      }
    }
    cursor = token.lastIndex;
  }

  parent.append(document.createTextNode(source.slice(cursor)));
}

function appendTable(parent, rows) {
  const wrapper = document.createElement("div");
  wrapper.className = "df-copilot-table-wrap";
  const table = document.createElement("table");
  const head = document.createElement("thead");
  const headerRow = document.createElement("tr");
  rows[0].forEach((cell) => {
    const th = document.createElement("th");
    appendInline(th, cell);
    headerRow.append(th);
  });
  head.append(headerRow);
  table.append(head);

  const body = document.createElement("tbody");
  rows.slice(1).forEach((row) => {
    const tr = document.createElement("tr");
    row.forEach((cell) => {
      const td = document.createElement("td");
      appendInline(td, cell);
      tr.append(td);
    });
    body.append(tr);
  });
  table.append(body);
  wrapper.append(table);
  parent.append(wrapper);
}

function renderMarkdown(source) {
  const fragment = document.createDocumentFragment();
  const lines = String(source || "").replaceAll("\r\n", "\n").split("\n");
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }

    if (/^\s*```/.test(line)) {
      const codeLines = [];
      index += 1;
      while (index < lines.length && !/^\s*```/.test(lines[index])) {
        codeLines.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      const pre = document.createElement("pre");
      const code = document.createElement("code");
      code.textContent = codeLines.join("\n");
      pre.append(code);
      fragment.append(pre);
      continue;
    }

    const heading = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (heading) {
      const element = document.createElement(`h${heading[1].length}`);
      appendInline(element, heading[2]);
      fragment.append(element);
      index += 1;
      continue;
    }

    const cells = (value) => value.trim().replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim());
    if (line.includes("|") && index + 1 < lines.length && cells(lines[index + 1]).every((cell) => /^:?-{3,}:?$/.test(cell))) {
      const rows = [cells(line)];
      index += 2;
      while (index < lines.length && lines[index].includes("|")) {
        rows.push(cells(lines[index]));
        index += 1;
      }
      appendTable(fragment, rows);
      continue;
    }

    const listMatch = line.match(/^\s*(?:([-+*])|(\d+)[.)])\s+(.+)$/);
    if (listMatch) {
      const ordered = Boolean(listMatch[2]);
      const list = document.createElement(ordered ? "ol" : "ul");
      while (index < lines.length) {
        const itemMatch = lines[index].match(/^\s*(?:([-+*])|(\d+)[.)])\s+(.+)$/);
        if (!itemMatch || Boolean(itemMatch[2]) !== ordered) break;
        const item = document.createElement("li");
        appendInline(item, itemMatch[3]);
        list.append(item);
        index += 1;
      }
      fragment.append(list);
      continue;
    }

    const paragraph = document.createElement("p");
    const paragraphLines = [];
    while (index < lines.length && lines[index].trim() && !/^\s*```/.test(lines[index]) && !/^\s{0,3}#{1,6}\s/.test(lines[index]) && !/^\s*(?:[-+*]|\d+[.)])\s+/.test(lines[index])) {
      paragraphLines.push(lines[index]);
      index += 1;
    }
    paragraphLines.forEach((paragraphLine, lineIndex) => {
      if (lineIndex) paragraph.append(document.createElement("br"));
      appendInline(paragraph, paragraphLine);
    });
    fragment.append(paragraph);
  }

  return fragment;
}

function animateCharacters(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const textNodes = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode);
  const characterCount = textNodes.reduce((total, node) => total + Array.from(node.nodeValue).length, 0);
  if (!characterCount || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return Promise.resolve();

  const duration = Math.min(1800, Math.max(220, characterCount * 13));
  const interval = duration / characterCount;
  let position = 0;

  textNodes.forEach((node) => {
    const fragment = document.createDocumentFragment();
    Array.from(node.nodeValue).forEach((character) => {
      const span = document.createElement("span");
      span.className = "df-copilot-typed-char";
      span.style.animationDelay = `${Math.round(position * interval)}ms`;
      span.textContent = character;
      fragment.append(span);
      position += 1;
    });
    node.replaceWith(fragment);
  });

  return new Promise((resolve) => window.setTimeout(resolve, duration + 120));
}

function scrollToLatest(force = false) {
  const answer = $("#assistant-answer");
  if (force) isFollowingLatest = true;
  if (isFollowingLatest) answer.scrollTop = answer.scrollHeight;
}

function createMessage(kind, label, className = "") {
  const message = document.createElement("article");
  message.className = `df-copilot-message df-copilot-message--${kind}${className ? ` ${className}` : ""}`;
  const heading = document.createElement("strong");
  heading.className = "df-copilot-message-label";
  heading.textContent = label;
  message.append(heading);
  return message;
}

function appendInsightCards(parent, insights) {
  if (!Array.isArray(insights) || !insights.length) return;
  const grid = document.createElement("div");
  grid.className = "df-copilot-insights";
  insights.forEach((insight) => {
    const card = document.createElement("section");
    card.className = "df-copilot-insight-card";
    const label = document.createElement("span");
    label.className = "df-copilot-insight-label";
    label.textContent = String(insight.label || "");
    const value = document.createElement("strong");
    value.className = "df-copilot-insight-value";
    value.textContent = String(insight.value ?? "");
    const detail = document.createElement("small");
    detail.textContent = String(insight.detail || "");
    card.append(label, value, detail);
    grid.append(card);
  });
  parent.append(grid);
}

function storedInsights(metadata) {
  if (typeof metadata === "string") {
    try { metadata = JSON.parse(metadata); } catch { return []; }
  }
  return Array.isArray(metadata?.insights) ? metadata.insights : [];
}

function addUserMessage(question) {
  const message = createMessage("user", copilotText("user"));
  const text = document.createElement("div");
  text.className = "df-copilot-user-text";
  text.textContent = question;
  message.append(text);
  $("#assistant-answer").append(message);
}

function showTypingIndicator() {
  const indicator = document.createElement("div");
  indicator.id = "copilot-loading";
  indicator.className = "df-copilot-typing";
  indicator.setAttribute("role", "status");
  indicator.setAttribute("aria-label", copilotText("thinking"));
  indicator.innerHTML = "<span></span><span></span><span></span>";
  $("#assistant-answer").append(indicator);
}

function formatActionResult(result) {
  if (!result || typeof result !== "object") return "";
  const list = document.createElement("ul");
  Object.entries(result).forEach(([key, value]) => {
    const item = document.createElement("li");
    const label = document.createElement("strong");
    label.textContent = `${key.replaceAll("_", " ")}: `;
    item.append(label, document.createTextNode(String(value ?? "")));
    list.append(item);
  });
  return list;
}

function setBusy(busy) {
  isBusy = busy;
  $("#assistant-submit").disabled = busy;
  $("#assistant-question").disabled = busy;
  document.querySelectorAll(".df-copilot-chip").forEach((button) => { button.disabled = busy; });
}

async function loadConversationHistory() {
  try {
    const response = await fetch("/api/assistant/conversations", { credentials: "include" });
    if (!response.ok) return;
    const data = await response.json();
    const list = data.conversations || [];
    if (!list.length) return;

    const answer = $("#assistant-answer");
    answer.innerHTML = "";
    const latest = list[0];
    conversationId = Number(latest.id);

    const detailResponse = await fetch(`/api/assistant/conversations/${latest.id}`, { credentials: "include" });
    if (!detailResponse.ok) return;
    const detail = await detailResponse.json();
    const messages = detail.messages || [];

    messages.forEach((message) => {
      if (message.role === "user") {
        addUserMessage(message.content || "");
      } else if (message.role === "assistant") {
        const entry = createMessage("assistant", "DukaFlow Copilot");
        appendInsightCards(entry, storedInsights(message.metadata));
        const content = document.createElement("div");
        content.className = "df-copilot-response";
        content.append(renderMarkdown(String(message.content || "")));
        entry.append(content);
        answer.append(entry);
      }
    });

    if (!messages.length) {
      const welcome = document.createElement("div");
      welcome.className = "df-copilot-welcome";
      const title = document.createElement("strong");
      title.textContent = copilotText("copilot");
      const text = document.createElement("p");
      text.textContent = copilotText("restored");
      welcome.append(title, text);
      answer.append(welcome);
    }
  } catch {
    // No history available yet.
  }
}

async function ask(question) {
  const answer = $("#assistant-answer");
  const input = $("#assistant-question");
  const prompt = String(question || "").trim();
  if (!prompt || isBusy) return;

  setBusy(true);
  answer.querySelector(".df-copilot-welcome")?.remove();
  addUserMessage(prompt);
  showTypingIndicator();
  scrollToLatest(true);

  try {
    const body = { question: prompt };
    if (conversationId) body.conversationId = conversationId;
    if (pending) {
      body.pendingActionId = pending.actionId || pending.id;
      body.confirmationToken = pending.confirmationToken;
    }

    const response = await fetch("/api/assistant", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.message || "Request failed");

    conversationId = data.conversationId || conversationId;
    pending = data.pendingAction || null;
    $("#copilot-loading")?.remove();

    if (data.result) {
      const activity = createMessage("activity", copilotText("actionCompleted"), "df-copilot-message--success");
      const text = document.createElement("p");
      text.textContent = data.message || copilotText("actionSuccess");
      activity.append(text);
      const details = formatActionResult(data.result);
      if (details) activity.append(details);
      answer.append(activity);
    } else {
      const message = createMessage("assistant", "DukaFlow Copilot");
      appendInsightCards(message, data.insights);
      const content = document.createElement("div");
      content.className = "df-copilot-response";
      content.setAttribute("aria-label", data.answer || copilotText("noResponse"));
      content.append(renderMarkdown(data.answer || copilotText("noResponse")));
      message.append(content);

      if (pending) {
        const action = document.createElement("section");
        action.className = "df-ai-action";
        const title = document.createElement("strong");
        title.textContent = copilotText("confirmTitle");
        const details = document.createElement("pre");
        details.textContent = JSON.stringify(pending.payload || {}, null, 2);
        const controls = document.createElement("div");
        controls.className = "df-ai-action-controls";
        const confirm = document.createElement("button");
        confirm.id = "confirm-ai";
        confirm.className = "primary-button";
        confirm.type = "button";
        confirm.textContent = copilotText("confirm");
        const cancel = document.createElement("button");
        cancel.id = "cancel-ai";
        cancel.className = "secondary-button";
        cancel.type = "button";
        cancel.textContent = copilotText("cancel");
        controls.append(confirm, cancel);
        action.append(title, details, controls);
        message.append(action);
        confirm.addEventListener("click", () => ask("yes"));
        cancel.addEventListener("click", () => {
          pending = null;
          action.remove();
          const notice = createMessage("activity", copilotText("cancelled"), "df-copilot-message--notice");
          answer.append(notice);
          scrollToLatest();
        });
      }

      answer.append(message);
      await animateCharacters(content);
    }
  } catch (error) {
    $("#copilot-loading")?.remove();
    const errorMessage = createMessage("activity", copilotText("copilot"), "df-copilot-message--error");
    const text = document.createElement("p");
    text.textContent = error?.message || copilotText("errorFallback");
    const retry = document.createElement("button");
    retry.className = "df-copilot-retry";
    retry.type = "button";
    retry.textContent = copilotText("retry");
    retry.addEventListener("click", () => ask(prompt));
    errorMessage.append(text, retry);
    answer.append(errorMessage);
  } finally {
    $("#copilot-loading")?.remove();
    setBusy(false);
    input.value = "";
    input.style.height = "auto";
    scrollToLatest();
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  await DukaAuth.ready;
  const input = $("#assistant-question");
  applyPromptLanguage();
  await loadConversationHistory();

  $("#assistant-form").addEventListener("submit", (event) => {
    event.preventDefault();
    pending = null;
    ask(input.value);
  });

  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      $("#assistant-form").requestSubmit();
    }
  });

  input.addEventListener("input", () => {
    input.style.height = "auto";
    input.style.height = `${Math.min(input.scrollHeight, 144)}px`;
  });

  document.querySelectorAll("[data-question]").forEach((button) => button.addEventListener("click", () => {
    pending = null;
    ask(button.dataset.question);
  }));

  $("#assistant-answer").addEventListener("scroll", () => {
    const answer = $("#assistant-answer");
    isFollowingLatest = answer.scrollHeight - answer.scrollTop - answer.clientHeight < 48;
  });

  input.focus();
});
