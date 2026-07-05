-- ===== BEGIN 99_tactical_move_v1_square_path.sql =====
-- Tactical move v1:
-- - square grid only
-- - direct deterministic Chebyshev path
-- - route blocking by occupied combat cells

create or replace function public.odyssey_build_straight_square_path(
  p_from_q integer,
  p_from_r integer,
  p_to_q integer,
  p_to_r integer
)
returns table(
  step_index integer,
  cell_q integer,
  cell_r integer
)
language sql
immutable
set search_path = public
as $$
  with recursive path(step_index, cell_q, cell_r) as (
    select
      0,
      coalesce(p_from_q, 0),
      coalesce(p_from_r, 0)

    union all

    select
      path.step_index + 1,
      path.cell_q + case
        when path.cell_q < coalesce(p_to_q, 0) then 1
        when path.cell_q > coalesce(p_to_q, 0) then -1
        else 0
      end,
      path.cell_r + case
        when path.cell_r < coalesce(p_to_r, 0) then 1
        when path.cell_r > coalesce(p_to_r, 0) then -1
        else 0
      end
    from path
    where path.cell_q <> coalesce(p_to_q, 0)
       or path.cell_r <> coalesce(p_to_r, 0)
  )
  select
    path.step_index,
    path.cell_q,
    path.cell_r
  from path
  order by path.step_index;
$$;

