// ======================================================================
// ui.js — make the on-screen panels draggable and collapsible
// ----------------------------------------------------------------------
// Each persistent panel gets a small grip (drag to move) and a – button
// (minimize to just a label). Positions + collapsed state persist in
// localStorage, so your layout survives reloads.
// ======================================================================

(function () {
  const KEY = "aegean.ui.v1";
  const PANELS = {
    pantheon: "⚱ Polis",
    "minimap-wrap": "🗺 Map",
    oracle: "🏛 Oracle",
    market: "⚖ Agora",
  };
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(KEY) || "{}"); } catch (e) {}
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch (e) {} };

  function enhance(id, label) {
    const el = document.getElementById(id);
    if (!el) return;
    el.dataset.label = label;

    const ctrls = document.createElement("div");
    ctrls.className = "ui-ctrls";
    const grip = document.createElement("span"); grip.className = "ui-grip"; grip.textContent = "⠿"; grip.title = "Drag to move";
    const mini = document.createElement("span"); mini.className = "ui-mini"; mini.textContent = "–"; mini.title = "Minimize";
    ctrls.append(grip, mini);
    el.appendChild(ctrls);

    const st = saved[id] || {};
    if (st.left != null) { el.style.left = st.left + "px"; el.style.top = st.top + "px"; el.style.right = "auto"; el.style.bottom = "auto"; }
    if (st.collapsed) { el.classList.add("collapsed"); mini.textContent = "+"; }

    mini.addEventListener("click", (e) => {
      e.stopPropagation();
      const c = el.classList.toggle("collapsed");
      mini.textContent = c ? "+" : "–";
      (saved[id] = saved[id] || {}).collapsed = c; persist();
    });

    let dragging = false, ox = 0, oy = 0;
    grip.addEventListener("pointerdown", (e) => {
      dragging = true;
      const r = el.getBoundingClientRect();
      ox = e.clientX - r.left; oy = e.clientY - r.top;
      el.style.right = "auto"; el.style.bottom = "auto"; el.style.transform = "none";
      grip.setPointerCapture(e.pointerId); e.preventDefault();
    });
    grip.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      const left = Math.max(0, Math.min(window.innerWidth - 44, e.clientX - ox));
      const top = Math.max(0, Math.min(window.innerHeight - 24, e.clientY - oy));
      el.style.left = left + "px"; el.style.top = top + "px";
    });
    const end = (e) => {
      if (!dragging) return; dragging = false;
      const r = el.getBoundingClientRect();
      (saved[id] = saved[id] || {}).left = Math.round(r.left);
      saved[id].top = Math.round(r.top); persist();
    };
    grip.addEventListener("pointerup", end);
    grip.addEventListener("pointercancel", end);
  }

  function init() { for (const id in PANELS) enhance(id, PANELS[id]); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  // Exposed so a "Reset layout" control can clear it.
  window.resetUILayout = function () { localStorage.removeItem(KEY); location.reload(); };
})();
