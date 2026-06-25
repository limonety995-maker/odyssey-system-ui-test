create or replace function public.odyssey_bump_character_state_version(
  p_character_id uuid
)
returns integer
language plpgsql
as $$
declare
  v_character_version integer := 0;
  v_combat_state_version integer := 0;
  v_next_version integer := 0;
begin
  select coalesce(c.active_combat_state_version, 0)
  into v_character_version
  from public.odyssey_characters c
  where c.id = p_character_id
    and coalesce(c.is_deleted, false) = false
  for update of c;

  if not found then
    return 0;
  end if;

  select coalesce(s.state_version, 0)
  into v_combat_state_version
  from public.odyssey_character_combat_state s
  where s.character_id = p_character_id
  for update of s;

  v_next_version := greatest(
    coalesce(v_character_version, 0),
    coalesce(v_combat_state_version, 0),
    0
  ) + 1;

  update public.odyssey_characters
  set
    active_combat_state_version = v_next_version,
    updated_at = timezone('utc', now())
  where id = p_character_id;

  update public.odyssey_character_combat_state
  set
    state_version = v_next_version,
    updated_at = timezone('utc', now())
  where character_id = p_character_id;

  return v_next_version;
end;
$$;

create or replace function public.odyssey_get_effective_character_skill_states(
  p_character_id uuid
)
returns table (
  character_skill_id uuid,
  skill_def_id uuid,
  skill_code text,
  skill_name text,
  skill_category text,
  description text,
  skill_tags jsonb,
  sort_order integer,
  max_level integer,
  is_passive boolean,
  is_trained boolean,
  purchased_level integer,
  base_effective_level integer,
  effect_level_modifier integer,
  effect_skill_bonus integer,
  effective_level integer,
  skill_bonus integer,
  highest_available_level integer,
  current_level_requirements_met boolean,
  next_available_level integer,
  governing_attribute_def_id uuid,
  main_attribute_def_id uuid,
  main_attribute_code text,
  main_attribute_name text,
  main_base_value integer,
  main_effect_modifier integer,
  main_effective_value integer,
  secondary_attribute_def_id uuid,
  secondary_attribute_code text,
  secondary_attribute_name text,
  secondary_base_value integer,
  secondary_effect_modifier integer,
  secondary_effective_value integer,
  custom_name text,
  notes text
)
language sql
stable
as $$
  with selected_character as (
    select c.id
    from public.odyssey_characters c
    where c.id = p_character_id
      and coalesce(c.is_deleted, false) = false
  ),
  effect_summary as (
    select public.get_character_effect_summary(p_character_id) as effect_summary
    from selected_character
  ),
  skill_rows as (
    select
      s.id as character_skill_id,
      d.id as skill_def_id,
      d.code as skill_code,
      d.name as skill_name,
      d.category as skill_category,
      d.description,
      d.tags as skill_tags,
      d.sort_order,
      d.max_level,
      (d.category = 'passive' or d.max_level = 1) as is_passive,
      (s.id is not null) as is_trained,
      coalesce(s.level, 0) as purchased_level,
      s.governing_attribute_def_id,
      d.main_attribute_id as configured_main_attribute_def_id,
      d.secondary_attribute_id as configured_secondary_attribute_def_id,
      s.custom_name,
      s.notes
    from selected_character c
    cross join public.odyssey_skill_defs d
    left join public.odyssey_character_skills s
      on s.character_id = c.id
     and s.skill_def_id = d.id
  ),
  resolved_rows as (
    select
      skill_rows.*,
      case
        when skill_rows.governing_attribute_def_id is not null
          and skill_rows.configured_secondary_attribute_def_id is not null
          and skill_rows.governing_attribute_def_id in (
            skill_rows.configured_main_attribute_def_id,
            skill_rows.configured_secondary_attribute_def_id
          )
          then skill_rows.governing_attribute_def_id
        else skill_rows.configured_main_attribute_def_id
      end as resolved_main_attribute_def_id,
      case
        when skill_rows.governing_attribute_def_id is not null
          and skill_rows.configured_secondary_attribute_def_id is not null
          and skill_rows.governing_attribute_def_id in (
            skill_rows.configured_main_attribute_def_id,
            skill_rows.configured_secondary_attribute_def_id
          )
          then case
            when skill_rows.governing_attribute_def_id = skill_rows.configured_main_attribute_def_id
              then skill_rows.configured_secondary_attribute_def_id
            else skill_rows.configured_main_attribute_def_id
          end
        else skill_rows.configured_secondary_attribute_def_id
      end as resolved_secondary_attribute_def_id
    from skill_rows
  ),
  attribute_rows as (
    select
      resolved_rows.*,
      main_attr.code as main_attribute_code,
      main_attr.name as main_attribute_name,
      coalesce(main_value.value, main_attr.default_value, 0) as main_base_value,
      case
        when main_attr.code is null then 0
        else coalesce(
          nullif(jsonb_extract_path_text(effect_summary.effect_summary, 'modifiers', 'attributes', main_attr.code), '')::integer,
          0
        )
      end as main_effect_modifier,
      coalesce(main_value.value, main_attr.default_value, 0)
        + case
            when main_attr.code is null then 0
            else coalesce(
              nullif(jsonb_extract_path_text(effect_summary.effect_summary, 'modifiers', 'attributes', main_attr.code), '')::integer,
              0
            )
          end as main_effective_value,
      secondary_attr.code as secondary_attribute_code,
      secondary_attr.name as secondary_attribute_name,
      coalesce(secondary_value.value, secondary_attr.default_value, 0) as secondary_base_value,
      case
        when secondary_attr.code is null then 0
        else coalesce(
          nullif(jsonb_extract_path_text(effect_summary.effect_summary, 'modifiers', 'attributes', secondary_attr.code), '')::integer,
          0
        )
      end as secondary_effect_modifier,
      coalesce(secondary_value.value, secondary_attr.default_value, 0)
        + case
            when secondary_attr.code is null then 0
            else coalesce(
              nullif(jsonb_extract_path_text(effect_summary.effect_summary, 'modifiers', 'attributes', secondary_attr.code), '')::integer,
              0
            )
          end as secondary_effective_value,
      coalesce(
        nullif(jsonb_extract_path_text(effect_summary.effect_summary, 'modifiers', 'skills', resolved_rows.skill_code), '')::integer,
        0
      ) as effect_level_modifier
    from resolved_rows
    cross join effect_summary
    left join public.odyssey_attribute_defs main_attr on main_attr.id = resolved_rows.resolved_main_attribute_def_id
    left join public.odyssey_character_attributes main_value
      on main_value.character_id = p_character_id
     and main_value.attribute_def_id = main_attr.id
    left join public.odyssey_attribute_defs secondary_attr on secondary_attr.id = resolved_rows.resolved_secondary_attribute_def_id
    left join public.odyssey_character_attributes secondary_value
      on secondary_value.character_id = p_character_id
     and secondary_value.attribute_def_id = secondary_attr.id
  ),
  availability as (
    select
      attribute_rows.*,
      case
        when attribute_rows.is_passive then attribute_rows.purchased_level
        else coalesce(
          (
            select max(req.level)
            from public.odyssey_skill_level_requirements req
            where req.skill_def_id = attribute_rows.skill_def_id
              and (
                req.main_attribute_required is null
                or coalesce(attribute_rows.main_effective_value, 0) >= req.main_attribute_required
              )
              and (
                req.secondary_attribute_required is null
                or coalesce(attribute_rows.secondary_effective_value, 0) >= req.secondary_attribute_required
              )
          ),
          0
        )
      end as highest_available_level,
      case
        when attribute_rows.purchased_level <= 0 then true
        when attribute_rows.is_passive then true
        else coalesce(
          (
            select
              (
                (req.main_attribute_required is null or coalesce(attribute_rows.main_effective_value, 0) >= req.main_attribute_required)
                and (req.secondary_attribute_required is null or coalesce(attribute_rows.secondary_effective_value, 0) >= req.secondary_attribute_required)
              )
            from public.odyssey_skill_level_requirements req
            where req.skill_def_id = attribute_rows.skill_def_id
              and req.level = attribute_rows.purchased_level
            limit 1
          ),
          false
        )
      end as current_level_requirements_met,
      (
        select min(req.level)
        from public.odyssey_skill_level_requirements req
        where req.skill_def_id = attribute_rows.skill_def_id
          and req.level > case
            when attribute_rows.is_passive then attribute_rows.purchased_level
            else coalesce(
              (
                select max(req2.level)
                from public.odyssey_skill_level_requirements req2
                where req2.skill_def_id = attribute_rows.skill_def_id
                  and (
                    req2.main_attribute_required is null
                    or coalesce(attribute_rows.main_effective_value, 0) >= req2.main_attribute_required
                  )
                  and (
                    req2.secondary_attribute_required is null
                    or coalesce(attribute_rows.secondary_effective_value, 0) >= req2.secondary_attribute_required
                  )
              ),
              0
            )
          end
      ) as next_available_level
    from attribute_rows
  ),
  final_rows as (
    select
      availability.character_skill_id,
      availability.skill_def_id,
      availability.skill_code,
      availability.skill_name,
      availability.skill_category,
      availability.description,
      availability.skill_tags,
      availability.sort_order,
      availability.max_level,
      availability.is_passive,
      availability.is_trained,
      availability.purchased_level,
      case
        when availability.is_passive then availability.purchased_level
        else least(availability.purchased_level, greatest(availability.highest_available_level, 0))
      end as base_effective_level,
      case
        when availability.is_passive then 0
        else availability.effect_level_modifier
      end as effect_level_modifier,
      0 as effect_skill_bonus,
      case
        when availability.is_passive then availability.purchased_level
        else least(
          greatest(
            least(availability.purchased_level, greatest(availability.highest_available_level, 0))
            + availability.effect_level_modifier,
            0
          ),
          case
            when availability.max_level >= 5 then 10
            when availability.max_level = 3 then 5
            else availability.max_level
          end
        )
      end as effective_level,
      availability.highest_available_level,
      availability.current_level_requirements_met,
      availability.next_available_level,
      availability.governing_attribute_def_id,
      availability.resolved_main_attribute_def_id as main_attribute_def_id,
      availability.main_attribute_code,
      availability.main_attribute_name,
      availability.main_base_value,
      availability.main_effect_modifier,
      availability.main_effective_value,
      availability.resolved_secondary_attribute_def_id as secondary_attribute_def_id,
      availability.secondary_attribute_code,
      availability.secondary_attribute_name,
      availability.secondary_base_value,
      availability.secondary_effect_modifier,
      availability.secondary_effective_value,
      availability.custom_name,
      availability.notes
    from availability
  )
  select
    final_rows.character_skill_id,
    final_rows.skill_def_id,
    final_rows.skill_code,
    final_rows.skill_name,
    final_rows.skill_category,
    final_rows.description,
    final_rows.skill_tags,
    final_rows.sort_order,
    final_rows.max_level,
    final_rows.is_passive,
    final_rows.is_trained,
    final_rows.purchased_level,
    final_rows.base_effective_level,
    final_rows.effect_level_modifier,
    final_rows.effect_skill_bonus,
    final_rows.effective_level,
    case
      when final_rows.is_passive then 0
      else final_rows.effective_level * 10
    end as skill_bonus,
    final_rows.highest_available_level,
    final_rows.current_level_requirements_met,
    final_rows.next_available_level,
    final_rows.governing_attribute_def_id,
    final_rows.main_attribute_def_id,
    final_rows.main_attribute_code,
    final_rows.main_attribute_name,
    final_rows.main_base_value,
    final_rows.main_effect_modifier,
    final_rows.main_effective_value,
    final_rows.secondary_attribute_def_id,
    final_rows.secondary_attribute_code,
    final_rows.secondary_attribute_name,
    final_rows.secondary_base_value,
    final_rows.secondary_effect_modifier,
    final_rows.secondary_effective_value,
    final_rows.custom_name,
    final_rows.notes
  from final_rows
  order by final_rows.skill_category, final_rows.sort_order, final_rows.skill_name;
