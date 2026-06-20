# Creator Catalog Backend Tests

Run these checks after applying:

1. [35_creator_catalog_schema.sql](/D:/Documents/Odyssey/Owlbear/odyssey-system-main/supabase/35_creator_catalog_schema.sql)
2. [36_creator_catalog_rpcs.sql](/D:/Documents/Odyssey/Owlbear/odyssey-system-main/supabase/36_creator_catalog_rpcs.sql)

All examples below use direct SQL RPC calls because Stage 5B is backend-only.

## Reference Data

```sql
select public.get_creator_reference_data();
```

Confirm the payload contains compact arrays for:

- `attributes`
- `skills`
- `calibers`
- `weapon_classes`
- `range_profiles`
- `fire_modes`
- `magazine_definitions`
- `body_part_definitions`
- `resource_pools`
- `abilities`
- `weapon_feature_definitions`
- `armor_classes`

## Weapon

Create a new weapon with one default ranged profile:

```sql
select public.creator_upsert_weapon(
  jsonb_build_object(
    'code', 'creator_test_pistol',
    'name', 'Creator Test Pistol',
    'weapon_class_id', (select id from public.odyssey_weapon_class_defs where code = 'pistol'),
    'linked_skill_id', (select id from public.odyssey_skill_defs where code = 'pistols'),
    'caliber_id', (select id from public.odyssey_caliber_defs where code = 'small_caliber'),
    'range_profile_id', (select id from public.odyssey_range_profile_defs where code = 'pistol_profile'),
    'base_accuracy_bonus', 0,
    'base_melee_damage', 0,
    'description', 'Creator smoke test weapon.',
    'tags', '["creator","test","pistol"]'::jsonb,
    'profiles',
      jsonb_build_array(
        jsonb_build_object(
          'code', 'default',
          'name', 'Default',
          'attack_type', 'ranged',
          'is_default', true,
          'fire_mode_ids',
            jsonb_build_array(
              (select id from public.odyssey_fire_mode_defs where code = 'single')
            ),
          'magazine_def_ids',
            jsonb_build_array(
              (select id from public.odyssey_magazine_defs where code = 'small_pistol_magazine')
            )
        )
      ),
    'feature_links',
      jsonb_build_array(
        jsonb_build_object(
          'feature_def_id', (select id from public.odyssey_weapon_feature_defs where code = 'plasma_edge'),
          'profile_code', 'default',
          'is_enabled_by_default', false,
          'sort_order', 10,
          'data', '{}'::jsonb
        )
      ),
    'ability_links',
      jsonb_build_array(
        jsonb_build_object(
          'ability_def_id', (select id from public.odyssey_ability_defs where code = 'etheric_strike'),
          'grant_mode', 'available',
          'is_enabled', true,
          'sort_order', 10,
          'data', '{}'::jsonb
        )
      )
  )
);
```

Confirm:

- `ok = true`
- the returned `entity.weapon.code = creator_test_pistol`
- exactly one profile has `is_default = true`
- `feature_links` were stored in `public.odyssey_weapon_model_features`
- `ability_links` were stored in `public.odyssey_weapon_model_abilities`

Edit the weapon:

```sql
select public.creator_get_weapon(
  (select id from public.odyssey_weapon_model_defs where code = 'creator_test_pistol')
);
```

Then update `name`, `base_accuracy_bonus`, tags, and profile fields through `creator_upsert_weapon(...)`.

Confirm:

- edits persist
- child links stay attached
- no rows are inserted into any `odyssey_character_*` tables

## Ammo

Create expansive ammo with signed armor pierce:

```sql
select public.creator_upsert_ammo_type(
  jsonb_build_object(
    'caliber_id', (select id from public.odyssey_caliber_defs where code = 'small_caliber'),
    'code', 'expansive_creator_test',
    'name', 'Expansive Creator Test',
    'damage_modifier', 10,
    'accuracy_modifier', 0,
    'armor_pierce', -10,
    'description', 'Signed armor-pierce smoke test.',
    'tags', '["creator","expansive"]'::jsonb,
    'sort_order', 100
  )
);
```

Confirm the stored `armor_pierce` remains `-10`.

