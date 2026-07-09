# Phase 4.1C.0 — Ability Studio Foundation: audit

Baseline: `HEAD=71fed75` (1.8.73), after the 2026-07-09 upstream tree-adoption sync.
Migrations referenced below are numbered as they exist in this fork **today**
(upstream independently claimed 90–107 during that sync; the fork's own
direct-ability-attack fix now lives at `108_direct_ability_attack_session_gate.sql`,
not `102`).

## 1. Ability schema

**Catalog (ability definitions):**
- `odyssey_ability_defs` (created `29_active_abilities_schema.sql`, columns extended by
  `56_creator_abilities.sql`, `60_minimal_perk_system.sql`, `102_character_ability_reconcile.sql`,
  `106_universal_granted_abilities.sql`) — the ability template: `code`, `name`, `ability_kind`,
  `source_type`, `activation_type`, `target_type`, `effect_mode`, `attack_type`, `linked_skill_id`,
  `resource_mode`, `resource_pool_code`, `resource_item_code`, `description`, `data` (jsonb),
  `effect_data` (jsonb), `tags`, `is_custom`, `sort_order`.
- `odyssey_ability_level_defs` (`29_active_abilities_schema.sql`) — per-level tuning:
  `ability_level` (1–5), `resource_cost`, `cooldown_rounds`, `range_profile_id`,
  `attack_accuracy_bonus`, `attack_damage_bonus`, `attack_armor_pierce`, `ignore_armor`,
  `special_armor_value`, `special_max_critical`, `duration_rounds`, `data`, `effect_data`.
- `odyssey_ability_grants` (`102_character_ability_reconcile.sql`, extended `106_universal_granted_abilities.sql`)
  — links an ability to a **source** (`source_type` in `skill|perk|item|equipment|weapon`, plus
  `armor|implant|prosthetic` added by 106's constraint widening for `odyssey_ability_defs.source_type`
  only — the grants table itself still only allows the original five) + `source_def_id` + `min_level`.
  This table, not `odyssey_character_abilities`, is what actually determines who *can* get an
  ability — see §3 below.

**Character-owned abilities:**
- `odyssey_character_abilities` (`29_active_abilities_schema.sql`) — one row per character×ability
  instance: `character_id`, `ability_def_id`, `character_skill_id` (nullable),
  `source_equipment_item_id`/`source_character_item_id`/`source_character_weapon_id` (all nullable
  — a row with all three null is schema-legal), `learned_level`, `is_enabled`, `is_hidden`,
  `current_cooldown_rounds`, `current_charges`, `max_charges`, `data` (jsonb, carries
  `generated`/`generated_from`/`source_removed` bookkeeping — see §3), `notes`, `sort_order`.
  RLS: `for all ... using (true) with check (true)` for `anon, authenticated` — fully open,
  same pattern as every other odyssey_* table (RLS redesign is explicitly out of scope for this phase).

**Quickbar layout:**
- `odyssey_character_quickbar_layouts` (`92_ability_quickbar_foundation.sql`) — one row per
  character, `layout` jsonb `{ slots: [{ slotIndex, characterActionId, empty }] }`, `version`
  (optimistic lock). Layout is a UI preference; it references `odyssey_character_abilities.id`
  values but does not itself grant/revoke anything.

## 2. Field → column mapping

