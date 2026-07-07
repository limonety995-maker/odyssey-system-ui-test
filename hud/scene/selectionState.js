// Combat HUD — Phase 3A / 3A.1 scene-selection state model (PURE).
//
// No OBR, no DOM, no Supabase, no fetch. Just the normalized selection-state
// shape + the single reducer that turns raw inputs (viewer · selection ids ·
// token link · runtime bundle · failure) into one canonical state, plus the
// stale-request gate and the broadcast trimming helper.
//
// This file is the unit-tested heart of Phase 3A/3A.1 and loads under plain Node.

import { buildRuntimeDebugSummary, mapBundleToHudSnapshot } from "../runtime/runtimeBundleMapper.js";
import { resolveReloadMagazineId } from "./reloadPolicy.js";
import { resolveFireModeUpdatePath } from "./fireModePolicy.js";
import { evaluateBasicAttack } from "../combat/basicAttackPolicy.js";
import { buildBasicAttackCtx, buildAttackPayload } from "../combat/basicAttackPayload.js";
import { mapCombatRuntimeToSession } from "../session/combatSessionMapper.js";
import { sessionAttackGate } from "../session/combatSessionPolicy.js";

/** Canonical selection statuses (string values are part of the wire contract). */
export const SELECTION_STATUS = Object.freeze({
  ready: "ready",
  loading: "loading",
  noSelection: "no-selection",
  multipleSelection: "multiple-selection",
  unlinkedToken: "unlinked-token",
  notOwned: "not-owned",
  unavailable: "unavailable",
  error: "error",
});

/** Machine-readable access reasons (never localise from these — UI maps them). */
export const ACCESS_REASON = Object.freeze({
  noToken: "NO_TOKEN_SELECTED",
  multipleTokens: "MULTIPLE_TOKENS_SELECTED",
  noLink: "TOKEN_HAS_NO_CHARACTER",
  notOwner: "CHARACTER_NOT_CONTROLLED_BY_VIEWER",
  ownershipUnverifiable: "OWNERSHIP_UNVERIFIABLE",
  backendUnconfigured: "BACKEND_UNCONFIGURED",
  runtimeUnavailable: "RUNTIME_UNAVAILABLE",
});

/** The Player module is always present; the rest appear only when ready. */
export const PRIMARY_MODULE_ID = "player";
export const SECONDARY_MODULE_IDS = Object.freeze(["gun", "skills", "combatControl", "log"]);

export function isReadyStatus(status) {
  return status === SELECTION_STATUS.ready;
}

/** Normalize an OBR selection array → clean, de-duplicated id strings. */
export function normalizeSelectionIds(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const v of raw) {
    const s = String(v ?? "").trim();
    if (s && !seen.has(s)) { seen.add(s); out.push(s); }
  }
  return out;
}

/** Normalize a viewer identity. role → PLAYER | GM | UNKNOWN. */
export function normalizeViewer(raw) {
  const playerId = String(raw?.playerId ?? raw?.id ?? "").trim() || null;
  let role = String(raw?.role ?? "").trim().toUpperCase();
  if (role !== "PLAYER" && role !== "GM") role = "UNKNOWN";
  return { playerId, role };
}

function emptyState(status, viewer, reason, extra) {
  return {
    status,
    selectedItemId: null,
    characterId: null,
    viewer: normalizeViewer(viewer),
    access: { canView: false, reason: reason ?? null },
    runtimeBundle: null,
    view: null,
    error: { code: null, message: null },
    ...extra,
  };
}

/** Initial state before any resolve has completed. */
export function createInitialSelectionState(viewer) {
  return emptyState(SELECTION_STATUS.loading, viewer, null);
}

/**
 * Build the conservative, render-only view from a runtime bundle. We surface
 * ONLY unambiguous identity/status fields — never fabricated gameplay values.
 */
