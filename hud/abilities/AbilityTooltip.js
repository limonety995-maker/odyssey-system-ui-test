// HUD Abilities — Phase 4.0b: ability tooltip/detail content (PURE).
//
// Turns one mapped quick action into the detail lines shown on hover/click.
// Server-provided values only (cost / cooldown / targeting / disabledReason);
// never invents a cause. No inventory/private target data. Returns structured
// lines so the renderer controls markup (and copy-to-clipboard) — this module
// stays DOM-free and unit-testable.

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

  const lines = [];
  const typeLabel = TYPE_LABEL[a.type] ?? "Action";
  lines.push({ label: "Type", value: typeLabel });

  if (a.fullDescription) lines.push({ label: "Description", value: String(a.fullDescription) });

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

  lines.push({ label: "Target", value: TARGET_LABEL[targeting.mode] ?? String(targeting.mode ?? "—") });

  const reqParts = [];
  if (requirements.weaponClass) reqParts.push(`Weapon: ${requirements.weaponClass}`);
  if (requirements.conditionSummary) reqParts.push(String(requirements.conditionSummary));
  if (reqParts.length) lines.push({ label: "Requires", value: reqParts.join(" · ") });

  // Phase 4.1A.2: executionReason (canonical code, mapped to human text here —
  // never shown raw) takes the "Status" label — it's the more fundamentally
  // important reason (won't change until the server supports the effect,
  // unlike cooldown/resource, which are transient). Any other disabled
  // reason still shows as "Unavailable"; the server-provided text is used
  // verbatim (never re-derived), shown last.
  if (state.executionReason) {
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
