// HUD Abilities — Phase 4.0b: ability tooltip/detail content (PURE).
//
// Turns one mapped quick action into the detail lines shown on hover/click.
// Server-provided values only (cost / cooldown / targeting / disabledReason);
// never invents a cause. No inventory/private target data. Returns structured
// lines so the renderer controls markup (and copy-to-clipboard) — this module
// stays DOM-free and unit-testable.
//
// Phase 4.1B.0: a direct-attack-eligible technique (isDirectAttackAbility)
// gets an "Execution: Direct ability attack" line plus target/body-zone
// requirement text (spec §I) and its OWN readiness status — never the raw
// "Attack effect is not supported yet" text the executionReason code would
// otherwise show, since that reason is exactly what MAKES the ability
// direct-attack-eligible in the first place (see
// abilityAvailabilityPolicy.js's isDirectAttackAbility/
// deriveDirectAttackAvailability doc comments for why).
//
// Phase 4.1B.1: an instant/self-eligible action (isInstantSelfAbility) gets
// its own "Execution: Instant (self)" line. Unlike direct-attack, its
// Target/Status lines need NO override — targeting.mode ("self"/"none") and
// state.executionReason/available/disabledReason already read honestly for
// this action class (never tainted the way direct-attack's are), so the
// existing generic lines below are reused verbatim.

import { isDirectAttackAbility, deriveDirectAttackAvailability, isInstantSelfAbility, SLOT_AVAILABILITY } from "./abilityAvailabilityPolicy.js";

const TYPE_LABEL = {
  attack_technique: "Attack technique",
  directed: "Directed action",
  instant: "Instant action",
  toggle: "Toggle",
};

const TARGET_LABEL = {
  self: "Self",
  character: "One character",
  character_body_zone: "One character (body zone)",
  body_part: "One character (body zone)",
  multiple_characters: "Multiple characters",
  point: "Point on map",
  area: "Area",
  none: "No target",
};

// Phase 4.1A.2: canonical executionReason codes (migration 101) → human text.
// The code itself is never shown raw — same "map the code, never the string"
// convention resolveAttackService.js's ERROR_MESSAGES already uses.
const EXECUTION_REASON_LABEL = {
  ACTION_EFFECT_NOT_IMPLEMENTED: "Attack effect is not supported yet.",
};

// Phase 4.1B.0: direct-ability-attack readiness → human text (SLOT_AVAILABILITY
// values from deriveDirectAttackAvailability — never "armed"/"unsupported",
// those two never apply to a direct-attack-eligible action).
const DIRECT_ATTACK_STATUS_LABEL = {
  [SLOT_AVAILABILITY.ready]: "Ready",
  [SLOT_AVAILABILITY.cooldown]: "On cooldown",
  [SLOT_AVAILABILITY.insufficientResource]: "Insufficient resource",
  [SLOT_AVAILABILITY.unavailable]: "Unavailable",
};

function costText(costs) {
  const c = costs ?? {};
  const parts = [];
  if (Number(c.main) > 0) parts.push(`MAIN×${c.main}`);
  if (Number(c.move) > 0) parts.push(`MOVE×${c.move}`);
  if (parts.length === 0) parts.push("No action cost");
  return parts.join(" · ");
}

function resourceText(costs) {
  const c = costs ?? {};
  const parts = [];
  if (Number(c.psi) > 0) parts.push(`PSI ${c.psi}`);
  if (Number(c.charges) > 0) parts.push(`Charges ${c.charges}`);
  return parts.join(" · ");
}

/**
 * Build the ordered tooltip lines for one mapped quick action.
 * Each line is { label, value }; empty/irrelevant lines are omitted.
 * @param {object} action mapped quick action
 * @returns {{ title:string, type:string, lines:{label:string,value:string}[] }}
 */
export function abilityTooltipModel(action) {
  const a = action && typeof action === "object" ? action : {};
  const costs = a.costs ?? {};
  const cooldown = a.cooldown ?? {};
  const targeting = a.targeting ?? {};
  const requirements = a.requirements ?? {};
  const state = a.state ?? {};

  const directAttack = isDirectAttackAbility(a);
  const instantSelf = !directAttack && isInstantSelfAbility(a);
  const lines = [];
  const typeLabel = TYPE_LABEL[a.type] ?? "Action";
  lines.push({ label: "Type", value: typeLabel });

  if (a.fullDescription) lines.push({ label: "Description", value: String(a.fullDescription) });

  if (directAttack) lines.push({ label: "Execution", value: "Direct ability attack" });
  else if (instantSelf) lines.push({ label: "Execution", value: "Instant (self)" });

  lines.push({ label: "Cost", value: costText(costs) });
  const res = resourceText(costs);
  if (res) lines.push({ label: "Resource", value: res });

  if (Number(cooldown.max) > 0) {
    const cur = Number(cooldown.current) || 0;
    lines.push({
      label: "Cooldown",
      value: cur > 0 ? `${cur}/${cooldown.max} ${cooldown.unit ?? "turn"}(s) remaining` : `${cooldown.max} ${cooldown.unit ?? "turn"}(s)`,
    });
  }

  // Spec §I: a direct-attack-eligible technique states its ACTUAL target/
  // body-zone requirement (it always uses Combat Control's own selected
  // target + body zone) rather than the generic targeting.mode label, which
  // otherwise reads the same as any other character-targeted ability.
  lines.push({
    label: "Target",
    value: directAttack ? "Requires a selected target" : (TARGET_LABEL[targeting.mode] ?? String(targeting.mode ?? "—")),
  });
  if (directAttack) lines.push({ label: "Body zone", value: "Uses the selected body zone" });

  const reqParts = [];
  if (requirements.weaponClass) reqParts.push(`Weapon: ${requirements.weaponClass}`);
  if (requirements.conditionSummary) reqParts.push(String(requirements.conditionSummary));
  if (reqParts.length) lines.push({ label: "Requires", value: reqParts.join(" · ") });

  if (directAttack) {
    // An honest execution-status line for a compatible direct attack ability
    // — never the raw executionReason text (which describes why arming it
    // onto a weapon attack is unsupported, not why THIS, separate execution
    // path would fail — see deriveDirectAttackAvailability's doc comment).
    lines.push({ label: "Status", value: DIRECT_ATTACK_STATUS_LABEL[deriveDirectAttackAvailability(a)] ?? "Unavailable" });
  } else if (state.executionReason) {
    // Phase 4.1A.2: executionReason (canonical code, mapped to human text
    // here — never shown raw) takes the "Status" label — it's the more
    // fundamentally important reason (won't change until the server
    // supports the effect, unlike cooldown/resource, which are transient).
    lines.push({ label: "Status", value: EXECUTION_REASON_LABEL[state.executionReason] ?? String(state.disabledReason ?? state.executionReason) });
  } else if (state.available === false && state.disabledReason) {
    lines.push({ label: "Unavailable", value: String(state.disabledReason) });
  } else if (state.active === true) {
    lines.push({ label: "Status", value: "Active" });
  }

  return { title: String(a.name ?? "Action"), type: typeLabel, lines };
}

/**
 * Flatten the tooltip model to plain text lines (for the existing tipAttr()
 * helper and for copy). First line is the title.
 * @param {object} action
 * @returns {string[]}
 */
export function abilityTooltipLines(action) {
  const model = abilityTooltipModel(action);
  return model.lines.map((l) => `${l.label}: ${l.value}`);
}
