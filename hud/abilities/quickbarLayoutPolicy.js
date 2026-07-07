// HUD Abilities — Phase 4.0: quickbar layout policy (PURE).
//
// Client-side rules for editing a quickbar draft: assign / move / remove slots,
// enforce "one action per slot" and "no duplicate action across slots", detect
// version conflicts, and build the normalized save payload. The SERVER re-checks
// every rule on save (this layer is UX + a fast local guard, never authority).
//
// Draft model: an array of slot objects
//   { slotIndex:int, characterActionId:string|null, empty:bool, missing?:bool }
// Slot 0..9 render on row 1; 10+ render on row 2 (growing upward) — a UI concern
// resolved in the panel, but maxSlots is enforced here.
//
// A "missing" slot references an action no longer present in the current
// library (e.g. an ability was unlearned). It stays visible and removable until
// the user saves, at which point the reference is dropped.

export const DEFAULT_MAX_SLOTS = 20;
export const FIRST_ROW_SIZE = 10;

export const LAYOUT_CONFLICT = "QUICKBAR_VERSION_CONFLICT";

function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function str(v) {
  const s = String(v ?? "").trim();
  return s || null;
}

/** Build an empty slot object at a given index. */
function emptySlot(slotIndex) {
  return { slotIndex, characterActionId: null, empty: true, missing: false };
}

/**
 * Build a dense draft of exactly `maxSlots` slots from a possibly-sparse server
 * layout, marking missing references against the current action library.
 * @param {object[]} serverSlots slots from mapped runtime (may be sparse/sorted)
 * @param {Set<string>} actionIdSet valid characterActionIds in the library
 * @param {number} maxSlots
 * @returns {object[]} dense draft, length === maxSlots
 */
export function buildDraft(serverSlots, actionIdSet, maxSlots = DEFAULT_MAX_SLOTS) {
  const size = Math.max(1, num(maxSlots, DEFAULT_MAX_SLOTS));
  const draft = Array.from({ length: size }, (_, i) => emptySlot(i));
  const seen = new Set();

  for (const raw of Array.isArray(serverSlots) ? serverSlots : []) {
    const idx = num(raw?.slotIndex ?? raw?.index, -1);
    if (idx < 0 || idx >= size) continue;
    const actionId = str(raw?.characterActionId ?? raw?.actionId);
    if (!actionId) continue;
    // Enforce "no duplicate action" even in a corrupt server payload — the first
    // occurrence wins, later ones are dropped (server normalizes on next save).
    if (seen.has(actionId)) continue;
    seen.add(actionId);
    draft[idx] = {
      slotIndex: idx,
      characterActionId: actionId,
      empty: false,
      missing: !actionIdSet.has(actionId),
    };
  }

  return draft;
}

/** Index of the slot currently holding an action, or -1. */
function slotIndexOfAction(draft, actionId) {
  return draft.findIndex((s) => s && s.characterActionId === actionId);
}

/**
 * Assign an action (from the library) into a target slot.
 * Rules:
 *   - if the action already occupies another slot, it MOVES (never duplicates);
 *   - the target slot's previous action is displaced into the action's old slot
 *     (a swap) when the action came from another slot, else the target is simply
 *     overwritten and its previous action returns to the library.
 * @returns {object[]} a NEW draft array (input is not mutated)
 */
export function assignActionToSlot(draft, actionId, targetIndex, actionIdSet) {
  const id = str(actionId);
  const tIdx = num(targetIndex, -1);
  if (!id || tIdx < 0 || tIdx >= draft.length) return draft.slice();

  const next = draft.map((s) => ({ ...s }));
  const fromIdx = slotIndexOfAction(next, id);
  const displaced = next[tIdx].characterActionId; // may be null

  // Place the dragged action into the target slot.
  next[tIdx] = {
    slotIndex: tIdx,
    characterActionId: id,
    empty: false,
    missing: actionIdSet ? !actionIdSet.has(id) : false,
  };

  if (fromIdx >= 0 && fromIdx !== tIdx) {
    // The action came from another slot → swap: displaced action goes to the
    // now-vacated source slot (or the source becomes empty if target was empty).
    if (displaced) {
      next[fromIdx] = {
        slotIndex: fromIdx,
        characterActionId: displaced,
        empty: false,
        missing: actionIdSet ? !actionIdSet.has(displaced) : false,
      };
    } else {
      next[fromIdx] = emptySlot(fromIdx);
    }
  }
  // If the action came from the library (fromIdx < 0) and the target was
  // occupied, the displaced action simply returns to the library (no slot).

  return next;
}

/**
 * Move an action from one slot to another (slot-to-slot drag).
 * Swaps the two slots' contents. NEW draft returned.
 */
export function moveSlot(draft, fromIndex, toIndex) {
  const f = num(fromIndex, -1);
  const t = num(toIndex, -1);
  if (f < 0 || t < 0 || f >= draft.length || t >= draft.length || f === t) return draft.slice();

  const next = draft.map((s) => ({ ...s }));
  const a = { ...next[f] };
  const b = { ...next[t] };
  next[t] = { ...a, slotIndex: t };
  next[f] = { ...b, slotIndex: f };
  return next;
}

