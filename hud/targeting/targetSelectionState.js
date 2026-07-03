// Combat HUD — Phase 3B target-selection state model (PURE).
//
// No OBR, no DOM, no Supabase, no localStorage. Just the normalized, EPHEMERAL
// target-picking state + the pure reducers that move between idle/picking,
// resolve a target candidate, select a hit zone, clear the target, and react to
// the active (source) character changing. Plus the broadcast trimming helper and
// a defensive wire normalizer.
//
// State lifecycle: lives only in the targeting controller's memory for the
// current client. It is NEVER persisted (no localStorage), NEVER written to
// Supabase, and NEVER written to OBR/token metadata. It is invisible to other
// players.

import { DEFAULT_PROFILE_ID, getDefaultZoneId, isValidZoneId } from "./targetProfiles.js";
import { resolveBodyPartId } from "./targetBodyZones.js";

/** Targeting modes (string values are part of the broadcast wire contract). */
export const TARGETING_MODE = Object.freeze({
  idle: "idle",
  picking: "picking",
});

/** Machine-readable error/reason codes (UI maps these; never localise from here). */
export const TARGETING_ERROR = Object.freeze({
  noSource: "NO_READY_SOURCE",
  selfTarget: "CANNOT_TARGET_SELF",
  notLinked: "TOKEN_NOT_LINKED",
  noToken: "NO_TOKEN",
  fetchFailed: "TARGET_LINK_FETCH_FAILED",
});

function str(v) {
  const s = String(v ?? "").trim();
  return s || null;
}

function normalizeSource(raw) {
  return {
    tokenId: str(raw?.tokenId),
    characterId: str(raw?.characterId),
    characterName: str(raw?.characterName),
  };
}

/** A source is "ready" only when it has both a token and a resolved character. */
export function isSourceReady(source) {
  return Boolean(source && source.tokenId && source.characterId);
}

function noError() {
  return { code: null, message: null };
}

/** The empty, idle starting state. */
export function createInitialTargetState() {
  return {
    mode: TARGETING_MODE.idle,
    source: { tokenId: null, characterId: null, characterName: null },
    target: null,
    error: noError(),
  };
}

/**
 * Begin target picking. Only allowed from a READY source (a valid owned
 * controlled character). An existing target is preserved (cancel restores it).
 * Without a ready source the state stays idle and records a NO_READY_SOURCE error.
 */
export function startPicking(state) {
  const s = state ?? createInitialTargetState();
  if (!isSourceReady(s.source)) {
    return { ...s, mode: TARGETING_MODE.idle, error: { code: TARGETING_ERROR.noSource, message: null } };
  }
  if (s.mode === TARGETING_MODE.picking) return s;
  return { ...s, mode: TARGETING_MODE.picking, error: noError() };
}

/** Cancel picking → back to idle. The previously selected target is unchanged. */
export function cancelPicking(state) {
  const s = state ?? createInitialTargetState();
  if (s.mode !== TARGETING_MODE.picking) return s;
  return { ...s, mode: TARGETING_MODE.idle };
}

/**
 * Commit a resolved target candidate. Always returns to idle and resets the hit
 * zone to the profile default (a new target starts at TORSO).
 *
 * @param {{ tokenId:string, characterId?:string|null, displayName?:string,
 *           profileId?:string, distance?:({value:number,unit:string}|null),
 *           bodyZones?: Array<{zoneId:string, bodyPartId:string, canBeTargeted:boolean}> }} candidate
 */
export function applyResolvedTarget(state, candidate) {
  const s = state ?? createInitialTargetState();
  if (!candidate || !str(candidate.tokenId)) return s;
  const profileId = str(candidate.profileId) ?? DEFAULT_PROFILE_ID;
  return {
    ...s,
    mode: TARGETING_MODE.idle,
    target: {
      tokenId: String(candidate.tokenId),
      characterId: str(candidate.characterId),
      displayName: str(candidate.displayName) ?? "Target",
      profileId,
      selectedZoneId: getDefaultZoneId(profileId),
      distance: normalizeDistance(candidate.distance),
      // Basic Weapon Attack v1: the target's own body-part row ids (zoneId →
      // uuid), needed to satisfy perform_attack's target_body_part_id
      // contract. Fetched via the existing get_character_runtime_bundle RPC
      // ("combat" section only — see targetBodyZones.js). NEVER broadcast as
      // a raw list (see buildTargetingBroadcast below) — only the resolved id
      // for the CURRENTLY selected zone ever leaves this module.
      bodyZones: Array.isArray(candidate.bodyZones) ? candidate.bodyZones : [],
    },
    error: noError(),
  };
}

/** Clear the current target. Zone resets implicitly (next target → default). */
export function clearTarget(state) {
  const s = state ?? createInitialTargetState();
  return { ...s, mode: TARGETING_MODE.idle, target: null, error: noError() };
}

/**
 * Select a hit zone on the current target. Changes ONLY selectedZoneId, and only
 * when there is a target and the zone is valid for its profile. No-op otherwise.
 */
export function selectZone(state, zoneId) {
  const s = state ?? createInitialTargetState();
  if (!s.target) return s;
  const id = str(zoneId);
  if (!id || !isValidZoneId(s.target.profileId, id)) return s;
  if (s.target.selectedZoneId === id) return s;
  return { ...s, target: { ...s.target, selectedZoneId: id } };
}

