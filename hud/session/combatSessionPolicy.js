// Combat HUD — Phase 3E.0 combat-session policy (PURE).
//
// Client-side MIRRORS of the server session gates, used only for UX (disabled
// buttons with the right reason, pre-flight blocks that save a doomed RPC).
// The SERVER (migration 90: perform_attack / load_weapon_profile_magazine /
// combat_* RPCs) remains the sole authority — these functions never grant
// anything the server would deny, and the HUD never trusts them as proof.

/** UI reasons — kept identical to the wording the spec requires. */
export const SESSION_BLOCK_REASONS = Object.freeze({
  waitingForTurn: "Waiting for your turn",
  mainSpent: "MAIN already spent",
  moveSpent: "MOVE already spent",
});

function isActiveSession(session) {
  return !!session && session.exists === true && session.status === "active";
}

function selectedIsParticipant(session) {
  return isActiveSession(session) && session.selectedCharacterParticipantId != null;
}

/**
 * Attack gate for the SELECTED character. Outside a session — or for a
 * non-participant — the legacy free-play behavior applies (not blocked).
 * @returns {{ blocked:boolean, reason:(string|null) }}
 */
export function sessionAttackGate(session) {
  if (!selectedIsParticipant(session)) return { blocked: false, reason: null };
  if (!session.isSelectedCharacterTurn) return { blocked: true, reason: SESSION_BLOCK_REASONS.waitingForTurn };
  if (!session.mainAvailable) return { blocked: true, reason: SESSION_BLOCK_REASONS.mainSpent };
  return { blocked: false, reason: null };
}

/** Reload gate — MOVE economy, same participation rules as the attack gate. */
export function sessionReloadGate(session) {
  if (!selectedIsParticipant(session)) return { blocked: false, reason: null };
  if (!session.isSelectedCharacterTurn) return { blocked: true, reason: SESSION_BLOCK_REASONS.waitingForTurn };
  if (!session.moveAvailable) return { blocked: true, reason: SESSION_BLOCK_REASONS.moveSpent };
  return { blocked: false, reason: null };
}

/** Semantic MOVE tile state — color only, never a number (bugfix pack). Reads
 *  the authoritative combat runtime's move_current/move_max (already mapped
 *  to moveCurrent/moveMax by combatSessionMapper.js) — never MAIN, never the
 *  current turn, never a client-side estimate. Missing/invalid data (no
 *  active session, no tactical-move runtime yet) is honestly "empty", never
 *  a fabricated "full". */
export const MOVE_TILE_STATE = Object.freeze({
  full: "full",
  partial: "partial",
  empty: "empty",
});

export function deriveMoveState(moveCurrent, moveMax) {
  const max = Number(moveMax);
  const cur = Number(moveCurrent);
  if (!Number.isFinite(max) || max <= 0) return MOVE_TILE_STATE.empty;
  if (!Number.isFinite(cur) || cur <= 0) return MOVE_TILE_STATE.empty;
  if (cur >= max) return MOVE_TILE_STATE.full;
  return MOVE_TILE_STATE.partial;
}

/**
 * Whether the END TURN control applies for this viewer right now: the current
 * participant's owner, or the GM inspecting the current participant (the
 * existing GM access model — the server re-checks control either way).
 */
export function canEndTurn(session, viewerRole) {
  if (!isActiveSession(session) || session.currentParticipantId == null) return false;
  const isGm = String(viewerRole ?? "").toLowerCase() === "gm";
  if (isGm && session.isSelectedCharacterTurn) return true;
  return session.isCurrentPlayerTurn === true;
}

/** GM tracker visibility — never rendered for a regular player. */
export function canSeeGmTracker(viewerRole) {
  return String(viewerRole ?? "").toLowerCase() === "gm";
}

/**
 * Build the GM "Start Combat" candidate list from raw get_scene_token_links
 * rows. Safe dedupe rule (mirrors migration 90's server rule): one candidate
 * per character — the most recently updated ACTIVE link wins. Unlinked
 * tokens, deleted characters, and non-player/non-active-NPC buckets never
 * become candidates.
 */
export function buildStartCandidates(links) {
  const rows = Array.isArray(links) ? links : [];
  const byCharacter = new Map();
  for (const row of rows) {
    const character = row?.character;
    if (!character || !character.id) continue; // unlinked token → never a participant
    if (row.is_active === false) continue;
    if (character.is_deleted === true || character.enabled === false) continue;
    if (character.character_bucket !== "player" && character.character_bucket !== "npc_active") continue;
    const existing = byCharacter.get(character.id);
    const updatedAt = Date.parse(row.updated_at ?? "") || 0;
    if (existing && existing.linkUpdatedAt >= updatedAt) continue;
    byCharacter.set(character.id, {
      characterId: character.id,
      tokenId: row.token_id ?? null,
      displayName: String(character.display_name ?? row.token_name ?? ""),
      isPlayerCharacter: character.character_bucket === "player",
      linkUpdatedAt: updatedAt,
    });
  }
  return [...byCharacter.values()]
    .map(({ linkUpdatedAt: _drop, ...candidate }) => candidate)
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

/** Version payload helper: expected_encounter_version only when a session is
 *  active — a legacy (no-session) call must not carry a fake version. */
export function expectedVersionOf(session) {
  return isActiveSession(session) ? session.version : null;
}