function buildView(bundle, viewer) {
  const character = bundle?.character ?? {};
  const state = bundle?.state ?? {};
  const ownerId = String(character.owner_player_id ?? "").trim() || null;
  return {
    name: String(character.display_name ?? character.character_key ?? "").trim() || null,
    characterKey: character.character_key ?? null,
    ownerName: String(character.owner_player_name ?? "").trim() || null,
    ownerPlayerId: ownerId,
    gmView: viewer.role === "GM",
    isAlive: state.is_alive !== false,
    isConscious: state.is_conscious !== false,
    statusSummary: String(state.status_summary ?? "").trim() || null,
  };
}

/**
 * The single reducer. Inputs are already-fetched values (or a failure marker);
 * no I/O happens here.
 *
 * @param {{
 *   viewer: object,
 *   selectionIds: string[],
 *   link?: { characterId: string|null, characterName?: string|null } | null,
 *   bundle?: object | null,
 *   failure?: { status: "error"|"unavailable", code: string, message: string } | null,
 * }} input
 */
export function deriveSelectionState(input) {
  const viewer = normalizeViewer(input?.viewer);
  const ids = normalizeSelectionIds(input?.selectionIds);
  const single = ids.length === 1 ? ids[0] : null;

  // Hard failure (fetch threw / backend unconfigured / bundle not ok).
  if (input?.failure) {
    const f = input.failure;
    return emptyState(f.status === "unavailable" ? SELECTION_STATUS.unavailable : SELECTION_STATUS.error, viewer, f.code, {
      selectedItemId: single,
      characterId: input?.link?.characterId ?? null,
      error: { code: f.code ?? null, message: f.message ?? null },
    });
  }

  if (ids.length === 0) return emptyState(SELECTION_STATUS.noSelection, viewer, ACCESS_REASON.noToken);
  if (ids.length > 1) return emptyState(SELECTION_STATUS.multipleSelection, viewer, ACCESS_REASON.multipleTokens);

  const link = input?.link ?? null;
  if (!link || !link.characterId) {
    return emptyState(SELECTION_STATUS.unlinkedToken, viewer, ACCESS_REASON.noLink, { selectedItemId: single });
  }

  const bundle = input?.bundle ?? null;
  if (!bundle || bundle.ok === false) {
    return emptyState(SELECTION_STATUS.unavailable, viewer, ACCESS_REASON.runtimeUnavailable, {
      selectedItemId: single,
      characterId: link.characterId,
      error: { code: bundle?.error ?? ACCESS_REASON.runtimeUnavailable, message: bundle?.message ?? null },
    });
  }

  const ownerId = String(bundle.character?.owner_player_id ?? "").trim() || null;

  // GM may view any linked character (UI/UX only; not a server authorization).
  if (viewer.role === "GM") {
    return readyState(viewer, single, link.characterId, bundle);
  }

  // Players: the ONLY identifier is owner_player_id. No name-based fallback.
  if (!ownerId) {
    return emptyState(SELECTION_STATUS.unavailable, viewer, ACCESS_REASON.ownershipUnverifiable, {
      selectedItemId: single,
      characterId: link.characterId,
      error: { code: ACCESS_REASON.ownershipUnverifiable, message: "Runtime bundle did not provide owner_player_id." },
    });
  }
  if (ownerId !== viewer.playerId) {
    // Not owned → neutral, no character data revealed.
    return emptyState(SELECTION_STATUS.notOwned, viewer, ACCESS_REASON.notOwner, {
      selectedItemId: single,
      characterId: link.characterId,
    });
  }
  return readyState(viewer, single, link.characterId, bundle);
}

function readyState(viewer, selectedItemId, characterId, bundle) {
  return {
    status: SELECTION_STATUS.ready,
    selectedItemId,
    characterId,
    viewer,
    access: { canView: true, reason: null },
    runtimeBundle: bundle,
    view: buildView(bundle, viewer),
    error: { code: null, message: null },
  };
}

/**
 * Trim a resolved state for LOCAL broadcast to module iframes:
 *  - never ship the full runtime bundle across the wire;
 *  - never include character data unless ready & viewer canView
 *    (so not-owned/unlinked leak nothing);
 *  - Phase 3A.1: attach a normalized HUD snapshot (gun/skills/modifiers/log)
 *    so module iframes render real data without additional RPC calls.
 */