create or replace function public.combat_move_character(
  p_payload jsonb
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_destination jsonb := case when jsonb_typeof(v_payload->'destination') = 'object' then v_payload->'destination' else '{}'::jsonb end;
  v_encounter_id uuid := public.odyssey_try_parse_uuid(v_payload->>'encounter_id');
  v_character_id uuid := public.odyssey_try_parse_uuid(v_payload->>'character_id');
  v_token_id text := coalesce(nullif(trim(coalesce(v_payload->>'token_id', '')), ''), '');
  v_expected_state_version integer := nullif(trim(coalesce(v_payload->>'expected_state_version', '')), '')::integer;
  v_expected_movement_version integer := nullif(trim(coalesce(v_payload->>'expected_movement_version', '')), '')::integer;
  v_actor_player_id text := coalesce(nullif(trim(coalesce(v_payload->>'actor_player_id', '')), ''), '');
  v_actor_is_gm boolean := coalesce(nullif(trim(coalesce(v_payload->>'actor_is_gm', '')), '')::boolean, false);
  v_dest_q integer := nullif(trim(coalesce(v_destination->>'cell_q', '')), '')::integer;
  v_dest_r integer := nullif(trim(coalesce(v_destination->>'cell_r', '')), '')::integer;
  v_dest_scene_x numeric := nullif(trim(coalesce(v_destination->>'scene_x', '')), '')::numeric;
  v_dest_scene_y numeric := nullif(trim(coalesce(v_destination->>'scene_y', '')), '')::numeric;
  v_encounter public.odyssey_combat_encounters%rowtype;
  v_entry public.odyssey_initiative_entries%rowtype;
  v_position public.odyssey_combat_positions%rowtype;
  v_grid public.odyssey_combat_grid_settings%rowtype;
  v_control jsonb := '{}'::jsonb;
  v_distance_cells integer := 0;
  v_move_cost_m integer := 0;
  v_log_id uuid := null;
  v_state_version integer := 0;
  v_prev_cell_q integer := 0;
  v_prev_cell_r integer := 0;
  v_prev_scene_x numeric := 0;
  v_prev_scene_y numeric := 0;
  v_effective_stats jsonb := '{}'::jsonb;
  v_skip_movement boolean := false;
  v_consumes_full_turn boolean := false;
  v_suppress_movement boolean := false;
  v_is_alive boolean := true;
  v_is_conscious boolean := true;
  v_resolved_token_id text := '';
  v_has_token_link boolean := false;
  v_blocked_cell_q integer := null;
  v_blocked_cell_r integer := null;
  v_blocked_token_id text := '';
  v_blocked_character_id uuid := null;
begin
  if v_encounter_id is null or v_character_id is null then
    return jsonb_build_object(
      'ok', false,
      'error', 'INVALID_PAYLOAD',
      'message', 'encounter_id and character_id are required.'
    );
  end if;

  if v_dest_q is null or v_dest_r is null or v_dest_scene_x is null or v_dest_scene_y is null then
    return jsonb_build_object(
      'ok', false,
      'error', 'INVALID_PAYLOAD',
      'message', 'destination cell and scene coordinates are required.'
    );
  end if;

  select *
  into v_encounter
  from public.odyssey_combat_encounters
  where id = v_encounter_id
    and status = 'active'
    and ended_at is null
  for update;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'error', 'ENCOUNTER_NOT_ACTIVE',
      'message', 'Encounter is not active.'
    );
  end if;

  select *
  into v_entry
  from public.odyssey_initiative_entries
  where encounter_id = v_encounter_id
    and character_id = v_character_id
    and is_active = true
  for update;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'error', 'PARTICIPANT_NOT_FOUND',
      'message', 'Participant was not found.'
    );
  end if;

  v_control := public.odyssey_can_control_character(v_character_id, v_actor_player_id, v_actor_is_gm);
  if coalesce((v_control->>'allowed')::boolean, false) = false then
    return jsonb_build_object(
      'ok', false,
      'error', 'MOVE_NOT_ALLOWED',
      'message', 'You cannot control this participant.',
      'runtime', public.odyssey_build_combat_runtime(v_encounter_id, v_actor_player_id, v_actor_is_gm, v_actor_is_gm, 5)
    );
  end if;

  if v_encounter.active_entry_id is distinct from v_entry.id then
    return jsonb_build_object(
      'ok', false,
      'error', 'NOT_ACTIVE_TURN',
      'message', 'It is not this participant''s turn.',
      'runtime', public.odyssey_build_combat_runtime(v_encounter_id, v_actor_player_id, v_actor_is_gm, v_actor_is_gm, 5)
    );
  end if;

  if v_expected_state_version is not null
     and coalesce(v_encounter.state_version, 0) <> v_expected_state_version then
    return jsonb_build_object(
      'ok', false,
      'error', 'STALE_MOVEMENT_STATE',
      'message', 'Combat state changed. Reload authoritative runtime.',
      'state_version', coalesce(v_encounter.state_version, 0),
      'runtime', public.odyssey_build_combat_runtime(v_encounter_id, v_actor_player_id, v_actor_is_gm, v_actor_is_gm, 5)
    );
  end if;

  if v_expected_movement_version is not null
     and coalesce(v_entry.movement_version, 0) <> v_expected_movement_version then
    return jsonb_build_object(
      'ok', false,
      'error', 'STALE_MOVEMENT_STATE',
      'message', 'Movement state changed. Reload authoritative runtime.',
      'movement_version', coalesce(v_entry.movement_version, 0),
      'state_version', coalesce(v_encounter.state_version, 0),
      'runtime', public.odyssey_build_combat_runtime(v_encounter_id, v_actor_player_id, v_actor_is_gm, v_actor_is_gm, 5)
    );
  end if;

  select *
  into v_grid
  from public.odyssey_combat_grid_settings
  where encounter_id = v_encounter_id
  for update;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'error', 'INVALID_COMBAT_GRID',
      'message', 'The tactical grid has not been synced by the GM yet.'
    );
  end if;

  if v_grid.grid_type <> 'square'
     or coalesce(v_grid.meters_per_cell, 0) <= 0 then
    return jsonb_build_object(
      'ok', false,
      'error', 'INVALID_COMBAT_GRID',
      'message', 'Tactical Move v1 supports only square grids.',
      'runtime', public.odyssey_build_combat_runtime(v_encounter_id, v_actor_player_id, v_actor_is_gm, v_actor_is_gm, 5)
    );
  end if;

  select *
  into v_position
  from public.odyssey_combat_positions
  where encounter_id = v_encounter_id
    and character_id = v_character_id
  for update;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'error', 'TOKEN_LINK_NOT_FOUND',
      'message', 'This combat token position has not been synced yet.'
    );
  end if;

  v_resolved_token_id := coalesce(nullif(v_token_id, ''), coalesce(v_position.token_id, ''));

  if v_token_id <> '' and v_position.token_id <> v_token_id then
    return jsonb_build_object(
      'ok', false,
      'error', 'TOKEN_LINK_NOT_FOUND',
      'message', 'Token link changed. Reload authoritative runtime.',
      'runtime', public.odyssey_build_combat_runtime(v_encounter_id, v_actor_player_id, v_actor_is_gm, v_actor_is_gm, 5)
    );
  end if;

  select exists(
    select 1
    from public.odyssey_token_links link
    where link.room_id = v_encounter.room_id
      and link.scene_id = v_encounter.scene_id
      and link.character_id = v_character_id
      and link.token_id = v_resolved_token_id
      and link.is_active = true
  )
  into v_has_token_link;

  if not v_has_token_link then
    return jsonb_build_object(
      'ok', false,
      'error', 'TOKEN_LINK_NOT_FOUND',
      'message', 'Active token link was not found for this combatant.',
      'runtime', public.odyssey_build_combat_runtime(v_encounter_id, v_actor_player_id, v_actor_is_gm, v_actor_is_gm, 5)
    );
  end if;

  v_effective_stats := public.get_effective_character_stats(v_character_id);
  v_skip_movement := coalesce(nullif(jsonb_extract_path_text(v_effective_stats, 'derived', 'skip_movement'), '')::boolean, false);
  v_consumes_full_turn := coalesce(nullif(jsonb_extract_path_text(v_effective_stats, 'derived', 'consumes_full_turn'), '')::boolean, false);
  v_suppress_movement := coalesce(nullif(jsonb_extract_path_text(v_effective_stats, 'derived', 'suppress_movement'), '')::boolean, false);
  v_is_alive := coalesce(nullif(jsonb_extract_path_text(v_effective_stats, 'derived', 'is_alive'), '')::boolean, true);
  v_is_conscious := coalesce(nullif(jsonb_extract_path_text(v_effective_stats, 'derived', 'is_conscious'), '')::boolean, true);

  if not v_is_alive or not v_is_conscious or v_skip_movement or v_consumes_full_turn or v_suppress_movement then
    return jsonb_build_object(
      'ok', false,
      'error', 'MOVEMENT_LOCKED',
      'message', 'Movement is currently blocked by combat state or effects.',
      'runtime', public.odyssey_build_combat_runtime(v_encounter_id, v_actor_player_id, v_actor_is_gm, v_actor_is_gm, 5)
    );
  end if;

  v_prev_cell_q := v_position.cell_q;
  v_prev_cell_r := v_position.cell_r;
  v_prev_scene_x := v_position.scene_x;
  v_prev_scene_y := v_position.scene_y;

  v_distance_cells := greatest(
    abs(coalesce(v_dest_q, 0) - coalesce(v_position.cell_q, 0)),
    abs(coalesce(v_dest_r, 0) - coalesce(v_position.cell_r, 0))
  );
  v_move_cost_m := v_distance_cells * greatest(coalesce(v_grid.meters_per_cell, 1), 1);

  if v_distance_cells = 0 then
    return jsonb_build_object(
      'ok', true,
      'encounter_id', v_encounter_id,
      'character_id', v_character_id,
      'position',
        jsonb_build_object(
          'token_id', v_position.token_id,
          'cell_q', v_position.cell_q,
          'cell_r', v_position.cell_r,
          'scene_x', v_position.scene_x,
          'scene_y', v_position.scene_y,
          'updated_at', v_position.updated_at
        ),
      'distance_cells', 0,
      'move_cost_m', 0,
      'move_current', coalesce(v_entry.move_current, 0),
      'movement_version', coalesce(v_entry.movement_version, 0),
      'state_version', coalesce(v_encounter.state_version, 0),
      'log_id', null,
      'runtime', public.odyssey_build_combat_runtime(v_encounter_id, v_actor_player_id, v_actor_is_gm, v_actor_is_gm, 5)
    );
  end if;

  select
    path.cell_q,
    path.cell_r,
    occupied.token_id,
    occupied.character_id
  into
    v_blocked_cell_q,
    v_blocked_cell_r,
    v_blocked_token_id,
    v_blocked_character_id
  from public.odyssey_build_straight_square_path(
    v_position.cell_q,
    v_position.cell_r,
    v_dest_q,
    v_dest_r
  ) path
  join public.odyssey_combat_positions occupied
    on occupied.encounter_id = v_encounter_id
   and occupied.cell_q = path.cell_q
   and occupied.cell_r = path.cell_r
   and occupied.character_id <> v_character_id
  join public.odyssey_initiative_entries occupied_entry
    on occupied_entry.encounter_id = v_encounter_id
   and occupied_entry.character_id = occupied.character_id
   and occupied_entry.is_active = true
  where path.step_index > 0
  order by path.step_index
  limit 1;

  if found then
    return jsonb_build_object(
      'ok', false,
      'error', 'MOVE_PATH_BLOCKED',
      'message', 'Path blocked by another combatant.',
      'blocked_cell',
        jsonb_build_object(
          'cell_q', v_blocked_cell_q,
          'cell_r', v_blocked_cell_r
        ),
      'blocked_token_id', nullif(v_blocked_token_id, ''),
      'blocked_character_id', v_blocked_character_id,
      'distance_cells', v_distance_cells,
      'move_cost_m', v_move_cost_m,
      'move_current', coalesce(v_entry.move_current, 0),
      'runtime', public.odyssey_build_combat_runtime(v_encounter_id, v_actor_player_id, v_actor_is_gm, v_actor_is_gm, 5)
    );
  end if;

  if coalesce(v_entry.move_current, 0) < v_move_cost_m then
    return jsonb_build_object(
      'ok', false,
      'error', 'MOVE_EXCEEDS_REMAINING',
      'message', 'Movement exceeds remaining distance.',
      'distance_cells', v_distance_cells,
      'move_cost_m', v_move_cost_m,
      'move_current', coalesce(v_entry.move_current, 0),
      'runtime', public.odyssey_build_combat_runtime(v_encounter_id, v_actor_player_id, v_actor_is_gm, v_actor_is_gm, 5)
    );
  end if;

  update public.odyssey_combat_positions
  set
    token_id = v_resolved_token_id,
    cell_q = v_dest_q,
    cell_r = v_dest_r,
    scene_x = v_dest_scene_x,
    scene_y = v_dest_scene_y,
    updated_at = timezone('utc', now())
  where encounter_id = v_encounter_id
    and character_id = v_character_id
  returning * into v_position;

  update public.odyssey_initiative_entries
  set
    move_current = greatest(move_current - v_move_cost_m, 0),
    movement_version = coalesce(movement_version, 0) + 1
  where id = v_entry.id
  returning * into v_entry;

  v_state_version := public.odyssey_increment_encounter_state_version(v_encounter_id);

  v_log_id := public.odyssey_combat_log_insert(
    v_encounter.campaign_id,
    v_encounter.room_id,
    v_encounter.scene_id,
    v_encounter.id,
    v_encounter.current_round,
    v_character_id,
    null,
    v_character_id,
    'public',
    'move',
    public.odyssey_character_display_name(v_character_id) || ' moved ' || v_move_cost_m || ' m.',
    jsonb_build_object(
      'token_id', v_position.token_id,
      'from_cell_q', v_prev_cell_q,
      'from_cell_r', v_prev_cell_r,
      'from_scene_x', v_prev_scene_x,
      'from_scene_y', v_prev_scene_y,
      'to_cell_q', v_dest_q,
      'to_cell_r', v_dest_r,
      'to_scene_x', v_dest_scene_x,
      'to_scene_y', v_dest_scene_y,
      'distance_cells', v_distance_cells,
      'move_cost_m', v_move_cost_m,
      'move_remaining', v_entry.move_current
    ),
    jsonb_build_object(
      'token_id', v_position.token_id,
      'to_cell_q', v_dest_q,
      'to_cell_r', v_dest_r,
      'distance_cells', v_distance_cells,
      'move_cost_m', v_move_cost_m,
      'move_remaining', v_entry.move_current
    ),
    coalesce(nullif(v_actor_player_id, ''), 'system')
  );

  return jsonb_build_object(
    'ok', true,
    'encounter_id', v_encounter_id,
    'character_id', v_character_id,
    'position',
      jsonb_build_object(
        'token_id', v_position.token_id,
        'cell_q', v_position.cell_q,
        'cell_r', v_position.cell_r,
        'scene_x', v_position.scene_x,
        'scene_y', v_position.scene_y,
        'updated_at', v_position.updated_at
      ),
    'distance_cells', v_distance_cells,
    'move_cost_m', v_move_cost_m,
    'move_current', coalesce(v_entry.move_current, 0),
    'movement_version', coalesce(v_entry.movement_version, 0),
    'state_version', v_state_version,
    'log_id', v_log_id,
    'runtime', public.odyssey_build_combat_runtime(v_encounter_id, v_actor_player_id, v_actor_is_gm, v_actor_is_gm, 5)
  );
end;
$$;

grant execute on function public.odyssey_build_straight_square_path(integer, integer, integer, integer) to anon, authenticated;
grant execute on function public.combat_move_character(jsonb) to anon, authenticated;
-- ===== END 99_tactical_move_v1_square_path.sql =====
