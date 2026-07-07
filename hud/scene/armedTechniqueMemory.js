// Combat HUD — per-character armed attack technique memory (PURE).
//
// Phase 4.1A: which attack_technique (if any) is "prepared for next attack"
// for a given character. Controller-local, session-scoped ephemeral UI state
// (characterId -> characterActionId), NOT persisted to localStorage/Supabase/
// OBR metadata — same lifecycle as selectedWeaponMemory.js, which this
// mirrors. The server is the sole source of truth for whether the armed
// technique is actually valid/affordable; this map only tracks the player's
// *intent*, cleared by an explicit click or by an authoritative server
// response after Attack — never by a bare click on ATTACK itself.
//
// Stack rule: no canonical stack_group exists anywhere in the schema (see
// docs/PHASE_4_1A_ATTACK_TECHNIQUES_AUDIT.md). Until it does, at most ONE
// technique may be armed per character — arming a second one REPLACES the
// first rather than stacking, which is why this stores a single id per
// character rather than a Set.

/** @returns {{
 *   get:(characterId:string|null)=>(string|null),
 *   toggle:(characterId:string|null, actionId:string|null)=>{armedId:string|null, previousId:string|null},
 *   forget:(characterId:string|null)=>void,
 * }} */
export function createArmedTechniqueMemory() {
  const map = new Map();
  return {
    get(characterId) {
      if (!characterId) return null;
      return map.get(characterId) ?? null;
    },
    /** Arms `actionId`; clicking the SAME already-armed id disarms it instead;
     *  arming a DIFFERENT id replaces whatever was armed before (max-1 rule).
     *  Returns both the new armed id (or null) and whatever was armed before,
     *  so the caller can log armed/disarmed/replaced precisely. */
    toggle(characterId, actionId) {
      const id = actionId ? String(actionId) : null;
      if (!characterId || !id) return { armedId: map.get(characterId) ?? null, previousId: map.get(characterId) ?? null };
      const previousId = map.get(characterId) ?? null;
      if (previousId === id) {
        map.delete(characterId);
        return { armedId: null, previousId };
      }
      map.set(characterId, id);
      return { armedId: id, previousId };
    },
    forget(characterId) {
      if (characterId) map.delete(characterId);
    },
  };
}