/**
 * Compact, privacy-safe reload diagnostics for `?debug=1` only. Never includes
 * the armory/inventory bundle — only the handful of ids/values needed to
 * compare the HUD's reload path against Character → Inventory's. PURE.
 */
function buildReloadDebugInfo(hudSnapshot, ephemeral) {
  const weapon = hudSnapshot?.weapon?.primary ?? null;
  const reserve = Array.isArray(weapon?.reserveMagazines) ? weapon.reserveMagazines : [];
  const insertedId = weapon?.loadedMagazine?.id ?? null;
  const selectedId = ephemeral.selectedReloadMagazineId ?? null;
  const selectedMag = selectedId ? (reserve.find((m) => m.id === selectedId) ?? null) : null;
  const profileId = weapon?.activeProfileId ?? null;
  // The candidate actually used if Reload were clicked right now — the SAME
  // shared policy sceneSelectionController's "reload" command handler uses.
  const candidateMagId = resolveReloadMagazineId(null, ephemeral, weapon);

  let reloadUiAllowed = true;
  let reloadUiBlockReason = null;
  if (!weapon) { reloadUiAllowed = false; reloadUiBlockReason = "NO_WEAPON"; }
  else if (!weapon.usesMagazine) { reloadUiAllowed = false; reloadUiBlockReason = "WEAPON_DOES_NOT_USE_MAGAZINE"; }
  else if (!weapon.id) { reloadUiAllowed = false; reloadUiBlockReason = "MISSING_WEAPON_ID"; }
  else if (!profileId) { reloadUiAllowed = false; reloadUiBlockReason = "MISSING_PROFILE_ID"; }
  else if (!candidateMagId) { reloadUiAllowed = false; reloadUiBlockReason = "NO_ELIGIBLE_MAGAZINE"; }

  return {
    selectedWeaponId: weapon?.id ?? null,
    selectedWeaponProfileId: profileId,
    selectedReloadMagazineId: candidateMagId,
    selectedReloadMagazine: selectedMag
      ? {
          rounds: selectedMag.current,
          capacity: selectedMag.max,
          caliber: selectedMag.caliber,
          isInserted: selectedMag.id === insertedId,
          isCompatible: true, // present in the eligibility-filtered reserve list
        }
      : null,
    reloadUiAllowed,
    reloadUiBlockReason,
    reloadPayload: (weapon?.id && profileId && candidateMagId)
      ? { character_weapon_id: weapon.id, profile_id: profileId, character_magazine_id: candidateMagId }
      : null,
    reloadRpcResult: ephemeral.reloadRpcResult ?? null,
  };
}

/**
 * Compact, privacy-safe fire-mode diagnostics for `?debug=1` only (Fire Mode
 * v1). Never includes the armory/inventory bundle — only ids/booleans. PURE.
 */
function buildFireModeDebugInfo(hudSnapshot, ephemeral) {
  const weapon = hudSnapshot?.weapon?.primary ?? null;
  const fireMode = weapon?.fireMode ?? null;
  return {
    selectedWeaponId: weapon?.id ?? null,
    activeProfileId: weapon?.activeProfileId ?? null,
    fireModeApplicable: !!fireMode?.isApplicable,
    selectedFireModeId: fireMode?.selectedId ?? null,
    selectedFireModeCode: fireMode?.selectedCode ?? null,
    availableFireModeIds: Array.isArray(fireMode?.available) ? fireMode.available.map((m) => m.id) : [],
    fireModeSelectorOpen: !!ephemeral.fireModeSelectorOpen,
    fireModeUpdatePath: resolveFireModeUpdatePath(weapon),
    fireModeLastResult: ephemeral.fireModeRpcResult ?? null,
  };
}

/**
 * The Basic Weapon Attack v1 evaluation context, shared by the live
 * `ui.basicAttack` allow/reason (every module needs this to render the Action
 * button correctly) and the `?debug=1` diagnostics below. Single source of
 * truth — sceneSelectionController's "execute" command handler builds this
 * SAME shape before calling evaluateBasicAttack() again for its own,
 * independent server-side-of-the-iframe check.
 */
