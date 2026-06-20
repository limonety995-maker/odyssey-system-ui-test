alter table public.odyssey_skill_defs
  drop constraint if exists odyssey_skill_defs_category_check;

alter table public.odyssey_skill_defs
  add constraint odyssey_skill_defs_category_check
  check (category in ('combat', 'applied', 'survival', 'vehicle', 'social', 'passive', 'psionic', 'abilities', 'custom'));

create or replace function public.get_creator_reference_data()
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'ok', true,
    'attributes',
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'id', a.id,
              'code', a.code,
              'name', a.name
            )
            order by a.sort_order, a.name, a.code
          )
          from public.odyssey_attribute_defs a
        ),
        '[]'::jsonb
      ),
    'skills',
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'id', s.id,
              'code', s.code,
              'name', s.name,
              'category', s.category
            )
            order by s.category, s.sort_order, s.name, s.code
          )
          from public.odyssey_skill_defs s
        ),
        '[]'::jsonb
      ),
    'skill_categories',
      jsonb_build_array(
        'combat',
        'applied',
        'survival',
        'vehicle',
        'social',
        'passive',
        'psionic',
        'abilities',
        'custom'
      ),
    'calibers',
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'id', c.id,
              'code', c.code,
              'name', c.name,
              'base_damage_per_round', c.base_damage_per_round
            )
            order by c.sort_order, c.name, c.code
          )
          from public.odyssey_caliber_defs c
        ),
        '[]'::jsonb
      ),
    'weapon_classes',
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'id', wc.id,
              'code', wc.code,
              'name', wc.name
            )
            order by wc.sort_order, wc.name, wc.code
          )
          from public.odyssey_weapon_class_defs wc
        ),
        '[]'::jsonb
      ),
    'range_profiles',
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'id', rp.id,
              'code', rp.code,
              'name', rp.name
            )
            order by rp.sort_order, rp.name, rp.code
          )
          from public.odyssey_range_profile_defs rp
        ),
        '[]'::jsonb
      ),
    'fire_modes',
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'id', fm.id,
              'code', fm.code,
              'name', fm.name,
              'accuracy_modifier', fm.accuracy_modifier
            )
            order by fm.sort_order, fm.name, fm.code
          )
          from public.odyssey_fire_mode_defs fm
        ),
        '[]'::jsonb
      ),
    'magazine_definitions',
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'id', m.id,
              'code', m.code,
              'name', m.name,
              'capacity', m.capacity,
              'caliber_id', m.caliber_id,
              'caliber_code', caliber.code,
              'caliber_name', caliber.name
            )
            order by m.sort_order, m.name, m.code
          )
          from public.odyssey_magazine_defs m
          join public.odyssey_caliber_defs caliber on caliber.id = m.caliber_id
        ),
        '[]'::jsonb
      ),
    'body_part_definitions',
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'id', b.id,
              'code', b.code,
              'name', b.name,
              'category', b.category,
              'can_be_targeted', b.can_be_targeted
            )
            order by b.sort_order, b.name, b.code
          )
          from public.odyssey_body_part_defs b
        ),
        '[]'::jsonb
      ),
    'resource_pools',
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'id', rp.id,
              'code', rp.code,
              'name', rp.name
            )
            order by rp.sort_order, rp.name, rp.code
          )
          from public.odyssey_resource_pool_defs rp
        ),
        '[]'::jsonb
      ),
    'abilities',
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'id', a.id,
              'code', a.code,
              'name', a.name,
              'ability_kind', a.ability_kind,
              'source_type', a.source_type
            )
            order by a.sort_order, a.name, a.code
          )
          from public.odyssey_ability_defs a
        ),
        '[]'::jsonb
      ),
    'weapon_feature_definitions',
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'id', f.id,
              'code', f.code,
              'name', f.name,
              'feature_type', f.feature_type,
              'activation_type', f.activation_type
            )
            order by f.sort_order, f.name, f.code
          )
          from public.odyssey_weapon_feature_defs f
        ),
        '[]'::jsonb
      ),
    'armor_classes',
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'id', a.id,
              'code', a.code,
              'name', a.name,
              'min_total_armor', a.min_total_armor,
              'max_total_armor', a.max_total_armor
            )
            order by a.sort_order, a.min_total_armor, a.code
          )
          from public.odyssey_armor_class_defs a
        ),
        '[]'::jsonb
      ),
    'equipment_item_types',
      jsonb_build_array(
        'armor',
        'shield',
        'implant',
        'prosthetic',
        'device',
        'exoskeleton',
        'closed_suit'
      )
  );
