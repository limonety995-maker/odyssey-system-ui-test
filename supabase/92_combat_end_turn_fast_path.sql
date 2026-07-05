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
