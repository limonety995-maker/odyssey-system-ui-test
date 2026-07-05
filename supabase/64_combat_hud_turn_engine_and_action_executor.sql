-- Odyssey System: Combat HUD turn engine and action executor
-- Stage 64: encounter lifecycle, runtime, action->move, move spend, server-side executor.

create or replace function public.odyssey_get_character_reaction_value(
  p_character_id uuid
)
returns integer
language plpgsql
stable
as $$
declare
  v_effective jsonb := '{}'::jsonb;
begin
  if p_character_id is null then
    return 0;
  end if;

  v_effective := public.get_effective_character_stats(p_character_id);
  return coalesce(
    nullif(jsonb_extract_path_text(v_effective, 'attribute_values', 'reaction'), '')::integer,
    0
  );
end;
$$;

create or replace function public.odyssey_character_has_active_effect_flag(
  p_character_id uuid,
  p_flag text
)
returns boolean
language sql
stable
as $$
  select exists(
    select 1
    from public.odyssey_character_effects e
    where e.character_id = p_character_id
      and e.is_active = true
      and coalesce(nullif(e.data#>>array['flags', p_flag], '')::boolean, false)
  )
$$;

create or replace function public.odyssey_get_active_encounter(
  p_campaign_id text,
  p_room_id text,
  p_scene_id text
)
returns public.odyssey_combat_encounters
language sql
stable
as $$
  select e.*
  from public.odyssey_combat_encounters e
  where e.campaign_id = coalesce(p_campaign_id, '')
    and e.room_id = coalesce(p_room_id, '')
    and e.scene_id = coalesce(p_scene_id, '')
    and e.status = 'active'
    and e.ended_at is null
  order by e.created_at desc, e.id desc
  limit 1
$$;

create or replace function public.odyssey_validate_combat_versions(
  p_encounter_id uuid,
  p_expected_encounter_version integer default null,
  p_character_id uuid default null,
  p_expected_character_state_version integer default null
)
returns jsonb
language plpgsql
stable
as $$
declare
  v_encounter_version integer := 0;
  v_character_version integer := 0;
begin
  if p_encounter_id is not null then
    select coalesce(state_version, 0)
    into v_encounter_version
    from public.odyssey_combat_encounters
    where id = p_encounter_id;

    if p_expected_encounter_version is not null
       and v_encounter_version <> p_expected_encounter_version then
      return jsonb_build_object(
        'ok', false,
        'error', 'STATE_VERSION_CONFLICT',
        'message', 'Combat state changed. Reload authoritative runtime.',
        'encounter_state_version', v_encounter_version
      );
    end if;
  end if;

  if p_character_id is not null then
    select coalesce(state_version, active_combat_state_version, 0)
    into v_character_version
    from public.odyssey_character_combat_state s
    right join public.odyssey_characters c on c.id = p_character_id and s.character_id = c.id
    where c.id = p_character_id;

    if p_expected_character_state_version is not null
       and v_character_version <> p_expected_character_state_version then
      return jsonb_build_object(
        'ok', false,
        'error', 'STATE_VERSION_CONFLICT',
        'message', 'Combat state changed. Reload authoritative runtime.',
        'encounter_state_version', v_encounter_version,
        'character_state_version', v_character_version
      );
    end if;
  end if;

  return jsonb_build_object(
    'ok', true,
    'encounter_state_version', v_encounter_version,
    'character_state_version', v_character_version
  );
end;
$$;

create or replace function public.odyssey_combat_log_insert(
  p_campaign_id text default '',
  p_room_id text default '',
  p_scene_id text default '',
  p_encounter_id uuid default null,
  p_round_number integer default null,
  p_actor_character_id uuid default null,
  p_target_character_id uuid default null,
  p_owner_character_id uuid default null,
  p_visibility text default 'public',
  p_event_type text default 'system',
  p_message text default '',
  p_data jsonb default '{}'::jsonb,
  p_public_data jsonb default '{}'::jsonb,
  p_created_by text default ''
)
returns uuid
language plpgsql
as $$
declare
  v_log_id uuid := null;
begin
  insert into public.odyssey_combat_log (
    campaign_id,
    room_id,
    scene_id,
    encounter_id,
    round_number,
    actor_character_id,
    target_character_id,
    owner_character_id,
    visibility,
    event_type,
    message,
    data,
    public_data,
    created_by
  )
  values (
    coalesce(p_campaign_id, ''),
    coalesce(p_room_id, ''),
    coalesce(p_scene_id, ''),
    p_encounter_id,
    p_round_number,
    p_actor_character_id,
    p_target_character_id,
    p_owner_character_id,
    case
      when coalesce(p_visibility, 'public') in ('public', 'owner_only', 'gm_only') then coalesce(p_visibility, 'public')
      else 'public'
    end,
    coalesce(p_event_type, 'system'),
    coalesce(p_message, ''),
    coalesce(p_data, '{}'::jsonb),
    coalesce(p_public_data, '{}'::jsonb),
    coalesce(p_created_by, '')
  )
  returning id into v_log_id;

  perform public.odyssey_trim_combat_log(p_encounter_id, p_room_id);
  return v_log_id;
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
begin
  if p_encounter_id is null then
    return jsonb_build_object(
      'ok', true,
      'encounter', null,
      'current_turn', null,
      'visible_participants', '[]'::jsonb,
      'viewer_controlled_character_ids', '[]'::jsonb,
      'log', '[]'::jsonb,
      'state_version', 0
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
    'state_version', coalesce(v_encounter.state_version, 0)
  );
end;
$$;

create or replace function public.odyssey_increment_encounter_state_version(
  p_encounter_id uuid
)
returns integer
language plpgsql
as $$
declare
  v_version integer := 0;
begin
  update public.odyssey_combat_encounters
  set
    state_version = coalesce(state_version, 0) + 1,
    last_transition_at = timezone('utc', now())
  where id = p_encounter_id
  returning state_version into v_version;

  return coalesce(v_version, 0);
end;
$$;

create or replace function public.odyssey_start_next_eligible_turn(
  p_encounter_id uuid
)
returns jsonb
language plpgsql
as $$
declare
  v_encounter public.odyssey_combat_encounters%rowtype;
  v_entry_ids uuid[] := array[]::uuid[];
  v_entry_count integer := 0;
  v_current_pos integer := -1;
  v_candidate_pos integer := -1;
  v_loops integer := 0;
  v_now timestamptz := timezone('utc', now());
  v_candidate public.odyssey_initiative_entries%rowtype;
  v_refresh jsonb := '{}'::jsonb;
  v_skip_turn boolean := false;
  v_wrapped boolean := false;
  v_round_for_candidate integer := 1;
begin
  select *
  into v_encounter
  from public.odyssey_combat_encounters
  where id = p_encounter_id
  for update;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'error', 'ENCOUNTER_NOT_FOUND',
      'message', 'Encounter was not found.'
    );
  end if;

  if v_encounter.status <> 'active' or v_encounter.ended_at is not null then
    return jsonb_build_object(
      'ok', false,
      'error', 'ENCOUNTER_NOT_ACTIVE',
      'message', 'Encounter is not active.'
    );
  end if;

  select coalesce(array_agg(e.id order by e.order_index, e.created_at, e.id), array[]::uuid[])
  into v_entry_ids
  from public.odyssey_initiative_entries e
  where e.encounter_id = p_encounter_id
    and e.is_active = true;

  v_entry_count := cardinality(v_entry_ids);
  if v_entry_count = 0 then
    update public.odyssey_combat_encounters
    set
      active_entry_id = null,
      active_character_id = null
    where id = p_encounter_id;

    perform public.odyssey_increment_encounter_state_version(p_encounter_id);

    return jsonb_build_object(
      'ok', true,
      'encounter_id', p_encounter_id,
      'active_entry', null
    );
  end if;

  if v_encounter.active_entry_id is not null then
    select ordinality - 1
    into v_current_pos
    from unnest(v_entry_ids) with ordinality as t(entry_id, ordinality)
    where t.entry_id = v_encounter.active_entry_id
    limit 1;
  end if;

  loop
    exit when v_loops >= v_entry_count + 1;
    v_candidate_pos := coalesce(v_current_pos, -1) + 1;
    if v_candidate_pos >= v_entry_count then
      v_candidate_pos := 0;
      v_wrapped := true;
      update public.odyssey_combat_encounters
      set current_round = current_round + 1
      where id = p_encounter_id
      returning current_round into v_round_for_candidate;
    else
      v_round_for_candidate := v_encounter.current_round;
    end if;

    select *
    into v_candidate
    from public.odyssey_initiative_entries e
    where e.id = v_entry_ids[v_candidate_pos + 1]
    for update;

    if not found then
      v_current_pos := v_candidate_pos;
      v_loops := v_loops + 1;
      continue;
    end if;

    if v_candidate.joined_round > v_round_for_candidate then
      v_current_pos := v_candidate_pos;
      v_loops := v_loops + 1;
      continue;
    end if;

    update public.odyssey_initiative_entries
    set
      action_current = action_max,
      move_current = move_max,
      reaction_action_current = reaction_action_max,
      action_converted_to_move = false,
      turn_version = coalesce(turn_version, 0) + 1,
      last_turn_started_at = v_now
    where id = v_candidate.id
    returning * into v_candidate;

    perform public.advance_character_effects(v_candidate.character_id);
    v_refresh := public.odyssey_refresh_character_combat_state(v_candidate.character_id);

    v_skip_turn := public.odyssey_character_has_active_effect_flag(v_candidate.character_id, 'skip_turn');

    if coalesce((v_refresh->>'ok')::boolean, false) = true then
      if coalesce((v_refresh->'combat_state'->>'is_alive')::boolean, true) = false then
        update public.odyssey_initiative_entries
        set
          is_active = false,
          removed_at = v_now,
          removed_reason = 'dead'
        where id = v_candidate.id;

        perform public.odyssey_combat_log_insert(
          v_encounter.campaign_id,
          v_encounter.room_id,
          v_encounter.scene_id,
          v_encounter.id,
          v_round_for_candidate,
          null,
          v_candidate.character_id,
          v_candidate.character_id,
          'gm_only',
          'system',
          public.odyssey_character_display_name(v_candidate.character_id) || ' is removed from initiative because they are dead.',
          jsonb_build_object('reason', 'dead', 'character_id', v_candidate.character_id),
          jsonb_build_object('reason', 'dead'),
          'system'
        );

        v_current_pos := v_candidate_pos;
        v_loops := v_loops + 1;
        continue;
      end if;

      if coalesce((v_refresh->'combat_state'->>'is_conscious')::boolean, true) = false or v_skip_turn then
        perform public.odyssey_combat_log_insert(
          v_encounter.campaign_id,
          v_encounter.room_id,
          v_encounter.scene_id,
          v_encounter.id,
          v_round_for_candidate,
          null,
          v_candidate.character_id,
          v_candidate.character_id,
          case when v_candidate.hide_from_initiative_ui then 'gm_only' else 'public' end,
          'turn_skipped',
          public.odyssey_character_display_name(v_candidate.character_id) || ' cannot act this turn.',
          jsonb_build_object(
            'reason', case when v_skip_turn then 'skip_turn' else 'unconscious' end,
            'character_id', v_candidate.character_id
          ),
          jsonb_build_object(
            'reason', case when v_skip_turn then 'skip_turn' else 'unconscious' end
          ),
          'system'
        );

        v_current_pos := v_candidate_pos;
        v_loops := v_loops + 1;
        continue;
      end if;
    end if;

    update public.odyssey_combat_encounters
    set
      active_entry_id = v_candidate.id,
      active_character_id = v_candidate.character_id,
      current_round = v_round_for_candidate,
      last_transition_at = v_now
    where id = p_encounter_id;

    perform public.odyssey_increment_encounter_state_version(p_encounter_id);

    perform public.odyssey_combat_log_insert(
      v_encounter.campaign_id,
      v_encounter.room_id,
      v_encounter.scene_id,
      v_encounter.id,
      v_round_for_candidate,
      v_candidate.character_id,
      null,
      v_candidate.character_id,
      case when v_candidate.hide_from_initiative_ui then 'gm_only' else 'public' end,
      'turn_started',
      public.odyssey_character_display_name(v_candidate.character_id) || ' starts their turn.',
      jsonb_build_object(
        'initiative_entry_id', v_candidate.id,
        'character_id', v_candidate.character_id,
        'wrapped', v_wrapped
      ),
      jsonb_build_object(
        'initiative_entry_id', v_candidate.id,
        'character_id', v_candidate.character_id,
        'wrapped', v_wrapped
      ),
      'system'
    );

    return jsonb_build_object(
      'ok', true,
      'encounter_id', p_encounter_id,
      'active_entry_id', v_candidate.id,
      'active_character_id', v_candidate.character_id,
      'current_round', v_round_for_candidate
    );
  end loop;

  update public.odyssey_combat_encounters
  set
    active_entry_id = null,
    active_character_id = null
  where id = p_encounter_id;

  perform public.odyssey_increment_encounter_state_version(p_encounter_id);

  return jsonb_build_object(
    'ok', true,
    'encounter_id', p_encounter_id,
    'active_entry_id', null,
    'active_character_id', null,
    'message', 'No eligible turn target was found.'
  );
end;
$$;

create or replace function public.combat_get_active_runtime(
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
stable
as $$
declare
  v_campaign_id text := coalesce(nullif(trim(coalesce(p_payload->>'campaign_id', '')), ''), '');
  v_room_id text := coalesce(nullif(trim(coalesce(p_payload->>'room_id', '')), ''), '');
  v_scene_id text := coalesce(nullif(trim(coalesce(p_payload->>'scene_id', '')), ''), '');
  v_actor_player_id text := coalesce(nullif(trim(coalesce(p_payload->>'actor_player_id', '')), ''), '');
  v_actor_is_gm boolean := coalesce(nullif(trim(coalesce(p_payload->>'actor_is_gm', '')), '')::boolean, false);
  v_include_hidden boolean := coalesce(nullif(trim(coalesce(p_payload->>'include_hidden', '')), '')::boolean, false);
  v_log_limit integer := greatest(1, least(coalesce(nullif(trim(coalesce(p_payload->>'log_limit', '')), '')::integer, 5), 100));
  v_encounter public.odyssey_combat_encounters;
begin
  if v_room_id = '' or v_scene_id = '' then
    return jsonb_build_object(
      'ok', false,
      'error', 'INVALID_PAYLOAD',
      'message', 'campaign_id, room_id and scene_id are required.'
    );
  end if;

  select *
  into v_encounter
  from public.odyssey_get_active_encounter(v_campaign_id, v_room_id, v_scene_id);

  if not found then
    return jsonb_build_object(
      'ok', true,
      'encounter', null,
      'current_turn', null,
      'visible_participants', '[]'::jsonb,
      'viewer_controlled_character_ids', '[]'::jsonb,
      'log', '[]'::jsonb,
      'state_version', 0
    );
  end if;

  return public.odyssey_build_combat_runtime(
    v_encounter.id,
    v_actor_player_id,
    v_actor_is_gm,
    v_include_hidden,
    v_log_limit
  );
end;
$$;

create or replace function public.combat_start_encounter(
  p_payload jsonb
)
returns jsonb
language plpgsql
as $$
declare
  v_campaign_id text := coalesce(nullif(trim(coalesce(p_payload->>'campaign_id', '')), ''), '');
  v_room_id text := coalesce(nullif(trim(coalesce(p_payload->>'room_id', '')), ''), '');
  v_scene_id text := coalesce(nullif(trim(coalesce(p_payload->>'scene_id', '')), ''), '');
  v_name text := coalesce(nullif(trim(coalesce(p_payload->>'name', '')), ''), 'Combat');
  v_actor_is_gm boolean := coalesce(nullif(trim(coalesce(p_payload->>'actor_is_gm', '')), '')::boolean, false);
  v_actor_player_id text := coalesce(nullif(trim(coalesce(p_payload->>'actor_player_id', '')), ''), '');
  v_hidden_token_ids jsonb := coalesce(p_payload->'hidden_token_ids', '[]'::jsonb);
  v_existing public.odyssey_combat_encounters;
  v_encounter_id uuid := null;
  v_entry record;
  v_roll integer := 0;
  v_reaction integer := 0;
begin
  if not v_actor_is_gm then
    return jsonb_build_object(
      'ok', false,
      'error', 'CONTROL_DENIED',
      'message', 'Only the GM may start an encounter.'
    );
  end if;

  if v_campaign_id = '' or v_room_id = '' or v_scene_id = '' then
    return jsonb_build_object(
      'ok', false,
      'error', 'INVALID_PAYLOAD',
      'message', 'campaign_id, room_id and scene_id are required.'
    );
  end if;

  select *
  into v_existing
  from public.odyssey_get_active_encounter(v_campaign_id, v_room_id, v_scene_id);

  if found then
    return jsonb_build_object(
      'ok', false,
      'error', 'ENCOUNTER_ALREADY_ACTIVE',
      'message', 'An active encounter already exists for this scene.',
      'encounter_id', v_existing.id
    );
  end if;

  insert into public.odyssey_combat_encounters (
    campaign_id,
    room_id,
    scene_id,
    name,
    status,
    current_round,
    created_by,
    started_at,
    last_transition_at
  )
  values (
    v_campaign_id,
    v_room_id,
    v_scene_id,
    v_name,
    'active',
    1,
    coalesce(v_actor_player_id, 'gm'),
    timezone('utc', now()),
    timezone('utc', now())
  )
  returning id into v_encounter_id;

  for v_entry in
    select
      t.token_id,
      t.token_name,
      t.character_id,
      c.character_bucket
    from public.odyssey_token_links t
    join public.odyssey_characters c on c.id = t.character_id
    where t.campaign_id = v_campaign_id
      and t.room_id = v_room_id
      and t.scene_id = v_scene_id
      and t.is_active = true
      and coalesce(c.is_deleted, false) = false
  loop
    if v_entry.character_bucket = 'npc_template' then
      continue;
    end if;

    if v_entry.character_bucket not in ('player', 'npc_active') then
      continue;
    end if;

    v_roll := floor(random() * 20 + 1)::integer;
    v_reaction := public.odyssey_get_character_reaction_value(v_entry.character_id);

    insert into public.odyssey_initiative_entries (
      encounter_id,
      character_id,
      initiative_value,
      reaction_value,
      roll_value,
      bonus_value,
      order_index,
      has_acted,
      is_active,
      action_max,
      action_current,
      move_max,
      move_current,
      reaction_action_max,
      reaction_action_current,
      action_converted_to_move,
      hide_from_initiative_ui,
      joined_round,
      movement_version,
      turn_version
    )
    values (
      v_encounter_id,
      v_entry.character_id,
      v_roll + v_reaction,
      v_reaction,
      v_roll,
      0,
      0,
      false,
      true,
      1,
      1,
      1,
      1,
      0,
      0,
      false,
      exists (
        select 1
        from jsonb_array_elements_text(v_hidden_token_ids) as hidden(token_id)
        where hidden.token_id = v_entry.token_id
      ),
      1,
      0,
      0
    );
  end loop;

  with ranked as (
    select
      e.id,
      row_number() over (
        order by
          e.initiative_value desc,
          case when c.character_bucket = 'player' then 1 else 0 end desc,
          e.roll_value desc,
          e.character_id asc,
          e.id asc
      ) - 1 as next_order_index
    from public.odyssey_initiative_entries e
    join public.odyssey_characters c on c.id = e.character_id
    where e.encounter_id = v_encounter_id
      and e.is_active = true
  )
  update public.odyssey_initiative_entries e
  set order_index = ranked.next_order_index
  from ranked
  where ranked.id = e.id;

  perform public.odyssey_combat_log_insert(
    v_campaign_id,
    v_room_id,
    v_scene_id,
    v_encounter_id,
    1,
    null,
    null,
    null,
    'public',
    'encounter_started',
    'Encounter started.',
    jsonb_build_object('name', v_name),
    jsonb_build_object('name', v_name),
    coalesce(v_actor_player_id, 'gm')
  );

  perform public.odyssey_start_next_eligible_turn(v_encounter_id);

  return public.odyssey_build_combat_runtime(
    v_encounter_id,
    v_actor_player_id,
    true,
    true,
    5
  );
end;
$$;

create or replace function public.combat_add_participant(
  p_payload jsonb
)
returns jsonb
language plpgsql
as $$
declare
  v_encounter_id uuid := public.odyssey_try_parse_uuid(p_payload->>'encounter_id');
  v_token_id text := coalesce(nullif(trim(coalesce(p_payload->>'token_id', '')), ''), '');
  v_character_id uuid := public.odyssey_try_parse_uuid(p_payload->>'character_id');
  v_actor_is_gm boolean := coalesce(nullif(trim(coalesce(p_payload->>'actor_is_gm', '')), '')::boolean, false);
  v_hide boolean := coalesce(nullif(trim(coalesce(p_payload->>'hide_from_initiative_ui', '')), '')::boolean, false);
  v_encounter public.odyssey_combat_encounters%rowtype;
  v_link record;
  v_roll integer := 0;
  v_reaction integer := 0;
begin
  if not v_actor_is_gm then
    return jsonb_build_object('ok', false, 'error', 'CONTROL_DENIED', 'message', 'Only the GM may add participants.');
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

  select
    t.*,
    c.character_bucket
  into v_link
  from public.odyssey_token_links t
  join public.odyssey_characters c on c.id = t.character_id
  where t.room_id = v_encounter.room_id
    and t.scene_id = v_encounter.scene_id
    and t.is_active = true
    and (
      (v_token_id <> '' and t.token_id = v_token_id)
      or (v_character_id is not null and t.character_id = v_character_id)
    )
  order by t.updated_at desc, t.created_at desc, t.id desc
  limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'TOKEN_LINK_REQUIRED', 'message', 'Participant must have an active token link in this scene.');
  end if;

  if v_link.character_bucket = 'npc_template' then
    return jsonb_build_object('ok', false, 'error', 'NPC_TEMPLATE_NOT_ALLOWED', 'message', 'NPC templates cannot join encounters directly.');
  end if;

  if v_link.character_bucket not in ('player', 'npc_active') then
    return jsonb_build_object('ok', false, 'error', 'PARTICIPANT_NOT_ELIGIBLE', 'message', 'Only linked players and active NPCs can join encounters.');
  end if;

  if exists (
    select 1
    from public.odyssey_initiative_entries e
    where e.encounter_id = v_encounter_id
      and e.character_id = v_link.character_id
      and e.is_active = true
  ) then
    return public.odyssey_build_combat_runtime(v_encounter_id, p_payload->>'actor_player_id', true, true, 5);
  end if;

  v_roll := floor(random() * 20 + 1)::integer;
  v_reaction := public.odyssey_get_character_reaction_value(v_link.character_id);

  insert into public.odyssey_initiative_entries (
    encounter_id,
    character_id,
    initiative_value,
    reaction_value,
    roll_value,
    bonus_value,
    order_index,
    has_acted,
    is_active,
    action_max,
    action_current,
    move_max,
    move_current,
    reaction_action_max,
    reaction_action_current,
    action_converted_to_move,
    hide_from_initiative_ui,
    joined_round,
    movement_version,
    turn_version
  )
  values (
    v_encounter_id,
    v_link.character_id,
    v_roll + v_reaction,
    v_reaction,
    v_roll,
    0,
    9999,
    false,
    true,
    1,
    1,
    1,
    1,
    0,
    0,
    false,
    v_hide,
    v_encounter.current_round + 1,
    0,
    0
  );

  with ranked as (
    select
      e.id,
      row_number() over (
        order by
          e.initiative_value desc,
          case when c.character_bucket = 'player' then 1 else 0 end desc,
          e.roll_value desc,
          e.character_id asc,
          e.id asc
      ) - 1 as next_order_index
    from public.odyssey_initiative_entries e
    join public.odyssey_characters c on c.id = e.character_id
    where e.encounter_id = v_encounter_id
      and e.is_active = true
  )
  update public.odyssey_initiative_entries e
  set order_index = ranked.next_order_index
  from ranked
  where ranked.id = e.id;

  perform public.odyssey_increment_encounter_state_version(v_encounter_id);

  return public.odyssey_build_combat_runtime(v_encounter_id, p_payload->>'actor_player_id', true, true, 5);
end;
$$;

create or replace function public.combat_remove_participant(
  p_payload jsonb
)
returns jsonb
language plpgsql
as $$
declare
  v_encounter_id uuid := public.odyssey_try_parse_uuid(p_payload->>'encounter_id');
  v_character_id uuid := public.odyssey_try_parse_uuid(p_payload->>'character_id');
  v_reason text := coalesce(nullif(trim(coalesce(p_payload->>'reason', '')), ''), 'gm_removed');
  v_actor_is_gm boolean := coalesce(nullif(trim(coalesce(p_payload->>'actor_is_gm', '')), '')::boolean, false);
  v_entry public.odyssey_initiative_entries%rowtype;
begin
  if not v_actor_is_gm then
    return jsonb_build_object('ok', false, 'error', 'CONTROL_DENIED', 'message', 'Only the GM may remove participants.');
  end if;

  select *
  into v_entry
  from public.odyssey_initiative_entries e
  where e.encounter_id = v_encounter_id
    and e.character_id = v_character_id
    and e.is_active = true
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'PARTICIPANT_NOT_FOUND', 'message', 'Participant was not found.');
  end if;

  update public.odyssey_initiative_entries
  set
    is_active = false,
    removed_at = timezone('utc', now()),
    removed_reason = v_reason
  where id = v_entry.id;

  if exists (
    select 1
    from public.odyssey_combat_encounters e
    where e.id = v_encounter_id
      and e.active_entry_id = v_entry.id
  ) then
    perform public.odyssey_start_next_eligible_turn(v_encounter_id);
  else
    perform public.odyssey_increment_encounter_state_version(v_encounter_id);
  end if;

  return public.odyssey_build_combat_runtime(v_encounter_id, p_payload->>'actor_player_id', true, true, 5);
