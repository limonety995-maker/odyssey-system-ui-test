// Ability Studio — Phase 4.1C.0: API layer.
//
// Thin wrapper over the existing creator_* RPCs (api/creatorApi.js) plus the
// two new assignment RPCs (migration 109). Every function returns
// { ok, data, code, error } and never throws — same normalized shape the
// combat HUD's resolve*Execution helpers already use (see
// hud/combat/directedAbilityPayload.js#resolveDirectedAbilityExecution) — so
// Ability Studio's UI never has to distinguish "network threw" from
// "RPC returned ok:false". Raw Supabase/network error objects are reduced to
// a plain string via toErrorMessage — never rendered directly.

import * as creatorApi from "./creatorApi.js";
import { getCharacterSpawnCatalog } from "./characterPlacementApi.js";
import { toErrorMessage } from "../utils/errors.js";
import { validateAbilityDraft, buildAbilityPayloadFromDraft } from "../hud/abilities/abilityStudioTemplates.js";

async function callSafe(fn, fallbackMessage) {
  let raw;
  try {
    raw = await fn();
  } catch (error) {
    return { ok: false, data: null, code: null, error: toErrorMessage(error, fallbackMessage) };
  }
  if (!raw || raw.ok === false) {
    return {
      ok: false,
      data: raw ?? null,
      code: raw?.error ?? null,
      error: raw?.message || fallbackMessage,
    };
  }
  return { ok: true, data: raw, code: null, error: null };
}

export function listAbilityCatalog({ search = null } = {}, settings) {
  return callSafe(
    () => creatorApi.listAbilities({ search }, settings),
    "Unable to load ability catalog.",
  );
}

export function getAbilityDetail(abilityId, settings) {
  return callSafe(
    () => creatorApi.getAbility(abilityId, settings),
    "Unable to load ability detail.",
  );
}

// Pure, no RPC — re-exported so screens only import from one module.
export { validateAbilityDraft };

export async function createAbilityFromTemplate(draft, settings) {
  const validation = validateAbilityDraft(draft);
  if (!validation.ok) {
    return { ok: false, data: null, code: "VALIDATION_ERROR", error: validation.errors[0]?.message ?? "Invalid draft.", errors: validation.errors };
  }
  const payload = buildAbilityPayloadFromDraft(draft);
  return callSafe(
    () => creatorApi.upsertAbility(payload, settings),
    "Unable to save ability.",
  );
}

export function assignAbilityToCharacter({ abilityId, characterId }, settings) {
  if (!abilityId || !characterId) {
    return Promise.resolve({
      ok: false,
      data: null,
      code: "VALIDATION_ERROR",
      error: !characterId ? "Select a character first." : "Select an ability first.",
    });
  }
  return callSafe(
    () => creatorApi.assignAbilityToCharacter({ abilityId, characterId }, settings),
    "Unable to assign ability to character.",
  );
}

export function removeAbilityFromCharacter({ characterAbilityId }, settings) {
  return callSafe(
    () => creatorApi.removeCharacterAbility({ characterAbilityId }, settings),
    "Unable to remove ability from character.",
  );
}

export function listAssignableCharacters(payload, settings) {
  return callSafe(
    () => getCharacterSpawnCatalog(payload, settings),
    "Unable to load character list.",
  );
}
