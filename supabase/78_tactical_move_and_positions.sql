-- Odyssey System: tactical movement foundation
-- Stage 78: encounter grid settings, authoritative combat positions,
--           move RPC, and GM sync from Owlbear.

create table if not exists public.odyssey_combat_grid_settings (
  encounter_id uuid primary key references public.odyssey_combat_encounters(id) on delete cascade,
  grid_type text not null,
  distance_mode text not null,
  meters_per_cell integer not null default 1,
  anchor_scene_x numeric not null,
  anchor_scene_y numeric not null,
  grid_dpi numeric not null,
  updated_at timestamptz not null default timezone('utc', now())
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'odyssey_combat_grid_settings_grid_type_check'
  ) then
    alter table public.odyssey_combat_grid_settings
      add constraint odyssey_combat_grid_settings_grid_type_check
      check (grid_type in ('square', 'hex_vertical', 'hex_horizontal'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'odyssey_combat_grid_settings_distance_mode_check'
  ) then
    alter table public.odyssey_combat_grid_settings
      add constraint odyssey_combat_grid_settings_distance_mode_check
      check (distance_mode in ('chebyshev', 'manhattan', 'hex'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'odyssey_combat_grid_settings_meters_per_cell_check'
  ) then
    alter table public.odyssey_combat_grid_settings
      add constraint odyssey_combat_grid_settings_meters_per_cell_check
      check (meters_per_cell > 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'odyssey_combat_grid_settings_grid_dpi_check'
  ) then
    alter table public.odyssey_combat_grid_settings
      add constraint odyssey_combat_grid_settings_grid_dpi_check
      check (grid_dpi > 0);
  end if;
end;
$$;

drop trigger if exists odyssey_touch_updated_at_combat_grid_settings on public.odyssey_combat_grid_settings;
create trigger odyssey_touch_updated_at_combat_grid_settings
before update on public.odyssey_combat_grid_settings
for each row
execute function public.odyssey_touch_updated_at();

create table if not exists public.odyssey_combat_positions (
  encounter_id uuid not null references public.odyssey_combat_encounters(id) on delete cascade,
  character_id uuid not null references public.odyssey_characters(id) on delete cascade,
  token_id text not null,
  cell_q integer not null,
  cell_r integer not null,
  scene_x numeric not null,
  scene_y numeric not null,
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (encounter_id, character_id),
  unique (encounter_id, token_id)
);

create index if not exists odyssey_combat_positions_encounter_token_idx
  on public.odyssey_combat_positions (encounter_id, token_id);

drop trigger if exists odyssey_touch_updated_at_combat_positions on public.odyssey_combat_positions;
create trigger odyssey_touch_updated_at_combat_positions
before update on public.odyssey_combat_positions
for each row
execute function public.odyssey_touch_updated_at();

create or replace function public.odyssey_tactical_distance_cells(
  p_grid_type text,
  p_distance_mode text,
  p_from_q integer,
  p_from_r integer,
  p_to_q integer,
  p_to_r integer
)
returns integer
language plpgsql
immutable
as $$
declare
  v_grid_type text := lower(trim(coalesce(p_grid_type, '')));
  v_distance_mode text := lower(trim(coalesce(p_distance_mode, '')));
  v_dx integer := abs(coalesce(p_to_q, 0) - coalesce(p_from_q, 0));
  v_dy integer := abs(coalesce(p_to_r, 0) - coalesce(p_from_r, 0));
begin
  case v_grid_type
    when 'square' then
      case v_distance_mode
        when 'manhattan' then
          return v_dx + v_dy;
        when 'chebyshev' then
          return greatest(v_dx, v_dy);
        else
          raise exception 'Unsupported square distance mode: %', v_distance_mode;
      end case;
    when 'hex_vertical', 'hex_horizontal' then
      return (
        abs(coalesce(p_to_q, 0) - coalesce(p_from_q, 0))
        + abs(coalesce(p_to_r, 0) - coalesce(p_from_r, 0))
        + abs(
          (coalesce(p_to_q, 0) + coalesce(p_to_r, 0))
          - (coalesce(p_from_q, 0) + coalesce(p_from_r, 0))
        )
      ) / 2;
    else
      raise exception 'Unsupported tactical grid type: %', v_grid_type;
  end case;
end;
$$;

create or replace function public.odyssey_build_combat_runtime(
  p_encounter_id uuid,
  p_actor_player_id text default null,
  p_actor_is_gm boolean default false,
  p_include_hidden boolean default false,
  p_log_limit integer default 5
)
returns jsonb
language plpgsql
stable
as $$
declare
  v_encounter public.odyssey_combat_encounters%rowtype;
  v_actor_player_id text := coalesce(nullif(trim(coalesce(p_actor_player_id, '')), ''), '');
  v_actor_is_gm boolean := coalesce(p_actor_is_gm, false);
  v_include_hidden boolean := coalesce(p_include_hidden, false);
  v_log_limit integer := greatest(1, least(coalesce(p_log_limit, 5), 100));
  v_viewer_character_ids uuid[] := array[]::uuid[];
  v_participants jsonb := '[]'::jsonb;
  v_log_rows jsonb := '[]'::jsonb;
  v_tactical_grid jsonb := null;
begin
  if p_encounter_id is null then
    return jsonb_build_object(
      'ok', true,
      'encounter', null,
      'current_turn', null,
      'visible_participants', '[]'::jsonb,
      'viewer_controlled_character_ids', '[]'::jsonb,
      'log', '[]'::jsonb,
      'state_version', 0,
      'tactical_grid', null
    );
  end if;

  select *
  into v_encounter
  from public.odyssey_combat_encounters e
  where e.id = p_encounter_id;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'error', 'ENCOUNTER_NOT_FOUND',
      'message', 'Encounter was not found.'
    );
  end if;

  if v_actor_player_id <> '' then
    select coalesce(array_agg(c.id), array[]::uuid[])
    into v_viewer_character_ids
    from public.odyssey_characters c
    where coalesce(c.is_deleted, false) = false
      and c.owner_player_id = v_actor_player_id;
  end if;

  select
    jsonb_build_object(
      'encounter_id', g.encounter_id,
      'grid_type', g.grid_type,
      'distance_mode', g.distance_mode,
      'meters_per_cell', g.meters_per_cell,
      'anchor_scene_x', g.anchor_scene_x,
      'anchor_scene_y', g.anchor_scene_y,
      'grid_dpi', g.grid_dpi,
      'updated_at', g.updated_at
    )
  into v_tactical_grid
  from public.odyssey_combat_grid_settings g
  where g.encounter_id = p_encounter_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'initiative_entry_id', e.id,
        'character_id', c.id,
        'character_key', c.character_key,
        'display_name', public.odyssey_character_display_name(c.id),
        'character_bucket', c.character_bucket,
        'owner_player_id', c.owner_player_id,
        'owner_player_name', c.owner_player_name,
        'token_id', coalesce(pos.token_id, link.token_id, ''),
        'initiative_value', e.initiative_value,
        'reaction_value', e.reaction_value,
        'roll_value', e.roll_value,
        'bonus_value', e.bonus_value,
        'order_index', e.order_index,
        'is_active', e.is_active,
        'is_current_turn', v_encounter.active_entry_id = e.id,
        'action_current', e.action_current,
        'action_max', e.action_max,
        'move_current', e.move_current,
        'move_max', e.move_max,
        'reaction_action_current', e.reaction_action_current,
        'reaction_action_max', e.reaction_action_max,
        'action_converted_to_move', e.action_converted_to_move,
        'hide_from_initiative_ui', e.hide_from_initiative_ui,
        'joined_round', e.joined_round,
        'movement_version', e.movement_version,
        'turn_version', e.turn_version,
        'removed_at', e.removed_at,
        'removed_reason', e.removed_reason,
        'position',
          case
            when pos.character_id is null then null
            else jsonb_build_object(
              'cell_q', pos.cell_q,
              'cell_r', pos.cell_r,
              'scene_x', pos.scene_x,
              'scene_y', pos.scene_y,
              'updated_at', pos.updated_at
            )
          end,
        'control', public.odyssey_can_control_character(c.id, v_actor_player_id, v_actor_is_gm),
        'state',
          jsonb_build_object(
            'state_version', coalesce(s.state_version, c.active_combat_state_version, 0),
            'status_summary', coalesce(nullif(trim(s.status_summary), ''), public.odyssey_build_character_status_summary(c.id)),
            'is_alive', coalesce(s.is_alive, true),
            'is_conscious', coalesce(s.is_conscious, true)
          )
      )
      order by e.order_index, e.created_at, e.id
    ),
    '[]'::jsonb
  )
  into v_participants
  from public.odyssey_initiative_entries e
  join public.odyssey_characters c on c.id = e.character_id
  left join public.odyssey_character_combat_state s on s.character_id = c.id
  left join public.odyssey_combat_positions pos
    on pos.encounter_id = e.encounter_id
   and pos.character_id = e.character_id
  left join lateral (
    select t.token_id
    from public.odyssey_token_links t
    where t.room_id = v_encounter.room_id
      and t.scene_id = v_encounter.scene_id
      and t.character_id = c.id
      and t.is_active = true
    order by t.updated_at desc, t.created_at desc, t.id desc
    limit 1
  ) link on true
  where e.encounter_id = p_encounter_id
    and (
      v_actor_is_gm
      or not e.hide_from_initiative_ui
      or (v_actor_is_gm and v_include_hidden)
    );

  v_log_rows := coalesce(
    public.combat_get_log(
      jsonb_build_object(
        'encounter_id', p_encounter_id,
        'room_id', v_encounter.room_id,
        'actor_player_id', v_actor_player_id,
        'actor_is_gm', v_actor_is_gm,
        'limit', v_log_limit
      )
    )->'rows',
    '[]'::jsonb
  );

  return jsonb_build_object(
    'ok', true,
    'encounter',
      jsonb_build_object(
        'id', v_encounter.id,
        'campaign_id', v_encounter.campaign_id,
        'room_id', v_encounter.room_id,
        'scene_id', v_encounter.scene_id,
        'name', v_encounter.name,
        'status', v_encounter.status,
        'current_round', v_encounter.current_round,
        'active_character_id', v_encounter.active_character_id,
        'active_entry_id', v_encounter.active_entry_id,
        'state_version', v_encounter.state_version,
        'action_default', v_encounter.action_default,
        'move_default', v_encounter.move_default,
        'started_at', v_encounter.started_at,
        'last_transition_at', v_encounter.last_transition_at
      ),
    'current_turn',
      case
        when v_encounter.active_entry_id is null then null
        else (
          select participant
          from jsonb_array_elements(v_participants) participant
          where public.odyssey_try_parse_uuid(participant->>'initiative_entry_id') = v_encounter.active_entry_id
          limit 1
        )
      end,
    'visible_participants', v_participants,
    'viewer_controlled_character_ids', to_jsonb(v_viewer_character_ids),
    'log', v_log_rows,
    'state_version', coalesce(v_encounter.state_version, 0),
    'tactical_grid', v_tactical_grid
  );