$$;

create or replace function public.get_effective_character_skill_state(
  p_character_id uuid,
  p_skill_def_id uuid
)
returns jsonb
language plpgsql
stable
as $$
declare
  v_character_exists boolean := false;
  v_skill_exists boolean := false;
  v_skill_state record;
  v_next_requirement record;
begin
  select exists(
    select 1
    from public.odyssey_characters c
    where c.id = p_character_id
      and coalesce(c.is_deleted, false) = false
  )
  into v_character_exists;

  if not v_character_exists then
    return jsonb_build_object(
      'ok', false,
      'error', 'CHARACTER_NOT_FOUND',
      'message', 'Character not found.'
    );
  end if;

  select exists(
    select 1
    from public.odyssey_skill_defs d
    where d.id = p_skill_def_id
  )
  into v_skill_exists;

  if not v_skill_exists then
    return jsonb_build_object(
      'ok', false,
      'error', 'SKILL_NOT_FOUND',
      'message', 'Skill definition not found.'
    );
  end if;

  select *
  into v_skill_state
  from public.odyssey_get_effective_character_skill_states(p_character_id)
  where skill_def_id = p_skill_def_id
  limit 1;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'error', 'SKILL_NOT_FOUND',
      'message', 'Skill definition not found.'
    );
  end if;

  if v_skill_state.next_available_level is not null then
    select *
    into v_next_requirement
    from public.odyssey_skill_level_requirements req
    where req.skill_def_id = p_skill_def_id
      and req.level = v_skill_state.next_available_level
    limit 1;
  end if;

  return jsonb_build_object(
    'ok', true,
    'character_id', p_character_id,
    'skill',
      jsonb_build_object(
        'id', v_skill_state.skill_def_id,
        'character_skill_id', v_skill_state.character_skill_id,
        'code', v_skill_state.skill_code,
        'name', v_skill_state.skill_name,
        'max_level', v_skill_state.max_level,
        'category', v_skill_state.skill_category,
        'is_passive', v_skill_state.is_passive,
        'purchased_level', v_skill_state.purchased_level,
        'base_effective_level', v_skill_state.base_effective_level,
        'effect_level_modifier', v_skill_state.effect_level_modifier,
        'effective_level', v_skill_state.effective_level,
        'is_trained', v_skill_state.is_trained,
        'skill_bonus', v_skill_state.skill_bonus,
        'effect_skill_bonus', v_skill_state.effect_skill_bonus
      ),
    'attributes',
      jsonb_build_object(
        'main',
          case
            when v_skill_state.main_attribute_def_id is null then 'null'::jsonb
            else jsonb_build_object(
              'id', v_skill_state.main_attribute_def_id,
              'code', v_skill_state.main_attribute_code,
              'name', v_skill_state.main_attribute_name,
              'base_value', v_skill_state.main_base_value,
              'effect_modifier', v_skill_state.main_effect_modifier,
              'effective_value', v_skill_state.main_effective_value
            )
          end,
        'secondary',
          case
            when v_skill_state.secondary_attribute_def_id is null then 'null'::jsonb
            else jsonb_build_object(
              'id', v_skill_state.secondary_attribute_def_id,
              'code', v_skill_state.secondary_attribute_code,
              'name', v_skill_state.secondary_attribute_name,
              'base_value', v_skill_state.secondary_base_value,
              'effect_modifier', v_skill_state.secondary_effect_modifier,
              'effective_value', v_skill_state.secondary_effective_value
            )
          end
      ),
    'requirements',
      jsonb_build_object(
        'highest_available_level', v_skill_state.highest_available_level,
        'current_level_requirements_met', v_skill_state.current_level_requirements_met,
        'next_requirement',
          case
            when v_next_requirement.level is null then 'null'::jsonb
            else jsonb_build_object(
              'level', v_next_requirement.level,
              'main_attribute_required', v_next_requirement.main_attribute_required,
              'secondary_attribute_required', v_next_requirement.secondary_attribute_required,
              'development_point_cost', v_next_requirement.development_point_cost,
              'advancement_mode', v_next_requirement.advancement_mode
            )
          end
      )
  );
