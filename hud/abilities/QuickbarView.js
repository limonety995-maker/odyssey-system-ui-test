// HUD Abilities — Phase 4.0b/4.0e, HUD refine 4.0i: quickbar strip render for
// the Skills module (PURE).
//
// Renders the persisted quickbar as slot tiles: slots 0-9 (1-10) fill the TOP
// row, slots 10-19 (11-20) fill the row BELOW it — matching the Quickbar
// Editor's fixed row order (Phase 4.0c). Each occupied tile shows icon / short
// name / type marker / cooldown / ACTIVE / disabled. There is no separate EDIT
// control (Phase 4.0i): an empty slot IS the editor trigger — clicking one
// dispatches the exact same open-quickbar-editor action the old EDIT button
// used, so there is only ever one editor-opening code path.
//
// This is the ONLY place the Skills module learns about abilities, and it only
// consumes the already-mapped, already-SAFE runtime (hud/abilities/*). Clicking
// a FILLED tile requests a detail tooltip — it NEVER executes or changes
// Target/Action, and never opens the editor.

import { esc, cls, tipAttr } from "../components/hudDom.js";
import { skillIconSvg, ICON_LOCK } from "../components/hudIcons.js";
import { rowOfSlot, FIRST_ROW_SIZE } from "./quickbarLayoutPolicy.js";
import { abilityTooltipLines } from "./AbilityTooltip.js";
import { deriveSlotAvailability, SLOT_AVAILABILITY, isDirectAttackAbility, deriveDirectAttackAvailability, isInstantSelfAbility, isDirectedTargetAbility, isToggleAbility, deriveToggleAvailability } from "./abilityAvailabilityPolicy.js";

// semanticKind → HUD accent class (same accent vocabulary as SkillBlock).
const SEMANTIC_ACCENT = {
  attack: "attack",
  psi: "psionic",
  tech: "implant",
  utility: "neutral",
  intervention: "intervention",
};

// Short type marker shown on the tile corner.
const TYPE_MARK = {
  attack_technique: "ATK",
  directed: "DIR",
  instant: "INS",
  toggle: "TGL",
};

function actionById(runtime, id) {
  if (!id) return null;
  return (runtime.quickActions ?? []).find((a) => a.characterActionId === id) ?? null;
}

function gmDeleteMenu(action, gmAdmin) {
  if (!gmAdmin?.enabled || !action?.characterActionId) return "";
  const open = gmAdmin.openActionId === action.characterActionId;
  const abilityDeletePending = gmAdmin.pendingDeleteId === `ability:${action.characterActionId}`;
  const skillDeletePending = action.characterSkillId && gmAdmin.pendingDeleteId === `skill:${action.characterSkillId}`;
  const currentDeletePending = Boolean(abilityDeletePending || skillDeletePending);

  return `
    <button
      type="button"
      class="${cls("ohud-qb-gm-trigger", open ? "is-open" : "", currentDeletePending ? "is-busy" : "")}"
      data-action="toggle-gm-skill-menu"
      data-action-id="${esc(action.characterActionId)}"
      aria-label="GM skill actions"
      aria-expanded="${open ? "true" : "false"}"
      ${tipAttr("GM actions", ["Delete this ability or its source skill."])}
    >GM</button>
    ${open ? `<div class="ohud-qb-gm-menu" data-gm-menu="skills" data-action-id="${esc(action.characterActionId)}">
      ${action.characterSkillId ? `<button
        type="button"
        class="ohud-qb-gm-menu-btn"
        data-action="gm-delete-skill"
        data-skill-id="${esc(action.characterSkillId)}"
        data-character-skill-id="${esc(action.characterSkillId)}"
        data-action-id="${esc(action.characterActionId)}"
        ${skillDeletePending ? "disabled" : ""}
      >${skillDeletePending ? "Deleting skill..." : "Delete skill"}</button>` : ""}
      <button
        type="button"
        class="ohud-qb-gm-menu-btn is-danger"
        data-action="gm-delete-ability"
        data-action-id="${esc(action.characterActionId)}"
        data-character-skill-id="${action.characterSkillId ? esc(action.characterSkillId) : ""}"
        ${abilityDeletePending ? "disabled" : ""}
      >${abilityDeletePending ? "Deleting ability..." : "Delete ability"}</button>
    </div>` : ""}
  `;
}