end;
$$;

create or replace function public.combat_reorder_initiative(
  p_payload jsonb
)
returns jsonb
language plpgsql
as $$
declare
  v_encounter_id uuid := public.odyssey_try_parse_uuid(p_payload->>'encounter_id');
  v_entries jsonb := coalesce(p_payload->'entries', '[]'::jsonb);
  v_actor_is_gm boolean := coalesce(nullif(trim(coalesce(p_payload->>'actor_is_gm', '')), '')::boolean, false);
  v_item jsonb;
  v_idx integer := 0;
  v_entry_id uuid;
begin
  if not v_actor_is_gm then
    return jsonb_build_object('ok', false, 'error', 'CONTROL_DENIED', 'message', 'Only the GM may reorder initiative.');
  end if;

  if jsonb_typeof(v_entries) <> 'array' then
    return jsonb_build_object('ok', false, 'error', 'INVALID_PAYLOAD', 'message', 'entries must be an array.');
  end if;

  for v_item in
    select value
    from jsonb_array_elements(v_entries)
  loop
    v_entry_id := public.odyssey_try_parse_uuid(coalesce(v_item->>'initiative_entry_id', v_item->>'entry_id'));
    if v_entry_id is not null then
      update public.odyssey_initiative_entries
      set order_index = v_idx
      where id = v_entry_id
        and encounter_id = v_encounter_id;
      v_idx := v_idx + 1;
    end if;
  end loop;

  perform public.odyssey_increment_encounter_state_version(v_encounter_id);
  return public.odyssey_build_combat_runtime(v_encounter_id, p_payload->>'actor_player_id', true, true, 5);
