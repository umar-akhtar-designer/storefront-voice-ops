/* Storefront Voice Ops — Alexa+ simulator (vanilla JS, no build step). */
(() => {
  const $ = (id) => document.getElementById(id);
  const messagesEl = $("messages");
  const inputEl = $("input");
  const formEl = $("composer");
  const micBtn = $("mic");
  const speakToggle = $("speak");
  const engineEl = $("engine");
  const providerEl = $("provider");
  const resetBtn = $("reset");

  let lastOrderQuery = null;

  const speechSupported =
    typeof window.SpeechRecognition === "function" ||
    typeof window.webkitSpeechRecognition === "function";
  $("speech-support").textContent = speechSupported
    ? "Web Speech: available — tap the mic and talk"
    : "Web Speech: not supported in this browser (type instead)";

  function addMessage(role, text, meta) {
    const el = document.createElement("div");
    el.className = `msg ${role}`;
    el.textContent = text;
    if (meta) {
      const m = document.createElement("span");
      m.className = "meta";
      m.textContent = meta;
      el.appendChild(m);
    }
    messagesEl.appendChild(el);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return el;
  }

  function speak(text) {
    if (!speakToggle.checked) return;
    if (typeof window.speechSynthesis !== "function") return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.02;
    u.pitch = 1;
    window.speechSynthesis.speak(u);
  }

  async function refreshState() {
    try {
      const res = await fetch("/api/state");
      if (!res.ok) return;
      renderState(await res.json());
    } catch {
      /* ignore transient errors */
    }
  }

  function escapeHtml(value) {
    return String(value).replace(
      /[&<>"']/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
    );
  }

  /** A small pill-style action inside a store row. */
  function chip(label, message, cls) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = `chip${cls ? ` ${cls}` : ""}`;
    b.textContent = label;
    b.title = `Says: ${message}`;
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      void send(message);
    });
    return b;
  }

  /** Make a whole row speak a phrase when clicked (keyboard accessible). */
  function makeClickable(li, message) {
    li.classList.add("clickable");
    li.tabIndex = 0;
    li.title = `Says: ${message}`;
    li.addEventListener("click", () => void send(message));
    li.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        void send(message);
      }
    });
  }

  function tag(text, cls) {
    const t = document.createElement("span");
    t.className = `tag${cls ? ` ${cls}` : ""}`;
    t.textContent = text;
    return t;
  }

  function renderList(el, items, buildRow, emptyText) {
    el.innerHTML = "";
    if (!items || items.length === 0) {
      const li = document.createElement("li");
      li.className = "empty";
      li.textContent = emptyText;
      el.appendChild(li);
      return;
    }
    for (const item of items) {
      const li = document.createElement("li");
      buildRow(li, item);
      el.appendChild(li);
    }
  }

  function renderState(state) {
    if (state.currency) window.__currency = state.currency;
    providerEl.innerHTML = `<i class="dot mint"></i>provider: ${escapeHtml(state.provider)}`;

    /* ---- Low stock: whole row taps into a supplier restock draft ---- */
    renderList(
      $("low-stock"),
      state.lowStock.slice(0, 6),
      (li, p) => {
        li.innerHTML = `<span class="row-main"><span class="row-title">${escapeHtml(p.name)}</span></span>`;
        li.appendChild(tag(`${p.stock} left`, p.stock <= 2 ? "warn" : ""));
        const chips = document.createElement("span");
        chips.className = "chips";
        chips.appendChild(chip("Restock", `Restock ${p.sku}`));
        li.appendChild(chips);
        if (p.stock <= 2) makeClickable(li, `Restock ${p.sku}`);
      },
      "Nothing low on stock.",
    );

    /* ---- Awaiting confirmation: Yes / No speak for you ---- */
    renderList(
      $("awaiting"),
      state.awaitingConfirmation,
      (li, a) => {
        li.innerHTML = `<span class="row-main"><span class="row-title">${escapeHtml(a.summary)}</span></span>`;
        li.appendChild(
          tag(a.requiresCode ? "needs code" : "needs yes", a.requiresCode ? "lock" : "warn"),
        );
        const chips = document.createElement("span");
        chips.className = "chips";
        chips.appendChild(chip("Yes", "yes", "yes"));
        chips.appendChild(chip("No", "no", "no"));
        li.appendChild(chips);
        makeClickable(li, "yes");
      },
      "Nothing waiting for confirmation.",
    );

    /* ---- Orders to ship: Ship / Details per order ---- */
    $("pending-total").textContent = `${state.pendingOrders.total} orders waiting to ship.`;
    lastOrderQuery = `${state.pendingOrders.total} orders`;
    renderList(
      $("pending-orders"),
      state.pendingOrders.items.slice(0, 5),
      (li, o) => {
        const money = `${(o.total ?? 0).toLocaleString("en-US")} ${state.currency}`;
        li.innerHTML = `<span class="row-main"><span class="row-title">#${escapeHtml(o.id)} — ${escapeHtml(o.customer)}</span><span class="row-sub">${escapeHtml(money)}</span></span>`;
        const chips = document.createElement("span");
        chips.className = "chips";
        chips.appendChild(chip("Ship", `Ship order ${o.id} with TCS`));
        chips.appendChild(chip("Details", `Tell me about order ${o.id}`));
        li.appendChild(chips);
        makeClickable(li, `Ship order ${o.id} with TCS`);
      },
      "No orders to ship.",
    );

    /* ---- Audit: status dots + timestamp ---- */
    renderList(
      $("audit"),
      state.audit.slice(0, 6),
      (li, e) => {
        const when = new Date(e.ts * 1000 || e.ts).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        });
        const ok = /ok|success|confirm/i.test(e.status);
        li.innerHTML = `<span class="row-main"><span class="row-title">${escapeHtml(e.tool)}</span><span class="row-sub">${escapeHtml(e.actor ?? "")} · ${escapeHtml(when)}</span></span>`;
        li.appendChild(tag(e.status, ok ? "ok" : "bad"));
      },
      "No audited actions yet.",
    );
  }

  function renderTrace(trace) {
    const el = $("trace");
    el.innerHTML = "";
    if (!trace || trace.length === 0) {
      const li = document.createElement("li");
      li.className = "empty";
      li.textContent = "No tool calls yet.";
      el.appendChild(li);
      return;
    }
    for (const step of trace) {
      const li = document.createElement("li");
      const name = document.createElement("code");
      name.textContent = step.tool;
      li.appendChild(name);
      const args = document.createElement("span");
      args.className = "args";
      args.textContent = `args: ${JSON.stringify(step.args)}`;
      li.appendChild(args);
      const result = document.createElement("span");
      result.className = "result";
      result.textContent = step.result;
      li.appendChild(result);
      el.appendChild(li);
    }
  }

  async function send(message) {
    const text = message.trim();
    if (!text) return;
    addMessage("user", text);
    if (inputEl) inputEl.value = "";
    const pending = addMessage("assistant", "…");
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      const data = await res.json();
      pending.remove();
      addMessage("assistant", data.reply || "(no reply)", `engine: ${data.engine}`);
      engineEl.innerHTML = `<i class="dot indigo"></i>engine: ${escapeHtml(data.engine ?? "?")}`;
      renderTrace(data.trace);
      speak(data.reply || "");
    } catch (error) {
      pending.remove();
      addMessage("assistant", "Sorry, I couldn't reach the server.");
      console.error(error);
    }
    void refreshState();
  }

  formEl.addEventListener("submit", (e) => {
    e.preventDefault();
    void send(inputEl.value);
  });

  document.querySelectorAll(".examples button").forEach((btn) => {
    btn.addEventListener("click", () => void send(btn.dataset.say));
  });

  // --- Web Speech: microphone ---
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SpeechRecognition) {
    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    let listening = false;

    recognition.addEventListener("result", (event) => {
      const transcript = event.results[0][0].transcript;
      void send(transcript);
    });
    recognition.addEventListener("end", () => {
      listening = false;
      micBtn.classList.remove("recording");
    });
    recognition.addEventListener("error", () => {
      listening = false;
      micBtn.classList.remove("recording");
    });

    micBtn.addEventListener("click", () => {
      if (listening) {
        recognition.stop();
        return;
      }
      listening = true;
      micBtn.classList.add("recording");
      recognition.start();
    });
  } else {
    micBtn.disabled = true;
    micBtn.title = "Web Speech recognition is not available in this browser.";
  }

  // --- Demo reset (shown only when the server has DEMO_MODE on) ---
  async function detectDemoMode() {
    try {
      const res = await fetch("/api/demo");
      if (res.ok) resetBtn.hidden = false;
    } catch {
      /* not in demo mode */
    }
  }
  resetBtn.addEventListener("click", async () => {
    resetBtn.disabled = true;
    try {
      await fetch("/api/demo/reset", { method: "POST" });
      addMessage("assistant", "Demo store reset to its starting state.");
      await refreshState();
    } finally {
      resetBtn.disabled = false;
    }
  });

  // --- Boot ---
  addMessage(
    "assistant",
    "Hi! Ask me about today's sales, what's running low, or tell me to ship an order.",
    "engine: ready",
  );
  void detectDemoMode();
  void refreshState();
  void refreshProfiles();
  setInterval(refreshState, 15000);

  /* ======================= Multi-store profiles ======================= */
  const profileSelect = document.getElementById("profile-select");
  const addStoreBtn = document.getElementById("add-store");
  const addStoreDialog = document.getElementById("add-store-dialog");
  const addStoreForm = document.getElementById("add-store-form");
  const manualEntry = document.getElementById("manual-entry");

  /** Cross-browser styled toast (no alert popups), auto-dismisses after 4s. */
  function toast(message, kind) {
    let stack = document.getElementById("toast-stack");
    if (!stack) {
      stack = document.createElement("div");
      stack.id = "toast-stack";
      document.body.appendChild(stack);
    }
    const el = document.createElement("div");
    el.className = `toast toast-${kind || "info"}`;
    el.setAttribute("role", "status");
    const icon = document.createElement("span");
    icon.className = "toast-icon";
    icon.textContent = kind === "success" ? "✓" : kind === "error" ? "!" : "i";
    const text = document.createElement("span");
    text.textContent = message;
    el.append(icon, text);
    const dismiss = () => {
      el.classList.add("toast-out");
      setTimeout(() => el.remove(), 220);
    };
    el.addEventListener("click", dismiss);
    stack.appendChild(el);
    setTimeout(dismiss, 4000);
  }

  async function refreshProfiles() {
    try {
      const res = await fetch("/api/profiles");
      if (!res.ok) return;
      const data = await res.json();
      profileSelect.innerHTML = "";
      for (const p of data.profiles) {
        const opt = document.createElement("option");
        opt.value = String(p.id);
        opt.textContent = `${p.name}${p.active ? " ✓" : ""}`;
        opt.dataset.provider = p.provider;
        if (p.active) {
          opt.selected = true;
          manualEntry.hidden = p.provider !== "manual";
        }
        profileSelect.appendChild(opt);
      }
    } catch {
      /* the selector simply stays on its placeholder */
    }
  }

  profileSelect.addEventListener("change", async () => {
    const id = Number(profileSelect.value);
    if (!Number.isInteger(id)) return;
    try {
      const res = await fetch("/api/profiles/activate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        toast(data.error || "Could not switch store.", "error");
        return;
      }
      profileSelect.innerHTML = "";
      await Promise.all([refreshProfiles(), refreshState()]);
    } catch {
      toast("Network error while switching store.", "error");
    }
  });

  addStoreBtn.addEventListener("click", () => {
    addStoreDialog.hidden = false;
  });
  document.getElementById("add-store-cancel").addEventListener("click", () => {
    addStoreDialog.hidden = true;
  });
  // clicking the dark area outside the card also closes it
  addStoreDialog.addEventListener("click", (e) => {
    if (e.target === addStoreDialog) addStoreDialog.hidden = true;
  });
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !addStoreDialog.hidden) addStoreDialog.hidden = true;
  });

  /** A styled replacement for the browser's plain confirm() popup. */
  function confirmBox(title, message, approveLabel) {
    const dialog = document.getElementById("confirm-dialog");
    document.getElementById("confirm-title").textContent = title;
    document.getElementById("confirm-message").textContent = message;
    document.getElementById("confirm-approve").textContent = approveLabel;
    dialog.hidden = false;
    return new Promise((resolve) => {
      const done = (yes) => {
        dialog.hidden = true;
        cleanup();
        resolve(yes);
      };
      const cancelBtn = document.getElementById("confirm-cancel");
      const approveBtn = document.getElementById("confirm-approve");
      const onBackdrop = (e) => {
        if (e.target === dialog) done(false);
      };
      const onKey = (e) => {
        if (e.key === "Escape" && !dialog.hidden) done(false);
      };
      function cleanup() {
        cancelBtn.removeEventListener("click", onCancel);
        approveBtn.removeEventListener("click", onApprove);
        dialog.removeEventListener("click", onBackdrop);
        window.removeEventListener("keydown", onKey);
      }
      const onCancel = () => done(false);
      const onApprove = () => done(true);
      cancelBtn.addEventListener("click", onCancel);
      approveBtn.addEventListener("click", onApprove);
      dialog.addEventListener("click", onBackdrop);
      window.addEventListener("keydown", onKey);
    });
  }

  document.getElementById("remove-store").addEventListener("click", async () => {
    const id = Number(profileSelect.value);
    const name =
      profileSelect.selectedOptions[0]?.textContent.replace(" ✓", "").trim() ?? "this store";
    if (!Number.isInteger(id)) return;
    const sure = await confirmBox(
      `Delete “${name}”?`,
      "Its connection details are removed from this app. Your orders and products on the real store are never touched.",
      "Delete store",
    );
    if (!sure) return;
    try {
      const res = await fetch(`/api/profiles/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        toast(data.error || "Could not delete the store.", "error");
        return;
      }
      toast(`Deleted “${name}”.`, "success");
      profileSelect.innerHTML = "";
      await Promise.all([refreshProfiles(), refreshState()]);
    } catch {
      toast("Network error while deleting the store.", "error");
    }
  });

  const providerFields = {
    woocommerce: ["s-baseurl", "s-key", "s-secret"],
    custom: ["s-baseurl", "s-key"],
    shopify: ["s-domain", "s-token"],
    manual: [],
    mock: [],
  };
  document.getElementById("s-provider").addEventListener("change", (e) => {
    const fields = providerFields[e.target.value] ?? [];
    for (const id of ["s-baseurl", "s-key", "s-secret", "s-domain", "s-token"]) {
      document.getElementById(id).hidden = !fields.includes(id);
    }
  });

  addStoreForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const provider = document.getElementById("s-provider").value;
    const settings = {
      baseUrl: document.getElementById("s-baseurl").value.trim() || undefined,
      key: document.getElementById("s-key").value.trim() || undefined,
      secret: document.getElementById("s-secret").value.trim() || undefined,
      domain: document.getElementById("s-domain").value.trim() || undefined,
      token: document.getElementById("s-token").value.trim() || undefined,
      currency: document.getElementById("s-currency").value.trim().toUpperCase() || undefined,
    };
    try {
      const res = await fetch("/api/profiles", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: document.getElementById("s-name").value.trim(),
          provider,
          settings,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        toast(data.error || "Could not save the store.", "error");
        return;
      }
      addStoreDialog.hidden = true;
      addStoreForm.reset();
      const suffix = data.reachable
        ? ""
        : " (saved, but the store did not answer — check the credentials/local server)";
      addMessage("assistant", `Connected “${data.profile.name}”.${suffix}`);
      speak(`Connected ${data.profile.name}`);
      let activated = false;
      try {
        const actRes = await fetch("/api/profiles/activate", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ id: data.profile.id }),
        });
        activated = actRes.ok;
      } catch {
        activated = false;
      }
      profileSelect.innerHTML = "";
      await Promise.all([refreshProfiles(), refreshState()]);
      if (!activated)
        toast(`Saved. Tap the store picker to switch to ${data.profile.name}.`, "success");
    } catch {
      toast("Network error while saving the store.", "error");
    }
  });

  /* ================= Manual seller entry (no-website stores) ================= */
  document.getElementById("manual-product-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const res = await fetch("/api/manual/products", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sku: document.getElementById("m-sku").value.trim(),
          name: document.getElementById("m-name").value.trim(),
          stock: Number(document.getElementById("m-stock").value || 0),
          price: Number(document.getElementById("m-price").value || 0),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        toast(data.error || "Could not save the product.", "error");
        return;
      }
      addMessage(
        "assistant",
        `Saved product ${data.product.sku} — ${data.product.stock} in stock.`,
      );
      speak(`Saved ${data.product.name}`);
      e.target.reset();
      void refreshState();
    } catch {
      toast("Network error while saving the product.", "error");
    }
  });

  document.getElementById("manual-order-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const res = await fetch("/api/manual/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          customerName: document.getElementById("o-customer").value.trim(),
          customerPhone: document.getElementById("o-phone").value.trim() || undefined,
          items: [
            {
              sku: document.getElementById("o-item-sku").value.trim(),
              quantity: Number(document.getElementById("o-qty").value || 1),
              ...(document.getElementById("o-price").value
                ? { unitPrice: Number(document.getElementById("o-price").value) }
                : {}),
            },
          ],
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        toast(data.error || "Could not record the order.", "error");
        return;
      }
      addMessage(
        "assistant",
        `Recorded order ${data.order.id} for ${data.order.customerName} — ${data.order.total.currency} ${data.order.total.amount}. It shows under “Orders to ship”.`,
      );
      speak(`Order for ${data.order.customerName} recorded`);
      e.target.reset();
      void refreshState();
    } catch {
      toast("Network error while recording the order.", "error");
    }
  });
})();
