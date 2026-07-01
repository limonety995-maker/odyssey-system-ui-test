-- 89_creator_definition_refresh_and_armor_pierce.sql

create or replace function public.get_character_effect_summary(
  p_character_id uuid
)
returns jsonb
language plpgsql
stable
as $$
declare
  v_active_effects jsonb := '[]'::jsonb;
  v_modifier_rows jsonb := '[]'::jsonb;
  v_attribute_modifiers jsonb := '{}'::jsonb;
  v_skill_modifiers jsonb := '{}'::jsonb;
  v_skill_minimums jsonb := '{}'::jsonb;
  v_attack_accuracy integer := 0;
  v_defense integer := 0;
  v_damage integer := 0;
  v_armor integer := 0;
  v_armor_pierce integer := 0;
  v_movement_m integer := 0;
  v_action_count integer := 0;
  v_concentration_slots integer := 0;
  v_aim_difficulty integer := 0;
  v_range integer := 0;
  v_skip_main_action boolean := false;
  v_skip_movement boolean := false;
  v_consumes_full_turn boolean := false;
  v_helpless boolean := false;
  v_fatal_on_any_damage_if_unprotected boolean := false;
  v_suppress_movement boolean := false;
  v_cannot_leave_cover boolean := false;
  v_expires_after_attack boolean := false;
  v_expires_after_turn boolean := false;
  v_requires_concentration boolean := false;
