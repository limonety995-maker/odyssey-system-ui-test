// Combat HUD — Phase 3A / 3A.1 selection render (PURE, DOM-free string builder).
//
// Given a broadcast selection payload + a module id, returns the HTML for that
// module iframe.
//
// Phase 3A.1 routing logic:
//   ready + hudSnapshot present  → real block renderer with synthetic state
//   ready + hudSnapshot absent   → minimal identity card (fallback)
//   non-ready (player module)    → status prompt card
//   non-ready (secondary)        → muted placeholder (controller also closes them)

import { ICON_MARK } from "../components/hudIcons.js";
import { esc } from "../components/hudDom.js";
import { SELECTION_STATUS, PRIMARY_MODULE_ID, normalizeSelectionPayload } from "./selectionState.js";
import { createInactiveCombatSession } from "../models/combatHudContracts.js";

// Phase 3A.1: block renderers for live-ready mode.
import { renderPlayerBlock }      from "../components/PlayerBlock.js";
import { renderGunBlock }         from "../components/GunBlock.js";
import { renderSkillBlock }       from "../components/SkillBlock.js";
import { renderCombatControlBlock } from "../components/CombatControlBlock.js";
import { renderBattleLogPanel }   from "../components/BattleLogBlock.js";

/** Block renderers keyed by module id. */
const LIVE_RENDERERS = {
  player:        renderPlayerBlock,
  gun:           renderGunBlock,
  skills:        renderSkillBlock,
  combatControl: renderCombatControlBlock,
  log:           renderBattleLogPanel,
};

// ─── Canonical Player prompts (spec verbatim) ───────────────────────────────

const PLAYER_PROMPTS = Object.freeze({
  [SELECTION_STATUS.noSelection]:       { t: "SELECT YOUR CHARACTER",        h: "Choose a controlled token on the map" },
  [SELECTION_STATUS.multipleSelection]: { t: "SELECT ONE CHARACTER",         h: "Multiple tokens selected" },
  [SELECTION_STATUS.unlinkedToken]:     { t: "NO CHARACTER LINK",            h: "This token is not linked to an Odyssey character" },
  [SELECTION_STATUS.notOwned]:          { t: "CHARACTER NOT AVAILABLE",      h: "Select one of your controlled characters" },
  [SELECTION_STATUS.unavailable]:       { t: "CHARACTER DATA UNAVAILABLE",   h: "Try selecting the token again" },
  [SELECTION_STATUS.error]:             { t: "CHARACTER DATA UNAVAILABLE",   h: "Try selecting the token again" },
});

// ─── Small card builders ────────────────────────────────────────────────────

function promptCard(title, hint, devDetail) {
  return `<div class="ohud-state-wrap"><div class="ohud-empty">
    <span class="ohud-empty-mark" aria-hidden="true">${ICON_MARK}</span>
    <div class="ohud-empty-title">${esc(title)}</div>
    <div class="ohud-empty-hint">${esc(hint)}</div>${devDetail || ""}
  </div></div>`;
}

function loadingCard() {
  return `<div class="ohud-state-wrap"><div class="ohud-empty ohud-empty--loading">
    <div class="ohud-empty-title">LOADING…</div>
  </div></div>`;
}

// Minimal identity card used when ready but no hudSnapshot (e.g. wire downgrade,
// old bridge version). Shows GM/CONTROLLED badge + name + alive/conscious state.
function readyPlayerCard(view) {
  const v = view || {};
  const badge = v.gmView
    ? `<span class="ohud-bind-badge ohud-bind-badge--gm">GM VIEW</span>`
    : `<span class="ohud-bind-badge ohud-bind-badge--owned">CONTROLLED</span>`;
  const fallbackStatus = `${v.isAlive === false ? "Down" : "Alive"} · ${v.isConscious === false ? "Unconscious" : "Conscious"}`;
  const statusLine = v.statusSummary ? esc(v.statusSummary) : esc(fallbackStatus);
  const owner = v.ownerName ? `<div class="ohud-bind-owner">Owner: ${esc(v.ownerName)}</div>` : "";
  return `<div class="ohud-bind">
    ${badge}
    <div class="ohud-bind-name" title="${esc(v.name || "")}">${esc(v.name || "Unnamed character")}</div>
    <div class="ohud-bind-status">${statusLine}</div>
    ${owner}
  </div>`;
}

