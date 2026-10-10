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
      const message = (body && body.message) || res.statusText;
      throw Object.assign(new Error(message), { status: res.status, body });
    }
    return body;
  }

  /* ── catalogue ─────────────────────────────────────────── */
  async function listProducts() {
    if (!configured) return null;
    // Published products with their artwork and variants, in one call.
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
  // Creates an order + its items. Runs as the anonymous role, so it
  // relies on the insert-only RLS policies in supabase/schema.sql.
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

  /* ── auth (admin only) ─────────────────────────────────── */
  async function signIn(email, password) {
    if (!configured) throw new Error("Supabase is not configured");
    const s = await req("/auth/v1/token?grant_type=password", {
      method: "POST",
      headers: { apikey: key, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    setSession({
      access_token: s.access_token,
      refresh_token: s.refresh_token,
      expires_at: Date.now() + (s.expires_in || 3600) * 1000,
      email,
    });
    return session();
  }

  function signOut() {
    setSession(null);
  }

  async function listOrders() {
    if (!configured) throw new Error("Supabase is not configured");
    if (!session()) throw new Error("Not signed in");
    const q =
      "/rest/v1/order?select=id,reference,email,name,status,total_cents,currency,created_at," +
      "items:order_item(qty,unit_cents,snapshot)&order=created_at.desc&limit=50";
    return req(q, { headers: headers() });
  }

  window.MuhsiStore = {
    configured,
    listProducts,
    getProduct,
    createOrder,
    signIn,
    signOut,
    session,
    onAuthChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
})();
