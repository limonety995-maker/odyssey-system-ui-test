# Phase 4.1B.3 — Toggle / Stance / Maintained Abilities: audit

Baseline: `HEAD=f522554` (1.8.73), after the Ability Studio revert. Ability Studio
stays removed; this phase does not touch it.

## 1. Existing quickbar runtime action types

The live `odyssey_get_character_quick_actions_runtime` body (last redefined in
`104_ability_timeout_hotfix.sql` — verified no later migration touches it: `105`,
`106`, `107`, `108` were grepped for the function name, no matches) derives `type`
with exactly this CASE, and nothing else:

```sql
'type', case
  when coalesce(ad.effect_mode, '') = 'attack' or ad.ability_kind = 'attack' then 'attack_technique'
  when coalesce(ad.target_type, 'none') in ('character', 'body_part') then 'directed'
  else 'instant'
end,
```

**There is no `'toggle'` branch anywhere on the server today.** Every non-attack,
non-character/body_part-target ability — including anything that conceptually
reads as a toggle/stance — is typed `'instant'`.

## 2. How `action.type === "toggle"` is currently produced

It isn't. Client-side, `hud/abilities/abilityRuntimeMapper.js`'s `QUICK_ACTION_TYPES`
already lists `toggle` as a valid enum value (added defensively in Phase 4.0), and
`normalizeType()` passes through `raw.type === "toggle"` if the server ever sent it
— but its own comment is explicit: *"toggle/directed can't be safely inferred →
default to the inert 'instant'"*. Since the server never sends `type:"toggle"`,
this passthrough is dead code today. No name-based or heuristic inference exists
anywhere in the client for toggle detection.

## 3. Runtime fields present today

| Field | Present? | Notes |
|---|---|---|
| `state.active` | present, **always hardcoded `false`** | `'active', false, -- Phase 4.1` literally in the SQL — never read from any table |
| `state.available` | present | computed from `is_enabled`, skip-turn, alive/target_type, cooldown, resource sufficiency, unsupported-attack-effect |
| `state.executionAvailable` | present | `not unsupported_effect` (attack-only concept, migration 101/104) |
| `state.executionReason` | present | `'ACTION_EFFECT_NOT_IMPLEMENTED'` or `null` — attack-only |
| `state.resourceSufficient` | present | pool/charges check |
| cooldown | present | `current`/`max`/`unit` from `odyssey_character_abilities.current_cooldown_rounds` / `odyssey_ability_level_defs.cooldown_rounds` |
| costs | present | `main`/`move`/`psi`/`charges` — `psi` field is bugged (checks `resource_pool_code='psi'`, real data uses `'psionic_energy'`; pre-existing, out of scope) |
| duration | **not surfaced to quickbar runtime at all** | `odyssey_ability_level_defs.duration_rounds` exists and is used when applying an effect, but is never returned in the quick-actions payload |
| upkeep | **does not exist anywhere in the schema** | no per-turn resource-drain mechanism exists for abilities; `advance_character_ability_states`/`advance_character_effects` only tick cooldowns and effect *duration* countdown, never spend a resource per turn |
| active effect id | **not surfaced** | the effect row exists (see §5) but its id is never returned to the client |
| active status/effect payload | **not surfaced** | same |

## 4. Does Skills Block already show ON/active markers?

No. `mapState()` in `abilityRuntimeMapper.js` reads `s.active` verbatim, but since
the server always sends `false`, no ON marker has ever rendered for any ability,
and nothing in `QuickbarView.js`/`AbilityTooltip.js` currently branches on
`state.active` to show one (confirmed by grep — no `.active` marker CSS/markup
exists for quickbar tiles).

## 5. Is the active marker tied to server state or purely visual?