begin
  with active_effect_rows as (
    select
      effect_rows.id,
      effect_rows.character_id,
      effect_rows.effect_def_id,
      effect_rows.code,
      effect_rows.effect_key,
      effect_rows.name,
      effect_rows.category,
      effect_rows.description,
      effect_rows.source,
      effect_rows.source_type,
      effect_rows.source_id,
      effect_rows.source_character_id,
      effect_rows.source_character_weapon_id,
      effect_rows.duration_type,
      effect_rows.rounds_left,
      effect_rows.stacks,
      effect_rows.data,
      effect_rows.stacking_mode,
      effect_rows.is_negative,
      effect_rows.is_narrative,
      effect_rows.created_by,
      effect_rows.created_at,
      effect_rows.updated_at
    from (
      select
        e.id,
        e.character_id,
        e.effect_def_id,
        coalesce(d.code, nullif(e.effect_key, ''), 'custom') as code,
        e.effect_key,
        e.name,
        coalesce(d.category, nullif(e.data->>'category', ''), 'custom') as category,
        e.description,
        e.source,
        coalesce(e.source_type, '') as source_type,
        e.source_id,
        e.source_character_id,
        e.source_character_weapon_id,
        e.duration_type,
        e.rounds_left,
        e.stacks,
        e.data,
        coalesce(d.stacking_mode, 'stack') as stacking_mode,
        coalesce(d.is_negative, false) as is_negative,
        coalesce(d.is_narrative, false) as is_narrative,
        e.created_by,
        e.created_at,
        e.updated_at
      from public.odyssey_character_effects e
      left join public.odyssey_effect_defs d on d.id = e.effect_def_id
      where e.character_id = p_character_id
        and e.is_active = true

      union all

      select
        item.id,
        item.character_id,
        null::uuid as effect_def_id,
        coalesce(nullif(trim(model.code), ''), 'equipment') as code,
        'equipment:' || item.id::text as effect_key,
        coalesce(nullif(trim(item.custom_name), ''), model.name) as name,
        coalesce(nullif(trim(item_effect.effect_data->>'category'), ''), 'equipment') as category,
        coalesce(
          nullif(trim(item_effect.effect_data->>'description'), ''),
          nullif(trim(model.description), ''),
          coalesce(nullif(trim(item.custom_name), ''), model.name)
        ) as description,
        coalesce(nullif(trim(item.custom_name), ''), model.name) as source,
        coalesce(nullif(trim(model.item_type), ''), 'equipment') as source_type,
        item.id as source_id,
        item.character_id as source_character_id,
        null::uuid as source_character_weapon_id,
        'manual'::text as duration_type,
        null::integer as rounds_left,
        1 as stacks,
        item_effect.effect_data as data,
        coalesce(nullif(trim(item_effect.effect_data->>'stacking_mode'), ''), 'stack') as stacking_mode,
        coalesce(nullif(trim(item_effect.effect_data->>'is_negative'), '')::boolean, false) as is_negative,
        coalesce(nullif(trim(item_effect.effect_data->>'is_narrative'), '')::boolean, false) as is_narrative,
        ''::text as created_by,
        item.created_at,
        item.updated_at
      from public.odyssey_character_equipment_items item
      join public.odyssey_equipment_model_defs model on model.id = item.equipment_model_id
      cross join lateral (
        select public.odyssey_merge_effect_data(
          coalesce(model.effect_data, '{}'::jsonb),
          case
            when jsonb_typeof(item.data->'effect_data') = 'object' then item.data->'effect_data'
            else '{}'::jsonb
          end
        ) as effect_data
      ) item_effect
      where item.character_id = p_character_id
        and item.is_equipped = true
        and (
          (
            jsonb_typeof(item_effect.effect_data->'modifiers') = 'array'
            and jsonb_array_length(item_effect.effect_data->'modifiers') > 0
          )
          or (
            jsonb_typeof(item_effect.effect_data->'flags') = 'object'
            and item_effect.effect_data->'flags' <> '{}'::jsonb
          )
        )
    ) effect_rows
  ),
  modifier_raw as (
    select
      aer.effect_key,
      aer.code,
      aer.category,
      aer.stacking_mode,
      lower(coalesce(modifier.value->>'target', '')) as target,
      lower(coalesce(modifier.value->>'mode', '')) as mode,
      nullif(trim(coalesce(modifier.value->>'attribute', '')), '') as attribute_ref,
      nullif(trim(coalesce(modifier.value->>'skill_code', modifier.value->>'skill', '')), '') as skill_ref,
      coalesce(nullif(trim(coalesce(modifier.value->>'value', '')), '')::integer, 0) as value
    from active_effect_rows aer
    join lateral jsonb_array_elements(
      case
        when jsonb_typeof(aer.data->'modifiers') = 'array' then aer.data->'modifiers'
        else '[]'::jsonb
      end
    ) modifier(value) on true
    where aer.source_character_weapon_id is null
  ),
  modifier_resolved as (
    select
      raw.effect_key,
      raw.code,
      raw.category,
      raw.stacking_mode,
      raw.target,
      raw.mode,
      case
        when raw.target = 'attribute' then coalesce(attribute_by_id.code, attribute_by_code.code, lower(raw.attribute_ref))
        else null
      end as attribute_code,
      case
        when raw.target = 'skill' then coalesce(skill_by_id.code, skill_by_code.code, lower(raw.skill_ref))
        else null
      end as skill_code,
      raw.value
    from modifier_raw raw
    left join public.odyssey_attribute_defs attribute_by_id
      on attribute_by_id.id = public.odyssey_try_parse_uuid(raw.attribute_ref)
    left join public.odyssey_attribute_defs attribute_by_code
      on lower(attribute_by_code.code) = lower(raw.attribute_ref)
    left join public.odyssey_skill_defs skill_by_id
      on skill_by_id.id = public.odyssey_try_parse_uuid(raw.skill_ref)
    left join public.odyssey_skill_defs skill_by_code
      on lower(skill_by_code.code) = lower(raw.skill_ref)
  ),
  modifier_summary as (
    select
      target,
      attribute_code,
      skill_code,
      array_remove(array_agg(distinct effect_key), null) as effect_keys,
      array_remove(array_agg(distinct code), null) as effect_codes,
      case
        when bool_or(stacking_mode = 'lowest') then min(value)
        when bool_or(stacking_mode = 'highest') then max(value)
        else sum(value)
      end as resolved_value,
      case
        when bool_or(stacking_mode = 'lowest') then 'lowest'
        when bool_or(stacking_mode = 'highest') then 'highest'
        when bool_or(stacking_mode = 'replace') then 'replace'
        when bool_or(stacking_mode = 'unique') then 'unique'
        else 'stack'
      end as aggregation
    from modifier_resolved
    where target <> ''
      and coalesce(mode, '') <> 'set_min'
    group by target, attribute_code, skill_code
  ),
  skill_minimum_summary as (
    select
      skill_code,
      max(value) as minimum_value
    from modifier_resolved
    where target = 'skill'
      and skill_code is not null
      and mode = 'set_min'
    group by skill_code
  ),
  flag_raw as (
    select
      lower(flags.key) as flag_key,
      case
        when jsonb_typeof(flags.value) = 'boolean' then (flags.value #>> '{}')::boolean
        when lower(coalesce(flags.value #>> '{}', 'false')) in ('true', '1', 'yes', 'on') then true
        else false
      end as flag_value
    from active_effect_rows aer
    join lateral jsonb_each(
      case
        when jsonb_typeof(aer.data->'flags') = 'object' then aer.data->'flags'
        else '{}'::jsonb
      end
    ) flags(key, value) on true
    where aer.source_character_weapon_id is null
  )
  select
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', id,
            'effect_def_id', effect_def_id,
            'code', code,
            'effect_key', effect_key,
            'name', name,
            'category', category,
            'description', description,
            'source', source,
            'source_type', source_type,
            'source_id', source_id,
            'source_character_id', source_character_id,
            'source_character_weapon_id', source_character_weapon_id,
            'duration_type', duration_type,
            'rounds_left', rounds_left,
            'stacks', stacks,
            'data', data,
            'is_negative', is_negative,
            'is_narrative', is_narrative,
            'created_by', created_by,
            'created_at', created_at,
            'updated_at', updated_at
          )
          order by created_at desc, id
        )
        from active_effect_rows
      ),
      '[]'::jsonb
    ),
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'effect_keys', to_jsonb(effect_keys),
            'effect_codes', to_jsonb(effect_codes),
            'target', target,
            'attribute', attribute_code,
            'skill_code', skill_code,
            'value', resolved_value,
            'aggregation', aggregation,
            'mode', aggregation
          )
          order by target, attribute_code, skill_code
        )
        from modifier_summary
      ),
      '[]'::jsonb
    ),
    coalesce(
      (
        select jsonb_object_agg(attribute_code, resolved_value)
        from modifier_summary
        where target = 'attribute'
          and attribute_code is not null
      ),
      '{}'::jsonb
    ),
    coalesce(
      (
        select jsonb_object_agg(skill_code, resolved_value)
        from modifier_summary
        where target = 'skill'
          and skill_code is not null
      ),
      '{}'::jsonb
    ),
    coalesce(
      (
        select jsonb_object_agg(skill_code, minimum_value)
        from skill_minimum_summary
      ),
      '{}'::jsonb
    ),
    coalesce((select sum(resolved_value) from modifier_summary where target = 'attack_accuracy'), 0),
    coalesce((select sum(resolved_value) from modifier_summary where target = 'defense'), 0),
    coalesce((select sum(resolved_value) from modifier_summary where target = 'damage'), 0),
    coalesce((select sum(resolved_value) from modifier_summary where target = 'armor'), 0),
    coalesce((select sum(resolved_value) from modifier_summary where target = 'armor_pierce'), 0),
    coalesce((select sum(resolved_value) from modifier_summary where target = 'movement_m'), 0),
    coalesce((select sum(resolved_value) from modifier_summary where target = 'action_count'), 0),
    coalesce((select sum(resolved_value) from modifier_summary where target = 'concentration_slots'), 0),
    coalesce((select sum(resolved_value) from modifier_summary where target = 'aim_difficulty'), 0),
    coalesce((select sum(resolved_value) from modifier_summary where target = 'range'), 0),
    coalesce((select bool_or(flag_value) from flag_raw where flag_key = 'skip_main_action'), false),
    coalesce((select bool_or(flag_value) from flag_raw where flag_key = 'skip_movement'), false),
    coalesce((select bool_or(flag_value) from flag_raw where flag_key = 'consumes_full_turn'), false),
    coalesce((select bool_or(flag_value) from flag_raw where flag_key = 'helpless'), false),
    coalesce((select bool_or(flag_value) from flag_raw where flag_key = 'fatal_on_any_damage_if_unprotected'), false),
    coalesce((select bool_or(flag_value) from flag_raw where flag_key = 'suppress_movement'), false),
    coalesce((select bool_or(flag_value) from flag_raw where flag_key = 'cannot_leave_cover'), false),
    coalesce((select bool_or(flag_value) from flag_raw where flag_key = 'expires_after_attack'), false),
    coalesce((select bool_or(flag_value) from flag_raw where flag_key = 'expires_after_turn'), false),
    coalesce((select bool_or(flag_value) from flag_raw where flag_key = 'requires_concentration'), false)
  into
    v_active_effects,
    v_modifier_rows,
    v_attribute_modifiers,
    v_skill_modifiers,
    v_skill_minimums,
    v_attack_accuracy,
    v_defense,
    v_damage,
    v_armor,
    v_armor_pierce,
    v_movement_m,
    v_action_count,
    v_concentration_slots,
    v_aim_difficulty,
    v_range,
    v_skip_main_action,
    v_skip_movement,
    v_consumes_full_turn,
    v_helpless,
    v_fatal_on_any_damage_if_unprotected,
    v_suppress_movement,
    v_cannot_leave_cover,
    v_expires_after_attack,
    v_expires_after_turn,
    v_requires_concentration;

  return jsonb_build_object(
    'character_id', p_character_id,
    'active_effects', v_active_effects,
    'modifier_rows', v_modifier_rows,
    'modifiers',
      jsonb_build_object(
        'attributes', v_attribute_modifiers,
        'skills', v_skill_modifiers,
        'skills_set_min', v_skill_minimums,
        'attack_accuracy', v_attack_accuracy,
        'defense', v_defense,
        'damage', v_damage,
        'armor', v_armor,
        'armor_pierce', v_armor_pierce,
        'movement_m', v_movement_m,
        'action_count', v_action_count,
        'concentration_slots', v_concentration_slots,
        'aim_difficulty', v_aim_difficulty,
        'range', v_range
      ),
    'flags',
      jsonb_build_object(
        'helpless', v_helpless,
        'skip_main_action', v_skip_main_action,
        'skip_movement', v_skip_movement,
        'consumes_full_turn', v_consumes_full_turn,
        'fatal_on_any_damage_if_unprotected', v_fatal_on_any_damage_if_unprotected,
        'suppress_movement', v_suppress_movement,
        'cannot_leave_cover', v_cannot_leave_cover,
        'expires_after_attack', v_expires_after_attack,
        'expires_after_turn', v_expires_after_turn,
        'requires_concentration', v_requires_concentration
      )
  );
