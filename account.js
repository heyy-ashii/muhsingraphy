/* ============================================================
   Muhsingraphy — account page: auth + chat
   ------------------------------------------------------------
   Talks only to window.MuhsiStore. When Supabase is not
   configured the page shows a short notice instead of the forms.
   ============================================================ */
(function () {
  const store = window.MuhsiStore;
  const $ = (id) => document.getElementById(id);
  if (!store) return;

  const notConfigured = $("not-configured");
  const authSection = $("auth-section");
  const accountSection = $("account-section");

  if (!store.configured) {
    if (notConfigured) notConfigured.hidden = false;
    return;
  }

  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const time = (iso) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  function showError(form, message) {
    const el = form.querySelector("[data-error]");
    if (el) el.textContent = message || "";
  }

  /* ── auth tabs ─────────────────────────────────────────── */
  document.querySelectorAll("[data-auth-tab]").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll("[data-auth-tab]").forEach((t) => t.setAttribute("aria-selected", String(t === tab)));
      document.querySelectorAll("[data-auth-panel]").forEach((p) => (p.hidden = p.dataset.authPanel !== tab.dataset.authTab));
    });
  });

  /* ── sign in / sign up ─────────────────────────────────── */
  $("form-login").addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.target;
    showError(form, "");
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    try {
      await store.signIn($("login-email").value.trim(), $("login-pass").value);
      await render();
    } catch (err) {
      showError(form, err.message || "Could not sign in.");
    } finally {
      btn.disabled = false;
    }
  });

  $("form-signup").addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.target;
    showError(form, "");
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    try {
      await store.signUp({
        email: $("su-email").value.trim(),
        password: $("su-pass").value,
        phone: $("su-phone").value.trim() || null,
        displayName: $("su-name").value.trim() || null,
      });
      await render();
    } catch (err) {
      // A duplicate email or phone means one of the unique constraints fired.
      const msg = /duplicate|already|unique/i.test(err.message || "")
        ? "That email or phone number is already registered."
        : err.message || "Could not create the account.";
      showError(form, msg);
    } finally {
      btn.disabled = false;
    }
  });

  $("sign-out").addEventListener("click", async () => {
    store.signOut();
    await render();
  });

  /* ── chat ──────────────────────────────────────────────── */
  let thread = null;
  let pollTimer = null;
  let live = null;
  const baseTitle = document.title;

  const visibleNow = () => !document.hidden;

  function schedulePoll(ms) {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(loadThread, ms);
  }

  function setBadge(on) {
    const badge = $("chat-badge");
    if (badge) badge.hidden = !on;
    document.title = on ? `● ${baseTitle}` : baseTitle;
  }

  function setStatus(mode) {
    const el = $("chat-status");
    if (!el) return;
    el.textContent = mode === "live" ? "Live — messages appear as they are sent." : "";
  }

  function paint(messages, meId, markRead) {
    const log = $("chat-log");
    if (!messages.length) {
      log.innerHTML = `<p class="meta" style="margin:auto;text-align:center">No messages yet. Say hello.</p>`;
      return;
    }
    log.innerHTML = messages
      .map((m) => {
        const mine = m.sender_id === meId;
        return `<div style="align-self:${mine ? "flex-end" : "flex-start"};max-width:78%">
          <p class="meta" style="margin-bottom:0.25rem;text-align:${mine ? "right" : "left"}">${mine ? "You" : "Studio"} · ${time(m.created_at)}</p>
          <div style="padding:0.6rem 0.9rem;background:${mine ? "var(--ink)" : "var(--paper-2)"};color:${mine ? "var(--on-ink)" : "var(--ink)"}">
            ${esc(m.body).replace(/\n/g, "<br>")}
          </div>
        </div>`;
      })
      .join("");
    log.scrollTop = log.scrollHeight;
    if (!markRead) return;
    const newest = messages[messages.length - 1];
    if (newest) store.markSeen(thread.id, newest.created_at);
    setBadge(false);
  }

  async function loadThread() {
    const me = store.session();
    if (!me) return;
    try {
      const t = await store.getMyThread();
      if (!t) {
        $("chat-log").innerHTML = `<p class="meta" style="margin:auto;text-align:center">Creating your conversation…</p>`;
        return;
      }
      thread = t;
      const messages = await store.listMessages(t.id);
      // Only treat a message as seen when the reader is actually looking.
      const markRead = visibleNow() && !accountSection.hidden;
      paint(messages, me.user_id, markRead);
      // Studio replied and the reader is elsewhere — surface it.
      if (!markRead && store.isUnread(t.id, t.last_message_at)) setBadge(true);
    } catch (err) {
      console.warn("[muhsi] chat unavailable:", err.message);
    }
  }

  // A realtime push just refreshes from the API: one code path, and the
  // round trip is what proves the row is really there and visible to RLS.
  function goLive() {
    if (live || !store.channel) return;
    live = store.channel();
    live.onStatus((mode) => {
      setStatus(mode);
      // Live pushes make the timer redundant; keep a slow safety net.
      schedulePoll(mode === "live" ? 30000 : 5000);
    });
    live.subscribe("message", () => loadThread());
  }

  $("chat-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.target;
    const input = $("chat-input");
    showError(form, "");
    const body = input.value.trim();
    if (!body) return;
    if (!thread) {
      showError(form, "No conversation yet — try again in a moment.");
      return;
    }
    input.value = "";
    try {
      await store.sendMessage(thread.id, body);
      await loadThread();
    } catch (err) {
      showError(form, err.message || "Message could not be sent.");
      input.value = body;
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (visibleNow() && !accountSection.hidden && thread) {
      setBadge(false);
      loadThread();
    }
  });

  /* ── render ────────────────────────────────────────────── */
  async function render() {
    const me = store.session();
    const signedIn = Boolean(me);
    if (authSection) authSection.hidden = signedIn;
    if (accountSection) accountSection.hidden = !signedIn;

    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    if (!signedIn) {
      if (live) {
        live.close();
        live = null;
      }
      thread = null;
      setBadge(false);
      return;
    }

    let profile = null;
    try {
      profile = await store.getProfile();
    } catch (err) {
      console.warn("[muhsi] profile unavailable:", err.message);
    }

    if (profile) {
      $("account-title").textContent = profile.display_name ? `Welcome back, ${profile.display_name}.` : "Welcome back.";
      $("account-meta").textContent = `${profile.role === "admin" ? "Studio admin" : "Customer"} account`;
      $("p-name").textContent = profile.display_name || "—";
      $("p-email").textContent = profile.email || "—";
      $("p-phone").textContent = profile.phone || "—";
      $("p-role").textContent = profile.role;

      if (profile.role === "admin") {
        const link = document.createElement("a");
        link.className = "btn btn--outline";
        link.href = "admin.html";
        link.textContent = "Open studio admin";
        link.style.marginTop = "1.2rem";
        const holder = accountSection.querySelector(".sec-head");
        if (holder && !holder.querySelector('a[href="admin.html"]')) holder.appendChild(link);
      }
    }

    await loadThread();
    goLive();
    // Realtime is the fast path; this timer is the safety net when it is
    // unavailable (tables not published, socket blocked, offline).
    schedulePoll(5000);
  }

  store.onAuthChange(render);
  render();
})();
