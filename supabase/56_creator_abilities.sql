do $$
declare
  v_constraint_name text;
begin
  select conname
  into v_constraint_name
  from pg_constraint
  where conrelid = 'public.odyssey_ability_defs'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%ability_kind%';

  if v_constraint_name is not null then
    execute format(
      'alter table public.odyssey_ability_defs drop constraint %I',
      v_constraint_name
    );
  end if;
end;
$$;

alter table public.odyssey_ability_defs
  add constraint odyssey_ability_defs_ability_kind_check
  check (ability_kind in ('attack', 'buff', 'support', 'defense', 'passive', 'utility', 'narrative', 'custom'));

create or replace function public.creator_upsert_ability(
  p_payload jsonb
)
returns jsonb
language plpgsql
as $$
declare
  v_payload jsonb := public.odyssey_creator_normalize_json_object(p_payload);
  v_id uuid := nullif(trim(coalesce(v_payload->>'id', '')), '')::uuid;
  v_code text := public.odyssey_creator_normalize_code(v_payload->>'code');
  v_name text := trim(coalesce(v_payload->>'name', ''));
  v_ability_kind text := lower(trim(coalesce(v_payload->>'ability_kind', 'custom')));
  v_source_type text := lower(trim(coalesce(v_payload->>'source_type', 'custom')));
  v_activation_type text := lower(trim(coalesce(v_payload->>'activation_type', 'manual')));
  v_target_type text := lower(trim(coalesce(v_payload->>'target_type', 'self')));
  v_effect_mode text := lower(trim(coalesce(v_payload->>'effect_mode', 'narrative')));
  v_attack_type text := nullif(lower(trim(coalesce(v_payload->>'attack_type', ''))), '');
  v_linked_skill_id uuid := nullif(trim(coalesce(v_payload->>'linked_skill_id', '')), '')::uuid;
  v_resource_mode text := lower(trim(coalesce(v_payload->>'resource_mode', 'none')));
  v_resource_pool_code text := nullif(public.odyssey_creator_normalize_code(v_payload->>'resource_pool_code'), '');
  v_resource_item_code text := nullif(public.odyssey_creator_normalize_code(v_payload->>'resource_item_code'), '');
  v_description text := coalesce(v_payload->>'description', '');
  v_data jsonb := public.odyssey_creator_normalize_json_object(v_payload->'data');
  v_effect_data jsonb := public.odyssey_creator_normalize_json_object(v_payload->'effect_data');
  v_tags jsonb := public.odyssey_creator_normalize_text_array(v_payload->'tags');
  v_sort_order integer := coalesce(nullif(trim(coalesce(v_payload->>'sort_order', '')), '')::integer, 0);
  v_levels jsonb := public.odyssey_creator_normalize_json_array(v_payload->'levels');
  v_effect_links_raw jsonb := public.odyssey_creator_normalize_json_array(
    coalesce(v_payload->'effect_links', v_data->'effect_links')
  );
  v_effect_links jsonb := '[]'::jsonb;
  v_entity_id uuid := null;
  v_result jsonb := '{}'::jsonb;
  v_processed_level_ids uuid[] := '{}'::uuid[];
  v_seen_levels integer[] := '{}'::integer[];
  v_seen_effect_ids uuid[] := '{}'::uuid[];
  v_entry jsonb := '{}'::jsonb;
  v_level_id uuid := null;
  v_ability_level integer := 0;
  v_resource_cost integer := 0;
  v_cooldown_rounds integer := null;
  v_range_profile_id uuid := null;
  v_attack_accuracy_bonus integer := 0;
  v_attack_damage_bonus integer := 0;
  v_attack_armor_pierce integer := 0;
  v_ignore_armor boolean := false;
  v_special_armor_value integer := null;
  v_special_max_critical integer := null;
  v_duration_rounds integer := null;
  v_level_data jsonb := '{}'::jsonb;
  v_level_effect_data jsonb := '{}'::jsonb;
  v_effect_def_id uuid := null;
  v_range_data jsonb := public.odyssey_creator_normalize_json_object(v_data->'range');
  v_range_mode text := lower(trim(coalesce(v_range_data->>'mode', '')));
  v_max_distance_m integer := nullif(trim(coalesce(v_range_data->>'max_distance_m', '')), '')::integer;