$$;

create or replace function public.odyssey_creator_build_skill_bundle(
  p_skill_def_id uuid
)
returns jsonb
language plpgsql
stable
as $$
declare
  v_skill jsonb := null;
  v_level_requirements jsonb := '[]'::jsonb;
begin
  select jsonb_build_object(
    'id', d.id,
    'code', d.code,
    'name', d.name,
    'category', d.category,
    'max_level', d.max_level,
    'main_attribute_id', d.main_attribute_id,
    'main_attribute_code', main_attr.code,
    'main_attribute_name', main_attr.name,
    'secondary_attribute_id', d.secondary_attribute_id,
    'secondary_attribute_code', secondary_attr.code,
    'secondary_attribute_name', secondary_attr.name,
    'description', coalesce(d.description, ''),
    'tags', coalesce(d.tags, '[]'::jsonb),
    'is_custom', d.is_custom,
    'sort_order', d.sort_order,
    'created_at', d.created_at,
    'updated_at', d.updated_at
  )
  into v_skill
  from public.odyssey_skill_defs d
  left join public.odyssey_attribute_defs main_attr on main_attr.id = d.main_attribute_id
  left join public.odyssey_attribute_defs secondary_attr on secondary_attr.id = d.secondary_attribute_id
  where d.id = p_skill_def_id;

  if v_skill is null then
    return public.odyssey_creator_error(
      'SKILL_DEF_NOT_FOUND',
      'Skill definition was not found.',
      jsonb_build_array(jsonb_build_object('field', 'id', 'message', 'Unknown skill definition id.'))
    );
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', req.id,
        'level', req.level,
        'main_attribute_required', req.main_attribute_required,
        'secondary_attribute_required', req.secondary_attribute_required,
        'requires_critical_successes', req.requires_critical_successes,
        'notes', coalesce(req.notes, ''),
        'created_at', req.created_at,
        'updated_at', req.updated_at
      )
      order by req.level, req.id
    ),
    '[]'::jsonb
  )
  into v_level_requirements
  from public.odyssey_skill_level_requirements req
  where req.skill_def_id = p_skill_def_id;

  return jsonb_build_object(
    'ok', true,
    'skill', v_skill,
    'level_requirements', v_level_requirements
  );
end;
$$;

create or replace function public.creator_list_skills(
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
    where lower(trim(value)) in ('combat', 'applied', 'survival', 'vehicle', 'social', 'passive', 'psionic', 'abilities', 'custom')
  ),
  filtered as (
    select
      d.id,
      d.code,
      d.name,
      d.category,
      d.max_level,
      d.sort_order,
      d.main_attribute_id,
      main_attr.code as main_attribute_code,
      main_attr.name as main_attribute_name,
      d.secondary_attribute_id,
      secondary_attr.code as secondary_attribute_code,
      secondary_attr.name as secondary_attribute_name,
      coalesce(d.tags, '[]'::jsonb) as tags
    from public.odyssey_skill_defs d
    left join public.odyssey_attribute_defs main_attr on main_attr.id = d.main_attribute_id
    left join public.odyssey_attribute_defs secondary_attr on secondary_attr.id = d.secondary_attribute_id
    cross join search_input
    where (
      not exists (select 1 from requested_categories)
      or d.category in (select category from requested_categories)
    )
      and (
        search_input.search_text is null
        or d.code ilike '%' || search_input.search_text || '%'
        or d.name ilike '%' || search_input.search_text || '%'
        or d.category ilike '%' || search_input.search_text || '%'
        or coalesce(main_attr.name, '') ilike '%' || search_input.search_text || '%'
        or coalesce(secondary_attr.name, '') ilike '%' || search_input.search_text || '%'
        or d.tags::text ilike '%' || search_input.search_text || '%'
      )
  )
  select jsonb_build_object(
    'ok', true,
    'items',
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', id,
            'code', code,
            'name', name,
            'category', category,
            'max_level', max_level,
            'main_attribute_id', main_attribute_id,
            'main_attribute_code', main_attribute_code,
            'main_attribute_name', main_attribute_name,
            'secondary_attribute_id', secondary_attribute_id,
            'secondary_attribute_code', secondary_attribute_code,
            'secondary_attribute_name', secondary_attribute_name,
            'tags', tags
          )
          order by category, sort_order, name, code
        ),
        '[]'::jsonb
      )
  )
  from filtered;
