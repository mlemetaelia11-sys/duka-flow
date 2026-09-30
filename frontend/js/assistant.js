"use strict";

const $ = (selector) => document.querySelector(selector);
let pending = null;
let conversationId = null;
let isFollowingLatest = true;
let isBusy = false;

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
      index += index < lines.length ? 1 : 0;
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
    if (line.includes("|") && index + 1 < lines.length
      && cells(lines[index + 1]).every((cell) => /^:?-{3,}:?$/.test(cell))) {
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
    while (index < lines.length && lines[index].trim()
      && !/^\s*```/.test(lines[index])
      && !/^\s{0,3}#{1,6}\s/.test(lines[index])
      && !/^\s*(?:[-+*]|\d+[.)])\s+/.test(lines[index])) {
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
  const characters = textNodes.reduce((total, node) => total + Array.from(node.nodeValue).length, 0);
  if (!characters || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return Promise.resolve();

  const duration = Math.min(1800, Math.max(220, characters * 13));
  const interval = duration / characters;
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

function addUserMessage(question) {
  const message = createMessage("user", "Wewe");
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
  indicator.setAttribute("aria-label", "Copilot is responding");
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
      body.pendingActionId = pending.id;
      body.confirmationToken = pending.confirmationToken;
    }
    const response = await fetch("/api/assistant", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const data = await response.json();
    if (!response.ok) throw new Error("Request failed");

    conversationId = data.conversationId || conversationId;
    pending = data.pendingAction || null;
    $("#copilot-loading")?.remove();

    if (data.result) {
      const activity = createMessage("activity", "Kitendo kimekamilika", "df-copilot-message--success");
      const text = document.createElement("p");
      text.textContent = data.message || "The requested action completed successfully.";
      activity.append(text);
      const details = formatActionResult(data.result);
      if (details) activity.append(details);
      answer.append(activity);
    } else {
      const message = createMessage("assistant", "DukaFlow Copilot");
      const content = document.createElement("div");
      content.className = "df-copilot-response";
      content.setAttribute("aria-label", data.answer || "No response was returned.");
      content.append(renderMarkdown(data.answer || "No response was returned."));
      message.append(content);

      if (pending) {
        const action = document.createElement("section");
        action.className = "df-ai-action";
        const title = document.createElement("strong");
        title.textContent = "Confirmation required";
        const details = document.createElement("pre");
        details.textContent = JSON.stringify(pending.payload || {}, null, 2);
        const controls = document.createElement("div");
        controls.className = "df-ai-action-controls";
        const confirm = document.createElement("button");
        confirm.id = "confirm-ai";
        confirm.className = "primary-button";
        confirm.type = "button";
                confirm.disabled = true;
        confirm.textContent = "Confirm action";
        const cancel = document.createElement("button");
        cancel.id = "cancel-ai";
        cancel.className = "secondary-button";
        cancel.type = "button";
        cancel.textContent = "Cancel";
        controls.append(confirm, cancel);
        action.append(title, details, controls);
        message.append(action);
        confirm.addEventListener("click", () => ask("yes"));
        cancel.addEventListener("click", () => {
          pending = null;
          action.remove();
          const notice = createMessage("activity", "Action cancelled", "df-copilot-message--notice");
          answer.append(notice);
          scrollToLatest();
        });
      }
      answer.append(message);
      await animateCharacters(content);
      message.querySelector("#confirm-ai")?.removeAttribute("disabled");
    }
  } catch {
    $("#copilot-loading")?.remove();
    const error = createMessage("activity", "Copilot", "df-copilot-message--error");
    const text = document.createElement("p");
    text.textContent = "I couldn't complete that request right now. Please try again.";
    const retry = document.createElement("button");
    retry.className = "df-copilot-retry";
    retry.type = "button";
    retry.textContent = "Try again";
    retry.addEventListener("click", () => ask(prompt));
    error.append(text, retry);
    answer.append(error);
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
