/* ============================================================
   Muhsingraphy — page hydration
   ------------------------------------------------------------
   When Supabase is configured (see supabase-config.js), replace
   the built-in static content with live catalogue data. When it
   is not configured, this file does nothing and the pages render
   exactly as they do today.
   ============================================================ */
(function () {
  const store = window.MuhsiStore;
  if (!store || !store.configured) return;

  const money = (cents, currency = "USD") =>
    new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(cents / 100);

  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const priceLabel = (p) => {
    const prices = (p.variants || []).map((v) => v.price_cents).sort((a, b) => a - b);
    if (!prices.length) return "";
    return p.kind === "print" ? `From ${money(prices[0])}` : money(prices[0]);
  };

  const page = location.pathname.split("/").pop() || "index.html";

  /* ── shop: render live catalogue ───────────────────────── */
  async function hydrateShop() {
    const grid = document.getElementById("grid");
    if (!grid) return;
    let products;
    try {
      products = await store.listProducts();
    } catch (e) {
      console.warn("[muhsi] catalogue unavailable, keeping static content:", e.message);
      return;
    }
    if (!products || !products.length) return;

    grid.innerHTML = products
      .map(
        (p) => `
      <article class="card reveal" data-kind="${esc(p.kind)}">
        <div class="card__frame ${p.kind === "print" ? "offering__frame--b" : "offering__frame--a"}">
          <img src="${esc((p.artwork && p.artwork.image_path) || "assets/artwork.jpg")}" alt="${esc(p.title)}" />
        </div>
        <div class="card__meta">
          <div>
            <span class="label">${esc(p.label || "")}</span>
            <h3 class="display h4">${esc(p.title)}</h3>
          </div>
          <span class="price">${esc(priceLabel(p))}</span>
        </div>
        <p class="lead card__desc">${esc(p.summary || "")}</p>
        <a class="link" href="${esc(p.slug)}.html">Explore ${esc(p.kind === "print" ? "the print" : "the original")} ↗</a>
      </article>`
      )
      .join("");

    const count = document.getElementById("offering-count");
    if (count) count.textContent = `${products.length} offering${products.length === 1 ? "" : "s"}`;
  }

  /* ── product pages: hydrate + guest checkout ───────────── */
  async function hydrateProduct() {
    const info = document.querySelector(".pdp__info");
    if (!info) return;
    const slug = page.replace(/\.html$/, "");

    let p;
    try {
      p = await store.getProduct(slug);
    } catch (e) {
      console.warn("[muhsi] product unavailable, keeping static content:", e.message);
      return;
    }
    if (!p) return;

    info.querySelector(".label").textContent = `${p.label || ""} / Muhsingraphy`;
    info.querySelector(".pdp__title").textContent = p.title;
    info.querySelector(".pdp__desc").textContent = p.summary || "";

    const priceEl = info.querySelector("[data-price]");
    if (priceEl) priceEl.textContent = priceLabel(p);

    // rebuild size options from variants
    const sizeGroup = info.querySelector('input[name="size"]')?.closest(".opt-group");
    const variants = (p.variants || []).sort((a, b) => a.sort_order - b.sort_order);
    if (sizeGroup && variants.length) {
      const prefix = p.kind === "print" ? "size" : "dims";
      sizeGroup.querySelector(".label").textContent = p.kind === "print" ? "Choose a size · proposed" : "Dimensions · proposed";
      sizeGroup.querySelectorAll(".opt").forEach((n) => n.remove());
      sizeGroup.insertAdjacentHTML(
        "beforeend",
        variants
          .map(
            (v, i) => `
        <label class="opt">
          <input type="radio" name="${prefix}" value="${esc(v.size_label)}"
                 data-size-price="${v.price_cents}" ${i === 0 ? "checked" : ""} />
          <span>${esc(v.size_label)}${p.kind === "print" ? ` · ${money(v.price_cents)}` : ""}</span>
        </label>`
          )
          .join("")
      );
    }

    // wire guest checkout
    const addBtn = info.querySelector("[data-add-to-cart]");
    if (addBtn) {
      addBtn.addEventListener("click", () =>
        openCheckout(p, variants, info.querySelector('input[name="size"], input[name="dims"]'))
      );
    }
  }

  function openCheckout(product, variants, sizeInput) {
    if (document.getElementById("muhsi-checkout")) return;
    const chosen = sizeInput && sizeInput.checked ? sizeInput : null;
    const variant = variants.find((v) => chosen && v.size_label === chosen.value) || variants[0];
    const qty = parseInt(document.querySelector("[data-qty-value]")?.textContent || "1", 10);

    const dialog = document.createElement("div");
    dialog.id = "muhsi-checkout";
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.style.cssText =
      "position:fixed;inset:0;background:rgba(15,20,20,.55);display:grid;place-items:center;z-index:50;padding:1.5rem";
    dialog.innerHTML = `
      <form style="background:var(--paper,#fdfcf8);max-width:440px;width:100%;padding:2rem">
        <h3 class="display h4" style="margin-bottom:.4rem">Complete your order</h3>
        <p class="meta" style="margin-bottom:1.4rem">${esc(product.title)}${variant ? ` · ${esc(variant.size_label)}` : ""} · qty ${qty} · <strong>${money((variant ? variant.price_cents : 0) * qty)}</strong></p>
        <label class="label" for="muhsi-email">Email</label>
        <input id="muhsi-email" type="email" required autocomplete="email"
               style="width:100%;margin:.4rem 0 1rem;padding:.7rem;border:1px solid var(--rule,#d5d8ce);background:#fff" />
        <label class="label" for="muhsi-name">Name</label>
        <input id="muhsi-name" type="text" autocomplete="name"
               style="width:100%;margin:.4rem 0 1.4rem;padding:.7rem;border:1px solid var(--rule,#d5d8ce);background:#fff" />
        <p class="note" style="margin-bottom:1rem">Delivery costs, timing and returns terms are confirmed with the artist before purchase. This is a preview checkout.</p>
        <button class="btn btn--solid btn--block" type="submit">Place order</button>
        <button type="button" class="btn btn--outline btn--block" data-close style="margin-top:.6rem">Cancel</button>
      </form>`;
    document.body.appendChild(dialog);

    dialog.querySelector("[data-close]").addEventListener("click", () => dialog.remove());
    dialog.addEventListener("click", (e) => e.target === dialog && dialog.remove());

    dialog.querySelector("form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = e.target.querySelector('button[type="submit"]');
      btn.disabled = true;
      btn.textContent = "Placing order…";
      try {
        const order = await store.createOrder({
          email: dialog.querySelector("#muhsi-email").value.trim(),
          name: dialog.querySelector("#muhsi-name").value.trim(),
          items: [
            {
              variant_id: variant ? variant.id : null,
              qty,
              unit_cents: variant ? variant.price_cents : 0,
              snapshot: { title: product.title, size: variant ? variant.size_label : null },
            },
          ],
        });
        dialog.querySelector("form").innerHTML =
          `<h3 class="display h4" style="margin-bottom:.6rem">Thank you.</h3>
           <p class="meta">Order <strong>${esc(order.reference)}</strong> received. The artist will confirm materials, delivery and payment details by email.</p>
           <button type="button" class="btn btn--solid btn--block" data-close style="margin-top:1.4rem">Close</button>`;
        dialog.querySelector("[data-close]").addEventListener("click", () => dialog.remove());
      } catch (err) {
        btn.disabled = false;
        btn.textContent = "Place order";
        alert("Could not place the order: " + err.message);
      }
    });
  }

  /* ── admin: login + live orders ────────────────────────── */
  async function hydrateAdmin() {
    const main = document.querySelector(".admin__main");
    if (!main) return;

    if (!store.session()) {
      renderAdminLogin(main);
      return;
    }
    await renderOrders(main);
  }

  function renderAdminLogin(main) {
    const existing = document.querySelector(".admin__top");
    const host = document.createElement("div");
    host.style.cssText = "position:fixed;inset:0;background:var(--paper,#fdfcf8);display:grid;place-items:center;z-index:60";
    host.innerHTML = `
      <form style="max-width:360px;width:100%;padding:2rem;border:1px solid var(--rule,#d5d8ce)">
        <h1 class="display h4" style="margin-bottom:.4rem">Studio admin</h1>
        <p class="meta" style="margin-bottom:1.4rem">Sign in to manage orders.</p>
        <label class="label" for="admin-email">Email</label>
        <input id="admin-email" type="email" required style="width:100%;margin:.4rem 0 1rem;padding:.7rem;border:1px solid var(--rule,#d5d8ce)" />
        <label class="label" for="admin-pass">Password</label>
        <input id="admin-pass" type="password" required style="width:100%;margin:.4rem 0 1.4rem;padding:.7rem;border:1px solid var(--rule,#d5d8ce)" />
        <button class="btn btn--solid btn--block" type="submit">Sign in</button>
        <p class="note" data-err style="color:#896131;margin-top:.8rem"></p>
      </form>`;
    document.body.appendChild(host);
    host.querySelector("form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const err = host.querySelector("[data-err]");
      err.textContent = "";
      try {
        await store.signIn(host.querySelector("#admin-email").value.trim(), host.querySelector("#admin-pass").value);
        host.remove();
        if (existing) existing.style.display = "";
        await renderOrders(main);
      } catch (ex) {
        err.textContent = ex.message || "Sign-in failed";
      }
    });
  }

  async function renderOrders(main) {
    let orders;
    try {
      orders = await store.listOrders();
    } catch (e) {
      console.warn("[muhsi] orders unavailable:", e.message);
      return;
    }
    const tbody = document.querySelector(".orders tbody");
    if (!tbody || !orders) return;
    if (!orders.length) {
      tbody.innerHTML = `<tr><td colspan="5" class="meta">No orders yet.</td></tr>`;
      return;
    }
    tbody.innerHTML = orders
      .map(
        (o) => `
      <tr>
        <td>${esc(o.reference)}<span class="sub">${new Date(o.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span></td>
        <td>${esc(o.name || "—")}<span class="sub">${esc(o.email)}</span></td>
        <td>${(o.items || []).map((i) => esc(`${i.snapshot?.title || ""} · ${i.snapshot?.size || ""} × ${i.qty}`)).join("<br>")}</td>
        <td class="total">${money(o.total_cents, o.currency)}</td>
        <td><span class="badge">${esc(o.status.replace(/_/g, " "))}</span></td>
      </tr>`
      )
      .join("");
    const stat = document.querySelectorAll(".stat .v");
    if (stat[1]) stat[1].textContent = String(orders.length);
  }

  /* ── boot ──────────────────────────────────────────────── */
  const boot = () => {
    if (page === "shop.html") hydrateShop();
    else if (page === "original-calligraphy.html" || page === "fine-art-print.html") hydrateProduct();
    else if (page === "admin.html") hydrateAdmin();
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
