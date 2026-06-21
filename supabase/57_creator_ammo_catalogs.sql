create or replace function public.creator_list_calibers(
  p_search text default null
)
returns jsonb
language sql
stable
as $$
  with search_input as (
    select nullif(trim(coalesce(p_search, '')), '') as search_text
  ),
  filtered as (
    select
      caliber.id,
      caliber.code,
      caliber.name,
      caliber.sort_order,
      caliber.base_damage_per_round,
      coalesce(caliber.tags, '[]'::jsonb) as tags
    from public.odyssey_caliber_defs caliber
    cross join search_input
    where search_input.search_text is null
      or caliber.code ilike '%' || search_input.search_text || '%'
      or caliber.name ilike '%' || search_input.search_text || '%'
      or caliber.tags::text ilike '%' || search_input.search_text || '%'
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
            'base_damage_per_round', base_damage_per_round,
            'tags', tags
          )
          order by sort_order, name, code
        ),
        '[]'::jsonb
      )
  )
  from filtered;
$$;

create or replace function public.creator_get_caliber(
  p_caliber_id uuid
)
returns jsonb
language sql
stable
as $$
  select coalesce(
    (
      select jsonb_build_object(
        'ok', true,
        'caliber',
          jsonb_build_object(
            'id', caliber.id,
            'code', caliber.code,
            'name', caliber.name,
            'base_damage_per_round', caliber.base_damage_per_round,
            'description', coalesce(caliber.description, ''),
            'tags', coalesce(caliber.tags, '[]'::jsonb),
            'is_custom', caliber.is_custom,
            'sort_order', caliber.sort_order,
            'created_at', caliber.created_at,
            'updated_at', caliber.updated_at
          )
      )
      from public.odyssey_caliber_defs caliber
      where caliber.id = p_caliber_id
    ),
    public.odyssey_creator_error(
      'CALIBER_NOT_FOUND',
      'Caliber was not found.',
      jsonb_build_array(jsonb_build_object('field', 'id', 'message', 'Unknown caliber id.'))
    )
  );
$$;