| Studio field | Table.column |
|---|---|
| name | `odyssey_ability_defs.name` |
| description | `odyssey_ability_defs.description` |
| icon | `odyssey_ability_defs.data->>'icon_key'` (mapper defaults to `'bolt'` if absent) |
| semantic kind | `odyssey_ability_defs.ability_kind` (`attack\|buff\|support\|defense\|passive\|utility\|narrative\|custom`) |
| action type (HUD) | **derived server-side**, not stored — see §5 |
| target type | `odyssey_ability_defs.target_type` (`self\|character\|body_part\|none\|custom`) |
| body-zone requirement | derived: `target_type = 'body_part'` (no separate column) |
| cost (MAIN) | derived: `resource_mode = 'pool'` → 1, else 0 (not a stored numeric) |
| PSI cost | `odyssey_ability_level_defs.resource_cost`, surfaced only when `ability_defs.resource_pool_code = 'psi'` — **known bug**: every current ability uses `'psionic_energy'`, so this always renders 0 in the HUD; unrelated to Ability Studio, not fixed here (see handoff item, unchanged). |
| MAIN/action cost | same as "cost (MAIN)" above — binary, not a level field |
| cooldown | `odyssey_ability_level_defs.cooldown_rounds`; runtime current value on `odyssey_character_abilities.current_cooldown_rounds` |
| effect type | `odyssey_ability_defs.effect_mode` (`attack\|apply_effect\|grant_special\|activate_weapon_feature\|narrative\|custom`) |
| damage/effect payload | `odyssey_ability_level_defs.attack_damage_bonus/attack_armor_pierce/ignore_armor` (attack); `effect_data`/`data.effect_links` (apply_effect); `special_armor_value/special_max_critical` (grant_special) |
| requirements | `odyssey_ability_defs.linked_skill_id` (soft), range via `data.range.{mode,max_distance_m}` — no weapon-class/weapon-id requirement column exists yet (same pre-existing gap `108`'s header already documents for armed techniques) |
| enabled/disabled | `odyssey_ability_defs` has no def-level enable flag; enable/disable is per-character-instance: `odyssey_character_abilities.is_enabled`/`is_hidden` |

## 3. Fields required by each consumer

- **Quickbar runtime mapper** (`odyssey_get_character_quick_actions_runtime`, latest body in
  `104_ability_timeout_hotfix.sql` — see §5 for why 104 and not 92/101/102/103 wins): reads
  `ad.effect_mode`, `ad.ability_kind`, `ad.target_type`, `ad.resource_mode`, `ad.resource_pool_code`,
  `ad.data->>'icon_key'`, `ald.attack_damage_bonus/attack_armor_pierce/ignore_armor`,
  `ald.cooldown_rounds`, `ald.resource_cost`, plus `odyssey_character_abilities.current_cooldown_rounds/current_charges/is_enabled/is_hidden`.
- **`perform_attack` / migration 108 (Direct Ability Attack)**: needs the ability to route through
  `odyssey_perform_ability_attack`, which requires `effect_mode='attack'` (or `ability_kind='attack'`)
  AND at least one of `attack_damage_bonus/attack_armor_pierce/ignore_armor` set on the active level
  (this is exactly what flips `executionReason` to `ACTION_EFFECT_NOT_IMPLEMENTED` for the ARMED path
  and makes it eligible for direct-attack instead).
- **Instant/self ability** (`combat_execute_action` kind `"ability"` → `use_ability`): needs
  `target_type` NOT in `('character','body_part')` and NOT an attack ability. `effect_mode` decides
  behavior inside `use_ability`: `apply_effect` (needs `data.effect_links` or `effect_data.effect_code`),
  `grant_special` (needs a `'special'` body part + `special_armor_value`/`special_max_critical`), or
  narrative-only fallback.
- **Directed target ability**: needs `target_type = 'character'` (not `body_part`) and not an attack
  ability; same `use_ability` effect-mode branching as instant/self, with `target_character_id` from
  the intent instead of defaulting to self.
- **ARMED attack technique**: needs `effect_mode='attack'` (or `ability_kind='attack'`) with **all**
  of `attack_damage_bonus/attack_armor_pierce/ignore_armor` clear on the active level (this is the
  complement of the Direct Ability Attack condition above).

## 4. Existing RPCs — what already works

All of the following are already implemented, already used elsewhere in this codebase, and require
**no migration**:

| Studio capability | RPC | Location | Status |
|---|---|---|---|
| list ability catalog | `creator_list_abilities` | `36_creator_catalog_rpcs.sql` | done, wired (`api/creatorApi.js#listAbilities`) |
| get ability detail | `creator_get_ability` → `odyssey_creator_build_ability_bundle` | `36` | done, wired (`getAbility`), returns full bundle incl. levels + weapon/equipment/item links |
| create/update ability definition | `creator_upsert_ability` | `36`, **redefined by `56_creator_abilities.sql`** (56 is the live version — confirmed not touched again in 90-108) | done, wired (`upsertAbility`); full server-side validation (code format/uniqueness, enum checks, level 1-5 uniqueness, effect_links existence, range consistency) |
| delete ability definition | `creator_delete_ability` | `56` | done, wired (`deleteAbility`); refuses delete while referenced by `odyssey_character_abilities`/weapon/equipment/item links |
| list character's abilities | `get_character_abilities` | `102_character_ability_reconcile.sql` (latest) | done, used by character sheet; also runs `odyssey_reconcile_character_abilities` as a side effect |
| refresh quickbar runtime | `odyssey_get_character_quick_actions_runtime` | latest body `104_ability_timeout_hotfix.sql` | done, already wired in `hud/abilities/abilityApi.js`-adjacent path (`ABILITY_RPC_NAMES.getQuickActionsRuntime`) |
| **validate ability definition** | — | — | **no dedicated "dry run" RPC** — `creator_upsert_ability` validates and writes in one step (no separate validate-only mode). Studio must do its own client-side pre-check (mirroring the same rules) before calling upsert, and treat upsert's own validation errors as the authoritative source of truth. |
| **assign ability to character** | — | — | **does not exist** — see §3/§6 |
| **remove ability from character** | — | — | **does not exist** as a dedicated RPC (see §6) |

A general-purpose, template-based, form-driven ability editor **already exists**:
`shell/creatorMenu.js` (6808 lines total; ~2900 of them ability-specific — draft normalization,
per-template field visibility via `abilityUsesAttackFields`/`abilityUsesEffectLinks`/
`abilityUsesSpecialFields`, auto-tag generation, level-array editing), mounted as the "Creator" tab
of `gm-extension` (`gm-extension/screens/creator/creatorScreen.js` → `mountCreatorMenu`). It is
**not** a raw JSON editor — it already satisfies "template-based builder" for general game-design
authoring. It has no concept of the HUD's 4 execution classes or a classification preview, and no
character-assignment workflow — that is the actual gap Ability Studio fills, not ability CRUD itself.

**GM character picker** for the Assign view can reuse `getCharacterSpawnCatalog`
(`api/characterPlacementApi.js`, already used by `gm-extension`'s Placement screen) rather than
inventing a new listing RPC.

## 5. Runtime classification — exact metadata

Confirmed against the **actually-live** function body (redefined in 92 → 100(untouched) → 101 →
102 → 103 → **104, which is the last migration to touch it** — 105/106/107/108 do not redefine
`odyssey_get_character_quick_actions_runtime`, verified by grep across all of them):

```
type =
  attack_technique   if effect_mode='attack' OR ability_kind='attack'
  directed           elif target_type in ('character','body_part')
  instant            else

executionReason = 'ACTION_EFFECT_NOT_IMPLEMENTED' when
  (active level's attack_damage_bonus <> 0 OR attack_armor_pierce <> 0 OR ignore_armor = true)
  — computed for every ability row, but only load-bearing for type='attack_technique'.

targeting.requiresBodyZone = (target_type = 'body_part')
```

| HUD classification | Condition (client-side, `hud/abilities/abilityAvailabilityPolicy.js`) |
|---|---|
| ARMED attack technique | `type==='attack_technique'` AND executionReason is **not** `ACTION_EFFECT_NOT_IMPLEMENTED` |
| Direct ability attack | `type==='attack_technique'` AND executionReason **is** `ACTION_EFFECT_NOT_IMPLEMENTED` (`isDirectAttackAbility`) |
| Instant / self ability | `type==='instant'` (`isInstantSelfAbility`) — this already covers `target_type` in `('self','none','custom')` |
| Directed target ability | `type==='directed'` AND `targeting.requiresBodyZone !== true` (`isDirectedTargetAbility`) — i.e. `target_type='character'` |
| **Unsupported** | `type==='directed'` AND `targeting.requiresBodyZone === true` (a **non-attack** `target_type='body_part'` ability — e.g. "apply a splint to a chosen limb") — confirmed by `isDirectedTargetAbility`'s own doc comment: this combination is "deliberately OUT of scope ... falls through to the existing show-ability-detail click", i.e. no execute button in Skills Block today. This is a genuine, pre-existing gap, not something Ability Studio introduces. |

No name-based logic exists anywhere in this chain — confirmed by reading the live SQL and the
existing classifier module directly (not from memory/handoff).

## 6. Security / authority

1. **Should only GM access Ability Studio?** Yes — creating/editing catalog definitions and
   assigning abilities to any character are GM actions; players should not reach this surface.
2. **Does client-side GM gating already exist?** Yes — `shell/creatorMenu.js:5116` gates on
   `player?.role === "GM"` and line 4553 shows a "Creator tools are GM-only" notice for non-GMs.
   `gm-extension` itself is a separate popover/extension registered independently in
   `gm-extension/manifest.json` (not the player-facing `manifest.json`), so a non-GM installing only
   the main extension never sees it at all; a GM's own client still applies the role check as
   defense-in-depth.
3. **Does server-side validation exist?** Yes, but only for **field-level correctness**
   (`creator_upsert_ability`'s extensive checks), not for **caller authority** — no RPC in this
   codebase checks `auth.role()`/a GM claim before running. This is the existing, pre-established
   pattern for every `creator_*` RPC (weapons, items, perks, effects, equipment) — Ability Studio's
   new RPC will follow the identical, already-accepted convention, not introduce a new gap.
4. **Is creating abilities through existing RPCs safe?** Yes — `creator_upsert_ability` is already
   live, already used by the Creator tab, and already covers everything Ability Studio's
   create-from-template flow needs to write.
5. **Are new RPCs required?** Yes — one, for character assignment (see below). Everything else
   (list/detail/create/update/delete/classification/quickbar-refresh) reuses existing RPCs.
6. **Are migrations needed?** Yes — one small migration, described below.

### Why assignment specifically needs a migration

`odyssey_character_abilities` rows are today produced **exclusively** by
`odyssey_reconcile_character_abilities`, which only ever inserts a row when the character already
has a matching `skill`/`perk`/`item`/`equipment`/`weapon` **and** a matching row in
`odyssey_ability_grants` (or a legacy `linked_skill_id`) ties that source to the ability. There is
no "GM directly grants ability X to character Y, independent of any source" path — the
`odyssey_ability_grants.source_type` check constraint only allows
`('skill','perk','item','equipment','weapon')`; there is no `'manual'`/`'direct'` option, and no RPC
inserts into `odyssey_character_abilities` without going through one of those five source joins.
Reusing `grant_character_perk` (the closest existing analogue, for perks) would mean granting the
character an entire unrelated perk just to backdoor one ability — dishonest and out of scope.

The table itself is schema-legal for a sourceless row (`source_equipment_item_id`/
`source_character_item_id`/`source_character_weapon_id` are all nullable, no CHECK forbids all-null),
and `odyssey_reconcile_character_abilities`'s four cleanup passes each key off a specific
`data->>'generated_from'` string (`'skill'`/`'perk'`/`'item'`/`'equipment'`) — a row tagged
`generated_from: 'direct'` is never touched by any of them, confirmed by reading each cleanup
`UPDATE ... WHERE` clause in `102_character_ability_reconcile.sql` and `106`. A new, narrowly-scoped
RPC that inserts exactly such a row is therefore safe and additive.

## 7. Final plan

**Path B — small migration needed.** Catalog CRUD, detail, classification preview, and
quickbar-runtime refresh need **zero** new backend work (existing RPCs, existing tables). Character
assignment needs one new RPC. Concretely:

- New file: `supabase/109_ability_studio_assignment.sql`, adding:
  - `creator_assign_ability_to_character(p_ability_def_id uuid, p_character_id uuid)` — validates
    both ids exist, inserts a `generated_from: 'direct'`-tagged `odyssey_character_abilities` row
    (or re-enables/un-hides an existing one on conflict), mirrors `odyssey_reconcile_character_abilities`'s
    own insert shape (character_skill_id/source_*_id all null, `is_enabled=true`, `is_hidden=false`,
    `learned_level=1`, `sort_order` from the ability def).
  - `creator_remove_character_ability(p_character_ability_id uuid)` — deletes a single
    `odyssey_character_abilities` row, but **only** when it is a `generated_from: 'direct'` row (refuses
    with a clear error for skill/perk/item/equipment/weapon-generated rows, which must be revoked by
    removing their real source instead — deleting those out from under the reconcile function would
    just have it recreate them next reconcile pass, which would be a silent no-op bug if allowed).
- Migration is **created but will not be applied remotely** (no `supabase db push`/`migration up`),
  per standing project rule.
- Everything else (list/detail/create/update/delete/classification preview/quickbar refresh) is
  implemented purely in the frontend against existing RPCs.

## 8. Placement decision

New 4th tab in `gm-extension` (alongside existing Shell/Creator/Placement tabs), added the same way
Creator/Placement already are in `gm-extension/main.js`: a new `screens/abilityStudio/abilityStudioScreen.js`
module + a `data-view="ability-studio"` nav button + host div. This is architecturally already
"a separate GM/admin tool surface" — `gm-extension` is its own OBR extension/popover, entirely
outside the combat HUD's DOM, event handlers, and OBR scene-click listeners, so it cannot interfere
with map clicks, targeting, movement, or quickbar execution by construction (no shared code path,
no shared globals other than the read-only `runtime` object every gm-extension screen already
receives).

## 9. What Ability Studio is NOT doing (reuse, not rebuild)

- Not duplicating the general ability-authoring form already in `shell/creatorMenu.js` — Ability
  Studio's "create from template" is a thinner, HUD-execution-class-first wrapper around the same
  `creator_upsert_ability` RPC, pre-filling/locking the specific field combination each of the 4
  templates needs (see Template rules in the task spec) rather than re-implementing full free-form
  authoring.
- Not re-deriving classification logic — reuses `hud/abilities/abilityAvailabilityPolicy.js`'s
  existing pure classifiers (`isDirectAttackAbility`/`isInstantSelfAbility`/`isDirectedTargetAbility`)
  unchanged, fed from the same `odyssey_get_character_quick_actions_runtime` shape via a thin
  catalog-side adapter (catalog entries don't have `state`/`cooldown` yet since they aren't
  character-owned — the preview synthesizes the same `type`/`targeting.requiresBodyZone` fields
  from the catalog bundle's `ability_kind`/`effect_mode`/`target_type`/level data, using the exact
  same CASE logic as §5, not a re-guess).
