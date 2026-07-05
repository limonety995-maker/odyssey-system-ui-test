-- Odyssey System: Phase 3E.0 — Combat Sessions Foundation (server gaps only).
--
-- The encounter engine itself already exists (06 schema, 63 ownership, 64 turn
-- engine + executor, 79 start fix, 80 runtime fix). This migration closes the
-- specific gaps required by Phase 3E.0 WITHOUT replacing that engine:
--
--   1. combat_start_encounter (redefined, based on 79):
--      - dedupes multiple token links of one character (newest active link wins;
--        the (encounter_id, character_id) unique constraint made a duplicate
--        link ABORT the whole start before this);
--      - validates Reaction BEFORE creating anything: a character whose
--        effective stats carry no 'reaction' attribute returns a clear
--        REACTION_UNAVAILABLE error instead of a silently-invented 0;
--      - supports `excluded_character_ids` so the GM can uncheck participants;
--      - resolves FULL initiative ties (same total, same player/NPC class,
--        same raw d20) by a server-side reroll among ONLY the tied entries
--        (odyssey_reroll_full_initiative_ties) before ranking.
--   2. perform_attack (redefined, based on 87): when the attacker is an active
--      participant of an active encounter the attack is session-gated SERVER-
--      side regardless of what the client sends: stale expected version →
--      STATE_VERSION_CONFLICT; not the current turn (and no reaction action) →
--      NOT_CURRENT_TURN; MAIN already spent → ACTION_NOT_AVAILABLE. A resolved
--      hit AND a resolved miss both spend MAIN atomically + bump the encounter
--      state_version; a rejected/failed attack spends nothing. Outside a
--      session the legacy behavior is untouched.
--   3. load_weapon_profile_magazine (redefined, based on 42): same server-side
--      gate for MOVE — current participant only, MOVE_NOT_AVAILABLE when spent,
--      spend + version bump ONLY on success. Outside a session — untouched.
--      This also closes the old Character/Inventory reload bypass: the gate
--      lives inside the canonical reload function itself.
--   4. combat_execute_action (patched): its attack/reload branches no longer
--      double-spend — the cost now lives inside perform_attack /
--      load_weapon_profile_magazine themselves, so EVERY path that reaches the
--      real action math pays the cost exactly once. (There is no spoofable
--      "skip costs" flag by design.)
--   5. odyssey_apply_turn_start_effects: the isolated turn-start hook — the
--      single future integration point for cooldown/duration mechanics.
--      odyssey_start_next_eligible_turn is patched to call it.

