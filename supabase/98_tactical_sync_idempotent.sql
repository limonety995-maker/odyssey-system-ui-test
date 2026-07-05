-- Make tactical sync idempotent so passive refreshes do not bump encounter state.

create or replace function public.combat_sync_positions_from_owlbear(
  p_payload jsonb
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_encounter_id uuid := public.odyssey_try_parse_uuid(v_payload->>'encounter_id');
  v_campaign_id text := coalesce(nullif(trim(coalesce(v_payload->>'campaign_id', '')), ''), '');
  v_room_id text := coalesce(nullif(trim(coalesce(v_payload->>'room_id', '')), ''), '');
  v_scene_id text := coalesce(nullif(trim(coalesce(v_payload->>'scene_id', '')), ''), '');
  v_actor_player_id text := coalesce(nullif(trim(coalesce(v_payload->>'actor_player_id', '')), ''), '');
  v_actor_is_gm boolean := coalesce(nullif(trim(coalesce(v_payload->>'actor_is_gm', '')), '')::boolean, false);
  v_grid_type text := lower(trim(coalesce(v_payload->>'grid_type', '')));
  v_distance_mode text := lower(trim(coalesce(v_payload->>'distance_mode', '')));
  v_meters_per_cell integer := greatest(coalesce(nullif(trim(coalesce(v_payload->>'meters_per_cell', '')), '')::integer, 1), 1);
  v_anchor_scene_x numeric := coalesce(nullif(trim(coalesce(v_payload->>'anchor_scene_x', '')), '')::numeric, 0);
  v_anchor_scene_y numeric := coalesce(nullif(trim(coalesce(v_payload->>'anchor_scene_y', '')), '')::numeric, 0);
  v_grid_dpi numeric := coalesce(nullif(trim(coalesce(v_payload->>'grid_dpi', '')), '')::numeric, 0);
  v_positions jsonb := case when jsonb_typeof(v_payload->'positions') = 'array' then v_payload->'positions' else '[]'::jsonb end;
  v_encounter public.odyssey_combat_encounters%rowtype;
  v_existing_grid public.odyssey_combat_grid_settings%rowtype;
  v_existing_position public.odyssey_combat_positions%rowtype;
  v_item jsonb;
  v_character_id uuid;
  v_token_id text;
  v_cell_q integer;
  v_cell_r integer;
  v_scene_x numeric;
  v_scene_y numeric;
  v_synced_count integer := 0;
  v_grid_changed boolean := false;
  v_positions_changed boolean := false;
  v_state_version integer := 0;
begin
  if not v_actor_is_gm then
    return jsonb_build_object('ok', false, 'error', 'CONTROL_DENIED', 'message', 'Only the GM may sync tactical positions.');
  end if;

  if v_encounter_id is null then
    if v_room_id = '' or v_scene_id = '' then
      return jsonb_build_object('ok', false, 'error', 'INVALID_PAYLOAD', 'message', 'encounter_id or room/scene context is required.');
    end if;

    select *
    into v_encounter
    from public.odyssey_get_active_encounter(v_campaign_id, v_room_id, v_scene_id)
    for update;
  else
    select *
    into v_encounter
    from public.odyssey_combat_encounters
    where id = v_encounter_id
      and status = 'active'
      and ended_at is null
    for update;
  end if;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'ENCOUNTER_NOT_ACTIVE', 'message', 'Encounter is not active.');
  end if;

  if v_grid_type not in ('square', 'hex_vertical', 'hex_horizontal') then
    return jsonb_build_object('ok', false, 'error', 'GRID_NOT_SUPPORTED', 'message', 'Only square and hex grids are supported.');
  end if;

  if v_distance_mode not in ('chebyshev', 'manhattan', 'hex') then
    return jsonb_build_object('ok', false, 'error', 'GRID_NOT_SUPPORTED', 'message', 'Only chebyshev, manhattan, and hex distance modes are supported.');
  end if;

  if v_grid_dpi <= 0 then
    return jsonb_build_object('ok', false, 'error', 'INVALID_PAYLOAD', 'message', 'grid_dpi must be greater than 0.');
  end if;

  select *
  into v_existing_grid
  from public.odyssey_combat_grid_settings
  where encounter_id = v_encounter.id
  for update;

  if not found then
    insert into public.odyssey_combat_grid_settings (
      encounter_id,
      grid_type,
      distance_mode,
      meters_per_cell,
      anchor_scene_x,
      anchor_scene_y,
      grid_dpi
    )
    values (
      v_encounter.id,
      v_grid_type,
      v_distance_mode,
      v_meters_per_cell,
      v_anchor_scene_x,
      v_anchor_scene_y,
      v_grid_dpi
    );
    v_grid_changed := true;
  elsif v_existing_grid.grid_type is distinct from v_grid_type
     or v_existing_grid.distance_mode is distinct from v_distance_mode
     or coalesce(v_existing_grid.meters_per_cell, 0) is distinct from v_meters_per_cell
     or coalesce(v_existing_grid.anchor_scene_x, 0) is distinct from v_anchor_scene_x
     or coalesce(v_existing_grid.anchor_scene_y, 0) is distinct from v_anchor_scene_y
     or coalesce(v_existing_grid.grid_dpi, 0) is distinct from v_grid_dpi then
    update public.odyssey_combat_grid_settings
    set
      grid_type = v_grid_type,
      distance_mode = v_distance_mode,
      meters_per_cell = v_meters_per_cell,
      anchor_scene_x = v_anchor_scene_x,
      anchor_scene_y = v_anchor_scene_y,
      grid_dpi = v_grid_dpi,
      updated_at = timezone('utc', now())
    where encounter_id = v_encounter.id;
    v_grid_changed := true;
  end if;

  for v_item in
    select value
    from jsonb_array_elements(v_positions)
  loop
    v_character_id := public.odyssey_try_parse_uuid(v_item->>'character_id');
    v_token_id := coalesce(nullif(trim(coalesce(v_item->>'token_id', '')), ''), '');
    v_cell_q := coalesce(nullif(trim(coalesce(v_item->>'cell_q', '')), '')::integer, 0);
    v_cell_r := coalesce(nullif(trim(coalesce(v_item->>'cell_r', '')), '')::integer, 0);
    v_scene_x := coalesce(nullif(trim(coalesce(v_item->>'scene_x', '')), '')::numeric, 0);
    v_scene_y := coalesce(nullif(trim(coalesce(v_item->>'scene_y', '')), '')::numeric, 0);

    if v_character_id is null or v_token_id = '' then
      continue;
    end if;

    if not exists (
      select 1
      from public.odyssey_initiative_entries e
      where e.encounter_id = v_encounter.id
        and e.character_id = v_character_id
        and e.is_active = true
    ) then
      continue;
    end if;

    select *
    into v_existing_position
    from public.odyssey_combat_positions
    where encounter_id = v_encounter.id
      and character_id = v_character_id
    for update;

    if not found then
      insert into public.odyssey_combat_positions (
        encounter_id,
        character_id,
        token_id,
        cell_q,
        cell_r,
        scene_x,
        scene_y
      )
      values (
        v_encounter.id,
        v_character_id,
        v_token_id,
        v_cell_q,
        v_cell_r,
        v_scene_x,
        v_scene_y
      );
      v_positions_changed := true;
      v_synced_count := v_synced_count + 1;
    elsif v_existing_position.token_id is distinct from v_token_id
       or v_existing_position.cell_q is distinct from v_cell_q
       or v_existing_position.cell_r is distinct from v_cell_r
       or coalesce(v_existing_position.scene_x, 0) is distinct from v_scene_x
       or coalesce(v_existing_position.scene_y, 0) is distinct from v_scene_y then
      update public.odyssey_combat_positions
      set
        token_id = v_token_id,
        cell_q = v_cell_q,
        cell_r = v_cell_r,
        scene_x = v_scene_x,
        scene_y = v_scene_y,
        updated_at = timezone('utc', now())
      where encounter_id = v_encounter.id
        and character_id = v_character_id;
      v_positions_changed := true;
      v_synced_count := v_synced_count + 1;
    end if;
  end loop;

  v_state_version := coalesce(v_encounter.state_version, 0);
  if v_grid_changed or v_positions_changed then
    v_state_version := public.odyssey_increment_encounter_state_version(v_encounter.id);
  end if;

  return jsonb_build_object(
    'ok', true,
    'encounter_id', v_encounter.id,
    'synced_count', v_synced_count,
    'state_version', v_state_version,
    'runtime', public.odyssey_build_combat_runtime(v_encounter.id, v_actor_player_id, true, true, 5)
  );
end;
$$;
