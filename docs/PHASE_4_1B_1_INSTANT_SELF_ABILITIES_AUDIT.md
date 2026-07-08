# Phase 4.1B.1 — Instant / Self Ability Execution from Skills Block: audit

Audit performed before any behavior change, per the phase's own requirement
("Do not assume from ability names."). All file:line references are against
the repo at the start of this phase (commit `4022ddb`).

## 1. Existing quickbar runtime action types

Unchanged since Phase 4.0/4.1: `hud/abilities/abilityRuntimeMapper.js`'s
`QUICK_ACTION_TYPES` = `attack_technique | directed | instant | toggle`. This
phase adds NO new type — "instant/self" abilities are a **subset of the
existing `instant` type**, distinguished by their `targeting` block (see §4).

## 2. Existing fields (re-confirmed against the live server query)

`supabase/101_quickbar_execution_availability.sql`'s
`odyssey_get_character_quick_actions_runtime` (the only place any of these
fields is computed) sets, per quick action:

```sql
'type', case
  when coalesce(ad.effect_mode, '') = 'attack' or ad.ability_kind = 'attack' then 'attack_technique'
  when coalesce(ad.target_type, 'none') in ('character', 'body_part') then 'directed'
  else 'instant'
end,
'semanticKind', ad.ability_kind,
'targeting', jsonb_build_object(
  'mode', coalesce(ad.target_type, 'none'),
  'minTargets', 1, 'maxTargets', 1,
  'allowAllies', true,
  'allowSelf', ad.target_type = 'self',
  'requiresBodyZone', ad.target_type = 'body_part'
),
'costs', jsonb_build_object(
  'main', case when ad.resource_mode = 'pool' then 1 else 0 end,
  'move', 0,
  'psi', case when ad.resource_pool_code = 'psi' then coalesce((ald.data->>'psi_cost')::int, 0) else 0 end,
  'charges', case when ad.resource_mode = 'item' then coalesce(ca.current_charges, 0) else 0 end
),
'cooldown', jsonb_build_object('current', ca.current_cooldown_rounds, 'max', coalesce(ald.cooldown_rounds, 0), 'unit', 'turn'),
'state', jsonb_build_object(
  'available', ca.is_enabled and not v_has_skip_turn_effect and (v_is_alive or ad.target_type = 'none')
    and cooldown<=0 and not insufficient_pool and not insufficient_charges and not unsupported_effect,
  'executionAvailable', not unsupported_effect,
  'executionReason', case when unsupported_effect then 'ACTION_EFFECT_NOT_IMPLEMENTED' else null end,
  'resourceSufficient', not (insufficient_pool or insufficient_charges),
  ...
)
```

**`type: "instant"` is the ELSE branch** — every ability whose
`effect_mode`/`ability_kind` is not `attack` AND whose `target_type` is not
`character`/`body_part` (i.e. `self` or `none`) lands here today, with no
further sub-classification. This is the ONLY place `type` is computed —
confirmed by grepping every migration for a second `'type'` key in this
query; none exists.

`abilityRuntimeMapper.js`'s client-side `mapQuickAction`/`mapTargeting`/
`mapState` copy all of the above verbatim (already audited in Phase 4.1B.0's
own audit doc §3) — no re-derivation, no client-side guessing.

**Observed, out-of-scope quirk (not fixed by this phase):** the `costs.psi`
expression only fires when `ad.resource_pool_code = 'psi'` literally — every
current psionic ability (including the two self-only ones below) uses
`resource_pool_code = 'psionic_energy'`, so `costs.psi` displays `0` for all
of them today even though a real PSI-equivalent cost is spent server-side
(server-side consumption reads `resource_pool_code` directly from the
ability def and is NOT affected by this display-only mismatch). This is a
pre-existing migration-101 cosmetic gap, unrelated to instant/self execution
— flagged for a future pass, not touched here (smallest-safe-change rule).

## 3. Which abilities currently appear as which state

Traced against `supabase/30_seed_active_abilities.sql`'s
`odyssey_ability_defs` rows (the only three seeded abilities today):

| code | ability_kind | target_type | effect_mode | client `type` | notes |
|---|---|---|---|---|---|
| `etheric_strike` | attack | body_part | attack | `attack_technique` | direct-attack-eligible (Phase 4.1B.0) — `executionReason: ACTION_EFFECT_NOT_IMPLEMENTED` because `attack_damage_bonus=50` |
| `etheric_coating` | defense | **self** | grant_special | **`instant`** | **THIS phase's target class** — grants special-slot armor to the caster |
| `sensory_concentration` | buff | **self** | apply_effect | **`instant`** | **THIS phase's target class** — applies a temporary self buff effect |