-- ---------------------------------------------------------------------------
-- 1a. Strict Reaction probe: NULL when the attribute is genuinely absent.
-- ---------------------------------------------------------------------------
create or replace function public.odyssey_get_character_reaction_value_strict(
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
    return null;
  end if;

  v_effective := public.get_effective_character_stats(p_character_id);
  if jsonb_typeof(v_effective->'attribute_values') <> 'object'
     or not (v_effective->'attribute_values' ? 'reaction') then
    return null;
  end if;

  return nullif(jsonb_extract_path_text(v_effective, 'attribute_values', 'reaction'), '')::integer;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1b. Full-tie reroll: reroll d20 ONLY among entries whose (total, class, raw
--     d20) all match, repeating (bounded) until no full tie remains.
-- ---------------------------------------------------------------------------
create or replace function public.odyssey_reroll_full_initiative_ties(
  p_encounter_id uuid
)
returns integer
language plpgsql
as $$
declare
  v_rerolled integer := 0;
  v_pass integer := 0;
  v_row record;
  v_roll integer := 0;
begin
  loop
    v_pass := v_pass + 1;
    exit when v_pass > 10; -- bounded: a persistent tie falls back to the deterministic ranking below

    if not exists (
      select 1
      from public.odyssey_initiative_entries e
      join public.odyssey_characters c on c.id = e.character_id
      where e.encounter_id = p_encounter_id
        and e.is_active = true
      group by e.initiative_value, (c.character_bucket = 'player'), e.roll_value
      having count(*) > 1
    ) then
      exit;
    end if;

    for v_row in
      select e.id, e.reaction_value
      from public.odyssey_initiative_entries e
      join public.odyssey_characters c on c.id = e.character_id
      where e.encounter_id = p_encounter_id
        and e.is_active = true
        and (e.initiative_value, (c.character_bucket = 'player'), e.roll_value) in (
          select e2.initiative_value, (c2.character_bucket = 'player'), e2.roll_value
          from public.odyssey_initiative_entries e2
          join public.odyssey_characters c2 on c2.id = e2.character_id
          where e2.encounter_id = p_encounter_id
            and e2.is_active = true
          group by e2.initiative_value, (c2.character_bucket = 'player'), e2.roll_value
          having count(*) > 1
        )
    loop
      v_roll := floor(random() * 20 + 1)::integer;
      update public.odyssey_initiative_entries
      set
        roll_value = v_roll,
        initiative_value = v_roll + coalesce(v_row.reaction_value, 0)
      where id = v_row.id;
      v_rerolled := v_rerolled + 1;
    end loop;
  end loop;

  return v_rerolled;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1c. combat_start_encounter — redefined (based on migration 79).
-- ---------------------------------------------------------------------------
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

  -- Validation pass BEFORE anything is created: one candidate per character
  -- (newest active link wins — the safe dedupe rule for multi-link characters)
  -- and every candidate must have a REAL Reaction attribute. Returning an
  -- error here leaves no half-created encounter behind.
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

  -- Full ties (total + class + raw d20 all equal) reroll server-side among
  -- ONLY the tied entries, then rank: total desc → player over NPC → raw d20
  -- desc → deterministic ids as the final stable fallback.
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

-- ---------------------------------------------------------------------------
-- 2a. Active participation probe shared by the attack/reload gates.
-- ---------------------------------------------------------------------------
create or replace function public.odyssey_get_active_participation(
  p_character_id uuid
)
returns jsonb
language plpgsql
as $$
declare
  v_row record;
begin
  if p_character_id is null then
    return null;
  end if;

  select
    e.id as encounter_id,
    e.state_version,
    e.current_round,
    e.active_character_id,
    i.id as entry_id,
    i.action_current,
    i.move_current,
    i.reaction_action_current
  into v_row
  from public.odyssey_initiative_entries i
  join public.odyssey_combat_encounters e on e.id = i.encounter_id
  where i.character_id = p_character_id
    and i.is_active = true
    and e.status = 'active'
    and e.ended_at is null
  order by e.created_at desc, e.id desc
  limit 1
  for update of i, e;

  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'encounter_id', v_row.encounter_id,
    'state_version', v_row.state_version,
    'current_round', v_row.current_round,
    'is_current_turn', v_row.active_character_id is not distinct from p_character_id,
    'entry_id', v_row.entry_id,
    'action_current', coalesce(v_row.action_current, 0),
    'move_current', coalesce(v_row.move_current, 0),
    'reaction_action_current', coalesce(v_row.reaction_action_current, 0)
  );
end;
$$;

-- Post-spend session summary appended to gated attack/reload results.
create or replace function public.odyssey_build_session_cost_summary(
  p_participation jsonb,
  p_used_reaction boolean
)
returns jsonb
language plpgsql
stable
as $$
declare
  v_entry_id uuid := public.odyssey_try_parse_uuid(p_participation->>'entry_id');
  v_encounter_id uuid := public.odyssey_try_parse_uuid(p_participation->>'encounter_id');
  v_action integer := 0;
  v_move integer := 0;
  v_version integer := 0;
