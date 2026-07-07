// HUD Abilities — Ability Detail Card sizing + placement (PURE).
//
// Bug fix: the card used to be a `position:fixed` div rendered INSIDE the
// Skills module's own popover iframe. An iframe is its own browsing context;
// content (including position:fixed elements) can never render outside its
// own box, which is exactly the small width/height OBR gave that popover
// (600×165 canonical, often smaller once responsive-scaled). No CSS change
// inside that iframe could ever fix this — the card is now its OWN
// independent OBR companion popover (odyssey-hud-ability-detail), sized and
// positioned by combatHudOverlayController.js, exactly like the GM Combat
// Tracker / Quickbar Editor / weapon-selector companions already are.
//
// This module supplies the two PURE calculations that popover needs:
//   - estimateAbilityDetailHeight: a real-data-driven estimate (description
//     length, pill count, whether a status/armed line renders) — never one
//     fixed number for every ability. It's an ESTIMATE (fonts/wrapping vary
//     slightly across environments), not a pixel-exact measurement — the
//     card's own internal scrollable body (AbilityDetailCard.js's
//     opts.scrollableBody) is the robust fallback whenever it undershoots,
//     keeping the header and status pinned and visible regardless.
//   - computeAbilityDetailRect: the safe placement policy (preferred above
//     Skills Block; fallback above-left / above-right; fallback beside it),
//     choosing whichever candidate genuinely fits inside the real viewport.

import { abilityTooltipModel } from "./AbilityTooltip.js";

export const ABILITY_DETAIL_WIDTH = 280;

const MIN_HEIGHT = 140;
const HEADER_HEIGHT = 44;
const LINE_HEIGHT = 17;
const CHARS_PER_LINE = 36; // ~280px wide card at the 12px body-text floor
const PILL_ROW_HEIGHT = 26;
// Conservative (pills like "Resource PSI 1" / "Target One character (body
// zone)" are wide enough that a 280px-wide card often fits only 2 per row,
// not 3) — better to slightly over-estimate height (empty space, harmless)
// than under-estimate it (an avoidable scrollbar for ordinary content).
const PILLS_PER_ROW = 2;
const STATUS_HEIGHT = 32;
// The card's own container (.ohud-qbe-desc) adds vertical padding (10px top
// + 10px bottom) AND a `gap` between each of its flex children (head / body
// / status — up to 2 gaps of 6px each) on top of the content itself; folded
// into one constant here rather than three, since callers only need the
// total estimate, not each contributing term.
const PADDING = 20 + 12;
/** Never claim more than this fraction of the real viewport, however long
 *  a description gets — beyond this the card's own body scrolls instead. */
const MAX_VIEWPORT_FRACTION = 0.7;

/**
 * @param {object|null} action mapped quick action
 * @param {{ armed?: boolean }} [opts]
 * @returns {number} estimated natural content height in px
 */
export function estimateAbilityDetailHeight(action, opts = {}) {
  if (!action) return MIN_HEIGHT;
  const model = abilityTooltipModel(action);
  const descLine = model.lines.find((l) => l.label === "Description");
  const statusLine = model.lines.find((l) => l.label === "Unavailable" || l.label === "Status");
  const pillCount = model.lines.filter((l) => l !== descLine && l !== statusLine).length;

  const descLines = descLine ? Math.max(1, Math.ceil(String(descLine.value).length / CHARS_PER_LINE)) : 0;
  const pillRows = pillCount > 0 ? Math.ceil(pillCount / PILLS_PER_ROW) : 0;

  let height = HEADER_HEIGHT + PADDING;
  height += descLines * LINE_HEIGHT;
  height += pillRows * PILL_ROW_HEIGHT;
  if (statusLine) height += STATUS_HEIGHT;
  if (opts.armed) height += STATUS_HEIGHT;
  return Math.max(MIN_HEIGHT, Math.round(height));
}

/**
 * Safe placement policy (section B): preferred above Skills Block, then
 * above-left / above-right, then beside it — the first candidate that fits
 * fully inside [0,vw]x[0,vh] wins; otherwise the preferred candidate is
 * clamped fully on-screen (never left off-screen, never a centered modal).
 * @param {{left:number, top:number, width:number, height:number}} skillsRect
 * @param {number} estimatedHeight from estimateAbilityDetailHeight
 * @param {number} vw actual viewport width
 * @param {number} vh actual viewport height
 */
export function computeAbilityDetailRect(skillsRect, estimatedHeight, vw, vh) {
  const width = ABILITY_DETAIL_WIDTH;
  const height = Math.max(MIN_HEIGHT, Math.min(Math.round(estimatedHeight), Math.round(vh * MAX_VIEWPORT_FRACTION)));
  const gap = 6;
  const candidates = [
    { left: skillsRect.left, top: skillsRect.top - height - gap }, // preferred: above, left-aligned
    { left: skillsRect.left - width - gap, top: skillsRect.top + skillsRect.height - height }, // above-left (offset left, bottom-aligned)
    { left: skillsRect.left + skillsRect.width - width, top: skillsRect.top - height - gap }, // above-right
    { left: skillsRect.left + skillsRect.width + gap, top: Math.max(0, skillsRect.top) }, // side, right of Skills
    { left: skillsRect.left - width - gap, top: Math.max(0, skillsRect.top) }, // side, left of Skills
  ];
  const fits = (c) => c.left >= 0 && c.left + width <= vw && c.top >= 0 && c.top + height <= vh;
  const chosen = candidates.find(fits) ?? candidates[0];
  return {
    left: Math.max(0, Math.min(chosen.left, Math.max(0, vw - width))),
    top: Math.max(0, Math.min(chosen.top, Math.max(0, vh - height))),
    width,
    height,
  };
}
