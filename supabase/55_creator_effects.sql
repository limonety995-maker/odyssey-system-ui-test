alter table public.odyssey_effect_defs
  drop constraint if exists odyssey_effect_defs_category_check;

alter table public.odyssey_effect_defs
  add constraint odyssey_effect_defs_category_check
  check (
    category in (
      'buff',
      'debuff',
      'condition',
      'combat',
      'psionic',
      'equipment',
      'weapon',
      'armor',
      'narrative',
      'custom',
      'recovery',
      'damage',
      'utility'
    )
  );

create or replace function public.odyssey_creator_build_effect_bundle(
  p_effect_def_id uuid
)
returns jsonb
language plpgsql
stable
as $$
declare
  v_effect jsonb := null;
begin
  select jsonb_build_object(
    'id', d.id,
    'code', d.code,
    'name', d.name,
    'category', d.category,
    'description', coalesce(d.description, ''),
    'default_duration_type', d.default_duration_type,
    'default_rounds', d.default_rounds,
    'stacking_mode', d.stacking_mode,
    'is_negative', d.is_negative,
    'is_narrative', d.is_narrative,
    'data', coalesce(d.data, '{}'::jsonb),
    'tags', coalesce(d.tags, '[]'::jsonb),
    'is_custom', d.is_custom,
    'sort_order', d.sort_order,
    'created_at', d.created_at,
    'updated_at', d.updated_at
  )
  into v_effect
  from public.odyssey_effect_defs d
  where d.id = p_effect_def_id;

  if v_effect is null then
    return public.odyssey_creator_error(
      'EFFECT_DEF_NOT_FOUND',
      'Effect definition was not found.',
      jsonb_build_array(jsonb_build_object('field', 'id', 'message', 'Unknown effect definition id.'))
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'effect', v_effect
  );
end;
$$;

create or replace function public.creator_list_effects(
  p_search text default null,
  p_categories jsonb default null
)
returns jsonb
language sql
stable
as $$
  with search_input as (
    select nullif(trim(coalesce(p_search, '')), '') as search_text
  ),
  requested_categories as (
    select lower(trim(value)) as category
    from jsonb_array_elements_text(
      case
        when jsonb_typeof(p_categories) = 'array' then p_categories
        else '[]'::jsonb
      end
    ) value
    where trim(value) <> ''
  ),
  filtered as (
    select
      d.id,
      d.code,
      d.name,
      d.category,
      d.description,
      d.default_duration_type,
      d.default_rounds,
      d.stacking_mode,
      d.is_negative,
      d.is_narrative,
      d.tags,
      d.is_custom,
      d.sort_order,
      d.created_at,
      d.updated_at
    from public.odyssey_effect_defs d
    cross join search_input s
    where (
      s.search_text is null
      or d.code ilike '%' || s.search_text || '%'
      or d.name ilike '%' || s.search_text || '%'
      or coalesce(d.description, '') ilike '%' || s.search_text || '%'
      or exists (
        select 1
        from jsonb_array_elements_text(coalesce(d.tags, '[]'::jsonb)) tag(value)
        where tag.value ilike '%' || s.search_text || '%'
      )
    )
    and (
      not exists (select 1 from requested_categories)
      or lower(d.category) in (select category from requested_categories)
    )
  )
  select jsonb_build_object(
    'ok', true,
    'items',
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'id', f.id,
              'code', f.code,
              'name', f.name,
              'category', f.category,
              'description', coalesce(f.description, ''),
              'default_duration_type', f.default_duration_type,
              'default_rounds', f.default_rounds,
              'stacking_mode', f.stacking_mode,
              'is_negative', f.is_negative,
              'is_narrative', f.is_narrative,
              'tags', coalesce(f.tags, '[]'::jsonb),
              'is_custom', f.is_custom,
              'sort_order', f.sort_order,
              'created_at', f.created_at,
              'updated_at', f.updated_at
            )
            order by f.sort_order, f.name, f.code
          )
          from filtered f
        ),
        '[]'::jsonb
      )
  );