create or replace function public.creator_upsert_caliber(
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
  v_base_damage_per_round integer := coalesce(nullif(trim(coalesce(v_payload->>'base_damage_per_round', '')), '')::integer, 0);
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

  if v_base_damage_per_round < 0 then
    return public.odyssey_creator_error(
      'VALIDATION_ERROR',
      'base_damage_per_round must be >= 0.',
      jsonb_build_array(jsonb_build_object('field', 'base_damage_per_round', 'message', 'Base damage cannot be negative.'))
    );
  end if;

  if v_id is not null then
    select caliber.id
    into v_entity_id
    from public.odyssey_caliber_defs caliber
    where caliber.id = v_id;

    if v_entity_id is null then
      return public.odyssey_creator_error(
        'CALIBER_NOT_FOUND',
        'Caliber was not found for update.',
        jsonb_build_array(jsonb_build_object('field', 'id', 'message', 'Unknown caliber id.'))
      );
    end if;
  else
    select caliber.id
    into v_entity_id
    from public.odyssey_caliber_defs caliber
    where caliber.code = v_code
    limit 1;
  end if;

  if exists (
    select 1
    from public.odyssey_caliber_defs caliber
    where caliber.code = v_code
      and caliber.id <> coalesce(v_entity_id, '00000000-0000-0000-0000-000000000000'::uuid)
  ) then
    return public.odyssey_creator_error(
      'VALIDATION_ERROR',
      'Caliber code must be unique.',
      jsonb_build_array(jsonb_build_object('field', 'code', 'message', 'Duplicate caliber code.'))
    );
  end if;

  if v_entity_id is null then
    insert into public.odyssey_caliber_defs (
      code,
      name,
      base_damage_per_round,
      description,
      tags,
      is_custom,
      sort_order
    )
    values (
      v_code,
      v_name,
      v_base_damage_per_round,
      v_description,
      v_tags,
      true,
      v_sort_order
    )
    returning id into v_entity_id;
  else
    update public.odyssey_caliber_defs
    set
      code = v_code,
      name = v_name,
      base_damage_per_round = v_base_damage_per_round,
      description = v_description,
      tags = v_tags,
      sort_order = v_sort_order
    where id = v_entity_id;
  end if;

  v_result := public.creator_get_caliber(v_entity_id);

  return jsonb_build_object(
    'ok', true,
    'entity_id', v_entity_id,
    'entity', v_result,
    'warnings', '[]'::jsonb
  );
end;
$$;

create or replace function public.creator_delete_caliber(
  p_caliber_id uuid
)
returns jsonb
language plpgsql
as $$
declare
  v_caliber public.odyssey_caliber_defs%rowtype;
  v_ammo_type_count integer := 0;
  v_magazine_def_count integer := 0;
  v_weapon_model_count integer := 0;
  v_weapon_profile_count integer := 0;
  v_details jsonb := '[]'::jsonb;
begin
  select *
  into v_caliber
  from public.odyssey_caliber_defs caliber
  where caliber.id = p_caliber_id;

  if not found then
    return public.odyssey_creator_error(
      'CALIBER_NOT_FOUND',
      'Caliber was not found.',
      jsonb_build_array(jsonb_build_object('field', 'id', 'message', 'Unknown caliber id.'))
    );
  end if;

  select count(*)::integer
  into v_ammo_type_count
  from public.odyssey_ammo_type_defs ammo
  where ammo.caliber_id = p_caliber_id;

  select count(*)::integer
  into v_magazine_def_count
  from public.odyssey_magazine_defs mag
  where mag.caliber_id = p_caliber_id;

  select count(*)::integer
  into v_weapon_model_count
  from public.odyssey_weapon_model_defs weapon_model
  where weapon_model.caliber_id = p_caliber_id;

  select count(*)::integer
  into v_weapon_profile_count
  from public.odyssey_weapon_model_profiles profile
  where profile.caliber_id = p_caliber_id;

  if v_ammo_type_count > 0 or v_magazine_def_count > 0 or v_weapon_model_count > 0 or v_weapon_profile_count > 0 then
    v_details := v_details
      || jsonb_build_array(jsonb_build_object('field', 'ammo_types', 'message', format('Linked ammo types: %s', v_ammo_type_count)))
      || jsonb_build_array(jsonb_build_object('field', 'magazine_defs', 'message', format('Linked magazine definitions: %s', v_magazine_def_count)))
      || jsonb_build_array(jsonb_build_object('field', 'weapon_models', 'message', format('Linked weapon models: %s', v_weapon_model_count)))
      || jsonb_build_array(jsonb_build_object('field', 'weapon_profiles', 'message', format('Linked weapon profiles: %s', v_weapon_profile_count)));
    return public.odyssey_creator_error(
      'CALIBER_IN_USE',
      'Caliber cannot be deleted while catalog records still depend on it.',
      v_details
    );
  end if;

  delete from public.odyssey_caliber_defs
  where id = p_caliber_id;

  return jsonb_build_object(
    'ok', true,
    'deleted_id', p_caliber_id
  );
end;
$$;

create or replace function public.creator_list_ammo_types(
  p_search text default null
)
returns jsonb
language sql
stable
as $$
  with search_input as (
    select nullif(trim(coalesce(p_search, '')), '') as search_text
  ),
  filtered as (
    select
      ammo.id,
      ammo.code,
      ammo.name,
      ammo.sort_order,
      ammo.damage_modifier,
      ammo.accuracy_modifier,
      ammo.armor_pierce,
      caliber.id as caliber_id,
      caliber.code as caliber_code,
      caliber.name as caliber_name,
      coalesce(ammo.tags, '[]'::jsonb) as tags
    from public.odyssey_ammo_type_defs ammo
    join public.odyssey_caliber_defs caliber on caliber.id = ammo.caliber_id
    cross join search_input
    where search_input.search_text is null
      or ammo.code ilike '%' || search_input.search_text || '%'
      or ammo.name ilike '%' || search_input.search_text || '%'
      or caliber.name ilike '%' || search_input.search_text || '%'
      or ammo.tags::text ilike '%' || search_input.search_text || '%'
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
            'caliber_id', caliber_id,
            'caliber_code', caliber_code,
            'caliber_name', caliber_name,
            'damage_modifier', damage_modifier,
            'accuracy_modifier', accuracy_modifier,
            'armor_pierce', armor_pierce,
            'tags', tags
          )
          order by sort_order, caliber_name, name, code
        ),
        '[]'::jsonb
      )
  )
  from filtered;