begin
  if v_code = '' or not public.odyssey_creator_is_valid_code(v_code) then
    return public.odyssey_creator_error(
      'VALIDATION_ERROR',
      'code must match ^[a-z][a-z0-9_]*$.',
      jsonb_build_array(jsonb_build_object('field', 'code', 'message', 'Use lowercase snake_case starting with a letter.'))
    );
  end if;

  if v_name = '' then
    return public.odyssey_creator_error(
      'VALIDATION_ERROR',
      'name is required.',
      jsonb_build_array(jsonb_build_object('field', 'name', 'message', 'Name cannot be empty.'))
    );
  end if;

  if v_ability_kind not in ('attack', 'buff', 'support', 'defense', 'passive', 'utility', 'narrative', 'custom') then
    return public.odyssey_creator_error(
      'VALIDATION_ERROR',
      'ability_kind is invalid.',
      jsonb_build_array(jsonb_build_object('field', 'ability_kind', 'message', 'Unsupported ability_kind value.'))
    );
  end if;

  if v_source_type not in ('psionic', 'implant', 'prosthetic', 'equipment', 'item', 'innate', 'custom') then
    return public.odyssey_creator_error(
      'VALIDATION_ERROR',
      'source_type is invalid.',
      jsonb_build_array(jsonb_build_object('field', 'source_type', 'message', 'Unsupported source_type value.'))
    );
  end if;

  if v_activation_type not in ('manual', 'passive', 'on_attack', 'on_hit', 'always', 'custom') then
    return public.odyssey_creator_error(
      'VALIDATION_ERROR',
      'activation_type is invalid.',
      jsonb_build_array(jsonb_build_object('field', 'activation_type', 'message', 'Unsupported activation_type value.'))
    );
  end if;

  if v_target_type not in ('self', 'character', 'body_part', 'none', 'custom') then
    return public.odyssey_creator_error(
      'VALIDATION_ERROR',
      'target_type is invalid.',
      jsonb_build_array(jsonb_build_object('field', 'target_type', 'message', 'Unsupported target_type value.'))
    );
  end if;

  if v_effect_mode not in ('attack', 'apply_effect', 'grant_special', 'narrative', 'custom') then
    return public.odyssey_creator_error(
      'VALIDATION_ERROR',
      'effect_mode is invalid.',
      jsonb_build_array(jsonb_build_object('field', 'effect_mode', 'message', 'Unsupported effect_mode value.'))
    );
  end if;

  if v_attack_type is not null and v_attack_type not in ('ranged', 'melee', 'custom') then
    return public.odyssey_creator_error(
      'VALIDATION_ERROR',
      'attack_type is invalid.',
      jsonb_build_array(jsonb_build_object('field', 'attack_type', 'message', 'Unsupported attack_type value.'))
    );
  end if;

  if v_linked_skill_id is not null and not exists (
    select 1
    from public.odyssey_skill_defs skill
    where skill.id = v_linked_skill_id
  ) then
    return public.odyssey_creator_error(
      'VALIDATION_ERROR',
      'linked_skill_id references an unknown skill.',
      jsonb_build_array(jsonb_build_object('field', 'linked_skill_id', 'message', 'Unknown linked skill id.'))
    );
  end if;

  if v_resource_mode not in ('none', 'pool', 'item', 'cooldown', 'custom') then
    return public.odyssey_creator_error(
      'VALIDATION_ERROR',
      'resource_mode is invalid.',
      jsonb_build_array(jsonb_build_object('field', 'resource_mode', 'message', 'Unsupported resource_mode value.'))
    );
  end if;

  if v_resource_pool_code is not null and not exists (
    select 1
    from public.odyssey_resource_pool_defs pool
    where pool.code = v_resource_pool_code
  ) then
    return public.odyssey_creator_error(
      'VALIDATION_ERROR',
      'resource_pool_code references an unknown resource pool.',
      jsonb_build_array(jsonb_build_object('field', 'resource_pool_code', 'message', 'Unknown resource pool code.'))
    );
  end if;

  if v_resource_item_code is not null and not exists (
    select 1
    from public.odyssey_item_defs item_def
    where item_def.code = v_resource_item_code
  ) then
    return public.odyssey_creator_error(
      'VALIDATION_ERROR',
      'resource_item_code references an unknown item.',
      jsonb_build_array(jsonb_build_object('field', 'resource_item_code', 'message', 'Unknown item definition code.'))
    );
  end if;

  if v_range_mode <> '' and v_range_mode not in ('none', 'limited') then
    return public.odyssey_creator_error(
      'VALIDATION_ERROR',
      'range.mode is invalid.',
      jsonb_build_array(jsonb_build_object('field', 'data.range.mode', 'message', 'Use none or limited.'))
    );
  end if;

  if v_range_mode = 'limited' and coalesce(v_max_distance_m, 0) < 1 then
    return public.odyssey_creator_error(
      'VALIDATION_ERROR',
      'range.max_distance_m must be >= 1 when range mode is limited.',
      jsonb_build_array(jsonb_build_object('field', 'data.range.max_distance_m', 'message', 'Provide a positive max distance.'))
    );
  end if;

  if jsonb_array_length(v_levels) = 0 then
    return public.odyssey_creator_error(
      'VALIDATION_ERROR',
      'At least one ability level is required.',
      jsonb_build_array(jsonb_build_object('field', 'levels', 'message', 'Provide at least one level entry.'))
    );
  end if;

  for v_entry in
    select value
    from jsonb_array_elements(v_effect_links_raw)
  loop
    v_effect_def_id := nullif(trim(coalesce(v_entry->>'effect_def_id', v_entry->>'id', '')), '')::uuid;
    if v_effect_def_id is null or not exists (
      select 1
      from public.odyssey_effect_defs effect_def
      where effect_def.id = v_effect_def_id
    ) then
      return public.odyssey_creator_error(
        'VALIDATION_ERROR',
        'effect_links contain an unknown effect template.',
        jsonb_build_array(jsonb_build_object('field', 'effect_links', 'message', 'Unknown effect_def_id.'))
      );
    end if;

    if v_effect_def_id = any(v_seen_effect_ids) then
      return public.odyssey_creator_error(
        'VALIDATION_ERROR',
        'effect_links must not contain duplicates.',
        jsonb_build_array(jsonb_build_object('field', 'effect_links', 'message', 'Duplicate effect_def_id found.'))
      );
    end if;

    v_seen_effect_ids := array_append(v_seen_effect_ids, v_effect_def_id);
    v_effect_links := v_effect_links || jsonb_build_array(
      jsonb_build_object(
        'effect_def_id', v_effect_def_id,
        'sort_order', coalesce(nullif(trim(coalesce(v_entry->>'sort_order', '')), '')::integer, jsonb_array_length(v_effect_links))
      )
    );
  end loop;

  v_data := jsonb_set(
    v_data - 'effect_links',
    '{effect_links}',
    coalesce(v_effect_links, '[]'::jsonb),
    true
  );

  for v_entry in
    select value
    from jsonb_array_elements(v_levels)
  loop
    v_ability_level := coalesce(nullif(trim(coalesce(v_entry->>'ability_level', '')), '')::integer, 0);
    if v_ability_level < 1 or v_ability_level > 5 then
      return public.odyssey_creator_error(
        'VALIDATION_ERROR',
        'ability_level must be between 1 and 5.',
        jsonb_build_array(jsonb_build_object('field', 'levels', 'message', 'Each ability level must be between 1 and 5.'))
      );
    end if;

    if v_ability_level = any(v_seen_levels) then
      return public.odyssey_creator_error(
        'VALIDATION_ERROR',
        'ability_level values must be unique per ability.',
        jsonb_build_array(jsonb_build_object('field', 'levels', 'message', 'Duplicate ability_level value found.'))
      );
    end if;

    v_seen_levels := array_append(v_seen_levels, v_ability_level);

    v_resource_cost := coalesce(nullif(trim(coalesce(v_entry->>'resource_cost', '')), '')::integer, 0);
    if v_resource_cost < 0 then
      return public.odyssey_creator_error(
        'VALIDATION_ERROR',
        'resource_cost must be >= 0.',
        jsonb_build_array(jsonb_build_object('field', 'levels', 'message', 'resource_cost cannot be negative.'))
      );
    end if;

    v_range_profile_id := nullif(trim(coalesce(v_entry->>'range_profile_id', '')), '')::uuid;
    if v_range_profile_id is not null and not exists (
      select 1 from public.odyssey_range_profile_defs where id = v_range_profile_id
    ) then
      return public.odyssey_creator_error(
        'VALIDATION_ERROR',
        'range_profile_id references an unknown range profile.',
        jsonb_build_array(jsonb_build_object('field', 'levels', 'message', 'Unknown range_profile_id.'))
      );
    end if;
  end loop;

  if v_id is not null then
    select ability.id
    into v_entity_id
    from public.odyssey_ability_defs ability
    where ability.id = v_id;

    if v_entity_id is null then
      return public.odyssey_creator_error(
        'ABILITY_NOT_FOUND',
        'Ability definition was not found for update.',
        jsonb_build_array(jsonb_build_object('field', 'id', 'message', 'Unknown ability definition id.'))
      );
    end if;
  else
    select ability.id
    into v_entity_id
    from public.odyssey_ability_defs ability
    where ability.code = v_code
    limit 1;
  end if;

  if exists (
    select 1
    from public.odyssey_ability_defs ability
    where ability.code = v_code
      and ability.id <> coalesce(v_entity_id, '00000000-0000-0000-0000-000000000000'::uuid)
  ) then
    return public.odyssey_creator_error(
      'VALIDATION_ERROR',
      'Ability code must be unique.',
      jsonb_build_array(jsonb_build_object('field', 'code', 'message', 'Duplicate ability code.'))
    );
  end if;

  if v_entity_id is null then
    insert into public.odyssey_ability_defs (
      code,
      name,
      ability_kind,
      source_type,
      activation_type,
      target_type,
      effect_mode,
      attack_type,
      linked_skill_id,
      resource_mode,
      resource_pool_code,
      resource_item_code,
      description,
      data,
      effect_data,
      tags,
      is_custom,
      sort_order
    )
    values (
      v_code,
      v_name,
      v_ability_kind,
      v_source_type,
      v_activation_type,
      v_target_type,
      v_effect_mode,
      v_attack_type,
      v_linked_skill_id,
      v_resource_mode,
      v_resource_pool_code,
      v_resource_item_code,
      v_description,
      v_data,
      v_effect_data,
      v_tags,
      true,
      v_sort_order
    )
    returning id into v_entity_id;
  else
    update public.odyssey_ability_defs
    set
      code = v_code,
      name = v_name,
      ability_kind = v_ability_kind,
      source_type = v_source_type,
      activation_type = v_activation_type,
      target_type = v_target_type,
      effect_mode = v_effect_mode,
      attack_type = v_attack_type,
      linked_skill_id = v_linked_skill_id,
      resource_mode = v_resource_mode,
      resource_pool_code = v_resource_pool_code,
      resource_item_code = v_resource_item_code,
      description = v_description,
      data = v_data,
      effect_data = v_effect_data,
      tags = v_tags,
      sort_order = v_sort_order
    where id = v_entity_id;
  end if;

  for v_entry in
    select value
    from jsonb_array_elements(v_levels)
  loop
    v_level_id := nullif(trim(coalesce(v_entry->>'id', '')), '')::uuid;
    v_ability_level := coalesce(nullif(trim(coalesce(v_entry->>'ability_level', '')), '')::integer, 0);
    v_resource_cost := coalesce(nullif(trim(coalesce(v_entry->>'resource_cost', '')), '')::integer, 0);
    v_cooldown_rounds := nullif(trim(coalesce(v_entry->>'cooldown_rounds', '')), '')::integer;
    v_range_profile_id := nullif(trim(coalesce(v_entry->>'range_profile_id', '')), '')::uuid;
    v_attack_accuracy_bonus := coalesce(nullif(trim(coalesce(v_entry->>'attack_accuracy_bonus', '')), '')::integer, 0);
    v_attack_damage_bonus := coalesce(nullif(trim(coalesce(v_entry->>'attack_damage_bonus', '')), '')::integer, 0);
    v_attack_armor_pierce := coalesce(nullif(trim(coalesce(v_entry->>'attack_armor_pierce', '')), '')::integer, 0);
    v_ignore_armor := coalesce(nullif(trim(coalesce(v_entry->>'ignore_armor', '')), '')::boolean, false);
    v_special_armor_value := nullif(trim(coalesce(v_entry->>'special_armor_value', '')), '')::integer;
    v_special_max_critical := nullif(trim(coalesce(v_entry->>'special_max_critical', '')), '')::integer;
    v_duration_rounds := nullif(trim(coalesce(v_entry->>'duration_rounds', '')), '')::integer;
    v_level_data := public.odyssey_creator_normalize_json_object(v_entry->'data');
    v_level_effect_data := public.odyssey_creator_normalize_json_object(v_entry->'effect_data');

    if v_level_id is not null then
      if not exists (
        select 1
        from public.odyssey_ability_level_defs level
        where level.id = v_level_id
          and level.ability_def_id = v_entity_id
      ) then
        return public.odyssey_creator_error(
          'VALIDATION_ERROR',
          'Level id does not belong to this ability.',
          jsonb_build_array(jsonb_build_object('field', 'levels', 'message', 'Invalid level id for this ability.'))
        );
      end if;

      update public.odyssey_ability_level_defs
      set
        ability_level = v_ability_level,
        resource_cost = v_resource_cost,
        cooldown_rounds = v_cooldown_rounds,
        range_profile_id = v_range_profile_id,
        attack_accuracy_bonus = v_attack_accuracy_bonus,
        attack_damage_bonus = v_attack_damage_bonus,
        attack_armor_pierce = v_attack_armor_pierce,
        ignore_armor = v_ignore_armor,
        special_armor_value = v_special_armor_value,
        special_max_critical = v_special_max_critical,
        duration_rounds = v_duration_rounds,
        data = v_level_data,
        effect_data = v_level_effect_data
      where id = v_level_id;
    else
      select level.id
      into v_level_id
      from public.odyssey_ability_level_defs level
      where level.ability_def_id = v_entity_id
        and level.ability_level = v_ability_level
      limit 1;

      if v_level_id is null then
        insert into public.odyssey_ability_level_defs (
          ability_def_id,
          ability_level,
          resource_cost,
          cooldown_rounds,
          range_profile_id,
          attack_accuracy_bonus,
          attack_damage_bonus,
          attack_armor_pierce,
          ignore_armor,
          special_armor_value,
          special_max_critical,
          duration_rounds,
          data,
          effect_data
        )
        values (
          v_entity_id,
          v_ability_level,
          v_resource_cost,
          v_cooldown_rounds,
          v_range_profile_id,
          v_attack_accuracy_bonus,
          v_attack_damage_bonus,
          v_attack_armor_pierce,
          v_ignore_armor,
          v_special_armor_value,
          v_special_max_critical,
          v_duration_rounds,
          v_level_data,
          v_level_effect_data
        )
        returning id into v_level_id;
      else
        update public.odyssey_ability_level_defs
        set
          resource_cost = v_resource_cost,
          cooldown_rounds = v_cooldown_rounds,
          range_profile_id = v_range_profile_id,
          attack_accuracy_bonus = v_attack_accuracy_bonus,
          attack_damage_bonus = v_attack_damage_bonus,
          attack_armor_pierce = v_attack_armor_pierce,
          ignore_armor = v_ignore_armor,
          special_armor_value = v_special_armor_value,
          special_max_critical = v_special_max_critical,
          duration_rounds = v_duration_rounds,
          data = v_level_data,
          effect_data = v_level_effect_data
        where id = v_level_id;
      end if;
    end if;

    v_processed_level_ids := array_append(v_processed_level_ids, v_level_id);
  end loop;

  delete from public.odyssey_ability_level_defs
  where ability_def_id = v_entity_id
    and not (id = any(v_processed_level_ids));

  v_result := public.creator_get_ability(v_entity_id);

  return jsonb_build_object(
    'ok', true,
    'entity_id', v_entity_id,
    'entity', v_result,
    'warnings', '[]'::jsonb
  );
