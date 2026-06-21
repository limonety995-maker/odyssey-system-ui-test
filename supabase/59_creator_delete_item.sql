create or replace function public.creator_delete_item_def(
  p_item_def_id uuid
)
returns jsonb
language plpgsql
as $$
declare
  v_item public.odyssey_item_defs%rowtype;
  v_character_item_count integer := 0;
  v_reload_feature_count integer := 0;
  v_ability_resource_count integer := 0;
  v_details jsonb := '[]'::jsonb;
begin
  select *
  into v_item
  from public.odyssey_item_defs item
  where item.id = p_item_def_id;

  if not found then
    return public.odyssey_creator_error(
      'ITEM_DEF_NOT_FOUND',
      'Item definition was not found.',
      jsonb_build_array(jsonb_build_object('field', 'id', 'message', 'Unknown item definition id.'))
    );
  end if;

  select count(*)::integer
  into v_character_item_count
  from public.odyssey_character_items item
  where item.item_def_id = p_item_def_id;

  if v_character_item_count > 0 then
    v_details := v_details || jsonb_build_array(
      jsonb_build_object(
        'field', 'character_items',
        'count', v_character_item_count,
        'message', 'Item definition is assigned to one or more character inventory records.'
      )
    );
  end if;

  select count(*)::integer
  into v_reload_feature_count
  from public.odyssey_weapon_feature_defs feature
  where feature.requires_reload_item_code = v_item.code;

  if v_reload_feature_count > 0 then
    v_details := v_details || jsonb_build_array(
      jsonb_build_object(
        'field', 'requires_reload_item_code',
        'count', v_reload_feature_count,
        'message', 'Item definition is referenced by one or more weapon features as a reload item.'
      )
    );
  end if;

  select count(*)::integer
  into v_ability_resource_count
  from public.odyssey_ability_defs ability
  where ability.resource_item_code = v_item.code;

  if v_ability_resource_count > 0 then
    v_details := v_details || jsonb_build_array(
      jsonb_build_object(
        'field', 'resource_item_code',
        'count', v_ability_resource_count,
        'message', 'Item definition is referenced by one or more abilities as a resource item.'
      )
    );
  end if;

  if jsonb_array_length(v_details) > 0 then
    return public.odyssey_creator_error(
      'ITEM_DEF_IN_USE',
      'Item definition is still referenced and cannot be deleted.',
      v_details
    );
  end if;

  delete from public.odyssey_item_defs item
  where item.id = p_item_def_id;

  return jsonb_build_object(
    'ok', true,
    'deleted_id', p_item_def_id,
    'deleted_code', v_item.code
  );
end;
$$;

grant execute on function public.creator_delete_item_def(uuid) to anon, authenticated;