end;
$$;

create or replace function public.combat_end_turn(
  p_payload jsonb
)
returns jsonb
language plpgsql
as $$
declare
  v_encounter_id uuid := public.odyssey_try_parse_uuid(p_payload->>'encounter_id');
  v_actor_player_id text := coalesce(nullif(trim(coalesce(p_payload->>'actor_player_id', '')), ''), '');
  v_actor_is_gm boolean := coalesce(nullif(trim(coalesce(p_payload->>'actor_is_gm', '')), '')::boolean, false);
  v_encounter public.odyssey_combat_encounters%rowtype;
  v_control jsonb := '{}'::jsonb;
  v_versions jsonb := '{}'::jsonb;
  v_next_turn jsonb := '{}'::jsonb;
  v_viewer_character_ids uuid[] := array[]::uuid[];
  v_current_turn jsonb := null;
begin
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

  if v_encounter.active_character_id is null then
    return jsonb_build_object('ok', false, 'error', 'PARTICIPANT_NOT_FOUND', 'message', 'No active turn is set.');
  end if;

  v_control := public.odyssey_can_control_character(v_encounter.active_character_id, v_actor_player_id, v_actor_is_gm);
  if coalesce((v_control->>'allowed')::boolean, false) = false then
    return jsonb_build_object('ok', false, 'error', 'CONTROL_DENIED', 'message', 'You cannot end this turn.');
  end if;

  v_versions := public.odyssey_validate_combat_versions(
    v_encounter_id,
    nullif(trim(coalesce(p_payload->>'expected_encounter_version', '')), '')::integer,
    v_encounter.active_character_id,
    nullif(trim(coalesce(p_payload->>'expected_character_state_version', '')), '')::integer
  );
  if coalesce((v_versions->>'ok')::boolean, false) = false then
    return v_versions;
  end if;

  v_next_turn := public.odyssey_start_next_eligible_turn(v_encounter_id);
  if coalesce((v_next_turn->>'ok')::boolean, false) = false then
    return v_next_turn;
  end if;

  select *
  into v_encounter
  from public.odyssey_combat_encounters
  where id = v_encounter_id;

  if v_actor_player_id <> '' then
    select coalesce(array_agg(c.id), array[]::uuid[])
    into v_viewer_character_ids
    from public.odyssey_characters c
    where coalesce(c.is_deleted, false) = false
      and c.owner_player_id = v_actor_player_id;
  end if;

  if v_encounter.active_entry_id is not null then
    select
      jsonb_build_object(
        'initiative_entry_id', e.id,
        'character_id', c.id,
        'character_key', c.character_key,
        'display_name', public.odyssey_character_display_name(c.id),
        'character_bucket', c.character_bucket,
        'owner_player_id', c.owner_player_id,
        'owner_player_name', c.owner_player_name,
        'initiative_value', e.initiative_value,
        'reaction_value', e.reaction_value,
        'roll_value', e.roll_value,
        'bonus_value', e.bonus_value,
        'order_index', e.order_index,
        'is_active', e.is_active,
        'is_current_turn', true,
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
        'control', public.odyssey_can_control_character(c.id, v_actor_player_id, v_actor_is_gm),
        'state',
          jsonb_build_object(
            'state_version', coalesce(s.state_version, c.active_combat_state_version, 0),
            'status_summary', coalesce(nullif(trim(s.status_summary), ''), public.odyssey_build_character_status_summary(c.id)),
            'is_alive', coalesce(s.is_alive, true),
            'is_conscious', coalesce(s.is_conscious, true)
          )
      )
    into v_current_turn
    from public.odyssey_initiative_entries e
    join public.odyssey_characters c on c.id = e.character_id
    left join public.odyssey_character_combat_state s on s.character_id = c.id
    where e.id = v_encounter.active_entry_id
    limit 1;
  end if;

  return jsonb_build_object(
    'ok', true,
    'partial_refresh_required', true,
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
    'current_turn', v_current_turn,
    'visible_participants',
      case
        when v_current_turn is null then '[]'::jsonb
        else jsonb_build_array(v_current_turn)
      end,
    'viewer_controlled_character_ids', to_jsonb(v_viewer_character_ids),
    'log', '[]'::jsonb,
    'state_version', coalesce(v_encounter.state_version, 0),
    'turn_result', v_next_turn
  );
