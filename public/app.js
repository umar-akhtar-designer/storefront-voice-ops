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

  const speechSupported =
    typeof window.SpeechRecognition === "function" ||
    typeof window.webkitSpeechRecognition === "function";
  $("speech-support").textContent = speechSupported
    ? "Web Speech: available"
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

  function renderList(el, items, render, emptyText) {
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
      render(li, item);
      el.appendChild(li);
    }
  }

  function renderState(state) {
    providerEl.textContent = `provider: ${state.provider}`;
    renderList(
      $("low-stock"),
      state.lowStock.slice(0, 6),
      (li, p) => {
        li.innerHTML = `<span>${escapeHtml(p.name)}</span>`;
        const tag = document.createElement("span");
        tag.className = "tag";
        tag.textContent = `${p.stock} left (reorder ${p.reorderPoint})`;
        li.appendChild(tag);
        if (p.stock === 0) li.classList.add("warn");
      },
      "Nothing low on stock.",
    );

    renderList(
      $("awaiting"),
      state.awaitingConfirmation,
      (li, a) => {
        li.innerHTML = `<span>${escapeHtml(a.summary)}</span>`;
        const tag = document.createElement("span");
        tag.className = "tag";
        tag.textContent = a.requiresCode ? "needs code" : "needs yes";
        li.appendChild(tag);
        li.classList.add("warn");
      },
      "Nothing waiting for confirmation.",
    );

    $("pending-total").textContent = `${state.pendingOrders.total} orders waiting to ship.`;
    renderList(
      $("pending-orders"),
      state.pendingOrders.items.slice(0, 5),
      (li, o) => {
        li.innerHTML = `<span>#${escapeHtml(o.id)} — ${escapeHtml(o.customer)}</span>`;
        const tag = document.createElement("span");
        tag.className = "tag";
        tag.textContent = `${o.total.toLocaleString("en-US")} ${state.currency}`;
        li.appendChild(tag);
      },
      "No orders to ship.",
    );

    renderList(
      $("audit"),
      state.audit.slice(0, 6),
      (li, e) => {
        li.innerHTML = `<span>${escapeHtml(e.tool)}</span>`;
        const tag = document.createElement("span");
        tag.className = "tag";
        tag.textContent = e.status;
        li.appendChild(tag);
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
    inputEl.value = "";
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
      engineEl.textContent = `engine: ${data.engine}`;
      renderTrace(data.trace);
      speak(data.reply || "");
    } catch (error) {
      pending.remove();
      addMessage("assistant", "Sorry, I couldn't reach the server.");
      console.error(error);
    }
    void refreshState();
  }

  function escapeHtml(value) {
    return String(value).replace(
      /[&<>"']/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
    );
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
  setInterval(refreshState, 15000);
})();