// Fallback for secondary modules when hudSnapshot is absent (should not occur
// in normal operation; kept as a safety net for unexpected wire formats).
function readyFallbackCard(moduleId) {
  const LABEL = { gun: "Gun", skills: "Skills", combatControl: "Combat Control", log: "Log" };
  const label = LABEL[moduleId] || moduleId;
  return `<section class="ohud-panel" data-block="${esc(moduleId)}">
    <div class="ohud-bind-fallback">
      <div class="ohud-bind-fallback-label">${esc(label)}</div>
      <div class="ohud-bind-fallback-hint">Data loading…</div>
    </div>
  </section>`;
}

function debugReason(payload, opts) {
  if (!opts?.dev || !payload?.debug?.reason) return "";
  return `<div class="ohud-bind-dev">HUD DEBUG: ${esc(payload.debug.reason)}</div>`;
}

function mutedCard(moduleId) {
  return `<section class="ohud-panel ohud-panel--muted" data-block="${esc(moduleId)}"><div class="ohud-muted-fill">—</div></section>`;
}

// ─── Synthetic state builder ─────────────────────────────────────────────────
// Builds the minimal CombatHudState that block renderers expect from a live
// broadcast payload + its hudSnapshot. No mock data is included.

function buildSyntheticState(payload) {
  const snap = payload.hudSnapshot;
  const role = String(payload.viewer?.role ?? "UNKNOWN").toLowerCase();
  const prepared = payload.ui?.preparedAction ?? null;
  const selectedAbilityId = prepared?.kind === "skill" ? prepared.id : null;
  const targeting = payload.ui?.targeting ?? {};

  return {
    status:              "ready",
    source:              "supabase",
    viewer: {
      playerId:   payload.viewer?.playerId ?? null,
      playerName: null,
      role:       role === "gm" ? "gm" : "player",
    },
    selectedTokenId:    payload.selectedItemId ?? null,
    selectedCharacterId: payload.characterId ?? null,
    access:             { canViewSelectedCharacter: true, reason: null },
    // Phase 3E.0: when hudSnapshot is present it already carries the live
    // server-mapped combatSession (see selectionState.buildBroadcastPayload).
    snapshot: snap ?? {
      entity:        null,
      weapon:        { primary: null, secondary: null },
      skills:        { library: [], quickSlots: [] },
      combatSession: createInactiveCombatSession(),
      modifiers:     { passive: [], active: [], narrative: [] },
      battleLog:     { entries: [] },
    },
    ui: {
      isHudCollapsed:          false,
      selectedTechniqueId:     null,
      selectedAbilityId,
      selectedReloadMagazineId: payload.ui?.selectedReloadMagazineId ?? null,
      selectedModifierIds:     [],
      weaponSelectorOpen:      !!payload.ui?.weaponSelectorOpen,
      fireModeSelectorOpen:    !!payload.ui?.fireModeSelectorOpen,
      activeIntent:            payload.ui?.activeIntent ?? { kind: "weapon-attack", weaponId: null },
      basicAttack: payload.ui?.basicAttack ?? { inFlight: false, uiAllowed: false, uiBlockReason: "No character loaded." },
      targeting: {
        mode:                targeting.mode ?? "none",
        selectedTargetIds:   Array.isArray(targeting.selectedTargetIds) ? targeting.selectedTargetIds : [],
        selectedTargetName:  targeting.selectedTargetName ?? null,
        selectedBodyPartId:  targeting.selectedBodyPartId ?? "torso",
        distance:            Number.isFinite(Number(targeting.distance)) ? Number(targeting.distance) : null,
        zonesMap:            targeting.zonesMap && typeof targeting.zonesMap === "object" ? targeting.zonesMap : {},
        error:               targeting.error ?? null,
        selectedPoint:       null,
        radius:              null,
      },
      isBattleLogExpanded: false,
    },
    error: null,
  };
}