end;
$$;

create or replace function public.combat_skip_turn(
  p_payload jsonb
)
returns jsonb
language plpgsql
as $$
begin
  return public.combat_end_turn(p_payload);
end;
$$;

create or replace function public.combat_force_next_turn(
  p_payload jsonb
)
returns jsonb
language plpgsql
as $$
declare
  v_actor_is_gm boolean := coalesce(nullif(trim(coalesce(p_payload->>'actor_is_gm', '')), '')::boolean, false);
begin
  if not v_actor_is_gm then
    return jsonb_build_object('ok', false, 'error', 'CONTROL_DENIED', 'message', 'Only the GM may force the next turn.');
  end if;

  return public.combat_end_turn(p_payload);
end;
$$;

create or replace function public.combat_end_encounter(
  p_payload jsonb
)
returns jsonb
language plpgsql
as $$
declare
  v_encounter_id uuid := public.odyssey_try_parse_uuid(p_payload->>'encounter_id');
  v_actor_is_gm boolean := coalesce(nullif(trim(coalesce(p_payload->>'actor_is_gm', '')), '')::boolean, false);
  v_encounter public.odyssey_combat_encounters%rowtype;
begin
  if not v_actor_is_gm then
    return jsonb_build_object('ok', false, 'error', 'CONTROL_DENIED', 'message', 'Only the GM may end the encounter.');
  end if;

  update public.odyssey_combat_encounters
  set
    status = 'finished',
    ended_at = timezone('utc', now()),
    active_entry_id = null,
    active_character_id = null
  where id = v_encounter_id
  returning * into v_encounter;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'ENCOUNTER_NOT_FOUND', 'message', 'Encounter was not found.');
  end if;

  perform public.odyssey_increment_encounter_state_version(v_encounter.id);

  return jsonb_build_object(
    'ok', true,
    'encounter_id', v_encounter.id,
    'status', v_encounter.status,
    'ended_at', v_encounter.ended_at
  );