function buildBasicAttackEvalCtx(characterId, hudSnapshot, ephemeral) {
  const weapon = hudSnapshot?.weapon?.primary ?? null;
  const targeting = ephemeral.targeting ?? {};
  return {
    sourceCharacterId: characterId ?? null,
    weaponId: weapon?.id ?? null,
    targetTokenId: Array.isArray(targeting.selectedTargetIds) ? (targeting.selectedTargetIds[0] ?? null) : null,
    targetCharacterId: targeting.selectedTargetCharacterId ?? null,
    bodyZoneId: targeting.selectedBodyPartId ?? null,
    resolvedBodyPartId: targeting.resolvedBodyPartId ?? null,
    inFlight: !!ephemeral.basicAttackInFlight,
  };
}

/**
 * Compact, privacy-safe Basic Weapon Attack diagnostics for `?debug=1` only.
 * Never includes the runtime bundle, armory, or any target-private data —
 * `payload` is the SAME small object perform_attack would actually receive
 * (built via the canonical resolveAttackService.buildAttackPayload(), not a
 * HUD-only re-implementation), and `result` only ever reflects what the real
 * server/RPC actually returned. PURE.
 */
function buildBasicAttackDebugInfo(characterId, hudSnapshot, ephemeral) {
  const weapon = hudSnapshot?.weapon?.primary ?? null;
  const evalCtx = buildBasicAttackEvalCtx(characterId, hudSnapshot, ephemeral);
  const evalResult = evaluateBasicAttack(evalCtx);

  let payload = null;
  if (evalResult.uiAllowed) {
    try {
      payload = buildAttackPayload(buildBasicAttackCtx({
        sourceCharacterId: evalCtx.sourceCharacterId,
        weaponId: evalCtx.weaponId,
        targetCharacterId: evalCtx.targetCharacterId,
        bodyPartId: evalCtx.resolvedBodyPartId,
        distance: ephemeral.targeting?.distance ?? 0,
      }));
    } catch (_e) { payload = null; }
  }

  return {
    sourceCharacterId: evalCtx.sourceCharacterId,
    targetTokenId: evalCtx.targetTokenId,
    targetCharacterId: evalCtx.targetCharacterId,
    weaponId: evalCtx.weaponId,
    profileId: weapon?.activeProfileId ?? null,
    selectedFireModeId: weapon?.fireMode?.selectedId ?? null,
    bodyZone: evalCtx.bodyZoneId,
    distance: ephemeral.targeting?.distance ?? null,
    uiAllowed: evalResult.uiAllowed,
    uiBlockReason: evalResult.uiBlockReason,
    payload,
    inFlight: evalCtx.inFlight,
    result: ephemeral.basicAttackResult ?? { ok: null, error: null, message: null },
  };
}

