# Phase 4.1B.0 — Direct Ability Attack from Skills Block: audit

Audit performed before any behavior change, per the phase's own requirement
("Do not assume based on names. Follow the active code path."). All file:line
references are against the repo at the start of this phase (commit `446ba9c`).

## 1. Current Skills Block data flow

`hud/components/SkillBlock.js`'s `renderSkillBlock(state)` (line 56) checks
`state?.snapshot?.quickbar`; when present (the real, server-backed path used
today) it delegates entirely to `renderQuickbarStrip()` in
`hud/abilities/QuickbarView.js`. The legacy category-bucket mock rendering in
the same file is a Phase-2 fallback only used when no `snapshot.quickbar`
exists. SkillBlock itself renders HTML with `data-action` attributes only —
it never wires click handling directly.

## 2. Where quickbar slots are loaded

`hud/abilities/quickbarController.js`'s `setupQuickbarController()` (background
context): `loadRuntime(characterId, origin)` calls
`fetchQuickActionsRuntime(characterId, settings)` (RPC
`odyssey_get_character_quick_actions_runtime`), then
`mapQuickActionsRuntime(raw)` (`hud/abilities/abilityRuntimeMapper.js`), then
broadcasts the mapped runtime via `BC_HUD_ABILITIES`. Layout save uses
`saveQuickbarLayout()` → RPC `odyssey_save_character_quickbar_layout`. This
controller's own `handleCommand()` understands exactly 4 command types today
(`refresh`, `editor-opened`, `draft-changed`, `save-layout`) — **no execution
command exists here.** Its own header comment states: *"Phase 4.0 is
metadata-only: no ability is executed here... Phase 4.1 adds execution."*

## 3. Where ability runtime state is mapped

`hud/abilities/abilityRuntimeMapper.js`'s `mapQuickAction(raw)` (line 180)
produces the canonical per-action shape:
```
{ characterActionId, definitionId, sourceType, type, name, shortDescription,
  fullDescription, iconKey, semanticKind, targeting, costs, cooldown, state,
  requirements }
```
`type` is one of `QUICK_ACTION_TYPES`: `attack_technique | directed | instant
| toggle` (line 20). `targeting` = `{ mode, minTargets, maxTargets,
allowAllies, allowSelf, requiresBodyZone }` (`mapTargeting`, line 106).
`state` = `{ available, active, disabledReason, selectable,
executionAvailable, executionReason, resourceSufficient }` (`mapState`, line
151). **There is no `executionMode` field, no `kind` field distinct from
`type`, and no explicit `requiresTarget` field anywhere in this mapper** —
confirmed by full read. The closest existing proxies are `targeting.mode`
(non-`"none"`/`"self"` ⇒ needs a target) and `targeting.requiresBodyZone`.

## 4. Existing states

