// Combat HUD — body-part condition evaluator (PURE: no OBR, no DOM, no Supabase).
//
// Single source of truth for "how bad is this body part", shared by:
//   - the SOURCE's own silhouette (hud/runtime/runtimeBundleMapper.js mapZones)
//   - the TARGET's silhouette (hud/targeting/targetBodyZones.js), whose combat
//     data comes from a narrower, best-effort fetch that can legitimately fail
//     (RLS denial, network) — that must render as "unknown", never "healthy".
//
// Real body-part model (verified against supabase/odyssey_supabase.sql and
// mirrored by the existing Character sheet UI / resolveAttackScreen.js): there
// is NO current/max HP on a body part. Severity is three independent WOUND
// COUNTS (minor/serious/critical), a per-part critical-damage threshold
// (max_critical), a hard disabled/destroyed flag, and a SEPARATE armor track
// (armor_value/armor_critical/armor_max_critical/armor_destroyed) — never
// conflated with body condition here. This mirrors runtimeBundleMapper.js's
// zoneStateFromBodyPart() exactly (that function now delegates to this module
// instead of duplicating the same severity order).
//
// Bugfix-pack audit finding: the server's `disabled` column is NOT a reliable
// "destroyed" signal — every perform-attack critical-damage branch in
// supabase/odyssey_supabase.sql sets `v_new_disabled := true` the moment ANY
// critical wound lands, then only sets `v_new_destroyed := true` once the
// running critical count actually reaches `max_critical`. So a part with
// critical=1 and max_critical=2 already has disabled=true server-side even
// though it is still "critical but functional" — trusting `disabled` alone
// (as this module used to) rendered it as fully destroyed too early. The
// canonical rule below is the real threshold comparison
// (critical >= max_critical); `destroyed` (always threshold-gated at the SQL
// level) is used only as a fallback when a runtime bundle carries no
// threshold at all, and a bare `disabled` flag is never trusted on its own.

export const BODY_CONDITION_STATE = Object.freeze({
  healthy: "healthy",
  minor: "minor",
  serious: "serious",
  critical: "critical",
  disabled: "disabled",
  // Combat data for this body part is missing, not yet fetched, or the fetch
  // was denied (target refresh blocked by RLS/access) — NEVER "healthy".
  unknown: "unknown",
});

/** bodyConditionPolicy state → the CSS-facing ZONE_STATES value used by
 *  hudLayoutModel.zoneStateClass()/hudIcons.humanoidSvg(). "minor" reuses the
 *  existing "wounded" CSS token — no new stylesheet rule needed for it. */
const TO_ZONE_STATE = Object.freeze({
  healthy: "healthy",
  minor: "wounded",
  serious: "serious",
  critical: "critical",
  disabled: "disabled",
  unknown: "unknown",
});

const COLOR_TOKEN = Object.freeze({
  healthy: "--odyssey-hud-zone-healthy",
  minor: "--odyssey-hud-zone-wounded",
  serious: "--odyssey-hud-zone-serious",
  critical: "--odyssey-hud-zone-critical",
  disabled: "--odyssey-hud-zone-disabled",
  unknown: "--odyssey-hud-zone-unknown",
});

const LABEL = Object.freeze({
  healthy: "Healthy",
  minor: "Minor damage",
  serious: "Serious damage",
  critical: "Critical damage",
  disabled: "Disabled",
  unknown: "Unknown",
});

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * @param {{minor?, serious?, critical?, max_critical?, disabled?, destroyed?}|null} bp
 *   A raw body-part row (or null/undefined when data is missing/denied).
 * @returns {{ state:string, zoneState:string, colorToken:string, label:string }}
 */
export function evaluateBodyCondition(bp) {
  if (!bp || typeof bp !== "object") {
    return build(BODY_CONDITION_STATE.unknown);
  }
  const critical = num(bp.critical);
  const maxCritical = Number(bp.max_critical);
  const hasThreshold = Number.isFinite(maxCritical) && maxCritical > 0;
  if (hasThreshold) {
    // Canonical rule: destroyed/disabled ONLY once real critical damage
    // reaches the real per-part threshold — never threshold-1, never a
    // fallback default, never derived from serious damage or armor state.
    if (critical >= maxCritical) return build(BODY_CONDITION_STATE.disabled);
  } else if (bp.destroyed) {
    // No threshold in this runtime bundle to verify against: fall back only
    // to the always-threshold-gated `destroyed` flag — never to `disabled`
    // alone (audited as unreliable, see file header), and never fabricate it.
    return build(BODY_CONDITION_STATE.disabled);
  }
  if (critical > 0) return build(BODY_CONDITION_STATE.critical);
  if (num(bp.serious) > 0) return build(BODY_CONDITION_STATE.serious);
  if (num(bp.minor) > 0) return build(BODY_CONDITION_STATE.minor);
  return build(BODY_CONDITION_STATE.healthy);
}

function build(state) {
  return { state, zoneState: TO_ZONE_STATE[state], colorToken: COLOR_TOKEN[state], label: LABEL[state] };
}

/** The wound-count detail lines for a hover tooltip — ONLY real fields, never
 *  a fabricated current/max fraction (the model has no such field). Empty
 *  array when data is unknown or the part is perfectly healthy (nothing to
 *  report beyond the label itself). */
export function bodyConditionDetailLines(bp) {
  if (!bp || typeof bp !== "object") return [];
  const lines = [];
  // Same threshold rule as evaluateBodyCondition() — a hover tooltip must
  // never say "Disabled"/"Destroyed" for a part the silhouette itself renders
  // as merely "critical" (i.e. never trust a bare, unaudited `disabled` flag).
  if (evaluateBodyCondition(bp).state === BODY_CONDITION_STATE.disabled) {
    lines.push(bp.destroyed ? "Destroyed" : "Disabled");
  }
  if (num(bp.critical) > 0) lines.push(`Critical damage: ${num(bp.critical)}`);
  if (num(bp.serious) > 0) lines.push(`Serious wounds: ${num(bp.serious)}`);
  if (num(bp.minor) > 0) lines.push(`Minor wounds: ${num(bp.minor)}`);
  if (Number.isFinite(Number(bp.armor_value)) && Number(bp.armor_value) > 0) {
    lines.push(`Armor: ${num(bp.armor_value)}`);
  }
  return lines;
}
