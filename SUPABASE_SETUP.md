# Odyssey Supabase Setup

Stages 1 through 3 are now the hard database migration path toward the new rule-based Odyssey structure.

Stage 4A extends that path with Effect Engine v1.

Stage 4B extends it further with Armor & Equipment Foundation.

Stage 4C extends it further with Weapon Features & Weapon Profiles.

Stage 4D extends it further with Consumables, Ammo Stock & Item Actions Foundation.

Stage 4E extends it further with Active Abilities & Resource Pools.

Stage 5A hard-cleans the Owlbear frontend/runtime layer. The active extensions are now bridge shells only. They are intentionally minimal and no longer include the old combat console, overlay runtime, or the old local JS combat implementation.

Stage 5B extends it further with the Creator / Catalog backend.

The current post-Stage-4E safety hotfix also adds:

- signed `armor_pierce` preservation in weapon attacks
- armor-critical absorption that uses the targeted body-part armor snapshot as the authoritative cap
- temporary suppression of automatic `is_alive = false` during attack resolution, replaced with manual/pending death checks
- GM maintenance RPCs for full body healing and armor repair on real body parts only

## Stage 1 scope

Stage 1 builds the database foundation for:

- rule catalogs for attributes, skills, perks, and body parts
- character attributes
- character skills with per-character governing attribute selection
- character perks
- flexible body parts driven by definitions instead of a hardcoded six-part model
- rule-sheet RPC reads and default initialization

## Stage 2 scope

Stage 2 adds the first armory foundation:

- combat skill catalog expansion for firearms and melee weapon families
- calibers and ammo-type definitions
- weapon classes and weapon models
- range bands, range profiles, and stored range modifiers
- fire-mode definitions
- magazine definitions and model compatibility
- character-owned magazines
- model-linked character weapons
- armory RPC reads and write helpers

Stage 2 still does **not** implement final attack resolution, defense resolution, or ammo spending during attacks.

Weapon class in Stage 2 is a handling or form-factor category, not a hard restriction layer. The weapon model is the source of truth for caliber, compatible magazines, compatible fire modes, range profile, and base accuracy bonus.

Unusual combinations are intentionally allowed if a weapon model is designed that way. Examples:

- a pistol-class model may use `shotgun_caliber`
- a rifle-class model may use `small_caliber` or `heavy_caliber`
- a machine-gun-class model may allow `single` fire

Odyssey weapons are generally electromagnetic or Gauss-style rather than modern chemical firearms. Fire modes do not automatically imply recoil penalties, and the seeded fire modes currently use `accuracy_modifier = 0` by design.

## Stage 3 scope

Stage 3 adds the first server-side combat resolution layer:

- `perform_attack(jsonb)` for ranged and minimal melee attacks
- ammo spending for ranged attacks
- fallback melee parry handling through `hostile_adjacent_count`
- armor pierce in damage calculation
- armor durability via `armor_critical`, `armor_max_critical`, and `armor_destroyed`
- combat log trimming to the newest 500 rows

## Stage 3 cleanup scope

The Stage 3 cleanup adds:

- corrected melee skill attribute semantics for `cutting_weapons` and `impact_weapons`
- explicit documentation that `unarmed_combat` remains per-character through `governing_attribute_def_id`
- `initialize_character_combat_defaults(uuid)` for idempotent starter `unarmed` weapon setup

Stage 3 still does **not** implement the final Owlbear attack UI rewrite. The database is the source of truth first; the new client flow comes later.

## Stage 4A scope

Stage 4A adds Effect Engine v1:

- `odyssey_effect_defs`
- active effects on `odyssey_character_effects`
- `get_character_effect_summary(uuid)`
- `get_effective_character_stats(uuid)`
- `add_character_effect(jsonb)`
- `remove_character_effect(uuid)`
- `advance_character_effects(uuid)`
- derived actions, movement, concentration, helpless, and prepared aim support
- Stage 4A integration into `perform_attack(jsonb)` and refreshed combat state payloads

Stage 4A still does **not** implement the final Owlbear UI rewrite, full armor items, full weapon feature toggles, full psionics casting flow, or mechs.

## Stage 4B scope

Stage 4B adds Armor & Equipment Foundation:

- `odyssey_armor_class_defs`
- `odyssey_equipment_model_defs`
- `odyssey_character_equipment_items`
- `natural_armor_value` on `odyssey_character_body_parts`
- `get_character_armor_summary(uuid)`
- `get_character_equipment(uuid)`
- `recompute_character_armor(uuid)`
- `create_character_equipment_item(jsonb)`
- `equip_character_equipment_item(uuid, uuid)`
- `unequip_character_equipment_item(uuid)`
- `update_character_equipment_item(jsonb)`
- armor training skills: `light_armor`, `medium_armor`, `heavy_armor`, `superheavy_armor`
- armor penalties applied as Stage 4A active effects via `effect_key = armor_penalty`
- item-based armor critical absorption inside `perform_attack(jsonb)`

Stage 4B still does **not** implement final Owlbear UI, armor sets, full repair mechanics, automatic exoskeleton or closed-suit automation, full weapon feature toggles, full psionics casting flow, or mechs.

## Stage 4C scope

Stage 4C adds Weapon Features & Weapon Profiles:

- `odyssey_weapon_model_profiles`
- `odyssey_weapon_profile_fire_modes`
- `odyssey_weapon_profile_magazines`
- `odyssey_character_weapon_profile_states`
- `odyssey_weapon_feature_defs`
- `odyssey_weapon_model_features`
- `odyssey_character_weapon_feature_states`
- `initialize_character_weapon_profile_states(uuid)`
- `initialize_character_weapon_feature_states(uuid)`
- `get_character_weapon_features(uuid)`
- `activate_weapon_feature(jsonb)`
- `deactivate_weapon_feature(uuid)`
- `reload_feature_resource(jsonb)`
- `advance_weapon_feature_states(uuid)`
- `switch_weapon_profile(uuid, uuid)`
- `load_weapon_profile_magazine(jsonb)`
- profile-aware `get_character_armory(uuid)`
- profile-aware `perform_attack(jsonb)`
- seeded `plasma_edge`, `stun_blast`, and `change_caliber`
- seeded base effect definitions for `burning`, `poisoned`, `corroded`, and `shocked`

Stage 4C still does **not** implement final Owlbear UI, automatic cone or area targeting, automatic GM saving throws, automatic inventory consumption for energy cells, full psionics, or mechs.

## Stage 4D scope

Stage 4D adds Consumables, Ammo Stock & Item Actions Foundation:

- `odyssey_item_defs`
- `odyssey_character_items`
- `odyssey_character_ammo_stock`
- `add_character_item(jsonb)`
- `remove_character_item_quantity(uuid, text, integer)`
- `get_character_item_quantity(uuid, text)`
- `add_character_ammo_stock(jsonb)`
- `remove_character_ammo_stock(uuid, integer)`
- `load_magazine_full(jsonb)`
- `unload_magazine_all(jsonb)`
- `load_rounds_to_magazine(jsonb)`
- `unload_rounds_from_magazine(jsonb)`
- real `small_energy_cell` consumption inside `reload_feature_resource(...)`
- `use_character_item(jsonb)` support for `basic_medkit`
- `get_character_inventory(uuid)` for future UI aggregation

Stage 4D keeps weapons, magazines, and armor in their current specialized tables. It does **not** implement final Owlbear UI, grenades, area effects, automatic radius targeting, money or currency, weight or encumbrance, containers or stashes, crafting, or a universal migration of weapons/armor into one inventory table.

## Stage 4E scope

Stage 4E adds Active Abilities & Resource Pools:

- `odyssey_resource_pool_defs`
- `odyssey_character_resource_pools`
- `odyssey_ability_defs`
- `odyssey_ability_level_defs`
- `odyssey_character_abilities`
- `get_character_abilities(uuid)`
- `odyssey_sync_character_resource_pools(uuid)`
- `use_ability(jsonb)`
- `advance_character_ability_states(uuid)`
- `perform_attack(jsonb)` support for attack-ability resolution
- automatic Endurance-scaled critical-cap recalculation plus body-part damage normalization after resolved attacks
- end-of-turn `advance_character_effects(uuid)` now also advances ability cooldowns and weapon feature timers

Stage 4E seeds the first psionic examples:

- `psionic_energy`
- `etheric_strike`
- `etheric_coating`
- `sensory_concentration`

Stage 4E still does **not** implement final Owlbear UI, automatic psionic targeting UX, automated narrative-only saves, grenades, mechs, or a complete implant/prosthetic ability library yet.

## Stage 5B scope

Stage 5B adds the Creator / Catalog backend:

- `odyssey_weapon_model_abilities`
- `odyssey_equipment_model_abilities`
- `odyssey_item_def_abilities`
- `creator_list_weapons(text)`
- `creator_get_weapon(uuid)`
- `creator_upsert_weapon(jsonb)`
- `creator_list_ammo_types(text)`
- `creator_get_ammo_type(uuid)`
- `creator_upsert_ammo_type(jsonb)`
- `creator_list_magazine_defs(text)`
- `creator_get_magazine_def(uuid)`
- `creator_upsert_magazine_def(jsonb)`
- `creator_list_weapon_feature_defs(text)`
- `creator_get_weapon_feature_def(uuid)`
- `creator_upsert_weapon_feature_def(jsonb)`
- `creator_list_equipment_models(text, jsonb)`
- `creator_get_equipment_model(uuid)`
- `creator_upsert_equipment_model(jsonb)`
- `creator_delete_equipment_model(uuid)`
- `creator_list_skills(text, jsonb)`
- `creator_get_skill(uuid)`
- `creator_upsert_skill(jsonb)`
- `creator_delete_skill(uuid)`
- `creator_list_item_defs(text)`
- `creator_get_item_def(uuid)`
- `creator_upsert_item_def(jsonb)`
- `creator_list_abilities(text)`
- `creator_get_ability(uuid)`
- `creator_upsert_ability(jsonb)`
- `creator_list_perks(text)`
- `creator_get_perk(uuid)`
- `creator_upsert_perk(jsonb)`
- `get_creator_reference_data()`

Stage 5B also hard-removes the legacy model-level compatibility tables:

- `odyssey_weapon_model_fire_modes`
- `odyssey_weapon_model_magazines`

The live runtime path is now profile-level only:

- `odyssey_weapon_model_profiles`
- `odyssey_weapon_profile_fire_modes`
- `odyssey_weapon_profile_magazines`

Stage 5B still does **not** implement the final Creator UI, character assignment of catalog content, automatic runtime granting of linked abilities, or item/equipment/weapon editors on the Owlbear side yet.

## Important compatibility note

`supabase/13_rules_catalog_schema.sql` removes the old character-sheet and live-combat RPC path:

- `get_odyssey_character_sheet`
- `upsert_odyssey_character_sheet`
- `recompute_odyssey_character_combat_state`
- `apply_damage`
- `heal_damage`
- `add_effect`
- `remove_effect`
- `roll_initiative`
- `advance_turn`
- `clone_odyssey_npc_active`

At the same time, Stage 1 intentionally keeps reusable combat infrastructure tables in the final database shape:

- `odyssey_character_effects`
- `odyssey_character_combat_state`
- `odyssey_combat_log`
- `odyssey_token_links`
- `odyssey_combat_encounters`
- `odyssey_initiative_entries`

Those tables remain available for later stages, but the old RPC layer that depended on the old body-part/character model is removed.

Use Stages 1-3 when you are ready to move the database to the new model.

## SQL order

Fresh or reset project:

1. `supabase/01_schema.sql`
2. `supabase/02_get_character_sheet.sql`
3. `supabase/03_upsert_character_sheet.sql`
4. `supabase/04_policies_and_grants.sql`
5. `supabase/05_character_buckets_migration.sql`
6. `supabase/06_live_combat_schema.sql`
7. `supabase/07_live_combat_functions.sql`
8. `supabase/08_live_combat_policies.sql`
9. `supabase/09_drop_character_display_name.sql`
10. `supabase/10_semantic_overlay_manifest.sql`
11. `supabase/11_perf_diagnostics.sql`
12. `supabase/12_clone_active_npc_optimization.sql`
13. `supabase/13_rules_catalog_schema.sql`
14. `supabase/14_seed_core_rules.sql`
15. `supabase/15_weapon_armory_schema.sql`
16. `supabase/16_seed_weapon_armory.sql`
17. `supabase/17_combat_resolution_schema.sql`
18. `supabase/18_seed_combat_resolution.sql`
19. `supabase/19_stage3_cleanup.sql`
20. `supabase/20_stage3_melee_result_fix.sql`
21. `supabase/21_effect_engine_schema.sql`
22. `supabase/22_seed_effects.sql`
23. `supabase/23_armor_equipment_schema.sql`
24. `supabase/24_seed_armor_equipment.sql`
25. `supabase/25_weapon_features_schema.sql`
26. `supabase/26_seed_weapon_features.sql`
27. `supabase/27_consumables_inventory_schema.sql`
28. `supabase/28_seed_consumables_inventory.sql`
29. `supabase/29_active_abilities_schema.sql`
30. `supabase/30_seed_active_abilities.sql`
31. `supabase/31_fix_ability_attack_effective_level.sql`
32. `supabase/32_magazine_ammo_management_fix.sql`
33. `supabase/33_fix_attack_armor_absorption_and_suppress_auto_death.sql`
34. `supabase/34_gm_heal_and_repair_actions.sql`
35. `supabase/35_creator_catalog_schema.sql`
36. `supabase/36_creator_catalog_rpcs.sql`