$$;

create or replace function public.creator_get_skill(
  p_skill_def_id uuid
)
returns jsonb
language sql
stable
as $$
  select public.odyssey_creator_build_skill_bundle(p_skill_def_id);
$$;

create or replace function public.creator_upsert_skill(
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
  v_category text := lower(trim(coalesce(v_payload->>'category', 'applied')));
  v_max_level integer := coalesce(nullif(trim(coalesce(v_payload->>'max_level', '')), '')::integer, 5);
  v_main_attribute_id uuid := nullif(trim(coalesce(v_payload->>'main_attribute_id', '')), '')::uuid;
  v_secondary_attribute_id uuid := nullif(trim(coalesce(v_payload->>'secondary_attribute_id', '')), '')::uuid;
  v_description text := coalesce(v_payload->>'description', '');
  v_tags jsonb := public.odyssey_creator_normalize_text_array(v_payload->'tags');
  v_sort_order integer := coalesce(nullif(trim(coalesce(v_payload->>'sort_order', '')), '')::integer, 0);
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

  if v_category not in ('combat', 'applied', 'survival', 'vehicle', 'social', 'passive', 'psionic', 'abilities', 'custom') then
    return public.odyssey_creator_error(
      'VALIDATION_ERROR',
      'category is invalid.',
      jsonb_build_array(jsonb_build_object('field', 'category', 'message', 'Unsupported skill category.'))
    );
  end if;

  if v_max_level not in (1, 3, 5) then
    return public.odyssey_creator_error(
      'VALIDATION_ERROR',
      'max_level must be 1, 3, or 5.',
      jsonb_build_array(jsonb_build_object('field', 'max_level', 'message', 'Use one of: 1, 3, 5.'))
    );
  end if;

  if v_main_attribute_id is not null and not exists (
    select 1
    from public.odyssey_attribute_defs attr
    where attr.id = v_main_attribute_id
  ) then
    return public.odyssey_creator_error(
      'VALIDATION_ERROR',
      'main_attribute_id references an unknown attribute.',
      jsonb_build_array(jsonb_build_object('field', 'main_attribute_id', 'message', 'Unknown attribute id.'))
    );
  end if;

  if v_secondary_attribute_id is not null and not exists (
    select 1
    from public.odyssey_attribute_defs attr
    where attr.id = v_secondary_attribute_id
  ) then
    return public.odyssey_creator_error(
      'VALIDATION_ERROR',
      'secondary_attribute_id references an unknown attribute.',
      jsonb_build_array(jsonb_build_object('field', 'secondary_attribute_id', 'message', 'Unknown attribute id.'))
    );
  end if;

  if v_id is not null then
    select d.id
    into v_entity_id
    from public.odyssey_skill_defs d
    where d.id = v_id;

    if v_entity_id is null then
      return public.odyssey_creator_error(
        'SKILL_DEF_NOT_FOUND',
        'Skill definition was not found for update.',
        jsonb_build_array(jsonb_build_object('field', 'id', 'message', 'Unknown skill definition id.'))
      );
    end if;
  else
    select d.id
    into v_entity_id
    from public.odyssey_skill_defs d
    where d.code = v_code
    limit 1;
  end if;

  if exists (
    select 1
    from public.odyssey_skill_defs d
    where d.code = v_code
      and d.id <> coalesce(v_entity_id, '00000000-0000-0000-0000-000000000000'::uuid)
  ) then
    return public.odyssey_creator_error(
      'VALIDATION_ERROR',
      'Skill code must be unique.',
      jsonb_build_array(jsonb_build_object('field', 'code', 'message', 'Duplicate skill code.'))
    );
  end if;

  if v_entity_id is null then
    insert into public.odyssey_skill_defs (
      code,
      name,
      category,
      max_level,
      main_attribute_id,
      secondary_attribute_id,
      description,
      tags,
      is_custom,
      sort_order
    )
    values (
      v_code,
      v_name,
      v_category,
      v_max_level,
      v_main_attribute_id,
      v_secondary_attribute_id,
      nullif(v_description, ''),
      v_tags,
      true,
      v_sort_order
    )
    returning id into v_entity_id;
  else
    update public.odyssey_skill_defs
    set
      code = v_code,
      name = v_name,
      category = v_category,
      max_level = v_max_level,
      main_attribute_id = v_main_attribute_id,
      secondary_attribute_id = v_secondary_attribute_id,
      description = nullif(v_description, ''),
      tags = v_tags,
      sort_order = v_sort_order
    where id = v_entity_id;
  end if;

  v_result := public.creator_get_skill(v_entity_id);

  return jsonb_build_object(
    'ok', true,
    'entity_id', v_entity_id,
    'entity', v_result,
    'warnings', '[]'::jsonb
  );
end;
$$;

create or replace function public.creator_delete_skill(
  p_skill_def_id uuid
)
returns jsonb
language plpgsql
as $$
declare
  v_skill public.odyssey_skill_defs%rowtype;
  v_character_skill_count integer := 0;
  v_weapon_model_count integer := 0;
  v_weapon_profile_count integer := 0;
  v_perk_count integer := 0;
  v_ability_count integer := 0;
  v_details jsonb := '[]'::jsonb;
begin
  select *
  into v_skill
  from public.odyssey_skill_defs d
  where d.id = p_skill_def_id;

  if not found then
    return public.odyssey_creator_error(
      'SKILL_DEF_NOT_FOUND',
      'Skill definition was not found.',
      jsonb_build_array(jsonb_build_object('field', 'id', 'message', 'Unknown skill definition id.'))
    );
  end if;

  select count(*)::integer into v_character_skill_count
  from public.odyssey_character_skills s
  where s.skill_def_id = p_skill_def_id;

  select count(*)::integer into v_weapon_model_count
  from public.odyssey_weapon_model_defs w
  where w.linked_skill_id = p_skill_def_id;

  select count(*)::integer into v_weapon_profile_count
  from public.odyssey_weapon_model_profiles p
  where p.linked_skill_id = p_skill_def_id;

  select count(*)::integer into v_perk_count
  from public.odyssey_perk_defs p
  where p.skill_def_id = p_skill_def_id;

  select count(*)::integer into v_ability_count
  from public.odyssey_ability_defs a
  where a.linked_skill_id = p_skill_def_id;

  select coalesce(jsonb_agg(item), '[]'::jsonb)
  into v_details
  from (
    select jsonb_build_object('field', 'character_skills', 'count', v_character_skill_count, 'message', 'Skill is assigned to one or more characters.') as item
    where v_character_skill_count > 0
    union all
    select jsonb_build_object('field', 'weapon_models', 'count', v_weapon_model_count, 'message', 'Skill is used by one or more weapon models.') as item
    where v_weapon_model_count > 0
    union all
    select jsonb_build_object('field', 'weapon_profiles', 'count', v_weapon_profile_count, 'message', 'Skill is used by one or more weapon profiles.') as item
    where v_weapon_profile_count > 0
    union all
    select jsonb_build_object('field', 'perks', 'count', v_perk_count, 'message', 'Skill is referenced by one or more perks.') as item
    where v_perk_count > 0
    union all
    select jsonb_build_object('field', 'abilities', 'count', v_ability_count, 'message', 'Skill is referenced by one or more abilities.') as item
    where v_ability_count > 0
  ) dependency_rows;

  if v_details <> '[]'::jsonb then
    return public.odyssey_creator_error(
      'SKILL_DEF_IN_USE',
      'Skill definition is still referenced and cannot be deleted.',
      v_details
    );
  end if;

  delete from public.odyssey_skill_defs d
  where d.id = p_skill_def_id;

  return jsonb_build_object(
    'ok', true,
    'deleted_id', p_skill_def_id,
    'deleted_code', v_skill.code
  );
end;
$$;

create or replace function public.odyssey_creator_build_equipment_catalog_bundle(
  p_equipment_model_id uuid
)
returns jsonb
language plpgsql
stable
as $$
declare
  v_model jsonb := null;
  v_ability_links jsonb := '[]'::jsonb;
begin
  select jsonb_build_object(
    'id', m.id,
    'code', m.code,
    'name', m.name,
    'item_type', m.item_type,
    'description', m.description,
    'armor_value', m.armor_value,
    'armor_max_minor', m.armor_max_minor,
    'armor_max_serious', m.armor_max_serious,
    'armor_max_critical', m.armor_max_critical,
    'default_body_part_code', m.default_body_part_code,
    'can_equip', m.can_equip,
    'can_equip_to_body_part', m.can_equip_to_body_part,
    'effect_data', coalesce(m.effect_data, '{}'::jsonb),
    'flags', coalesce(m.flags, '{}'::jsonb),
    'tags', coalesce(m.tags, '[]'::jsonb),
    'is_custom', m.is_custom,
    'sort_order', m.sort_order,
    'created_at', m.created_at,
    'updated_at', m.updated_at
  )
  into v_model
  from public.odyssey_equipment_model_defs m
  where m.id = p_equipment_model_id
    and m.item_type in ('armor', 'shield', 'implant', 'prosthetic', 'device', 'exoskeleton', 'closed_suit');

  if v_model is null then
    return public.odyssey_creator_error(
      'EQUIPMENT_MODEL_NOT_FOUND',
      'Equipment model was not found.',
      jsonb_build_array(jsonb_build_object('field', 'id', 'message', 'Unknown equipment model id.'))
    );
  end if;

  select coalesce(
    jsonb_agg(item order by sort_order, ability_name, ability_code),
    '[]'::jsonb
  )
  into v_ability_links
  from (
    select
      link.sort_order,
      ability.name as ability_name,
      ability.code as ability_code,
      jsonb_build_object(
        'id', link.id,
        'ability_def_id', link.ability_def_id,
        'ability_code', ability.code,
        'ability_name', ability.name,
        'ability_kind', ability.ability_kind,
        'source_type', ability.source_type,
        'grant_mode', link.grant_mode,
        'is_enabled', link.is_enabled,
        'sort_order', link.sort_order,
        'data', coalesce(link.data, '{}'::jsonb)
      ) as item
    from public.odyssey_equipment_model_abilities link
    join public.odyssey_ability_defs ability on ability.id = link.ability_def_id
    where link.equipment_model_id = p_equipment_model_id
  ) rows;

  return jsonb_build_object(
    'ok', true,
    'equipment_model', v_model,
    'ability_links', v_ability_links
  );
end;
$$;

create or replace function public.creator_list_equipment_models(
  p_search text default null,
  p_item_types jsonb default null
)
returns jsonb
language sql
stable
as $$
  with search_input as (
    select nullif(trim(coalesce(p_search, '')), '') as search_text
  ),
  requested_item_types as (
    select lower(trim(value)) as item_type
    from jsonb_array_elements_text(
      case
        when jsonb_typeof(p_item_types) = 'array' then p_item_types
        else '[]'::jsonb
      end
    ) value
    where lower(trim(value)) in ('armor', 'shield', 'implant', 'prosthetic', 'device', 'exoskeleton', 'closed_suit')
  ),
  filtered as (
    select
      model.id,
      model.code,
      model.name,
      model.sort_order,
      model.item_type,
      model.armor_value,
      model.armor_max_minor,
      model.armor_max_serious,
      model.armor_max_critical,
      model.default_body_part_code,
      model.can_equip,
      model.can_equip_to_body_part,
      coalesce(model.tags, '[]'::jsonb) as tags
    from public.odyssey_equipment_model_defs model
    cross join search_input
    where (
      (not exists (select 1 from requested_item_types)
        and model.item_type in ('armor', 'shield', 'implant', 'prosthetic', 'device', 'exoskeleton', 'closed_suit'))
      or model.item_type in (select item_type from requested_item_types)
    )
      and (
        search_input.search_text is null
        or model.code ilike '%' || search_input.search_text || '%'
        or model.name ilike '%' || search_input.search_text || '%'
        or model.item_type ilike '%' || search_input.search_text || '%'
        or model.tags::text ilike '%' || search_input.search_text || '%'
      )
  )
  select jsonb_build_object(
    'ok', true,
    'items',
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', id,
            'code', code,
            'name', name,
            'item_type', item_type,
            'armor_value', armor_value,
            'armor_max_minor', armor_max_minor,
            'armor_max_serious', armor_max_serious,
            'armor_max_critical', armor_max_critical,
            'default_body_part_code', default_body_part_code,
            'can_equip', can_equip,
            'can_equip_to_body_part', can_equip_to_body_part,
            'tags', tags
          )
          order by item_type, sort_order, name, code
        ),
        '[]'::jsonb
      )
  )
  from filtered;
