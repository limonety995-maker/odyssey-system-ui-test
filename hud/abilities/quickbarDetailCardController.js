// HUD Abilities — Skills quickbar Ability Detail Card controller (Phase 4.1A.2, PURE-ish DOM).
//
// Owns ONE floating detail-card element per Skills module instance, appended
// to document.body — a SIBLING of the transform-scaled `.ohud-module` canvas
// (same placement Tooltip.js already uses for the small hover tooltip), so
// it is never visually shrunk by the responsive-scaling transform and its
// typography floor (combatHudLayout.css's .ohud-ability-card rules) always
// holds regardless of the module's own layoutScale.
//
// Trigger rules differ from the generic hover tooltip because a technique
// slot's CLICK is already taken by arm/disarm (Phase 4.1A):
//   - non-technique occupied slot: CLICK opens/toggles the card immediately.
//   - attack_technique occupied slot: HOVER or KEYBOARD FOCUS opens it after
//     a short delay; it stays open while focus/hover remains on the slot OR
//     the card itself, and closes (after a short grace period, to survive
//     the pointer briefly crossing the gap between slot and card) once
//     neither has focus/hover.
// Empty slots and the quickbar-editor trigger never call into this at all.

import { renderAbilityDetailCard } from "./AbilityDetailCard.js";

const OPEN_DELAY_MS = 220;
const CLOSE_GRACE_MS = 160;

/**
 * @param {HTMLElement} host the module root (`.ohud-module`) — used only to
 *   find `ownerDocument`; listeners are NOT attached here (the caller already
 *   delegates its own mouseover/focusin/etc on this element).
 */
export function createQuickbarDetailCardController(host) {
  const doc = host.ownerDocument || document;
  const el = doc.createElement("div");
  el.className = "ohud-ability-card";
  el.hidden = true;
  el.setAttribute("role", "dialog");
  (doc.body || host).appendChild(el);

  let openTimer = null;
  let closeTimer = null;
  let currentActionId = null;

  function clearOpenTimer() { if (openTimer) { clearTimeout(openTimer); openTimer = null; } }
  function clearCloseTimer() { if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; } }

  function place(anchorRect) {
    const vw = doc.defaultView?.innerWidth ?? window.innerWidth;
    const vh = doc.defaultView?.innerHeight ?? window.innerHeight;
    const cardRect = el.getBoundingClientRect();
    const margin = 8;
    let left = anchorRect.left;
    let top = anchorRect.top - cardRect.height - margin; // prefer above the slot
    if (top < margin) top = anchorRect.bottom + margin; // not enough room above → below
    left = Math.max(margin, Math.min(left, vw - cardRect.width - margin));
    top = Math.max(margin, Math.min(top, vh - cardRect.height - margin));
    el.style.left = `${Math.round(left)}px`;
    el.style.top = `${Math.round(top)}px`;
  }

  /** Open immediately for `action`, anchored near `anchorEl`. */
  function openFor(anchorEl, action, opts = {}) {
    clearOpenTimer();
    clearCloseTimer();
    currentActionId = action?.characterActionId ?? null;
    el.innerHTML = renderAbilityDetailCard(action, opts);
    el.hidden = false;
    place(anchorEl.getBoundingClientRect());
  }

  /** Open after OPEN_DELAY_MS (hover/focus path) — cancelled by any close call. */
  function scheduleOpen(anchorEl, action, opts = {}) {
    clearOpenTimer();
    clearCloseTimer();
    openTimer = setTimeout(() => {
      openTimer = null;
      openFor(anchorEl, action, opts);
    }, OPEN_DELAY_MS);
  }

  /** Close after a short grace period — cancel with cancelClose() if the
   *  pointer/focus lands back on the slot or the card itself before it fires. */
  function scheduleClose() {
    clearOpenTimer();
    clearCloseTimer();
    closeTimer = setTimeout(() => {
      closeTimer = null;
      el.hidden = true;
      currentActionId = null;
    }, CLOSE_GRACE_MS);
  }

  function cancelClose() {
    clearCloseTimer();
  }

  function closeNow() {
    clearOpenTimer();
    clearCloseTimer();
    el.hidden = true;
    currentActionId = null;
  }

  function toggle(anchorEl, action, opts = {}) {
    if (!el.hidden && currentActionId === (action?.characterActionId ?? null)) {
      closeNow();
      return;
    }
    openFor(anchorEl, action, opts);
  }

  return {
    element: el,
    openFor,
    scheduleOpen,
    scheduleClose,
    cancelClose,
    closeNow,
    toggle,
    isOpen() { return !el.hidden; },
    isOpenFor(actionId) { return !el.hidden && currentActionId === actionId; },
    /** True when `target` is the card itself or lives inside it — callers
     *  use this to decide whether a pointer/focus move away from the slot
     *  should still count as "still interacting with the detail card". */
    contains(target) { return !!target && el.contains(target); },
    destroy() {
      clearOpenTimer();
      clearCloseTimer();
      el.remove();
    },
  };
}