$$;

create or replace function public.creator_get_ammo_type(
  p_ammo_type_id uuid
)
returns jsonb
language sql
stable
as $$
  select coalesce(
    (
      select jsonb_build_object(
        'ok', true,
        'ammo_type',
          jsonb_build_object(
            'id', ammo.id,
            'caliber_id', ammo.caliber_id,
            'caliber_code', caliber.code,
            'caliber_name', caliber.name,
            'code', ammo.code,
            'name', ammo.name,
            'damage_modifier', ammo.damage_modifier,
            'accuracy_modifier', ammo.accuracy_modifier,
            'armor_pierce', ammo.armor_pierce,
            'description', coalesce(ammo.description, ''),
            'tags', coalesce(ammo.tags, '[]'::jsonb),
            'is_custom', ammo.is_custom,
            'sort_order', ammo.sort_order,
            'created_at', ammo.created_at,
            'updated_at', ammo.updated_at
          )
      )
      from public.odyssey_ammo_type_defs ammo
      join public.odyssey_caliber_defs caliber on caliber.id = ammo.caliber_id
      where ammo.id = p_ammo_type_id
    ),
    public.odyssey_creator_error(
      'AMMO_TYPE_NOT_FOUND',
      'Ammo type was not found.',
      jsonb_build_array(jsonb_build_object('field', 'id', 'message', 'Unknown ammo type id.'))
    )
  );
$$;

create or replace function public.creator_upsert_ammo_type(
  p_payload jsonb
)
returns jsonb
language plpgsql
as $$
declare
  v_payload jsonb := public.odyssey_creator_normalize_json_object(p_payload);
  v_id uuid := nullif(trim(coalesce(v_payload->>'id', '')), '')::uuid;
  v_caliber_id uuid := nullif(trim(coalesce(v_payload->>'caliber_id', '')), '')::uuid;
  v_code text := public.odyssey_creator_normalize_code(v_payload->>'code');
  v_name text := trim(coalesce(v_payload->>'name', ''));
  v_damage_modifier integer := coalesce(nullif(trim(coalesce(v_payload->>'damage_modifier', '')), '')::integer, 0);
  v_accuracy_modifier integer := coalesce(nullif(trim(coalesce(v_payload->>'accuracy_modifier', '')), '')::integer, 0);
  v_armor_pierce integer := coalesce(nullif(trim(coalesce(v_payload->>'armor_pierce', '')), '')::integer, 0);
  v_description text := coalesce(v_payload->>'description', '');
  v_tags jsonb := public.odyssey_creator_normalize_text_array(v_payload->'tags');
  v_sort_order integer := coalesce(nullif(trim(coalesce(v_payload->>'sort_order', '')), '')::integer, 0);
  v_entity_id uuid := null;
  v_result jsonb := '{}'::jsonb;