end;
$$;

create or replace function public.get_character_progression(
  p_character_id uuid
)
returns jsonb
language plpgsql
stable
as $$
declare
  v_character_exists boolean := false;
  v_progression record;
  v_recent_transactions jsonb := '[]'::jsonb;
begin
  select exists(
    select 1
    from public.odyssey_characters c
    where c.id = p_character_id
      and coalesce(c.is_deleted, false) = false
  )
  into v_character_exists;

  if not v_character_exists then
    return jsonb_build_object(
      'ok', false,
      'error', 'CHARACTER_NOT_FOUND',
      'message', 'Character not found.'
    );
  end if;

  select *
  into v_progression
  from public.odyssey_character_progression p
  where p.character_id = p_character_id;

  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', ledger.id,
          'transaction_type', ledger.transaction_type,
          'amount', ledger.amount,
          'balance_after', ledger.balance_after,
          'reason', ledger.reason,
          'source_type', ledger.source_type,
          'source_id', ledger.source_id,
          'data', ledger.data,
          'created_at', ledger.created_at
        )
        order by ledger.created_at desc, ledger.id desc
      ),
      '[]'::jsonb
    )
  into v_recent_transactions
  from (
    select *
    from public.odyssey_character_progression_ledger ledger
    where ledger.character_id = p_character_id
    order by ledger.created_at desc, ledger.id desc
    limit 25
  ) ledger;

  return jsonb_build_object(
    'ok', true,
    'character_id', p_character_id,
    'development_points', coalesce(v_progression.development_points, 0),
    'lifetime_points_granted', coalesce(v_progression.lifetime_points_granted, 0),
    'lifetime_points_spent', coalesce(v_progression.lifetime_points_spent, 0),
    'recent_transactions', v_recent_transactions
  );
end;
$$;

create or replace function public.gm_grant_development_points(
  p_payload jsonb
)
returns jsonb
language plpgsql
as $$
declare
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_character_id uuid := nullif(trim(coalesce(v_payload->>'character_id', '')), '')::uuid;
  v_amount integer := coalesce(nullif(trim(coalesce(v_payload->>'amount', '')), '')::integer, 0);
  v_reason text := nullif(trim(coalesce(v_payload->>'reason', '')), '');
  v_actor text := coalesce(nullif(trim(coalesce(v_payload->>'actor', '')), ''), 'gm');
  v_character_exists boolean := false;
  v_balance_before integer := 0;
  v_balance_after integer := 0;
  v_state_version integer := 0;
begin
  if jsonb_typeof(v_payload) <> 'object' then
    return jsonb_build_object(
      'ok', false,
      'error', 'INVALID_PAYLOAD',
      'message', 'Payload must be a JSON object.'
    );
  end if;

  if v_character_id is null then
    return jsonb_build_object(
      'ok', false,
      'error', 'INVALID_PAYLOAD',
      'message', 'character_id is required and must be a valid UUID.'
    );
  end if;

  if v_amount <= 0 then
    return jsonb_build_object(
      'ok', false,
      'error', 'INVALID_PAYLOAD',
      'message', 'amount must be a positive integer.'
    );
  end if;

  select exists(
    select 1
    from public.odyssey_characters c
    where c.id = v_character_id
      and coalesce(c.is_deleted, false) = false
  )
  into v_character_exists;

  if not v_character_exists then
    return jsonb_build_object(
      'ok', false,
      'error', 'CHARACTER_NOT_FOUND',
      'message', 'Character not found.'
    );
  end if;

  insert into public.odyssey_character_progression (character_id)
  values (v_character_id)
  on conflict (character_id) do nothing;

  select development_points
  into v_balance_before
  from public.odyssey_character_progression
  where character_id = v_character_id
  for update;

  v_balance_after := v_balance_before + v_amount;

  update public.odyssey_character_progression
  set
    development_points = v_balance_after,
    lifetime_points_granted = lifetime_points_granted + v_amount
  where character_id = v_character_id;

  insert into public.odyssey_character_progression_ledger (
    character_id,
    transaction_type,
    amount,
    balance_after,
    reason,
    source_type,
    source_id,
    data
  )
  values (
    v_character_id,
    'grant',
    v_amount,
    v_balance_after,
    v_reason,
    'gm',
    null,
    jsonb_build_object(
      'actor', v_actor,
      'action', 'gm_grant_development_points',
      'granted', v_amount
    )
  );

  v_state_version := public.odyssey_bump_character_state_version(v_character_id);

  return jsonb_build_object(
    'ok', true,
    'action', 'gm_grant_development_points',
    'character_id', v_character_id,
    'granted', v_amount,
    'balance_before', v_balance_before,
    'balance_after', v_balance_after,
    'state_version', v_state_version
  );
end;
$$;

create or replace function public.purchase_character_attribute_level(
  p_payload jsonb
)
returns jsonb
language plpgsql
as $$
declare
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_character_id uuid := nullif(trim(coalesce(v_payload->>'character_id', '')), '')::uuid;
  v_attribute_code text := lower(trim(coalesce(v_payload->>'attribute_code', '')));
  v_reason text := nullif(trim(coalesce(v_payload->>'reason', '')), '');
  v_character_exists boolean := false;
  v_attribute_row record;
  v_balance_before integer := 0;
  v_balance_after integer := 0;
  v_cost integer := 0;
  v_previous_value integer := 0;
  v_new_value integer := 0;
  v_state_version integer := 0;
begin
  if jsonb_typeof(v_payload) <> 'object' then
    return jsonb_build_object(
      'ok', false,
      'error', 'INVALID_PAYLOAD',
      'message', 'Payload must be a JSON object.'
    );
  end if;

  if v_character_id is null or v_attribute_code = '' then
    return jsonb_build_object(
      'ok', false,
      'error', 'INVALID_PAYLOAD',
      'message', 'character_id and attribute_code are required.'
    );
  end if;

  select exists(
    select 1
    from public.odyssey_characters c
    where c.id = v_character_id
      and coalesce(c.is_deleted, false) = false
  )
  into v_character_exists;

  if not v_character_exists then
    return jsonb_build_object(
      'ok', false,
      'error', 'CHARACTER_NOT_FOUND',
      'message', 'Character not found.'
    );
  end if;

  select
    d.id as attribute_def_id,
    d.code,
    d.name,
    d.max_value,
    d.cost_per_level,
    a.id as character_attribute_id,
    a.value
  into v_attribute_row
  from public.odyssey_attribute_defs d
  left join public.odyssey_character_attributes a
    on a.attribute_def_id = d.id
   and a.character_id = v_character_id
  where d.code = v_attribute_code
  for update of a;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'error', 'ATTRIBUTE_NOT_FOUND',
      'message', 'Attribute code not found.'
    );
  end if;

  if v_attribute_row.character_attribute_id is null then
    return jsonb_build_object(
      'ok', false,
      'error', 'ATTRIBUTE_NOT_ASSIGNED',
      'message', 'The character does not have this attribute assigned.'
    );
  end if;

  v_previous_value := coalesce(v_attribute_row.value, 0);
  v_new_value := v_previous_value + 1;
  v_cost := coalesce(v_attribute_row.cost_per_level, 0);

  if v_new_value > coalesce(v_attribute_row.max_value, 0) then
    return jsonb_build_object(
      'ok', false,
      'error', 'ATTRIBUTE_VALUE_OUT_OF_RANGE',
      'message', 'Attribute value would exceed the allowed maximum.',
      'details', jsonb_build_object(
        'attribute_code', v_attribute_row.code,
        'current', v_previous_value,
        'attempted', v_new_value,
        'maximum', v_attribute_row.max_value
      )
    );
  end if;

  insert into public.odyssey_character_progression (character_id)
  values (v_character_id)
  on conflict (character_id) do nothing;

  select development_points
  into v_balance_before
  from public.odyssey_character_progression
  where character_id = v_character_id
  for update;

  if v_balance_before < v_cost then
    return jsonb_build_object(
      'ok', false,
      'error', 'NOT_ENOUGH_DEVELOPMENT_POINTS',
      'message', 'Not enough Development Points.',
      'details', jsonb_build_object(
        'required', v_cost,
        'available', v_balance_before
      )
    );
  end if;

  update public.odyssey_character_attributes
  set
    value = v_new_value,
    updated_at = timezone('utc', now())
  where id = v_attribute_row.character_attribute_id;

  if v_attribute_row.code = 'endurance' then
    perform public.odyssey_recalculate_character_body_part_caps(v_character_id);
  end if;

  perform public.odyssey_sync_character_resource_pools(v_character_id);

  v_balance_after := v_balance_before - v_cost;

  update public.odyssey_character_progression
  set
    development_points = v_balance_after,
    lifetime_points_spent = lifetime_points_spent + v_cost
  where character_id = v_character_id;

  insert into public.odyssey_character_progression_ledger (
    character_id,
    transaction_type,
    amount,
    balance_after,
    reason,
    source_type,
    source_id,
    data
  )
  values (
    v_character_id,
    'spend_attribute',
    -v_cost,
    v_balance_after,
    v_reason,
    'attribute',
    v_attribute_row.attribute_def_id,
    jsonb_build_object(
      'attribute_code', v_attribute_row.code,
      'previous_value', v_previous_value,
      'new_value', v_new_value,
      'cost', v_cost
    )
  );

  v_state_version := public.odyssey_bump_character_state_version(v_character_id);

  return jsonb_build_object(
    'ok', true,
    'action', 'purchase_character_attribute_level',
    'character_id', v_character_id,
    'attribute',
      jsonb_build_object(
        'code', v_attribute_row.code,
        'name', v_attribute_row.name,
        'previous_value', v_previous_value,
        'new_value', v_new_value,
        'cost', v_cost
      ),
    'development_points',
      jsonb_build_object(
        'before', v_balance_before,
        'after', v_balance_after
      ),
    'state_version', v_state_version
  );
