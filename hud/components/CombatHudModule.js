// Combat HUD — single-module mount (Phase 2.2).
//
// Each HUD module is its OWN OBR popover (own iframe), sized to the module rect.
// This file renders exactly ONE module's block, filling the iframe, wired to a
// Phase 0 mock store (deterministic — every module iframe derives the same
// snapshot from the shared scenario/role/token seeded by the controller via the
// URL). No OBR SDK import; no Supabase; read-only.
//
// The Player module additionally hosts the global HUD controls (Arrange HUD +
// collapse) so normal-mode blocks don't all show grips/buttons.

import { createMockCombatHudAdapter } from "../adapters/mockCombatHudAdapter.js";
import { createCombatHudStore } from "../core/combatHudStore.js";
import { normalizeHudUiState } from "../overlay/overlayConstants.js";
import { resolveBodyMode } from "./hudLayoutModel.js";

import { renderPlayerBlock } from "./PlayerBlock.js";
import { renderGunBlock } from "./GunBlock.js";
import { renderSkillBlock } from "./SkillBlock.js";
import { renderCombatControlBlock } from "./CombatControlBlock.js";
import { renderBattleLogPanel } from "./BattleLogBlock.js";
import { renderEmptyState, renderErrorState, renderLoadingState } from "./EmptyHudState.js";
import { renderSelectionModule } from "../scene/selectionView.js";
import { normalizeSelectionPayload } from "../scene/selectionState.js";
import { createTooltip } from "./Tooltip.js";
import { ICON_GRID, ICON_CARET_DOWN } from "./hudIcons.js";
import { cls, esc } from "./hudDom.js";

/** Dev-only verbose diagnostics, toggled with `?debug=1` on the popover URL.
 *  Production always keeps the compact error fallback, but no debug badge. */
const DEV = (() => {
  try { return /[?&](debug|dev)=1/.test(location.search); } catch { return false; }
})();

const BLOCK_RENDERERS = {
  player: renderPlayerBlock,
  gun: renderGunBlock,
  skills: renderSkillBlock,
  combatControl: renderCombatControlBlock,
  log: renderBattleLogPanel,
};

/**
 * @param {{
 *   root: HTMLElement,
 *   moduleId: string,
 *   uiState?: object,
 *   integration?: { onArrange?:()=>void, onCollapse?:(c:boolean)=>void },
 * }} options
 */