// ─── Public ──────────────────────────────────────────────────────────────────

/**
 * Render one module iframe's content from a live broadcast selection payload.
 *
 * Phase 3A.1: when status === ready and payload.hudSnapshot is present, the
 * existing block renderers are called with a synthetic state so real character
 * data is shown (gun, skills, target/modifiers/action, log). Mock data is never
 * mixed with live state.
 *
 * @param {string} moduleId
 * @param {object} payload   Normalized broadcast selection payload.
 * @param {{ dev?: boolean }} [opts]
 * @returns {string} HTML
 */
export function renderSelectionModule(moduleId, payload, opts = {}) {
  const status = payload?.status;
  const isReady = status === SELECTION_STATUS.ready && payload?.access?.canView;

  // ── Player module ───────────────────────────────────────────────────────
  if (moduleId === PRIMARY_MODULE_ID) {
    if (isReady) {
      if (payload.hudSnapshot) {
        // Phase 3A.1: full player block with real resource bars / zones / statuses.
        const syntheticState = buildSyntheticState(payload);
        return `${renderPlayerBlock(syntheticState)}${debugReason(payload, opts)}`;
      }
      // Fallback: minimal identity card (no hudSnapshot → old wire or bundle error).
      if (payload.view) return `${readyPlayerCard(payload.view)}${debugReason(payload, opts)}`;
    }
    if (status === SELECTION_STATUS.loading || !status) return loadingCard();
    const p = PLAYER_PROMPTS[status] || PLAYER_PROMPTS[SELECTION_STATUS.noSelection];
    const devDetail = opts.dev && payload?.error?.message
      ? `<div class="ohud-bind-dev">${esc(payload.error.code || "")}: ${esc(payload.error.message)}</div>`
      : "";
    return promptCard(p.t, p.h, devDetail);
  }

  // ── Secondary modules ───────────────────────────────────────────────────
  if (isReady) {
    if (payload.hudSnapshot) {
      // Phase 3A.1: real block renderer with live character data.
      const fn = LIVE_RENDERERS[moduleId];
      if (fn) {
        const syntheticState = buildSyntheticState(payload);
        if (moduleId === "skills") {
          return fn(syntheticState, opts?.skillsUiState ?? {});
        }
        return fn(syntheticState);
      }
    }
    // Fallback: labeled waiting card (hudSnapshot absent or unknown moduleId).
    return readyFallbackCard(moduleId);
  }
  return mutedCard(moduleId);
}

/**
 * Build the synthetic block-renderer state a companion selector popover (weapon
 * / magazine) needs, from a RAW broadcast selection payload.
 *
 * Returns `null` when the live snapshot has not arrived yet (no payload, not a
 * viewable ready character, or `hudSnapshot` still absent) so the caller can
 * render a controlled "Loading…" state instead of a FALSE "empty" list. This is
 * the exact same normalize → synthetic-state path the Gun module uses, so the
 * companion sees an IDENTICAL `snapshot.weapon` view model (`available`,
 * `primary`, `reserveMagazines`, …) — no duplicated armory mapping, no extra
 * Supabase call. A non-null return guarantees `state.snapshot.weapon` exists,
 * so an empty `available` then legitimately means "no weapons available".
 *
 * @param {object|null} rawPayload  The BC_HUD_SELECTION event data.
 * @returns {object|null} synthetic CombatHudState, or null while loading.
 */
export function buildCompanionSelectorState(rawPayload) {
  const payload = normalizeSelectionPayload(rawPayload);
  if (!payload) return null;
  const isReady = payload.status === SELECTION_STATUS.ready && payload.access?.canView;
  if (!isReady || !payload.hudSnapshot) return null; // snapshot not ready → loading
  return buildSyntheticState(payload);
}
