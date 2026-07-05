-- Odyssey System: Phase 3E.0.1
-- Fix statement-timeout risk in combat_start_encounter by resolving the
-- candidate roster + Reaction values only once before encounter creation.

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
  v_excluded_character_ids jsonb := coalesce(p_payload->'excluded_character_ids', '[]'::jsonb);
  v_existing public.odyssey_combat_encounters;
  v_encounter_id uuid := null;
  v_candidates jsonb := '[]'::jsonb;
  v_candidate_count integer := 0;
  v_missing_reaction_character_id uuid := null;
  v_missing_reaction_display_name text := '';
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

  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'token_id', candidate.token_id,
          'token_name', candidate.token_name,
          'character_id', candidate.character_id,
          'character_bucket', candidate.character_bucket,
          'reaction_value', candidate.reaction_value
        )
        order by candidate.character_id
      ),
      '[]'::jsonb
    ),
    count(*),
    (
      array_agg(candidate.character_id order by candidate.character_id)
      filter (where candidate.reaction_value is null)
    )[1]
  into
    v_candidates,
    v_candidate_count,
    v_missing_reaction_character_id
  from (
    select distinct on (t.character_id)
      t.token_id,
      t.token_name,
      t.character_id,
      c.character_bucket,
      public.odyssey_get_character_reaction_value_strict(t.character_id) as reaction_value
    from public.odyssey_token_links t
    join public.odyssey_characters c on c.id = t.character_id
    where t.campaign_id = v_campaign_id
      and t.room_id = v_room_id
      and t.scene_id = v_scene_id
      and t.is_active = true
      and coalesce(c.is_deleted, false) = false
      and c.character_bucket in ('player', 'npc_active')
      and not exists (
        select 1
        from jsonb_array_elements_text(v_excluded_character_ids) as excluded(character_id)
        where public.odyssey_try_parse_uuid(excluded.character_id) = t.character_id
      )
    order by t.character_id, t.updated_at desc, t.created_at desc, t.id desc
  ) candidate;

  if v_candidate_count = 0 then
    return jsonb_build_object(
      'ok', false,
      'error', 'NO_PARTICIPANTS',
      'message', 'No linked, eligible characters remain for this scene.'
    );
  end if;

  if v_missing_reaction_character_id is not null then
    v_missing_reaction_display_name := public.odyssey_character_display_name(v_missing_reaction_character_id);
    return jsonb_build_object(
      'ok', false,
      'error', 'REACTION_UNAVAILABLE',
      'message', v_missing_reaction_display_name
        || ' has no Reaction attribute in effective stats; combat cannot start.',
      'character_id', v_missing_reaction_character_id
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
  select
    v_encounter_id,
    candidate.character_id,
    candidate.roll_value + candidate.reaction_value,
    candidate.reaction_value,
    candidate.roll_value,
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
      where hidden.token_id = candidate.token_id
    ),
    1,
    0,
    0
  from (
    select
      entry.token_id,
      entry.character_id,
      coalesce(entry.reaction_value, 0) as reaction_value,
      floor(random() * 20 + 1)::integer as roll_value
    from jsonb_to_recordset(v_candidates) as entry(
      token_id text,
      token_name text,
      character_id uuid,
      character_bucket text,
      reaction_value integer
    )
  ) candidate
  on conflict on constraint odyssey_initiative_entries_encounter_character_key do nothing;

  perform public.odyssey_reroll_full_initiative_ties(v_encounter_id);

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