## Magazine Definition

```sql
select public.creator_upsert_magazine_def(
  jsonb_build_object(
    'caliber_id', (select id from public.odyssey_caliber_defs where code = 'small_caliber'),
    'code', 'creator_test_small_mag',
    'name', 'Creator Test Small Magazine',
    'capacity', 12,
    'description', 'Creator smoke test magazine.',
    'tags', '["creator","magazine"]'::jsonb,
    'sort_order', 100
  )
);
```

Confirm:

- `capacity = 12`
- the returned caliber matches `small_caliber`

## Weapon Feature Definition

```sql
select public.creator_upsert_weapon_feature_def(
  jsonb_build_object(
    'code', 'creator_test_feature',
    'name', 'Creator Test Feature',
    'feature_type', 'active',
    'activation_type', 'manual',
    'description', 'Creator smoke test feature.',
    'default_max_charges', 3,
    'default_current_charges', 3,
    'default_cooldown_rounds', 1,
    'default_active_rounds', 1,
    'default_active_uses', 1,
    'requires_reload_item_code', 'small_energy_cell',
    'data', '{}'::jsonb,
    'effect_data', '{}'::jsonb,
    'tags', '["creator","feature"]'::jsonb,
    'sort_order', 100
  )
);
```

## Equipment Models

Create torso armor:

```sql
select public.creator_upsert_equipment_model(
  jsonb_build_object(
    'code', 'creator_test_medium_torso_armor',
    'name', 'Creator Test Medium Torso Armor',
    'item_type', 'armor',
    'description', 'Creator smoke test torso armor.',
    'armor_value', 40,
    'armor_max_critical', 3,
    'default_body_part_code', 'torso',
    'can_equip', true,
    'can_equip_to_body_part', true,
    'effect_data', '{}'::jsonb,
    'flags', '{}'::jsonb,
    'tags', '["creator","armor","torso"]'::jsonb,
    'sort_order', 100,
    'ability_links',
      jsonb_build_array(
        jsonb_build_object(
          'ability_def_id', (select id from public.odyssey_ability_defs where code = 'etheric_coating'),
          'grant_mode', 'passive',
          'is_enabled', true,
          'sort_order', 10,
          'data', '{}'::jsonb
        )
      )
  )
);
```

Create shield model:

```sql
select public.creator_upsert_equipment_model(
  jsonb_build_object(
    'code', 'creator_test_shield',
    'name', 'Creator Test Shield',
    'item_type', 'shield',
    'description', 'Creator smoke test shield.',
    'armor_value', 20,
    'armor_max_critical', 2,
    'default_body_part_code', 'shield',
    'can_equip', true,
    'can_equip_to_body_part', true,
    'effect_data', '{}'::jsonb,
    'flags', '{}'::jsonb,
    'tags', '["creator","shield"]'::jsonb,
    'sort_order', 110
  )
);
```

Confirm:

- armor and shield both appear in `creator_list_equipment_models(...)`
- links were written only to `public.odyssey_equipment_model_abilities`
- no `public.odyssey_character_equipment_items` rows were created

## Active Item

```sql
select public.creator_upsert_item_def(
  jsonb_build_object(
    'code', 'creator_test_medkit',
    'name', 'Creator Test Medkit',
    'item_type', 'consumable',
    'description', 'Creator smoke test item.',
    'is_stackable', true,
    'default_quantity', 1,
    'max_stack', 20,
    'default_max_charges', null,
    'default_current_charges', null,
    'use_action_type', 'manual',
    'effect_data', '{}'::jsonb,
    'data', '{}'::jsonb,
    'tags', '["creator","medical"]'::jsonb,
    'sort_order', 100,
    'ability_links',
      jsonb_build_array(
        jsonb_build_object(
          'ability_def_id', (select id from public.odyssey_ability_defs where code = 'sensory_concentration'),
          'grant_mode', 'activated',
          'is_enabled', true,
          'sort_order', 10,
          'data', '{}'::jsonb
        )
      )
  )
);
```

Confirm:

- `use_action_type = manual`
- no rows were created in `public.odyssey_character_items`

## Ability

