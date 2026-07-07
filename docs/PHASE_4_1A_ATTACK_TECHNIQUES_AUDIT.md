# Phase 4.1A — Attack Techniques & ARMED Modifiers: Pre-Implementation Audit

Scope: factual inventory only. No new design decisions are recorded here except
where a table explicitly says "Used in 4.1A" — those choices are justified by
what already exists (see "Canonical source" column) and are expanded on in the
Phase 4.1A implementation report, not invented from scratch.

## 1. Migrations

Highest existing migration: `99_tactical_move_v1_square_path.sql`. Two files
share the number 92 (`92_ability_quickbar_foundation.sql` and
`92_combat_end_turn_fast_path.sql`) — next migration is **`100_...sql`**, safely
after both.

`supabase/odyssey_supabase.sql` is a **concatenated history dump** (every
`create or replace function` ever issued, in migration order) — the *last*
occurrence of a given function name in that file is its logical "current"
body, but several core attack functions (`odyssey_perform_weapon_attack`) are
never fully re-issued after their initial `create or replace` — they are
**hot-patched in place** via `do $$ ... pg_get_functiondef(...) ... execute ... $$`
blocks that introspect the *live* database function at migration-apply time
and text-replace fragments of it (see §3). This means their true current body
cannot be reconstructed from static files alone — only from a live DB.
`perform_attack` itself, by contrast, **is** fully re-issued each time
(14 full redefinitions across history) — its current body is the last one,
in `90_combat_session_foundation.sql` lines 580–897, and I read it in full.

## 2. Source → Table/RPC → Executes today? → Needed for 4.1A