Neither exists yet, but the schema already contains the *data* needed to derive
one honestly, without a new column: `odyssey_character_effects` (schema
`21_effect_engine_schema.sql`) stores `source_id` — populated with
`character_ability_id::text` every time `add_character_effect` is called from an
ability's `apply_effect` branch (confirmed in
`88_weapon_abilities.sql`'s `odyssey_use_ability_with_weapon_support`, which is
the function actually executing today under the renamed
`odyssey_use_ability_with_weapon_support_legacy` — see §6) — plus `is_active`
(boolean, flipped to `false` by the already-existing `remove_character_effect(uuid)`
RPC). So: *"is ability X currently active for this character"* ⇔ *"does an
`odyssey_character_effects` row exist with `source_id = character_ability_id` and
`is_active = true"* — this fact already exists in the data; only the query never
reads it today.

## 6. Server execution paths

- `combat_execute_action(jsonb)` (`104_ability_timeout_hotfix.sql`): for
  `kind:'ability'`, unconditionally does
  `v_result := public.use_ability(v_intent || jsonb_build_object('encounter_id', ...))`
  — **no inspection of the ability's `activation_type` at all**. It cannot
  currently route a toggle ability anywhere different from an instant ability.
- `use_ability(jsonb)` (last redefined `106_universal_granted_abilities.sql`):
  now a thin wrapper — validates weapon lock/source, then calls
  `odyssey_use_ability_with_weapon_support(jsonb)`.
- `odyssey_use_ability_with_weapon_support(jsonb)` (also redefined in `106`): only
  handles `effect_mode = 'activate_weapon_feature'` abilities (weapon-bridge
  abilities); for **everything else** it falls through to
  `odyssey_use_ability_with_weapon_support_legacy` — a function `106` itself
  renames from the *previous* `odyssey_use_ability_with_weapon_support` body,
  which lives verbatim in `88_weapon_abilities.sql` (confirmed identical to what
  I originally read from `56_creator_abilities.sql`'s inline `use_ability` before
  it was split out). This is the actual, currently-executing logic for
  `apply_effect`/`grant_special`/narrative abilities.
- That function's `apply_effect` branch: **always** calls `add_character_effect`
  once, unconditionally. There is no check for "is this effect already active" and
  no branch that calls `remove_character_effect` instead. Clicking the same
  ability twice today just re-applies (or re-stacks, depending on
  `add_character_effect`'s own upsert behavior — not relevant to this audit) the
  effect; it never turns anything "off."
- `odyssey_consume_character_ability_cost` / `advance_character_ability_states`:
  spend resource + set cooldown exactly once per activation; no upkeep concept
  exists in either.

### Answering the 10 sub-questions directly

1. Does `combat_execute_action` accept a toggle ability? — Yes, as a normal
   `kind:'ability'` call, but it always executes the "apply effect" branch; it has
   no toggle-off behavior.
2. Does clicking the same toggle again turn it OFF? — **No.** Confirmed: no code
   path checks for an existing active effect before re-applying.
3. Does the server distinguish ON from OFF? — **No** (see §3/§5 — the data to
   derive it exists, but nothing reads or writes it as an on/off state today).
4. Does the server apply active effects? — Yes, via `add_character_effect`
   (works today, used by instant/self and directed classes already).
5. Does the server remove active effects? — Yes, `remove_character_effect(uuid)`
   exists and works (sets `is_active=false`), but nothing calls it from an
   ability-activation click today.
6. MAIN cost: — spent once, on activation only, for every existing non-toggle
   ability; never on deactivation (no deactivation exists); never as upkeep (no
   mechanism exists).
7. PSI/resource cost: — same as MAIN — activation only, no deactivation cost
   concept, no upkeep mechanism.
8. Cooldown: — set once on activation, ticks down every turn regardless of
   anything else; no deactivation-triggered cooldown exists.
9. Does the server return authoritative runtime/result? — Yes,
   `combat_execute_action` always returns `combat_state`/`encounter_state_version`
   /`character_state_version` on success, reusable unchanged.
10. Is a migration required? — **Yes.**

## 7. Existing ability data

Searched all seed files (`30_seed_active_abilities.sql` and the creator-catalog
seeds) for anything resembling a toggle/stance ability. Found one candidate by
shape, "Sensory Concentration" (`sensory_concentration`,
`activation_type='manual'`, `target_type='self'`, `effect_mode='apply_effect'`,
with a `duration_rounds` level field) — but this is a **timed buff** (already
correctly served by the existing Instant/Self class), not a manually-toggled
ON/OFF ability. No ability anywhere in current data uses (or could use, since the
enum doesn't allow it) `activation_type='toggle'`. **No real toggle/stance/
maintained ability exists in current data.** Manual verification against a live
example is therefore not possible this phase (see §Manual verification in the
final report) — consistent with how Phase 4.1B.2 shipped with no
`target_type='character'` seed ability either.

## 8. Final plan: Path B — small, additive migration

The gap is real (confirmed above) but closeable without inventing an effect
scripting engine, by generalizing the exact pattern every other ability class
already uses (`odyssey_consume_character_ability_cost` once + `add_character_effect`
once + cooldown once), adding exactly one symmetric case: *if already active,
remove the effect instead of adding one, for free.*

Design decisions this migration makes explicit (none has any existing precedent
to contradict, since no toggle ability exists yet):

- **Activation cost**: spent once, only when turning ON — identical to every
  existing ability's cost consumption; not invented.
- **Deactivation cost**: **none.** Turning off is always free. This is the
  simplest, safest default and avoids inventing a refund/partial-cost system with
  no requirement backing it.
- **Cooldown**: applied **on activation only** — identical to every other
  ability class already in this codebase (reusing
  `odyssey_use_ability_with_weapon_support_legacy` unchanged for the ON
  transition means this falls out for free, not as a separate invented rule).
  Deactivation never sets or resets cooldown. Combined with the
  availability fix below, an already-active toggle stays clickable (to turn
  off) even while its own activation cooldown is still counting down — cooldown
  only ever blocks a fresh *activation*, never a deactivation.
- **Upkeep**: **not implemented.** No per-turn resource-drain mechanism exists
  anywhere in this schema to hook into safely, and inventing one is explicitly
  out of this phase's scope (no "complex scripting language", no new resource
  mechanics). Toggle abilities in this phase cost only once, on activation.
- **Availability while active**: since deactivation is free, a toggle that is
  currently active must remain clickable (to turn off) even if its resource pool
  has since dropped below the activation cost — the runtime query's `available`
  formula gets exactly one added `or is_active` term for the resource/cooldown
  sub-conditions, nothing else changes for non-toggle rows.

### Migration `109_toggle_ability_execution.sql` (new file; the previous `109` was
Ability Studio's and no longer exists in this tree after the revert)

1. Widen `odyssey_ability_defs.activation_type` check constraint to add
   `'toggle'` (same drop/recreate pattern `102`/`106` already used for
   `source_type`/`effect_mode`).
2. `create or replace function public.odyssey_get_character_quick_actions_runtime`
   — verbatim copy of the `104` body plus: a `toggle` branch in the `type` CASE
   (checked after the attack check, before directed/instant), a real
   `is_active` computation (the `exists(...odyssey_character_effects...)` query
   from §5), `state.active` set from it instead of hardcoded `false`, and the
   `or is_active` addition to the availability formula described above.
3. `create or replace function public.combat_execute_action` — verbatim copy of
   the `104` body, plus: for `kind:'ability'`, resolve the target
   `character_ability_id` and its `activation_type` first; if `'toggle'`, call
   the new `toggle_character_ability` instead of `use_ability`; every other kind
   and every non-toggle ability keeps calling exactly what it calls today,
   unchanged.
4. New function `public.toggle_character_ability(jsonb)` — validates the ability
   is `activation_type='toggle'`; looks up any existing active effect by
   `source_id = character_ability_id`. If found: deactivates it directly (flips
   `is_active=false` on that one row, free, no cost, no cooldown change) and
   returns `active:false`. If not found: delegates the ENTIRE activation —
   cost consumption, cooldown, and effect application — to the existing,
   completely unchanged `odyssey_use_ability_with_weapon_support_legacy(jsonb)`
   (the same function instant/self abilities already execute through), then
   returns its result augmented with `active:true`. Zero effect-resolution
   logic is duplicated.

Migration created but **NOT applied remotely** (no `supabase db push` /
`migration up`), per standing project rule.

## 9. What this phase does not do

No area/AOE/cone/multi-target/reaction/passive/GM-prompt mechanics are touched.
No Ability Studio code is restored. No weapon/ammo/magazine/fire-mode/body-zone
field is ever added to the toggle payload. No existing execution class's
behavior changes — `attack_technique`/`directed`/`instant` keep their exact
existing CASE branches; only a new, mutually-exclusive `toggle` branch is added
ahead of them being reached (an ability def can only be one activation_type,
so there is no overlap).