end;
$$;

create or replace function public.odyssey_get_weapon_effect_summary(
  p_character_id uuid,
  p_character_weapon_id uuid
)
returns jsonb
language plpgsql
stable
as $$
declare
  v_active_effects jsonb := '[]'::jsonb;
  v_attack_accuracy integer := 0;
  v_damage integer := 0;
  v_armor_pierce integer := 0;
  v_aim_difficulty integer := 0;
  v_range integer := 0;
begin
  with active_effect_rows as (
    select
      e.id,
      e.character_id,
      e.effect_def_id,
      coalesce(d.code, nullif(e.effect_key, ''), 'custom') as code,
      e.effect_key,
      e.name,
      coalesce(d.category, nullif(e.data->>'category', ''), 'custom') as category,
      e.description,
      e.source,
      coalesce(e.source_type, '') as source_type,
      e.source_id,
      e.source_character_id,
      e.source_character_weapon_id,
      e.duration_type,
      e.rounds_left,
      e.stacks,
      e.data,
      coalesce(d.stacking_mode, 'stack') as stacking_mode,
      coalesce(d.is_negative, false) as is_negative,
      coalesce(d.is_narrative, false) as is_narrative,
      e.created_by,
      e.created_at,
      e.updated_at
    from public.odyssey_character_effects e
    left join public.odyssey_effect_defs d on d.id = e.effect_def_id
    where e.character_id = p_character_id
      and e.is_active = true
      and e.source_character_weapon_id = p_character_weapon_id
  ),
  modifier_rows as (
    select
      lower(coalesce(modifier.value->>'target', '')) as target,
      coalesce(nullif(trim(coalesce(modifier.value->>'value', '')), '')::integer, 0) as value
    from active_effect_rows aer
    join lateral jsonb_array_elements(
      case
        when jsonb_typeof(aer.data->'modifiers') = 'array' then aer.data->'modifiers'
        else '[]'::jsonb
      end
    ) modifier(value) on true
  )
  select
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', id,
            'effect_def_id', effect_def_id,
            'code', code,
            'effect_key', effect_key,
            'name', name,
            'category', category,
            'description', description,
            'source', source,
            'source_type', source_type,
            'source_id', source_id,
            'source_character_id', source_character_id,
            'source_character_weapon_id', source_character_weapon_id,
            'duration_type', duration_type,
            'rounds_left', rounds_left,
            'stacks', stacks,
            'data', data,
            'is_negative', is_negative,
            'is_narrative', is_narrative,
            'created_by', created_by,
            'created_at', created_at,
            'updated_at', updated_at
          )
          order by created_at desc, id
        )
        from active_effect_rows
      ),
      '[]'::jsonb
    ),
    coalesce((select sum(value) from modifier_rows where target = 'attack_accuracy'), 0),
    coalesce((select sum(value) from modifier_rows where target = 'damage'), 0),
    coalesce((select sum(value) from modifier_rows where target = 'armor_pierce'), 0),
    coalesce((select sum(value) from modifier_rows where target = 'aim_difficulty'), 0),
    coalesce((select sum(value) from modifier_rows where target = 'range'), 0)
  into
    v_active_effects,
    v_attack_accuracy,
    v_damage,
    v_armor_pierce,
    v_aim_difficulty,
    v_range;

  return jsonb_build_object(
    'character_id', p_character_id,
    'character_weapon_id', p_character_weapon_id,
    'active_effects', v_active_effects,
    'attack_accuracy', v_attack_accuracy,
    'damage', v_damage,
    'armor_pierce', v_armor_pierce,
    'aim_difficulty', v_aim_difficulty,
    'range', v_range
  );
