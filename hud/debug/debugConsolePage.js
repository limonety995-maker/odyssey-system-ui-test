// Odyssey Debug Console — popover iframe entry (TEMPORARY, isolated bundle).
//
// Loaded by debug-console.html, built as its own esbuild entry point
// (assets/debug-console.js) — completely separate from combat-hud-overlay.js.
// A `?variant=console|launcher` URL param (set by debugConsoleController.js)
// selects what to mount. This page never imports anything from hud/overlay/,
// hud/components/, or hud/scene/ — its only shared dependency is the
// debugLogStore's data SHAPE (delivered via its own broadcast channel), not
// the store module itself.

import OBR from "@owlbear-rodeo/sdk";
import debugConsoleStyles from "./debugConsole.css";
import { renderDebugConsolePanel, renderDebugLauncher } from "./DebugConsolePanel.js";
import { BC_DEBUG_CONSOLE_ENTRIES, BC_DEBUG_CONSOLE_REQUEST, BC_DEBUG_CONSOLE_COMMAND } from "./debugConsoleConstants.js";

function injectStyles() {
  if (document.getElementById("odc-styles")) return;
  const el = document.createElement("style");
  el.id = "odc-styles";
  el.textContent = debugConsoleStyles;
  document.head.appendChild(el);
}

function send(channel, data) {
  try { OBR.broadcast.sendMessage(channel, data, { destination: "LOCAL" }); } catch (_e) { /* ignore */ }
}

function getVariant() {
  try { return new URLSearchParams(window.location.search).get("variant") || "console"; } catch { return "console"; }
}

function start() {
  injectStyles();
  document.documentElement.style.background = "transparent";
  document.body.style.background = "transparent";
  document.body.style.margin = "0";

  const root = document.getElementById("root") || document.body;
  const available = !!(OBR && OBR.isAvailable);
  const variant = getVariant();

  if (variant === "launcher") {
    root.innerHTML = renderDebugLauncher();
    root.addEventListener("click", (e) => {
      if (e.target.closest('[data-odc-action="reopen"]') && available) {
        send(BC_DEBUG_CONSOLE_COMMAND, { type: "reopen" });
      }
    });
    return;
  }

  let entries = [];
  let filter = "ALL";
  let collapsed = false;

  function render() {
    root.innerHTML = renderDebugConsolePanel(entries, { filter, collapsed });
    const list = root.querySelector(".odc-list");
    if (list) list.scrollTop = 0; // newest-first ordering: keep the newest entry visible
  }

  root.addEventListener("click", (e) => {
    const filterBtn = e.target.closest("[data-odc-filter]");
    if (filterBtn) {
      filter = filterBtn.getAttribute("data-odc-filter") || "ALL";
      render();
      return;
    }
    const actionBtn = e.target.closest("[data-odc-action]");
    if (!actionBtn) return;
    const action = actionBtn.getAttribute("data-odc-action");
    if (action === "clear") {
      if (available) send(BC_DEBUG_CONSOLE_COMMAND, { type: "clear" });
    } else if (action === "close") {
      if (available) send(BC_DEBUG_CONSOLE_COMMAND, { type: "close" });
    } else if (action === "toggle-collapse") {
      collapsed = !collapsed;
      render();
    }
  });

  if (available) {
    try {
      OBR.broadcast.onMessage(BC_DEBUG_CONSOLE_ENTRIES, (event) => {
        entries = Array.isArray(event?.data?.entries) ? event.data.entries : [];
        render();
      });
      send(BC_DEBUG_CONSOLE_REQUEST, {});
    } catch (_e) { /* standalone */ }
  }
  render();
}

if (OBR && OBR.isAvailable) {
  OBR.onReady(start);
} else {
  start();
}