Create an attack ability with levels 1 and 2:

```sql
select public.creator_upsert_ability(
  jsonb_build_object(
    'code', 'creator_test_attack_ability',
    'name', 'Creator Test Attack Ability',
    'ability_kind', 'attack',
    'source_type', 'psionic',
    'activation_type', 'manual',
    'target_type', 'body_part',
    'effect_mode', 'attack',
    'attack_type', 'ranged',
    'linked_skill_id', null,
    'resource_mode', 'pool',
    'resource_pool_code', 'psionic_energy',
    'description', 'Creator smoke test ability.',
    'data', '{}'::jsonb,
    'effect_data', '{}'::jsonb,
    'tags', '["creator","ability"]'::jsonb,
    'sort_order', 100,
    'levels',
      jsonb_build_array(
        jsonb_build_object(
          'ability_level', 1,
          'resource_cost', 1,
          'cooldown_rounds', null,
          'range_profile_id', null,
          'attack_accuracy_bonus', 0,
          'attack_damage_bonus', 25,
          'attack_armor_pierce', 0,
          'ignore_armor', false,
          'special_armor_value', null,
          'special_max_critical', null,
          'duration_rounds', null,
          'data', '{}'::jsonb,
          'effect_data', '{}'::jsonb
        ),
        jsonb_build_object(
          'ability_level', 2,
          'resource_cost', 2,
          'cooldown_rounds', null,
          'range_profile_id', null,
          'attack_accuracy_bonus', 5,
          'attack_damage_bonus', 35,
          'attack_armor_pierce', 0,
          'ignore_armor', false,
          'special_armor_value', null,
          'special_max_critical', null,
          'duration_rounds', null,
          'data', '{}'::jsonb,
          'effect_data', '{}'::jsonb
        )
      )
  )
);
```

Confirm:

- both levels are stored
- `creator_get_ability(...)` returns them in the correct order
- editing only level 2 updates the right row instead of duplicating level records
- no rows are created in `public.odyssey_character_abilities`

## Perk

```sql
select public.creator_upsert_perk(
  jsonb_build_object(
    'code', 'creator_test_pistol_expert',
    'name', 'Creator Test Pistol Expert',
    'skill_def_id', (select id from public.odyssey_skill_defs where code = 'pistols'),
    'required_skill_level', 3,
    'description', 'Creator smoke test perk.',
    'effect_type', 'add_modifier',
    'effect_data',
      jsonb_build_object(
        'target', 'attack',
        'value', 10,
        'condition', jsonb_build_object('weapon_tags', jsonb_build_array('pistol'))
      ),
    'tags', '["creator","perk","pistol"]'::jsonb,
    'sort_order', 100
  )
);
```

Confirm:

- `required_skill_level = 3`
- `effect_data` stores the modifier payload unchanged
- no rows are created in `public.odyssey_character_perks`

## Legacy Cleanup

Confirm the old compatibility tables no longer remain in the final schema:

```sql
select to_regclass('public.odyssey_weapon_model_fire_modes') as legacy_fire_modes;
select to_regclass('public.odyssey_weapon_model_magazines') as legacy_magazines;
```

Expected:

- both results are `null`

## Safety Checks

Try each invalid payload and confirm a structured JSON validation error is returned:

1. Duplicate weapon code.
2. Duplicate profile default flag (`is_default = true` on two profiles).
3. Invalid foreign key in `ability_links`.
4. Invalid `default_body_part_code`.
5. Invalid perk `skill_def_id`.
6. Invalid ability level outside `1..5`.
7. Invalid `use_action_type`.
8. Invalid item/weapon/armor `code`.

## Character Safety

Run this before and after the tests:

```sql
select
  (select count(*) from public.odyssey_character_weapons) as character_weapons,
  (select count(*) from public.odyssey_character_items) as character_items,
  (select count(*) from public.odyssey_character_equipment_items) as character_equipment_items,
  (select count(*) from public.odyssey_character_abilities) as character_abilities,
  (select count(*) from public.odyssey_character_perks) as character_perks;
```

Confirm Creator RPC tests do not increase any of those counts unless you manually changed character data elsewhere.
