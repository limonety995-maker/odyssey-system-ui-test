# Phase 4.1B.2 — Directed Target Abilities from Skills Block: audit

Audit performed before any behavior change, per the phase's own requirement
("Do not assume from ability names."). All file:line references are against
the repo at the start of this phase (commit `952326f`).

## 1. Existing quickbar runtime action types

Unchanged: `hud/abilities/abilityRuntimeMapper.js`'s `QUICK_ACTION_TYPES` =
`attack_technique | directed | instant | toggle`. This phase's target class
is `directed` — an existing type value that, until now, had NO client-side
execution wiring at all (only `show-ability-detail` on click, per
`hud/abilities/QuickbarView.js`'s pre-4.1B.2 `dataAction` fallback).

## 2. Existing mapped fields (re-confirmed against the live server query)

`supabase/101_quickbar_execution_availability.sql`'s
`odyssey_get_character_quick_actions_runtime` — same single source of truth
already audited in Phase 4.1B.0/4.1B.1's own audit docs:

```sql
'type', case
  when coalesce(ad.effect_mode, '') = 'attack' or ad.ability_kind = 'attack' then 'attack_technique'
  when coalesce(ad.target_type, 'none') in ('character', 'body_part') then 'directed'
  else 'instant'
end,
'targeting', jsonb_build_object(
  'mode', coalesce(ad.target_type, 'none'),
  'minTargets', 1, 'maxTargets', 1,
  'allowAllies', true,
  'allowSelf', ad.target_type = 'self',
  'requiresBodyZone', ad.target_type = 'body_part'
),
```

**Critical finding — `type: "directed"` alone is AMBIGUOUS between two
different sub-cases:** the CASE only tests `target_type in ('character',
'body_part')` — both produce `"directed"`. The one field that actually
distinguishes them is `targeting.requiresBodyZone` (`true` only when
`target_type = 'body_part'`). This is exactly the phase's own suggested
`requiresBodyPart` field, just under its existing project name. So:

- `type === "directed" && targeting.requiresBodyZone === true` → an external-
  target ability that ALSO needs a body zone (out of scope for this phase —
  "body-part attacks beyond existing direct ability attack" is explicitly
  excluded, and no such non-attack ability exists in seed data anyway).
- `type === "directed" && targeting.requiresBodyZone !== true` → **THIS
  phase's target class**: an external-target ability with NO body-zone
  requirement.

No new field is needed — `requiresBodyZone` already exists, already means
exactly this, and is already computed honestly server-side (never guessed).

`costs`/`cooldown`/`state.available`/`state.executionAvailable`/
`state.executionReason`/`state.resourceSufficient` are unchanged from the
prior two phases' audits — same fields, same server-truth-only mapping, no
new computation introduced by this phase.

## 3. Which abilities currently appear as which state

Re-checked against `supabase/30_seed_active_abilities.sql` (still the only
three seeded abilities — no new ability was added by Phase 4.1B.0/4.1B.1):

| code | ability_kind | target_type | client `type` | class |
|---|---|---|---|---|
| `etheric_strike` | attack | body_part | `attack_technique` | direct attack (4.1B.0) |
| `etheric_coating` | defense | self | `instant` | instant/self (4.1B.1) |
| `sensory_concentration` | buff | self | `instant` | instant/self (4.1B.1) |

**No seeded ability has `target_type = 'character'` (or a non-attack
`target_type = 'body_part'`) — none currently produces `type: "directed"`
at all.** This means **no compatible directed-target ability exists in
current test data**, exactly the scenario the phase spec's own fallback
clause anticipates. The implementation below is built and verified entirely
against mocked runtime fixtures (source-contract + pure-logic tests), the
same two-layer pattern every OBR-touching change in this codebase already
uses — see §15/final report for the honest disclosure. The underlying
server/client mechanism is generic and metadata-driven, so it will
correctly recognize and execute a REAL directed ability the moment content
with `target_type = 'character'` is added to `odyssey_ability_defs` —
nothing in this implementation is scoped to a specific ability id/name.

`toggle` remains unreachable (unchanged finding from the 4.1B.0 audit — the
server's `type` CASE has no branch that ever produces it).

## 4. Which runtime metadata identifies a directed target ability

**`action.type === "directed" && action.targeting.requiresBodyZone !== true`**
— sufficient and unambiguous, per §2 above. `targeting.mode === "character"`
is an equivalent, redundant confirmation (both are always in lockstep per
the server's own CASE — `requiresBodyZone` is `true` iff `target_type =
'body_part'`, and `mode` already carries `target_type` verbatim), included
defensively as belt-and-suspenders (this codebase's established pattern —
never trust one field alone), not as a second independent gate.

## 5/6/7. Which server RPC executes this

**`combat_execute_action(jsonb)` with `kind: "ability"` — the SAME RPC
Phase 4.1B.1 already wired up for instant/self abilities. No new RPC.**

Re-reading `odyssey_use_ability_with_weapon_support`
(`supabase/odyssey_supabase.sql:59278-59735`, already read in full for the
4.1B.1 audit) with THIS phase's question in mind — target resolution:

```sql
if v_ability.target_type = 'self' then
  v_target_character_id := v_character_id;
elsif v_target_character_id is null then
  v_target_character_id := v_character_id;
end if;
```

`v_target_character_id` itself is parsed straight from the payload at the
top of the function: `v_target_character_id uuid :=
nullif(trim(coalesce(p_payload->>'target_character_id', '')), '')::uuid;`.
**Read precisely: when `target_type ≠ 'self'` AND the payload supplies a
real `target_character_id`, that value is used verbatim — the function
already, today, fully supports directing an ability at a DIFFERENT
character.** This was already true before this phase; Phase 4.1B.1 simply
never needed to exercise this branch (its two seed examples are
`target_type = 'self'`). No server change of any kind is required to
support directed-target abilities — the exact same `combat_execute_action`
→ `use_ability` → `odyssey_use_ability_with_weapon_support` chain audited
for 4.1B.1 already carries this capability.

`target_body_part_id` is read by this function (`v_target_body_part_id`)
but is **only ever used by the `grant_special` branch's context payload**
(`selected_body_part_id` inside `v_effect_context`, forwarded into
`add_character_effect`'s own `data` blob) — it is NEVER required, and this
phase's ability class (`requiresBodyZone !== true`) has no legitimate value
to send for it anyway, so the client simply never includes this field
(confirmed no other code path treats its absence as an error).

## 8. Whether `perform_attack` must not be used

Confirmed, unchanged from the 4.1B.0/4.1B.1 audits:
`odyssey_use_ability_with_weapon_support` explicitly rejects
`ability_kind = 'attack'`/`effect_mode = 'attack'` abilities
(`ABILITY_REQUIRES_ATTACK_RESOLUTION`), and `perform_attack` only reaches
`odyssey_perform_ability_attack` (a hit-roll/damage resolver, not a generic
effect applicator) when `character_ability_id`/`ability_code` is present —
the two server paths remain mutually exclusive by construction. A directed
target ability (never `ability_kind = 'attack'` by this phase's own scope)
must go through `combat_execute_action`, never `perform_attack`.

## 9. Whether MAIN / PSI / cooldown are already consumed server-side

Yes — unchanged mechanism from 4.1B.1: MAIN via `combat_execute_action`'s
own `odyssey_apply_turn_costs` (spent only after `use_ability` returns
`ok:true`), PSI/resource + cooldown via
`odyssey_use_ability_with_weapon_support`'s
`odyssey_consume_character_ability_cost` call (spent BEFORE effect
application, same timing precedent as every other ability-cost consumption
in this codebase).

## 10. Whether the server applies target effects server-side

Yes. `effect_mode = 'apply_effect'` calls `add_character_effect({
character_id: v_target_character_id, ... })` — writing a real, persisted
effect row on the TARGET's own effects table, not the source's. Read in
full (`supabase/odyssey_supabase.sql:58983` onward): it independently
validates the target character exists and is not soft-deleted
(`CHARACTER_NOT_FOUND` otherwise) — **real, server-side target-existence
validation**, confirming the client never needs (and must not attempt) its
own faction/ownership/validity check; per the phase's own instruction, the
client only checks "is a target actually selected and linked to a real
character," then lets the server authoritatively accept or reject it
(including self-targeting or ally-targeting, which this phase's policy
function deliberately does NOT block — unlike the attack-oriented policies,
which correctly forbid self-targeting for an ATTACK).

`effect_mode = 'grant_special'` similarly operates on the target's own body
parts (`where b.character_id = v_target_character_id`).

**Observed, honest gap (not fixed by this phase):** neither branch performs
any range/line-of-sight check — there is no distance/range-profile
computation anywhere in `odyssey_use_ability_with_weapon_support`, unlike
the attack-resolution functions. This phase's own spec explicitly says
"range/line-of-sight if supported" — it is not supported today for this
ability class, so none is enforced or faked client-side either.

## 11. Whether the server returns enough result/runtime data

Yes — unchanged from 4.1B.1's finding: `combat_execute_action`'s response
includes `spent` (action/move cost + reaction flag),
`encounter_state_version`/`character_state_version`, the ability's own
nested `result` (target_character_id, ability metadata, resource,
`result.result` — `{effects:[...]}`/`{special:...}`/`{narrative_only:true}`
depending on effect_mode, and `combat_state` — the TARGET's own refreshed
combat state, already included in the response), and a full authoritative
`runtime` bundle.

## 12. Whether Debug Console can show a useful trace

Yes, using the same safe-field discipline as 4.1B.0/4.1B.1's own events —
`ability`/`resource`/`cooldown` plus, new for this phase,
`sourceCharacterId`/`targetCharacterId`/`targetTokenId` (all already
present in the HUD's own ephemeral state — no new lookup needed).

## 13. Whether Combat Log can show a readable directed-ability summary

Yes — `hud/log/combatResultLogPolicy.js`'s established
`buildXLogEntry`-per-action-class pattern extends cleanly: a new
`buildDirectedAbilityLogEntry` reads the same normalized fields
`buildAbilityExecutionLogEntry` (Phase 4.1B.1) already exposes, plus the
target's display name, to produce `"Source used [Ability] on Target."`.

## 14. Whether a migration is required

**No.** Exactly the same conclusion as Phase 4.1B.1, for the same reason:
`combat_execute_action`/`use_ability` already fully support an external
`target_character_id`, already gate turn/MAIN/PSI/cooldown correctly,
already apply effects to the correct (target) character, already validate
target existence, and already return a complete authoritative result. There
is nothing to fix server-side.

## 15. Final implementation plan

**Client (HUD) only, no server change:**
1. `hud/abilities/abilityAvailabilityPolicy.js`: add
   `isDirectedTargetAbility(action)` — `action.type === "directed" &&
   action.targeting?.requiresBodyZone !== true`. Availability reuses
   `deriveSlotAvailability` UNCHANGED (same reasoning as 4.1B.1 — this
   class's `available`/`executionAvailable` are not tainted by anything).
2. `hud/abilities/QuickbarView.js`: a directed-target-eligible occupied
   tile's `data-action` becomes `execute-directed-ability`. Pending state
   tracked the same way as the other two execution classes.
3. `hud/components/CombatHudModule.js`: new `execute-directed-ability`
   click case; hover-detail selector extended to cover it too.
4. New pure modules: `hud/combat/directedAbilityPolicy.js`
   (`evaluateDirectedAbilityExecution` — source/turn/active-encounter/
   target-selected-and-linked checks ONLY; explicitly no body-zone check,
   no self-target block, per the phase's own instruction) and
   `hud/combat/directedAbilityPayload.js`
   (`buildDirectedAbilityExecutionPayload` — the `combat_execute_action`
   jsonb shape with `intent.target_character_id` added, §5-7).
5. New command handler in `hud/scene/sceneSelectionController.js`:
   `{ scope: "combat-hud", feature: "quickbar", type:
   "execute-directed-ability", characterActionId }`, reusing
   `findQuickActionByCharacterActionId` and the generic `sessionAttackGate`,
   reading the SAME `ephemeral.targeting` state weapon-attack/direct-ability-
   attack already read (never a second target source, never Owlbear's
   native selection).
6. On success: `pushLog(buildDirectedAbilityLogEntry(...))`, the full
   `directed-ability-*` Debug Console event sequence, `refetchCurrent()` +
   `sessionController.refresh()` (same two calls as 4.1B.1), PLUS a
   best-effort `refreshBodyZones` broadcast for the target (mirroring
   weapon-attack's own post-attack refresh) with its own
   `target-refresh-result` debug event. Target/zone selection is never
   reassigned or cleared.
7. On failure: no local resource/cooldown/effect mutation, the server's
   real error message surfaces.
