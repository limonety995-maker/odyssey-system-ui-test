-- Stage 67: include passive equipped-item effect_data in character effect summary.
-- This makes equipped implants/prosthetics/equipment modifiers participate in:
-- - Character runtime bundle attribute/skill effective values
-- - Skill/attribute checks
-- - Other backend consumers of get_character_effect_summary(...)

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
  v_attack_accuracy integer := 0;
  v_defense integer := 0;
  v_damage integer := 0;
  v_armor integer := 0;
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
  ),
  modifier_resolved as (
    select
      raw.effect_key,
      raw.code,
      raw.category,
      raw.stacking_mode,
      raw.target,
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
    group by target, attribute_code, skill_code
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
            'aggregation', aggregation
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
    coalesce((select sum(resolved_value) from modifier_summary where target = 'attack_accuracy'), 0),
    coalesce((select sum(resolved_value) from modifier_summary where target = 'defense'), 0),
    coalesce((select sum(resolved_value) from modifier_summary where target = 'damage'), 0),
    coalesce((select sum(resolved_value) from modifier_summary where target = 'armor'), 0),
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
    v_attack_accuracy,
    v_defense,
    v_damage,
    v_armor,
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
        'attack_accuracy', v_attack_accuracy,
        'defense', v_defense,
        'damage', v_damage,
        'armor', v_armor,
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
