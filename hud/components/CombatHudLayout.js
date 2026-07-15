// Combat HUD — layout orchestrator (Phase 2 · 2.1).
//
// Composes the modules into the reference bottom-left composition:
//   [ Player ]   gap   [ Gun ][ Skills ][ Target ][ Mod+Action ]
// plus a thin top control strip (grip handle · dev · LOG · collapse).
//
// Owns NO business logic (everything comes from pure Phase 0 selectors / block
// components) and imports NO OBR SDK. Personal placement drag is handled here
// with a local CSS-transform preview; the real OBR position is committed once
// on pointerup via onPlacementCommit (the controller repositions the popover).

import { listScenarios } from "../models/combatHudMockScenarios.js";
import { resolveLayoutMode, computeHudGap } from "../overlay/overlayConstants.js";
import {
  DEFAULT_PLACEMENT,
  clampPlacement,
  placementToPixels,
  pixelsToPlacement,
} from "../overlay/hudPlacement.js";
import { resolveBodyMode } from "./hudLayoutModel.js";

import { renderPlayerBlock } from "./PlayerBlock.js";
import { renderGunBlock } from "./GunBlock.js";
import { renderSkillBlock } from "./SkillBlock.js";
import { renderTargetBlock } from "./TargetBlock.js";
import { renderModifierActionColumn } from "./ModifierBlock.js";
import { renderBattleLogPanel, toggleLogEntryExpanded } from "./BattleLogBlock.js";
import { renderEmptyState, renderErrorState, renderLoadingState } from "./EmptyHudState.js";
import { createTooltip } from "./Tooltip.js";
import { ICON_GRIP, ICON_PENCIL, ICON_CARET_DOWN, ICON_LOG } from "./hudIcons.js";
import { esc, cls } from "./hudDom.js";