end;
$$;

create or replace function public.purchase_character_skill_level(
  p_payload jsonb
)
returns jsonb
language plpgsql
as $$
declare
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_character_id uuid := nullif(trim(coalesce(v_payload->>'character_id', '')), '')::uuid;
  v_skill_code text := lower(trim(coalesce(v_payload->>'skill_code', '')));
  v_reason text := nullif(trim(coalesce(v_payload->>'reason', '')), '');
  v_character_exists boolean := false;
  v_skill_row record;
  v_skill_state record;
  v_requirement record;
  v_character_skill record;
  v_balance_before integer := 0;
  v_balance_after integer := 0;
  v_cost integer := 0;
  v_previous_level integer := 0;
  v_target_level integer := 0;
  v_state_version integer := 0;
  v_default_governing_attribute_def_id uuid := null;
begin
  if jsonb_typeof(v_payload) <> 'object' then
    return jsonb_build_object(
      'ok', false,
      'error', 'INVALID_PAYLOAD',
      'message', 'Payload must be a JSON object.'
    );
  end if;

  if v_character_id is null or v_skill_code = '' then
    return jsonb_build_object(
      'ok', false,
      'error', 'INVALID_PAYLOAD',
      'message', 'character_id and skill_code are required.'
    );
  end if;

  select exists(
    select 1
    from public.odyssey_characters c
    where c.id = v_character_id
      and coalesce(c.is_deleted, false) = false
  )
  into v_character_exists;

  if not v_character_exists then
    return jsonb_build_object(
      'ok', false,
      'error', 'CHARACTER_NOT_FOUND',
      'message', 'Character not found.'
    );
  end if;

  select
    d.id as skill_def_id,
    d.code,
    d.name,
    d.category,
    d.max_level,
    d.main_attribute_id,
    d.secondary_attribute_id,
    d.tags
  into v_skill_row
  from public.odyssey_skill_defs d
  where d.code = v_skill_code;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'error', 'SKILL_NOT_FOUND',
      'message', 'Skill code not found.'
    );
  end if;

  select *
  into v_character_skill
  from public.odyssey_character_skills s
  where s.character_id = v_character_id
    and s.skill_def_id = v_skill_row.skill_def_id
  for update of s;

  select *
  into v_skill_state
  from public.odyssey_get_effective_character_skill_states(v_character_id)
  where skill_def_id = v_skill_row.skill_def_id
  limit 1;

  v_previous_level := coalesce(v_skill_state.purchased_level, 0);
  v_target_level := v_previous_level + 1;

  if v_previous_level >= coalesce(v_skill_row.max_level, 0) then
    return jsonb_build_object(
      'ok', false,
      'error', 'SKILL_ALREADY_MAX_LEVEL',
      'message', 'Skill is already at its maximum purchased level.'
    );
  end if;

  select *
  into v_requirement
  from public.odyssey_skill_level_requirements req
  where req.skill_def_id = v_skill_row.skill_def_id
    and req.level = v_target_level
  limit 1;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'error', 'SKILL_REQUIREMENT_CONFIGURATION_MISSING',
      'message', 'Skill requirement configuration is missing for the requested target level.'
    );
  end if;

  if coalesce(v_requirement.advancement_mode, 'development_points') = 'gm_only' then
    return jsonb_build_object(
      'ok', false,
      'error', 'GM_ONLY_LEVEL',
      'message', 'This skill level can only be granted manually by the GM.'
    );
  end if;

  v_cost := v_requirement.development_point_cost;
  if v_cost is null or v_cost < 0 then
    return jsonb_build_object(
      'ok', false,
      'error', 'SKILL_REQUIREMENT_CONFIGURATION_MISSING',
      'message', 'Skill cost configuration is missing for the requested target level.'
    );
  end if;

  if not coalesce(v_skill_state.is_passive, false) then
    if v_requirement.main_attribute_required is not null
      and coalesce(v_skill_state.main_base_value, 0) < v_requirement.main_attribute_required then
      return jsonb_build_object(
        'ok', false,
        'error', 'MAIN_ATTRIBUTE_REQUIREMENT_NOT_MET',
        'message', 'Main attribute requirement is not met.',
        'details', jsonb_build_object(
          'skill_code', v_skill_row.code,
          'attribute_code', v_skill_state.main_attribute_code,
          'required', v_requirement.main_attribute_required,
          'available', coalesce(v_skill_state.main_base_value, 0)
        )
      );
    end if;

    if v_requirement.secondary_attribute_required is not null
      and coalesce(v_skill_state.secondary_base_value, 0) < v_requirement.secondary_attribute_required then
      return jsonb_build_object(
        'ok', false,
        'error', 'SECONDARY_ATTRIBUTE_REQUIREMENT_NOT_MET',
        'message', 'Secondary attribute requirement is not met.',
        'details', jsonb_build_object(
          'skill_code', v_skill_row.code,
          'attribute_code', v_skill_state.secondary_attribute_code,
          'required', v_requirement.secondary_attribute_required,
          'available', coalesce(v_skill_state.secondary_base_value, 0)
        )
      );
    end if;
  end if;

  insert into public.odyssey_character_progression (character_id)
  values (v_character_id)
  on conflict (character_id) do nothing;

  select development_points
  into v_balance_before
  from public.odyssey_character_progression
  where character_id = v_character_id
  for update;

  if v_balance_before < v_cost then
    return jsonb_build_object(
      'ok', false,
      'error', 'NOT_ENOUGH_DEVELOPMENT_POINTS',
      'message', 'Not enough Development Points.',
      'details', jsonb_build_object(
        'required', v_cost,
        'available', v_balance_before
      )
    );
  end if;

  if v_character_skill.id is null then
    if coalesce(v_skill_row.tags, '[]'::jsonb) @> '["governing-attribute-choice"]'::jsonb
      and v_skill_row.main_attribute_id is not null then
      v_default_governing_attribute_def_id := v_skill_row.main_attribute_id;
    end if;

    insert into public.odyssey_character_skills (
      character_id,
      skill_def_id,
      level,
      governing_attribute_def_id,
      custom_name,
      notes
    )
    values (
      v_character_id,
      v_skill_row.skill_def_id,
      v_target_level,
      v_default_governing_attribute_def_id,
      null,
      null
    );
  else
    update public.odyssey_character_skills
    set
      level = v_target_level,
      updated_at = timezone('utc', now())
    where id = v_character_skill.id;
  end if;

  v_balance_after := v_balance_before - v_cost;

  update public.odyssey_character_progression
  set
    development_points = v_balance_after,
    lifetime_points_spent = lifetime_points_spent + v_cost
  where character_id = v_character_id;

  insert into public.odyssey_character_progression_ledger (
    character_id,
    transaction_type,
    amount,
    balance_after,
    reason,
    source_type,
    source_id,
    data
  )
  values (
    v_character_id,
    'spend_skill',
    -v_cost,
    v_balance_after,
    v_reason,
    'skill',
    v_skill_row.skill_def_id,
    jsonb_build_object(
      'skill_code', v_skill_row.code,
      'previous_level', v_previous_level,
      'new_level', v_target_level,
      'cost', v_cost,
      'advancement_mode', v_requirement.advancement_mode
    )
  );

  v_state_version := public.odyssey_bump_character_state_version(v_character_id);

  return jsonb_build_object(
    'ok', true,
    'action', 'purchase_character_skill_level',
    'character_id', v_character_id,
    'skill',
      jsonb_build_object(
        'code', v_skill_row.code,
        'name', v_skill_row.name,
        'previous_level', v_previous_level,
        'new_level', v_target_level,
        'cost', v_cost,
        'advancement_mode', v_requirement.advancement_mode
      ),
    'development_points',
      jsonb_build_object(
        'before', v_balance_before,
        'after', v_balance_after
      ),
    'state_version', v_state_version
  );
