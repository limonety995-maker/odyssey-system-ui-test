// Combat HUD — Phase 3E.0 combat-session mapper (PURE).
//
// THE single normalization point between the server's combat runtime
// (combat_get_active_runtime / every mutation RPC's returned runtime) and the
// HUD's `snapshot.combatSession` contract. Whitelist-only: participants carry
// display name, initiative numbers, order and eligibility — NEVER inventory,
// skills, PSI, private body values, hidden statuses, or raw armour.
//
// The emitted shape is a superset of the Phase 0 component contract
// (status/round/currentParticipantId/participants/isViewerTurn — see
// hud/models/combatHudContracts.js createInactiveCombatSession) plus the
// Phase 3E.0 session fields (exists/version/roundNumber/mainAvailable/…).

import { createInactiveCombatSession } from "../models/combatHudContracts.js";

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Map one raw runtime participant row to the safe HUD participant shape. */
function mapParticipant(raw, activeEntryId) {
  const p = raw && typeof raw === "object" ? raw : {};
  const state = p.state && typeof p.state === "object" ? p.state : {};
  const moveCurrent = num(p.move_current);
  const moveMax = num(p.move_max);
  return {
    participantId: p.initiative_entry_id ?? null,
    characterId: p.character_id ?? null,
    // combat runtime rows do not expose the backing token id (the server
    // resolved the newest active link at start time) — kept null, not faked.
    tokenId: null,
    displayName: String(p.display_name ?? ""),
    initiativeRoll: num(p.roll_value),
    initiativeTotal: num(p.initiative_value),
    order: num(p.order_index),
    isCurrent: activeEntryId != null && p.initiative_entry_id === activeEntryId,
    // Eligibility mirrors exactly what the server turn engine can decide
    // (dead → removed, unconscious/skip_turn → skipped) — nothing simulated.
    isEligible: p.is_active !== false && state.is_alive !== false && state.is_conscious !== false,
    isPlayerCharacter: p.character_bucket === "player",
    mainAvailable: num(p.action_current) != null ? num(p.action_current) > 0 : null,
    moveAvailable: moveCurrent != null ? moveCurrent > 0 : null,
    moveCurrent,
    moveMax,
  };
}

/**
 * @param {object|null} runtime  raw combat_get_active_runtime response
 * @param {{ viewerPlayerId?:(string|null), viewerIsGm?:boolean, selectedCharacterId?:(string|null) }} [viewCtx]
 * @returns the HUD combatSession snapshot (inactive shape when no session)
 */
export function mapCombatRuntimeToSession(runtime, viewCtx = {}) {
  const r = runtime && typeof runtime === "object" ? runtime : null;
  const encounter = r?.encounter && typeof r.encounter === "object" ? r.encounter : null;
  if (!r || r.ok === false || !encounter || encounter.status !== "active") {
    return { ...createInactiveCombatSession(), exists: false, version: 0, roundNumber: 0 };
  }

  const activeEntryId = encounter.active_entry_id ?? null;
  const rawParticipants = Array.isArray(r.visible_participants) ? r.visible_participants : [];
  const participants = rawParticipants
    .filter((p) => p && p.is_active !== false)
    .map((p) => mapParticipant(p, activeEntryId));

  const selectedCharacterId = viewCtx.selectedCharacterId ?? null;
  const viewerIsGm = !!viewCtx.viewerIsGm;
  const controlledIds = Array.isArray(r.viewer_controlled_character_ids) ? r.viewer_controlled_character_ids : [];

  const selected = selectedCharacterId
    ? participants.find((p) => p.characterId === selectedCharacterId) ?? null
    : null;
  const currentCharacterId = encounter.active_character_id ?? null;
  const currentParticipant = activeEntryId != null
    ? participants.find((p) => p.participantId === activeEntryId) ?? null
    : null;
  const metersPerCell = num(r?.tactical_grid?.meters_per_cell) ?? 1;
  const isSelectedCharacterTurn = !!selected && selected.isCurrent;
  const viewerControlsSelected = !!selectedCharacterId && controlledIds.includes(selectedCharacterId);
  const isCurrentPlayerTurn = currentCharacterId != null && controlledIds.includes(currentCharacterId);

  const round = num(encounter.current_round) ?? 0;
  return {
    exists: true,
    id: encounter.id ?? null,
    status: "active",
    version: num(encounter.state_version) ?? 0,
    round,        // Phase 0 component contract
    roundNumber: round, // Phase 3E.0 name
    currentParticipantId: activeEntryId,
    currentCharacterId,
    selectedCharacterParticipantId: selected?.participantId ?? null,
    selectedMoveCurrent: selected?.moveCurrent ?? null,
    selectedMoveMax: selected?.moveMax ?? null,
    currentMoveCurrent: currentParticipant?.moveCurrent ?? null,
    currentMoveMax: currentParticipant?.moveMax ?? null,
    metersPerCell,
    isSelectedCharacterTurn,
    isCurrentPlayerTurn,
    // "YOUR TURN" is shown only to the current participant's owner — or to the
    // GM while inspecting that character (existing GM-inspect access model).
    isViewerTurn: isSelectedCharacterTurn && (viewerControlsSelected || viewerIsGm),
    // Server session state ONLY, and actionable only on the selected
    // character's own turn — a WAITING participant always shows spent pips.
    mainAvailable: isSelectedCharacterTurn && selected?.mainAvailable === true,
    moveAvailable: isSelectedCharacterTurn && selected?.moveAvailable === true,
    participants,
  };
}