export function createCombatHudLayout(cfg) {
  const {
    store, obrAvailable = true, devControls = true,
    onScenario, onRole, onCollapse, onPlacementCommit, onResetPlacement,
  } = cfg;

  const el = document.createElement("div");
  el.className = "ohud-hud";

  // Render context (true viewport for drag math) + responsive gap.
  const renderCtx = {
    vw: cfg.renderContext?.vw || (typeof window !== "undefined" ? window.innerWidth : 0),
    vh: cfg.renderContext?.vh || (typeof window !== "undefined" ? window.innerHeight : 0),
    gap: cfg.renderContext?.gap ?? null,
  };

  let currentScenarioId = cfg.scenarioId ?? "A";
  let currentPlacement = clampPlacement(cfg.placement ?? DEFAULT_PLACEMENT);
  let devOpen = false;
  let battleLogOpen = false;
  let toastTimer = null;
  /** @type {null | object} */
  let drag = null;

  const tooltip = createTooltip(el);

  function gapPx() {
    return renderCtx.gap != null ? renderCtx.gap : computeHudGap(renderCtx.vw || (typeof window !== "undefined" ? window.innerWidth : 0));
  }

  /* ----------------- top control strip ----------------- */

  function devStrip(state) {
    if (!devControls) return "";
    const role = state?.viewer?.role === "gm" ? "gm" : "player";
    const options = listScenarios()
      .map((s) => `<option value="${esc(s.id)}" ${s.id === currentScenarioId ? "selected" : ""}>${esc(s.label)}</option>`)
      .join("");
    return `<span class="${cls("ohud-dev", devOpen ? "is-open" : "")}">
      <button type="button" class="ohud-icon-btn" data-action="dev-toggle" aria-expanded="${devOpen}" data-tip-title="Developer tools" data-tip-lines="Scenario + role (dev only)">${ICON_PENCIL}</button>
      ${devOpen ? `<span class="ohud-dev-strip">
        <select class="ohud-select" data-action="scenario">${options}</select>
        <button type="button" class="${cls("ohud-chip", role === "player" ? "is-on" : "")}" data-action="role" data-value="player">Player</button>
        <button type="button" class="${cls("ohud-chip", role === "gm" ? "is-on" : "")}" data-action="role" data-value="gm">GM</button>
      </span>` : ""}
    </span>`;
  }

  function controls(state) {
    const fallback = obrAvailable ? "" : `<span class="ohud-fallback">local preview</span>`;
    const logCount = (state?.snapshot?.battleLog?.entries ?? []).length;
    return `<div class="ohud-controls">
      <button type="button" class="ohud-grip" data-action="drag-grip"
        data-tip-title="Перетащить HUD" data-tip-lines="двойной клик — сбросить">${ICON_GRIP}</button>
      ${fallback}
      <span class="ohud-controls-right">
        ${devStrip(state)}
        <button type="button" class="${cls("ohud-icon-btn", battleLogOpen ? "is-on" : "")}" data-action="toggle-log" data-tip-title="Battle log" data-tip-lines="${logCount} recent entr${logCount === 1 ? "y" : "ies"}">${ICON_LOG}</button>
        <button type="button" class="ohud-icon-btn" data-action="collapse" aria-label="Collapse HUD" data-tip-title="Collapse HUD">${ICON_CARET_DOWN}</button>
      </span>
    </div>`;
  }

  /* ----------------- body ----------------- */

  function readyMain(state) {
    return `<div class="ohud-main">
      ${renderPlayerBlock(state)}
      <div class="ohud-rail">
        ${renderGunBlock(state)}
        ${renderSkillBlock(state)}
        ${renderTargetBlock(state)}
        ${renderModifierActionColumn(state)}
      </div>
    </div>`;
  }

  function bodyHtml(state) {
    const bodyMode = resolveBodyMode(state);
    if (bodyMode === "ready") return readyMain(state);
    const inner =
      bodyMode === "empty" ? renderEmptyState(state) :
      bodyMode === "error" ? renderErrorState(state) :
      renderLoadingState();
    return `<div class="ohud-main ohud-main--state"><div class="ohud-state-wrap">${inner}</div></div>`;
  }

  function floatingLog(state) {
    if (!battleLogOpen) return "";
    return `<div class="ohud-log-float">${renderBattleLogPanel(state)}</div>`;
  }

  function render() {
    const state = store.getState();
    const mode = resolveLayoutMode(renderCtx.vw || (typeof window !== "undefined" ? window.innerWidth : 0));
    el.setAttribute("data-mode", mode);
    el.setAttribute("data-body", resolveBodyMode(state));
    el.style.setProperty("--ohud-gap", `${gapPx()}px`);
    el.innerHTML = `${controls(state)}${bodyHtml(state)}${floatingLog(state)}<div class="ohud-toast" hidden></div>`;
  }

  function showToast(text) {
    const toast = el.querySelector(".ohud-toast");
    if (!toast) return;
    toast.textContent = text;
    toast.hidden = false;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { if (toast) toast.hidden = true; }, 1800);
  }

  /* ----------------- drag (personal placement) ----------------- */

  function dragDims() {
    const vw = renderCtx.vw || window.innerWidth;
    const vh = renderCtx.vh || window.innerHeight;
    return { vw, vh, hudW: window.innerWidth, hudH: window.innerHeight };
  }

  function onPointerDown(e) {
    const grip = e.target.closest('[data-action="drag-grip"]');
    if (!grip || e.button !== 0) return;
    e.preventDefault();
    try { grip.setPointerCapture(e.pointerId); } catch (_e) { /* ignore */ }
    const dims = dragDims();
    drag = {
      id: e.pointerId,
      startX: e.clientX, startY: e.clientY,
      startPx: placementToPixels(currentPlacement, dims),
      dims, moved: false,
    };
    el.classList.add("is-dragging");
  }

  function onPointerMove(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (Math.abs(dx) + Math.abs(dy) > 2) drag.moved = true;
    // Local preview only (clipped to the overlay rect); the real OBR position
    // is committed once on pointerup so we never re-open per pointermove.
    el.style.transform = `translate(${dx}px, ${dy}px)`;
  }

  function onPointerUp(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    el.style.transform = "";
    el.classList.remove("is-dragging");
    const moved = drag.moved;
    const placement = pixelsToPlacement(drag.startPx.left + dx, drag.startPx.top + dy, drag.dims);
    drag = null;
    if (moved && typeof onPlacementCommit === "function") {
      currentPlacement = clampPlacement(placement);
      onPlacementCommit(currentPlacement);
    }
  }

  function resetPlacement() {
    currentPlacement = { ...DEFAULT_PLACEMENT };
    if (typeof onResetPlacement === "function") onResetPlacement();
    showToast("HUD position reset");
  }

  /* ----------------- events ----------------- */

  function onClick(e) {
    const t = e.target.closest("[data-action]");
    if (!t) return;
    switch (t.getAttribute("data-action")) {
      case "collapse": onCollapse && onCollapse(true); break;
      case "dev-toggle": devOpen = !devOpen; render(); break;
      case "role": onRole && onRole(t.getAttribute("data-value")); break;
      case "toggle-log": battleLogOpen = !battleLogOpen; render(); break;
      case "toggle-log-entry": toggleLogEntryExpanded(t.getAttribute("data-log-entry-id")); render(); break;
      case "primary":
        if (!t.classList.contains("is-disabled")) showToast("Action resolution arrives in a later phase");
        break;
      default: break;
    }
  }

  function onChange(e) {
    const t = e.target.closest('[data-action="scenario"]');
    if (!t) return;
    currentScenarioId = t.value;
    battleLogOpen = false;
    onScenario && onScenario(currentScenarioId);
  }

  function onDblClick(e) {
    if (e.target.closest('[data-action="drag-grip"]')) resetPlacement();
  }

  let resizeRaf = null;
  function onResize() {
    if (resizeRaf) return;
    resizeRaf = requestAnimationFrame(() => {
      resizeRaf = null;
      // In standalone preview the iframe IS the window, so keep render context
      // in sync; inside OBR the controller drives size via re-open.
      renderCtx.vw = window.innerWidth;
      renderCtx.vh = window.innerHeight;
      render();
    });
  }

  el.addEventListener("click", onClick);
  el.addEventListener("change", onChange);
  el.addEventListener("dblclick", onDblClick);
  el.addEventListener("pointerdown", onPointerDown);
  el.addEventListener("pointermove", onPointerMove);
  el.addEventListener("pointerup", onPointerUp);
  el.addEventListener("pointercancel", onPointerUp);
  if (typeof window !== "undefined") window.addEventListener("resize", onResize);

  const unsubscribe = store.subscribe(render);
  render();

  return {
    el,
    setScenarioId(id) { currentScenarioId = id; render(); },
    destroy() {
      unsubscribe();
      tooltip.destroy();
      el.removeEventListener("click", onClick);
      el.removeEventListener("change", onChange);
      el.removeEventListener("dblclick", onDblClick);
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerup", onPointerUp);
      el.removeEventListener("pointercancel", onPointerUp);
      if (typeof window !== "undefined") window.removeEventListener("resize", onResize);
      if (toastTimer) clearTimeout(toastTimer);
      el.remove();
    },
  };
}