// Phase 4.1A.2: one small marker per canonical availability category —
// mutually exclusive (deriveSlotAvailability returns exactly one), so at
// most one of these ever renders. "active" (toggle ON) is orthogonal and
// rendered alongside separately, unchanged from before.
function stateMarkerHtml(availability, action, pending) {
  // Phase 4.1B.0: a direct ability attack in flight — checked BEFORE the
  // canonical availability switch since "pending" isn't itself one of
  // SLOT_AVAILABILITY's values (it's an ephemeral request-in-progress fact,
  // like "armed" is a client-only fact for the weapon-attack channel).
  if (pending) return `<span class="ohud-qb-state ohud-qb-state--pending">…</span>`;
  switch (availability) {
    case SLOT_AVAILABILITY.armed:
      return `<span class="ohud-qb-state ohud-qb-state--armed">ARMED</span>`;
    case SLOT_AVAILABILITY.cooldown:
      return `<span class="ohud-qb-cd">${Number(action.cooldown?.current) || 0}</span>`;
    case SLOT_AVAILABILITY.insufficientResource: {
      const costs = action.costs ?? {};
      const label = Number(costs.psi) > 0 ? `PSI ${costs.psi}` : Number(costs.charges) > 0 ? `CHG ${costs.charges}` : "LOW";
      return `<span class="ohud-qb-state ohud-qb-state--resource">${esc(label)}</span>`;
    }
    case SLOT_AVAILABILITY.unsupported:
    case SLOT_AVAILABILITY.unavailable:
      return `<span class="ohud-qb-state ohud-qb-state--lock" aria-hidden="true">${ICON_LOCK}</span>`;
    default:
      return "";
  }
}

