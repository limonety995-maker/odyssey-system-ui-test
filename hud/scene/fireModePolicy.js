// Combat HUD — weapon fire-mode switch policy (PURE).
//
// Small, pure helpers extracted from sceneSelectionController's fire-mode
// command handling, mirroring reloadPolicy.js. No OBR, no DOM, no Supabase.
//
// Server truth: `switch_weapon_fire_mode(p_character_id, p_weapon_id,
// p_fire_mode_id)` is an EXISTING canonical RPC (see api/weaponApi.js
// switchWeaponFireMode, constants/rpcNames.js WEAPON_RPC_NAMES.switchWeaponFireMode).
// Unlike loadWeaponProfileMagazine, it does not return `{ok:false, ...}` on
// validation failure — it `raise exception`s (weapon not found / fire mode not
// allowed for the active profile), so callers must catch, not check `.ok`.

/**
 * Which update path a fire-mode switch will use for the given weapon view
 * model. Always "server" once a weapon + active profile are resolved, because
 * the canonical `switch_weapon_fire_mode` RPC already exists — there is no
 * ephemeral-only fallback needed in this codebase. Kept as an explicit function
 * (not a hardcoded "server" string) so a future weapon shape missing an id
 * degrades honestly to "unavailable" instead of attempting a doomed RPC call.
 *
 * @param {{ id?: (string|null), activeProfileId?: (string|null) } | null} weapon
 * @returns {"server"|"unavailable"}
 */
export function resolveFireModeUpdatePath(weapon) {
  if (!weapon?.id || !weapon?.activeProfileId) return "unavailable";
  return "server";
}

/**
 * Normalize a fire-mode switch outcome into the compact `{ ok, error, message }`
 * shape both the `?debug=1` diagnostics and the commandStatus toast are built
 * from. `switch_weapon_fire_mode` either resolves (success) or throws (any
 * failure) — there is no `{ok:false}` success-shaped rejection to detect.
 *
 * @param {Error|{message?:string}|null} error  null when the RPC resolved.
 * @returns {{ ok: boolean, error: (string|null), message: (string|null) }}
 */
export function normalizeFireModeRpcResult(error) {
  if (!error) return { ok: true, error: null, message: null };
  return {
    ok: false,
    error: "RPC_EXCEPTION",
    message: String(error?.message ?? error ?? "Fire mode switch failed."),
  };
}
