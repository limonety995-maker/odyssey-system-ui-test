// Combat HUD — Phase 3A scene-selection adapter (PURE factory, injectable I/O).
//
// Turns a raw OBR selection (array of item ids) into a normalized selection
// state by resolving token → character link → runtime bundle through INJECTED
// fetchers. No OBR / Supabase / fetch is imported here, so it is fully unit
// testable under Node with fake fetchers (including delayed promises for the
// stale-response race test).
//
// Resolution order matches the spec:
//   0 selected   → no-selection         (no I/O)
//   >1 selected  → multiple-selection   (no I/O)
//   1 selected   → fetch link → (unlinked?) → fetch bundle → ownership → ready
// Backend unconfigured short-circuits to a safe `unavailable` (never mock).

import {
  deriveSelectionState,
  normalizeSelectionIds,
  createGenerationGate,
  SELECTION_STATUS,
  ACCESS_REASON,
} from "./selectionState.js";

function errMessage(err) {
  return String((err && (err.message || err)) ?? "Unknown error");
}

/** Pick the active link for a token id from a get_scene_token_links result. */
function pickLink(res, tokenId) {
  const links = Array.isArray(res?.links) ? res.links : [];
  const match = links.find(
    (l) => String(l?.token_id ?? "").trim() === tokenId && l?.is_active !== false,
  );
  if (!match || !match.character || !match.character.id) return null;
  return {
    characterId: String(match.character.id).trim() || null,
    characterName: match.character.display_name ?? null,
    raw: match,
  };
}

/**
 * @param {{
 *   fetchSceneTokenLink: (tokenId:string) => Promise<object>,
 *   fetchCharacterBundle: (characterId:string) => Promise<object>,
 *   getViewer: () => object,
 *   backendConfigured?: boolean,
 * }} deps
 */
export function createSceneSelectionAdapter(deps) {
  const {
    fetchSceneTokenLink,
    fetchCharacterBundle,
    getViewer,
    backendConfigured = true,
  } = deps ?? {};
  const gate = createGenerationGate();

  async function resolve(selectionIds) {
    const ids = normalizeSelectionIds(selectionIds);
    const viewer = typeof getViewer === "function" ? getViewer() : null;

    if (!backendConfigured) {
      return deriveSelectionState({
        viewer, selectionIds: ids,
        failure: {
          status: "unavailable",
          code: ACCESS_REASON.backendUnconfigured,
          message: "Supabase backend is not configured for this room.",
        },
      });
    }

    // 0 / many → no backend call.
    if (ids.length !== 1) return deriveSelectionState({ viewer, selectionIds: ids });

    const tokenId = ids[0];

    // token → character link
    let link = null;
    try {
      const res = await fetchSceneTokenLink(tokenId);
      if (res && res.ok === false) {
        return deriveSelectionState({
          viewer, selectionIds: ids,
          failure: { status: "error", code: "LINK_FETCH_FAILED", message: res.message || "Scene token links unavailable." },
        });
      }
      link = pickLink(res, tokenId);
    } catch (err) {
      return deriveSelectionState({
        viewer, selectionIds: ids,
        failure: { status: "error", code: "LINK_FETCH_FAILED", message: errMessage(err) },
      });
    }
    if (!link || !link.characterId) {
      return deriveSelectionState({ viewer, selectionIds: ids, link: link || null });
    }

    // character → runtime bundle
    let bundle = null;
    try {
      bundle = await fetchCharacterBundle(link.characterId);
    } catch (err) {
      return deriveSelectionState({
        viewer, selectionIds: ids, link,
        failure: { status: "error", code: "RUNTIME_FETCH_FAILED", message: errMessage(err) },
      });
    }
    return deriveSelectionState({ viewer, selectionIds: ids, link, bundle });
  }

  /**
   * Race-safe resolve: stamps a generation token, and reports whether the
   * resolved result is still the latest. Callers MUST discard `stale` results.
   * @returns {Promise<{ stale: boolean, state: object }>}
   */
  async function resolveLatest(selectionIds) {
    const token = gate.next();
    const state = await resolve(selectionIds);
    return { stale: !gate.isCurrent(token), state };
  }

  return { resolve, resolveLatest, SELECTION_STATUS };
}