export function buildBroadcastPayload(state, ephemeral = {}) {
  const s = state ?? createInitialSelectionState(null);
  const ready = s.status === SELECTION_STATUS.ready && s.access?.canView === true;
  const activeIntent = ephemeral.activeIntent
    ?? ((ephemeral.preparedAction?.kind === "skill" && ephemeral.preparedAction?.id)
      ? { kind: "skill", id: ephemeral.preparedAction.id }
      : { kind: "weapon-attack", weaponId: ephemeral.selectedWeaponId ?? null });

  let hudSnapshot = null;
  if (ready && s.runtimeBundle) {
    try { hudSnapshot = mapBundleToHudSnapshot(s.runtimeBundle, ephemeral); } catch (_e) { /* mapper errors → null → neutral fallback */ }
  }
  // Phase 3D.1: the real (server-result-only) local Combat Log replaces the
  // runtime bundle's own (currently always-empty) battleLog section — see
  // hud/log/combatResultLogPolicy.js. Never Supabase-persisted, never shared.
  if (hudSnapshot && Array.isArray(ephemeral.combatLog)) {
    hudSnapshot = { ...hudSnapshot, battleLog: { entries: ephemeral.combatLog } };
  }
  // Phase 3E.0: the LIVE combat session (single shared mapper — the same
  // normalization the GM tracker sees). While the selected character is a
  // participant of an active session, the Player block's MAIN/MOVE pips come
  // from SERVER session state only — never from the runtime bundle's own
  // free-play action flags, and never from a local optimistic mutation.
  const combatSession = mapCombatRuntimeToSession(ephemeral.sessionRuntime ?? null, {
    viewerPlayerId: s.viewer?.playerId ?? null,
    viewerIsGm: String(s.viewer?.role ?? "").toUpperCase() === "GM",
    selectedCharacterId: ready ? (s.characterId ?? null) : null,
  });
  if (hudSnapshot) {
    hudSnapshot = { ...hudSnapshot, combatSession };
    if (combatSession.exists && combatSession.selectedCharacterParticipantId && hudSnapshot.entity) {
      hudSnapshot = {
        ...hudSnapshot,
        entity: {
          ...hudSnapshot.entity,
          actions: { main: combatSession.mainAvailable, move: combatSession.moveAvailable },
        },
      };
    }
    // Phase 4.0b: the persisted quickbar runtime (already SAFE + mapped by the
    // quickbar controller — quickActions library + slot layout + version). The
    // Skills block renders the real quickbar from this; ability parsing stays in
    // hud/abilities/* and never smears into SkillBlock/selectionState. Absent →
    // SkillBlock falls back to its legacy category view (keeps Phase 2 tests).
    if (ephemeral.abilitiesRuntime && ephemeral.abilitiesRuntime.ok !== false) {
      hudSnapshot = { ...hudSnapshot, quickbar: ephemeral.abilitiesRuntime };
    }
    // Phase 4.1A: the armed attack technique (ephemeral UI-only "prepared for
    // next attack" state — never persisted, never trusted by the server on
    // its own) surfaces two ways: the raw id for the Skills Block's own
    // is-armed highlight, and a display-shaped entry in modifiers.active for
    // Combat Control's ARMED section. Resolved against the SAME already-
    // mapped quickActions list the Skills Block already renders, so ARMED
    // never shows a name the server didn't already provide. AUTO is left
    // untouched (still the Phase-3A.1 empty stub — no real passive-modifier
    // producer exists yet, see docs/PHASE_4_1A_ATTACK_TECHNIQUES_AUDIT.md §6).
    const armedActionId = ephemeral.armedActionId ?? null;
    if (armedActionId) {
      hudSnapshot = { ...hudSnapshot, armedActionId };
      const armedAction = ephemeral.abilitiesRuntime?.quickActions?.find(
        (a) => a.characterActionId === armedActionId,
      );
      if (armedAction) {
        hudSnapshot = {
          ...hudSnapshot,
          modifiers: {
            ...hudSnapshot.modifiers,
            active: [{
              id: armedAction.characterActionId,
              name: armedAction.name,
              value: 0,
              source: "Prepared",
              description: "Prepared for next attack",
              polarity: "neutral",
              alwaysActive: false,
              selected: true,
              requiresGMApproval: false,
              invalid: armedAction.state?.available === false,
            }],
          },
        };
      }
    }
  }
  const debug = ready && s.runtimeBundle
    ? buildRuntimeDebugSummary(s.runtimeBundle, hudSnapshot, {
        selectionStatus: s.status,
        selectedTokenId: s.selectedItemId ?? null,
        characterId: s.characterId ?? null,
      })
    : null;
  if (debug) {
    const weapon = hudSnapshot?.weapon?.primary ?? null;
    const inserted = weapon?.loadedMagazine ?? null;
    debug.live = {
      activeCharacterId: s.characterId ?? null,
      selectedWeaponId: ephemeral.selectedWeaponId ?? weapon?.id ?? null,
      weaponSelectorOpen: !!ephemeral.weaponSelectorOpen,
      selectedWeaponResolved: !!weapon,
      insertedMagazine: {
        present: !!inserted,
        rounds: inserted ? Number(inserted.current ?? 0) : null,
        capacity: inserted ? Number(inserted.max ?? 0) : null,
      },
      compatibleReserveMagazineCount: Array.isArray(weapon?.reserveMagazines) ? weapon.reserveMagazines.length : 0,
      targetingMode: ephemeral.targeting?.mode ?? "none",
      sourceTokenId: s.selectedItemId ?? null,
      selectedObrTokenId: s.selectedItemId ?? null,
      resolvedTargetTokenId: Array.isArray(ephemeral.targeting?.selectedTargetIds)
        ? (ephemeral.targeting.selectedTargetIds[0] ?? null)
        : null,
    };
    if (ephemeral.debugEnabled) {
      debug.reload = buildReloadDebugInfo(hudSnapshot, ephemeral);
      debug.fireMode = buildFireModeDebugInfo(hudSnapshot, ephemeral);
      debug.basicAttack = buildBasicAttackDebugInfo(s.characterId, hudSnapshot, ephemeral);
    }
  }

  const basicAttackEval = ready
    ? evaluateBasicAttack(buildBasicAttackEvalCtx(s.characterId, hudSnapshot, ephemeral))
    : { uiAllowed: false, uiBlockReason: "No character loaded." };

  // Phase 3E.0: the session gate applies AFTER the free-play preconditions —
  // a real precondition failure keeps its own (more specific) reason; an
  // otherwise-ready attack is blocked with the server-derived session reason
  // ("Waiting for your turn" / "MAIN already spent"), never a fabricated one.
  const attackGate = sessionAttackGate(hudSnapshot?.combatSession ?? null);
  const gatedBasicAttack = basicAttackEval.uiAllowed && attackGate.blocked
    ? { uiAllowed: false, uiBlockReason: attackGate.reason }
    : basicAttackEval;

  return {
    status: s.status,
    selectedItemId: s.selectedItemId ?? null,
    characterId: ready ? (s.characterId ?? null) : null,
    viewer: { playerId: s.viewer?.playerId ?? null, role: s.viewer?.role ?? "UNKNOWN" },
    access: { canView: !!s.access?.canView, reason: s.access?.reason ?? null },
    view: ready ? (s.view ?? null) : null,
    // Normalized HUD view models — block renderers use this; full bundle is NOT included.
    hudSnapshot: ready ? hudSnapshot : null,
    ui: {
      selectedWeaponId: ephemeral.selectedWeaponId ?? null,
      selectedReloadMagazineId: ephemeral.selectedReloadMagazineId ?? null,
      weaponSelectorOpen: !!ephemeral.weaponSelectorOpen,
      fireModeSelectorOpen: !!ephemeral.fireModeSelectorOpen,
      preparedAction: ephemeral.preparedAction ?? null,
      targeting: ephemeral.targeting ?? null,
      commandStatus: ephemeral.commandStatus ?? null,
      activeIntent,
      basicAttack: {
        inFlight: !!ephemeral.basicAttackInFlight,
        uiAllowed: gatedBasicAttack.uiAllowed,
        uiBlockReason: gatedBasicAttack.uiBlockReason,
      },
    },
    debug: ready ? debug : null,
    error: { code: s.error?.code ?? null, message: s.error?.message ?? null },
  };
}