end;
$$;

create or replace function public.purchase_character_perk(
  p_payload jsonb
)
returns jsonb
language plpgsql
as $$
declare
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_character_id uuid := nullif(trim(coalesce(v_payload->>'character_id', '')), '')::uuid;
  v_perk_code text := lower(trim(coalesce(v_payload->>'perk_code', '')));
  v_reason text := nullif(trim(coalesce(v_payload->>'reason', '')), '');
  v_character_exists boolean := false;
  v_perk_row record;
  v_balance_before integer := 0;
  v_balance_after integer := 0;
  v_required_skill_level integer := 0;
  v_available_skill_level integer := 0;
  v_state_version integer := 0;
begin
  if jsonb_typeof(v_payload) <> 'object' then
    return jsonb_build_object(
      'ok', false,
      'error', 'INVALID_PAYLOAD',
      'message', 'Payload must be a JSON object.'
    );
  end if;

  if v_character_id is null or v_perk_code = '' then
    return jsonb_build_object(
      'ok', false,
      'error', 'INVALID_PAYLOAD',
      'message', 'character_id and perk_code are required.'
    );
  end if;

  select exists(
    select 1
    from public.odyssey_characters c
    where c.id = v_character_id
      and coalesce(c.is_deleted, false) = false
  )
  into v_character_exists;

  if not v_character_exists then
    return jsonb_build_object(
      'ok', false,
      'error', 'CHARACTER_NOT_FOUND',
      'message', 'Character not found.'
    );
  end if;

  select
    p.id as perk_def_id,
    p.code,
    p.name,
    p.skill_def_id,
    p.required_skill_level
  into v_perk_row
  from public.odyssey_perk_defs p
  where p.code = v_perk_code;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'error', 'PERK_NOT_FOUND',
      'message', 'Perk code not found.'
    );
  end if;

  if exists (
    select 1
    from public.odyssey_character_perks cp
    where cp.character_id = v_character_id
      and cp.perk_def_id = v_perk_row.perk_def_id
  ) then
    return jsonb_build_object(
      'ok', false,
      'error', 'PERK_ALREADY_OWNED',
      'message', 'Character already owns this perk.'
    );
  end if;

  if v_perk_row.skill_def_id is not null then
    select coalesce(s.level, 0)
    into v_available_skill_level
    from public.odyssey_character_skills s
    where s.character_id = v_character_id
      and s.skill_def_id = v_perk_row.skill_def_id;

    v_required_skill_level := coalesce(v_perk_row.required_skill_level, 0);

    if v_available_skill_level < v_required_skill_level then
      return jsonb_build_object(
        'ok', false,
        'error', 'PERK_SKILL_REQUIREMENT_NOT_MET',
        'message', 'Purchased skill level requirement for this perk is not met.',
        'details', jsonb_build_object(
          'required', v_required_skill_level,
          'available', v_available_skill_level
        )
      );
    end if;
  end if;

  insert into public.odyssey_character_progression (character_id)
  values (v_character_id)
  on conflict (character_id) do nothing;

  select development_points
  into v_balance_before
  from public.odyssey_character_progression
  where character_id = v_character_id
  for update;

  if v_balance_before < 1 then
    return jsonb_build_object(
      'ok', false,
      'error', 'NOT_ENOUGH_DEVELOPMENT_POINTS',
      'message', 'Not enough Development Points.',
      'details', jsonb_build_object(
        'required', 1,
        'available', v_balance_before
      )
    );
  end if;

  insert into public.odyssey_character_perks (
    character_id,
    perk_def_id
  )
  values (
    v_character_id,
    v_perk_row.perk_def_id
  );

  v_balance_after := v_balance_before - 1;

  update public.odyssey_character_progression
  set
    development_points = v_balance_after,
    lifetime_points_spent = lifetime_points_spent + 1
  where character_id = v_character_id;

  insert into public.odyssey_character_progression_ledger (
    character_id,
    transaction_type,
    amount,
    balance_after,
    reason,
    source_type,
    source_id,
    data
  )
  values (
    v_character_id,
    'spend_perk',
    -1,
    v_balance_after,
    v_reason,
    'perk',
    v_perk_row.perk_def_id,
    jsonb_build_object(
      'perk_code', v_perk_row.code,
      'required_skill_level', v_perk_row.required_skill_level
    )
  );

  v_state_version := public.odyssey_bump_character_state_version(v_character_id);

  return jsonb_build_object(
    'ok', true,
    'action', 'purchase_character_perk',
    'character_id', v_character_id,
    'perk',
      jsonb_build_object(
        'code', v_perk_row.code,
        'name', v_perk_row.name,
        'cost', 1
      ),
    'development_points',
      jsonb_build_object(
        'before', v_balance_before,
        'after', v_balance_after
      ),
    'state_version', v_state_version
  );
end;
$$;

create or replace function public.gm_promote_character_skill_to_level_5(
  p_payload jsonb
)
returns jsonb
language plpgsql
as $$
declare
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_character_id uuid := nullif(trim(coalesce(v_payload->>'character_id', '')), '')::uuid;
  v_skill_code text := lower(trim(coalesce(v_payload->>'skill_code', '')));
  v_reason text := nullif(trim(coalesce(v_payload->>'reason', '')), '');
  v_actor text := coalesce(nullif(trim(coalesce(v_payload->>'actor', '')), ''), 'gm');
  v_character_exists boolean := false;
  v_skill_row record;
  v_character_skill record;
  v_balance_after integer := 0;
  v_state_version integer := 0;