| Source | Real table / RPC | Already executes? | Needed to add |
|---|---|---|---|
| Attack technique definition | `public.odyssey_ability_defs` (`ability_kind='attack'`, `effect_mode='attack'`) + `public.odyssey_ability_level_defs` (per-level `attack_accuracy_bonus`, `attack_damage_bonus`, `attack_armor_pierce`, `ignore_armor`, `cooldown_rounds`, `resource_cost`) | Yes — fully defined, used by the **ability-cast** attack path (`odyssey_perform_ability_attack`, migration 29) | Nothing new to define; **reuse as-is** for the weapon-attack path |
| Per-character technique instance/state | `public.odyssey_character_abilities` (`current_cooldown_rounds`, `current_charges`, `is_enabled`, `learned_level`) | Yes | Nothing new; read/mutate the same row |
| Quickbar metadata (`type`, `costs`, `cooldown`, `state.available`, `disabledReason`) | `odyssey_get_character_quick_actions_runtime` RPC (migration 92) | Yes — metadata only, Phase 4.0 explicitly says "Phase 4.1: execution" in its own comment | Server validation must **independently** re-derive `type='attack_technique'` using the exact same expression (`effect_mode='attack' or ability_kind='attack'`) rather than trust the client's cached copy |
| PSI / charges / cooldown **consume** | `public.odyssey_consume_character_ability_cost(p_character_ability_id uuid)` (migration 47, full body read) | Yes — used today only inside `odyssey_perform_ability_attack` | Reuse verbatim for armed-technique consumption on the weapon path (new call site, no new function) |
| Cooldown **set** after use | Inline `update odyssey_character_abilities set current_cooldown_rounds = v_level.cooldown_rounds` (migration 29, `odyssey_perform_ability_attack` body, ~line 2129) | Yes, ability-cast path only | Same inline update, new call site |
| Weapon attack resolution (hit/miss/damage/ammo) | `public.odyssey_perform_weapon_attack(jsonb)` — hot-patched 6× (migrations 33, 42, 44, 46, 48, 89), never re-issued in full | Yes | **Not modified.** Its true live body can't be safely reconstructed offline (see §3) — 4.1A only feeds it the existing `attack_context.manual_attack_bonus` input, never touches its internals |
| MAIN spend / combat session gate | `public.perform_attack(jsonb)` wrapper (migration 90, full body) calling `odyssey_get_active_participation` / `odyssey_apply_turn_costs` / `odyssey_increment_encounter_state_version` | Yes | Extend this **wrapper** only (it's fully re-issued, safe to edit) — armed-technique validation slots in next to the existing weapon-lock/perk-context checks, before the MAIN spend |
| Canonical additive accuracy modifier grammar | `attack_context.manual_attack_bonus` / `manual_attack_penalty` (already read by `perform_attack`, line 735, and already surfaced in `attackResolutionTrace.js` as `attackManualBonus`/`attackManualPenalty`) | Yes, wired end-to-end today for perk bonuses | Reuse this exact channel for the technique's `attack_accuracy_bonus` — **no new effect grammar needed** |
| Alternative "runtime modifier" grammar | `public.odyssey_collect_runtime_attack_modifiers(runtime_data, attack_type)` reading `{modifiers:[{target,value}]}` off `ability_defs.data`/`ability.data`/`level.data` (migration 87/48) | Yes, but only wired into `odyssey_perform_ability_attack`, not the weapon path | Not used in 4.1A (see §4 — would require hot-patching `odyssey_perform_weapon_attack`, out of scope for this phase) |
| `stack_group` / mutual exclusion | — | **Does not exist anywhere in the schema** (`grep` for `stack_group`, `stackGroup`, `exclusive`, `mutually_exclusive` returns zero hits) | Per spec: don't invent it — enforce "max 1 armed attack technique" both client- and server-side until a real `stackGroup` column exists |
| Weapon-class / weapon-id requirement | `requirements.weaponClass` / `requirements.weaponId` — **always `null`** in the quickbar RPC (migration 92, explicitly commented `-- Phase 4.1: weapon-linked actions`) | No | No canonical source to validate against yet. 4.1A instead checks the one requirement that **does** have a canonical source: `ability_defs.attack_type` (`ranged`/`melee`/`null`) must match the weapon attack's own `attack_type` when both are non-null |

## 3. Why `odyssey_perform_weapon_attack` itself is not touched in 4.1A

That function was renamed from the original `perform_attack` in migration 29,
then modified in place six more times (armor-pierce clamp fixes, armor
absorption, melee armor-pierce enablement, migration 48's universal-modifier
support for the **ability** path only, migration 89's definition refresh).
Every one of those patches works by calling `pg_get_functiondef()` against
the **live, already-migrated** database function and string-replacing a
fragment of its real body — a mechanism that only works with real DB access.
Reconstructing its exact current text by hand from six chained text-replace
diffs, offline, with no way to execute or verify the result, is exactly the
kind of "arbitrary formula reconstruction" the task's own constraints warn
against. **4.1A therefore only feeds `odyssey_perform_weapon_attack` through
its existing, already-safe input surface** (`attack_context.manual_attack_bonus`)
via the `perform_attack` wrapper, which *is* fully re-issued each migration
and whose current text I read in full (migration 90, lines 580–897).

Practical consequence: **only the technique's `attack_accuracy_bonus` is
applied to weapon attacks in 4.1A.** A technique whose resolved
`ability_level_defs` row has a non-zero `attack_damage_bonus`,
`attack_armor_pierce`, or `ignore_armor=true` is rejected at arm-validation
time with `ACTION_EFFECT_NOT_IMPLEMENTED` rather than silently dropping part
of its effect — see §J of the task spec ("не выполнять частично"). This is
the single biggest scope-narrowing decision in this document; it's revisited
in the final report and flagged for 4.1B (once the live
`odyssey_perform_weapon_attack` body can be safely inspected with real DB
access, which only the user has).

## 4. Attack technique field → canonical source → used in 4.1A

| Field | Exists now? | Canonical source | Used in 4.1A |
|---|---|---|---|
| `type === 'attack_technique'` | Yes | `ability_defs.effect_mode='attack' or ability_kind='attack'` (same expression client and server) | Yes — server re-derives it, never trusts the client's cached `type` |
| `costs.psi` | Yes (display only) | `ability_level_defs.resource_cost` when `resource_pool_code='psi'` — **note:** the quickbar RPC's *displayed* `costs.psi` actually reads `ald.data->>'psi_cost'` (a JSON field), a pre-existing Phase-4.0 display/consume field mismatch. Out of scope to fix here; consumption always uses the real `resource_cost` column via `odyssey_consume_character_ability_cost` | Yes — consume path only, unchanged function |
| `costs.charges` | Yes | `odyssey_character_abilities.current_charges` / `max_charges`, consumed via the same function's `reset`/`per_charge` reload-mode branch | Yes |
| `cooldown.current` / `.max` | Yes | `odyssey_character_abilities.current_cooldown_rounds` / `ability_level_defs.cooldown_rounds` | Yes — checked pre-arm and pre-attack, set post-success |
| `requirements.weaponClass` / `.weaponId` | No (always null) | — | Not checked (nothing to check against) |
| Accuracy modifier | Yes | `ability_level_defs.attack_accuracy_bonus` | Yes — injected via `attack_context.manual_attack_bonus` |
| Damage modifier | Yes | `ability_level_defs.attack_damage_bonus` | **No** — `ACTION_EFFECT_NOT_IMPLEMENTED` (see §3) |
| Armor-pierce / ignore-armor | Yes | `ability_level_defs.attack_armor_pierce` / `.ignore_armor` | **No** — `ACTION_EFFECT_NOT_IMPLEMENTED` (see §3) |
| `attack_type` (ranged/melee) as weapon-compat proxy | Yes | `ability_defs.attack_type` | Yes — the one real "requirement" check available; mismatch → `WEAPON_REQUIREMENT_NOT_MET` |
| `stackGroup` | No | — | Not checked — hard rule "max 1 armed technique" instead, both sides |
| `targeting.mode` | Yes | `ability_defs.target_type` (`self`/`character`/`body_part`/`none`/`custom`) | Yes — must be `character` or `body_part` (a technique that only makes sense as its own self-cast ability is rejected with `TARGET_REQUIREMENT_NOT_MET`, since a weapon attack always has an external target already) |

## 5. Client-side precedent for the new ephemeral ARMED state

`hud/scene/selectedWeaponMemory.js` (Phase 3D.1) is the exact pattern to copy
for `armedAttackModifierIdsByCharacterId`: a plain `Map<characterId, ...>`
owned by `sceneSelectionController.js`, validated against the current runtime
on token switch, never persisted to Supabase/OBR metadata, cleared only by
explicit user action or (for ARMED specifically) by an authoritative server
response — never by a bare click on ATTACK.

## 6. AUTO vs ARMED today

Both sections already render in `CombatControlBlock.js` (`renderModifiers`,
~line 60) reading `selectModifierGroups(state)` →
`state.snapshot.modifiers.{passive,narrative,active}` — currently always
empty arrays (no producer wires real data into `active` yet). DOM hooks
(`data-modifier-section="auto"|"armed"`, `data-modifier-state`) already exist,
added in Phase 4.0f specifically for this future wiring.

## 7. Existing quickbar/attack click wiring (nothing to duplicate)

`QuickbarView.js` occupied-tile click → `data-action="show-ability-detail"` →
`CombatHudModule.js` → toast only, never executes (Phase 4.0b, deliberately).
Empty-tile click → `data-action="open-quickbar-editor"` (Phase 4.0i, unrelated
to this phase, must not regress). Basic attack click →
`data-action="basic-attack"` → `sceneSelectionController.js` →
`evaluateBasicAttack` → `sessionAttackGate` → `buildBasicAttackCtx` (payload,
currently hardcodes `modifiers: []`) → `resolveAttack` → `performAttack` RPC
call → response handling (combat log, debug console, refetch). This is the
one and only attack-execution path 4.1A extends.

## 8. Trace / Log / Debug Console — already-reserved fields

`attackResolutionTrace.js`'s normalized shape already has
`accuracy.attackManualBonus` / `attackManualPenalty` (currently always
`NOT_RETURNED` because the payload always sends `modifiers: []`). No shape
change needed to surface the technique's accuracy contribution — only the
payload needs to start sending it. A new `modifiers` trace section
(AUTO/ARMED breakdown, per spec §G) is additive and does not conflict with
the existing shape.

## 9. Error codes — existing convention, and the 4.1A additions

Existing string-code convention confirmed (`CHARACTER_NOT_FOUND`,
`TARGET_NOT_FOUND`, `NO_AMMO`, `ABILITY_ON_COOLDOWN`, `NO_ENERGY`,
`ACTION_NOT_AVAILABLE`, `NOT_CURRENT_TURN`, `STATE_VERSION_CONFLICT`, etc.).
4.1A adds, exactly as specified in the task brief: `ARMED_ACTION_INVALID`,
`ARMED_ACTION_ON_COOLDOWN`, `NOT_ENOUGH_PSI`, `NOT_ENOUGH_CHARGES`,
`WEAPON_REQUIREMENT_NOT_MET`, `TARGET_REQUIREMENT_NOT_MET`,
`ACTION_STACK_CONFLICT`, `ACTION_EFFECT_NOT_IMPLEMENTED`.
