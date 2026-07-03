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
import { BC_HUD_COMMAND, BC_HUD_UI_STATE, BC_HUD_SELECTION, BC_HUD_SELECTION_REQUEST, parseHudUiState } from "./overlayConstants.js";
import {
  HUD_MODULE_IDS,
  BC_HUD_LAYOUT,
  BC_HUD_EDITOR,
  readStoredLayout,
  writeStoredLayout,
} from "./hudLayout.js";
import { ICON_MARK } from "../components/hudIcons.js";
import { renderWeaponSelectorPanel } from "../components/WeaponSelectorPanel.js";
import { renderMagazineSelectorPanel } from "../components/MagazineSelectorPanel.js";
import { renderFireModeSelectorPanel } from "../components/FireModeSelectorPanel.js";
import { buildCompanionSelectorState } from "../scene/selectionView.js";

const COMPANION_DEBUG = (() => {
  try { return new URLSearchParams(window.location.search).get("debug") === "1"; } catch { return false; }
})();

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
        onCommand(command) { if (available) send(BC_HUD_COMMAND, command); },
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

  // --- Companion popover modules (weapon / magazine / fire-mode selectors) ---
  // These are ephemeral companion popovers opened by the overlay controller.
  // They subscribe to live scene-selection and render the weapon/magazine/
  // fire-mode selector.
  if (moduleParam === "gun-weapon-selector" || moduleParam === "gun-magazine-selector" || moduleParam === "gun-fire-mode-selector") {
    // The companion shares the controller-owned live snapshot — it does NOT make
    // its own armory request. The raw BC_HUD_SELECTION payload is normalized
    // through the SAME synthetic-state path the Gun module uses, so the selector
    // renders an identical weapon view model (`snapshot.weapon.available`). While
    // the first replay is in flight `selState` is null → "Loading…" (never a
    // false empty list — the bug this fixes).
    let rawPayload = null;

    function renderCompanion() {
      root.innerHTML = "";
      const host = document.createElement("div");
      host.className = "odyssey-hud ohud-module";
      host.setAttribute("data-module", moduleParam);

      const selState = buildCompanionSelectorState(rawPayload);
      const html = moduleParam === "gun-weapon-selector"
        ? renderWeaponSelectorPanel(selState)
        : moduleParam === "gun-magazine-selector"
          ? renderMagazineSelectorPanel(selState)
          : renderFireModeSelectorPanel(selState);
      host.innerHTML = html;
      root.appendChild(host);

      if (COMPANION_DEBUG) {
        const avail = selState?.snapshot?.weapon?.available;
        const commandRoute = moduleParam === "gun-weapon-selector" ? "gun-selector"
          : moduleParam === "gun-magazine-selector" ? "magazine-selector"
          : "fire-mode-selector";
        // eslint-disable-next-line no-console
        console.info("[combatHud/companion:debug]", {
          module: moduleParam,
          commandRoute,
          selectorIframeReady: !!selState,
          selectorRenderWeaponAvailableCount: Array.isArray(avail) ? avail.length : null,
          selectedWeaponId: rawPayload?.ui?.selectedWeaponId ?? null,
        });
      }
    }

    // Forward weapon/magazine/fire-mode selection clicks as HUD commands. The
    // scene controller owns the resulting state (selectedWeaponId / reload mag
    // / fire mode switch) and re-publishes the snapshot; the overlay controller
    // closes this companion. Fire-mode uses the namespaced envelope (scope +
    // feature) so its routing can never collide with the flat-`type` commands.
    root.addEventListener("click", (e) => {
      const target = e.target.closest("[data-action]");
      if (!target || !available) return;
      const action = target.getAttribute("data-action");
      if (action === "select-weapon") {
        send(BC_HUD_COMMAND, { type: "select-weapon", weaponId: target.getAttribute("data-weapon-id") });
      } else if (action === "select-reload-mag") {
        send(BC_HUD_COMMAND, { type: "select-reload-mag", magazineId: target.getAttribute("data-magazine-id") });
      } else if (action === "select-fire-mode") {
        send(BC_HUD_COMMAND, {
          scope: "combat-hud", feature: "fire-mode", type: "select",
          fireModeId: target.getAttribute("data-fire-mode-id"),
        });
      }
    });

    if (available) {
      try {
        OBR.broadcast.onMessage(BC_HUD_SELECTION, (event) => {
          rawPayload = event?.data ?? null;
          renderCompanion();
        });
        send(BC_HUD_SELECTION_REQUEST, {});
      } catch (_e) { /* standalone */ }
    }
    renderCompanion();
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