function occupiedTile(slot, action, armedActionId, pendingActionId, gmAdmin) {
  if (!action) {
    // A slot whose action vanished from the library — visible + flagged.
    return `<button type="button" class="${cls("ohud-qb-slot", "is-missing")}" data-action="show-ability-detail" data-slot-index="${slot.slotIndex}" ${tipAttr("Missing action", ["This action is no longer available.", "Open EDIT to remove it."])}>
      <span class="ohud-qb-missing">?</span>
    </button>`;
  }
  const accent = SEMANTIC_ACCENT[action.semanticKind] ?? "neutral";
  const active = action.state?.active === true;
  const mark = TYPE_MARK[action.type] ?? "";

  // Phase 4.1A: an attack_technique slot arms/disarms itself instead of just
  // showing a detail toast — directed/instant/toggle are completely untouched
  // (still show-ability-detail, never execute). Arming is allowed even while
  // the technique looks disabled IF it's already the armed one (so the player
  // can always disarm a technique that became invalid after arming — see
  // CombatHudModule.js's toggle-armed-technique guard).
  //
  // Phase 4.1B.0: a technique whose own effect can't be armed onto a weapon
  // attack (isDirectAttackAbility — see abilityAvailabilityPolicy.js) gets a
  // THIRD, mutually-exclusive click behavior instead: direct execution. A
  // single ability is never both armable and directly-executable — the
  // signal is purely metadata-driven (executionReason), never a name check.
  const isTechnique = action.type === "attack_technique";
  const directAttack = isTechnique && isDirectAttackAbility(action);
  // Phase 4.1B.1: an "instant" action whose targeting doesn't need an
  // external target (self/none) gets its OWN mutually-exclusive click
  // behavior — immediate server-side execution, no arm/disarm, no detail-
  // only click. See abilityAvailabilityPolicy.js's isInstantSelfAbility.
  const instantSelf = !isTechnique && isInstantSelfAbility(action);
  // Phase 4.1B.2: a "directed" action requiring a target character but NO
  // body zone gets its own execution behavior too — mutually exclusive with
  // all of the above (a "directed" action can never also be
  // attack_technique/instant by construction). See isDirectedTargetAbility.
  const directedTarget = !isTechnique && !instantSelf && isDirectedTargetAbility(action);
  // Phase 4.1B.3: a "toggle" action gets its own mutually-exclusive click
  // behavior too — mutually exclusive with all of the above by construction
  // (an ability's server-derived `type` is exactly one value). See
  // abilityAvailabilityPolicy.js's isToggleAbility.
  const toggleAbility = !isTechnique && !instantSelf && !directedTarget && isToggleAbility(action);
  const armed = isTechnique && !directAttack && armedActionId != null && armedActionId === action.characterActionId;
  const pending = (directAttack || instantSelf || directedTarget || toggleAbility) && pendingActionId != null && pendingActionId === action.characterActionId;
  // Phase 4.1A.2: canonical category driving the state marker below — armed
  // takes visual priority (see abilityAvailabilityPolicy.js's doc comment)
  // even when the underlying ability also looks disabled. Direct-attack tiles
  // use their OWN derivation (deriveDirectAttackAvailability), which does not
  // treat this ability's "can't be armed" flag as "unsupported" (see that
  // function's doc comment for why). Instant/self and directed-target tiles
  // reuse deriveSlotAvailability UNCHANGED — their available/
  // executionAvailable fields are never tainted the way direct-attack's are.
  // Toggle tiles use their OWN derivation (deriveToggleAvailability) so an
  // already-active toggle stays clickable (to turn off, always free) even
  // while on cooldown or resource-insufficient.
  const availability = directAttack
    ? deriveDirectAttackAvailability(action)
    : toggleAbility
      ? deriveToggleAvailability(action)
      : deriveSlotAvailability(action, armed);
  // Server-truth for non-direct-attack tiles: available now factors in
  // cooldown/resource sufficiency/effect support (migration 101), so this
  // dimming class is honestly correct for every non-ready state. Direct-
  // attack tiles instead dim on their own derived availability (never
  // "unsupported" — see deriveDirectAttackAvailability) or while pending.
  // Instant/self and directed-target tiles dim on the SAME server-truth
  // `available` flag (like any other non-direct-attack action), or while
  // pending — directed-target tiles are NEVER disabled just because no
  // target is currently selected (spec: target validation happens on click,
  // not as a permanent disabled state, so a READY ability with no target
  // selected yet still LOOKS clickable and the "Select a target first."
  // error surfaces from the click itself).
  const disabled = directAttack
    ? (availability !== SLOT_AVAILABILITY.ready || pending)
    : toggleAbility
      ? (availability !== SLOT_AVAILABILITY.ready || pending)
      : (action.state?.available === false || ((instantSelf || directedTarget) && pending));
  const dataAction = directAttack
    ? "execute-direct-ability"
    : instantSelf
      ? "execute-instant-ability"
      : directedTarget
        ? "execute-directed-ability"
        : toggleAbility
          ? "execute-toggle-ability"
          : (isTechnique ? "toggle-armed-technique" : "show-ability-detail");
  const tip = tipAttr(action.name, [
    ...abilityTooltipLines(action),
    directAttack
      ? (pending ? "Executing…" : "Direct ability attack — uses selected target and body zone")
      : instantSelf
        ? (pending ? "Executing…" : "Instant ability — no target required")
        : directedTarget
          ? (pending ? "Executing…" : "Directed ability — uses selected target, no body zone required")
          : toggleAbility
            ? (pending ? "Executing…" : (active ? "Toggle ability — click to deactivate" : "Toggle ability — click to activate"))
            : isTechnique ? (armed ? "Prepared for next attack" : "Click to arm for your next attack") : "",
  ]);

  // The state marker and the (orthogonal) active/ON marker share one
  // top-right badge group — wrapped together (rather than each absolutely
  // positioned on its own) so neither ever renders on top of the other.
  const stateMarker = stateMarkerHtml(availability, action, pending);
  const activeMarker = active ? `<span class="ohud-qb-active">ON</span>` : "";
  const badges = stateMarker || activeMarker
    ? `<span class="ohud-qb-badges">${stateMarker}${activeMarker}</span>`
    : "";
  const tile = `<button type="button" class="${cls("ohud-qb-slot", `ohud-accent--${accent}`, disabled ? "is-disabled" : "", active ? "is-active" : "", armed ? "is-armed" : "", pending ? "is-pending" : "")}" data-action="${dataAction}" data-action-id="${esc(action.characterActionId)}" data-slot-index="${slot.slotIndex}" data-slot-state="${availability}"${tip}>
    <span class="ohud-qb-icon">${skillIconSvg(action.iconKey)}</span>
    <span class="ohud-qb-name">${esc(action.name)}</span>
    ${mark ? `<span class="ohud-qb-type">${esc(mark)}</span>` : ""}
    ${badges}
  </button>`;
  if (!gmAdmin?.enabled) return tile;
  return `<div class="ohud-qb-card" data-qb-card="${esc(action.characterActionId)}">${tile}${gmDeleteMenu(action, gmAdmin)}</div>`;
}

