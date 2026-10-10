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
  let live = null;
  let threads = [];
  const visibleNow = () => !document.hidden;

  function schedulePoll(ms) {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(() => {
      loadThreads();
      if (activeThread) loadMessages(visibleNow());
    }, ms);
  }

  function unreadCount(list) {
    return list.filter((t) => store.isUnread(t.id, t.last_message_at)).length;
  }

  function paintThreads(list) {
    const el = $("thread-list");
    $("chat-count").textContent = list.length ? `${list.length} conversation${list.length === 1 ? "" : "s"}` : "";
    const pending = unreadCount(list);
    const badge = $("chat-unread");
    if (badge) {
      badge.hidden = !pending;
      badge.textContent = pending ? `${pending} awaiting reply` : "";
    }
    if (!list.length) {
      el.innerHTML = `<p class="meta" style="padding:1rem">No conversations yet.</p>`;
      return;
    }
    el.innerHTML = list
      .map((t) => {
        const name = (t.user && (t.user.display_name || t.user.email)) || "Customer";
        const on = activeThread && activeThread.id === t.id;
        const unread = store.isUnread(t.id, t.last_message_at);
        const marker = unread ? '<span aria-label="awaiting reply" style="display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--amber);margin-right:0.4rem"></span>' : "";
        return `<button data-thread="${esc(t.id)}" style="display:block;width:100%;text-align:left;padding:0.9rem 1rem;border:0;border-bottom:1px solid var(--rule);background:${on ? "var(--paper-2)" : "transparent"};cursor:pointer">
          <strong style="display:block;font-size:12px;font-weight:${unread ? "600" : "500"}">${marker}${esc(name)}</strong>
          <span style="font-size:10px;color:var(--sage)">${esc((t.user && t.user.phone) || "")} · ${time(t.last_message_at)}</span>
        </button>`;
      })
      .join("");
    el.querySelectorAll("[data-thread]").forEach((btn) => {
      btn.addEventListener("click", () => selectThread(threads.find((t) => t.id === btn.dataset.thread)));
    });
  }

  function paintMessages(messages, adminId, markRead) {
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
    // Reading a thread clears its flag, but only while it is on screen.
    if (markRead && activeThread && messages.length) {
      store.markSeen(activeThread.id, messages[messages.length - 1].created_at);
      paintThreads(threads);
    }
  }

  async function loadThreads() {
    try {
      threads = (await store.listThreads()) || [];
      // Keep the open thread pointing at the refreshed row.
      if (activeThread) activeThread = threads.find((t) => t.id === activeThread.id) || activeThread;
      paintThreads(threads);
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
    await loadMessages(true);
  }

  async function loadMessages(markRead) {
    if (!activeThread) return;
    const adminId = store.session()?.user_id;
    try {
      const messages = await store.listMessages(activeThread.id);
      paintMessages(messages || [], adminId, sheetVisible() && markRead !== false);
    } catch (err) {
      console.warn("[muhsi] messages unavailable:", err.message);
    }
  }

  function sheetVisible() {
    const panel = $("admin-chat");
    return visibleNow() && panel && !panel.hidden;
  }

  function goLive() {
    if (live || !store.channel) return;
    live = store.channel();
    live.onStatus((mode) => schedulePoll(mode === "live" ? 30000 : 6000));
    live.subscribe("message", () => {
      loadThreads();
      if (activeThread) loadMessages(false);
    });
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
      await loadMessages(true);
      await loadThreads();
    } catch (ex) {
      if (err) err.textContent = ex.message || "Reply could not be sent.";
      input.value = body;
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (!visibleNow()) return;
    loadThreads();
    if (activeThread) loadMessages(true);
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
    goLive();
    schedulePoll(6000);
  }

  store.onAuthChange(() => {
    if (pollTimer) clearInterval(pollTimer);
    if (live) {
      live.close();
      live = null;
    }
    activeThread = null;
    boot();
  });
  boot();
})();
