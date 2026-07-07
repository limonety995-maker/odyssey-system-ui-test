// Combat HUD — Modifier + Action column (Phase 2 · 2.1, read-only).
//
// One narrow right-hand module: a small "Mod" label, a few thin modifier chips
// (positive/negative/passive/narrative + the "God Bless" intervention), and the
// compact Action button pinned to the bottom. No real toggling in Phase 2.

import { selectModifierChips } from "../core/combatHudSelectors.js";
import { renderActionButton } from "./ActionBlock.js";
import { esc, tipAttr, cls } from "./hudDom.js";

const MAX_CHIPS = 4;

export function chipAccent(mod) {
  if (mod.source === "intervention") return "intervention";
  if (mod.kind === "narrative" || mod.requiresGMApproval) return "narrative";
  if (mod.polarity === "negative") return "negative";
  if (mod.polarity === "positive") return "positive";
  return "neutral";
}

export function modChip(mod) {
  const accent = chipAccent(mod);
  const sign = mod.value > 0 ? `+${mod.value}` : (mod.value < 0 ? `${mod.value}` : "");
  const tip = tipAttr(mod.name, [
    mod.description || "",
    sign ? `Value: ${sign}` : "",
    `Source: ${mod.source}`,
    mod.alwaysActive ? "Always active (passive)" : "",
    mod.requiresGMApproval ? "Requires GM approval" : "",
  ]);
  return `<span class="${cls("ohud-mod", `ohud-mod--${accent}`, mod.selected ? "is-selected" : "", mod.alwaysActive ? "is-passive" : "")}"${tip}>
    <span class="ohud-mod-name">${esc(mod.name)}</span>${sign ? `<span class="ohud-mod-val">${esc(sign)}</span>` : ""}
  </span>`;
}

/**
 * Phase 4.1A: ARMED-only chip — an armed attack technique "prepared for next
 * attack", with its own × remove control (data-action="disarm-technique").
 * Deliberately a SEPARATE renderer from modChip (AUTO/legacy chips stay
 * read-only) so a remove button can never appear anywhere but here.
 */
export function armedChip(mod) {
  const tip = tipAttr(mod.name, [mod.description || "Prepared for next attack"]);
  return `<span class="${cls("ohud-mod", "ohud-mod--armed", mod.invalid ? "is-invalid" : "is-selected")}"${tip}>
    <span class="ohud-mod-name">${esc(mod.name)}</span>
    <button type="button" class="ohud-mod-remove" data-action="disarm-technique" data-action-id="${esc(mod.id)}" aria-label="Remove ${esc(mod.name)}">×</button>
  </span>`;
}

/**
 * Modifier chips list (shared by the combined 2.1 column and the standalone
 * 2.2 Modifiers module). Shows up to `limit` chips, then a `+N` overflow chip
 * with a tooltip listing the hidden ones — never overflowing the block.
 */
export function renderModifierChips(state, limit = MAX_CHIPS) {
  const all = selectModifierChips(state);
  const shown = all.slice(0, limit);
  let html = shown.map(modChip).join("");
  if (all.length > shown.length) {
    const hidden = all.slice(limit);
    const tip = tipAttr(`${hidden.length} more`, hidden.map((m) => m.name));
    html += `<span class="ohud-mod ohud-mod--more"${tip}>+${hidden.length}</span>`;
  }
  return `<div class="ohud-mods">${html}</div>`;
}

/** Phase 2.2 standalone Modifiers module (chips only — Action is its own module). */
export function renderModifierModule(state) {
  return `<section class="ohud-panel ohud-panel--modifiers" data-block="modifiers">
    <div class="ohud-panel-head"><span class="ohud-panel-label">Mod</span></div>
    ${renderModifierChips(state)}
  </section>`;
}

/** Combined 2.1 column (chips + Action button) — kept for the single-HUD view. */
export function renderModifierActionColumn(state) {
  return `<section class="ohud-panel ohud-panel--modact" data-block="modact">
    <div class="ohud-panel-head"><span class="ohud-panel-label">Mod</span></div>
    ${renderModifierChips(state)}
    ${renderActionButton(state)}
  </section>`;
}

// Back-compat export (older callers); now an alias of the combined column.
export const renderModifierBlock = renderModifierActionColumn;