/** Defensive normalize for a payload received over the broadcast wire. */
export function normalizeSelectionPayload(raw) {
  if (!raw || typeof raw !== "object" || !raw.status) return null;
  return {
    status: String(raw.status),
    selectedItemId: raw.selectedItemId ?? null,
    characterId: raw.characterId ?? null,
    viewer: { playerId: raw.viewer?.playerId ?? null, role: raw.viewer?.role ?? "UNKNOWN" },
    access: { canView: !!raw.access?.canView, reason: raw.access?.reason ?? null },
    view: raw.view ?? null,
    // Phase 3A.1: normalized HUD snapshot (block renderers use this).
    hudSnapshot: raw.hudSnapshot ?? null,
    ui: raw.ui ?? null,
    debug: raw.debug ?? null,
    error: { code: raw.error?.code ?? null, message: raw.error?.message ?? null },
  };
}

/**
 * Stale-request protection. Every resolve takes a monotonically increasing
 * token; only the latest token may commit its result. If selection A starts,
 * then B starts, B bumps the gate — so a late A resolve is no longer current
 * and must be discarded.
 */
export function createGenerationGate() {
  let current = 0;
  return {
    next() { current += 1; return current; },
    isCurrent(token) { return token === current; },
    get current() { return current; },
  };
}