No seeded ability is `directed` (would require `target_type in ('character',
'body_part')` with `ability_kind`/`effect_mode` ≠ `attack`) or `toggle` (the
server's `type` CASE has no branch that ever produces `"toggle"` — it is a
purely client-side/legacy VALID_TYPES entry with zero live rows today).
`unsupported` (via `deriveSlotAvailability`) never applies to either
`etheric_coating` or `sensory_concentration` today: their level-def rows
(`odyssey_ability_level_defs`) have `attack_damage_bonus=0`,
`attack_armor_pierce=0`, `ignore_armor=false` (confirmed by reading the seed
inserts), so `unsupported_effect` is `false` and `executionAvailable` is
`true` for both — they are ALREADY, TODAY, correctly shown as `ready`/
`cooldown`/`insufficient_resource` depending on state, never "unsupported."

## 4. Which runtime metadata identifies an instant/self executable ability

**`action.type === "instant"`** — sufficient on its own, with no additional
field needed. This is a stronger, simpler signal than Phase 4.1B.0's
`executionReason`-based one, because the server's own `type` CASE (§2)
already structurally excludes `character`/`body_part` targeting from ever
producing `"instant"` — an ability that needs an external target always maps
to `"directed"` instead, and an attack always maps to `"attack_technique"`.
There is therefore no risk of `type === "instant"` ever meaning "needs an
enemy target" — the exclusion is already enforced server-side, not
re-derived or guessed client-side.

(A defensive, redundant check — `targeting.mode !== "character" &&
targeting.mode !== "body_part"` — is included anyway in the implementation,
matching this codebase's established "never trust one field alone" pattern,
even though it is currently always true whenever `type === "instant"`.)

## 5/6/7. Which server RPC executes this — `combat_execute_action` vs `perform_attack` vs a new one

**`combat_execute_action(jsonb)` with `kind: "ability"` is the correct,
already-existing, ALREADY-CORRECT path — no new RPC, no migration.**

Read in full (`supabase/odyssey_supabase.sql:53125-53286`, the current
authoritative `combat_execute_action`, defined in migration 64 and only
patched by migration 90 for its `attack`/`reload` branches — confirmed by
reading migration 90's own patch comment, which touches nothing in the
`ability` branch):

1. Requires an **active** encounter (`status='active' and ended_at is
   null`) and an active participant for the character — `ENCOUNTER_NOT_ACTIVE`
   / `PARTICIPANT_NOT_FOUND` otherwise. **Unlike `perform_attack`, this path
   has no free-play fallback** — instant/self ability execution via this RPC
   only works inside an active combat encounter. This is a genuine,
   pre-existing scoping difference (not a bug), consistent with the phase's
   own manual-verification steps ("1. Start combat.").
2. `odyssey_can_control_character` — ownership/GM-control check
   (`CONTROL_DENIED`).
3. Turn-order check — `NOT_CURRENT_TURN` unless it's the character's turn OR
   they have a reaction action available.
4. `odyssey_validate_combat_versions(encounter_id, expected_encounter_version,
   character_id, expected_character_state_version)` — **both version
   arguments are optional** (default null, only checked when the caller
   supplies a real value) — `STATE_VERSION_CONFLICT` on mismatch.
5. `odyssey_get_combat_action_cost_context(encounter_id, character_id,
   'ability', 'ability', character_ability_id, intent)` — computes
   `action_cost` from the ability's OWN `data.combat_cost.action_cost`
   (default **1** when absent — matches the client's own `costs.main` mapping
   in §2) and `move_cost` (default 0).
6. `ACTION_NOT_AVAILABLE` / `MOVE_NOT_AVAILABLE` if the participant doesn't
   have enough MAIN/MOVE for that cost — **the exact same turn/MAIN gate
   `perform_attack` needed a migration to add for ability attacks in Phase
   4.1B.0 — this generic executor already has it correctly, for every kind
   including `ability`.**
