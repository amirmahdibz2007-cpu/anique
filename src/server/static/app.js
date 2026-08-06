/**
 * Anique Web UI — client-side app.
 * Vanilla JS, no build step, no framework.
 */

// ── Tiny syntax highlighter ────────────────────────────────────
// Covers: keywords, strings, numbers, comments, function calls, types.
// Works for JS/TS/Python/C/C++/Go/Bash — good enough for terminal output.
const KW = new Set([
  "const","let","var","function","return","if","else","for","while","do",
  "class","extends","import","export","from","default","new","this","super",
  "typeof","instanceof","in","of","async","await","try","catch","finally",
  "throw","switch","case","break","continue","yield","static","get","set",
  "true","false","null","undefined","void","delete","type","interface",
  "enum","namespace","declare","abstract","implements","readonly","override",
  "def","lambda","pass","with","as","raise","except","elif","not","and","or",
  "is","None","True","False","struct","func","package","go","defer","select",
  "chan","map","range","make","append","len","cap","int","string","bool",
  "float","double","char","void","auto","template","typename","namespace",
  "public","private","protected","virtual","override","final","inline",
  "echo","fi","then","done","do","esac","case","in","local","export",
]);

function highlight(code, lang) {
  // Escape HTML
  let s = code.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");

  // Single-line comments (// and #)
  s = s.replace(/(\/\/[^\n]*|#[^\n]*)/g, '<span class="tok-cmt">$1</span>');

  // Multi-line comments /* ... */
  s = s.replace(/(\/\*[\s\S]*?\*\/)/g, '<span class="tok-cmt">$1</span>');

  // Strings (double, single, backtick) — skip inside already-tagged spans
  s = s.replace(/("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)/g,
    '<span class="tok-str">$1</span>');

  // Numbers
  s = s.replace(/\b(\d+\.?\d*(?:[eE][+-]?\d+)?)\b/g, '<span class="tok-num">$1</span>');

  // Function calls: word followed by (
  s = s.replace(/\b([a-zA-Z_]\w*)\s*(?=\()/g, (m, name) => {
    if (KW.has(name)) return `<span class="tok-kw">${name}</span>`;
    return `<span class="tok-fn">${name}</span>`;
  });

  // Keywords (remaining, not already tagged)
  s = s.replace(/\b([a-zA-Z_]\w*)\b/g, (m) => {
    if (KW.has(m)) return `<span class="tok-kw">${m}</span>`;
    // PascalCase → type
    if (/^[A-Z][a-zA-Z0-9]*$/.test(m)) return `<span class="tok-type">${m}</span>`;
    return m;
  });

  return s;
}

// ── Markdown renderer ──────────────────────────────────────────
function renderMarkdown(md) {
  if (!md) return "";
  const esc = (s) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  let html = esc(md);

  // Fenced code blocks — with syntax highlight + copy button
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const trimmed = code.trimEnd();
    const highlighted = lang ? highlight(trimmed, lang) : esc(trimmed).replace(/&amp;/g,"&amp;").replace(/&lt;/g,"&lt;").replace(/&gt;/g,"&gt;");
    const langLabel = lang || "text";
    return `<pre data-lang="${langLabel}"><div class="code-header"><span class="code-lang">${langLabel}</span><button class="copy-btn" onclick="copyCode(this)">copy</button></div><code>${highlighted}</code></pre>`;
  });

  // Blockquotes
  html = html.replace(/^&gt; (.+)$/gm, "<blockquote>$1</blockquote>");
  // Headings
  html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/^## (.+)$/gm, "<h2>$1</h2>");
  html = html.replace(/^# (.+)$/gm, "<h1>$1</h1>");
  // HR
  html = html.replace(/^---+$/gm, "<hr>");
  // Tables
  html = html.replace(/((?:^\|.+\|\n)+)/gm, (block) => {
    const rows = block.trim().split("\n");
    let out = "<table>";
    rows.forEach((row, i) => {
      if (/^\|[-| :]+\|$/.test(row.trim())) return;
      const cells = row.trim().replace(/^\||\|$/g,"").split("|").map((c)=>c.trim());
      const tag = i === 0 ? "th" : "td";
      out += `<tr>${cells.map((c)=>`<${tag}>${c}</${tag}>`).join("")}</tr>`;
    });
    return out + "</table>";
  });
  // Lists
  html = html.replace(/((?:^[-*] .+\n?)+)/gm, (block) =>
    "<ul>" + block.trim().split("\n").map((l)=>`<li>${l.replace(/^[-*] /,"")}</li>`).join("") + "</ul>"
  );
  html = html.replace(/((?:^\d+\. .+\n?)+)/gm, (block) =>
    "<ol>" + block.trim().split("\n").map((l)=>`<li>${l.replace(/^\d+\. /,"")}</li>`).join("") + "</ol>"
  );
  // Inline code
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  // Bold/italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>");
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");
  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener">$1</a>');
  // Paragraphs
  html = html.split(/\n{2,}/).map((block) => {
    if (/^<(h[1-6]|ul|ol|pre|table|blockquote|hr)/.test(block.trim())) return block;
    return `<p>${block.replace(/\n/g,"<br>")}</p>`;
  }).join("\n");

  return html;
}

// Copy button handler (global, called from inline onclick)
window.copyCode = function(btn) {
  const code = btn.closest("pre").querySelector("code");
  navigator.clipboard.writeText(code.innerText).then(() => {
    btn.textContent = "copied!";
    setTimeout(() => { btn.textContent = "copy"; }, 1500);
  });
};

// ── DOM refs ───────────────────────────────────────────────────
const feed          = document.getElementById("feed");
const input         = document.getElementById("input");
const sendBtn       = document.getElementById("send-btn");
const abortBtn      = document.getElementById("abort-btn");
const statusDot     = document.getElementById("status-dot");
const sessionList   = document.getElementById("session-list");
const newChatBtn    = document.getElementById("new-chat-btn");
const sidebarToggle = document.getElementById("sidebar-toggle");
const sidebar       = document.getElementById("sidebar");
const sessionTitle  = document.getElementById("session-title");
const lensBadge     = document.getElementById("lens-badge");
const slashBtns     = document.querySelectorAll(".slash-btn");

// ── State ──────────────────────────────────────────────────────
let ws           = null;
let busy         = false;
let sessionId    = null;
let streamingEl  = null;
let streamingRaw = "";

// ── WebSocket ──────────────────────────────────────────────────
function connect() {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  ws = new WebSocket(`${proto}://${location.host}`);

  ws.addEventListener("open", () => {
    setStatus("idle");
    loadSessionList();
  });
  ws.addEventListener("close", () => {
    setStatus("error");
    setTimeout(connect, 3000);
  });
  ws.addEventListener("error", () => setStatus("error"));

  ws.addEventListener("message", (ev) => {
    let msg;
    try { msg = JSON.parse(ev.data); } catch { return; }

    switch (msg.type) {
      case "hello":
        lensBadge.textContent = msg.lens;
        document.title = `Anique · ${msg.lens}`;
        break;
      case "token":
        handleToken(msg.text);
        break;
      case "event":
        handleEvent(msg.kind, msg.summary, msg.detail);
        break;
      case "approval_request":
        showApprovalModal(msg);
        break;
      case "usage":
        break;
      case "done":
        sessionId = msg.sessionId;
        finalizeStream();
        setBusy(false);
        loadSessionList();
        break;
      case "session_loaded":
        onSessionLoaded(msg);
        break;
      case "error":
        finalizeStream();
        appendError(msg.message);
        setBusy(false);
        break;
    }
  });
}

// ── Approval modal ─────────────────────────────────────────────
const RISK_LABELS = {
  safe:            { label: "Safe",          color: "var(--success)" },
  workspace_write: { label: "Write to disk", color: "#fbbf24" },
  dangerous:       { label: "Dangerous",     color: "var(--error)" },
};

function showApprovalModal(req) {
  document.getElementById("approval-modal")?.remove();
  const risk = RISK_LABELS[req.risk] ?? { label: req.risk, color: "var(--muted)" };
  const overlay = document.createElement("div");
  overlay.id = "approval-modal";
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <div class="modal-box">
      <div class="modal-header">
        <span class="modal-title">Tool approval required</span>
        <span class="modal-risk" style="color:${risk.color}">${risk.label}</span>
      </div>
      <div class="modal-tool"><span class="modal-tool-name">${escHtml(req.tool)}</span></div>
      ${req.preview ? `<pre class="modal-preview">${escHtml(req.preview.slice(0,600))}</pre>` : ""}
      <div class="modal-prompt">${escHtml(req.prompt)}</div>
      <div class="modal-actions">
        <button class="modal-btn deny"    data-decision="deny">Deny</button>
        <button class="modal-btn once"    data-decision="once">Allow once</button>
        <button class="modal-btn session" data-decision="session">Allow for session</button>
        ${req.risk === "workspace_write"
          ? `<button class="modal-btn workspace" data-decision="workspace">Allow all writes</button>`
          : ""}
      </div>
    </div>`;
  overlay.querySelectorAll(".modal-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      overlay.remove();
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "approval_response", id: req.id, decision: btn.dataset.decision }));
      }
    });
  });
  document.body.appendChild(overlay);
}

function escHtml(s) {
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

// ── Session list ───────────────────────────────────────────────
async function loadSessionList() {
  try {
    const res = await fetch("/api/sessions");
    const sessions = await res.json();
    renderSessionList(sessions);
  } catch (e) {
    console.warn("Could not load sessions:", e);
  }
}

function renderSessionList(sessions) {
  sessionList.innerHTML = "";
  for (const s of sessions) {
    const item = document.createElement("div");
    item.className = "session-item" + (s.id === sessionId ? " active" : "");
    item.dataset.id = s.id;
    const title = document.createElement("div");
    title.className = "session-item-title";
    title.textContent = s.title || "Untitled";
    const meta = document.createElement("div");
    meta.className = "session-item-meta";
    meta.textContent = `${s.lens} · ${formatRelativeTime(new Date(s.updated_at))}`;
    item.appendChild(title);
    item.appendChild(meta);
    item.addEventListener("click", () => switchSession(s.id, s.title));
    sessionList.appendChild(item);
  }
}

function formatRelativeTime(date) {
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ── Session switching ──────────────────────────────────────────
function switchSession(id, title) {
  if (id === sessionId || busy) return;
  feed.innerHTML = "";
  sessionTitle.textContent = title || "Loading...";
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: "load_session", sessionId: id }));
  }
  document.querySelectorAll(".session-item").forEach((el) => {
    el.classList.toggle("active", el.dataset.id === id);
  });
}

function onSessionLoaded(msg) {
  sessionId = msg.sessionId;
  sessionTitle.textContent = msg.title || "Session";
  feed.innerHTML = "";
  for (const m of msg.messages) {
    if (m.role === "user") {
      appendUserBubble(m.content || "");
    } else if (m.role === "assistant" && m.content) {
      const body = appendAgentBubble();
      body.innerHTML = renderMarkdown(m.content);
    }
  }
  scrollToBottom();
}

function startNewChat() {
  sessionId = null;
  feed.innerHTML = "";
  sessionTitle.textContent = "New chat";
  document.querySelectorAll(".session-item").forEach((el) => el.classList.remove("active"));
  input.focus();
}

// ── Streaming ──────────────────────────────────────────────────
function handleToken(text) {
  if (!streamingEl) {
    streamingEl = appendAgentBubble();
    streamingRaw = "";
  }
  streamingRaw += text;
  streamingEl.innerHTML = renderMarkdown(streamingRaw);
  streamingEl.classList.add("cursor");
  scrollToBottom();
}

function finalizeStream() {
  if (streamingEl) {
    streamingEl.classList.remove("cursor");
    streamingEl.innerHTML = renderMarkdown(streamingRaw);
    streamingEl = null;
    streamingRaw = "";
  }
  scrollToBottom();
}

// ── Tool events — collapsible ──────────────────────────────────
function handleEvent(kind, summary, detail) {
  if (kind === "tool") {
    const details = document.createElement("details");
    details.className = "tool-event";
    const sum = document.createElement("summary");
    sum.textContent = summary;
    details.appendChild(sum);
    if (detail) {
      const pre = document.createElement("div");
      pre.className = "tool-detail";
      pre.textContent = detail;
      details.appendChild(pre);
    }
    feed.appendChild(details);
    scrollToBottom();
  } else if (kind === "approval") {
    const pill = document.createElement("div");
    pill.className = "event-pill approval";
    pill.textContent = summary;
    if (detail) pill.title = detail;
    feed.appendChild(pill);
    scrollToBottom();
  }
  // system events are intentionally silent in the feed
}

// ── Message helpers ────────────────────────────────────────────
function appendUserBubble(text) {
  const wrap = document.createElement("div");
  wrap.className = "msg user";
  const label = document.createElement("div");
  label.className = "msg-label";
  label.textContent = "you";
  const body = document.createElement("div");
  body.className = "msg-body";
  body.dir = "auto";
  body.textContent = text;
  wrap.appendChild(label);
  wrap.appendChild(body);
  feed.appendChild(wrap);
  scrollToBottom();
}

function appendAgentBubble() {
  const wrap = document.createElement("div");
  wrap.className = "msg agent";
  const label = document.createElement("div");
  label.className = "msg-label";
  label.textContent = "anique";
  const body = document.createElement("div");
  body.className = "msg-body";
  wrap.appendChild(label);
  wrap.appendChild(body);
  feed.appendChild(wrap);
  scrollToBottom();
  return body;
}

function appendError(message) {
  const pill = document.createElement("div");
  pill.className = "event-pill";
  pill.style.color = "var(--error)";
  pill.style.borderColor = "#3a1a1a";
  pill.textContent = `error: ${message}`;
  feed.appendChild(pill);
  scrollToBottom();
}

function scrollToBottom() {
  feed.scrollTop = feed.scrollHeight;
}

// ── Send ───────────────────────────────────────────────────────
function sendMessage(text) {
  const msg = (text ?? input.value).trim();
  if (!msg || busy || !ws || ws.readyState !== WebSocket.OPEN) return;
  appendUserBubble(msg);
  if (!text) { input.value = ""; input.style.height = "auto"; }
  setBusy(true);
  ws.send(JSON.stringify({ type: "message", text: msg, sessionId }));
}

// ── UI state ───────────────────────────────────────────────────
function setBusy(state) {
  busy = state;
  sendBtn.disabled = state;
  abortBtn.disabled = !state;
  slashBtns.forEach((b) => { b.disabled = state; });
  setStatus(state ? "busy" : "idle");
}

function setStatus(s) {
  statusDot.className = `dot ${s}`;
  statusDot.title = s;
}

// ── Events ─────────────────────────────────────────────────────
sendBtn.addEventListener("click", () => sendMessage());

abortBtn.addEventListener("click", () => {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: "abort" }));
  }
});

newChatBtn.addEventListener("click", startNewChat);

sidebarToggle.addEventListener("click", () => {
  sidebar.classList.toggle("collapsed");
});

// Slash command buttons
slashBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    const cmd = btn.dataset.cmd;
    sendMessage(cmd);
  });
});

input.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
    e.preventDefault();
    sendMessage();
  }
  if (e.key === "Escape") {
    const modal = document.getElementById("approval-modal");
    if (modal) {
      modal.querySelector(".modal-btn.deny")?.click();
    } else {
      abortBtn.click();
    }
  }
});

input.addEventListener("input", () => {
  input.style.height = "auto";
  input.style.height = Math.min(input.scrollHeight, 200) + "px";
});

// ── Boot ───────────────────────────────────────────────────────
connect();
