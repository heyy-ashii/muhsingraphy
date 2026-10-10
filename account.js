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

  function paint(messages, meId) {
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
      paint(messages, me.user_id);
    } catch (err) {
      console.warn("[muhsi] chat unavailable:", err.message);
    }
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
    if (!signedIn) return;

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
    // Realtime is an upgrade path; polling keeps this dependency-free.
    pollTimer = setInterval(loadThread, 5000);
  }

  store.onAuthChange(render);
  render();
})();