begin
  if v_caliber_id is null or not exists (select 1 from public.odyssey_caliber_defs where id = v_caliber_id) then
    return public.odyssey_creator_error(
      'VALIDATION_ERROR',
      'A valid caliber is required.',
      jsonb_build_array(jsonb_build_object('field', 'caliber_id', 'message', 'Unknown caliber.'))
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

  if v_id is not null then
    select ammo.id
    into v_entity_id
    from public.odyssey_ammo_type_defs ammo
    where ammo.id = v_id;

    if v_entity_id is null then
      return public.odyssey_creator_error(
        'AMMO_TYPE_NOT_FOUND',
        'Ammo type was not found for update.',
        jsonb_build_array(jsonb_build_object('field', 'id', 'message', 'Unknown ammo type id.'))
      );
    end if;
  else
    select ammo.id
    into v_entity_id
    from public.odyssey_ammo_type_defs ammo
    where ammo.caliber_id = v_caliber_id
      and ammo.code = v_code
    limit 1;
  end if;

  if exists (
    select 1
    from public.odyssey_ammo_type_defs ammo
    where ammo.caliber_id = v_caliber_id
      and ammo.code = v_code
      and ammo.id <> coalesce(v_entity_id, '00000000-0000-0000-0000-000000000000'::uuid)
  ) then
    return public.odyssey_creator_error(
      'VALIDATION_ERROR',
      'Ammo code must be unique within its caliber.',
      jsonb_build_array(jsonb_build_object('field', 'code', 'message', 'Duplicate ammo code for the selected caliber.'))
    );
  end if;

  if v_entity_id is null then
    insert into public.odyssey_ammo_type_defs (
      caliber_id,
      code,
      name,
      damage_modifier,
      accuracy_modifier,
      armor_pierce,
      description,
      tags,
      is_custom,
      sort_order
    )
    values (
      v_caliber_id,
      v_code,
      v_name,
      v_damage_modifier,
      v_accuracy_modifier,
      v_armor_pierce,
      v_description,
      v_tags,
      true,
      v_sort_order
    )
    returning id into v_entity_id;
  else
    update public.odyssey_ammo_type_defs
    set
      caliber_id = v_caliber_id,
      code = v_code,
      name = v_name,
      damage_modifier = v_damage_modifier,
      accuracy_modifier = v_accuracy_modifier,
      armor_pierce = v_armor_pierce,
      description = v_description,
      tags = v_tags,
      sort_order = v_sort_order
    where id = v_entity_id;
  end if;

  v_result := public.creator_get_ammo_type(v_entity_id);

  return jsonb_build_object(
    'ok', true,
    'entity_id', v_entity_id,
    'entity', v_result,
    'warnings', '[]'::jsonb
  );
end;
$$;

create or replace function public.creator_delete_ammo_type(
  p_ammo_type_id uuid
)
returns jsonb
language plpgsql
as $$
declare
  v_ammo public.odyssey_ammo_type_defs%rowtype;
  v_ammo_stock_count integer := 0;
  v_character_magazine_count integer := 0;
  v_details jsonb := '[]'::jsonb;
begin
  select *
  into v_ammo
  from public.odyssey_ammo_type_defs ammo
  where ammo.id = p_ammo_type_id;

  if not found then
    return public.odyssey_creator_error(
      'AMMO_TYPE_NOT_FOUND',
      'Ammo type was not found.',
      jsonb_build_array(jsonb_build_object('field', 'id', 'message', 'Unknown ammo type id.'))
    );
  end if;

  select count(*)::integer
  into v_ammo_stock_count
  from public.odyssey_character_ammo_stock stock
  where stock.ammo_type_id = p_ammo_type_id;

  select count(*)::integer
  into v_character_magazine_count
  from public.odyssey_character_magazines magazine
  where magazine.ammo_type_id = p_ammo_type_id;

  if v_ammo_stock_count > 0 or v_character_magazine_count > 0 then
    v_details := v_details
      || jsonb_build_array(jsonb_build_object('field', 'ammo_stock', 'message', format('Ammo stock rows: %s', v_ammo_stock_count)))
      || jsonb_build_array(jsonb_build_object('field', 'character_magazines', 'message', format('Loaded/owned character magazines: %s', v_character_magazine_count)));
    return public.odyssey_creator_error(
      'AMMO_TYPE_IN_USE',
      'Ammo type cannot be deleted while characters still reference it.',
      v_details
    );
  end if;

  delete from public.odyssey_ammo_type_defs
  where id = p_ammo_type_id;

  return jsonb_build_object(
    'ok', true,
    'deleted_id', p_ammo_type_id
  );
end;
$$;

create or replace function public.creator_list_magazine_defs(
  p_search text default null
)
returns jsonb
language sql
stable
as $$
  with search_input as (
    select nullif(trim(coalesce(p_search, '')), '') as search_text
  ),
  filtered as (
    select
      mag.id,
      mag.code,
      mag.name,
      mag.sort_order,
      mag.capacity,
      caliber.id as caliber_id,
      caliber.code as caliber_code,
      caliber.name as caliber_name,
      coalesce(mag.tags, '[]'::jsonb) as tags
    from public.odyssey_magazine_defs mag
    join public.odyssey_caliber_defs caliber on caliber.id = mag.caliber_id
    cross join search_input
    where search_input.search_text is null
      or mag.code ilike '%' || search_input.search_text || '%'
      or mag.name ilike '%' || search_input.search_text || '%'
      or caliber.name ilike '%' || search_input.search_text || '%'
      or mag.tags::text ilike '%' || search_input.search_text || '%'
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
            'capacity', capacity,
            'caliber_id', caliber_id,
            'caliber_code', caliber_code,
            'caliber_name', caliber_name,
            'tags', tags
          )
          order by sort_order, caliber_name, name, code
        ),
        '[]'::jsonb
      )
  )
  from filtered;
