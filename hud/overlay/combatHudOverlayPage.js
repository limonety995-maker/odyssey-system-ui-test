// Combat HUD overlay — popover iframe entry (Phase 1A · 2 · 2.1 · 2.2).
//
// The SAME page is loaded into every HUD popover. A `?module=` URL param
// (seeded by the background controller) selects what to mount:
//   module=player|gun|skills|target|modifiers|action|log → one module block
//   module=editor                                          → Arrange-HUD editor
//   module=pill                                            → collapsed pill
//   (absent)                                               → editor (standalone preview)
//
// Each module iframe is tight to its module rect, so the map stays clickable
// between modules. Layout is read/written to localStorage here (browser-local),
// and changes are broadcast (LOCAL) to the background controller which owns the
// real popover lifecycle. Standalone (no OBR) still renders for local preview.

import OBR from "@owlbear-rodeo/sdk";
import tokenStyles from "../styles/combatHudTokens.css";
import overlayStyles from "./combatHudOverlay.css";
import layoutStyles from "../components/combatHudLayout.css";
import moduleStyles from "../components/combatHudModule.css";

import { mountCombatHudModule } from "../components/CombatHudModule.js";
import { mountCombatHudLayoutEditor } from "../components/CombatHudLayoutEditor.js";
import { BC_HUD_UI_STATE, BC_HUD_SELECTION, BC_HUD_SELECTION_REQUEST, parseHudUiState } from "./overlayConstants.js";
import {
  HUD_MODULE_IDS,
  BC_HUD_LAYOUT,
  BC_HUD_EDITOR,
  readStoredLayout,
  writeStoredLayout,
} from "./hudLayout.js";
import { ICON_MARK } from "../components/hudIcons.js";

function injectStyles() {
  for (const [id, css] of [
    ["ohud-tokens", tokenStyles],
    ["ohud-overlay-styles", overlayStyles],
    ["ohud-layout-styles", layoutStyles],
    ["ohud-module-styles", moduleStyles],
  ]) {
    if (document.getElementById(id)) continue;
    const el = document.createElement("style");
    el.id = id;
    el.textContent = css;
    document.head.appendChild(el);
  }
}

function send(channel, data) {
  try { OBR.broadcast.sendMessage(channel, data, { destination: "LOCAL" }); } catch (_e) { /* ignore */ }
}

function getModuleParam() {
  try { return new URLSearchParams(window.location.search).get("module") || ""; } catch { return ""; }
}

function renderPill(root, available) {
  const host = document.createElement("div");
  host.className = "odyssey-hud ohud-overlay is-collapsed";
  host.innerHTML = `<button class="ohud-pill" data-ohud="reopen" title="Open Odyssey Combat HUD" aria-label="Open Odyssey Combat HUD">
      <span class="ohud-mark" aria-hidden="true">${ICON_MARK}</span>
      <span class="ohud-pill-label">ODYSSEY</span>
    </button>`;
  root.appendChild(host);
  host.addEventListener("click", (e) => {
    if (e.target.closest('[data-ohud="reopen"]')) {
      if (available) send(BC_HUD_UI_STATE, { isHudCollapsed: false });
    }
  });
}

function start() {
  injectStyles();
  document.documentElement.style.background = "transparent";
  document.body.style.background = "transparent";
  document.body.style.margin = "0";

  const root = document.getElementById("root") || document.body;
  // Single shared design-token layer for EVERY route (module / editor / pill):
  // combatHudTokens.css declares the --odyssey-* custom properties on
  // `.odyssey-hud`, so the mount root must carry that class or all var()-based
  // panel styling resolves to nothing. Each mount also self-applies it, but
  // anchoring it here guarantees tokens regardless of what is mounted.
  root.classList.add("odyssey-hud");
  const available = !!(OBR && OBR.isAvailable);
  const moduleParam = getModuleParam();

  let uiState = {};
  try { uiState = parseHudUiState(window.location.search); } catch { uiState = {}; }

  // --- Collapsed pill ---
  if (moduleParam === "pill") {
    renderPill(root, available);
    return;
  }

  // --- Arrange-HUD editor ---
  if (moduleParam === "editor" || moduleParam === "") {
    mountCombatHudLayoutEditor({
      root,
      uiState,
      layout: readStoredLayout(window.localStorage),
      integration: {
        onSave(layout) {
          writeStoredLayout(window.localStorage, layout);
          if (available) {
            send(BC_HUD_LAYOUT, layout);
            send(BC_HUD_EDITOR, { open: false });
          }
        },
        onCancel() {
          if (available) send(BC_HUD_EDITOR, { open: false });
        },
      },
    });
    return;
  }

  // --- Single HUD module ---
  if (HUD_MODULE_IDS.includes(moduleParam)) {
    const mod = mountCombatHudModule({
      root,
      moduleId: moduleParam,
      uiState,
      integration: {
        onArrange() { if (available) send(BC_HUD_EDITOR, { open: true }); },
        onCollapse(collapsed) { if (available) send(BC_HUD_UI_STATE, { isHudCollapsed: !!collapsed }); },
      },
    });
    // Phase 3A: subscribe to live scene-selection (real OBR room). The module
    // re-renders its own content on every selection change — no popover reopen.
    // On mount we ask the controller to replay the latest payload so a module
    // opened after a selection change still shows the current state.
    if (available) {
      try {
        OBR.broadcast.onMessage(BC_HUD_SELECTION, (event) => {
          try { mod.applySelection(event?.data ?? null); } catch (_e) { /* ignore */ }
        });
        send(BC_HUD_SELECTION_REQUEST, {});
      } catch (_e) { /* standalone or broadcast unavailable → mock render stays */ }
    }
    // The Player module is always present: seed the controller with the
    // browser-local saved layout so it can place all module popovers (cold
    // start opens at default first, then this corrects once).
    if (moduleParam === "player" && available) {
      send(BC_HUD_LAYOUT, readStoredLayout(window.localStorage));
    }
    return;
  }

  // Unknown module → render the editor as a safe fallback overview.
  mountCombatHudLayoutEditor({ root, uiState, layout: readStoredLayout(window.localStorage), integration: {} });
}

if (OBR && OBR.isAvailable) {
  OBR.onReady(start);
} else {
  start();
}