end;
$$;

create or replace function public.creator_delete_ability(
  p_ability_def_id uuid
)
returns jsonb
language plpgsql
as $$
declare
  v_ability public.odyssey_ability_defs%rowtype;
  v_character_ability_count integer := 0;
  v_weapon_link_count integer := 0;
  v_equipment_link_count integer := 0;
  v_item_link_count integer := 0;
  v_details jsonb := '[]'::jsonb;
begin
  select *
  into v_ability
  from public.odyssey_ability_defs ability
  where ability.id = p_ability_def_id;

  if not found then
    return public.odyssey_creator_error(
      'ABILITY_NOT_FOUND',
      'Ability definition was not found.',
      jsonb_build_array(jsonb_build_object('field', 'id', 'message', 'Unknown ability definition id.'))
    );
  end if;

  select count(*)::integer into v_character_ability_count
  from public.odyssey_character_abilities ability
  where ability.ability_def_id = p_ability_def_id;

  select count(*)::integer into v_weapon_link_count
  from public.odyssey_weapon_model_abilities link
  where link.ability_def_id = p_ability_def_id;

  select count(*)::integer into v_equipment_link_count
  from public.odyssey_equipment_model_abilities link
  where link.ability_def_id = p_ability_def_id;

  select count(*)::integer into v_item_link_count
  from public.odyssey_item_def_abilities link
  where link.ability_def_id = p_ability_def_id;

  select coalesce(jsonb_agg(item), '[]'::jsonb)
  into v_details
  from (
    select jsonb_build_object('field', 'character_abilities', 'count', v_character_ability_count, 'message', 'Ability is assigned to one or more characters.') as item
    where v_character_ability_count > 0
    union all
    select jsonb_build_object('field', 'weapon_links', 'count', v_weapon_link_count, 'message', 'Ability is linked to one or more weapon models.') as item
    where v_weapon_link_count > 0
    union all
    select jsonb_build_object('field', 'equipment_links', 'count', v_equipment_link_count, 'message', 'Ability is linked to one or more equipment models.') as item
    where v_equipment_link_count > 0
    union all
    select jsonb_build_object('field', 'item_links', 'count', v_item_link_count, 'message', 'Ability is linked to one or more item definitions.') as item
    where v_item_link_count > 0
  ) dependency_rows;

  if v_details <> '[]'::jsonb then
    return public.odyssey_creator_error(
      'ABILITY_DEF_IN_USE',
      'Ability definition is still referenced and cannot be deleted.',
      v_details
    );
  end if;

  delete from public.odyssey_ability_defs ability
  where ability.id = p_ability_def_id;

  return jsonb_build_object(
    'ok', true,
    'deleted_id', p_ability_def_id,
    'deleted_code', v_ability.code
  );