/** Clear a slot (remove its action back to the library). NEW draft returned. */
export function removeSlot(draft, slotIndex) {
  const idx = num(slotIndex, -1);
  if (idx < 0 || idx >= draft.length) return draft.slice();
  const next = draft.map((s) => ({ ...s }));
  next[idx] = emptySlot(idx);
  return next;
}

/**
 * Which library actions are NOT yet placed in any slot (available to drag in).
 * @param {object[]} quickActions mapped library
 * @param {object[]} draft current draft
 * @returns {object[]} subset of quickActions not present in the draft
 */
export function unassignedActions(quickActions, draft) {
  const placed = new Set(
    (Array.isArray(draft) ? draft : [])
      .map((s) => s?.characterActionId)
      .filter(Boolean),
  );
  return (Array.isArray(quickActions) ? quickActions : []).filter(
    (a) => a?.characterActionId && !placed.has(a.characterActionId),
  );
}

/**
 * Validate a draft before save. Returns { valid, errors:[] }.
 * Errors are structural only (duplicates, out-of-range). "missing" slots are
 * allowed pre-save (they simply won't be persisted) but reported as warnings.
 */
export function validateDraft(draft, maxSlots = DEFAULT_MAX_SLOTS) {
  const errors = [];
  const warnings = [];
  const size = num(maxSlots, DEFAULT_MAX_SLOTS);
  const seen = new Set();

  for (const s of Array.isArray(draft) ? draft : []) {
    const idx = num(s?.slotIndex, -1);
    if (idx < 0 || idx >= size) {
      errors.push({ code: "SLOT_OUT_OF_RANGE", slotIndex: idx });
      continue;
    }
    const actionId = str(s?.characterActionId);
    if (!actionId) continue;
    if (seen.has(actionId)) {
      errors.push({ code: "DUPLICATE_ACTION", slotIndex: idx, actionId });
    }
    seen.add(actionId);
    if (s?.missing) {
      warnings.push({ code: "MISSING_ACTION", slotIndex: idx, actionId });
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Build the normalized save payload from a draft. Missing-reference slots are
 * dropped (the action no longer exists, so it won't be persisted). Empty slots
 * are preserved so the layout keeps its shape. Only non-empty, non-missing slots
 * carry an action id.
 * @returns {object[]} [{ slotIndex, characterActionId|null }]
 */
export function draftToSavePayload(draft) {
  return (Array.isArray(draft) ? draft : [])
    .map((s) => {
      const idx = num(s?.slotIndex, 0);
      const actionId = s?.missing ? null : str(s?.characterActionId);
      return { slotIndex: idx, characterActionId: actionId };
    })
    .sort((a, b) => a.slotIndex - b.slotIndex);
}

/**
 * Detect a version conflict between the draft's base version and the latest
 * server version. Returns true when they differ (save must be blocked / retried).
 */
export function hasVersionConflict(baseVersion, serverVersion) {
  const a = num(baseVersion, -1);
  const b = num(serverVersion, -1);
  if (a < 0 || b < 0) return false;
  return a !== b;
}

/**
 * Build the normalized slot payload for the save RPC from arbitrary UI slots.
 * Tolerates field aliases (actionId / characterActionId, index / slotIndex),
 * keeps empty slots (null action) so the layout preserves its shape, and sorts
 * by slotIndex. PURE — lives here (not the OBR-coupled API module) so it stays
 * unit-testable under plain Node. Re-exported from abilityApi.js for callers.
 * @param {object[]} slots
 * @returns {object[]} [{ slotIndex, characterActionId|null }]
 */
export function buildSlotPayload(slots) {
  if (!Array.isArray(slots)) return [];
  return slots
    .filter((s) => s != null)
    .map((s) => ({
      slotIndex: num(s?.slotIndex ?? s?.index, 0),
      characterActionId: str(s?.characterActionId ?? s?.actionId),
    }))
    .sort((a, b) => a.slotIndex - b.slotIndex);
}

/** Row assignment for a slot index: 0 for first row (0..9), 1+ for upper rows. */
export function rowOfSlot(slotIndex, firstRowSize = FIRST_ROW_SIZE) {
  const idx = num(slotIndex, 0);
  const size = Math.max(1, num(firstRowSize, FIRST_ROW_SIZE));
  return Math.floor(idx / size);
}

/**
 * Whether a draft differs from the original server layout (dirty check for the
 * Cancel/close guard). Compares only slotIndex → actionId mapping.
 */
export function isDraftDirty(draft, originalDraft) {
  const a = draftToSavePayload(draft);
  const b = draftToSavePayload(originalDraft);
  if (a.length !== b.length) return true;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i].slotIndex !== b[i].slotIndex) return true;
    if (a[i].characterActionId !== b[i].characterActionId) return true;
  }
  return false;
}