$$;

create or replace function public.creator_get_magazine_def(
  p_magazine_def_id uuid
)
returns jsonb
language sql
stable
as $$
  select coalesce(
    (
      select jsonb_build_object(
        'ok', true,
        'magazine_def',
          jsonb_build_object(
            'id', mag.id,
            'caliber_id', mag.caliber_id,
            'caliber_code', caliber.code,
            'caliber_name', caliber.name,
            'code', mag.code,
            'name', mag.name,
            'capacity', mag.capacity,
            'description', coalesce(mag.description, ''),
            'tags', coalesce(mag.tags, '[]'::jsonb),
            'is_custom', mag.is_custom,
            'sort_order', mag.sort_order,
            'created_at', mag.created_at,
            'updated_at', mag.updated_at
          )
      )
      from public.odyssey_magazine_defs mag
      join public.odyssey_caliber_defs caliber on caliber.id = mag.caliber_id
      where mag.id = p_magazine_def_id
    ),
    public.odyssey_creator_error(
      'MAGAZINE_DEF_NOT_FOUND',
      'Magazine definition was not found.',
      jsonb_build_array(jsonb_build_object('field', 'id', 'message', 'Unknown magazine definition id.'))
    )
  );
$$;

create or replace function public.creator_upsert_magazine_def(
  p_payload jsonb
)
returns jsonb
language plpgsql
as $$
declare
  v_payload jsonb := public.odyssey_creator_normalize_json_object(p_payload);
  v_id uuid := nullif(trim(coalesce(v_payload->>'id', '')), '')::uuid;
  v_caliber_id uuid := nullif(trim(coalesce(v_payload->>'caliber_id', '')), '')::uuid;
  v_code text := public.odyssey_creator_normalize_code(v_payload->>'code');
  v_name text := trim(coalesce(v_payload->>'name', ''));
  v_capacity integer := coalesce(nullif(trim(coalesce(v_payload->>'capacity', '')), '')::integer, 0);
  v_description text := coalesce(v_payload->>'description', '');
  v_tags jsonb := public.odyssey_creator_normalize_text_array(v_payload->'tags');
  v_sort_order integer := coalesce(nullif(trim(coalesce(v_payload->>'sort_order', '')), '')::integer, 0);
  v_entity_id uuid := null;
  v_result jsonb := '{}'::jsonb;