$$;

create or replace function public.creator_get_equipment_model(
  p_equipment_model_id uuid
)
returns jsonb
language sql
stable
as $$
  select public.odyssey_creator_build_equipment_catalog_bundle(p_equipment_model_id);
$$;

create or replace function public.creator_upsert_equipment_model(
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
  v_item_type text := lower(trim(coalesce(v_payload->>'item_type', 'armor')));
  v_description text := coalesce(v_payload->>'description', '');
  v_armor_value integer := coalesce(nullif(trim(coalesce(v_payload->>'armor_value', '')), '')::integer, 0);
  v_armor_max_minor integer := coalesce(nullif(trim(coalesce(v_payload->>'armor_max_minor', '')), '')::integer, 0);
  v_armor_max_serious integer := coalesce(nullif(trim(coalesce(v_payload->>'armor_max_serious', '')), '')::integer, 0);
  v_armor_max_critical integer := coalesce(nullif(trim(coalesce(v_payload->>'armor_max_critical', '')), '')::integer, 0);
  v_default_body_part_code text := nullif(lower(trim(coalesce(v_payload->>'default_body_part_code', ''))), '');
  v_can_equip boolean := coalesce(nullif(trim(coalesce(v_payload->>'can_equip', '')), '')::boolean, true);
  v_can_equip_to_body_part boolean := coalesce(nullif(trim(coalesce(v_payload->>'can_equip_to_body_part', '')), '')::boolean, true);
  v_effect_data jsonb := public.odyssey_creator_normalize_json_object(v_payload->'effect_data');
  v_flags jsonb := public.odyssey_creator_normalize_json_object(v_payload->'flags');
  v_tags jsonb := public.odyssey_creator_normalize_text_array(v_payload->'tags');
  v_sort_order integer := coalesce(nullif(trim(coalesce(v_payload->>'sort_order', '')), '')::integer, 0);
  v_ability_links jsonb := public.odyssey_creator_normalize_json_array(v_payload->'ability_links');
  v_entity_id uuid := null;
  v_existing_item_type text := null;
  v_result jsonb := '{}'::jsonb;
  v_processed_link_ids uuid[] := '{}'::uuid[];
  v_entry jsonb := '{}'::jsonb;
  v_ability_id uuid := null;
  v_link_id uuid := null;
  v_grant_mode text := '';
  v_is_enabled boolean := true;
  v_link_sort integer := 0;
  v_link_data jsonb := '{}'::jsonb;
begin
  if v_item_type not in ('armor', 'shield', 'implant', 'prosthetic', 'device', 'exoskeleton', 'closed_suit') then
    return public.odyssey_creator_error(
      'VALIDATION_ERROR',
      'item_type is invalid.',
      jsonb_build_array(jsonb_build_object('field', 'item_type', 'message', 'Unsupported equipment item_type.'))
    );
  end if;

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

  if v_armor_value < 0
    or v_armor_max_minor < 0
    or v_armor_max_serious < 0
    or v_armor_max_critical < 0 then
    return public.odyssey_creator_error(
      'VALIDATION_ERROR',
      'armor_value and armor tier caps must be >= 0.',
      jsonb_build_array(jsonb_build_object('field', 'armor_value', 'message', 'Values cannot be negative.'))
    );
  end if;

  if v_default_body_part_code is not null and not exists (
    select 1
    from public.odyssey_body_part_defs body_part
    where body_part.code = v_default_body_part_code
  ) then
    return public.odyssey_creator_error(
      'VALIDATION_ERROR',
      'default_body_part_code references an unknown body part.',
      jsonb_build_array(jsonb_build_object('field', 'default_body_part_code', 'message', 'Unknown body part code.'))
    );
  end if;

  if v_id is not null then
    select model.id, model.item_type
    into v_entity_id, v_existing_item_type
    from public.odyssey_equipment_model_defs model
    where model.id = v_id;

    if v_entity_id is null then
      return public.odyssey_creator_error(
        'EQUIPMENT_MODEL_NOT_FOUND',
        'Equipment model was not found for update.',
        jsonb_build_array(jsonb_build_object('field', 'id', 'message', 'Unknown equipment model id.'))
      );
    end if;
  else
    select model.id, model.item_type
    into v_entity_id, v_existing_item_type
    from public.odyssey_equipment_model_defs model
    where model.code = v_code
    limit 1;
  end if;

  if v_entity_id is not null and v_existing_item_type not in ('armor', 'shield', 'implant', 'prosthetic', 'device', 'exoskeleton', 'closed_suit') then
    return public.odyssey_creator_error(
      'VALIDATION_ERROR',
      'The selected equipment model belongs to another module.',
      jsonb_build_array(jsonb_build_object('field', 'item_type', 'message', 'This equipment model cannot be edited by the equipment creator.'))
    );
  end if;

  if exists (
    select 1
    from public.odyssey_equipment_model_defs model
    where model.code = v_code
      and model.id <> coalesce(v_entity_id, '00000000-0000-0000-0000-000000000000'::uuid)
  ) then
    return public.odyssey_creator_error(
      'VALIDATION_ERROR',
      'Equipment model code must be unique.',
      jsonb_build_array(jsonb_build_object('field', 'code', 'message', 'Duplicate equipment model code.'))
    );
  end if;

  if v_entity_id is null then
    insert into public.odyssey_equipment_model_defs (
      code,
      name,
      item_type,
      description,
      armor_value,
      armor_max_minor,
      armor_max_serious,
      armor_max_critical,
      default_body_part_code,
      can_equip,
      can_equip_to_body_part,
      effect_data,
      flags,
      tags,
      is_custom,
      sort_order
    )
    values (
      v_code,
      v_name,
      v_item_type,
      v_description,
      v_armor_value,
      v_armor_max_minor,
      v_armor_max_serious,
      v_armor_max_critical,
      v_default_body_part_code,
      v_can_equip,
      v_can_equip_to_body_part,
      v_effect_data,
      v_flags,
      v_tags,
      true,
      v_sort_order
    )
    returning id into v_entity_id;
  else
    update public.odyssey_equipment_model_defs
    set
      code = v_code,
      name = v_name,
      item_type = v_item_type,
      description = v_description,
      armor_value = v_armor_value,
      armor_max_minor = v_armor_max_minor,
      armor_max_serious = v_armor_max_serious,
      armor_max_critical = v_armor_max_critical,
      default_body_part_code = v_default_body_part_code,
      can_equip = v_can_equip,
      can_equip_to_body_part = v_can_equip_to_body_part,
      effect_data = v_effect_data,
      flags = v_flags,
      tags = v_tags,
      sort_order = v_sort_order
    where id = v_entity_id;
  end if;

  for v_entry in
    select value
    from jsonb_array_elements(v_ability_links)
  loop
    v_link_id := nullif(trim(coalesce(v_entry->>'id', '')), '')::uuid;
    v_ability_id := nullif(trim(coalesce(v_entry->>'ability_def_id', '')), '')::uuid;
    v_grant_mode := lower(trim(coalesce(v_entry->>'grant_mode', 'grant')));
    v_is_enabled := coalesce(nullif(trim(coalesce(v_entry->>'is_enabled', '')), '')::boolean, true);
    v_link_sort := coalesce(nullif(trim(coalesce(v_entry->>'sort_order', '')), '')::integer, 0);
    v_link_data := public.odyssey_creator_normalize_json_object(v_entry->'data');

    if v_ability_id is null or not exists (
      select 1
      from public.odyssey_ability_defs ability
      where ability.id = v_ability_id
    ) then
      return public.odyssey_creator_error(
        'VALIDATION_ERROR',
        'ability_links references an unknown ability.',
        jsonb_build_array(jsonb_build_object('field', 'ability_links', 'message', 'Unknown ability_def_id.'))
      );
    end if;

    if v_grant_mode not in ('grant', 'available', 'passive', 'activated') then
      return public.odyssey_creator_error(
        'VALIDATION_ERROR',
        'ability_links grant_mode is invalid.',
        jsonb_build_array(jsonb_build_object('field', 'ability_links', 'message', 'grant_mode must be grant, available, passive, or activated.'))
      );
    end if;

    select link.id
    into v_link_id
    from public.odyssey_equipment_model_abilities link
    where link.equipment_model_id = v_entity_id
      and link.ability_def_id = v_ability_id
    for update;

    if v_link_id is null then
      insert into public.odyssey_equipment_model_abilities (
        equipment_model_id,
        ability_def_id,
        grant_mode,
        is_enabled,
        sort_order,
        data
      )
      values (
        v_entity_id,
        v_ability_id,
        v_grant_mode,
        v_is_enabled,
        v_link_sort,
        v_link_data
      )
      returning id into v_link_id;
    else
      update public.odyssey_equipment_model_abilities
      set
        grant_mode = v_grant_mode,
        is_enabled = v_is_enabled,
        sort_order = v_link_sort,
        data = v_link_data
      where id = v_link_id;
    end if;

    v_processed_link_ids := array_append(v_processed_link_ids, v_link_id);
  end loop;

  delete from public.odyssey_equipment_model_abilities
  where equipment_model_id = v_entity_id
    and not (id = any(v_processed_link_ids));

  v_result := public.creator_get_equipment_model(v_entity_id);

  return jsonb_build_object(
    'ok', true,
    'entity_id', v_entity_id,
    'entity', v_result,
    'warnings', '[]'::jsonb
  );
end;
$$;

create or replace function public.creator_delete_equipment_model(
  p_equipment_model_id uuid
)
returns jsonb
language plpgsql
as $$
declare
  v_model public.odyssey_equipment_model_defs%rowtype;
  v_character_item_count integer := 0;
  v_details jsonb := '[]'::jsonb;
begin
  select *
  into v_model
  from public.odyssey_equipment_model_defs model
  where model.id = p_equipment_model_id
    and model.item_type in ('armor', 'shield', 'implant', 'prosthetic', 'device', 'exoskeleton', 'closed_suit');

  if not found then
    return public.odyssey_creator_error(
      'EQUIPMENT_MODEL_NOT_FOUND',
      'Equipment model was not found.',
      jsonb_build_array(jsonb_build_object('field', 'id', 'message', 'Unknown equipment model id.'))
    );
  end if;

  select count(*)::integer
  into v_character_item_count
  from public.odyssey_character_equipment_items item
  where item.equipment_model_id = p_equipment_model_id;

  select coalesce(jsonb_agg(item), '[]'::jsonb)
  into v_details
  from (
    select jsonb_build_object('field', 'character_equipment_items', 'count', v_character_item_count, 'message', 'Equipment model is assigned to one or more character equipment items.') as item
    where v_character_item_count > 0
  ) dependency_rows;

  if v_details <> '[]'::jsonb then
    return public.odyssey_creator_error(
      'EQUIPMENT_MODEL_IN_USE',
      'Equipment model is still referenced and cannot be deleted.',
      v_details
    );
  end if;

  delete from public.odyssey_equipment_model_defs model
  where model.id = p_equipment_model_id;

  return jsonb_build_object(
    'ok', true,
    'deleted_id', p_equipment_model_id,
    'deleted_code', v_model.code,
    'deleted_item_type', v_model.item_type
  );
end;
$$;

grant execute on function public.odyssey_creator_build_skill_bundle(uuid) to anon, authenticated;
grant execute on function public.creator_list_skills(text, jsonb) to anon, authenticated;
grant execute on function public.creator_get_skill(uuid) to anon, authenticated;
grant execute on function public.creator_upsert_skill(jsonb) to anon, authenticated;
grant execute on function public.creator_delete_skill(uuid) to anon, authenticated;
grant execute on function public.odyssey_creator_build_equipment_catalog_bundle(uuid) to anon, authenticated;
grant execute on function public.creator_list_equipment_models(text, jsonb) to anon, authenticated;
grant execute on function public.creator_get_equipment_model(uuid) to anon, authenticated;
grant execute on function public.creator_upsert_equipment_model(jsonb) to anon, authenticated;
grant execute on function public.creator_delete_equipment_model(uuid) to anon, authenticated;
