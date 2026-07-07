// HUD Abilities — Skills quickbar Ability Detail Card controller (bug-fix rewrite).
//
// Used to render a `position:fixed` div INSIDE the Skills module's own
// popover iframe. An iframe is its OWN browsing context — content rendered
// inside it (fixed-position or not) can never paint outside that iframe's
// own box (the small width/height OBR gave that popover: 600×165 canonical,
// often smaller once responsive-scaled), so any detail card taller than
// roughly the Skills module's own height was silently clipped by the
// IFRAME BOUNDARY itself, regardless of any CSS overflow/height setting.
// No CSS-only fix inside that same iframe could ever have solved this.
//
// The Ability Detail Card is now its OWN independent OBR companion popover
// (odyssey-hud-ability-detail), sized and positioned by
// combatHudOverlayController.js (hud/abilities/abilityDetailPlacement.js) —
// exactly like the GM Combat Tracker / Quickbar Editor / weapon-selector
// companions already are. This controller therefore no longer owns any DOM
// — it only owns the OPEN-delay timing (so hover still feels the same as
// before) and sends namespaced commands (scope:"combat-hud",
// feature:"ability-detail") for the background controller to act on. The
// CLOSE-grace coordination moves to the background controller too (see its
// own doc comment on abilityDetailCloseTimer) — the slot and the card are
// two separate popovers/iframes now, so neither can observe the other's
// hover state directly; the controller is the one shared arbiter both sides
// send "maybe-hide"/"cancel-hide" to.
//
// Public API is deliberately unchanged from before (scheduleOpen/
// scheduleClose/cancelClose/toggle/closeNow/isOpenFor/destroy) so
// CombatHudModule.js's call sites need only drop the no-longer-meaningful
// anchor-element argument.

const OPEN_DELAY_MS = 220;

/**
 * @param {(command: object) => void} sendCommand called with
 *   `{ type, characterActionId?, armed? }` — the caller wraps this with the
 *   `scope`/`feature` envelope (see CombatHudModule.js) before forwarding to
 *   `integration.onCommand`.
 */
export function createQuickbarDetailCardController(sendCommand) {
  let openTimer = null;
  /** What THIS controller instance believes is currently shown — used only
   *  to decide whether a repeat click on the SAME technique should toggle
   *  it closed (never trusted as the source of truth for what's on screen;
   *  the background controller/companion popover own that). */
  let openActionId = null;

  function clearOpenTimer() {
    if (openTimer) { clearTimeout(openTimer); openTimer = null; }
  }

  function showNow(action, opts = {}) {
    clearOpenTimer();
    openActionId = action?.characterActionId ?? null;
    sendCommand({ type: "show", characterActionId: openActionId, armed: !!opts.armed });
  }

  /** Open after OPEN_DELAY_MS (hover/focus path). */
  function scheduleOpen(action, opts = {}) {
    clearOpenTimer();
    openTimer = setTimeout(() => {
      openTimer = null;
      showNow(action, opts);
    }, OPEN_DELAY_MS);
  }

  /** Tell the background controller "start the close-grace window unless
   *  cancelled" — never closes immediately, so briefly crossing the gap
   *  between the slot and the card (now two separate popovers) never flickers. */
  function scheduleClose() {
    clearOpenTimer();
    sendCommand({ type: "maybe-hide" });
  }

  /** Cancel a pending grace-close — e.g. the pointer/focus returned to this
   *  slot before the background controller's timer fired. */
  function cancelClose() {
    sendCommand({ type: "cancel-hide" });
  }

  function closeNow() {
    clearOpenTimer();
    openActionId = null;
    sendCommand({ type: "hide" });
  }

  /** Click on a non-technique slot: open immediately, or close if this exact
   *  action's card is already the one shown (matches the old toggle feel). */
  function toggle(action, opts = {}) {
    if (openActionId === (action?.characterActionId ?? null)) {
      closeNow();
      return;
    }
    showNow(action, opts);
  }

  return {
    scheduleOpen,
    scheduleClose,
    cancelClose,
    closeNow,
    toggle,
    isOpenFor(actionId) { return openActionId === actionId; },
    destroy() {
      clearOpenTimer();
      closeNow();
    },
  };
}