begin
  if v_caliber_id is null or not exists (select 1 from public.odyssey_caliber_defs where id = v_caliber_id) then
    return public.odyssey_creator_error(
      'VALIDATION_ERROR',
      'A valid caliber is required.',
      jsonb_build_array(jsonb_build_object('field', 'caliber_id', 'message', 'Unknown caliber.'))
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

  if v_capacity < 1 then
    return public.odyssey_creator_error(
      'VALIDATION_ERROR',
      'capacity must be at least 1.',
      jsonb_build_array(jsonb_build_object('field', 'capacity', 'message', 'Magazine capacity must be at least 1.'))
    );
  end if;

  if v_id is not null then
    select mag.id
    into v_entity_id
    from public.odyssey_magazine_defs mag
    where mag.id = v_id;

    if v_entity_id is null then
      return public.odyssey_creator_error(
        'MAGAZINE_DEF_NOT_FOUND',
        'Magazine definition was not found for update.',
        jsonb_build_array(jsonb_build_object('field', 'id', 'message', 'Unknown magazine definition id.'))
      );
    end if;
  else
    select mag.id
    into v_entity_id
    from public.odyssey_magazine_defs mag
    where mag.code = v_code
    limit 1;
  end if;

  if exists (
    select 1
    from public.odyssey_magazine_defs mag
    where mag.code = v_code
      and mag.id <> coalesce(v_entity_id, '00000000-0000-0000-0000-000000000000'::uuid)
  ) then
    return public.odyssey_creator_error(
      'VALIDATION_ERROR',
      'Magazine code must be unique.',
      jsonb_build_array(jsonb_build_object('field', 'code', 'message', 'Duplicate magazine code.'))
    );
  end if;

  if v_entity_id is null then
    insert into public.odyssey_magazine_defs (
      code,
      name,
      caliber_id,
      capacity,
      description,
      tags,
      is_custom,
      sort_order
    )
    values (
      v_code,
      v_name,
      v_caliber_id,
      v_capacity,
      v_description,
      v_tags,
      true,
      v_sort_order
    )
    returning id into v_entity_id;
  else
    update public.odyssey_magazine_defs
    set
      code = v_code,
      name = v_name,
      caliber_id = v_caliber_id,
      capacity = v_capacity,
      description = v_description,
      tags = v_tags,
      sort_order = v_sort_order
    where id = v_entity_id;
  end if;

  v_result := public.creator_get_magazine_def(v_entity_id);

  return jsonb_build_object(
    'ok', true,
    'entity_id', v_entity_id,
    'entity', v_result,
    'warnings', '[]'::jsonb
  );
end;
$$;

create or replace function public.creator_delete_magazine_def(
  p_magazine_def_id uuid
)
returns jsonb
language plpgsql
as $$
declare
  v_magazine public.odyssey_magazine_defs%rowtype;
  v_character_magazine_count integer := 0;
  v_profile_link_count integer := 0;
  v_details jsonb := '[]'::jsonb;
begin
  select *
  into v_magazine
  from public.odyssey_magazine_defs mag
  where mag.id = p_magazine_def_id;

  if not found then
    return public.odyssey_creator_error(
      'MAGAZINE_DEF_NOT_FOUND',
      'Magazine definition was not found.',
      jsonb_build_array(jsonb_build_object('field', 'id', 'message', 'Unknown magazine definition id.'))
    );
  end if;

  select count(*)::integer
  into v_character_magazine_count
  from public.odyssey_character_magazines mag
  where mag.magazine_def_id = p_magazine_def_id;

  select count(*)::integer
  into v_profile_link_count
  from public.odyssey_weapon_profile_magazines link
  where link.magazine_def_id = p_magazine_def_id;

  if v_character_magazine_count > 0 or v_profile_link_count > 0 then
    v_details := v_details
      || jsonb_build_array(jsonb_build_object('field', 'character_magazines', 'message', format('Character magazine rows: %s', v_character_magazine_count)))
      || jsonb_build_array(jsonb_build_object('field', 'weapon_profile_magazines', 'message', format('Weapon profile links: %s', v_profile_link_count)));
    return public.odyssey_creator_error(
      'MAGAZINE_DEF_IN_USE',
      'Magazine definition cannot be deleted while runtime or weapon profile records still reference it.',
      v_details
    );
  end if;

  delete from public.odyssey_magazine_defs
  where id = p_magazine_def_id;

  return jsonb_build_object(
    'ok', true,
    'deleted_id', p_magazine_def_id
  );
end;
$$;

grant execute on function public.creator_list_calibers(text) to anon, authenticated;
grant execute on function public.creator_get_caliber(uuid) to anon, authenticated;
grant execute on function public.creator_upsert_caliber(jsonb) to anon, authenticated;
grant execute on function public.creator_delete_caliber(uuid) to anon, authenticated;
grant execute on function public.creator_list_ammo_types(text) to anon, authenticated;
grant execute on function public.creator_get_ammo_type(uuid) to anon, authenticated;
grant execute on function public.creator_upsert_ammo_type(jsonb) to anon, authenticated;
grant execute on function public.creator_delete_ammo_type(uuid) to anon, authenticated;
grant execute on function public.creator_list_magazine_defs(text) to anon, authenticated;
grant execute on function public.creator_get_magazine_def(uuid) to anon, authenticated;
grant execute on function public.creator_upsert_magazine_def(jsonb) to anon, authenticated;
grant execute on function public.creator_delete_magazine_def(uuid) to anon, authenticated;
