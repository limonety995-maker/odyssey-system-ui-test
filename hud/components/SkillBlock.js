// Combat HUD — Skill block (Phase 2 · 2.1, read-only).
//
// Matches the reference: short coloured group captions (Attack / Shield / Psy …)
// over one dense row of square skill tiles. Accent colour conveys category;
// tiles carry cooldown / cost / toggle / disabled state and rich tooltips.
// Clicking a tile does NOT execute anything in Phase 2.

import {
  selectQuickSlots,
  selectSkillById,
  selectSelectedSkill,
} from "../core/combatHudSelectors.js";
import { accentClass } from "./hudLayoutModel.js";
import { skillIconSvg } from "./hudIcons.js";
import { panel } from "./HudPanel.js";
import { esc, tipAttr, cls } from "./hudDom.js";
import { renderQuickbarStrip } from "../abilities/QuickbarView.js";

const COST_ABBR = { FREE: "F", MOVE: "Mv", MAIN: "M", TURN: "T" };

// Category display order + caption (semantic accent → short reference caption).
const CATEGORY_ORDER = [
  { key: "attack", caption: "Attack" },
  { key: "neutral", caption: "Shield" },
  { key: "psionic", caption: "Psy" },
  { key: "implant", caption: "Tech" },
  { key: "positive", caption: "Aid" },
  { key: "intervention", caption: "Boon" },
];

function skillTile(skill, selectedId) {
  const accent = accentClass(skill.color);
  const disabled = Boolean(skill.disabledReason);
  const selected = skill.id === selectedId;
  const cost = COST_ABBR[skill.actionCost] ?? "";
  const cd = Number(skill.cooldownTurns) || 0;
  const res = skill.resourceCost ? `${skill.resourceCost.amount}${String(skill.resourceCost.type).charAt(0).toUpperCase()}` : "";

  const tip = tipAttr(skill.name, [
    `Source: ${skill.source}`,
    `Cost: ${skill.actionCost}${res ? ` · ${res}` : ""}`,
    cd > 0 ? `Cooldown: ${cd} turn(s)` : "",
    skill.isToggled ? "Active (toggled on)" : "",
    skill.disabledReason ? `Disabled: ${skill.disabledReason}` : (skill.tooltip || ""),
  ]);

  return `<button type="button" class="${cls("ohud-slot", `ohud-accent--${accent}`, disabled ? "is-disabled" : "", selected ? "is-selected" : "", skill.isToggled ? "is-toggled" : "")}" data-action="prepare-skill" data-skill-id="${esc(skill.id)}" ${disabled ? "disabled" : ""}${tip}>
    <span class="ohud-slot-icon">${skillIconSvg(skill.icon)}</span>
    ${cost ? `<span class="ohud-slot-cost">${esc(cost)}</span>` : ""}
    ${res ? `<span class="ohud-slot-res">${esc(res)}</span>` : ""}
    ${cd > 0 ? `<span class="ohud-slot-cd">${cd}</span>` : ""}
    ${skill.isToggled ? `<span class="ohud-slot-toggle" aria-hidden="true"></span>` : ""}
  </button>`;
}

export function renderSkillBlock(state, opts = {}) {
  // Phase 4.0b: when the live snapshot carries the persisted quickbar runtime
  // (folded in by selectionState.buildBroadcastPayload), render the real
  // server-backed quickbar. Absent (mock/legacy) → the category view below.
  const quickbar = state?.snapshot?.quickbar ?? null;
  if (quickbar && quickbar.ok !== false) {
    const role = String(state?.viewer?.role ?? "").toLowerCase();
    // UX-only edit gate (full ownership enforcement is Phase B0): the module is
    // only shown for a character the viewer may view, so allow opening the
    // quickbar editor (via an empty slot, Phase 4.0i) here.
    const canEdit = role === "gm" || role === "player";
    // Phase 4.1A: which attack_technique (if any) is armed for this character
    // — ephemeral UI state folded in by selectionState.js, never server data
    // by itself (the server re-validates everything at Attack time).
    const armedActionId = state?.snapshot?.armedActionId ?? null;
    // Phase 4.1B.0/4.1B.1/4.1B.2: which direct-ability-attack, instant/self,
    // or directed-target-ability request (if any) is currently in flight —
    // ephemeral UI-only, folded in by selectionState.js exactly like
    // armedActionId above. Each command handler owns its own field; a given
    // action is only ever eligible for ONE of the three execution classes,
    // so merging them into a single prop for QuickbarView is safe — at most
    // one is ever non-null.
    const pendingActionId = state?.snapshot?.pendingDirectAbilityActionId
      ?? state?.snapshot?.pendingInstantAbilityActionId
      ?? state?.snapshot?.pendingDirectedAbilityActionId
      ?? null;
    const openActionId = opts?.openSkillsMenu?.kind === "action"
      ? String(opts.openSkillsMenu.id ?? "").trim() || null
      : null;
    const pendingDeleteId = String(opts?.pendingGmDeleteId ?? "").trim() || null;
    const gmAdmin = role === "gm"
      ? { enabled: true, openActionId, pendingDeleteId }
      : null;
    return panel({ key: "skills", bodyHtml: renderQuickbarStrip(quickbar, { canEdit, armedActionId, pendingActionId, gmAdmin }) });
  }

  const slots = selectQuickSlots(state);
  const selectedId = selectSelectedSkill(state)?.id ?? null;

  // Resolve quick slots → skills, then bucket by semantic category.
  const skills = slots
    .map((slot) => selectSkillById(state, slot.skillId))
    .filter(Boolean);
  const buckets = new Map();
  for (const sk of skills) {
    const k = accentClass(sk.color);
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(sk);
  }

  const groupsHtml = CATEGORY_ORDER
    .filter((c) => buckets.has(c.key))
    .map((c) => `<div class="ohud-skill-group">
      <span class="ohud-group-cap ohud-accent--${c.key}">${esc(c.caption)}</span>
      <div class="ohud-group-tiles">${buckets.get(c.key).map((sk) => skillTile(sk, selectedId)).join("")}</div>
    </div>`)
    .join("");

  const body = groupsHtml
    ? `<div class="ohud-skill-groups">${groupsHtml}</div>`
    : `<div class="ohud-muted-fill">No actions</div>`;

  return panel({ key: "skills", bodyHtml: body });
}