7. Dispatches `kind='ability'` to **`public.use_ability(intent ||
   {encounter_id})`**, which delegates to
   `odyssey_use_ability_with_weapon_support` (read in full,
   `supabase/odyssey_supabase.sql:59278-59735`):
   - Resolves the ability + its level-scaled data.
   - **Explicitly rejects attack abilities** (`ability_kind='attack' or
     effect_mode='attack'` → `ABILITY_REQUIRES_ATTACK_RESOLUTION`, "must be
     resolved through perform_attack") — confirming point 7's answer:
     **`perform_attack` must NOT be used for instant/self abilities, and
     conversely `use_ability`/`combat_execute_action` must NOT be used for
     attack abilities** — the two paths are already mutually exclusive by
     the server's own design, cleanly matching the client's own `type`
     split (`attack_technique` → `perform_attack`;
     `instant` → `combat_execute_action`).
   - Resolves `target_character_id` to the ACTING character automatically
     when `target_type = 'self'` OR when no target was supplied at all
     (`elsif v_target_character_id is null then v_target_character_id :=
     v_character_id;`) — **confirming no `target_character_id` needs to be
     sent in the payload for a self-only ability.**
   - Spends the resource (`odyssey_consume_character_ability_cost`) and sets
     `current_cooldown_rounds` — both server-side, before applying any
     effect (cost is spent even if the effect application itself later
     fails, matching every other ability-cost-timing precedent in this
     codebase).
   - Applies the effect based on `effect_mode`:
     - `apply_effect` → `add_character_effect(...)` (the
       `sensory_concentration` case) — creates a real, tracked character
       effect row with name/description/category/duration/source, returns
       `{ ok, effects: [...], combat_state }`.
     - `grant_special` → updates the character's own "Special" body-part
       slot's `natural_armor_value`/`max_critical` (the `etheric_coating`
       case) — returns `{ ok, special: <body part state>, combat_state }`.
     - Neither → `{ ok, narrative_only: true, combat_state }` (an honest,
       non-fabricated fallback for a purely narrative ability).
   - Writes a `odyssey_combat_log` row with a genuinely readable message:
     `format('%s uses %s.', <character name>, <ability name>)` — exactly the
     player-facing summary shape this phase's own Combat Log requirement
     describes.
   - Returns a rich, complete result: `{ ok, character_ability_id,
     character_id, target_character_id, ability: {code, name, ability_kind,
     source_type, effect_mode, effective_level}, resource, result,
     combat_state, log_id }`.
8. Back in `combat_execute_action`: if `use_ability` returned `ok:false`,
   returns immediately — **nothing is spent on a rejected instant/self
   ability**, confirmed by the same reject-before-spend pattern
   `perform_attack` already uses.
9. On success: `odyssey_apply_turn_costs(entry_id, action_cost, move_cost,
   used_reaction)` + `odyssey_increment_encounter_state_version(encounter_id)`
   — **MAIN is spent only AFTER the ability actually resolved**, same
   discipline as every other action kind in this function.
10. Refreshes the character's combat state and returns the FULL top-level
    result:
    ```
    { ok: true,
      encounter_state_version, character_state_version,
      spent: { action_cost, move_cost, used_reaction },
      result: <use_ability's own result, §7 above>,
      acting_combat_state,
      runtime: <public.odyssey_build_combat_runtime(...)>  }
    ```
    `runtime` here has the SAME `{ encounter, ... }` shape
    `combatSessionController.js`'s `applyExternalRuntime()` already validates
    and applies (confirmed: `odyssey_build_combat_runtime`'s own return
    object has a top-level `'encounter'` key) — this phase's implementation
    reuses the SIMPLER, already-established weapon-attack refresh pattern
    (`refetchCurrent()` + `sessionController.refresh()`) instead of adopting
    a second "apply this embedded runtime blob directly" mechanism, to avoid
    two parallel refresh mechanisms doing the same job; noted here as an
    available-but-unused alternative for a future pass.

**Conclusion for §5/6/7: `combat_execute_action`/`use_ability` is a
complete, already-correct, already-turn/MAIN-gated server-authoritative
execution path for instant/self abilities. No migration is required.**

## 8. Whether MAIN / PSI / cooldown are already consumed server-side

Yes, entirely — MAIN via `combat_execute_action`'s own `odyssey_apply_turn_costs`
(§7.9), PSI/resource + cooldown via `odyssey_use_ability_with_weapon_support`'s
`odyssey_consume_character_ability_cost` (the SAME function every other
ability-cost consumption in this codebase already uses — Phase 4.1A's armed
technique, Phase 4.1B.0's direct ability attack, and the plain ability-cast
path all reuse this one implementation). The client never computes or
locally applies any of these.

## 9. Whether the server returns authoritative runtime/result data