end;
$$;

create or replace function public.combat_convert_action_to_move(
  p_payload jsonb
)
returns jsonb
language plpgsql
as $$
declare
  v_encounter_id uuid := public.odyssey_try_parse_uuid(p_payload->>'encounter_id');
  v_character_id uuid := public.odyssey_try_parse_uuid(p_payload->>'character_id');
  v_actor_player_id text := coalesce(nullif(trim(coalesce(p_payload->>'actor_player_id', '')), ''), '');
  v_actor_is_gm boolean := coalesce(nullif(trim(coalesce(p_payload->>'actor_is_gm', '')), '')::boolean, false);
  v_encounter public.odyssey_combat_encounters%rowtype;
  v_entry public.odyssey_initiative_entries%rowtype;
  v_control jsonb := '{}'::jsonb;
  v_versions jsonb := '{}'::jsonb;
begin
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
    return jsonb_build_object('ok', false, 'error', 'NOT_CURRENT_TURN', 'message', 'It is not this participant''s turn.');
  end if;

  v_versions := public.odyssey_validate_combat_versions(
    v_encounter_id,
    nullif(trim(coalesce(p_payload->>'expected_encounter_version', '')), '')::integer,
    v_character_id,
    nullif(trim(coalesce(p_payload->>'expected_character_state_version', '')), '')::integer
  );
  if coalesce((v_versions->>'ok')::boolean, false) = false then
    return v_versions;
  end if;

  if coalesce(v_entry.action_current, 0) <= 0 then
    return jsonb_build_object('ok', false, 'error', 'ACTION_NOT_AVAILABLE', 'message', 'No ACTION is available.');
  end if;

  if coalesce(v_entry.move_current, 0) <> 0 then
    return jsonb_build_object('ok', false, 'error', 'MOVE_NOT_EMPTY', 'message', 'MOVE can only be restored when it is empty.');
  end if;

  if coalesce(v_entry.action_converted_to_move, false) then
    return jsonb_build_object('ok', false, 'error', 'ACTION_ALREADY_CONVERTED', 'message', 'ACTION was already converted into MOVE this turn.');
  end if;

  update public.odyssey_initiative_entries
  set
    action_current = greatest(action_current - 1, 0),
    move_current = move_max,
    action_converted_to_move = true,
    turn_version = coalesce(turn_version, 0) + 1
  where id = v_entry.id;

  perform public.odyssey_increment_encounter_state_version(v_encounter_id);

  return public.odyssey_build_combat_runtime(v_encounter_id, v_actor_player_id, v_actor_is_gm, v_actor_is_gm, 5);
