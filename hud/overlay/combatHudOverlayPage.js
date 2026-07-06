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
import { BC_HUD_COMMAND, BC_HUD_UI_STATE, BC_HUD_SELECTION, BC_HUD_SELECTION_REQUEST, BC_HUD_SESSION, BC_HUD_SESSION_REQUEST, BC_HUD_ABILITIES, BC_HUD_ABILITIES_REQUEST, parseHudUiState } from "./overlayConstants.js";
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
import { renderGmCombatTracker } from "../session/GmCombatTrackerPanel.js";
import { renderQuickbarEditor } from "../abilities/QuickbarEditorPanel.js";
import {
  buildDraft,
  assignActionToSlot,
  moveSlot,
  removeSlot,
  unassignedActions,
  draftToSavePayload,
  isDraftDirty,
} from "../abilities/quickbarLayoutPolicy.js";
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

  // --- GM Combat Tracker companion popover (Phase 3E.0, GM-only) ---
  // Receives the pre-mapped SAFE session snapshot + Start-Combat candidates
  // over the session channel; every button is a namespaced combat-session
  // command handled by the background session controller / overlay controller.
  if (moduleParam === "gm-combat-tracker") {
    let session = null;
    let candidates = [];
    let busy = false;

    function renderTracker() {
      root.innerHTML = "";
      const host = document.createElement("div");
      host.className = "odyssey-hud ohud-module";
      host.setAttribute("data-module", "gm-combat-tracker");
      host.innerHTML = renderGmCombatTracker({
        session,
        candidates,
        viewerRole: uiState.viewerRole === "gm" ? "gm" : "player",
        busy,
      });
      root.appendChild(host);
    }

    root.addEventListener("click", (e) => {
      const target = e.target.closest("[data-action]");
      if (!target || !available || busy) return;
      const action = target.getAttribute("data-action");
      const sendSession = (type, extra = {}) =>
        send(BC_HUD_COMMAND, { scope: "combat-hud", feature: "combat-session", type, ...extra });
      if (action === "gm-start-combat") {
        // Unchecked characters are EXCLUDED from the encounter.
        const excluded = [...root.querySelectorAll("[data-gmct-candidate]")]
          .filter((box) => !box.checked)
          .map((box) => box.getAttribute("data-gmct-candidate"));
        busy = true;
        renderTracker();
        sendSession("gm-start", { excludedCharacterIds: excluded });
      } else if (action === "gm-skip-turn") {
        busy = true; renderTracker();
        sendSession("gm-skip-turn");
      } else if (action === "gm-force-next") {
        busy = true; renderTracker();
        sendSession("gm-force-next");
      } else if (action === "gm-end-combat") {
        busy = true; renderTracker();
        sendSession("gm-end");
      }
    });

    if (available) {
      try {
        OBR.broadcast.onMessage(BC_HUD_SESSION, (event) => {
          session = event?.data?.session ?? null;
          candidates = Array.isArray(event?.data?.candidates) ? event.data.candidates : [];
          busy = false;
          renderTracker();
        });
        send(BC_HUD_SESSION_REQUEST, {});
        send(BC_HUD_COMMAND, { scope: "combat-hud", feature: "combat-session", type: "load-start-candidates" });
      } catch (_e) { /* standalone */ }
    }
    renderTracker();
    return;
  }

  // --- Quickbar editor companion popover (Phase 4.0b) ---
  // Receives the pre-mapped SAFE abilities runtime on BC_HUD_ABILITIES; builds a
  // local draft (quickbarLayoutPolicy) that is edited by drag-and-drop and never
  // treated as authoritative — Save sends the draft + expected version to the
  // quickbar controller, which the server validates. A server version bump while
  // editing surfaces a conflict + Reload; Cancel discards only the local draft.
  if (moduleParam === "quickbar-editor") {
    let runtime = null;      // mapped abilities runtime (library + layout + version)
    let draft = [];          // dense working draft
    let originalDraft = [];  // baseline for the dirty/cancel guard
    let baseVersion = null;  // layout version this draft was built from
    let busy = false;
    let conflict = false;

    function actionIdSet() {
      return new Set((runtime?.quickActions ?? []).map((a) => a.characterActionId).filter(Boolean));
    }

    function rebuildDraftFromRuntime() {
      const ids = actionIdSet();
      const maxSlots = runtime?.quickbar?.maxSlots ?? 20;
      draft = buildDraft(runtime?.quickbar?.slots ?? [], ids, maxSlots);
      originalDraft = draft.map((s) => ({ ...s }));
      baseVersion = runtime?.quickbar?.version ?? null;
    }

    function renderEditor() {
      root.innerHTML = "";
      const host = document.createElement("div");
      host.className = "odyssey-hud ohud-module";
      host.setAttribute("data-module", "quickbar-editor");
      const library = runtime ? unassignedActions(runtime.quickActions, draft) : [];
      host.innerHTML = renderQuickbarEditor({
        runtime,
        draft,
        library,
        characterName: runtime?.characterName ?? "",
        busy,
        dirty: isDraftDirty(draft, originalDraft),
        conflict,
      });
      root.appendChild(host);
      wireDragAndDrop();
    }

    function notifyDraftChanged() {
      const occupied = draft.filter((s) => s.characterActionId && !s.empty).length;
      send(BC_HUD_COMMAND, { scope: "combat-hud", feature: "quickbar", type: "draft-changed", occupiedSlots: occupied });
    }

    // Read the drag source from the dataTransfer payload we set on dragstart.
    function wireDragAndDrop() {
      const ids = actionIdSet();
      root.querySelectorAll("[draggable='true']").forEach((el) => {
        el.addEventListener("dragstart", (e) => {
          const actionId = el.getAttribute("data-qbe-action");
          const fromSlot = el.getAttribute("data-qbe-slot");
          const payload = JSON.stringify({ actionId: actionId ?? null, fromSlot: fromSlot != null ? Number(fromSlot) : null });
          try { e.dataTransfer.setData("text/plain", payload); e.dataTransfer.effectAllowed = "move"; } catch (_e) { /* ignore */ }
        });
      });
      root.querySelectorAll("[data-qbe-slot]").forEach((slotEl) => {
        slotEl.addEventListener("dragover", (e) => { e.preventDefault(); try { e.dataTransfer.dropEffect = "move"; } catch (_e) { /* ignore */ } });
        slotEl.addEventListener("drop", (e) => {
          e.preventDefault();
          const targetIdx = Number(slotEl.getAttribute("data-qbe-slot"));
          let data = {};
          try { data = JSON.parse(e.dataTransfer.getData("text/plain") || "{}"); } catch (_e) { data = {}; }
          if (data.fromSlot != null && !Number.isNaN(data.fromSlot)) {
            draft = moveSlot(draft, data.fromSlot, targetIdx);
          } else if (data.actionId) {
            draft = assignActionToSlot(draft, data.actionId, targetIdx, ids);
          } else {
            return;
          }
          notifyDraftChanged();
          renderEditor();
        });
      });
    }

    root.addEventListener("click", (e) => {
      const removeBtn = e.target.closest("[data-qbe-remove]");
      if (removeBtn && !busy) {
        draft = removeSlot(draft, Number(removeBtn.getAttribute("data-qbe-remove")));
        notifyDraftChanged();
        renderEditor();
        return;
      }
      const target = e.target.closest("[data-action]");
      if (!target || busy) return;
      const action = target.getAttribute("data-action");
      if (action === "qbe-save") {
        busy = true;
        renderEditor();
        send(BC_HUD_COMMAND, {
          scope: "combat-hud", feature: "quickbar", type: "save-layout",
          expectedVersion: baseVersion,
          slots: draftToSavePayload(draft),
        });
      } else if (action === "qbe-cancel") {
        // Discard only the local draft, then close the popover.
        send(BC_HUD_COMMAND, { scope: "combat-hud", feature: "quickbar", type: "close-editor" });
      } else if (action === "qbe-reload") {
        conflict = false;
        rebuildDraftFromRuntime();
        renderEditor();
      }
    });

    if (available) {
      try {
        OBR.broadcast.onMessage(BC_HUD_ABILITIES, (event) => {
          const nextRuntime = event?.data?.runtime ?? null;
          const nextVersion = nextRuntime?.quickbar?.version ?? null;
          const wasBusy = busy;
          busy = false;
          if (!runtime) {
            // First load → build the initial draft.
            runtime = nextRuntime;
            rebuildDraftFromRuntime();
          } else if (wasBusy) {
            // A save just completed → adopt the fresh server layout as truth.
            runtime = nextRuntime;
            conflict = false;
            rebuildDraftFromRuntime();
          } else if (nextVersion != null && baseVersion != null && nextVersion !== baseVersion) {
            // Server layout changed under us while editing → surface a conflict
            // and keep the user's draft until they Reload (never silent clobber).
            runtime = nextRuntime;
            conflict = true;
          } else {
            // Same version, non-save refresh (e.g. library metadata) → refresh the
            // library view without disturbing the working draft.
            runtime = nextRuntime;
          }
          renderEditor();
        });
        send(BC_HUD_ABILITIES_REQUEST, {});
        send(BC_HUD_COMMAND, { scope: "combat-hud", feature: "quickbar", type: "editor-opened" });
      } catch (_e) { /* standalone */ }
    }
    renderEditor();
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