/**
 * React to the active (source) character coming from the Phase 3A selection.
 * - When the source CHARACTER changes (or is lost) the old target is cleared and
 *   the zone resets (the target never carries over to a new character).
 * - A lost/invalid source also leaves picking (back to idle).
 * - The same source character is a no-op for the target.
 */
export function applySource(state, rawSource) {
  const s = state ?? createInitialTargetState();
  const source = normalizeSource(rawSource);
  const prevCharId = s.source?.characterId ?? null;
  const nextCharId = source.characterId ?? null;
  const characterChanged = nextCharId !== prevCharId;
  const ready = isSourceReady(source);

  if (!characterChanged && ready) {
    // Same character, still valid: refresh token/name only (no target change).
    return { ...s, source };
  }
  // Character changed or source lost → drop the target, reset to idle.
  return {
    ...s,
    mode: TARGETING_MODE.idle,
    source,
    target: null,
    error: noError(),
  };
}

function normalizeDistance(distance) {
  if (!distance || typeof distance !== "object") return null;
  const value = Number(distance.value);
  const unit = str(distance.unit);
  if (!Number.isFinite(value) || !unit) return null;
  return { value, unit };
}

/**
 * Validate a target candidate token id against the source BEFORE any private
 * data is fetched. Pure, synchronous.
 * @returns {{ ok:true } | { ok:false, code:string }}
 */
export function validateCandidate({ tokenId, sourceTokenId } = {}) {
  const id = str(tokenId);
  if (!id) return { ok: false, code: TARGETING_ERROR.noToken };
  if (id === str(sourceTokenId)) return { ok: false, code: TARGETING_ERROR.selfTarget };
  return { ok: true };
}

/**
 * Extract the active character link for a token from a getSceneTokenLinks
 * result. Returns { characterId, characterName } or null (unlinked → rejected).
 * Uses ONLY the token-link layer — never token metadata.
 */
export function extractTokenLink(linkResult, tokenId) {
  if (!linkResult || linkResult.ok === false) return null;
  const links = Array.isArray(linkResult.links) ? linkResult.links : [];
  const match = links.find(
    (l) => String(l?.token_id ?? "") === String(tokenId) && l?.is_active !== false,
  );
  if (!match || !match.character) return null;
  return {
    characterId: str(match.character.id),
    characterName: str(match.character.display_name) ?? str(match.character.name),
  };
}

/**
 * Trim the in-memory state for LOCAL broadcast to the Combat Control iframe.
 * Only map-level / generic data is shipped — no private runtime bundle, no
 * hidden stats. (Mirrors the shape consumed by TargetBlock.)
 */
export function buildTargetingBroadcast(state) {
  const s = state ?? createInitialTargetState();
  return {
    mode: s.mode === TARGETING_MODE.picking ? TARGETING_MODE.picking : TARGETING_MODE.idle,
    source: {
      tokenId: s.source?.tokenId ?? null,
      characterId: s.source?.characterId ?? null,
      characterName: s.source?.characterName ?? null,
    },
    target: s.target
      ? {
          tokenId: s.target.tokenId,
          characterId: s.target.characterId ?? null,
          displayName: s.target.displayName,
          profileId: s.target.profileId,
          selectedZoneId: s.target.selectedZoneId,
          distance: s.target.distance ?? null,
          // Resolved fresh from bodyZones on every broadcast (never stale) —
          // the raw bodyZones list itself is NOT shipped over the wire.
          resolvedBodyPartId: resolveBodyPartId(s.target.bodyZones, s.target.selectedZoneId),
        }
      : null,
    error: { code: s.error?.code ?? null, message: s.error?.message ?? null },
  };
}

/** Defensive normalize for a targeting payload received over the broadcast wire. */
export function normalizeTargetingPayload(raw) {
  if (!raw || typeof raw !== "object") return null;
  const mode = raw.mode === TARGETING_MODE.picking ? TARGETING_MODE.picking : TARGETING_MODE.idle;
  const target = raw.target && typeof raw.target === "object"
    ? {
        tokenId: String(raw.target.tokenId ?? ""),
        characterId: raw.target.characterId ?? null,
        displayName: String(raw.target.displayName ?? "Target"),
        profileId: String(raw.target.profileId ?? DEFAULT_PROFILE_ID),
        selectedZoneId: String(raw.target.selectedZoneId ?? getDefaultZoneId(raw.target.profileId)),
        distance: normalizeDistance(raw.target.distance),
        resolvedBodyPartId: raw.target.resolvedBodyPartId ?? null,
      }
    : null;
  return {
    mode,
    source: {
      tokenId: raw.source?.tokenId ?? null,
      characterId: raw.source?.characterId ?? null,
      characterName: raw.source?.characterName ?? null,
    },
    target,
    error: { code: raw.error?.code ?? null, message: raw.error?.message ?? null },
  };
}

/**
 * Stale-request protection for target resolving. Every resolve takes a
 * monotonically increasing token; only the latest may commit. (Same contract as
 * the Phase 3A generation gate — duplicated here so the targeting layer stays
 * self-contained and independently testable.)
 */
export function createTargetGenerationGate() {
  let current = 0;
  return {
    next() { current += 1; return current; },
    isCurrent(token) { return token === current; },
    get current() { return current; },
  };
}
