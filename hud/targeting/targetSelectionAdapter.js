// Combat HUD — Phase 3B target-selection adapter (dependency-injected, testable).
//
// Resolves a selected token id → a target candidate using ONLY:
//   - the existing token-link layer (getSceneTokenLinks) to confirm a targetable
//     Odyssey token and read its character link (id + display name);
//   - map-level item geometry (position) for distance;
//   - the scene grid + canonical distance math.
//
// It NEVER loads the target's private runtime bundle, never reads token metadata,
// and never writes anything. All I/O arrives through injected functions so this
// module is pure-testable with fakes (incl. the A→B race via delayed promises).

import { validateCandidate, extractTokenLink, createTargetGenerationGate, TARGETING_ERROR } from "./targetSelectionState.js";
import { DEFAULT_PROFILE_ID } from "./targetProfiles.js";
import { computeTargetDistance } from "./targetDistance.js";

/**
 * @param {{
 *   fetchSceneTokenLink: (tokenId:string) => Promise<object>,
 *   getTokenSummary?: (tokenId:string) => Promise<{ displayName?:string, position?:{x:number,y:number}|null }|null>,
 *   getGrid?: () => (object|Promise<object>),
 *   getSourceContext: () => { tokenId:(string|null), characterId:(string|null), characterName:(string|null) },
 * }} deps
 */
export function createTargetSelectionAdapter(deps = {}) {
  const fetchSceneTokenLink = deps.fetchSceneTokenLink;
  const getTokenSummary = typeof deps.getTokenSummary === "function" ? deps.getTokenSummary : null;
  const getGrid = typeof deps.getGrid === "function" ? deps.getGrid : null;
  const getSourceContext = typeof deps.getSourceContext === "function" ? deps.getSourceContext : () => ({});
  const gate = createTargetGenerationGate();

  /**
   * Resolve one token id → candidate result.
   * @returns {Promise<{ok:true, candidate:object} | {ok:false, code:string, message?:string}>}
   */
  async function resolve(tokenId) {
    const source = getSourceContext() ?? {};

    // 1) Cheap, synchronous guards (no private data touched yet).
    const base = validateCandidate({ tokenId, sourceTokenId: source.tokenId });
    if (!base.ok) return base;

    // 2) Confirm a targetable Odyssey token via the token-link layer.
    let linkResult;
    try {
      linkResult = await fetchSceneTokenLink(tokenId);
    } catch (error) {
      return { ok: false, code: TARGETING_ERROR.fetchFailed, message: error?.message ?? null };
    }
    const link = extractTokenLink(linkResult, tokenId);
    if (!link) return { ok: false, code: TARGETING_ERROR.notLinked };

    // 3) Map-level display data + geometry (best-effort; never fatal).
    let summary = null;
    if (getTokenSummary) {
      try { summary = await getTokenSummary(tokenId); } catch (_e) { summary = null; }
    }
    const displayName = link.characterName || summary?.displayName || "Target";

    // 4) Distance (best-effort; "—" when not reliably computable).
    let distance = null;
    try {
      if (getGrid && summary?.position && source.tokenId) {
        const [grid, srcSummary] = await Promise.all([
          Promise.resolve(getGrid()),
          getTokenSummary ? getTokenSummary(source.tokenId) : Promise.resolve(null),
        ]);
        if (grid && srcSummary?.position) {
          distance = computeTargetDistance(grid, srcSummary.position, summary.position);
        }
      }
    } catch (_e) {
      distance = null;
    }

    return {
      ok: true,
      candidate: {
        tokenId: String(tokenId),
        characterId: link.characterId ?? null,
        displayName,
        profileId: DEFAULT_PROFILE_ID,
        distance,
      },
    };
  }

  /**
   * Epoch-protected resolve: only the latest call may commit. If A starts, then
   * B starts, B bumps the gate, so a late A resolve returns stale:true.
   * @returns {Promise<{ stale:boolean, result:object }>}
   */
  async function resolveLatest(tokenId) {
    const token = gate.next();
    const result = await resolve(tokenId);
    return { stale: !gate.isCurrent(token), result };
  }

  return { resolve, resolveLatest };
}