Existing Stage 2 project:

- apply `supabase/17_combat_resolution_schema.sql`
- then apply `supabase/18_seed_combat_resolution.sql`
- then apply `supabase/19_stage3_cleanup.sql`
- then apply `supabase/20_stage3_melee_result_fix.sql`

Existing Stage 3 project:

- apply `supabase/19_stage3_cleanup.sql`
- then apply `supabase/20_stage3_melee_result_fix.sql`
- then apply `supabase/21_effect_engine_schema.sql`
- then apply `supabase/22_seed_effects.sql`
- then apply `supabase/23_armor_equipment_schema.sql`
- then apply `supabase/24_seed_armor_equipment.sql`

Existing Stage 4A project:

- apply `supabase/23_armor_equipment_schema.sql`
- then apply `supabase/24_seed_armor_equipment.sql`

Existing Stage 4B project:

- apply `supabase/25_weapon_features_schema.sql`
- then apply `supabase/26_seed_weapon_features.sql`

Existing Stage 4C project:

- apply `supabase/27_consumables_inventory_schema.sql`
- then apply `supabase/28_seed_consumables_inventory.sql`

Existing Stage 4D project:

- apply `supabase/29_active_abilities_schema.sql`
- then apply `supabase/30_seed_active_abilities.sql`
- then apply `supabase/31_fix_ability_attack_effective_level.sql`
- then apply `supabase/32_magazine_ammo_management_fix.sql`
- then apply `supabase/33_fix_attack_armor_absorption_and_suppress_auto_death.sql`
- then apply `supabase/34_gm_heal_and_repair_actions.sql`

Existing Stage 4E project:

- apply `supabase/31_fix_ability_attack_effective_level.sql`
- then apply `supabase/32_magazine_ammo_management_fix.sql`
- then apply `supabase/33_fix_attack_armor_absorption_and_suppress_auto_death.sql`
- then apply `supabase/34_gm_heal_and_repair_actions.sql`

Existing Stage 5A / current-through-34 project:

- apply `supabase/35_creator_catalog_schema.sql`
- then apply `supabase/36_creator_catalog_rpcs.sql`

Existing current-through-46 project:

- apply `supabase/47_reload_feature_resource_migration.sql`
- then apply `supabase/48_universal_attack_modifiers.sql`

Important: Stage 2 is a hard armory migration. It drops and recreates the current armory tables, including the old lightweight `public.odyssey_character_weapons` table shape, and replaces them with the new model-based structure. Old armory rows are not migrated. This is acceptable for the current empty/reset Stage 2 setup. After real armory data exists, future changes should use `ALTER TABLE` or other careful data-preserving migrations.

Important: the combined snapshot [supabase/odyssey_supabase.sql](/D:/Documents/Odyssey/Owlbear/odyssey-system-main/supabase/odyssey_supabase.sql) is intended for a fresh/reset database. If you are already on Stage 2, do not re-run the entire snapshot; apply only the later numbered migrations you still need. If you are already on Stage 4A, apply only `23` and `24`. If you are already on Stage 4B, apply only `25` and `26`. If you are already on Stage 4C, apply only `27` and `28`. If you are already on an older Stage 4D, apply `29`, `30`, `31`, `32`, `33`, and `34`. If you are already on Stage 4E, apply `31`, `32`, `33`, and `34`. If you are already current through `34`, apply `35`, `36`, `37`, `38`, `39`, `40`, `41`, `42`, `43`, `44`, `45`, `47`, and `48`. If you are already current through `46`, apply only `47` and `48`.

## Core RPC functions

