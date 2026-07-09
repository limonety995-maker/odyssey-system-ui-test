-- ===== 105_runtime_equipment_use_canonical_equipment.sql =====
-- Fix runtime bundle equipment rows so installation slot metadata always comes
-- from the canonical get_character_equipment(...) payload.

create or replace function public.get_character_runtime_bundle(
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
as $function$
declare
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_sections_raw jsonb := v_payload->'sections';
  v_filtered_sections jsonb := '[]'::jsonb;
  v_item text;
  v_bundle jsonb := '{}'::jsonb;
  v_sections jsonb := '{}'::jsonb;
  v_rule_sheet jsonb := '{}'::jsonb;
  v_runtime_sections_fn text := '';
  v_character_id uuid := public.odyssey_try_parse_uuid(v_payload->>'character_id');
  v_campaign_id text := coalesce(nullif(trim(coalesce(v_payload->>'campaign_id', '')), ''), '');
  v_room_id text := coalesce(nullif(trim(coalesce(v_payload->>'room_id', '')), ''), '');
  v_scene_id text := coalesce(nullif(trim(coalesce(v_payload->>'scene_id', '')), ''), '');
  v_actor_player_id text := coalesce(nullif(trim(coalesce(v_payload->>'actor_player_id', '')), ''), '');
  v_actor_is_gm boolean := coalesce(nullif(trim(coalesce(v_payload->>'actor_is_gm', '')), '')::boolean, false);
  v_wants_combat_session boolean := false;
  v_encounter public.odyssey_combat_encounters;
  v_participant jsonb := null;
  v_combat_session jsonb := null;
begin
  if to_regprocedure('public.odyssey_build_character_runtime_sections(jsonb)') is not null then
    v_runtime_sections_fn := 'public.odyssey_build_character_runtime_sections';
  elsif to_regprocedure('public.odyssey_get_character_runtime_bundle_legacy(jsonb)') is not null then
    v_runtime_sections_fn := 'public.odyssey_get_character_runtime_bundle_legacy';
  else
    raise exception 'Missing runtime bundle sections helper function';
  end if;

  if jsonb_typeof(v_sections_raw) = 'array' then
    for v_item in
      select section_name
      from jsonb_array_elements_text(v_sections_raw) as section_rows(section_name)
    loop
      if lower(trim(v_item)) = 'combat_session' then
        v_wants_combat_session := true;
      else
        v_filtered_sections := v_filtered_sections || to_jsonb(v_item);
      end if;
    end loop;

    if jsonb_array_length(v_filtered_sections) = 0 then
      execute format(
        'select %s($1)',
        v_runtime_sections_fn
      )
      into v_bundle
      using (v_payload - 'sections') || jsonb_build_object('sections', jsonb_build_array('summary'));
    else
      execute format(
        'select %s($1)',
        v_runtime_sections_fn
      )
      into v_bundle
      using (v_payload - 'sections') || jsonb_build_object('sections', v_filtered_sections);
    end if;
  else
    v_wants_combat_session := true;
    execute format(
      'select %s($1)',
      v_runtime_sections_fn
    )
    into v_bundle
    using v_payload;
  end if;

  if coalesce((v_bundle->>'ok')::boolean, false) = false then
    return v_bundle;
  end if;

  if v_character_id is null then
    v_character_id := public.odyssey_try_parse_uuid(v_bundle#>>'{character,id}');
  end if;

  if v_campaign_id = '' then
    v_campaign_id := coalesce(v_bundle#>>'{character,campaign_id}', '');
  end if;
  if v_room_id = '' then
    v_room_id := coalesce(v_bundle#>>'{character,room_id}', '');
  end if;

  if v_wants_combat_session and v_character_id is not null and v_room_id <> '' and v_scene_id <> '' then
    select *
    into v_encounter
    from public.odyssey_get_active_encounter(v_campaign_id, v_room_id, v_scene_id);

    if found then
      select participant
      into v_participant
      from jsonb_array_elements(
        coalesce(
          public.odyssey_build_combat_runtime(
            v_encounter.id,
            v_actor_player_id,
            v_actor_is_gm,
            v_actor_is_gm,
            1
          )->'visible_participants',
          '[]'::jsonb
        )
      ) as participant_rows(participant)
      where public.odyssey_try_parse_uuid(participant_rows.participant->>'character_id') = v_character_id
      limit 1;

      if v_participant is not null then
        v_combat_session := jsonb_build_object(
          'encounter_id', v_encounter.id,
          'encounter_state_version', v_encounter.state_version,
          'participant',
            jsonb_build_object(
              'initiative_entry_id', public.odyssey_try_parse_uuid(v_participant->>'initiative_entry_id'),
              'initiative_value', coalesce(nullif(v_participant->>'initiative_value', '')::integer, 0),
              'order_index', coalesce(nullif(v_participant->>'order_index', '')::integer, 0),
              'is_current_turn', coalesce(nullif(v_participant->>'is_current_turn', '')::boolean, false),
              'action_current', coalesce(nullif(v_participant->>'action_current', '')::integer, 0),
              'action_max', coalesce(nullif(v_participant->>'action_max', '')::integer, 0),
              'move_current', coalesce(nullif(v_participant->>'move_current', '')::integer, 0),
              'move_max', coalesce(nullif(v_participant->>'move_max', '')::integer, 0),
              'reaction_action_current', coalesce(nullif(v_participant->>'reaction_action_current', '')::integer, 0),
              'action_converted_to_move', coalesce(nullif(v_participant->>'action_converted_to_move', '')::boolean, false),
              'hide_from_initiative_ui', coalesce(nullif(v_participant->>'hide_from_initiative_ui', '')::boolean, false),
              'movement_version', coalesce(nullif(v_participant->>'movement_version', '')::integer, 0)
            )
        );
      end if;
    end if;
  end if;

  v_sections := coalesce(v_bundle->'sections', '{}'::jsonb);
  if v_character_id is not null then
    v_rule_sheet := public.get_character_rule_sheet(v_character_id);
    if jsonb_typeof(v_rule_sheet) = 'object' then
      if v_sections ? 'attributes' then
        v_sections := jsonb_set(
          v_sections,
          '{attributes}',
          coalesce(v_rule_sheet->'attributes', '[]'::jsonb),
          true
        );
      end if;
      if v_sections ? 'skills' then
        v_sections := jsonb_set(
          v_sections,
          '{skills}',
          coalesce(v_rule_sheet->'skills', '[]'::jsonb),
          true
        );
      end if;
    end if;
  end if;
  if v_wants_combat_session then
    v_sections := v_sections || jsonb_build_object('combat_session', coalesce(v_combat_session, 'null'::jsonb));
  end if;

  if v_sections ? 'equipment' then
    if v_character_id is not null then
      v_sections := jsonb_set(
        v_sections,
        '{equipment}',
        coalesce(
          public.get_character_equipment(v_character_id)->'items',
          '[]'::jsonb
        ),
        true
      );
    end if;

    if jsonb_typeof(v_sections->'equipment') = 'array' then
      v_sections := jsonb_set(
        v_sections,
        '{equipment}',
        coalesce(
          (
            select jsonb_agg(public.odyssey_runtime_flatten_equipment_item(item_value))
            from jsonb_array_elements(v_sections->'equipment') as equipment_rows(item_value)
          ),
          '[]'::jsonb
        ),
        true
      );
    end if;
  end if;

  return v_bundle || jsonb_build_object('sections', v_sections);
end;
$function$;