end;
$$;

create or replace function public.get_effective_character_stats(
  p_character_id uuid
)
returns jsonb
language plpgsql
stable
as $$
declare
  v_result jsonb := '{}'::jsonb;
  v_force_dead boolean := false;
  v_armor_pierce_modifier integer := 0;
begin
  v_result := public.odyssey_get_effective_character_stats_legacy(p_character_id);

  if coalesce((v_result->>'ok')::boolean, false) = false then
    return v_result;
  end if;

  v_armor_pierce_modifier := coalesce(
    nullif(jsonb_extract_path_text(v_result, 'effect_summary', 'modifiers', 'armor_pierce'), '')::integer,
    0
  );

  v_result := jsonb_set(
    v_result,
    '{derived,armor_pierce_modifier}',
    to_jsonb(v_armor_pierce_modifier),
    true
  );

  select exists(
    select 1
    from public.odyssey_character_effects e
    where e.character_id = p_character_id
      and e.is_active = true
      and coalesce(nullif(e.data#>>'{flags,force_dead}', '')::boolean, false)
  )
  into v_force_dead;

  if v_force_dead then
    v_result := jsonb_set(v_result, '{derived,is_alive}', 'false'::jsonb, true);
    v_result := jsonb_set(v_result, '{derived,is_conscious}', 'false'::jsonb, true);
    v_result := jsonb_set(v_result, '{derived,helpless}', 'true'::jsonb, true);
    v_result := jsonb_set(v_result, '{derived,skip_main_action}', 'true'::jsonb, true);
    v_result := jsonb_set(v_result, '{derived,skip_movement}', 'true'::jsonb, true);
    v_result := jsonb_set(v_result, '{derived,consumes_full_turn}', 'true'::jsonb, true);
    v_result := jsonb_set(v_result, '{derived,main_actions_per_turn}', '0'::jsonb, true);
    v_result := jsonb_set(v_result, '{derived,movement_available_m}', '0'::jsonb, true);
  end if;

  return v_result;
end;
$$;

do $$
begin
  if to_regprocedure('public.odyssey_perform_ability_attack(jsonb)') is not null
     and to_regprocedure('public.odyssey_perform_ability_attack_legacy(jsonb)') is null then
    alter function public.odyssey_perform_ability_attack(jsonb)
      rename to odyssey_perform_ability_attack_legacy;
  end if;
end;
$$;

do $$
declare
  v_function_def text := null;
begin
  select pg_get_functiondef(p.oid)
  into v_function_def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'odyssey_perform_ability_attack_legacy'
    and pg_get_function_identity_arguments(p.oid) = 'p_payload jsonb';

  if v_function_def is null then
    raise exception 'Function public.odyssey_perform_ability_attack_legacy(jsonb) was not found.';
  end if;

  if position(
    $needle$v_runtime_data := public.odyssey_merge_runtime_data(
      public.odyssey_merge_runtime_data(
        coalesce(v_ability.ability_definition_data, '{}'::jsonb),
        coalesce(v_ability.data, '{}'::jsonb)
      ),
      coalesce(v_level.data, '{}'::jsonb)
    );$needle$
    in v_function_def
  ) > 0 then
    v_function_def := replace(
      v_function_def,
      $old$v_runtime_data := public.odyssey_merge_runtime_data(
      public.odyssey_merge_runtime_data(
        coalesce(v_ability.ability_definition_data, '{}'::jsonb),
        coalesce(v_ability.data, '{}'::jsonb)
      ),
      coalesce(v_level.data, '{}'::jsonb)
    );$old$,
      $new$v_runtime_data := public.odyssey_merge_runtime_data(
      public.odyssey_merge_runtime_data(
        public.odyssey_merge_runtime_data(
          coalesce(v_ability.ability_definition_data, '{}'::jsonb),
          coalesce(v_ability.data, '{}'::jsonb)
        ),
        coalesce(v_level.data, '{}'::jsonb)
      ),
      case
        when jsonb_typeof(p_payload->'runtime_data') = 'object' then p_payload->'runtime_data'
        else '{}'::jsonb
      end
    );$new$
    );
    execute v_function_def;
  end if;
end;
$$;

create or replace function public.odyssey_perform_ability_attack(
  p_payload jsonb
)
returns jsonb
language plpgsql
as $$
declare
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_character_ability_id uuid := public.odyssey_try_parse_uuid(v_payload->>'character_ability_id');
  v_attacker_character_id uuid := public.odyssey_try_parse_uuid(coalesce(v_payload->>'attacker_character_id', v_payload->>'character_id'));
  v_ability_code text := lower(trim(coalesce(v_payload->>'ability_code', '')));
  v_ability record;
  v_weapon_effect_summary jsonb := '{}'::jsonb;
  v_runtime_modifiers jsonb := '[]'::jsonb;
  v_existing_runtime_data jsonb := case
    when jsonb_typeof(v_payload->'runtime_data') = 'object' then v_payload->'runtime_data'
    else '{}'::jsonb
  end;
  v_runtime_data jsonb := '{}'::jsonb;
  v_required_profile_id uuid := null;
  v_result jsonb := '{}'::jsonb;
begin
  if v_character_ability_id is not null or (v_attacker_character_id is not null and v_ability_code <> '') then
    select
      ability.id,
      ability.character_id,
      ability.source_character_weapon_id,
      ability.is_enabled,
      ability.is_hidden,
      ability.data,
      def.code as ability_code,
      def.attack_type,
      def.ability_kind,
      def.effect_mode
    into v_ability
    from public.odyssey_character_abilities ability
    join public.odyssey_ability_defs def on def.id = ability.ability_def_id
    where (
      (v_character_ability_id is not null and ability.id = v_character_ability_id)
      or (
        v_character_ability_id is null
        and ability.character_id = v_attacker_character_id
        and def.code = v_ability_code
      )
    )
    order by ability.sort_order, ability.created_at, ability.id
    limit 1;
  end if;

  if found and v_ability.source_character_weapon_id is not null then
    v_attacker_character_id := v_ability.character_id;
    v_required_profile_id := public.odyssey_try_parse_uuid(v_ability.data->>'required_profile_id');

    if coalesce(v_ability.is_enabled, false) = false
       or coalesce(v_ability.is_hidden, false) = true
       or coalesce((v_ability.data->>'source_removed')::boolean, false) then
      return jsonb_build_object(
        'ok', false,
        'error', 'WEAPON_ABILITY_SOURCE_NOT_AVAILABLE',
        'message', 'This weapon ability is no longer available on the source weapon.',
        'character_ability_id', v_ability.id,
        'character_weapon_id', v_ability.source_character_weapon_id
      );
    end if;

    if not exists (
      select 1
      from public.odyssey_character_weapons weapon
      where weapon.id = v_ability.source_character_weapon_id
        and weapon.character_id = v_attacker_character_id
    ) then
      return jsonb_build_object(
        'ok', false,
        'error', 'WEAPON_ABILITY_SOURCE_NOT_AVAILABLE',
        'message', 'The source weapon for this ability is not available.',
        'character_ability_id', v_ability.id,
        'character_weapon_id', v_ability.source_character_weapon_id
      );
    end if;

    if v_required_profile_id is not null and not exists (
      select 1
      from public.odyssey_character_weapons weapon
      where weapon.id = v_ability.source_character_weapon_id
        and weapon.active_profile_id = v_required_profile_id
    ) then
      return jsonb_build_object(
        'ok', false,
        'error', 'ABILITY_NOT_AVAILABLE_FOR_WEAPON_PROFILE',
        'message', 'This weapon ability is not available for the currently active weapon profile.',
        'character_ability_id', v_ability.id,
        'character_weapon_id', v_ability.source_character_weapon_id,
        'required_profile_id', v_required_profile_id
      );
    end if;

    v_weapon_effect_summary := public.odyssey_get_weapon_effect_summary(
      v_attacker_character_id,
      v_ability.source_character_weapon_id
    );

    if coalesce(nullif(v_weapon_effect_summary->>'attack_accuracy', '')::integer, 0) <> 0 then
      v_runtime_modifiers := v_runtime_modifiers || jsonb_build_array(
        jsonb_build_object(
          'target', 'attack_accuracy',
          'value', coalesce(nullif(v_weapon_effect_summary->>'attack_accuracy', '')::integer, 0)
        )
      );
    end if;
    if coalesce(nullif(v_weapon_effect_summary->>'damage', '')::integer, 0) <> 0 then
      v_runtime_modifiers := v_runtime_modifiers || jsonb_build_array(
        jsonb_build_object(
          'target', 'damage',
          'value', coalesce(nullif(v_weapon_effect_summary->>'damage', '')::integer, 0)
        )
      );
    end if;
    if coalesce(nullif(v_weapon_effect_summary->>'armor_pierce', '')::integer, 0) <> 0 then
      v_runtime_modifiers := v_runtime_modifiers || jsonb_build_array(
        jsonb_build_object(
          'target', 'armor_pierce',
          'value', coalesce(nullif(v_weapon_effect_summary->>'armor_pierce', '')::integer, 0)
        )
      );
    end if;
    if coalesce(nullif(v_weapon_effect_summary->>'aim_difficulty', '')::integer, 0) <> 0 then
      v_runtime_modifiers := v_runtime_modifiers || jsonb_build_array(
        jsonb_build_object(
          'target', 'aim_difficulty',
          'value', coalesce(nullif(v_weapon_effect_summary->>'aim_difficulty', '')::integer, 0)
        )
      );
    end if;
    if coalesce(nullif(v_weapon_effect_summary->>'range', '')::integer, 0) <> 0 then
      v_runtime_modifiers := v_runtime_modifiers || jsonb_build_array(
        jsonb_build_object(
          'target', 'range',
          'value', coalesce(nullif(v_weapon_effect_summary->>'range', '')::integer, 0)
        )
      );
    end if;

    if jsonb_array_length(v_runtime_modifiers) > 0 then
      v_runtime_data := public.odyssey_merge_runtime_data(
        v_existing_runtime_data,
        jsonb_build_object(
          'modifiers', v_runtime_modifiers
        )
      );
      v_payload := v_payload || jsonb_build_object('runtime_data', v_runtime_data);
    end if;

    v_payload := v_payload || jsonb_build_object(
      'character_weapon_id', v_ability.source_character_weapon_id::text,
      'attacker_character_id', v_attacker_character_id::text,
      'character_id', v_attacker_character_id::text
    );
  end if;

  v_result := public.odyssey_perform_ability_attack_legacy(v_payload);
  if found and v_ability.source_character_weapon_id is not null and coalesce((v_result->>'ok')::boolean, false) = true then
    v_result := v_result || jsonb_build_object(
      'weapon_effects', v_weapon_effect_summary
    );
  end if;
  return v_result;
end;
$$;

do $$
declare
  v_function_def text := null;
begin
  select pg_get_functiondef(p.oid)
  into v_function_def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'odyssey_perform_weapon_attack'
    and pg_get_function_identity_arguments(p.oid) = 'p_payload jsonb';

  if v_function_def is null then
    raise exception 'Function public.odyssey_perform_weapon_attack(jsonb) was not found.';
  end if;

  if position('v_weapon_effect_summary jsonb := ''{}''::jsonb;' in v_function_def) = 0 then
    v_function_def := replace(
      v_function_def,
      $old$v_feature_range_modifier integer := 0;
  v_pending_saves jsonb := '[]'::jsonb;$old$,
      $new$v_feature_range_modifier integer := 0;
  v_weapon_effect_summary jsonb := '{}'::jsonb;
  v_weapon_effect_attack_accuracy_modifier integer := 0;
  v_weapon_effect_damage_modifier integer := 0;
  v_weapon_effect_armor_pierce_modifier integer := 0;
  v_weapon_effect_aim_difficulty_modifier integer := 0;
  v_weapon_effect_range_modifier integer := 0;
  v_pending_saves jsonb := '[]'::jsonb;$new$
    );
  end if;

  if position('v_weapon_effect_summary := public.odyssey_get_weapon_effect_summary(' in v_function_def) = 0 then
    v_function_def := replace(
      v_function_def,
      $old$v_target_defense_modifier := coalesce(nullif(jsonb_extract_path_text(v_target_effective_stats, 'derived', 'defense_modifier'), '')::integer, 0);
    v_target_armor_modifier := coalesce(nullif(jsonb_extract_path_text(v_target_effective_stats, 'derived', 'armor_modifier'), '')::integer, 0);$old$,
      $new$v_target_defense_modifier := coalesce(nullif(jsonb_extract_path_text(v_target_effective_stats, 'derived', 'defense_modifier'), '')::integer, 0);
    v_target_armor_modifier := coalesce(nullif(jsonb_extract_path_text(v_target_effective_stats, 'derived', 'armor_modifier'), '')::integer, 0);
    v_weapon_effect_summary := public.odyssey_get_weapon_effect_summary(v_attacker_character_id, v_weapon.id);
    v_weapon_effect_attack_accuracy_modifier := coalesce(nullif(v_weapon_effect_summary->>'attack_accuracy', '')::integer, 0);
    v_weapon_effect_damage_modifier := coalesce(nullif(v_weapon_effect_summary->>'damage', '')::integer, 0);
    v_weapon_effect_armor_pierce_modifier := coalesce(nullif(v_weapon_effect_summary->>'armor_pierce', '')::integer, 0);
    v_weapon_effect_aim_difficulty_modifier := coalesce(nullif(v_weapon_effect_summary->>'aim_difficulty', '')::integer, 0);
    v_weapon_effect_range_modifier := coalesce(nullif(v_weapon_effect_summary->>'range', '')::integer, 0);$new$
    );
  end if;

  v_function_def := replace(
    v_function_def,
    'v_total_weapon_damage := greatest(v_total_weapon_damage + v_attacker_damage_modifier + v_feature_damage_modifier, 0);',
    'v_total_weapon_damage := greatest(v_total_weapon_damage + v_attacker_damage_modifier + v_feature_damage_modifier + v_weapon_effect_damage_modifier, 0);'
  );

  v_function_def := replace(
    v_function_def,
    'v_armor_pierce := greatest(v_armor_pierce + v_feature_armor_pierce_modifier, 0);',
    'v_armor_pierce := greatest(v_armor_pierce + v_feature_armor_pierce_modifier + v_weapon_effect_armor_pierce_modifier, 0);'
  );
  v_function_def := replace(
    v_function_def,
    'v_armor_pierce := coalesce(v_armor_pierce, 0) + v_feature_armor_pierce_modifier;',
    'v_armor_pierce := greatest(coalesce(v_armor_pierce, 0) + v_feature_armor_pierce_modifier + v_weapon_effect_armor_pierce_modifier, 0);'
  );

  v_function_def := replace(
    v_function_def,
    'v_range_modifier := v_range_modifier + v_feature_range_modifier;',
    'v_range_modifier := v_range_modifier + v_feature_range_modifier + v_weapon_effect_range_modifier;'
  );
  v_function_def := replace(
    v_function_def,
    'v_attacker_attack_accuracy_modifier := v_attacker_attack_accuracy_modifier + v_feature_attack_accuracy_modifier;',
    'v_attacker_attack_accuracy_modifier := v_attacker_attack_accuracy_modifier + v_feature_attack_accuracy_modifier + v_weapon_effect_attack_accuracy_modifier;'
  );
  v_function_def := replace(
    v_function_def,
    'v_attacker_aim_difficulty_modifier := v_attacker_aim_difficulty_modifier + v_feature_aim_difficulty_modifier;',
    'v_attacker_aim_difficulty_modifier := v_attacker_aim_difficulty_modifier + v_feature_aim_difficulty_modifier + v_weapon_effect_aim_difficulty_modifier;'
  );

  if position($needle$'feature_usage', v_feature_usage_log,$needle$ in v_function_def) > 0
     and position($needle$'weapon_effects', v_weapon_effect_summary,$needle$ in v_function_def) = 0 then
    v_function_def := replace(
      v_function_def,
      $old$'feature_usage', v_feature_usage_log,$old$,
      $new$'feature_usage', v_feature_usage_log,
    'weapon_effects', v_weapon_effect_summary,$new$
    );
  end if;

  execute v_function_def;
end;
$$;

grant execute on function public.get_character_effect_summary(uuid) to anon, authenticated;
grant execute on function public.odyssey_get_weapon_effect_summary(uuid, uuid) to anon, authenticated;
grant execute on function public.get_effective_character_stats(uuid) to anon, authenticated;
grant execute on function public.odyssey_perform_ability_attack(jsonb) to anon, authenticated;