$$;

create or replace function public.creator_get_effect(
  p_effect_def_id uuid
)
returns jsonb
language sql
stable
as $$
  select public.odyssey_creator_build_effect_bundle(p_effect_def_id);
$$;

create or replace function public.creator_upsert_effect(
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
  v_category text := lower(trim(coalesce(v_payload->>'category', 'utility')));
  v_description text := coalesce(v_payload->>'description', '');
  v_default_duration_type text := lower(trim(coalesce(v_payload->>'default_duration_type', 'manual')));
  v_default_rounds integer := nullif(trim(coalesce(v_payload->>'default_rounds', '')), '')::integer;
  v_stacking_mode text := lower(trim(coalesce(v_payload->>'stacking_mode', 'replace')));
  v_is_negative boolean := coalesce(nullif(trim(coalesce(v_payload->>'is_negative', '')), '')::boolean, false);
  v_is_narrative boolean := coalesce(nullif(trim(coalesce(v_payload->>'is_narrative', '')), '')::boolean, false);
  v_data jsonb := public.odyssey_creator_normalize_json_object(v_payload->'data');
  v_tags jsonb := public.odyssey_creator_normalize_text_array(v_payload->'tags');
  v_sort_order integer := coalesce(nullif(trim(coalesce(v_payload->>'sort_order', '')), '')::integer, 0);
  v_effect_payload jsonb := public.odyssey_creator_normalize_json_object(v_data->'payload');
  v_scale jsonb := public.odyssey_creator_normalize_json_object(v_effect_payload->'scale');
  v_effect_type text := lower(trim(coalesce(v_effect_payload->>'type', '')));
  v_target_scope text := lower(trim(coalesce(v_effect_payload->>'target_scope', '')));
  v_tick_phase text := lower(trim(coalesce(v_effect_payload->>'tick_phase', '')));
  v_scale_metric text := lower(trim(coalesce(v_scale->>'metric', '')));
  v_resource_pool_id uuid := nullif(trim(coalesce(v_effect_payload->>'resource_pool_id', '')), '')::uuid;
  v_scale_base integer := coalesce(nullif(trim(coalesce(v_scale->>'base', '')), '')::integer, 0);
  v_scale_per_level integer := coalesce(nullif(trim(coalesce(v_scale->>'per_level', '')), '')::integer, 0);
  v_restore_disabled boolean := coalesce(nullif(trim(coalesce(v_effect_payload->>'restore_disabled', '')), '')::boolean, false);
  v_entity_id uuid := null;
  v_result jsonb := '{}'::jsonb;
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

  if v_category not in (
    'buff',
    'debuff',
    'condition',
    'combat',
    'psionic',
    'equipment',
    'weapon',
    'armor',
    'narrative',
    'custom',
    'recovery',
    'damage',
    'utility'
  ) then
    return public.odyssey_creator_error(
      'VALIDATION_ERROR',
      'category is invalid.',
      jsonb_build_array(jsonb_build_object('field', 'category', 'message', 'Unsupported effect category.'))
    );
  end if;

  if v_default_duration_type not in ('manual', 'rounds', 'until_turn_start', 'until_turn_end', 'scene', 'until_used') then
    return public.odyssey_creator_error(
      'VALIDATION_ERROR',
      'default_duration_type is invalid.',
      jsonb_build_array(jsonb_build_object('field', 'default_duration_type', 'message', 'Unsupported duration type.'))
    );
  end if;

  if v_default_duration_type = 'rounds' and coalesce(v_default_rounds, 0) < 1 then
    return public.odyssey_creator_error(
      'VALIDATION_ERROR',
      'default_rounds must be at least 1 when duration type is rounds.',
      jsonb_build_array(jsonb_build_object('field', 'default_rounds', 'message', 'Use a positive round count.'))
    );
  end if;

  if v_stacking_mode not in ('replace', 'stack', 'highest', 'lowest', 'unique') then
    return public.odyssey_creator_error(
      'VALIDATION_ERROR',
      'stacking_mode is invalid.',
      jsonb_build_array(jsonb_build_object('field', 'stacking_mode', 'message', 'Unsupported stacking mode.'))
    );
  end if;

  if v_effect_type <> '' and v_effect_type not in (
    'modifiers_flags',
    'periodic_damage',
    'periodic_heal',
    'body_part_heal',
    'armor_repair',
    'resource_restore',
    'custom'
  ) then
    return public.odyssey_creator_error(
      'VALIDATION_ERROR',
      'effect payload type is invalid.',
      jsonb_build_array(jsonb_build_object('field', 'data.payload.type', 'message', 'Unsupported effect payload type.'))
    );
  end if;

  if v_target_scope <> '' and v_target_scope not in ('character', 'selected_body_part', 'selected_armor_item') then
    return public.odyssey_creator_error(
      'VALIDATION_ERROR',
      'target_scope is invalid.',
      jsonb_build_array(jsonb_build_object('field', 'data.payload.target_scope', 'message', 'Unsupported target scope.'))
    );
  end if;

  if v_tick_phase <> '' and v_tick_phase not in ('turn_start', 'turn_end') then
    return public.odyssey_creator_error(
      'VALIDATION_ERROR',
      'tick_phase is invalid.',
      jsonb_build_array(jsonb_build_object('field', 'data.payload.tick_phase', 'message', 'Unsupported tick phase.'))
    );
  end if;

  if v_scale_metric <> '' and v_scale_metric not in ('points', 'hp', 'minor', 'serious', 'critical') then
    return public.odyssey_creator_error(
      'VALIDATION_ERROR',
      'scale.metric is invalid.',
      jsonb_build_array(jsonb_build_object('field', 'data.payload.scale.metric', 'message', 'Unsupported scale metric.'))
    );
  end if;

  if v_resource_pool_id is not null and not exists (
    select 1
    from public.odyssey_resource_pool_defs pool
    where pool.id = v_resource_pool_id
  ) then
    return public.odyssey_creator_error(
      'VALIDATION_ERROR',
      'resource_pool_id references an unknown resource pool.',
      jsonb_build_array(jsonb_build_object('field', 'data.payload.resource_pool_id', 'message', 'Unknown resource pool id.'))
    );
  end if;

  if v_id is not null then
    select d.id
    into v_entity_id
    from public.odyssey_effect_defs d
    where d.id = v_id;

    if v_entity_id is null then
      return public.odyssey_creator_error(
        'EFFECT_DEF_NOT_FOUND',
        'Effect definition was not found for update.',
        jsonb_build_array(jsonb_build_object('field', 'id', 'message', 'Unknown effect definition id.'))
      );
    end if;
  else
    select d.id
    into v_entity_id
    from public.odyssey_effect_defs d
    where d.code = v_code
    limit 1;
  end if;

  if exists (
    select 1
    from public.odyssey_effect_defs d
    where d.code = v_code
      and d.id <> coalesce(v_entity_id, '00000000-0000-0000-0000-000000000000'::uuid)
  ) then
    return public.odyssey_creator_error(
      'VALIDATION_ERROR',
      'Effect code must be unique.',
      jsonb_build_array(jsonb_build_object('field', 'code', 'message', 'Duplicate effect code.'))
    );
  end if;

  if v_effect_type = '' or v_effect_type = 'modifiers_flags' then
    v_data := v_data - 'payload';
  else
    v_effect_payload := (v_effect_payload - 'type' - 'target_scope' - 'scale' - 'tick_phase' - 'resource_pool_id' - 'restore_disabled')
      || jsonb_build_object(
        'type', v_effect_type,
        'target_scope', case when v_target_scope <> '' then v_target_scope else 'character' end
      );

    if v_effect_type in ('periodic_damage', 'periodic_heal', 'body_part_heal', 'armor_repair', 'resource_restore') then
      v_effect_payload := v_effect_payload || jsonb_build_object(
        'scale',
        jsonb_build_object(
          'base', v_scale_base,
          'per_level', v_scale_per_level,
          'metric',
            case
              when v_scale_metric <> '' then v_scale_metric
              when v_effect_type = 'resource_restore' then 'points'
              when v_effect_type in ('periodic_heal', 'body_part_heal') then 'hp'
              when v_effect_type = 'armor_repair' then 'critical'
              else 'minor'
            end
        )
      );
    end if;

    if v_effect_type in ('periodic_damage', 'periodic_heal') then
      v_effect_payload := v_effect_payload || jsonb_build_object(
        'tick_phase',
        case when v_tick_phase <> '' then v_tick_phase else 'turn_end' end
      );
    end if;

    if v_effect_type = 'resource_restore' then
      v_effect_payload := v_effect_payload || jsonb_build_object('resource_pool_id', v_resource_pool_id);
    end if;

    if v_effect_type = 'body_part_heal' then
      v_effect_payload := v_effect_payload || jsonb_build_object('restore_disabled', v_restore_disabled);
    end if;

    v_data := jsonb_set(v_data, '{payload}', v_effect_payload, true);
  end if;

  if v_entity_id is null then
    insert into public.odyssey_effect_defs (
      code,
      name,
      category,
      description,
      default_duration_type,
      default_rounds,
      stacking_mode,
      is_negative,
      is_narrative,
      data,
      tags,
      is_custom,
      sort_order
    )
    values (
      v_code,
      v_name,
      v_category,
      nullif(v_description, ''),
      v_default_duration_type,
      case when v_default_duration_type = 'rounds' then v_default_rounds else null end,
      v_stacking_mode,
      v_is_negative,
      v_is_narrative,
      v_data,
      v_tags,
      true,
      v_sort_order
    )
    returning id into v_entity_id;
  else
    update public.odyssey_effect_defs
    set
      code = v_code,
      name = v_name,
      category = v_category,
      description = nullif(v_description, ''),
      default_duration_type = v_default_duration_type,
      default_rounds = case when v_default_duration_type = 'rounds' then v_default_rounds else null end,
      stacking_mode = v_stacking_mode,
      is_negative = v_is_negative,
      is_narrative = v_is_narrative,
      data = v_data,
      tags = v_tags,
      sort_order = v_sort_order
    where id = v_entity_id;
  end if;

  v_result := public.creator_get_effect(v_entity_id);

  return jsonb_build_object(
    'ok', true,
    'entity_id', v_entity_id,
    'entity', v_result,
    'warnings', '[]'::jsonb
  );
end;
$$;

create or replace function public.creator_delete_effect(
  p_effect_def_id uuid
)
returns jsonb
language plpgsql
as $$
declare
  v_id uuid := p_effect_def_id;
begin
  if v_id is null then
    return public.odyssey_creator_error(
      'EFFECT_DEF_NOT_FOUND',
      'Effect definition id is required.',
      jsonb_build_array(jsonb_build_object('field', 'id', 'message', 'Provide a valid effect definition id.'))
    );
  end if;

  if not exists (
    select 1
    from public.odyssey_effect_defs d
    where d.id = v_id
  ) then
    return public.odyssey_creator_error(
      'EFFECT_DEF_NOT_FOUND',
      'Effect definition was not found for deletion.',
      jsonb_build_array(jsonb_build_object('field', 'id', 'message', 'Unknown effect definition id.'))
    );
  end if;

  delete from public.odyssey_effect_defs d
  where d.id = v_id;

  return jsonb_build_object(
    'ok', true,
    'deleted_id', v_id
  );
end;
$$;

grant execute on function public.odyssey_creator_build_effect_bundle(uuid) to anon, authenticated;
grant execute on function public.creator_list_effects(text, jsonb) to anon, authenticated;
grant execute on function public.creator_get_effect(uuid) to anon, authenticated;
grant execute on function public.creator_upsert_effect(jsonb) to anon, authenticated;
grant execute on function public.creator_delete_effect(uuid) to anon, authenticated;