end;
$$;

create or replace function public.combat_sync_positions_from_owlbear(
  p_payload jsonb
)
returns jsonb
language plpgsql
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
  v_item jsonb;
  v_character_id uuid;
  v_token_id text;
  v_cell_q integer;
  v_cell_r integer;
  v_scene_x numeric;
  v_scene_y numeric;
  v_synced_count integer := 0;
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
  )
  on conflict (encounter_id) do update
  set
    grid_type = excluded.grid_type,
    distance_mode = excluded.distance_mode,
    meters_per_cell = excluded.meters_per_cell,
    anchor_scene_x = excluded.anchor_scene_x,
    anchor_scene_y = excluded.anchor_scene_y,
    grid_dpi = excluded.grid_dpi,
    updated_at = timezone('utc', now());

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
    )
    on conflict (encounter_id, character_id) do update
    set
      token_id = excluded.token_id,
      cell_q = excluded.cell_q,
      cell_r = excluded.cell_r,
      scene_x = excluded.scene_x,
      scene_y = excluded.scene_y,
      updated_at = timezone('utc', now());

    v_synced_count := v_synced_count + 1;
  end loop;

  perform public.odyssey_increment_encounter_state_version(v_encounter.id);

  return jsonb_build_object(
    'ok', true,
    'encounter_id', v_encounter.id,
    'synced_count', v_synced_count,
    'runtime', public.odyssey_build_combat_runtime(v_encounter.id, v_actor_player_id, true, true, 5)
  );
