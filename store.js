/* ============================================================
   Muhsingraphy — storefront data layer
   ------------------------------------------------------------
   Dependency-free Supabase REST (PostgREST) + Auth client.

   Design goals
   * No build step, no npm packages — this is a static site.
   * Public catalogue is read with the PUBLISHABLE key only.
   * Every call has a graceful fallback: if Supabase is not
     configured (or unreachable), the caller keeps its built-in
     static markup. The site never breaks for a visitor.
   * No secrets. Privileged operations are deliberately absent
     and belong in a server-side Edge Function.
   ============================================================ */
(function () {
  const cfg = window.MUHSI_CONFIG || {};
  const url = (cfg.supabaseUrl || "").replace(/\/+$/, "");
  const key = cfg.supabasePublishableKey || "";

  const configured = Boolean(url && key);

  const SESSION_KEY = "muhsi.auth";
  const listeners = new Set();

  function session() {
    try {
      return JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
    } catch {
      return null;
    }
  }

  function setSession(s) {
    if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    else localStorage.removeItem(SESSION_KEY);
    listeners.forEach((fn) => fn(session()));
  }

  function headers(extra) {
    const s = session();
    return Object.assign(
      {
        apikey: key,
        "Content-Type": "application/json",
      },
      s && s.access_token ? { Authorization: `Bearer ${s.access_token}` } : {},
      extra || {}
    );
  }

  async function req(path, opts) {
    const res = await fetch(`${url}${path}`, opts);
    const text = await res.text();
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }
    if (!res.ok) {
      const message = (body && (body.msg || body.message || body.error_description)) || res.statusText;
      throw Object.assign(new Error(message), { status: res.status, body });
    }
    return body;
  }

  // Persist an auth result. Supabase returns expires_in in seconds.
  function storeAuth(s, email) {
    setSession({
      access_token: s.access_token,
      refresh_token: s.refresh_token,
      expires_at: Date.now() + (s.expires_in || 3600) * 1000,
      user_id: s.user ? s.user.id : null,
      email: email || (s.user ? s.user.email : null),
    });
    return session();
  }

  /* ── catalogue ─────────────────────────────────────────── */
  async function listProducts() {
    if (!configured) return null;
    const q =
      "/rest/v1/product?select=id,slug,title,label,summary,kind,presentation,edition," +
      "artwork:artwork_id(slug,title,image_path,detail_path)," +
      "variants:variant(size_label,price_cents,currency,sort_order)" +
      "&is_published=eq.true&order=sort_order.asc";
    return req(q, { headers: headers() });
  }

  async function getProduct(slug) {
    if (!configured) return null;
    const q =
      `/rest/v1/product?select=id,slug,title,label,summary,kind,presentation,edition,` +
      `artwork:artwork_id(slug,title,image_path,detail_path),` +
      `variants:variant(id,size_label,price_cents,currency,sort_order)` +
      `&slug=eq.${encodeURIComponent(slug)}&is_published=eq.true&limit=1`;
    const rows = await req(q, { headers: headers() });
    return rows && rows[0] ? rows[0] : null;
  }

  /* ── guest checkout ────────────────────────────────────── */
  async function createOrder({ email, name, items }) {
    if (!configured) throw new Error("Supabase is not configured");
    if (!Array.isArray(items) || items.length === 0) throw new Error("No items");

    const total = items.reduce((sum, i) => sum + i.unit_cents * i.qty, 0);

    const [order] = await req("/rest/v1/order?select=id,reference", {
      method: "POST",
      headers: headers({ Prefer: "return=representation" }),
      body: JSON.stringify([{ email, name, total_cents: total }]),
    });

    await req("/rest/v1/order_item", {
      method: "POST",
      headers: headers({ Prefer: "return=minimal" }),
      body: JSON.stringify(
        items.map((i) => ({
          order_id: order.id,
          variant_id: i.variant_id,
          qty: i.qty,
          unit_cents: i.unit_cents,
          snapshot: i.snapshot || {},
        }))
      ),
    });

    return order;
  }

  /* ── accounts ──────────────────────────────────────────── */
  // Registration with email + password. Email confirmation and phone
  // OTP are disabled in the Supabase dashboard, so this returns a live
  // session immediately. `phone` is stored unverified — see
  // supabase/auth-chat.sql "KNOWN LIMITATION".
  async function signUp({ email, password, phone, displayName }) {
    if (!configured) throw new Error("Supabase is not configured");
    const s = await req("/auth/v1/signup", {
      method: "POST",
      headers: { apikey: key, "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        password,
        data: { phone: phone || null, display_name: displayName || null },
      }),
    });
    // No session means confirmation is still switched on server-side.
    if (!s || !s.access_token) {
      throw new Error(
        "Account created, but no session was returned — email confirmation is still enabled in Supabase."
      );
    }
    return storeAuth(s, email);
  }

  async function signIn(email, password) {
    if (!configured) throw new Error("Supabase is not configured");
    const s = await req("/auth/v1/token?grant_type=password", {
      method: "POST",
      headers: { apikey: key, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    return storeAuth(s, email);
  }

  function signOut() {
    setSession(null);
  }

  async function getProfile() {
    if (!configured) return null;
    const s = session();
    if (!s || !s.user_id) return null;
    const rows = await req(
      `/rest/v1/profile?select=id,email,phone,display_name,role&id=eq.${s.user_id}&limit=1`,
      { headers: headers() }
    );
    return rows && rows[0] ? rows[0] : null;
  }

  /* ── read markers ──────────────────────────────────────────
     "Unread" is derived, not stored: we remember the timestamp of the
     last message each user has already seen, per thread, in
     localStorage. A message is unread when its created_at is newer
     than that mark. Nothing here is authoritative — a second device
     starts with its own marks — so it is kept out of the database. */
  const SEEN_KEY = "muhsi.seen";
  const SEEN_CAP = 200; // keep the marks touched most recently

  function seenMap() {
    try {
      const raw = JSON.parse(localStorage.getItem(SEEN_KEY) || "{}");
      const out = {};
      for (const [id, record] of Object.entries(raw)) {
        if (record && record.at) out[id] = record;
      }
      return out;
    } catch {
      return {};
    }
  }

  /* Pruned by least-recently-touched rather than by age. Age-based
     expiry looked tidy but made old, long-since-read threads show up
     as awaiting reply again, which is worse than a bounded cache. */
  function markSeen(threadId, iso) {
    if (!threadId || !iso) return;
    try {
      const map = seenMap();
      const now = new Date().toISOString();
      map[threadId] = { at: iso, touched: now };
      const ids = Object.keys(map);
      if (ids.length > SEEN_CAP) {
        ids
          .sort((a, b) => Date.parse(map[b].touched || 0) - Date.parse(map[a].touched || 0))
          .slice(SEEN_CAP)
          .forEach((id) => delete map[id]);
      }
      localStorage.setItem(SEEN_KEY, JSON.stringify(map));
    } catch {
      /* storage disabled (private mode) — unread badges simply stay off */
    }
  }

  function isUnread(threadId, iso) {
    if (!threadId || !iso) return false;
    const record = seenMap()[threadId];
    return !record || Date.parse(iso) > Date.parse(record.at);
  }

  /* ── chat ──────────────────────────────────────────────── */
  async function getMyThread() {
    if (!configured) return null;
    const s = session();
    if (!s || !s.user_id) return null;
    const rows = await req(
      `/rest/v1/thread?select=id,last_message_at&user_id=eq.${s.user_id}&limit=1`,
      { headers: headers() }
    );
    return rows && rows[0] ? rows[0] : null;
  }

  async function listMessages(threadId) {
    if (!configured) return [];
    return req(
      `/rest/v1/message?select=id,sender_id,body,created_at&thread_id=eq.${threadId}&order=created_at.asc&limit=200`,
      { headers: headers() }
    );
  }

  async function sendMessage(threadId, body) {
    if (!configured) throw new Error("Supabase is not configured");
    const s = session();
    if (!s || !s.user_id) throw new Error("Not signed in");
    const [row] = await req("/rest/v1/message?select=id,sender_id,body,created_at", {
      method: "POST",
      headers: headers({ Prefer: "return=representation" }),
      body: JSON.stringify([{ thread_id: threadId, sender_id: s.user_id, body }]),
    });
    return row;
  }

  /* ── admin: orders + chat inbox ────────────────────────── */
  async function listOrders() {
    if (!configured) throw new Error("Supabase is not configured");
    if (!session()) throw new Error("Not signed in");
    const q =
      "/rest/v1/order?select=id,reference,email,name,status,total_cents,currency,created_at," +
      "items:order_item(qty,unit_cents,snapshot)&order=created_at.desc&limit=50";
    return req(q, { headers: headers() });
  }

  // Admin sees every thread (RLS allows it once role = 'admin').
  async function listThreads() {
    if (!configured) throw new Error("Supabase is not configured");
    const q =
      "/rest/v1/thread?select=id,last_message_at,user:user_id(id,email,phone,display_name)" +
      "&order=last_message_at.desc&limit=50";
    return req(q, { headers: headers() });
  }

  /* ── realtime (optional upgrade) ───────────────────────────
     Live inserts via Supabase Realtime over a raw WebSocket, so the
     site keeps its no-dependency guarantee. This only fires if the
     tables are published for realtime (see supabase/realtime.sql);
     otherwise the socket reports an error and callers fall back to
     their timer. onStatus gets one of "live" | "down" so the UI can
     say which mode it is in. */
  function channel() {
    if (!configured) return { close() {}, onStatus() {} };
    const statusListeners = new Set();
    const tableListeners = new Map(); // name -> Set<fn>
    let ws = null;
    let heartbeat = null;
    let ref = 0;
    let retry = 0;
    let lastError = null;

    const wsUrl =
      url.replace(/^http/, "ws") + `/realtime/v1/websocket?apikey=${encodeURIComponent(key)}&vsn=1.0.0`;

    function setStatus(mode) {
      statusListeners.forEach((fn) => fn(mode));
    }

    function send(topic, event, payload) {
      ref += 1;
      ws.send(JSON.stringify({ topic, event, payload, ref: String(ref) }));
    }

    function connect() {
      let socket;
      try {
        socket = new WebSocket(wsUrl);
      } catch {
        return; // no WebSocket — timers carry on
      }
      ws = socket;

      socket.onopen = () => {
        const token = (session() || {}).access_token || key;
        send("realtime:public", "phx_join", {
          config: {
            postgres_changes: [...tableListeners.keys()].map((table) => ({
              event: "INSERT",
              schema: "public",
              table,
            })),
          },
          access_token: token,
        });
      };

      socket.onmessage = (event) => {
        let msg;
        try {
          msg = JSON.parse(event.data);
        } catch {
          return;
        }
        const payload = msg.payload || {};
        const topic = msg.topic || "";

        if (msg.event === "phx_reply") {
          const ok = payload.status === "ok";
          const detail = JSON.stringify(payload.response || {});
          // A successful join can still carry a per-table subscription
          // error (e.g. table not in the realtime publication).
          if (ok && !/error/i.test(detail)) {
            retry = 0;
            setStatus("live");
          } else {
            lastError = (payload.response && payload.response.message) || "subscription rejected";
            setStatus("down");
            socket.close();
          }
          return;
        }
        if (msg.event === "system" && payload.status === "error") {
          lastError = payload.message || "realtime error";
          setStatus("down");
          return;
        }
        if (msg.event === "postgres_changes") {
          const table = (payload.table || topic.split(":").pop() || "").trim();
          const handlers = tableListeners.get(table);
          if (handlers) handlers.forEach((fn) => fn(payload.record || payload.new || {}));
        }
      };

      socket.onclose = () => {
        if (heartbeat) {
          clearInterval(heartbeat);
          heartbeat = null;
        }
        if (!tableListeners.size) return;
        retry += 1;
        setTimeout(connect, Math.min(1000 * 2 ** retry, 30000));
      };

      socket.onerror = () => {
        setStatus("down");
      };

      if (!heartbeat) {
        heartbeat = setInterval(() => {
          if (ws && ws.readyState === 1) send("phoenix", "heartbeat", {});
        }, 30000);
      }
    }

    return {
      subscribe(table, fn) {
        if (!tableListeners.has(table)) {
          tableListeners.set(table, new Set());
          if (ws && ws.readyState === 1) connect(); // rejoin with the new table
          else if (!ws) connect();
        }
        tableListeners.get(table).add(fn);
      },
      onStatus(fn) {
        statusListeners.add(fn);
      },
      status() {
        return lastError ? "down" : ws && ws.readyState === 1 ? "live" : "down";
      },
      close() {
        tableListeners.clear();
        if (heartbeat) clearInterval(heartbeat);
        if (ws) {
          ws.onclose = null;
          ws.close();
        }
      },
    };
  }

  window.MuhsiStore = {
    configured,
    listProducts,
    getProduct,
    createOrder,
    signUp,
    signIn,
    signOut,
    getProfile,
    session,
    getMyThread,
    listMessages,
    sendMessage,
    markSeen,
    isUnread,
    channel,
    listOrders,
    listThreads,
    onAuthChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
})();
