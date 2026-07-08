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
import { DEFAULT_HUD_LAYOUT_V2, computeCriticalTextRatio } from "../overlay/hudLayout.js";

import { renderPlayerBlock } from "./PlayerBlock.js";
import { renderGunBlock } from "./GunBlock.js";
import { renderSkillBlock } from "./SkillBlock.js";
import { renderCombatControlBlock } from "./CombatControlBlock.js";
import { renderBattleLogPanel } from "./BattleLogBlock.js";
import { renderWeaponSelectorPanel } from "./WeaponSelectorPanel.js";
import { renderMagazineSelectorPanel } from "./MagazineSelectorPanel.js";
import { renderFireModeSelectorPanel } from "./FireModeSelectorPanel.js";
import { renderEmptyState, renderErrorState, renderLoadingState } from "./EmptyHudState.js";
import { renderSelectionModule } from "../scene/selectionView.js";
import { normalizeSelectionPayload } from "../scene/selectionState.js";
import { createTooltip } from "./Tooltip.js";
import { createQuickbarDetailCardController } from "../abilities/quickbarDetailCardController.js";
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
  "gun-weapon-selector": renderWeaponSelectorPanel,
  "gun-magazine-selector": renderMagazineSelectorPanel,
  "gun-fire-mode-selector": renderFireModeSelectorPanel,
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
  // Priority UI Fix — Universal Responsive HUD Scaling: `scale` is the SAME
  // factor combatHudOverlayController.js used to size this module's OUTER
  // popover (computeLayoutScale(vw, vh) in hudLayout.js). Only one of the 5
  // canonical modules gets rescaled here — companion selector panels
  // (weapon/magazine/fire-mode) share this mount function but have no entry
  // in DEFAULT_HUD_LAYOUT_V2, so `canonical` is undefined for them and they
  // render exactly as before (untouched by this feature, per scope).
  const scale = Number(options.scale) > 0 ? Number(options.scale) : 1;
  const canonical = DEFAULT_HUD_LAYOUT_V2[moduleId];

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
  if (canonical) {
    // The outer popover box is already sized to width*scale/height*scale
    // (moduleRect() in combatHudOverlayController.js). This element instead
    // stays at its CANONICAL (1920×1080-reference) pixel size — every
    // existing CSS rule in combatHudLayout.css/combatHudModule.css keeps
    // authoring against those same unscaled numbers — and a single transform
    // visually fits it to the scaled popover box. transform-origin "top
    // left" matches the popover's own anchorOrigin/transformOrigin (both
    // LEFT/TOP), so there is no offset drift between the scaled visual
    // content and the click-hit-testing the browser already does post-
    // transform (no CSS zoom, no separate click-coordinate math needed).
    el.style.width = `${canonical.width}px`;
    el.style.height = `${canonical.height}px`;
    if (scale !== 1) {
      el.style.transform = `scale(${scale})`;
      el.style.transformOrigin = "top left";
    }
    // Priority UI Fix — typography floor: a handful of "must remain
    // readable" selectors (see the comment block above .ohud-cc-abtn in
    // combatHudModule.css) multiply their font-size by this ratio instead of
    // riding the transform above unmodified — see computeCriticalTextRatio's
    // own doc comment in hudLayout.js for the full reasoning.
    el.style.setProperty("--ohud-critical-text-ratio", String(computeCriticalTextRatio(scale)));
    // Phase 4.1A.2: quickbar slot state markers (.ohud-qb-cd/.ohud-qb-active/
    // .ohud-qb-state) get the SAME formula with a much tighter cap — a
    // 56×50px slot has far less room to counter-grow into than a full
    // Combat Control action bar before its tiny corner badge overwhelms the
    // icon/name (see the comment above .ohud-qb-badges in
    // combatHudLayout.css).
    el.style.setProperty("--ohud-slot-marker-ratio", String(computeCriticalTextRatio(scale, 1.5)));
  }
  root.appendChild(el);

  const tooltip = createTooltip(el);
  // Phase 4.1A.2 (bug-fix rewrite): the bigger Ability Detail Card only ever
  // appears in the Skills module (the only one with quickbar slots) — a null
  // controller elsewhere means every call site below is a safe no-op. It no
  // longer owns a local DOM element (that used to get clipped by this
  // module's own tiny iframe boundary) — it sends namespaced commands for
  // the background controller to open/resize/close a SEPARATE companion
  // popover instead (see quickbarDetailCardController.js's header comment).
  const detailCard = moduleId === "skills"
    ? createQuickbarDetailCardController((cmd) => {
        integration.onCommand && integration.onCommand({ scope: "combat-hud", feature: "ability-detail", ...cmd });
      })
    : null;
  let toastTimer = null;

  /** Resolve the CURRENT (live-selection-first, mock-fallback) mapped quick
   *  action by id — the same runtime SkillBlock.js already renders from,
   *  never a second copy. */
  function resolveQuickAction(actionId) {
    if (!actionId) return null;
    let list = liveSelection?.hudSnapshot?.quickbar?.quickActions;
    if (!Array.isArray(list)) {
      try { list = store.getState()?.snapshot?.quickbar?.quickActions; } catch (_e) { list = null; }
    }
    return Array.isArray(list) ? (list.find((a) => a.characterActionId === actionId) ?? null) : null;
  }

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
    let liveLines = "";
    if (liveSelection) {
      const ui = liveSelection.ui ?? {};
      const tgt = ui.targeting ?? {};
      const intent = ui.activeIntent ?? {};
      liveLines = [
        `char: ${esc(liveSelection.characterId ?? "—")}`,
        `weapon: ${esc(ui.selectedWeaponId ?? "—")}`,
        `intent: ${esc(intent.kind ?? "—")}${intent.kind === "skill" ? ` ${esc(intent.id ?? "")}` : ""}`,
        `tgt.mode: ${esc(tgt.mode ?? "none")}`,
        `tgt.zone: ${esc(tgt.selectedBodyPartId ?? "—")}`,
        `tgt.ids: ${esc(JSON.stringify(tgt.selectedTargetIds ?? []))}`,
      ].map((l) => `<div>${l}</div>`).join("");
    }
    return `<div class="ohud-module-debug">${esc(moduleId)} · mount✓ · ${snap} · ${esc(bodyMode)}${liveLines ? `<hr style="opacity:.3;margin:2px 0">${liveLines}` : ""}</div>`;
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

  /** De-dupe key for the last commandStatus a toast was shown for — the same
   *  {type,message} can arrive on unrelated re-broadcasts (e.g. a sibling
   *  selection refresh) until the next user command resets it; without this,
   *  every such re-render would re-pop the toast. */
  let lastCommandStatusKey = null;

  /** Surface ephemeral.commandStatus (reload success/failure, etc.) as a
   *  toast. Without this, a reload REJECTED by the backend (e.g. an
   *  incompatible/not-found magazine) produced ZERO visible feedback — the UI
   *  looked like "Reload did nothing" instead of showing the real reason. */
  function maybeShowCommandStatusToast() {
    const status = liveSelection?.ui?.commandStatus ?? null;
    const key = status ? `${status.type}:${status.message}` : null;
    if (key === lastCommandStatusKey) return;
    lastCommandStatusKey = key;
    if (status?.message) showToast(status.message);
  }

  /** Apply a LIVE scene-selection payload (Phase 3A). `null`/invalid → fall back
   *  to the mock render. Re-renders only this module's own content — no popover
   *  reopen, no layout change. */
  function applySelection(payload) {
    liveSelection = payload ? normalizeSelectionPayload(payload) : null;
    logLiveDebug(liveSelection);
    render();
    maybeShowCommandStatusToast();
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
      case "basic-attack":
        if (!t.classList.contains("is-disabled")) {
          integration.onCommand && integration.onCommand({ scope: "combat-hud", feature: "basic-attack", type: "execute" });
        }
        break;
      case "pick-target":
        integration.onCommand && integration.onCommand({ type: "pick-target" });
        break;
      case "cancel-target":
        integration.onCommand && integration.onCommand({ type: "cancel-target" });
        break;
      case "clear-target":
        integration.onCommand && integration.onCommand({ type: "clear-target" });
        break;
      case "select-target-zone":
        integration.onCommand && integration.onCommand({ type: "select-target-zone", zoneId: t.getAttribute("data-zone-id") });
        break;
      case "select-weapon":
        integration.onCommand && integration.onCommand({ type: "select-weapon", weaponId: t.getAttribute("data-weapon-id") });
        break;
      case "toggle-weapon-selector":
        integration.onCommand && integration.onCommand({ type: "toggle-weapon-selector" });
        break;
      case "toggle-magazine-selector":
        integration.onCommand && integration.onCommand({ type: "toggle-magazine-selector" });
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
      case "toggle-fire-mode-selector":
        integration.onCommand && integration.onCommand({ scope: "combat-hud", feature: "fire-mode", type: "toggle-selector" });
        break;
      case "select-fire-mode":
        integration.onCommand && integration.onCommand({
          scope: "combat-hud", feature: "fire-mode", type: "select",
          fireModeId: t.getAttribute("data-fire-mode-id"),
        });
        break;
      case "prepare-skill":
        integration.onCommand && integration.onCommand({ type: "prepare-skill", skillId: t.getAttribute("data-skill-id") });
        break;
      case "open-quickbar-editor":
        // Phase 4.0b: open the editor companion popover (overlay controller owns
        // the popover lifecycle, exactly like the GM tracker toggle).
        integration.onCommand && integration.onCommand({ scope: "combat-hud", feature: "quickbar", type: "open-editor" });
        break;
      case "show-ability-detail": {
        // Phase 4.0b: a normal-mode click only surfaces detail — it must NEVER
        // execute, change Target/Action, or spend resources.
        // Phase 4.1A.2: for directed/instant/toggle slots (never
        // attack_technique — that click is arm/disarm, see below), this now
        // opens the real Ability Detail Card instead of a placeholder toast.
        // A slot whose action vanished from the library (is-missing, action
        // resolves to null) still falls back to a short toast — there is no
        // ability data to show a card for.
        if (t.classList.contains("is-disabled")) break;
        const action = resolveQuickAction(t.getAttribute("data-action-id"));
        if (action && detailCard) detailCard.toggle(action);
        else showToast("Ability details — execution arrives in Phase 4.1");
        break;
      }
      case "toggle-armed-technique": {
        // Phase 4.1A: arming is blocked while the tile itself is disabled
        // (unavailable/on cooldown/etc), but DISARMING an already-armed
        // technique must always work even if it went invalid after arming —
        // "the user can always remove it manually" (spec). is-armed is the
        // one signal this generic delegated handler has for "already armed".
        // Phase 4.1A.2: click stays arm/disarm ONLY — the detail card for a
        // technique opens on hover/focus instead (see onSlotDetailHover/
        // onSlotDetailFocus below), since click is already spoken for here.
        const isArmed = t.classList.contains("is-armed");
        if (isArmed || !t.classList.contains("is-disabled")) {
          integration.onCommand && integration.onCommand({
            scope: "combat-hud", feature: "quickbar", type: "toggle-armed",
            characterActionId: t.getAttribute("data-action-id"),
          });
        }
        break;
      }
      case "disarm-technique":
        // Combat Control's ARMED × — always disarms (it only ever renders on
        // an already-armed entry), same underlying toggle as the Skills Block.
        integration.onCommand && integration.onCommand({
          scope: "combat-hud", feature: "quickbar", type: "toggle-armed",
          characterActionId: t.getAttribute("data-action-id"),
        });
        break;
      case "execute-direct-ability":
        // Phase 4.1B.0: a direct single-target ability attack — an immediate
        // execution, never an arm/disarm toggle (see
        // hud/abilities/abilityAvailabilityPolicy.js's isDirectAttackAbility).
        // is-disabled already covers cooldown/insufficient-resource/other
        // server-derived unavailability AND an in-flight duplicate click
        // (QuickbarView.js sets is-disabled whenever is-pending is true) — one
        // guard covers both cases, exactly like basic-attack's own guard above.
        if (!t.classList.contains("is-disabled")) {
          integration.onCommand && integration.onCommand({
            scope: "combat-hud", feature: "quickbar", type: "execute-direct-ability",
            characterActionId: t.getAttribute("data-action-id"),
          });
        }
        break;
      case "end-turn":
        // Phase 3E.0: disable immediately (until the authoritative session
        // re-render) so a double-click can never fire a second request; the
        // background controller is single-flight anyway.
        t.setAttribute("disabled", "disabled");
        integration.onCommand && integration.onCommand({ scope: "combat-hud", feature: "combat-session", type: "end-turn" });
        break;
      case "toggle-gm-tracker":
        integration.onCommand && integration.onCommand({ scope: "combat-hud", feature: "combat-session", type: "toggle-tracker" });
        break;
      default: break;
    }
  }
  el.addEventListener("click", onClick);
  function onKeyDown(e) {
    if (e.key === "Escape" && moduleId === "gun") {
      integration.onCommand && integration.onCommand({ type: "close-weapon-selector" });
      integration.onCommand && integration.onCommand({ scope: "combat-hud", feature: "fire-mode", type: "close-selector" });
    }
    // Phase 4.0g: Esc cancels an in-progress target pick. Reuses the EXACT
    // existing "cancel-target" command — targetSelectionController's onCancel()
    // already no-ops when not currently picking, so this is safe to dispatch
    // unconditionally (mirrors the gun-module Escape handler above, which
    // does the same for its own selectors).
    if (e.key === "Escape" && moduleId === "combatControl") {
      integration.onCommand && integration.onCommand({ type: "cancel-target" });
    }
  }
  el.addEventListener("keydown", onKeyDown);

  // Phase 4.1A.2 (bug-fix rewrite): attack_technique slots open the Ability
  // Detail Card on hover/focus (with a short delay), never on click (click is
  // arm/disarm — see the "toggle-armed-technique" case above). Delegated the
  // same way Tooltip.js already delegates its own hover — one listener set
  // per event type on the module root, not one per slot.
  //
  // The card is now a SEPARATE companion popover/iframe (see
  // quickbarDetailCardController.js's header comment for why), so this
  // module can no longer detect "the pointer moved onto the card itself" —
  // that used to be a local `detailCard.contains(to)` DOM check, which is
  // meaningless across iframes. Leaving a technique slot always schedules a
  // close; the card's OWN mounted page (combatHudOverlayPage.js's
  // "ability-detail" route) independently sends its own cancel-hide/
  // maybe-hide on its own mouseenter/mouseleave, and the background
  // controller (the one shared arbiter reachable by both iframes) is what
  // actually coordinates the shared grace window.
  function techniqueSlotFromTarget(target) {
    // Phase 4.1B.0: a direct-attack-eligible technique's click is spoken for
    // by "execute-direct-ability" instead of "toggle-armed-technique" (see
    // isDirectAttackAbility), but it is still an attack_technique slot and
    // must still get the SAME hover/focus detail card — only the click
    // behavior differs between the two.
    const t = target && target.closest
      ? target.closest('[data-action="toggle-armed-technique"], [data-action="execute-direct-ability"]')
      : null;
    return t && el.contains(t) ? t : null;
  }
  function onSlotDetailOver(e) {
    if (!detailCard) return;
    const t = techniqueSlotFromTarget(e.target);
    if (!t) return;
    const action = resolveQuickAction(t.getAttribute("data-action-id"));
    if (!action) return;
    detailCard.scheduleOpen(action, { armed: t.classList.contains("is-armed") });
  }
  function onSlotDetailOut(e) {
    if (!detailCard) return;
    const t = techniqueSlotFromTarget(e.target);
    if (!t) return;
    const to = e.relatedTarget;
    // Moving within the same slot is not a "leave" — anything else
    // (including onto the now-separate card popover, which this module
    // cannot observe) schedules the shared grace-close.
    if (to && techniqueSlotFromTarget(to) === t) return;
    detailCard.scheduleClose();
  }
  function onSlotDetailFocusIn(e) {
    if (!detailCard) return;
    const t = techniqueSlotFromTarget(e.target);
    if (!t) return;
    const action = resolveQuickAction(t.getAttribute("data-action-id"));
    if (!action) return;
    detailCard.scheduleOpen(action, { armed: t.classList.contains("is-armed") });
  }
  function onSlotDetailFocusOut(e) {
    if (!detailCard) return;
    const t = techniqueSlotFromTarget(e.target);
    if (!t) return;
    detailCard.scheduleClose();
  }
  if (detailCard) {
    el.addEventListener("mouseover", onSlotDetailOver);
    el.addEventListener("mouseout", onSlotDetailOut);
    el.addEventListener("focusin", onSlotDetailFocusIn);
    el.addEventListener("focusout", onSlotDetailFocusOut);
  }

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
      if (detailCard) {
        el.removeEventListener("mouseover", onSlotDetailOver);
        el.removeEventListener("mouseout", onSlotDetailOut);
        el.removeEventListener("focusin", onSlotDetailFocusIn);
        el.removeEventListener("focusout", onSlotDetailFocusOut);
        detailCard.destroy();
      }
      if (toastTimer) clearTimeout(toastTimer);
      store.dispose();
      el.remove();
    },
  };
}