end;
$$;

create or replace function public.combat_move_character(
  p_payload jsonb
)
returns jsonb
language plpgsql
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
begin
  if v_encounter_id is null or v_character_id is null then
    return jsonb_build_object('ok', false, 'error', 'INVALID_PAYLOAD', 'message', 'encounter_id and character_id are required.');
  end if;

  if v_dest_q is null or v_dest_r is null or v_dest_scene_x is null or v_dest_scene_y is null then
    return jsonb_build_object('ok', false, 'error', 'INVALID_PAYLOAD', 'message', 'destination cell and scene coordinates are required.');
  end if;

  select *
  into v_encounter
  from public.odyssey_combat_encounters
  where id = v_encounter_id
    and status = 'active'
    and ended_at is null
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'ENCOUNTER_NOT_ACTIVE', 'message', 'Encounter is not active.');
  end if;

  select *
  into v_entry
  from public.odyssey_initiative_entries
  where encounter_id = v_encounter_id
    and character_id = v_character_id
    and is_active = true
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'PARTICIPANT_NOT_FOUND', 'message', 'Participant was not found.');
  end if;

  v_control := public.odyssey_can_control_character(v_character_id, v_actor_player_id, v_actor_is_gm);
  if coalesce((v_control->>'allowed')::boolean, false) = false then
    return jsonb_build_object('ok', false, 'error', 'CONTROL_DENIED', 'message', 'You cannot control this participant.');
  end if;

  if v_encounter.active_entry_id is distinct from v_entry.id then
    return jsonb_build_object(
      'ok', false,
      'error', 'NOT_CURRENT_TURN',
      'message', 'It is not this participant''s turn.',
      'runtime', public.odyssey_build_combat_runtime(v_encounter_id, v_actor_player_id, v_actor_is_gm, v_actor_is_gm, 5)
    );
  end if;

  if v_expected_state_version is not null
     and coalesce(v_encounter.state_version, 0) <> v_expected_state_version then
    return jsonb_build_object(
      'ok', false,
      'error', 'STATE_VERSION_CONFLICT',
      'message', 'Combat state changed. Reload authoritative runtime.',
      'state_version', coalesce(v_encounter.state_version, 0),
      'runtime', public.odyssey_build_combat_runtime(v_encounter_id, v_actor_player_id, v_actor_is_gm, v_actor_is_gm, 5)
    );
  end if;

  if v_expected_movement_version is not null
     and coalesce(v_entry.movement_version, 0) <> v_expected_movement_version then
    return jsonb_build_object(
      'ok', false,
      'error', 'STATE_VERSION_CONFLICT',
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
      'error', 'TACTICAL_GRID_NOT_SYNCED',
      'message', 'The tactical grid has not been synced by the GM yet.'
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
      'error', 'POSITION_NOT_SYNCED',
      'message', 'This token position has not been synced by the GM yet.'
    );
  end if;

  if v_token_id <> '' and v_position.token_id <> v_token_id then
    return jsonb_build_object(
      'ok', false,
      'error', 'STATE_VERSION_CONFLICT',
      'message', 'Token position changed. Reload authoritative runtime.',
      'runtime', public.odyssey_build_combat_runtime(v_encounter_id, v_actor_player_id, v_actor_is_gm, v_actor_is_gm, 5)
    );
  end if;

  v_prev_cell_q := v_position.cell_q;
  v_prev_cell_r := v_position.cell_r;
  v_prev_scene_x := v_position.scene_x;
  v_prev_scene_y := v_position.scene_y;

  v_distance_cells := public.odyssey_tactical_distance_cells(
    v_grid.grid_type,
    v_grid.distance_mode,
    v_position.cell_q,
    v_position.cell_r,
    v_dest_q,
    v_dest_r
  );
  v_move_cost_m := v_distance_cells * greatest(coalesce(v_grid.meters_per_cell, 1), 1);

  if coalesce(v_entry.move_current, 0) < v_move_cost_m then
    return jsonb_build_object(
      'ok', false,
      'error', 'MOVE_NOT_AVAILABLE',
      'message', 'Not enough MOVE is available.',
      'distance_cells', v_distance_cells,
      'move_cost_m', v_move_cost_m,
      'move_current', coalesce(v_entry.move_current, 0),
      'runtime', public.odyssey_build_combat_runtime(v_encounter_id, v_actor_player_id, v_actor_is_gm, v_actor_is_gm, 5)
    );
  end if;

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

  update public.odyssey_combat_positions
  set
    token_id = coalesce(nullif(v_token_id, ''), token_id),
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

grant execute on function public.odyssey_tactical_distance_cells(text, text, integer, integer, integer, integer) to anon, authenticated;
grant execute on function public.combat_sync_positions_from_owlbear(jsonb) to anon, authenticated;
grant execute on function public.combat_move_character(jsonb) to anon, authenticated;
