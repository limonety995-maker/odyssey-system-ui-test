// Combat HUD — target body-zone resolution (PURE: no OBR, no DOM, no Supabase).
//
// perform_attack's canonical contract requires `target_body_part_id` to be a
// REAL per-character `odyssey_character_body_parts` row UUID — verified
// directly against supabase/odyssey_supabase.sql (the query is
// `where b.id = v_target_body_part_id and b.character_id = v_target_character_id`).
// It does NOT accept a generic wire zone code. The HUD's targeting layer only
// knows generic wire zone ids (HEAD/TORSO/LEFT_ARM/...), so this module maps a
// target's OWN body-part rows (fetched via the existing, unmodified
// get_character_runtime_bundle RPC — "combat" section ONLY, no new RPC) into
// { zoneId (wire), bodyPartId (uuid), canBeTargeted } pairs.
//
// Privacy: the "combat" section also carries shield/psi/combat_flags/
// status_summary for the target — none of that is read or kept here. Only
// zoneId + bodyPartId + canBeTargeted survive past this function; the caller
// (targetSelectionController.js) must never store or forward the raw bundle.

import { normalizePartId } from "../runtime/runtimeBundleMapper.js";
import { svgPartToZoneId } from "./targetProfiles.js";

/**
 * @param {object|null} bundle  Raw get_character_runtime_bundle result for the
 *   TARGET character, requested with `sections:["combat"]` only.
 * @returns {Array<{ zoneId:string, bodyPartId:string, canBeTargeted:boolean }>}
 */
export function mapTargetBodyZones(bundle) {
  const combat = bundle?.sections?.combat ?? bundle?.combat ?? null;
  const bodyParts = Array.isArray(combat?.body_parts) ? combat.body_parts : [];
  const out = [];
  for (const bp of bodyParts) {
    const bodyPartId = String(bp?.id ?? "").trim();
    if (!bodyPartId) continue;
    const zoneId = svgPartToZoneId(normalizePartId(bp));
    if (!zoneId) continue;
    const canBeTargeted = bp?.can_be_targeted === false ? false : !(bp?.disabled || bp?.destroyed);
    out.push({ zoneId, bodyPartId, canBeTargeted });
  }
  return out;
}

/** Resolve the real body-part UUID for `zoneId` from a pre-fetched zones list. */
export function resolveBodyPartId(bodyZones, zoneId) {
  if (!Array.isArray(bodyZones) || !zoneId) return null;
  return bodyZones.find((z) => z.zoneId === zoneId)?.bodyPartId ?? null;
}