Yes — see §7.10. `combat_execute_action`'s response carries
`character_state_version`/`encounter_state_version`, the full `spent`
breakdown, the ability's own structured `result`, and a complete
`runtime` bundle.

## 10. Whether Debug Console can show a useful trace for non-attack abilities

Yes, using the SAME safe-field discipline as every other Debug Console event
in this codebase (`hud/debug/debugLogStore.js`'s `logDebugEvent`) — the
`use_ability` result's `ability: {code, name, ability_kind, source_type,
effect_mode, effective_level}` and `resource`/`cooldown` fields are exactly
the kind of short, scalar/structured data already shown for attack rolls
(`attackResolutionTrace.js`) and Phase 4.1A's armed-technique events — no
raw JSON dump, no private/GM-only data. This phase reuses that same
established shape rather than inventing a parallel one.

## 11. Whether Combat Log can show a readable non-attack summary

Yes. `hud/log/combatResultLogPolicy.js` already has the exact extensible
pattern (`buildAttackLogEntry`/`buildReloadLogEntry`/`buildFireModeLogEntry`,
all producing `{ timestamp, type, outcome, title, details,
sourceCharacterId, targetCharacterId }`) — this phase adds one more sibling,
`buildAbilityExecutionLogEntry`, reading the server's own `ability.name` /
`spent` / `result` fields, never raw JSON.

## 12. Whether a migration is required

**No.** Unlike Phase 4.1B.0 (where `perform_attack`'s ability-attack
redirect bypassed the session gate — a real, provable gap), `combat_execute_action`'s
`ability` branch already has complete, correct turn-order/MAIN-cost/version
enforcement, already consumes PSI/cooldown correctly, already applies
effects, and already returns a full authoritative result. This satisfies
every migration-justification criterion in the negative — there is nothing
to fix server-side for this ability class.

## 13. Final implementation plan

**Client (HUD) only, no server change:**
1. `hud/abilities/abilityAvailabilityPolicy.js`: add
   `isInstantSelfAbility(action)` — `action.type === "instant" &&
   action.targeting?.mode !== "character" && action.targeting?.mode !==
   "body_part"`. Availability reuses `deriveSlotAvailability` UNCHANGED
   (instant abilities' `available`/`executionAvailable` are not tainted by
   any arm-onto-weapon-attack concern the way Phase 4.1B.0's direct-attack
   abilities were — no new derivation function needed).
2. `hud/abilities/QuickbarView.js`: an instant/self-eligible occupied tile's
   `data-action` becomes `execute-instant-ability` instead of
   `show-ability-detail` (its only click behavior today). A pending
   (in-flight) state is tracked the same way Phase 4.1B.0's direct-attack
   pending state is.
3. `hud/components/CombatHudModule.js`: new `execute-instant-ability` click
   case (guarded by `is-disabled`, same pattern as
   `execute-direct-ability`/`basic-attack`); the existing hover-based detail
   card selector is extended to also cover this new `data-action` (so
   clicking now executes, but hover/focus still shows the honest detail
   card — exactly mirroring how Phase 4.1B.0 handled the same tension for
   attack_technique tiles).
4. New pure modules: `hud/combat/instantAbilityPolicy.js`
   (`evaluateInstantAbilityExecution` — source/turn/no-active-encounter
   preconditions, no target/zone checks at all) and
   `hud/combat/instantAbilityPayload.js`
   (`buildInstantAbilityExecutionPayload` — the exact
   `combat_execute_action` jsonb shape, §7).
5. New command handler in `hud/scene/sceneSelectionController.js`:
   `{ scope: "combat-hud", feature: "quickbar", type:
   "execute-instant-ability", characterActionId }`, reusing
   `findQuickActionByCharacterActionId` (the same lookup helper the
   INVALID_ABILITY hotfix introduced) and the existing `sessionAttackGate`
   (already generic — it only reasons about turn/MAIN, not attack-specific
   fields).
6. On success: `pushLog(buildAbilityExecutionLogEntry(...))`, a
   `logDebugEvent("abilities", "ability-execute-result", ...)` +
   `"ability-execute-cost-consumed"` pair, `refetchCurrent()` (refreshes
   Skills Block cooldown/PSI) and `sessionController.refresh()` (refreshes
   Player Block MAIN) — the SAME two calls the weapon-attack/direct-ability-
   attack handlers already make. Target/body-zone selection is never
   touched (this handler has no target concept at all).
7. On failure: no local resource/cooldown mutation (there never was one),
   the server's real error message surfaces via `ephemeral.commandStatus`.