begin
  if jsonb_typeof(v_payload) <> 'object' then
    return jsonb_build_object(
      'ok', false,
      'error', 'INVALID_PAYLOAD',
      'message', 'Payload must be a JSON object.'
    );
  end if;

  if v_character_id is null or v_skill_code = '' then
    return jsonb_build_object(
      'ok', false,
      'error', 'INVALID_PAYLOAD',
      'message', 'character_id and skill_code are required.'
    );
  end if;

  select exists(
    select 1
    from public.odyssey_characters c
    where c.id = v_character_id
      and coalesce(c.is_deleted, false) = false
  )
  into v_character_exists;

  if not v_character_exists then
    return jsonb_build_object(
      'ok', false,
      'error', 'CHARACTER_NOT_FOUND',
      'message', 'Character not found.'
    );
  end if;

  select
    d.id as skill_def_id,
    d.code,
    d.name,
    d.max_level
  into v_skill_row
  from public.odyssey_skill_defs d
  where d.code = v_skill_code;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'error', 'SKILL_NOT_FOUND',
      'message', 'Skill code not found.'
    );
  end if;

  if v_skill_row.max_level <> 5 then
    return jsonb_build_object(
      'ok', false,
      'error', 'INVALID_PAYLOAD',
      'message', 'Only max-level-5 skills can be promoted to level 5.'
    );
  end if;

  select *
  into v_character_skill
  from public.odyssey_character_skills s
  where s.character_id = v_character_id
    and s.skill_def_id = v_skill_row.skill_def_id
  for update of s;

  if not found or coalesce(v_character_skill.level, 0) <> 4 then
    return jsonb_build_object(
      'ok', false,
      'error', 'INVALID_PAYLOAD',
      'message', 'GM promotion requires the purchased skill level to be exactly 4.'
    );
  end if;

  insert into public.odyssey_character_progression (character_id)
  values (v_character_id)
  on conflict (character_id) do nothing;

  select development_points
  into v_balance_after
  from public.odyssey_character_progression
  where character_id = v_character_id
  for update;

  update public.odyssey_character_skills
  set
    level = 5,
    updated_at = timezone('utc', now())
  where id = v_character_skill.id;

  insert into public.odyssey_character_progression_ledger (
    character_id,
    transaction_type,
    amount,
    balance_after,
    reason,
    source_type,
    source_id,
    data
  )
  values (
    v_character_id,
    'gm_legendary_skill_grant',
    0,
    v_balance_after,
    v_reason,
    'gm',
    v_skill_row.skill_def_id,
    jsonb_build_object(
      'actor', v_actor,
      'skill_code', v_skill_row.code,
      'previous_level', 4,
      'new_level', 5
    )
  );

  v_state_version := public.odyssey_bump_character_state_version(v_character_id);

  return jsonb_build_object(
    'ok', true,
    'action', 'gm_promote_character_skill_to_level_5',
    'character_id', v_character_id,
    'skill',
      jsonb_build_object(
        'code', v_skill_row.code,
        'name', v_skill_row.name,
        'previous_level', 4,
        'new_level', 5
      ),
    'development_points',
      jsonb_build_object(
        'before', v_balance_after,
        'after', v_balance_after
      ),
    'state_version', v_state_version
  );
end;
$$;

create or replace function public.gm_update_character_attribute(
  p_payload jsonb
)
returns jsonb
language plpgsql
as $$
declare
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_character_id uuid := nullif(trim(coalesce(v_payload->>'character_id', '')), '')::uuid;
  v_attribute_def_id uuid := nullif(trim(coalesce(v_payload->>'attribute_def_id', '')), '')::uuid;
  v_attribute_code text := lower(trim(coalesce(v_payload->>'attribute_code', '')));
  v_operation text := lower(trim(coalesce(v_payload->>'operation', '')));
  v_value integer := coalesce(nullif(trim(coalesce(v_payload->>'value', '')), '')::integer, 0);
  v_reason text := nullif(trim(coalesce(v_payload->>'reason', '')), '');
  v_actor text := coalesce(nullif(trim(coalesce(v_payload->>'actor', '')), ''), 'gm');
  v_character_exists boolean := false;
  v_attribute_id_by_code uuid := null;
  v_attribute_row record;
  v_previous_value integer := 0;
  v_new_value integer := 0;
  v_state_version integer := 0;
begin
  if jsonb_typeof(v_payload) <> 'object' then
    return jsonb_build_object(
      'ok', false,
      'error', 'INVALID_PAYLOAD',
      'message', 'Payload must be a JSON object.'
    );
  end if;

  if v_character_id is null then
    return jsonb_build_object(
      'ok', false,
      'error', 'INVALID_PAYLOAD',
      'message', 'character_id is required and must be a valid UUID.'
    );
  end if;

  if v_operation not in ('set', 'adjust') then
    return jsonb_build_object(
      'ok', false,
      'error', 'INVALID_OPERATION',
      'message', 'operation must be set or adjust.'
    );
  end if;

  if v_attribute_code = '' and v_attribute_def_id is null then
    return jsonb_build_object(
      'ok', false,
      'error', 'INVALID_PAYLOAD',
      'message', 'Provide attribute_code or attribute_def_id.'
    );
  end if;

  select exists(
    select 1
    from public.odyssey_characters c
    where c.id = v_character_id
      and coalesce(c.is_deleted, false) = false
  )
  into v_character_exists;

  if not v_character_exists then
    return jsonb_build_object(
      'ok', false,
      'error', 'CHARACTER_NOT_FOUND',
      'message', 'Character not found.'
    );
  end if;

  if v_attribute_code <> '' then
    select d.id
    into v_attribute_id_by_code
    from public.odyssey_attribute_defs d
    where d.code = v_attribute_code;

    if v_attribute_id_by_code is null then
      return jsonb_build_object(
        'ok', false,
        'error', 'ATTRIBUTE_NOT_FOUND',
        'message', 'Attribute code not found.'
      );
    end if;
  end if;

  if v_attribute_id_by_code is not null and v_attribute_def_id is not null and v_attribute_id_by_code <> v_attribute_def_id then
    return jsonb_build_object(
      'ok', false,
      'error', 'REFERENCE_MISMATCH',
      'message', 'attribute_code and attribute_def_id refer to different attributes.'
    );
  end if;

  select
    d.id as attribute_def_id,
    d.code,
    d.name,
    d.max_value,
    a.id as character_attribute_id,
    a.value
  into v_attribute_row
  from public.odyssey_attribute_defs d
  left join public.odyssey_character_attributes a
    on a.attribute_def_id = d.id
   and a.character_id = v_character_id
  where d.id = coalesce(v_attribute_def_id, v_attribute_id_by_code)
  for update of a;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'error', 'ATTRIBUTE_NOT_FOUND',
      'message', 'Attribute definition not found.'
    );
  end if;

  if v_attribute_row.character_attribute_id is null then
    return jsonb_build_object(
      'ok', false,
      'error', 'ATTRIBUTE_NOT_ASSIGNED',
      'message', 'The character does not have this attribute assigned.'
    );
  end if;

  v_previous_value := coalesce(v_attribute_row.value, 0);
  if v_operation = 'set' then
    v_new_value := v_value;
  else
    v_new_value := v_previous_value + v_value;
  end if;

  if v_new_value < 0 or v_new_value > coalesce(v_attribute_row.max_value, 0) then
    return jsonb_build_object(
      'ok', false,
      'error', 'ATTRIBUTE_VALUE_OUT_OF_RANGE',
      'message', 'Attribute value is outside the allowed range.',
      'details', jsonb_build_object(
        'attribute_code', v_attribute_row.code,
        'minimum', 0,
        'maximum', v_attribute_row.max_value,
        'attempted', v_new_value
      )
    );
  end if;

  update public.odyssey_character_attributes
  set
    value = v_new_value,
    updated_at = timezone('utc', now())
  where id = v_attribute_row.character_attribute_id;

  if v_attribute_row.code = 'endurance' then
    perform public.odyssey_recalculate_character_body_part_caps(v_character_id);
  end if;

  perform public.odyssey_sync_character_resource_pools(v_character_id);
  v_state_version := public.odyssey_bump_character_state_version(v_character_id);

  return jsonb_build_object(
    'ok', true,
    'action', 'gm_update_character_attribute',
    'character_id', v_character_id,
    'actor', v_actor,
    'reason', v_reason,
    'attribute',
      jsonb_build_object(
        'code', v_attribute_row.code,
        'name', v_attribute_row.name,
        'operation', v_operation,
        'previous_value', v_previous_value,
        'new_value', v_new_value
      ),
    'state_version', v_state_version
  );