end;
$$;

create or replace function public.combat_spend_move(
  p_payload jsonb
)
returns jsonb
language plpgsql
as $$
declare
  v_encounter_id uuid := public.odyssey_try_parse_uuid(p_payload->>'encounter_id');
  v_character_id uuid := public.odyssey_try_parse_uuid(p_payload->>'character_id');
  v_actor_player_id text := coalesce(nullif(trim(coalesce(p_payload->>'actor_player_id', '')), ''), '');
  v_actor_is_gm boolean := coalesce(nullif(trim(coalesce(p_payload->>'actor_is_gm', '')), '')::boolean, false);
  v_move_cost integer := greatest(coalesce(nullif(trim(coalesce(p_payload->>'move_cost', '')), '')::integer, 1), 0);
  v_entry public.odyssey_initiative_entries%rowtype;
  v_encounter public.odyssey_combat_encounters%rowtype;
  v_control jsonb := '{}'::jsonb;
begin
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
    return jsonb_build_object('ok', false, 'error', 'NOT_CURRENT_TURN', 'message', 'It is not this participant''s turn.');
  end if;

  if coalesce(v_entry.move_current, 0) < v_move_cost then
    return jsonb_build_object('ok', false, 'error', 'MOVE_NOT_AVAILABLE', 'message', 'Not enough MOVE is available.');
  end if;

  update public.odyssey_initiative_entries
  set
    move_current = greatest(move_current - v_move_cost, 0),
    movement_version = coalesce(movement_version, 0) + 1
  where id = v_entry.id;

  perform public.odyssey_increment_encounter_state_version(v_encounter_id);

  return jsonb_build_object(
    'ok', true,
    'encounter_id', v_encounter_id,
    'character_id', v_character_id,
    'move_cost', v_move_cost
  );
end;
$$;

