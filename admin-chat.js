/* ============================================================
   Muhsingraphy — admin chat inbox
   ------------------------------------------------------------
   Only runs for a signed-in user whose profile.role is 'admin'.
   RLS on thread/message enforces that server-side; this file just
   decides what to show.
   ============================================================ */
(function () {
  const store = window.MuhsiStore;
  const $ = (id) => document.getElementById(id);
  if (!store || !store.configured) return;
  if (!document.getElementById("thread-list")) return;

  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const time = (iso) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  let activeThread = null;
  let pollTimer = null;

  function paintThreads(threads) {
    const list = $("thread-list");
    $("chat-count").textContent = threads.length ? `${threads.length} conversation${threads.length === 1 ? "" : "s"}` : "";
    if (!threads.length) {
      list.innerHTML = `<p class="meta" style="padding:1rem">No conversations yet.</p>`;
      return;
    }
    list.innerHTML = threads
      .map((t) => {
        const name = (t.user && (t.user.display_name || t.user.email)) || "Customer";
        const on = activeThread && activeThread.id === t.id;
        return `<button data-thread="${esc(t.id)}" style="display:block;width:100%;text-align:left;padding:0.9rem 1rem;border:0;border-bottom:1px solid var(--rule);background:${on ? "var(--paper-2)" : "transparent"};cursor:pointer">
          <strong style="display:block;font-size:12px;font-weight:500">${esc(name)}</strong>
          <span style="font-size:10px;color:var(--sage)">${esc((t.user && t.user.phone) || "")} · ${time(t.last_message_at)}</span>
        </button>`;
      })
      .join("");
    list.querySelectorAll("[data-thread]").forEach((btn) => {
      btn.addEventListener("click", () => selectThread(threads.find((t) => t.id === btn.dataset.thread)));
    });
  }

  function paintMessages(messages, adminId) {
    const log = $("admin-chat-log");
    if (!messages.length) {
      log.innerHTML = `<p class="meta" style="margin:auto;text-align:center">No messages in this conversation.</p>`;
      return;
    }
    log.innerHTML = messages
      .map((m) => {
        const mine = m.sender_id === adminId;
        return `<div style="align-self:${mine ? "flex-end" : "flex-start"};max-width:78%">
          <p class="meta" style="margin-bottom:0.25rem;text-align:${mine ? "right" : "left"}">${mine ? "You" : "Customer"} · ${time(m.created_at)}</p>
          <div style="padding:0.6rem 0.9rem;background:${mine ? "var(--ink)" : "var(--paper-2)"};color:${mine ? "var(--on-ink)" : "var(--ink)"}">
            ${esc(m.body).replace(/\n/g, "<br>")}
          </div>
        </div>`;
      })
      .join("");
    log.scrollTop = log.scrollHeight;
  }

  async function loadThreads() {
    try {
      const threads = await store.listThreads();
      paintThreads(threads || []);
    } catch (err) {
      console.warn("[muhsi] admin threads unavailable:", err.message);
    }
  }

  async function selectThread(t) {
    if (!t) return;
    activeThread = t;
    $("admin-chat-input").disabled = false;
    $("admin-chat-form").querySelector('button[type="submit"]').disabled = false;
    await loadThreads();
    await loadMessages();
  }

  async function loadMessages() {
    if (!activeThread) return;
    const adminId = store.session()?.user_id;
    try {
      const messages = await store.listMessages(activeThread.id);
      paintMessages(messages || [], adminId);
    } catch (err) {
      console.warn("[muhsi] messages unavailable:", err.message);
    }
  }

  $("admin-chat-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.target;
    const err = form.querySelector("[data-error]");
    if (err) err.textContent = "";
    const input = $("admin-chat-input");
    const body = input.value.trim();
    if (!body || !activeThread) return;
    input.value = "";
    try {
      await store.sendMessage(activeThread.id, body);
      await loadMessages();
      await loadThreads();
    } catch (ex) {
      if (err) err.textContent = ex.message || "Reply could not be sent.";
      input.value = body;
    }
  });

  async function boot() {
    // Only render the inbox for an admin.
    let profile = null;
    try {
      profile = await store.getProfile();
    } catch (err) {
      console.warn("[muhsi] profile unavailable:", err.message);
    }
    if (!profile || profile.role !== "admin") {
      const panel = $("admin-chat");
      if (panel) panel.hidden = true;
      return;
    }
    await loadThreads();
    pollTimer = setInterval(() => {
      loadThreads();
      if (activeThread) loadMessages();
    }, 6000);
  }

  store.onAuthChange(() => {
    if (pollTimer) clearInterval(pollTimer);
    boot();
  });
  boot();
})();