end;
$$;

create or replace function public.get_character_rule_sheet(
  p_character_id uuid
)
returns jsonb
language sql
stable
as $$
  with selected_character as (
    select
      c.id,
      c.character_key,
      c.character_bucket,
      c.enabled,
      c.owner_player_id,
      c.owner_player_name,
      c.resources,
      coalesce(nullif(trim(c.resources->>'name'), ''), c.character_key) as character_name
    from public.odyssey_characters c
    where c.id = p_character_id
      and coalesce(c.is_deleted, false) = false
  ),
  effect_summary as (
    select public.get_character_effect_summary(p_character_id) as effect_summary
    from selected_character
  ),
  progression as (
    select
      coalesce(p.development_points, 0) as development_points,
      coalesce(p.lifetime_points_granted, 0) as lifetime_points_granted,
      coalesce(p.lifetime_points_spent, 0) as lifetime_points_spent
    from selected_character c
    left join public.odyssey_character_progression p on p.character_id = c.id
  )
  select jsonb_build_object(
    'character',
      jsonb_build_object(
        'id', c.id,
        'character_key', c.character_key,
        'character_bucket', c.character_bucket,
        'name', c.character_name,
        'enabled', c.enabled,
        'owner_player_id', c.owner_player_id,
        'owner_player_name', c.owner_player_name,
        'resources', c.resources
      ),
    'progression',
      jsonb_build_object(
        'development_points', coalesce((select development_points from progression), 0),
        'lifetime_points_granted', coalesce((select lifetime_points_granted from progression), 0),
        'lifetime_points_spent', coalesce((select lifetime_points_spent from progression), 0)
      ),
    'attributes',
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'id', d.id,
              'attribute_def_id', d.id,
              'code', d.code,
              'name', d.name,
              'value', coalesce(a.value, d.default_value, 0),
              'base_value', coalesce(a.value, d.default_value, 0),
              'effect_modifier',
                case
                  when d.code is null then 0
                  else coalesce(
                    nullif(jsonb_extract_path_text(effect_summary.effect_summary, 'modifiers', 'attributes', d.code), '')::integer,
                    0
                  )
                end,
              'effective_value',
                coalesce(a.value, d.default_value, 0)
                + case
                    when d.code is null then 0
                    else coalesce(
                      nullif(jsonb_extract_path_text(effect_summary.effect_summary, 'modifiers', 'attributes', d.code), '')::integer,
                      0
                    )
                  end,
              'default_value', d.default_value,
              'max_value', d.max_value,
              'cost_per_level', d.cost_per_level,
              'description', d.description,
              'sort_order', d.sort_order,
              'is_custom', d.is_custom
            )
            order by d.sort_order, d.name
          )
          from public.odyssey_attribute_defs d
          left join public.odyssey_character_attributes a
            on a.attribute_def_id = d.id
           and a.character_id = c.id
          cross join effect_summary
        ),
        '[]'::jsonb
      ),
    'skills',
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'id', skill_state.skill_def_id,
              'character_skill_id', skill_state.character_skill_id,
              'skill_def_id', skill_state.skill_def_id,
              'code', skill_state.skill_code,
              'name', skill_state.skill_name,
              'custom_name', skill_state.custom_name,
              'category', skill_state.skill_category,
              'level', skill_state.purchased_level,
              'purchased_level', skill_state.purchased_level,
              'base_effective_level', skill_state.base_effective_level,
              'effect_level_modifier', skill_state.effect_level_modifier,
              'effective_level', skill_state.effective_level,
              'skill_bonus', skill_state.skill_bonus,
              'effect_skill_bonus', skill_state.effect_skill_bonus,
              'max_level', skill_state.max_level,
              'is_passive', skill_state.is_passive,
              'is_trained', skill_state.is_trained,
              'requirements_met', skill_state.current_level_requirements_met,
              'main_attribute',
                case
                  when skill_state.main_attribute_def_id is null then 'null'::jsonb
                  else jsonb_build_object(
                    'id', skill_state.main_attribute_def_id,
                    'code', skill_state.main_attribute_code,
                    'name', skill_state.main_attribute_name,
                    'base_value', skill_state.main_base_value,
                    'effect_modifier', skill_state.main_effect_modifier,
                    'effective_value', skill_state.main_effective_value
                  )
                end,
              'secondary_attribute',
                case
                  when skill_state.secondary_attribute_def_id is null then 'null'::jsonb
                  else jsonb_build_object(
                    'id', skill_state.secondary_attribute_def_id,
                    'code', skill_state.secondary_attribute_code,
                    'name', skill_state.secondary_attribute_name,
                    'base_value', skill_state.secondary_base_value,
                    'effect_modifier', skill_state.secondary_effect_modifier,
                    'effective_value', skill_state.secondary_effective_value
                  )
                end,
              'governing_attribute', governing_attr.code,
              'tags', skill_state.skill_tags,
              'description', skill_state.description,
              'notes', skill_state.notes,
              'next_level',
                case
                  when skill_state.purchased_level >= skill_state.max_level then 'null'::jsonb
                  else jsonb_build_object(
                    'target_level', skill_state.purchased_level + 1,
                    'cost', next_purchase_req.development_point_cost,
                    'advancement_mode', next_purchase_req.advancement_mode,
                    'main_attribute_required', next_purchase_req.main_attribute_required,
                    'secondary_attribute_required', next_purchase_req.secondary_attribute_required
                  )
                end
            )
            order by skill_state.skill_category, skill_state.sort_order, skill_state.skill_name
          )
          from public.odyssey_get_effective_character_skill_states(c.id) skill_state
          left join public.odyssey_attribute_defs governing_attr on governing_attr.id = skill_state.governing_attribute_def_id
          left join public.odyssey_skill_level_requirements next_purchase_req
            on next_purchase_req.skill_def_id = skill_state.skill_def_id
           and next_purchase_req.level = case
             when skill_state.purchased_level >= skill_state.max_level then null
             else skill_state.purchased_level + 1
           end
        ),
        '[]'::jsonb
      ),
    'perks',
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'id', cp.id,
              'perk_def_id', p.id,
              'code', p.code,
              'name', p.name,
              'skill_code', skill_def.code,
              'required_skill_level', p.required_skill_level,
              'effect_type', p.effect_type,
              'effect_data', p.effect_data,
              'tags', p.tags,
              'notes', cp.notes,
              'acquired_at', cp.acquired_at
            )
            order by p.name
          )
          from public.odyssey_character_perks cp
          join public.odyssey_perk_defs p on p.id = cp.perk_def_id
          left join public.odyssey_skill_defs skill_def on skill_def.id = p.skill_def_id
          where cp.character_id = c.id
        ),
        '[]'::jsonb
      ),
    'body_parts',
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'id', b.id,
              'body_part_def_id', d.id,
              'code', d.code,
              'name', coalesce(nullif(trim(b.custom_name), ''), d.name, b.part_key),
              'custom_name', b.custom_name,
              'part_key', b.part_key,
              'minor', b.minor,
              'serious', b.serious,
              'critical', b.critical,
              'max_critical', b.max_critical,
              'armor_value', b.armor_value,
              'disabled', b.disabled,
              'destroyed', b.destroyed,
              'can_be_targeted', coalesce(d.can_be_targeted, true),
              'aim_difficulty', coalesce(d.aim_difficulty, 0),
              'serious_counts_as_critical', coalesce(d.serious_counts_as_critical, false),
              'category', d.category,
              'tags', coalesce(d.tags, '[]'::jsonb),
              'sort_order', b.sort_order
            )
            order by b.sort_order, b.part_key
          )
          from public.odyssey_character_body_parts b
          left join public.odyssey_body_part_defs d on d.id = b.body_part_def_id
          where b.character_id = c.id
        ),
        '[]'::jsonb
      )
  )
  from selected_character c;
$$;