begin
  select coalesce(i.action_current, 0), coalesce(i.move_current, 0)
  into v_action, v_move
  from public.odyssey_initiative_entries i
  where i.id = v_entry_id;

  select coalesce(e.state_version, 0)
  into v_version
  from public.odyssey_combat_encounters e
  where e.id = v_encounter_id;

  return jsonb_build_object(
    'encounter_id', v_encounter_id,
    'participant_entry_id', v_entry_id,
    'round', p_participation->'current_round',
    'used_reaction', coalesce(p_used_reaction, false),
    'state_version_before', p_participation->'state_version',
    'state_version_after', v_version,
    'main_available_after', v_action > 0,
    'move_available_after', v_move > 0
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 2b. perform_attack — redefined (based on migration 87) with the session gate.
-- ---------------------------------------------------------------------------
create or replace function public.perform_attack(
  p_payload jsonb
)
returns jsonb
language plpgsql
as $$
declare
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_character_ability_id uuid := public.odyssey_try_parse_uuid(v_payload->>'character_ability_id');
  v_ability_code text := lower(trim(coalesce(v_payload->>'ability_code', '')));
  v_attacker_character_id uuid := public.odyssey_try_parse_uuid(coalesce(v_payload->>'attacker_character_id', v_payload->>'character_id'));
  v_target_character_id uuid := public.odyssey_try_parse_uuid(v_payload->>'target_character_id');
  v_target_body_part_id uuid := public.odyssey_try_parse_uuid(v_payload->>'target_body_part_id');
  v_character_weapon_id uuid := public.odyssey_try_parse_uuid(coalesce(v_payload->>'character_weapon_id', v_payload->>'weapon_id'));
  v_distance_m numeric := greatest(coalesce(nullif(trim(coalesce(v_payload->>'distance_m', '')), '')::numeric, 0), 0);
  v_encounter_id uuid := public.odyssey_try_parse_uuid(v_payload->>'encounter_id');
  v_debug boolean := coalesce(nullif(trim(coalesce(v_payload->>'debug', '')), '')::boolean, false);
  v_lock_state jsonb := '{}'::jsonb;
  v_perk_context_result jsonb := jsonb_build_object(
    'ok', true,
    'attack_accuracy_bonus', 0,
    'ammo_base_damage_multiplier', 1,
    'flags', '{}'::jsonb,
    'perk_modifiers', '[]'::jsonb,
    'consume_effect_ids', '[]'::jsonb
  );
  v_attack_context jsonb := '{}'::jsonb;
  v_existing_bonus integer := 0;
  v_perk_bonus integer := 0;
  v_result jsonb := '{}'::jsonb;
  v_retry_effect jsonb := jsonb_build_object('ok', true, 'applied', false);
  v_post_hooks jsonb := jsonb_build_object(
    'ok', true,
    'attacker_changed', false,
    'target_changed', false,
    'changed_effect_ids', '[]'::jsonb,
    'changed_weapon_ids', '[]'::jsonb
  );
  v_refresh_attacker boolean := false;
  v_refresh_target boolean := false;
  v_target_alive_before boolean := true;
  v_target_alive_after boolean := true;
  v_target_movement_version integer := 0;
  v_finalized jsonb := '{}'::jsonb;
  v_attacker_refresh_result jsonb := '{}'::jsonb;
  v_target_refresh_result jsonb := '{}'::jsonb;
  v_started_at timestamptz := clock_timestamp();
  v_stage_started_at timestamptz := clock_timestamp();
  v_weapon_validation_ms numeric := 0;
  v_damage_apply_ms numeric := 0;
  v_perk_hooks_ms numeric := 0;
  v_final_refresh_attacker_ms numeric := 0;
  v_final_refresh_target_ms numeric := 0;
  v_finalize_result_ms numeric := 0;
  -- Phase 3E.0 session gate state
  v_participation jsonb := null;
  v_expected_session_version integer := nullif(trim(coalesce(v_payload->>'expected_encounter_version', '')), '')::integer;
  v_session_use_reaction boolean := false;
begin
  if v_target_character_id is not null then
    select coalesce(s.is_alive, true)
    into v_target_alive_before
    from public.odyssey_character_combat_state s
    where s.character_id = v_target_character_id;

    if v_encounter_id is not null then
      select coalesce(e.movement_version, 0)
      into v_target_movement_version
      from public.odyssey_initiative_entries e
      where e.encounter_id = v_encounter_id
        and e.character_id = v_target_character_id
        and e.is_active = true
      order by e.updated_at desc, e.id desc
      limit 1;
    end if;
  end if;

  if v_character_ability_id is not null or v_ability_code <> '' then
    return public.odyssey_perform_ability_attack(v_payload);
  end if;

  -- Phase 3E.0: server-authoritative combat-session gate. Looked up from the
  -- ATTACKER'S OWN participation — never from client-sent encounter context —
  -- so removing combat_session/encounter fields from the payload cannot
  -- bypass the action economy while the character is in an active encounter.
  v_participation := public.odyssey_get_active_participation(v_attacker_character_id);
  if v_participation is not null then
    if v_expected_session_version is not null
       and v_expected_session_version <> coalesce((v_participation->>'state_version')::integer, 0) then
      return jsonb_build_object(
        'ok', false,
        'error', 'STATE_VERSION_CONFLICT',
        'message', 'Combat state changed. Reload authoritative runtime.',
        'encounter_state_version', (v_participation->>'state_version')::integer
      );
    end if;

    if coalesce((v_participation->>'is_current_turn')::boolean, false) = false then
      if coalesce((v_participation->>'reaction_action_current')::integer, 0) > 0 then
        v_session_use_reaction := true;
      else
        return jsonb_build_object(
          'ok', false,
          'error', 'NOT_CURRENT_TURN',
          'message', 'It is not this character''s turn.'
        );
      end if;
    end if;

    if not v_session_use_reaction
       and coalesce((v_participation->>'action_current')::integer, 0) < 1 then
      return jsonb_build_object(
        'ok', false,
        'error', 'ACTION_NOT_AVAILABLE',
        'message', 'MAIN action is already spent.'
      );
    end if;
  end if;

  v_stage_started_at := clock_timestamp();

  if v_attacker_character_id is not null and v_character_weapon_id is not null then
    v_lock_state := public.odyssey_get_weapon_lock_state(v_attacker_character_id, v_character_weapon_id);
    if coalesce((v_lock_state->>'locked')::boolean, false)
       or coalesce((v_lock_state->>'actor_attack_locked')::boolean, false) then
      return jsonb_build_object(
        'ok', false,
        'error', coalesce(v_lock_state->>'error', 'WEAPON_LOCKED'),
        'message', coalesce(v_lock_state->>'message', 'Weapon is currently locked.'),
        'character_weapon_id', v_character_weapon_id
      );
    end if;

    v_perk_context_result := public.odyssey_get_character_attack_perk_context(
      v_attacker_character_id,
      v_character_weapon_id,
      v_target_character_id,
      v_target_body_part_id,
      v_distance_m,
      nullif(trim(coalesce(v_payload->>'fire_mode_code', '')), ''),
      nullif(trim(coalesce(v_payload->>'attack_type', '')), ''),
      v_encounter_id
    );

    if coalesce((v_perk_context_result->>'ok')::boolean, false) = false then
      return v_perk_context_result;
    end if;
  end if;

  v_weapon_validation_ms := extract(epoch from (clock_timestamp() - v_stage_started_at)) * 1000.0;

  v_attack_context := case
    when jsonb_typeof(v_payload->'attack_context') = 'object' then v_payload->'attack_context'
    else '{}'::jsonb
  end;
  v_existing_bonus := coalesce(nullif(trim(coalesce(v_attack_context->>'manual_attack_bonus', '')), '')::integer, 0);
  v_perk_bonus := coalesce(nullif(trim(coalesce(v_perk_context_result->>'attack_accuracy_bonus', '')), '')::integer, 0);

  if v_perk_bonus <> 0 then
    v_attack_context := v_attack_context || jsonb_build_object('manual_attack_bonus', v_existing_bonus + v_perk_bonus);
    v_payload := v_payload || jsonb_build_object('attack_context', v_attack_context);
  end if;

  v_payload := v_payload || jsonb_build_object('perk_context', v_perk_context_result - 'ok');

  v_stage_started_at := clock_timestamp();
  v_result := public.odyssey_perform_weapon_attack(v_payload);
  v_damage_apply_ms := extract(epoch from (clock_timestamp() - v_stage_started_at)) * 1000.0;

  if coalesce((v_result->>'ok')::boolean, false) = false then
    return v_result;
  end if;

  -- Phase 3E.0: a RESOLVED attack (hit AND miss identically) spends MAIN (or
  -- the reaction action) atomically with the encounter version bump. Failed /
  -- rejected attacks returned above spend nothing.
  if v_participation is not null then
    perform public.odyssey_apply_turn_costs(
      public.odyssey_try_parse_uuid(v_participation->>'entry_id'),
      1,
      0,
      v_session_use_reaction
    );
    perform public.odyssey_increment_encounter_state_version(
      public.odyssey_try_parse_uuid(v_participation->>'encounter_id')
    );
  end if;

  if jsonb_array_length(coalesce(v_perk_context_result->'consume_effect_ids', '[]'::jsonb)) > 0 then
    update public.odyssey_character_effects e
    set
      is_active = false,
      rounds_left = 0,
      updated_at = timezone('utc', now())
    where e.character_id = v_attacker_character_id
      and e.id in (
        select public.odyssey_try_parse_uuid(value)
        from jsonb_array_elements_text(coalesce(v_perk_context_result->'consume_effect_ids', '[]'::jsonb)) value
      );
    v_refresh_attacker := true;
  end if;

  if v_target_character_id is not null then
    v_target_alive_after := coalesce(
      nullif(v_result#>>'{target_state,is_alive}', '')::boolean,
      nullif(v_result#>>'{target_state,combat_state,is_alive}', '')::boolean,
      v_target_alive_before
    );
  end if;

  v_stage_started_at := clock_timestamp();
  v_post_hooks := public.odyssey_apply_perk_post_attack_hooks(
    jsonb_build_object(
      'attacker_character_id', v_attacker_character_id,
      'character_weapon_id', v_character_weapon_id,
      'target_character_id', v_target_character_id,
      'target_movement_version', v_target_movement_version,
      'created_by', coalesce(v_payload->>'actor_token_id', ''),
      'hit', coalesce(v_result->>'hit', 'false'),
      'target_alive_before', v_target_alive_before,
      'target_alive_after', v_target_alive_after
    )
  );
  v_perk_hooks_ms := extract(epoch from (clock_timestamp() - v_stage_started_at)) * 1000.0;

  if not coalesce((v_result->>'hit')::boolean, false) then
    v_retry_effect := public.odyssey_grant_first_time_no_retry_effect(
      v_attacker_character_id,
      v_character_weapon_id,
      v_target_character_id,
      v_target_movement_version,
      coalesce(v_payload->>'actor_token_id', '')
    );
    if coalesce((v_retry_effect->>'applied')::boolean, false) = true then
      v_refresh_attacker := true;
    end if;
  end if;

  if jsonb_array_length(coalesce(v_result->'expired_attack_effects', '[]'::jsonb)) > 0 then
    v_refresh_attacker := true;
  end if;

  if coalesce((v_post_hooks->>'attacker_changed')::boolean, false) then
    v_refresh_attacker := true;
  end if;

  v_refresh_target :=
    coalesce((v_post_hooks->>'target_changed')::boolean, false)
    or coalesce(nullif(jsonb_extract_path_text(v_result, 'damage', 'body_minor_delta'), '')::integer, 0) > 0
    or coalesce(nullif(jsonb_extract_path_text(v_result, 'damage', 'body_serious_delta'), '')::integer, 0) > 0
    or coalesce(nullif(jsonb_extract_path_text(v_result, 'damage', 'body_critical_delta'), '')::integer, 0) > 0
    or coalesce(nullif(jsonb_extract_path_text(v_result, 'damage', 'armor_minor_delta'), '')::integer, 0) > 0
    or coalesce(nullif(jsonb_extract_path_text(v_result, 'damage', 'armor_serious_delta'), '')::integer, 0) > 0
    or coalesce(nullif(jsonb_extract_path_text(v_result, 'damage', 'armor_critical_delta'), '')::integer, 0) > 0;

  v_result := v_result || jsonb_build_object(
    'post_attack_perks',
      jsonb_build_object(
        'consumed_effect_ids', coalesce(v_perk_context_result->'consume_effect_ids', '[]'::jsonb),
        'retry_effect', v_retry_effect,
        'post_hooks', v_post_hooks
      )
  );

  v_stage_started_at := clock_timestamp();
  v_finalized := public.odyssey_finalize_attack_result(v_result, v_target_character_id, v_target_body_part_id);
  v_finalize_result_ms := extract(epoch from (clock_timestamp() - v_stage_started_at)) * 1000.0;

  if v_refresh_target and v_target_character_id is not null then
    v_stage_started_at := clock_timestamp();
    v_target_refresh_result := public.odyssey_refresh_character_combat_state(v_target_character_id);
    v_final_refresh_target_ms := extract(epoch from (clock_timestamp() - v_stage_started_at)) * 1000.0;
    v_finalized := v_finalized || jsonb_build_object(
      'target_state',
      coalesce(v_target_refresh_result->'combat_state', '{}'::jsonb)
    );
  end if;

  if v_refresh_attacker and v_attacker_character_id is not null then
    v_stage_started_at := clock_timestamp();
    v_attacker_refresh_result := public.odyssey_refresh_character_combat_state(v_attacker_character_id);
    v_final_refresh_attacker_ms := extract(epoch from (clock_timestamp() - v_stage_started_at)) * 1000.0;
    v_finalized := v_finalized || jsonb_build_object(
      'attacker_state',
      coalesce(v_attacker_refresh_result->'combat_state', '{}'::jsonb)
    );
  end if;

  if v_participation is not null then
    v_finalized := v_finalized || jsonb_build_object(
      'combat_session',
      public.odyssey_build_session_cost_summary(v_participation, v_session_use_reaction)
    );
  end if;

  if v_debug then
    v_finalized := v_finalized || jsonb_build_object(
      'diagnostics',
      jsonb_build_object(
        'total_ms', extract(epoch from (clock_timestamp() - v_started_at)) * 1000.0,
        'stages',
        jsonb_build_object(
          'weapon_validation_ms', v_weapon_validation_ms,
          'attacker_state_ms', 0,
          'target_state_ms', 0,
          'damage_apply_ms', v_damage_apply_ms,
          'perk_hooks_ms', v_perk_hooks_ms,
          'final_refresh_attacker_ms', v_final_refresh_attacker_ms,
          'final_refresh_target_ms', v_final_refresh_target_ms,
          'finalize_result_ms', v_finalize_result_ms
        )
      )
    );
  end if;

  return v_finalized;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2c. load_weapon_profile_magazine — redefined (based on migration 42) with
--     the MOVE session gate.
-- ---------------------------------------------------------------------------
create or replace function public.load_weapon_profile_magazine(
  p_payload jsonb
)
returns jsonb
language plpgsql
as $$
declare
  v_character_weapon_id uuid := public.odyssey_try_parse_uuid(p_payload->>'character_weapon_id');
  v_profile_id uuid := public.odyssey_try_parse_uuid(p_payload->>'profile_id');
  v_character_magazine_id uuid := public.odyssey_try_parse_uuid(p_payload->>'character_magazine_id');
  v_weapon public.odyssey_character_weapons%rowtype;
  v_target_state_id uuid := null;
  v_affected_weapons uuid[];
  v_item uuid;
  v_magazine public.odyssey_character_magazines%rowtype;
  -- Phase 3E.0 session gate state
  v_participation jsonb := null;
  v_expected_session_version integer := nullif(trim(coalesce(p_payload->>'expected_encounter_version', '')), '')::integer;
  v_result jsonb := '{}'::jsonb;
begin
  if v_character_weapon_id is null then
    return jsonb_build_object(
      'ok', false,
      'error', 'CHARACTER_WEAPON_ID_REQUIRED',
      'message', 'character_weapon_id is required.'
    );
  end if;

  if v_profile_id is null then
    return jsonb_build_object(
      'ok', false,
      'error', 'PROFILE_ID_REQUIRED',
      'message', 'profile_id is required.'
    );
  end if;

  if v_character_magazine_id is null then
    return jsonb_build_object(
      'ok', false,
      'error', 'CHARACTER_MAGAZINE_ID_REQUIRED',
      'message', 'character_magazine_id is required.'
    );
  end if;

  select *
  into v_weapon
  from public.odyssey_character_weapons w
  where w.id = v_character_weapon_id;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'error', 'WEAPON_NOT_FOUND',
      'message', 'Weapon was not found.'
    );
  end if;

  -- Phase 3E.0: server-authoritative MOVE gate, keyed on the WEAPON OWNER'S
  -- own active participation — the canonical reload path itself is gated, so
  -- neither the HUD nor the older Character/Inventory screens can swap a
  -- combat participant's magazine without the MOVE cost.
  v_participation := public.odyssey_get_active_participation(v_weapon.character_id);
  if v_participation is not null then
    if v_expected_session_version is not null
       and v_expected_session_version <> coalesce((v_participation->>'state_version')::integer, 0) then
      return jsonb_build_object(
        'ok', false,
        'error', 'STATE_VERSION_CONFLICT',
        'message', 'Combat state changed. Reload authoritative runtime.',
        'encounter_state_version', (v_participation->>'state_version')::integer
      );
    end if;

    if coalesce((v_participation->>'is_current_turn')::boolean, false) = false then
      return jsonb_build_object(
        'ok', false,
        'error', 'NOT_CURRENT_TURN',
        'message', 'It is not this character''s turn.'
      );
    end if;

    if coalesce((v_participation->>'move_current')::integer, 0) < 1 then
      return jsonb_build_object(
        'ok', false,
        'error', 'MOVE_NOT_AVAILABLE',
        'message', 'MOVE action is already spent.'
      );
    end if;
  end if;

  perform public.initialize_character_weapon_profile_states(v_weapon.id);

  select s.id
  into v_target_state_id
  from public.odyssey_character_weapon_profile_states s
  join public.odyssey_weapon_model_profiles p on p.id = s.profile_id
  where s.character_weapon_id = v_weapon.id
    and s.profile_id = v_profile_id
    and p.weapon_model_id = v_weapon.weapon_model_id
  limit 1;

  if v_target_state_id is null then
    return jsonb_build_object(
      'ok', false,
      'error', 'PROFILE_NOT_FOUND',
      'message', 'Selected profile was not found for this weapon.'
    );
  end if;

  select *
  into v_magazine
  from public.odyssey_character_magazines cm
  where cm.id = v_character_magazine_id;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'error', 'MAGAZINE_NOT_FOUND',
      'message', 'Magazine was not found.'
    );
  end if;

  if v_magazine.character_id <> v_weapon.character_id then
    return jsonb_build_object(
      'ok', false,
      'error', 'MAGAZINE_CHARACTER_MISMATCH',
      'message', 'Magazine does not belong to the weapon owner.'
    );
  end if;

  if not public.odyssey_is_magazine_compatible_with_profile(v_profile_id, v_character_magazine_id) then
    return jsonb_build_object(
      'ok', false,
      'error', 'MAGAZINE_INCOMPATIBLE',
      'message', 'Magazine is not compatible with the selected weapon profile.'
    );
  end if;

  with cleared as (
    update public.odyssey_character_weapon_profile_states
    set loaded_magazine_id = null
    where loaded_magazine_id = v_character_magazine_id
      and id <> v_target_state_id
    returning character_weapon_id
  )
  select coalesce(array_agg(distinct character_weapon_id), '{}'::uuid[])
  into v_affected_weapons
  from cleared;

  update public.odyssey_character_weapon_profile_states
  set loaded_magazine_id = v_character_magazine_id
  where id = v_target_state_id;

  for v_item in
    select distinct weapon_id
    from (
      select unnest(coalesce(v_affected_weapons, '{}'::uuid[])) as weapon_id
      union all
      select v_weapon.id
    ) q
  loop
    perform public.odyssey_sync_character_weapon_profile_cache(v_item);
  end loop;

  -- Phase 3E.0: ONLY a successful swap spends MOVE (atomically with the
  -- encounter version bump). Every failure above returned before this point.
  if v_participation is not null then
    perform public.odyssey_apply_turn_costs(
      public.odyssey_try_parse_uuid(v_participation->>'entry_id'),
      0,
      1,
      false
    );
    perform public.odyssey_increment_encounter_state_version(
      public.odyssey_try_parse_uuid(v_participation->>'encounter_id')
    );
  end if;

  v_result := jsonb_build_object(
    'ok', true,
    'weapon_id', v_weapon.id,
    'profile_id', v_profile_id,
    'profile', public.odyssey_get_character_weapon_profile(v_weapon.id, v_profile_id),
    'armory', public.get_character_armory(v_weapon.character_id)
  );

  if v_participation is not null then
    v_result := v_result || jsonb_build_object(
      'combat_session',
      public.odyssey_build_session_cost_summary(v_participation, false)
    );
  end if;

  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. combat_execute_action — attack/reload no longer double-spend (the cost
--    now lives inside the canonical functions themselves).
-- ---------------------------------------------------------------------------
do $$
declare
  v_function_def text := null;
begin
  select pg_get_functiondef(p.oid)
  into v_function_def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'combat_execute_action'
    and pg_get_function_identity_arguments(p.oid) = 'p_payload jsonb';

  if v_function_def is null then
    raise exception 'Function public.combat_execute_action(jsonb) was not found.';
  end if;

  if position($needle$if v_kind <> 'move' then
    perform public.odyssey_apply_turn_costs(v_entry.id, v_action_cost, v_move_cost, v_use_reaction);
    perform public.odyssey_increment_encounter_state_version(v_encounter_id);
  end if;$needle$ in v_function_def) > 0 then
    v_function_def := replace(
      v_function_def,
      $old$if v_kind <> 'move' then
    perform public.odyssey_apply_turn_costs(v_entry.id, v_action_cost, v_move_cost, v_use_reaction);
    perform public.odyssey_increment_encounter_state_version(v_encounter_id);
  end if;$old$,
      $new$if v_kind not in ('move', 'attack', 'reload') then
    perform public.odyssey_apply_turn_costs(v_entry.id, v_action_cost, v_move_cost, v_use_reaction);
    perform public.odyssey_increment_encounter_state_version(v_encounter_id);
  end if;$new$
    );
    execute v_function_def;
  elsif position($needle$if v_kind not in ('move', 'attack', 'reload') then$needle$ in v_function_def) = 0 then
    raise exception 'Could not find the turn-cost block in public.combat_execute_action(jsonb).';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Isolated turn-start hook — the single point where cooldown/duration
--    mechanics will attach later. Currently delegates to the existing
--    advance_character_effects + combat-state refresh, unchanged behavior.
-- ---------------------------------------------------------------------------
create or replace function public.odyssey_apply_turn_start_effects(
  p_encounter_id uuid,
  p_character_id uuid
)
returns jsonb
language plpgsql
as $$
begin
  perform public.advance_character_effects(p_character_id);
  return public.odyssey_refresh_character_combat_state(p_character_id);
end;
$$;

do $$
declare
  v_function_def text := null;
begin
  select pg_get_functiondef(p.oid)
  into v_function_def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'odyssey_start_next_eligible_turn'
    and pg_get_function_identity_arguments(p.oid) = 'p_encounter_id uuid';

  if v_function_def is null then
    raise exception 'Function public.odyssey_start_next_eligible_turn(uuid) was not found.';
  end if;

  if position($needle$perform public.advance_character_effects(v_candidate.character_id);
    v_refresh := public.odyssey_refresh_character_combat_state(v_candidate.character_id);$needle$ in v_function_def) > 0 then
    v_function_def := replace(
      v_function_def,
      $old$perform public.advance_character_effects(v_candidate.character_id);
    v_refresh := public.odyssey_refresh_character_combat_state(v_candidate.character_id);$old$,
      $new$v_refresh := public.odyssey_apply_turn_start_effects(p_encounter_id, v_candidate.character_id);$new$
    );
    execute v_function_def;
  elsif position('odyssey_apply_turn_start_effects' in v_function_def) = 0 then
    raise exception 'Could not find the turn-start hook point in public.odyssey_start_next_eligible_turn(uuid).';
  end if;
end;
$$;

grant execute on function public.odyssey_get_character_reaction_value_strict(uuid) to anon, authenticated;
grant execute on function public.odyssey_reroll_full_initiative_ties(uuid) to anon, authenticated;
grant execute on function public.odyssey_get_active_participation(uuid) to anon, authenticated;
grant execute on function public.odyssey_build_session_cost_summary(jsonb, boolean) to anon, authenticated;
grant execute on function public.odyssey_apply_turn_start_effects(uuid, uuid) to anon, authenticated;
grant execute on function public.combat_start_encounter(jsonb) to anon, authenticated;
grant execute on function public.perform_attack(jsonb) to anon, authenticated;
grant execute on function public.load_weapon_profile_magazine(jsonb) to anon, authenticated;