export function mountCombatHudModule(options) {
  const { root, moduleId } = options;
  const integration = options.integration ?? {};
  const restored = normalizeHudUiState(options.uiState);

  const adapter = createMockCombatHudAdapter({ scenarioId: restored.mockScenarioId });
  adapter.setViewerRole(restored.viewerRole);
  if (restored.selectedTokenId) adapter.selectToken(restored.selectedTokenId);

  const store = createCombatHudStore({ adapter });
  store.initialize();

  // Phase 3A: when a LIVE scene-selection payload arrives (real OBR room), it
  // takes priority over the mock store. `null` means standalone / no live data
  // yet → keep the existing deterministic mock render (and all Phase 2 tests).
  let liveSelection = null;

  const el = document.createElement("div");
  // `.odyssey-hud` is the DESIGN-TOKEN root (combatHudTokens.css declares every
  // --odyssey-* custom property there). It MUST be present or all var()-based
  // panel backgrounds/borders/colours resolve to nothing (the module would
  // render as a "naked" block — text/SVG only). We deliberately do NOT use the
  // legacy `.ohud-hud` shell class here: that drives the old single-HUD outer
  // grid/flex layout, which a standalone module iframe must not inherit.
  // `.ohud-module` carries the neutral fill/sizing for one block per iframe.
  el.className = cls("odyssey-hud", "ohud-module");
  el.setAttribute("data-module", moduleId);
  root.appendChild(el);

  const tooltip = createTooltip(el);
  let toastTimer = null;

  function controlsHtml() {
    // Only the Player module carries the global HUD controls.
    if (moduleId !== "player") return "";
    return `<div class="ohud-module-controls">
      <button type="button" class="ohud-icon-btn" data-action="arrange" data-tip-title="Arrange HUD" data-tip-lines="Drag modules to reposition the HUD">${ICON_GRID}</button>
      <button type="button" class="ohud-icon-btn" data-action="collapse" aria-label="Collapse HUD" data-tip-title="Collapse HUD">${ICON_CARET_DOWN}</button>
    </div>`;
  }

  /** Compact, production-safe error card (this module only — siblings are
   *  separate popovers and are unaffected). Full stack only in DEV. */
  function moduleErrorCard(err) {
    const detail = DEV
      ? `<div class="ohud-moderr-detail">${esc(String((err && err.stack) || (err && err.message) || err))}</div>`
      : "";
    return `<section class="ohud-panel ohud-moderr" data-block="${esc(moduleId)}">
      <div class="ohud-moderr-title">⚠ ${esc(moduleId)}</div>${detail}</section>`;
  }

  // Module-level error boundary: a render exception becomes a compact card +
  // console.error(moduleId, stack); it never throws out and never blanks the iframe.
  function bodyHtml(state) {
    try {
      // Live selection (real room) takes priority over the mock snapshot.
      if (liveSelection) return renderSelectionModule(moduleId, liveSelection, { dev: DEV });
      if (!state) throw new Error("no snapshot");
      const mode = resolveBodyMode(state);
      if (mode === "ready") {
        const fn = BLOCK_RENDERERS[moduleId];
        if (!fn) throw new Error(`unknown module "${moduleId}"`);
        return fn(state);
      }
      // Non-ready: Player shows the calm state; others stay muted (map reads through).
      if (moduleId === "player") {
        const inner = mode === "error" ? renderErrorState(state)
          : mode === "loading" ? renderLoadingState()
          : renderEmptyState(state);
        return `<div class="ohud-state-wrap">${inner}</div>`;
      }
      return `<section class="ohud-panel ohud-panel--muted" data-block="${esc(moduleId)}"><div class="ohud-muted-fill">—</div></section>`;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`[combatHud/module:${moduleId}] render failed`, err);
      return moduleErrorCard(err);
    }
  }

  function debugBadge(state) {
    if (!DEV) return "";
    const snap = state && state.snapshot ? "snap✓" : "snap✗";
    let bodyMode = "?";
    try { bodyMode = state ? resolveBodyMode(state) : "no-state"; } catch (_e) { bodyMode = "err"; }
    return `<div class="ohud-module-debug">${esc(moduleId)} · mount✓ · ${snap} · ${esc(bodyMode)}</div>`;
  }

  function logLiveDebug(payload) {
    if (!DEV || !payload?.debug) return;
    try {
      // eslint-disable-next-line no-console
      console.info(`[combatHud/debug:${moduleId}]`, payload.debug);
    } catch (_e) { /* diagnostics must never throw */ }
  }

  function render() {
    let state = null;
    try { state = store.getState(); } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`[combatHud/module:${moduleId}] getState failed`, err);
    }
    let bodyMode = "error";
    try { bodyMode = state ? resolveBodyMode(state) : "error"; } catch (_e) { bodyMode = "error"; }
    el.setAttribute("data-body", liveSelection ? liveSelection.status : bodyMode);
    el.setAttribute("data-weapon-selector", liveSelection?.ui?.weaponSelectorOpen ? "open" : "closed");
    el.innerHTML = `${bodyHtml(state)}${controlsHtml()}${debugBadge(state)}<div class="ohud-toast" hidden></div>`;
  }

  /** Apply a LIVE scene-selection payload (Phase 3A). `null`/invalid → fall back
   *  to the mock render. Re-renders only this module's own content — no popover
   *  reopen, no layout change. */
  function applySelection(payload) {
    liveSelection = payload ? normalizeSelectionPayload(payload) : null;
    logLiveDebug(liveSelection);
    render();
  }

  function showToast(text) {
    const toast = el.querySelector(".ohud-toast");
    if (!toast) return;
    toast.textContent = text;
    toast.hidden = false;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { if (toast) toast.hidden = true; }, 1800);
  }

  function onClick(e) {
    const t = e.target.closest("[data-action]");
    if (!t) return;
    switch (t.getAttribute("data-action")) {
      case "arrange": integration.onArrange && integration.onArrange(); break;
      case "collapse": integration.onCollapse && integration.onCollapse(true); break;
      case "primary":
        if (!t.classList.contains("is-disabled")) showToast("Action resolution arrives in a later phase");
        break;
      case "pick-target":
        integration.onCommand && integration.onCommand({ type: "pick-target" });
        break;
      case "cancel-target":
        integration.onCommand && integration.onCommand({ type: "cancel-target" });
        break;
      case "select-weapon":
        integration.onCommand && integration.onCommand({ type: "select-weapon", weaponId: t.getAttribute("data-weapon-id") });
        break;
      case "toggle-weapon-list":
        integration.onCommand && integration.onCommand({ type: "toggle-weapon-selector" });
        break;
      case "reload":
        integration.onCommand && integration.onCommand({
          type: "reload",
          weaponId: t.getAttribute("data-weapon-id"),
          magazineId: t.getAttribute("data-magazine-id"),
        });
        break;
      case "select-reload-mag":
        integration.onCommand && integration.onCommand({ type: "select-reload-mag", magazineId: t.getAttribute("data-magazine-id") });
        break;
      case "prepare-skill":
        integration.onCommand && integration.onCommand({ type: "prepare-skill", skillId: t.getAttribute("data-skill-id") });
        break;
      default: break;
    }
  }
  el.addEventListener("click", onClick);
  function onKeyDown(e) {
    if (e.key === "Escape" && moduleId === "gun") {
      integration.onCommand && integration.onCommand({ type: "close-weapon-selector" });
    }
  }
  el.addEventListener("keydown", onKeyDown);

  const unsubscribe = store.subscribe(render);
  render();

  return {
    store,
    applySelection,
    unmount() {
      unsubscribe();
      tooltip.destroy();
      el.removeEventListener("click", onClick);
      el.removeEventListener("keydown", onKeyDown);
      if (toastTimer) clearTimeout(toastTimer);
      store.dispose();
      el.remove();
    },
  };
}