- `public.get_character_rule_sheet(uuid)`
- `public.initialize_character_rule_defaults(uuid)`
- `public.initialize_character_combat_defaults(uuid)`
- `public.get_character_abilities(uuid)`
- `public.odyssey_sync_character_resource_pools(uuid)`
- `public.use_ability(jsonb)`
- `public.advance_character_ability_states(uuid)`
- `public.get_character_armory(uuid)`
- `public.initialize_character_weapon_profile_states(uuid)`
- `public.initialize_character_weapon_feature_states(uuid)`
- `public.get_character_weapon_features(uuid)`
- `public.activate_weapon_feature(jsonb)`
- `public.deactivate_weapon_feature(uuid)`
- `public.reload_feature_resource(jsonb)`
- `public.advance_weapon_feature_states(uuid)`
- `public.switch_weapon_profile(uuid, uuid)`
- `public.load_weapon_profile_magazine(jsonb)`
- `public.create_character_weapon(uuid, uuid, text)`
- `public.create_character_magazine(uuid, uuid, uuid, integer, text)`
- `public.load_magazine(uuid, uuid, uuid)`
- `public.unload_magazine(uuid, uuid)`
- `public.switch_weapon_fire_mode(uuid, uuid, uuid)`
- `public.calculate_range_band(numeric)`
- `public.get_weapon_range_modifier(uuid, numeric)`
- `public.odyssey_refresh_character_combat_state(uuid)`
- `public.odyssey_trim_combat_log(uuid, text)`
- `public.perform_attack(jsonb)`
- `public.get_character_effect_summary(uuid)`
- `public.get_effective_character_stats(uuid)`
- `public.add_character_effect(jsonb)`
- `public.remove_character_effect(uuid)`
- `public.advance_character_effects(uuid)`
- `public.get_character_armor_summary(uuid)`
- `public.get_character_equipment(uuid)`
- `public.recompute_character_armor(uuid)`
- `public.create_character_equipment_item(jsonb)`
- `public.equip_character_equipment_item(uuid, uuid)`
- `public.unequip_character_equipment_item(uuid)`
- `public.update_character_equipment_item(jsonb)`
- `public.add_character_item(jsonb)`
- `public.remove_character_item_quantity(uuid, text, integer)`
- `public.get_character_item_quantity(uuid, text)`
- `public.add_character_ammo_stock(jsonb)`
- `public.remove_character_ammo_stock(uuid, integer)`
- `public.load_magazine_full(jsonb)`
- `public.unload_magazine_all(jsonb)`
- `public.load_rounds_to_magazine(jsonb)`
- `public.unload_rounds_from_magazine(jsonb)`
- `public.use_character_item(jsonb)`
- `public.get_character_inventory(uuid)`
- `public.gm_heal_character(jsonb)`
- `public.gm_repair_character_armor(jsonb)`
- `public.get_creator_reference_data()`
- `public.creator_list_weapons(text)`
- `public.creator_get_weapon(uuid)`
- `public.creator_upsert_weapon(jsonb)`
- `public.creator_list_ammo_types(text)`
- `public.creator_get_ammo_type(uuid)`
- `public.creator_upsert_ammo_type(jsonb)`
- `public.creator_list_magazine_defs(text)`
- `public.creator_get_magazine_def(uuid)`
- `public.creator_upsert_magazine_def(jsonb)`
- `public.creator_list_weapon_feature_defs(text)`
- `public.creator_get_weapon_feature_def(uuid)`
- `public.creator_upsert_weapon_feature_def(jsonb)`
- `public.creator_list_equipment_models(text, jsonb)`
- `public.creator_get_equipment_model(uuid)`
- `public.creator_upsert_equipment_model(jsonb)`
- `public.creator_delete_equipment_model(uuid)`
- `public.creator_list_skills(text, jsonb)`
- `public.creator_get_skill(uuid)`
- `public.creator_upsert_skill(jsonb)`
- `public.creator_delete_skill(uuid)`
- `public.creator_list_item_defs(text)`
- `public.creator_get_item_def(uuid)`
- `public.creator_upsert_item_def(jsonb)`
- `public.creator_list_abilities(text)`
- `public.creator_get_ability(uuid)`
- `public.creator_upsert_ability(jsonb)`
- `public.creator_list_perks(text)`
- `public.creator_get_perk(uuid)`
- `public.creator_upsert_perk(jsonb)`

## Required Supabase values

Open `Project Settings -> API` and copy:

- `Project URL`
- `anon / publishable public key`

Do not put the service-role key into Owlbear.

## Current practical workflow

Until the new Owlbear UI lands, Stages 1-4D are primarily a database layer. The current Owlbear shells are only thin connection/bridge surfaces:

1. Apply the SQL files in order.
2. Create or keep rows in `public.odyssey_characters`.
3. Call `public.initialize_character_rule_defaults(character_id)` for rule defaults only, or `public.initialize_character_combat_defaults(character_id)` to also ensure the starter `unarmed` weapon.
4. Read the structured output from `public.get_character_rule_sheet(character_id)`.
5. Create model-linked weapons and separate magazines through the new armory RPCs or direct DB work.
6. Read structured armory output from `public.get_character_armory(character_id)`.
7. Call `public.perform_attack(payload jsonb)` to resolve attacks in the database.
8. Call `public.add_character_effect(...)`, `public.remove_character_effect(...)`, or `public.advance_character_effects(...)` as needed for ongoing combat state.
9. Create equipment items from `public.odyssey_equipment_model_defs`, equip them to concrete body parts, and run `public.recompute_character_armor(character_id)` after direct SQL changes that affect armor class or armor training.
10. Switch weapon profiles and load magazines per profile when a weapon has multiple configurations.
11. Activate manual weapon features like `plasma_edge`, or pass attack-scoped feature state IDs into `public.perform_attack(...)` for things like `stun_blast`.
12. Add resource items and loose ammo stock through `public.add_character_item(...)` and `public.add_character_ammo_stock(...)`.
13. Fill free magazines from loose ammo with `public.load_magazine_full(...)`, return all rounds with `public.unload_magazine_all(...)`, keep `load_rounds_to_magazine(...)` and `unload_rounds_from_magazine(...)` only as compatibility wrappers, and reload gated features like `plasma_edge` through `public.reload_feature_resource(...)`.
14. Use `public.use_character_item(...)` for backend actions such as `basic_medkit`.
15. Read `public.get_character_inventory(...)`, `public.odyssey_combat_log`, or future UI consumers for resulting state and events.
16. Update character attributes, skills, perks, body parts, weapons, magazines, effects, equipment, profiles, feature states, and inventory rows directly in Supabase tables or via future UI work.
17. Treat the current Owlbear popovers as bridge placeholders only; they are not the final gameplay UI.

## Notes

- Policies remain permissive for browser-based direct access with the public key.
- The old Owlbear combat UI, overlay runtime, background combat loop, and legacy frontend helpers are intentionally removed from the active build.
- The rule foundation is data-driven: future UI and combat logic should use IDs, codes, tags, and the new RPC output instead of hardcoded names.
- `psionics` is seeded with default value `0` and cost per level `3` as the current project convention.
- Stage 4D ammo stock still keeps the current `(character_id, caliber_id, ammo_type_id, display_name)` unique key for compatibility, but runtime helpers now treat `display_name` only as a label and never as ammo identity.

## Magazine Helper Checks

Run these manual/backend checks after applying `32_magazine_ammo_management_fix.sql`:

1. Load an empty magazine with standard ammo and confirm `current_rounds` becomes full capacity, `ammo_type_id` matches standard, and ammo stock decreases by exactly the magazine capacity.
2. Load an empty magazine with a second ammo type such as expansive ammo and confirm the empty magazine switches `ammo_type_id` to that new type.
3. Set a magazine to `25/30`, run `public.load_magazine_full(...)`, and confirm only `5` rounds are spent.
4. Try loading a non-empty magazine from a different `ammo_type_id` and confirm `MAGAZINE_HAS_DIFFERENT_AMMO_TYPE` with no data changes.
5. Unload a partially filled magazine and confirm the same `ammo_type_id` gets those rounds back while other ammo stocks remain unchanged.
6. Insert a magazine into a weapon or active profile, then confirm both `public.load_magazine_full(...)` and `public.unload_magazine_all(...)` return `MAGAZINE_IS_LOADED_IN_WEAPON` without mutating stock or magazine rows.
7. Confirm unloading an empty magazine returns `MAGAZINE_EMPTY`.
8. Confirm a `25/30` magazine with only `3` available rounds returns `NOT_ENOUGH_AMMO_STOCK` and leaves both rows unchanged.
9. Confirm `public.perform_attack(...)` still consumes rounds from the loaded magazine after the helper migration.
- `aim_difficulty` is a positive aimed-shot penalty value. Example: `30` means the aimed attack receives `-30`.
- Current seeded critical capacity assumptions are: `Head=1`, `Torso=3`, `L/R Arm=2`, `L/R Leg=2`, `Shield=1`, `Special=1`.
- `Head` is currently seeded with `serious_counts_as_critical = true`; the other default body parts remain `false` for now.
- Stage 2 seeds one default `standard` ammo type per caliber and starter weapon models for pistol, SMG, shotgun, rifle, machine gun, combat knife, and shock baton.
- Standard seeded ammo currently uses `damage_modifier = 0`, `accuracy_modifier = 0`, and `armor_pierce = 0`.
- Each magazine stores exactly one ammo type in Stage 2. Mixed-ammo magazines are intentionally out of scope for now.
- Distance is currently modeled as `1 cell = 1 meter` with `clinch = 0-1`, `short = 2-15`, `medium = 16-50`, and `long = 51+`.
- Stage 3 evaluates pistol and SMG long-range scaling numerically from `51m..100m` and updates shotgun long range to scale from `-50` to `-100`.
- Fire modes do not automatically create recoil penalties in Odyssey's current Gauss-style weapon assumption, so the seeded `single`, `double`, `burst_3`, `burst_5`, `full_auto_random`, and `melee_strike` modes all keep `accuracy_modifier = 0`.
- Stage 3 adds `base_melee_damage` to weapon models and seeds the default `unarmed` model plus `melee_strike`.
- `initialize_character_combat_defaults(uuid)` gives a character one default `unarmed` weapon instance if missing and keeps repeated calls idempotent.
- `cutting_weapons` uses `Agility` as main and `Strength` as secondary, while `impact_weapons` uses `Strength` as main and `Agility` as secondary.
- `unarmed_combat` still supports per-character `Strength` or `Agility` choice through `odyssey_character_skills.governing_attribute_def_id`.
- Fallback `parry` is melee-only unless a future defense skill is explicitly passed via `defense_skill_id`.
- Armor pierce never adds damage; it only reduces effective armor, never below `0`.
- Critical damage first degrades armor durability and only overflow critical reaches the body part.
- The Stage 3 melee Strength bonus `max(strength - 10, 0)` is a damage bonus only and is intentionally separate from skill attribute dependency.
- Stage 4A uses `effective_strength` for the melee damage bonus and keeps SQL as the source of truth for combat resolution.
- Helpless handling in Stage 4A no longer auto-kills on any damage. Helpless targets in `none/light` armor defend with `defense_roll = 1`, and helpless targets in `medium/heavy/superheavy` armor take `-60` defense.
- Stage 4B armor class uses only equipped item `armor_value`, not `natural_armor_value`. Body-part effective armor snapshots use `natural_armor_value + equipped item armor_value`, and depleted armor still keeps its `armor_value`.
- Stage 4B seeds armor-class thresholds as `none=0`, `light=1..70`, `medium=71..140`, `heavy=141..260`, and `superheavy=261+`.
- Stage 4B seeds starter armor models plus `basic_psionic_shield`, `basic_exoskeleton_frame`, and `basic_closed_suit`.
- Stage 4B keeps helpless hit logic the same as Stage 4A. The new `head_protected`, `torso_protected`, `special_protection`, and `helpless_execution_protected` values are computed in armor summary, but they do not replace the Stage 4A `defense_roll = 1` / `-60 defense` behavior yet.
- Stage 4C keeps weapon profiles strict in combat resolution: active attack profiles are currently expected to be either `ranged` or `melee`.
- `plasma_edge` is a manual duration feature that grants `+10 damage` and `+20 armor_pierce` for the next 2 attack attempts with that weapon, then becomes inactive and requires manual reload.
- `stun_blast` is a generic attack-scoped feature. It uses normal hit accuracy, intentionally skips direct damage, and on hit returns a pending manual Endurance save with suggested `stunned`.
- `change_caliber` is represented through profile switching rather than direct damage logic.
- Stage 4D seeds `small_energy_cell` and `basic_medkit` only. It does not seed grenades, currency items, or area-effect consumables.
- Stage 4D keeps loose ammo stock separate from items. Ammo stock identity is `character + caliber + ammo_type`, `display_name` is only a label, and the free-magazine helpers reject magazines that are currently inserted into weapons.
- Stage 4D `location_data` fields are reserved for future placement/container logic. They are metadata only for now and do not represent a full container or stash system yet.
- `reload_feature_resource(...)` now consumes one required inventory item when the feature definition specifies `requires_reload_item_code`. `plasma_edge` therefore spends one `small_energy_cell` when reloaded successfully.
- `basic_medkit` heals the selected body part in this order: remove `1 serious`, else convert `1 critical` into `1 serious`, else clear all `minor`; it also removes active `unconscious` if present, defaults `used_by_character_id` to the item owner when omitted, returns `BODY_PART_DESTROYED` for destroyed limbs, and is not consumed when no healing or unconscious removal occurs.
- Stage 5B Creator writes only global catalog definitions and never mutates `odyssey_character_*` runtime tables.
- Stage 5B stores weapon-to-ability, equipment-to-ability, and item-to-ability catalog links only. It does **not** auto-grant those abilities to character instances yet.
- Stage 5B removes legacy `odyssey_weapon_model_fire_modes` / `odyssey_weapon_model_magazines` from the final database shape after backfilling their default-profile links into `odyssey_weapon_profile_fire_modes` / `odyssey_weapon_profile_magazines`.
- Stage 4A derived stats use `main_actions_per_turn = 1 + floor(max(effective_agility - 10, 0) / 5)`, `movement_bonus_m = max(effective_agility - 10, 0)`, and `concentration_slots = 1 + floor(max(effective_intelligence - 10, 0) / 5)`.
- `advance_character_effects(character_id)` is intended to be called at the end of that character's turn.
- `advance_weapon_feature_states(character_id)` is intended to be called at the end of that character's turn as well.
- Effect data merge in Stage 4A appends `modifiers` arrays and merges `flags` with payload values overriding matching keys.
- The `33_fix_attack_armor_absorption_and_suppress_auto_death.sql` hotfix preserves signed `armor_pierce`, applies critical absorption against the targeted body-part armor snapshot before body critical damage, and suppresses automatic death by forcing `is_alive = true` while returning manual/pending death checks instead.
- The `34_gm_heal_and_repair_actions.sql` hotfix adds GM/debug maintenance RPCs that fully heal body damage or fully repair armor damage on real body parts while excluding `shield` and `special`.
- The migration path (`01` through `48`, with `46` intentionally reserved outside this repository) and the single-file snapshot [supabase/odyssey_supabase.sql](/D:/Documents/Odyssey/Owlbear/odyssey-system-main/supabase/odyssey_supabase.sql) are intended to produce the current post-Stage-5B database shape.