`hud/abilities/abilityAvailabilityPolicy.js`'s `deriveSlotAvailability(action,
isArmed)` (line 31) returns exactly one of `SLOT_AVAILABILITY` (line 17):
`ready | armed | cooldown | insufficient_resource | unsupported |
unavailable`, checked in this priority order: `armed` (client-only flag) →
`unsupported` (`state.executionAvailable === false`) → `cooldown`
(`cooldown.current > 0`) → `insufficient_resource`
(`!state.available && !state.resourceSufficient`) → `unavailable`
(`!state.available`) → `ready`. This policy only ever reasons about the
already-mapped `state`/`cooldown` fields — no execution-mode concept exists
here either, today.

## 5. Existing ARMED attack technique flow (Phase 4.1A)

- `hud/scene/armedTechniqueMemory.js`: a per-character `Map<characterId,
  characterActionId>` — max one armed id (no `stack_group` column exists in
  the schema yet). `toggle(characterId, actionId)` re-toggles/replaces.
- `hud/components/CombatHudModule.js`: `data-action="toggle-armed-technique"`
  (occupied `attack_technique` slot click) and `data-action="disarm-technique"`
  (Combat Control's ARMED × button) both dispatch
  `{ scope: "combat-hud", feature: "quickbar", type: "toggle-armed",
  characterActionId }` — **purely local, no RPC call.**
- `hud/scene/sceneSelectionController.js` (lines ~429-443): handles
  `toggle-armed` by calling `armedTechniqueMemory.toggle(...)` and
  republishing state — no server round trip.
- The SAME controller's `basic-attack`/`execute` handler (lines ~448-657) is
  the actual attack-execution path: it reads
  `armedTechniqueMemory.get(sourceCharacterId)`, folds it into
  `buildBasicAttackCtx({ ..., armedActionIds })`
  (`hud/combat/basicAttackPayload.js`), calls `resolveAttack(ctx, {
  performAttack })` (`screens/resolveAttack/resolveAttackService.js`), and on
  a resolved attack whose `armed_actions[].applied === true`, calls
  `armedTechniqueMemory.forget(sourceCharacterId)` — the armed id is cleared
  **only on confirmed server application**, never on a bare click.
- Server: `perform_attack`'s `armed_action_ids` branch (migration 100, now
  folded into migration 102's redefinition — see §14 below) validates
  ownership/type/cooldown/target-type/weapon-type/resource, **explicitly
  rejects a damage/armor-pierce/ignore-armor technique**
  (`ACTION_EFFECT_NOT_IMPLEMENTED`) since only the additive accuracy-bonus
  channel is wired into the weapon-attack math, and consumes cost/cooldown
  only after the weapon attack resolves.

**Attack techniques remain completely unchanged by this phase** — they are
still armed via the same client-only toggle and still consumed only through
a subsequent weapon `basic-attack`/`execute` command. This phase adds a
**separate**, new command for direct ability execution; it does not touch
`toggle-armed-technique` or the `basic-attack` handler's own logic at all.

## 6. Existing weapon attack flow

`hud/combat/basicAttackPolicy.js`'s `evaluateBasicAttack(ctx)` gates the
Action button (checks source/weapon/target/zone/link in order, returns
`BASIC_ATTACK_BLOCK_REASON` constants). `hud/combat/basicAttackPayload.js`'s
`buildBasicAttackCtx(input)` (line 43) hardcodes `mode: "weapon"` and builds
the `ctx` object `resolveAttack()` consumes (see §7).

## 7. Existing attack payload builder

`screens/resolveAttack/resolveAttackService.js`'s `buildAttackPayload(ctx)`
(line 118) is **the single shared payload builder both the weapon-attack path
and this phase's new ability-attack path use.** It already has a `mode`
branch:
```js
const mode = ctx.mode === "skill" ? "skill" : "weapon";
...
if (mode === "skill") {
  payload.character_ability_id = requireId(ctx.abilityId, "No ability selected.");
} else {
  payload.weapon_id = requireId(ctx.weaponId, "No weapon selected.");
}
```
Confirmed: when `mode: "skill"`, the payload **never contains `weapon_id`**,
and this function has no concept of ammo/magazine/fire-mode at all (those are
handled by entirely separate RPCs never touched by this builder). The `mode:
"skill"` branch existed since an early phase but until this phase was only
ever exercised by the legacy `screens/resolveAttack/resolveAttackScreen.js`,
never by the HUD.

## 8. Existing target + body-zone selection flow

`hud/targeting/targetSelectionState.js`: `target = { tokenId, characterId,
displayName, profileId, selectedZoneId, distance, bodyZones }`.
`selectZone(state, zoneId)` mutates `target.selectedZoneId` (a wire **zone
code**, e.g. `"TORSO"` — not a body-part UUID).
`buildTargetingBroadcast(state)` (line 223) emits
`target.resolvedBodyPartId: resolveBodyPartId(target.bodyZones,
target.selectedZoneId)` — the exact zone→UUID resolution (see §9). This
broadcast is the SAME state basic weapon attacks already read from
(`hud/scene/sceneSelectionController.js`'s `ephemeral.targeting.*`) — this
phase's new ability-attack path reads the identical
`resolvedBodyPartId`/`targetCharacterId` fields, never a second target
source, and never Owlbear's own native token-selection state.

## 9. Body-zone-to-body-part UUID resolution

`hud/targeting/targetBodyZones.js`'s `resolveBodyPartId(bodyZones, zoneId)`
(line 70): `bodyZones.find((z) => z.zoneId === zoneId)?.bodyPartId ?? null`.
`mapTargetBodyZones(bundle)` builds `bodyZones` from
`get_character_runtime_bundle`'s `combat.body_parts` rows — `bodyPartId` is a
real `odyssey_character_body_parts.id` UUID. This is the exact, existing,
already-tested mapping this phase reuses verbatim.

## 10. Existing Debug Console combat trace normalizer

`hud/combat/attackResolutionTrace.js`'s `buildAttackResolutionTrace(outcome)`
returns `{ ok, context, accuracy, damage, ammo, modifiers: { auto, armed },
summary }`, all fields verbatim-from-server with a `NOT_RETURNED` sentinel for
anything absent. `buildRollBreakdown(trace)` is **the two-step roll rule**:
for `ATTACK ROLL`/`DEFENSE ROLL`/`DAMAGE ROLL`/`DAMAGE DEFENSE` it emits `{
Roll, "With modifiers", Modifiers }` only when the server actually returned at
least one of the raw/final values — never fabricated. This phase's ability
attacks reuse this exact normalizer and roll-breakdown function; the ability
result's `attack_roll`/`attack_total`/`defense_roll`/`defense_total`/etc.
fields already match the shape `attackResolutionTrace.js` expects (confirmed
by reading `odyssey_perform_ability_attack`'s own result JSON — same field
names as the weapon-attack result, see §12).

## 11. Existing Combat Log / result-log normalizer

`hud/log/combatResultLogPolicy.js`'s `buildAttackLogEntry({
sourceCharacterId, targetCharacterId, bodyZoneLabel, outcome })` (line 53)
builds `details` via `buildCombatLogLines(buildAttackResolutionTrace(outcome),
bodyZoneLabel)` on success, or `[String(outcome?.error || "Attack denied.")]`
on failure — returning `{ timestamp, type: LOG_TYPE.attack, outcome, title,
details, sourceCharacterId, targetCharacterId }`. Rendered by
`hud/components/BattleLogBlock.js`. This phase reuses this exact function —
an ability attack's `outcome` (from `resolveAttack()`) has the same shape a
weapon attack's does, so no new log-entry builder is needed.

## 12. Whether the server already has a usable direct ability attack RPC/path

**Yes.** `public.perform_attack(jsonb)` (the SAME RPC — `COMBAT_RPC_NAMES.performAttack`
— the weapon-attack flow already calls) already redirects to
`public.odyssey_perform_ability_attack(jsonb)` whenever the payload carries
`character_ability_id` or `ability_code` (checked BEFORE any weapon-specific
logic). Read in full (`supabase/odyssey_supabase.sql:23938` — the function
body currently aliased at runtime as `odyssey_perform_ability_attack_legacy`,
which is what actually executes):
- Resolves the character's ability + its level-scaled data
  (`odyssey_ability_level_defs`), validates the target character + target
  body part exist and are targetable, checks the attacker can act
  (alive/conscious/not helpless/not skip-main-action).
- Rolls attack (`floor(random()*100)+1`) and defense identically to the
  weapon-attack resolver; applies `attack_skill_bonus`,
  `attack_accuracy_bonus`, range modifier, manual bonus/penalty; computes hit
  via `attack_total > defense_total`.
- On hit, computes damage using **`v_level.attack_damage_bonus` directly, with
  no restriction** (line 24333: `v_damage_attack_total := v_attack_total +
  coalesce(v_level.attack_damage_bonus, 0) + v_attacker_damage_modifier;`),
  applies armor-pierce/ignore-armor (`v_level.ignore_armor`,
  `v_level.attack_armor_pierce`), computes damage level
  (minor/serious/critical), writes minor/serious/critical/disabled/destroyed
  onto the target body part, applies equipment critical damage.
- Consumes the ability's own resource cost
  (`odyssey_consume_character_ability_cost`) and sets
  `current_cooldown_rounds` — both server-side, before the roll (cost is
  spent even on a miss, matching the existing weapon-ability cost timing
  precedent).
- Returns a full result object with the SAME field names
  `attack_roll/attack_total/defense_roll/defense_total/damage_level/
  damage_diff/minor_delta/serious_delta/critical_delta/resource/...` the
  weapon-attack path already returns, writes a `odyssey_combat_log` row, and
  refreshes+returns the target's combat state.

**This is already, today, a fully working, damage-capable, single-target
ability-attack resolver with no restriction analogous to migration 100's
`ACTION_EFFECT_NOT_IMPLEMENTED`.**

## 13. Whether `use_ability`/`combat_execute_action` already support direct attack ability execution

`combat_execute_action(p_payload)`'s `kind = 'ability'` branch calls
`public.use_ability(...)`, which delegates to
`odyssey_use_ability_with_weapon_support`. That function **explicitly
rejects** attack-kind abilities:
```sql
if v_ability.ability_kind = 'attack' or v_ability.effect_mode = 'attack' then
  return jsonb_build_object(
    'ok', false, 'error', 'ABILITY_REQUIRES_ATTACK_RESOLUTION',
    'message', 'Attack abilities must be resolved through perform_attack.'
    ...
```
So `use_ability`/`combat_execute_action(kind='ability')` is confirmed to be
the wrong path for this phase — it is the generic ability-**activation**
function for buffs/heals/utility effects, and its own SQL says, verbatim, to
use `perform_attack` for attack abilities instead. `perform_attack` (§12) is
the correct, already-existing path.

## 14. Whether a new server RPC/migration is required

**A migration was required — but not a new RPC.** `perform_attack`'s
ability-attack redirect (§12) runs **before** the function's own Phase 3E.0
combat-session gate (read in full at
`supabase/odyssey_supabase.sql:62568-63132`, the current authoritative
`perform_attack` from migration 100):

```sql
if v_character_ability_id is not null or v_ability_code <> '' then
  return public.odyssey_perform_ability_attack(v_payload);   -- line 62662
end if;

-- Phase 3E.0 session gate (STATE_VERSION_CONFLICT / NOT_CURRENT_TURN /
-- ACTION_NOT_AVAILABLE) starts at line 62665 — AFTER the early return above.
v_participation := public.odyssey_get_active_participation(v_attacker_character_id);
...
```

and the post-resolution MAIN-action-cost consumption
(`odyssey_apply_turn_costs`) + encounter-version bump
(`odyssey_increment_encounter_state_version`) that every weapon attack
receives (lines 62932-62945) is likewise unreachable for the ability branch,
since it returns before reaching that code.

**Concretely: a direct ability attack going through `perform_attack` today
would fully resolve — roll, damage, PSI cost, cooldown, all correct — without
the server EVER checking whose turn it is, without spending a MAIN action,
and without bumping the encounter state version.** This directly contradicts
the phase's own requirement: *"The server must be authoritative for: whether
it is the character's turn... MAIN/action cost... encounter state version."*
This is not a hypothetical — it is the exact, current behavior of the
existing, deployed `perform_attack` function, confirmed by reading its full
body. `odyssey_perform_ability_attack` itself has no session/turn/MAIN check
anywhere in its own body either (confirmed by grep over its full text).

This satisfies migration rule (F): *"There is no server-authoritative direct
ability attack path"* — read precisely: the ATTACK RESOLUTION half of that
path is complete and correct, but the session-gate half (which the weapon
path already has) does not apply to it. **Migration
`supabase/102_direct_ability_attack_session_gate.sql`** (renumbered to
`108_direct_ability_attack_session_gate.sql` on 2026-07-09 during the
upstream tree-adoption sync, since upstream independently used migration
number 102 for an unrelated change — see that file's own header comment)
was created (NOT applied remotely — no `supabase db push`/`migration up`
was run) to close
exactly this gap: it redefines `perform_attack` so the session-gate block
runs BEFORE the ability redirect (mirroring the weapon path exactly), and a
successfully-resolved ability attack now gets the same
`odyssey_apply_turn_costs`/`odyssey_increment_encounter_state_version`/
`odyssey_build_session_cost_summary` calls the weapon path already makes —
reusing those three existing helper functions verbatim, adding no new
function, no new column, no new table. `odyssey_perform_ability_attack`
itself, the armed-technique validation block, and the entire weapon-attack
path are copied byte-for-byte unchanged from migration 100 — the migration's
diff is exactly: (a) move one existing block earlier, (b) replace one `return
public.odyssey_perform_ability_attack(v_payload);` statement with a
capture-then-gate-then-return sequence using functions already proven on the
line immediately below it in the same file.

Also note (unrelated, observed for completeness): `supabase/odyssey_supabase.sql`
is a generated reference dump that appears to be missing a `BEGIN
90_combat_session_foundation.sql` marker (jumps from `89_...` directly to
`95_...`, with `92_...` appearing out of numeric order after `100_...`) even
though the session-gate code it introduced is present (inlined into migration
100's full redefinition of `perform_attack`). `odyssey_get_active_participation`
itself is defined in `supabase/90_combat_session_foundation.sql:488` — this
was confirmed by grepping the individual numbered migration files directly,
not the dump. This is a dump-generation quirk, not a schema gap; the
individual numbered `.sql` files (not the dump) are the actual migration
sequence and are unaffected.

## 15. Which runtime fields identify an ability as executable direct attack

None exist as a single explicit field today (confirmed in §3) — this phase
identifies a compatible ability from the EXISTING mapped fields already
produced by `abilityRuntimeMapper.js`, with no new server field required:

```
type === "attack_technique"          // QUICK_ACTION_TYPES.attackTechnique
&& state.executionAvailable !== false
```

This is deliberately the same `type` value Phase 4.1A's armed-technique flow
already uses for its own eligibility check (`isTechnique = action.type ===
"attack_technique"` in `QuickbarView.js`) — an ability doesn't need a NEW
"is this a direct-attack ability" flag; every `attack_technique` action is
already, structurally, a single-target attack ability
(`odyssey_ability_defs.ability_kind = 'attack'`, per migration 30's seed data
and migration 101's own runtime query). What changes in this phase is
**which command a click on it dispatches**: Phase 4.1A only ever offers
`toggle-armed-technique`; this phase adds a second, mutually-exclusive
interaction — **direct execute** — gated on the SAME `type`/`state` fields,
distinguished purely by whether a target+body-zone are already selected (see
§17/design below). No `executionMode`/`kind` field needed to be invented;
`type === "attack_technique"` combined with `targeting.mode !== "none"` (a
target is meaningful) is sufficient and already present.

## 16. Which runtime fields expose MAIN / PSI / cooldown availability

`costs = { main, move, psi, charges }` (`mapCosts`, line 119) and `cooldown =
{ current, max, unit, active }` (`mapCooldown`, line 130) — both already
mapped verbatim from the server, already rendered in the Ability Detail
Card, already the basis for `deriveSlotAvailability`'s `cooldown`/
`insufficient_resource` states. No new field needed; this phase reads the
existing ones for its own detail-popover cost display (§I of the phase spec)
and READY/COOLDOWN/unavailable classification.

## 17. Why Etheric Strike is currently shown as unsupported

`supabase/101_quickbar_execution_availability.sql`'s
`odyssey_get_character_quick_actions_runtime` redefinition computes, per
action:
```sql
unsupported_effect := (
  coalesce(ald.attack_damage_bonus, 0) <> 0
  or coalesce(ald.attack_armor_pierce, 0) <> 0
  or coalesce(ald.ignore_armor, false)
)
```
and sets `executionAvailable = not unsupported_effect`,
`executionReason = 'ACTION_EFFECT_NOT_IMPLEMENTED'`,
`disabledReason = 'Attack effect is not supported yet'` when true. Etheric
Strike's level-1 data (`30_seed_active_abilities.sql`) has
`attack_damage_bonus = 50` (nonzero) ⇒ `unsupported_effect = true` ⇒ shown
unsupported. **This flag was written for, and only makes sense for, the
armed-attack-technique-on-weapon-attack channel** (migration 100's own
identical restriction, `ACTION_EFFECT_NOT_IMPLEMENTED` on the weapon path) —
it says nothing about whether the ability could be resolved through its OWN
dedicated attack resolver (`odyssey_perform_ability_attack`, §12), which
already fully supports damage bonus/armor-pierce/ignore-armor with no such
restriction. **Root cause in one sentence: Etheric Strike is marked
unsupported today purely because migration 101's `unsupported_effect` flag
was scoped to "can this be armed onto a weapon attack", not "can this be
executed as its own direct ability attack" — the two are different
questions with different answers for this exact ability, and this phase's
job is to let the Skills Block ask the second question, not to change the
first.**

**Client-side consequence:** the existing `deriveSlotAvailability` priority
order checks `state.executionAvailable === false` → `unsupported` **before**
`ready`, so Etheric Strike currently renders locked/disabled in the quickbar
regardless of PSI/cooldown state, purely due to this scoping mismatch — not
because the Skills Block has any Etheric-Strike-specific logic (confirmed:
no name-based branching exists anywhere in the client).

**Resolution for this phase:** the Skills Block's own direct-attack
eligibility check (§15) does **not** read `state.executionAvailable` at all —
that field is specific to the armed-weapon-attack channel and would
incorrectly keep locking out damage-bonus abilities from direct execution.
Direct-attack eligibility instead only requires `type === "attack_technique"`
and the ordinary `state.available`/`cooldown`/`resourceSufficient` fields
(the same ones any other ready/cooldown/insufficient-resource ability
already uses) — `executionAvailable`/`executionReason` remain fully correct
and unchanged for their existing purpose (the ARMED badge/lock icon on the
weapon-attack channel), they are simply not consulted for the NEW direct-
execute interaction. This is a client-side interpretation change only — no
migration to migration 101's runtime query was needed or made.

## 18. Final implementation plan

**Client (HUD):**
1. `hud/abilities/abilityAvailabilityPolicy.js`: add
   `isDirectAttackAbility(action)` (`action.type === "attack_technique"`) and
   a direct-execute-specific availability derivation that does NOT gate on
   `executionAvailable` (§17) — reusing `available`/`cooldown.active`/
   `resourceSufficient` exactly as today.
2. `hud/abilities/QuickbarView.js`: an occupied `attack_technique` tile's
   `data-action` becomes context-sensitive — kept as
   `toggle-armed-technique` (Phase 4.1A, unchanged) UNLESS this phase's new
   UI mode applies; see the implementation for the exact minimal-diff
   decision (kept the ARMED flow 100% intact per the phase's explicit
   requirement — direct execution is added as a **new, separate**
   command/interaction, not a replacement).
3. New command `{ scope: "combat-hud", feature: "quickbar", type:
   "execute-direct-ability", characterActionId }`, dispatched from a new
   `data-action="execute-direct-ability"` path, handled in
   `hud/scene/sceneSelectionController.js` alongside (never inside)
   `basic-attack`/`execute` and `toggle-armed`.
4. New handler builds `ctx = { mode: "skill", abilityId:
   characterActionId, attackerCharacterId, targetCharacterId,
   targetBodyPartId, encounterId, expectedEncounterVersion, ... }` (no
   `weaponId`, no ammo/magazine/fire-mode fields — `buildAttackPayload`
   structurally cannot include them in `mode: "skill"`, §7) and calls the
   SAME `resolveAttack()`/`performAttack()` the weapon path uses.
5. On success: push a `buildAttackLogEntry(...)` Combat Log entry (§11), log
   a normalized Debug Console trace via `attackResolutionTrace.js` (§10),
   refresh the quickbar runtime (cooldown/PSI now server-updated) and the
   session runtime (MAIN now spent) through the SAME refresh calls the
   weapon path already makes, and preserve the selected target/zone (no
   `clearTarget()` call — target clearing remains the exclusive
   responsibility of the existing targeting flow, per §8).
6. On failure: no local resource/cooldown mutation (there never was one —
   the mapper never lets the client invent these values), surface the
   server's error message through the existing error-display convention.

**Server:** migration `108_direct_ability_attack_session_gate.sql` (§14,
renumbered from 102 on 2026-07-09 — see that file's header) — created, not
applied remotely.