end;
$$;

create or replace function public.use_ability(
  p_payload jsonb
)
returns jsonb
language plpgsql
as $$
declare
  v_character_ability_id uuid := nullif(trim(coalesce(p_payload->>'character_ability_id', '')), '')::uuid;
  v_character_id uuid := nullif(trim(coalesce(p_payload->>'character_id', '')), '')::uuid;
  v_ability_code text := lower(trim(coalesce(p_payload->>'ability_code', '')));
  v_target_character_id uuid := nullif(trim(coalesce(p_payload->>'target_character_id', '')), '')::uuid;
  v_target_body_part_id uuid := nullif(trim(coalesce(p_payload->>'target_body_part_id', '')), '')::uuid;
  v_target_armor_item_id uuid := nullif(trim(coalesce(p_payload->>'target_armor_item_id', '')), '')::uuid;
  v_scene_id text := coalesce(nullif(trim(coalesce(p_payload->>'scene_id', '')), ''), '');
  v_created_by text := coalesce(nullif(trim(coalesce(p_payload->>'created_by', '')), ''), '');
  v_encounter_id uuid := nullif(trim(coalesce(p_payload->>'encounter_id', '')), '')::uuid;
  v_ability record;
  v_level record;
  v_effective_level integer := 0;
  v_target_part record;
  v_resource_result jsonb := '{}'::jsonb;
  v_effect_result jsonb := '{}'::jsonb;
  v_effect_results jsonb := '[]'::jsonb;
  v_merged_ability_data jsonb := '{}'::jsonb;
  v_effect_payload_data jsonb := '{}'::jsonb;
  v_effect_code text := '';
  v_effect_links jsonb := '[]'::jsonb;
  v_effect_link jsonb := '{}'::jsonb;
  v_link_data jsonb := '{}'::jsonb;
  v_link_effect_code text := '';
  v_link_effect_id uuid := null;
  v_effect_instance_data jsonb := '{}'::jsonb;
  v_effect_context jsonb := '{}'::jsonb;
  v_refresh jsonb := '{}'::jsonb;
  v_log_id uuid := null;
  v_log_data jsonb := '{}'::jsonb;
  v_message text := '';