## Attack Engine Safety Checks

Run these manual/backend checks after applying `33_fix_attack_armor_absorption_and_suppress_auto_death.sql`:

1. Positive armor pierce: confirm `armor_value = 40` and `armor_pierce = 10` produce `effective_armor = 30`.
2. Zero armor pierce: confirm `armor_value = 40` and `armor_pierce = 0` produce `effective_armor = 40`.
3. Negative armor pierce: confirm `armor_value = 40` and `armor_pierce = -10` produce `effective_armor = 50` and the attack result still returns `"armor_pierce": -10`.
4. Full armor absorb: with `armor_critical = 0`, `armor_max_critical = 3`, and `critical_delta = 2`, confirm `armor_critical_delta = 2`, `body_critical_delta = 0`, and the body part stays not destroyed.
5. Partial armor absorb: with `armor_critical = 2`, `armor_max_critical = 3`, and `critical_delta = 3`, confirm `armor_critical_delta = 1`, `body_critical_delta = 2`, and `armor_destroyed = true`.
6. No armor capacity: with `armor_critical = 0`, `armor_max_critical = 0`, and `critical_delta = 2`, confirm `armor_critical_delta = 0` and `body_critical_delta = 2`.
7. Expansive ammo integration: use `Expansive Small Caliber Ammo` and confirm the attack result preserves `"damage_modifier": 10` and `"armor_pierce": -10`.
8. Suppressed death: force a head or torso destroy result and confirm `target_state.is_alive` stays `true` while the attack result includes `execution.fatal_triggered = true`, `execution.death_application_suppressed = true`, and a pending manual death check.

## GM Maintenance Checks

Run these manual/backend checks after applying `34_gm_heal_and_repair_actions.sql`:

1. Heal a wounded character and confirm all non-virtual body parts reset `minor/serious/critical` to `0` and clear `disabled/destroyed`.
2. Confirm `gm_heal_character(...)` does not repair armor fields on real parts.
3. Confirm `gm_heal_character(...)` deactivates `dead`, `dying`, `unconscious`, `knocked_out`, and `incapacitated` effects when present.
4. Confirm `gm_heal_character(...)` leaves `shield` and `special` excluded from healing.
5. Repair a damaged armored character and confirm `armor_critical = 0` and `armor_destroyed = false` for real equipped armor parts.
6. Confirm `gm_repair_character_armor(...)` does not clear body `minor/serious/critical` damage.
7. Confirm both RPCs increment combat `state_version` through `public.odyssey_refresh_character_combat_state(...)`.
8. Confirm both RPCs can add a `odyssey_combat_log` row without failing the action when combat logging is unavailable.