// An empty slot doubles as the open-editor trigger (Phase 4.0i) — same
// data-action the old EDIT button used, so CombatHudModule.js needs no new
// command or dispatch case. When editing isn't allowed, it stays an inert,
// non-interactive placeholder (parity with the old canEdit-gated EDIT button).
function emptyTile(slotIndex, canEdit) {
  if (!canEdit) {
    return `<div class="${cls("ohud-qb-slot", "is-empty")}" data-slot-index="${slotIndex}" aria-hidden="true"></div>`;
  }
  return `<button type="button" class="${cls("ohud-qb-slot", "is-empty", "is-editable")}" data-action="open-quickbar-editor" data-slot-index="${slotIndex}" aria-label="Open quickbar editor"${tipAttr("Edit quickbar", ["Assign, reorder or remove actions."])}></button>`;
}

/**
 * Render the quickbar strip body for the Skills module.
 * @param {object} runtime mapped abilities runtime (snapshot.quickbar)
 * @param {{ canEdit?: boolean, armedActionId?: (string|null), pendingActionId?: (string|null) }} [opts]
 * @returns {string} HTML for the panel body
 */
export function renderQuickbarStrip(runtime, opts = {}) {
  const rt = runtime && typeof runtime === "object" ? runtime : { quickActions: [], quickbar: { slots: [], maxSlots: FIRST_ROW_SIZE } };
  const slots = Array.isArray(rt.quickbar?.slots) ? rt.quickbar.slots : [];
  const canEdit = opts.canEdit !== false;
  const armedActionId = opts.armedActionId ?? null;
  // Phase 4.1B.0: the ONE direct-ability-attack request currently in flight
  // (if any) — a slot-scoped pending state, never a whole-strip disable, so
  // unrelated abilities/weapon-attack stay fully interactive while one
  // request resolves (spec §D: "other unrelated HUD state remains stable").
  const pendingActionId = opts.pendingActionId ?? null;
  const gmAdmin = opts.gmAdmin && opts.gmAdmin.enabled
    ? {
        enabled: true,
        openActionId: opts.gmAdmin.openActionId ?? null,
        pendingDeleteId: opts.gmAdmin.pendingDeleteId ?? null,
      }
    : null;

  // Group slots by row; render rows in ASCENDING order so row 0 (slots 1-10)
  // is on TOP and row 1 (slots 11-20) is BELOW it — matching the Quickbar
  // Editor's fixed row order. A second row only appears here at all when the
  // runtime actually has slots in it (rows.get(1) is simply absent otherwise).
  const rows = new Map();
  for (const slot of slots) {
    const r = rowOfSlot(slot.slotIndex);
    if (!rows.has(r)) rows.set(r, []);
    rows.get(r).push(slot);
  }
  const rowKeys = [...rows.keys()].sort((a, b) => a - b);

  const rowsHtml = rowKeys.map((r) => {
    const tiles = rows.get(r)
      .sort((a, b) => a.slotIndex - b.slotIndex)
      .map((slot) => {
        if (slot.empty || slot.characterActionId == null) return emptyTile(slot.slotIndex, canEdit);
        return occupiedTile(slot, actionById(rt, slot.characterActionId), armedActionId, pendingActionId, gmAdmin);
      })
      .join("");
    return `<div class="ohud-qb-row" data-row="${r}">${tiles}</div>`;
  }).join("");

  // No slots at all (fresh character, no layout saved yet) is itself an
  // "empty" state — it gets the same open-editor trigger as any empty tile,
  // rather than a dead-end message.
  const body = slots.length
    ? `<div class="ohud-qb">${rowsHtml}</div>`
    : canEdit
      ? `<button type="button" class="ohud-qb ohud-qb--empty ohud-qb--empty-clickable" data-action="open-quickbar-editor" aria-label="Open quickbar editor"${tipAttr("Edit quickbar", ["No actions assigned yet — click to add some."])}><div class="ohud-muted-fill">No quickbar actions</div></button>`
      : `<div class="ohud-qb ohud-qb--empty"><div class="ohud-muted-fill">No quickbar actions</div></div>`;

  return `<div class="ohud-qb-wrap">${body}</div>`;
}