create or replace function public.odyssey_get_character_ability_effective_level(
  p_character_ability_id uuid
)
returns integer
language sql
stable
as $$
  select greatest(
    coalesce(skill_state.effective_level, 0),
    coalesce(ability.learned_level, 0),
    0
  )::integer
  from public.odyssey_character_abilities ability
  join public.odyssey_ability_defs def on def.id = ability.ability_def_id
  left join public.odyssey_character_skills direct_skill
    on direct_skill.id = ability.character_skill_id
  left join lateral (
    select states.effective_level
    from public.odyssey_get_effective_character_skill_states(ability.character_id) states
    where states.skill_def_id = coalesce(direct_skill.skill_def_id, def.linked_skill_id)
    limit 1
  ) skill_state on true
  where ability.id = p_character_ability_id;
$$;

create or replace function public.roll_skill(
  p_payload jsonb
)
returns jsonb
language plpgsql
volatile
as $$
declare
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_uuid_pattern constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
  v_character_id_text text := trim(coalesce(v_payload->>'character_id', ''));
  v_skill_def_id_text text := trim(coalesce(v_payload->>'skill_def_id', ''));
  v_skill_code text := lower(trim(coalesce(v_payload->>'skill_code', '')));
  v_manual_bonus_text text := trim(coalesce(v_payload->>'manual_bonus', ''));
  v_manual_penalty_text text := trim(coalesce(v_payload->>'manual_penalty', ''));
  v_reason text := nullif(trim(coalesce(v_payload->>'reason', '')), '');
  v_character_id uuid := null;
  v_skill_def_id uuid := null;
  v_skill_id_by_code uuid := null;
  v_skill_id uuid := null;
  v_manual_bonus integer := 0;
  v_manual_penalty integer := 0;
  v_actor_natural_roll integer := 0;
  v_difficulty_roll integer := 0;
  v_actor_total integer := 0;
  v_success boolean := false;
  v_is_critical_success boolean := false;
  v_is_critical_failure boolean := false;
  v_outcome text := 'failure';
  v_skill_state record;
begin
  if jsonb_typeof(v_payload) <> 'object' then
    return jsonb_build_object(
      'ok', false,
      'error', 'INVALID_PAYLOAD',
      'message', 'Payload must be a JSON object.'
    );
  end if;

  if v_character_id_text = '' or v_character_id_text !~* v_uuid_pattern then
    return jsonb_build_object(
      'ok', false,
      'error', 'INVALID_PAYLOAD',
      'message', 'character_id is required and must be a valid UUID.'
    );
  end if;
  v_character_id := v_character_id_text::uuid;

  if v_skill_code = '' and v_skill_def_id_text = '' then
    return jsonb_build_object(
      'ok', false,
      'error', 'INVALID_PAYLOAD',
      'message', 'Provide skill_code or skill_def_id.'
    );
  end if;

  if v_skill_def_id_text <> '' then
    if v_skill_def_id_text !~* v_uuid_pattern then
      return jsonb_build_object(
        'ok', false,
        'error', 'INVALID_PAYLOAD',
        'message', 'skill_def_id must be a valid UUID.'
      );
    end if;
    v_skill_def_id := v_skill_def_id_text::uuid;
  end if;

  if v_manual_bonus_text <> '' and v_manual_bonus_text !~ '^\d+$' then
    return jsonb_build_object(
      'ok', false,
      'error', 'INVALID_PAYLOAD',
      'message', 'manual_bonus must be a positive integer or 0.'
    );
  end if;
  if v_manual_penalty_text <> '' and v_manual_penalty_text !~ '^\d+$' then
    return jsonb_build_object(
      'ok', false,
      'error', 'INVALID_PAYLOAD',
      'message', 'manual_penalty must be a positive integer or 0.'
    );
  end if;

  v_manual_bonus := coalesce(nullif(v_manual_bonus_text, '')::integer, 0);
  v_manual_penalty := coalesce(nullif(v_manual_penalty_text, '')::integer, 0);

  if not exists (
    select 1
    from public.odyssey_characters c
    where c.id = v_character_id
      and coalesce(c.is_deleted, false) = false
  ) then
    return jsonb_build_object(
      'ok', false,
      'error', 'CHARACTER_NOT_FOUND',
      'message', 'Character not found.'
    );
  end if;

  if v_skill_code <> '' then
    select d.id
    into v_skill_id_by_code
    from public.odyssey_skill_defs d
    where d.code = v_skill_code;

    if v_skill_id_by_code is null then
      return jsonb_build_object(
        'ok', false,
        'error', 'SKILL_NOT_FOUND',
        'message', 'Skill code not found.'
      );
    end if;
  end if;

  if v_skill_def_id is not null then
    select d.id
    into v_skill_id
    from public.odyssey_skill_defs d
    where d.id = v_skill_def_id;

    if v_skill_id is null then
      return jsonb_build_object(
        'ok', false,
        'error', 'SKILL_NOT_FOUND',
        'message', 'Skill id not found.'
      );
    end if;
  end if;

  if v_skill_id_by_code is not null and v_skill_id is not null and v_skill_id_by_code <> v_skill_id then
    return jsonb_build_object(
      'ok', false,
      'error', 'REFERENCE_MISMATCH',
      'message', 'skill_code and skill_def_id refer to different skills.'
    );
  end if;

  v_skill_id := coalesce(v_skill_id, v_skill_id_by_code);

  select *
  into v_skill_state
  from public.odyssey_get_effective_character_skill_states(v_character_id)
  where skill_def_id = v_skill_id
  limit 1;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'error', 'SKILL_NOT_FOUND',
      'message', 'Skill state could not be resolved.'
    );
  end if;

  v_actor_natural_roll := floor(random() * 100)::integer + 1;
  v_difficulty_roll := floor(random() * 100)::integer + 1;
  v_actor_total := v_actor_natural_roll + v_skill_state.skill_bonus + v_skill_state.effect_skill_bonus + v_manual_bonus - v_manual_penalty;

  if v_actor_natural_roll >= 95 then
    v_is_critical_success := true;
    v_success := true;
    v_outcome := 'critical_success';
  elsif v_actor_natural_roll <= 5 then
    v_is_critical_failure := true;
    v_success := false;
    v_outcome := 'critical_failure';
  elsif v_actor_total >= v_difficulty_roll then
    v_success := true;
    v_outcome := 'success';
  else
    v_success := false;
    v_outcome := 'failure';
  end if;

  return jsonb_build_object(
    'ok', true,
    'check_type', 'skill',
    'character_id', v_character_id,
    'reason', v_reason,
    'skill',
      jsonb_build_object(
        'id', v_skill_state.skill_def_id,
        'character_skill_id', v_skill_state.character_skill_id,
        'code', v_skill_state.skill_code,
        'name', v_skill_state.skill_name,
        'base_level', v_skill_state.purchased_level,
        'purchased_level', v_skill_state.purchased_level,
        'base_effective_level', v_skill_state.base_effective_level,
        'effect_level_modifier', v_skill_state.effect_level_modifier,
        'effective_level', v_skill_state.effective_level,
        'skill_bonus', v_skill_state.skill_bonus,
        'effect_skill_bonus', v_skill_state.effect_skill_bonus,
        'is_trained', v_skill_state.is_trained,
        'is_passive', v_skill_state.is_passive
      ),
    'roll',
      jsonb_build_object(
        'actor_die', 'd100',
        'actor_natural_roll', v_actor_natural_roll,
        'difficulty_die', 'd100',
        'difficulty_roll', v_difficulty_roll,
        'manual_bonus', v_manual_bonus,
        'manual_penalty', v_manual_penalty,
        'actor_total', v_actor_total,
        'comparison', format('%s >= %s', v_actor_total, v_difficulty_roll)
      ),
    'result',
      jsonb_build_object(
        'success', v_success,
        'is_critical_success', v_is_critical_success,
        'is_critical_failure', v_is_critical_failure,
        'outcome', v_outcome
      )
  );
end;
$$;