create or replace function public.odyssey_get_combat_action_cost_context(
  p_encounter_id uuid,
  p_character_id uuid,
  p_action_kind text,
  p_source_type text default null,
  p_source_id uuid default null,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
stable
as $$
declare
  v_action_kind text := lower(trim(coalesce(p_action_kind, '')));
  v_source_type text := lower(trim(coalesce(p_source_type, '')));
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_action_cost integer := 0;
  v_move_cost integer := 0;
  v_is_free boolean := false;
  v_def_data jsonb := '{}'::jsonb;
begin
  case v_action_kind
    when 'attack' then
      v_action_cost := 1;
    when 'reload' then
      v_move_cost := 1;
    when 'move' then
      v_move_cost := greatest(coalesce(nullif(trim(coalesce(v_payload->>'move_cost', '')), '')::integer, 1), 0);
    when 'ability' then
      select coalesce(a.data, '{}'::jsonb)
      into v_def_data
      from public.odyssey_character_abilities a
      where a.id = p_source_id
      limit 1;
      v_action_cost := coalesce(nullif(trim(coalesce(v_def_data#>>'{combat_cost,action_cost}', v_def_data->>'action_cost', '1')), '')::integer, 1);
      v_move_cost := coalesce(nullif(trim(coalesce(v_def_data#>>'{combat_cost,move_cost}', v_def_data->>'move_cost', '0')), '')::integer, 0);
    when 'perk' then
      select coalesce(perk.effect_data, '{}'::jsonb)
      into v_def_data
      from public.odyssey_character_perks owned
      join public.odyssey_perk_defs perk on perk.id = owned.perk_def_id
      where owned.id = p_source_id
      limit 1;
      v_action_cost := coalesce(nullif(trim(coalesce(v_def_data#>>'{combat_cost,action_cost}', v_def_data->>'action_cost', '1')), '')::integer, 1);
      v_move_cost := coalesce(nullif(trim(coalesce(v_def_data#>>'{combat_cost,move_cost}', v_def_data->>'move_cost', '0')), '')::integer, 0);
    when 'item' then
      select coalesce(i.data, '{}'::jsonb)
      into v_def_data
      from public.odyssey_character_items i
      where i.id = p_source_id
      limit 1;
      v_action_cost := coalesce(nullif(trim(coalesce(v_def_data#>>'{combat_cost,action_cost}', v_def_data->>'action_cost', '1')), '')::integer, 1);
      v_move_cost := coalesce(nullif(trim(coalesce(v_def_data#>>'{combat_cost,move_cost}', v_def_data->>'move_cost', '0')), '')::integer, 0);
    else
      v_action_cost := 0;
      v_move_cost := 0;
  end case;

  if coalesce(nullif(trim(coalesce(v_payload->>'is_free', '')), '')::boolean, false) then
    v_is_free := true;
    v_action_cost := 0;
    v_move_cost := 0;
  end if;

  return jsonb_build_object(
    'blocked', false,
    'block_reason', null,
    'action_cost', greatest(v_action_cost, 0),
    'move_cost', greatest(v_move_cost, 0),
    'is_free', v_is_free,
    'applied_modifiers', '[]'::jsonb
  );
end;
$$;

create or replace function public.odyssey_apply_turn_costs(
  p_entry_id uuid,
  p_action_cost integer,
  p_move_cost integer,
  p_use_reaction boolean default false
)
returns public.odyssey_initiative_entries
language plpgsql
as $$
declare
  v_entry public.odyssey_initiative_entries%rowtype;
begin
  update public.odyssey_initiative_entries
  set
    action_current = case
      when coalesce(p_use_reaction, false) then action_current
      else greatest(action_current - greatest(coalesce(p_action_cost, 0), 0), 0)
    end,
    move_current = greatest(move_current - greatest(coalesce(p_move_cost, 0), 0), 0),
    reaction_action_current = case
      when coalesce(p_use_reaction, false) then greatest(reaction_action_current - 1, 0)
      else reaction_action_current
    end
  where id = p_entry_id
  returning * into v_entry;

  return v_entry;
end;
$$;

create or replace function public.combat_grant_reaction_action(
  p_payload jsonb
)
returns jsonb
language plpgsql
as $$
declare
  v_encounter_id uuid := public.odyssey_try_parse_uuid(p_payload->>'encounter_id');
  v_character_id uuid := public.odyssey_try_parse_uuid(p_payload->>'character_id');
  v_actor_is_gm boolean := coalesce(nullif(trim(coalesce(p_payload->>'actor_is_gm', '')), '')::boolean, false);
begin
  if not v_actor_is_gm then
    return jsonb_build_object('ok', false, 'error', 'CONTROL_DENIED', 'message', 'Only the GM may grant reaction actions.');
  end if;

  update public.odyssey_initiative_entries
  set
    reaction_action_max = greatest(coalesce(reaction_action_max, 0), 1),
    reaction_action_current = greatest(coalesce(reaction_action_current, 0), 1)
  where encounter_id = v_encounter_id
    and character_id = v_character_id
    and is_active = true;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'PARTICIPANT_NOT_FOUND', 'message', 'Participant was not found.');
  end if;

  perform public.odyssey_increment_encounter_state_version(v_encounter_id);
  return public.odyssey_build_combat_runtime(v_encounter_id, p_payload->>'actor_player_id', true, true, 5);
end;
$$;

create or replace function public.combat_mark_character_dead(
  p_payload jsonb
)
returns jsonb
language plpgsql
as $$
declare
  v_character_id uuid := public.odyssey_try_parse_uuid(p_payload->>'character_id');
  v_encounter_id uuid := public.odyssey_try_parse_uuid(p_payload->>'encounter_id');
  v_actor_is_gm boolean := coalesce(nullif(trim(coalesce(p_payload->>'actor_is_gm', '')), '')::boolean, false);
  v_effect_id uuid := null;
  v_refresh jsonb := '{}'::jsonb;
begin
  if not v_actor_is_gm then
    return jsonb_build_object('ok', false, 'error', 'CONTROL_DENIED', 'message', 'Only the GM may force a death state.');
  end if;

  if v_character_id is null then
    return jsonb_build_object('ok', false, 'error', 'CHARACTER_NOT_FOUND', 'message', 'character_id is required.');
  end if;

  update public.odyssey_character_effects
  set
    is_active = false,
    updated_at = timezone('utc', now())
  where character_id = v_character_id
    and effect_key = 'gm_marked_dead'
    and is_active = true;

  insert into public.odyssey_character_effects (
    character_id,
    effect_key,
    name,
    description,
    source,
    duration_type,
    rounds_left,
    data,
    is_active,
    created_by
  )
  values (
    v_character_id,
    'gm_marked_dead',
    'Dead',
    'GM-marked dead state.',
    'gm',
    'scene',
    null,
    jsonb_build_object(
      'flags', jsonb_build_object(
        'force_dead', true,
        'skip_turn', true,
        'helpless', true
      ),
      'reason', 'gm_marked_dead'
    ),
    true,
    coalesce(nullif(trim(coalesce(p_payload->>'actor_player_id', '')), ''), 'gm')
  )
  returning id into v_effect_id;

  v_refresh := public.odyssey_refresh_character_combat_state(v_character_id);

  update public.odyssey_initiative_entries
  set
    is_active = false,
    removed_at = timezone('utc', now()),
    removed_reason = 'dead'
  where encounter_id = v_encounter_id
    and character_id = v_character_id
    and is_active = true;

  if exists (
    select 1
    from public.odyssey_combat_encounters e
    join public.odyssey_initiative_entries i on i.id = e.active_entry_id
    where e.id = v_encounter_id
      and i.character_id = v_character_id
  ) then
    perform public.odyssey_start_next_eligible_turn(v_encounter_id);
  else
    perform public.odyssey_increment_encounter_state_version(v_encounter_id);
  end if;

  return jsonb_build_object(
    'ok', true,
    'character_id', v_character_id,
    'effect_id', v_effect_id,
    'combat_state', coalesce(v_refresh->'combat_state', '{}'::jsonb)
  );
end;
$$;

create or replace function public.combat_execute_action(
  p_payload jsonb
)
returns jsonb
language plpgsql
as $$
declare
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_encounter_id uuid := public.odyssey_try_parse_uuid(v_payload->>'encounter_id');
  v_character_id uuid := public.odyssey_try_parse_uuid(v_payload->>'character_id');
  v_kind text := lower(trim(coalesce(v_payload->>'kind', '')));
  v_actor_player_id text := coalesce(nullif(trim(coalesce(v_payload->>'actor_player_id', '')), ''), '');
  v_actor_is_gm boolean := coalesce(nullif(trim(coalesce(v_payload->>'actor_is_gm', '')), '')::boolean, false);
  v_intent jsonb := case when jsonb_typeof(v_payload->'intent') = 'object' then v_payload->'intent' else '{}'::jsonb end;
  v_encounter public.odyssey_combat_encounters%rowtype;
  v_entry public.odyssey_initiative_entries%rowtype;
  v_control jsonb := '{}'::jsonb;
  v_versions jsonb := '{}'::jsonb;
  v_cost jsonb := '{}'::jsonb;
  v_result jsonb := '{}'::jsonb;
  v_action_cost integer := 0;
  v_move_cost integer := 0;
  v_use_reaction boolean := false;
  v_post_refresh jsonb := '{}'::jsonb;
begin
  if v_kind not in ('attack', 'reload', 'ability', 'perk', 'item', 'move') then
    return jsonb_build_object('ok', false, 'error', 'INVALID_ACTION_KIND', 'message', 'Unsupported action kind.');
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
    if coalesce(v_entry.reaction_action_current, 0) > 0 then
      v_use_reaction := true;
    else
      return jsonb_build_object('ok', false, 'error', 'NOT_CURRENT_TURN', 'message', 'It is not this participant''s turn.');
    end if;
  end if;

  v_versions := public.odyssey_validate_combat_versions(
    v_encounter_id,
    nullif(trim(coalesce(v_payload->>'expected_encounter_version', '')), '')::integer,
    v_character_id,
    nullif(trim(coalesce(v_payload->>'expected_character_state_version', '')), '')::integer
  );
  if coalesce((v_versions->>'ok')::boolean, false) = false then
    return v_versions;
  end if;

  v_cost := public.odyssey_get_combat_action_cost_context(
    v_encounter_id,
    v_character_id,
    v_kind,
    case when v_kind in ('ability', 'perk', 'item') then v_kind else null end,
    public.odyssey_try_parse_uuid(coalesce(v_intent->>'character_ability_id', v_intent->>'character_perk_id', v_intent->>'character_item_id')),
    v_intent
  );

  v_action_cost := greatest(coalesce(nullif(trim(coalesce(v_cost->>'action_cost', '')), '')::integer, 0), 0);
  v_move_cost := greatest(coalesce(nullif(trim(coalesce(v_cost->>'move_cost', '')), '')::integer, 0), 0);

  if not v_use_reaction and coalesce(v_entry.action_current, 0) < v_action_cost then
    return jsonb_build_object('ok', false, 'error', 'ACTION_NOT_AVAILABLE', 'message', 'Not enough ACTION is available.');
  end if;

  if coalesce(v_entry.move_current, 0) < v_move_cost then
    return jsonb_build_object('ok', false, 'error', 'MOVE_NOT_AVAILABLE', 'message', 'Not enough MOVE is available.');
  end if;

  if v_use_reaction and coalesce(v_entry.reaction_action_current, 0) <= 0 then
    return jsonb_build_object('ok', false, 'error', 'REACTION_NOT_AVAILABLE', 'message', 'No reaction action is available.');
  end if;

  case v_kind
    when 'attack' then
      v_result := public.perform_attack(
        v_intent
        || jsonb_build_object(
          'encounter_id', v_encounter_id,
          'attacker_character_id', v_character_id
        )
      );
    when 'reload' then
      v_result := public.load_weapon_profile_magazine(v_intent);
    when 'ability' then
      v_result := public.use_ability(v_intent || jsonb_build_object('encounter_id', v_encounter_id));
    when 'perk' then
      v_result := public.use_character_perk(v_intent || jsonb_build_object('encounter_id', v_encounter_id));
    when 'item' then
      v_result := public.use_character_item(v_intent || jsonb_build_object('encounter_id', v_encounter_id));
    when 'move' then
      v_result := public.combat_spend_move(
        jsonb_build_object(
          'encounter_id', v_encounter_id,
          'character_id', v_character_id,
          'actor_player_id', v_actor_player_id,
          'actor_is_gm', v_actor_is_gm,
          'move_cost', v_move_cost
        ) || v_intent
      );
  end case;

  if coalesce((v_result->>'ok')::boolean, false) = false then
    return v_result;
  end if;

  if v_kind <> 'move' then
    perform public.odyssey_apply_turn_costs(v_entry.id, v_action_cost, v_move_cost, v_use_reaction);
    perform public.odyssey_increment_encounter_state_version(v_encounter_id);
  end if;

  v_post_refresh := public.odyssey_refresh_character_combat_state(v_character_id);

  if v_kind = 'perk'
     and coalesce(nullif(v_result->>'force_end_turn', '')::boolean, false)
     and not v_use_reaction then
    perform public.odyssey_start_next_eligible_turn(v_encounter_id);
  end if;

  return jsonb_build_object(
    'ok', true,
    'encounter_state_version', (select state_version from public.odyssey_combat_encounters where id = v_encounter_id),
    'character_state_version', coalesce((v_post_refresh->>'state_version')::integer, null),
    'spent',
      jsonb_build_object(
        'action_cost', v_action_cost,
        'move_cost', v_move_cost,
        'used_reaction', v_use_reaction
      ),
    'result', v_result,
    'acting_combat_state', coalesce(v_post_refresh->'combat_state', '{}'::jsonb),
    'runtime', public.odyssey_build_combat_runtime(v_encounter_id, v_actor_player_id, v_actor_is_gm, v_actor_is_gm, 5)
  );
end;
$$;

grant execute on function public.odyssey_get_character_reaction_value(uuid) to anon, authenticated;
grant execute on function public.odyssey_character_has_active_effect_flag(uuid, text) to anon, authenticated;
grant execute on function public.odyssey_get_active_encounter(text, text, text) to anon, authenticated;
grant execute on function public.odyssey_validate_combat_versions(uuid, integer, uuid, integer) to anon, authenticated;
grant execute on function public.odyssey_combat_log_insert(text, text, text, uuid, integer, uuid, uuid, uuid, text, text, text, jsonb, jsonb, text) to anon, authenticated;
grant execute on function public.odyssey_build_combat_runtime(uuid, text, boolean, boolean, integer) to anon, authenticated;
grant execute on function public.odyssey_increment_encounter_state_version(uuid) to anon, authenticated;
grant execute on function public.odyssey_start_next_eligible_turn(uuid) to anon, authenticated;
grant execute on function public.combat_get_active_runtime(jsonb) to anon, authenticated;
grant execute on function public.combat_start_encounter(jsonb) to anon, authenticated;
grant execute on function public.combat_add_participant(jsonb) to anon, authenticated;
grant execute on function public.combat_remove_participant(jsonb) to anon, authenticated;
grant execute on function public.combat_reorder_initiative(jsonb) to anon, authenticated;
grant execute on function public.combat_end_turn(jsonb) to anon, authenticated;
grant execute on function public.combat_skip_turn(jsonb) to anon, authenticated;
grant execute on function public.combat_force_next_turn(jsonb) to anon, authenticated;
grant execute on function public.combat_end_encounter(jsonb) to anon, authenticated;
grant execute on function public.combat_convert_action_to_move(jsonb) to anon, authenticated;
grant execute on function public.combat_spend_move(jsonb) to anon, authenticated;
grant execute on function public.odyssey_get_combat_action_cost_context(uuid, uuid, text, text, uuid, jsonb) to anon, authenticated;
grant execute on function public.odyssey_apply_turn_costs(uuid, integer, integer, boolean) to anon, authenticated;
grant execute on function public.combat_grant_reaction_action(jsonb) to anon, authenticated;
grant execute on function public.combat_mark_character_dead(jsonb) to anon, authenticated;
grant execute on function public.combat_execute_action(jsonb) to anon, authenticated;