begin
  if v_character_ability_id is null then
    if v_character_id is null or v_ability_code = '' then
      return jsonb_build_object(
        'ok', false,
        'error', 'ABILITY_NOT_FOUND',
        'message', 'character_ability_id or character_id + ability_code is required.'
      );
    end if;

    select ability.id
    into v_character_ability_id
    from public.odyssey_character_abilities ability
    join public.odyssey_ability_defs def on def.id = ability.ability_def_id
    where ability.character_id = v_character_id
      and def.code = v_ability_code
      and ability.is_enabled = true
    order by ability.sort_order, ability.created_at, ability.id
    limit 1;
  end if;

  select
    ability.*,
    def.code as ability_code,
    def.name as ability_name,
    def.ability_kind,
    def.source_type,
    def.activation_type,
    def.target_type,
    def.effect_mode,
    def.attack_type,
    def.resource_mode,
    def.resource_pool_code,
    def.resource_item_code,
    def.description as ability_description,
    def.effect_data as def_effect_data,
    def.data as def_data
  into v_ability
  from public.odyssey_character_abilities ability
  join public.odyssey_ability_defs def on def.id = ability.ability_def_id
  where ability.id = v_character_ability_id
    and ability.is_enabled = true
  for update of ability;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'error', 'ABILITY_NOT_FOUND',
      'character_ability_id', v_character_ability_id
    );
  end if;

  v_character_id := v_ability.character_id;
  v_effective_level := public.odyssey_get_character_ability_effective_level(v_character_ability_id);

  select *
  into v_level
  from public.odyssey_ability_level_defs level_data
  where level_data.ability_def_id = v_ability.ability_def_id
    and level_data.ability_level <= v_effective_level
  order by level_data.ability_level desc
  limit 1;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'error', 'ABILITY_LEVEL_NOT_AVAILABLE',
      'character_ability_id', v_character_ability_id,
      'effective_level', v_effective_level
    );
  end if;

  v_merged_ability_data :=
    coalesce(v_ability.def_data, '{}'::jsonb)
    || coalesce(v_ability.data, '{}'::jsonb)
    || coalesce(v_level.data, '{}'::jsonb);

  v_effect_payload_data := public.odyssey_merge_effect_data(
    public.odyssey_merge_effect_data(
      coalesce(v_ability.def_effect_data, '{}'::jsonb),
      case
        when jsonb_typeof(v_ability.data->'effect_data') = 'object' then v_ability.data->'effect_data'
        else '{}'::jsonb
      end
    ),
    coalesce(v_level.effect_data, '{}'::jsonb)
  );

  v_effect_code := lower(trim(coalesce(
    nullif(v_merged_ability_data->>'effect_code', ''),
    nullif(v_effect_payload_data->>'effect_code', ''),
    ''
  )));

  if jsonb_typeof(v_merged_ability_data->'effect_links') = 'array' then
    v_effect_links := v_merged_ability_data->'effect_links';
  end if;

  if v_ability.ability_kind = 'attack' or v_ability.effect_mode = 'attack' then
    return jsonb_build_object(
      'ok', false,
      'error', 'ABILITY_REQUIRES_ATTACK_RESOLUTION',
      'message', 'Attack abilities must be resolved through perform_attack.',
      'character_ability_id', v_character_ability_id
    );
  end if;

  if v_ability.target_type = 'self' then
    v_target_character_id := v_character_id;
  elsif v_target_character_id is null then
    v_target_character_id := v_character_id;
  end if;

  v_resource_result := public.odyssey_consume_character_ability_cost(v_character_ability_id);
  if coalesce((v_resource_result->>'ok')::boolean, false) = false then
    return v_resource_result;
  end if;

  if coalesce(v_level.cooldown_rounds, 0) > 0 then
    update public.odyssey_character_abilities
    set current_cooldown_rounds = v_level.cooldown_rounds
    where id = v_character_ability_id;
  end if;

  v_effect_context := jsonb_strip_nulls(
    jsonb_build_object(
      'selected_body_part_id', case when v_target_body_part_id is not null then v_target_body_part_id::text else null end,
      'selected_armor_item_id', case when v_target_armor_item_id is not null then v_target_armor_item_id::text else null end
    )
  );

  if v_ability.effect_mode = 'apply_effect' then
    if jsonb_typeof(v_effect_links) = 'array' and jsonb_array_length(v_effect_links) > 0 then
      for v_effect_link in
        select value
        from jsonb_array_elements(v_effect_links)
        order by coalesce(nullif(value->>'sort_order', '')::integer, 0)
      loop
        v_link_effect_code := lower(trim(coalesce(v_effect_link->>'effect_code', '')));
        v_link_effect_id := nullif(trim(coalesce(v_effect_link->>'effect_def_id', '')), '')::uuid;
        if v_link_effect_code = '' and v_link_effect_id is not null then
          select effect_def.code
          into v_link_effect_code
          from public.odyssey_effect_defs effect_def
          where effect_def.id = v_link_effect_id;
        end if;

        if v_link_effect_code = '' then
          return jsonb_build_object(
            'ok', false,
            'error', 'ABILITY_EFFECT_NOT_CONFIGURED',
            'message', 'One of the linked effects is missing effect_def_id/effect_code.',
            'character_ability_id', v_character_ability_id
          );
        end if;

        v_link_data := case
          when jsonb_typeof(v_effect_link->'data') = 'object' then v_effect_link->'data'
          else '{}'::jsonb
        end;
        v_effect_instance_data := public.odyssey_merge_effect_data(v_effect_payload_data, v_link_data);
        if v_effect_context <> '{}'::jsonb then
          v_effect_instance_data := public.odyssey_merge_effect_data(
            v_effect_instance_data,
            jsonb_build_object('context', v_effect_context)
          );
        end if;

        v_effect_result := public.add_character_effect(
          jsonb_build_object(
            'character_id', v_target_character_id,
            'effect_code', v_link_effect_code,
            'effect_key', v_ability.ability_code || ':' || v_link_effect_code,
            'name', v_ability.ability_name,
            'description', v_ability.ability_description,
            'category',
              case
                when v_ability.source_type = 'psionic' then 'psionic'
                when v_ability.source_type in ('implant', 'prosthetic', 'equipment', 'item') then 'equipment'
                else 'custom'
              end,
            'duration_type', case when v_level.duration_rounds is not null and v_level.duration_rounds > 0 then 'rounds' else 'manual' end,
            'rounds_left', v_level.duration_rounds,
            'source', v_ability.ability_name,
            'source_type', v_ability.source_type,
            'source_id', v_character_ability_id::text,
            'source_character_id', v_character_id::text,
            'data', v_effect_instance_data,
            'created_by', v_created_by
          )
        );

        if coalesce((v_effect_result->>'ok')::boolean, false) = false then
          return v_effect_result;
        end if;

        v_refresh := coalesce(v_effect_result->'combat_state', v_refresh);
        v_effect_results := v_effect_results || jsonb_build_array(coalesce(v_effect_result->'effect', '{}'::jsonb));
      end loop;

      v_effect_result := jsonb_build_object(
        'ok', true,
        'effects', v_effect_results,
        'combat_state', v_refresh
      );
    elsif v_effect_code <> '' then
      v_effect_instance_data := v_effect_payload_data;
      if v_effect_context <> '{}'::jsonb then
        v_effect_instance_data := public.odyssey_merge_effect_data(
          v_effect_instance_data,
          jsonb_build_object('context', v_effect_context)
        );
      end if;

      v_effect_result := public.add_character_effect(
        jsonb_build_object(
          'character_id', v_target_character_id,
          'effect_code', v_effect_code,
          'effect_key', v_ability.ability_code,
          'name', v_ability.ability_name,
          'description', v_ability.ability_description,
          'category',
            case
              when v_ability.source_type = 'psionic' then 'psionic'
              when v_ability.source_type in ('implant', 'prosthetic', 'equipment', 'item') then 'equipment'
              else 'custom'
            end,
          'duration_type', case when v_level.duration_rounds is not null and v_level.duration_rounds > 0 then 'rounds' else 'manual' end,
          'rounds_left', v_level.duration_rounds,
          'source', v_ability.ability_name,
          'source_type', v_ability.source_type,
          'source_id', v_character_ability_id::text,
          'source_character_id', v_character_id::text,
          'data', v_effect_instance_data,
          'created_by', v_created_by
        )
      );

      if coalesce((v_effect_result->>'ok')::boolean, false) = false then
        return v_effect_result;
      end if;

      v_refresh := coalesce(v_effect_result->'combat_state', '{}'::jsonb);
    else
      v_refresh := coalesce(public.odyssey_refresh_character_combat_state(v_target_character_id)->'combat_state', '{}'::jsonb);
      v_effect_result := jsonb_build_object(
        'ok', true,
        'narrative_only', true,
        'combat_state', v_refresh
      );
    end if;
  elsif v_ability.effect_mode = 'grant_special' then
    select
      b.id,
      b.character_id,
      b.part_key,
      b.max_critical,
      b.critical
    into v_target_part
    from public.odyssey_character_body_parts b
    left join public.odyssey_body_part_defs d on d.id = b.body_part_def_id
    where b.character_id = v_target_character_id
      and coalesce(d.code, public.odyssey_normalize_part_code(b.part_key)) = 'special'
    limit 1
    for update of b;

    if not found then
      return jsonb_build_object(
        'ok', false,
        'error', 'SPECIAL_BODY_PART_NOT_FOUND',
        'target_character_id', v_target_character_id
      );
    end if;

    update public.odyssey_character_body_parts
    set
      natural_armor_value = greatest(coalesce(v_level.special_armor_value, 0), 0),
      max_critical = greatest(coalesce(v_level.special_max_critical, max_critical), 0),
      critical = 0,
      serious = 0,
      minor = 0,
      disabled = false,
      destroyed = false
    where id = v_target_part.id;

    perform public.recompute_character_armor(v_target_character_id);
    v_refresh := coalesce(public.odyssey_refresh_character_combat_state(v_target_character_id)->'combat_state', '{}'::jsonb);
    v_effect_result := jsonb_build_object(
      'ok', true,
      'special', public.odyssey_get_character_body_part_state(v_target_part.id),
      'combat_state', v_refresh
    );
  else
    v_refresh := coalesce(public.odyssey_refresh_character_combat_state(v_target_character_id)->'combat_state', '{}'::jsonb);
    v_effect_result := jsonb_build_object(
      'ok', true,
      'narrative_only', true,
      'combat_state', v_refresh
    );
  end if;

  v_message := format(
    '%s uses %s.',
    coalesce(
      (
        select coalesce(nullif(trim(c.resources->>'name'), ''), c.character_key)
        from public.odyssey_characters c
        where c.id = v_character_id
      ),
      v_character_id::text
    ),
    v_ability.ability_name
  );

  v_log_data := jsonb_build_object(
    'type', 'ability_use',
    'ok', true,
    'character_ability_id', v_character_ability_id,
    'character_id', v_character_id,
    'target_character_id', v_target_character_id,
    'target_body_part_id', v_target_body_part_id,
    'target_armor_item_id', v_target_armor_item_id,
    'ability',
      jsonb_build_object(
        'code', v_ability.ability_code,
        'name', v_ability.ability_name,
        'ability_kind', v_ability.ability_kind,
        'source_type', v_ability.source_type,
        'effect_mode', v_ability.effect_mode,
        'effective_level', v_effective_level
      ),
    'resource', v_resource_result,
    'result', v_effect_result
  );

  insert into public.odyssey_combat_log (
    campaign_id,
    room_id,
    scene_id,
    encounter_id,
    actor_character_id,
    target_character_id,
    event_type,
    message,
    data,
    created_by
  )
  values (
    coalesce((select c.campaign_id from public.odyssey_characters c where c.id = v_character_id), ''),
    coalesce((select c.room_id from public.odyssey_characters c where c.id = v_character_id), ''),
    v_scene_id,
    v_encounter_id,
    v_character_id,
    v_target_character_id,
    'ability_use',
    v_message,
    v_log_data,
    v_created_by
  )
  returning id into v_log_id;

  perform public.odyssey_trim_combat_log(v_encounter_id, coalesce((select c.room_id from public.odyssey_characters c where c.id = v_character_id), ''));

  return jsonb_build_object(
    'ok', true,
    'character_ability_id', v_character_ability_id,
    'character_id', v_character_id,
    'target_character_id', v_target_character_id,
    'target_body_part_id', v_target_body_part_id,
    'target_armor_item_id', v_target_armor_item_id,
    'ability',
      jsonb_build_object(
        'code', v_ability.ability_code,
        'name', v_ability.ability_name,
        'ability_kind', v_ability.ability_kind,
        'source_type', v_ability.source_type,
        'effect_mode', v_ability.effect_mode,
        'effective_level', v_effective_level
      ),
    'resource', v_resource_result,
    'result', v_effect_result,
    'combat_state', v_refresh,
    'log_id', v_log_id
  );
end;
$$;

grant execute on function public.creator_upsert_ability(jsonb) to anon, authenticated;
grant execute on function public.creator_delete_ability(uuid) to anon, authenticated;
grant execute on function public.use_ability(jsonb) to anon, authenticated;
