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

  if v_existing.id is not null then
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
