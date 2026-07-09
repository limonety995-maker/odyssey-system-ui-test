-- ===== 104_ability_timeout_hotfix.sql =====
-- Hotfix for self-target abilities timing out under HUD runtime refresh pressure.
-- Key changes:
-- 1. Remove ability reconcile from read-only runtime RPCs.
-- 2. Avoid double combat_state refresh for self abilities.
-- 3. Do not build full combat runtime from combat_execute_action unless requested.
-- 4. Return ACTION_BUSY_RETRY on lock / statement-timeout style contention.

create or replace function public.combat_execute_action(
  p_payload jsonb
)
returns jsonb
language plpgsql
as $body$
declare
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_encounter_id uuid := public.odyssey_try_parse_uuid(v_payload->>'encounter_id');
  v_character_id uuid := public.odyssey_try_parse_uuid(v_payload->>'character_id');
  v_kind text := lower(trim(coalesce(v_payload->>'kind', '')));
  v_include_runtime boolean := coalesce(nullif(trim(coalesce(v_payload->>'include_runtime', '')), '')::boolean, false);
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
  v_result_target_character_id uuid := null;
  v_result_combat_state jsonb := '{}'::jsonb;
begin
  perform set_config('lock_timeout', '1500ms', true);

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

  v_result_target_character_id := public.odyssey_try_parse_uuid(v_result->>'target_character_id');
  v_result_combat_state := case
    when jsonb_typeof(v_result->'combat_state') = 'object' then v_result->'combat_state'
    else '{}'::jsonb
  end;

  if v_kind = 'ability'
     and v_result_target_character_id = v_character_id
     and v_result_combat_state <> '{}'::jsonb then
    v_post_refresh := jsonb_build_object(
      'ok', true,
      'character_id', v_character_id,
      'combat_state', v_result_combat_state,
      'state_version', nullif(v_result#>>'{combat_state,state_version}', '')::integer
    );
  else
    v_post_refresh := public.odyssey_refresh_character_combat_state(v_character_id);
  end if;

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
    'runtime', case
      when v_include_runtime then public.odyssey_build_combat_runtime(v_encounter_id, v_actor_player_id, v_actor_is_gm, v_actor_is_gm, 5)
      else null
    end
  );
exception
  when lock_not_available then
    return jsonb_build_object(
      'ok', false,
      'error', 'ACTION_BUSY_RETRY',
      'message', 'Character state is busy. Please retry.'
    );
  when query_canceled then
    if SQLERRM ilike '%statement timeout%' or SQLERRM ilike '%lock timeout%' then
      return jsonb_build_object(
        'ok', false,
        'error', 'ACTION_BUSY_RETRY',
        'message', 'Character state is busy. Please retry.'
      );
    end if;
    raise;
end;
$body$;

create or replace function public.get_character_abilities(
  p_character_id uuid
)
returns jsonb
language plpgsql
as $$
declare
  v_character_exists boolean := false;
  v_resource_pools jsonb := '[]'::jsonb;
  v_abilities jsonb := '[]'::jsonb;
begin
  select exists(
    select 1
    from public.odyssey_characters c
    where c.id = p_character_id
      and coalesce(c.is_deleted, false) = false
  )
  into v_character_exists;

  if not v_character_exists then
    return jsonb_build_object(
      'ok', false,
      'error', 'CHARACTER_NOT_FOUND',
      'character_id', p_character_id,
      'resource_pools', '[]'::jsonb,
      'abilities', '[]'::jsonb
    );
  end if;

  with resource_rows as (
    select
      d.sort_order,
      d.code,
      jsonb_build_object(
        'id', p.id,
        'resource_pool_def_id', d.id,
        'code', d.code,
        'name', d.name,
        'source_type', d.source_type,
        'attribute_code', attr.code,
        'recovery_mode', d.recovery_mode,
        'current_value',
          coalesce(
            p.current_value,
            case
              when d.default_current_value is not null then least(d.default_current_value, case
                when d.source_type = 'attribute' and d.attribute_def_id is not null then greatest(coalesce(a.value, d.default_max_value, 0), 0)
                else greatest(coalesce(d.default_max_value, 0), 0)
              end)
              when d.source_type = 'attribute' and d.attribute_def_id is not null then greatest(coalesce(a.value, d.default_max_value, 0), 0)
              else greatest(coalesce(d.default_max_value, 0), 0)
            end,
            0
          ),
        'max_value',
          case
            when d.source_type = 'attribute' and d.attribute_def_id is not null then greatest(coalesce(a.value, d.default_max_value, 0), 0)
            else greatest(coalesce(d.default_max_value, 0), 0)
          end,
        'reserved_value', coalesce(p.reserved_value, 0),
        'description', d.description,
        'data', coalesce(p.data, '{}'::jsonb),
        'notes', coalesce(p.notes, ''),
        'tags', d.tags
      ) as payload
    from public.odyssey_resource_pool_defs d
    left join public.odyssey_attribute_defs attr on attr.id = d.attribute_def_id
    left join public.odyssey_character_attributes a
      on a.character_id = p_character_id
     and a.attribute_def_id = d.attribute_def_id
    left join public.odyssey_character_resource_pools p
      on p.character_id = p_character_id
     and p.resource_pool_def_id = d.id
  )
  select coalesce(jsonb_agg(payload order by sort_order, code), '[]'::jsonb)
  into v_resource_pools
  from resource_rows;

  with ability_rows as (
    select
      ability.sort_order,
      def.sort_order as def_sort_order,
      def.code,
      ability.id,
      ability.character_id,
      def.id as ability_def_id,
      def.code as ability_code,
      def.name as ability_name,
      def.ability_kind,
      def.source_type,
      def.activation_type,
      def.target_type,
      def.effect_mode,
      def.attack_type,
      def.description,
      def.linked_skill_id,
      linked_def.code as linked_skill_code,
      linked_def.name as linked_skill_name,
      coalesce(direct_skill.id, linked_skill.id) as resolved_character_skill_id,
      coalesce(direct_skill.level, linked_skill.level, 0) as resolved_character_skill_level,
      ability.learned_level,
      greatest(coalesce(direct_skill.level, linked_skill.level, ability.learned_level, 0), 0) as effective_level,
      ability.is_enabled,
      ability.is_hidden,
      ability.current_cooldown_rounds,
      ability.current_charges,
      ability.max_charges,
      ability.source_equipment_item_id,
      ability.source_character_item_id,
      ability.source_character_weapon_id,
      ability.data,
      ability.notes,
      def.tags,
      level_data.*,
      source_weapon.custom_name as source_weapon_custom_name,
      source_weapon_model.id as source_weapon_model_id,
      source_weapon_model.code as source_weapon_model_code,
      source_weapon_model.name as source_weapon_model_name,
      source_weapon_profile.id as source_weapon_active_profile_id,
      source_weapon_profile.code as source_weapon_active_profile_code
    from public.odyssey_character_abilities ability
    join public.odyssey_ability_defs def on def.id = ability.ability_def_id
    left join public.odyssey_skill_defs linked_def on linked_def.id = def.linked_skill_id
    left join public.odyssey_character_skills direct_skill
      on direct_skill.id = ability.character_skill_id
    left join public.odyssey_character_skills linked_skill
      on ability.character_skill_id is null
     and linked_skill.character_id = ability.character_id
     and linked_skill.skill_def_id = def.linked_skill_id
    left join lateral (
      select level_entry.*
      from public.odyssey_ability_level_defs level_entry
      where level_entry.ability_def_id = def.id
        and level_entry.ability_level <= greatest(coalesce(direct_skill.level, linked_skill.level, ability.learned_level, 0), 0)
      order by level_entry.ability_level desc
      limit 1
    ) level_data on true
    left join public.odyssey_character_weapons source_weapon on source_weapon.id = ability.source_character_weapon_id
    left join public.odyssey_weapon_model_defs source_weapon_model on source_weapon_model.id = source_weapon.weapon_model_id
    left join public.odyssey_weapon_model_profiles source_weapon_profile on source_weapon_profile.id = source_weapon.active_profile_id
    where ability.character_id = p_character_id
      and ability.is_hidden = false
      and ability.is_enabled = true
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', id,
        'character_id', character_id,
        'ability_def_id', ability_def_id,
        'code', ability_code,
        'name', ability_name,
        'ability_kind', ability_kind,
        'source_type', source_type,
        'activation_type', activation_type,
        'target_type', target_type,
        'effect_mode', effect_mode,
        'attack_type', attack_type,
        'description', description,
        'linked_skill_id', linked_skill_id,
        'linked_skill_code', linked_skill_code,
        'linked_skill_name', linked_skill_name,
        'character_skill_id', resolved_character_skill_id,
        'character_skill_level', resolved_character_skill_level,
        'learned_level', learned_level,
        'effective_level', effective_level,
        'is_enabled', is_enabled,
        'is_hidden', is_hidden,
        'current_cooldown_rounds', current_cooldown_rounds,
        'current_charges', current_charges,
        'max_charges', max_charges,
        'resource',
          jsonb_build_object(
            'mode', source_type,
            'pool_code', coalesce(nullif(level_data.resource_pool_code, ''), null),
            'item_code', coalesce(nullif(level_data.resource_item_code, ''), null),
            'cost', coalesce(level_data.resource_cost, 0)
          ),
        'source_equipment_item_id', source_equipment_item_id,
        'source_character_item_id', source_character_item_id,
        'source_character_weapon_id', source_character_weapon_id,
        'source',
          case
            when source_character_weapon_id is not null then jsonb_strip_nulls(
              jsonb_build_object(
                'type', 'weapon',
                'character_weapon_id', source_character_weapon_id,
                'weapon_name', coalesce(nullif(trim(source_weapon_custom_name), ''), source_weapon_model_name),
                'weapon_model_id', source_weapon_model_id,
                'weapon_model_code', source_weapon_model_code,
                'required_profile_id', nullif(trim(coalesce(data->>'required_profile_id', '')), ''),
                'required_profile_code', nullif(trim(coalesce(data->>'required_profile_code', '')), ''),
                'is_available_for_active_profile',
                  case
                    when nullif(trim(coalesce(data->>'required_profile_id', '')), '') is null then true
                    else source_weapon_active_profile_id::text = nullif(trim(coalesce(data->>'required_profile_id', '')), '')
                  end
              )
            )
            when source_equipment_item_id is not null then jsonb_strip_nulls(
              jsonb_build_object(
                'type', 'equipment',
                'character_equipment_item_id', source_equipment_item_id
              )
            )
            when source_character_item_id is not null then jsonb_strip_nulls(
              jsonb_build_object(
                'type', 'item',
                'character_item_id', source_character_item_id
              )
            )
            else jsonb_strip_nulls(
              jsonb_build_object(
                'type', coalesce(nullif(trim(coalesce(data->>'generated_from', '')), ''), source_type)
              )
            )
          end,
        'data', data,
        'notes', notes,
        'tags', tags,
        'level',
          jsonb_strip_nulls(
            jsonb_build_object(
              'ability_level', level_data.ability_level,
              'resource_cost', level_data.resource_cost,
              'cooldown_rounds', level_data.cooldown_rounds,
              'range_profile_id', level_data.range_profile_id,
              'attack_accuracy_bonus', level_data.attack_accuracy_bonus,
              'attack_damage_bonus', level_data.attack_damage_bonus,
              'attack_armor_pierce', level_data.attack_armor_pierce,
              'ignore_armor', level_data.ignore_armor,
              'special_armor_value', level_data.special_armor_value,
              'special_max_critical', level_data.special_max_critical,
              'duration_rounds', level_data.duration_rounds,
              'data', level_data.data,
              'effect_data', level_data.effect_data
            )
          )
      )
      order by sort_order, def_sort_order, code, id
    ),
    '[]'::jsonb
  )
  into v_abilities
  from ability_rows;

  return jsonb_build_object(
    'ok', true,
    'character_id', p_character_id,
    'resource_pools', v_resource_pools,
    'abilities', v_abilities
  );
end;
$$;

create or replace function public.get_character_runtime_bundle(
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
as $$
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

  if v_sections ? 'equipment' and jsonb_typeof(v_sections->'equipment') = 'array' then
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

  return v_bundle || jsonb_build_object('sections', v_sections);
end;
$$;

create or replace function public.odyssey_get_character_quick_actions_runtime(
  p_character_id uuid
)
returns jsonb
language plpgsql
stable
as $$
declare
  v_character_exists boolean;
  v_is_alive boolean;
  v_is_conscious boolean;
  v_has_skip_turn_effect boolean;
  v_quick_actions jsonb := '[]'::jsonb;
  v_layout jsonb;
  v_version integer := 1;
begin
  select exists(
    select 1 from public.odyssey_characters where id = p_character_id and not coalesce(is_deleted, false)
  ) into v_character_exists;

  if not v_character_exists then
    return jsonb_build_object(
      'ok', false,
      'error', 'CHARACTER_NOT_FOUND',
      'message', 'Character does not exist or is deleted',
      'characterId', p_character_id,
      'quickActions', '[]'::jsonb,
      'quickbar', jsonb_build_object('slots', '[]'::jsonb, 'maxSlots', 20, 'version', 1)
    );
  end if;

  select coalesce(cs.is_alive, true), coalesce(cs.is_conscious, true)
  into v_is_alive, v_is_conscious
  from public.odyssey_characters c
  left join public.odyssey_character_combat_state cs on cs.character_id = c.id
  where c.id = p_character_id;

  v_has_skip_turn_effect := public.odyssey_character_has_active_effect_flag(p_character_id, 'skip_turn');

  select t.layout, t.version into v_layout, v_version
  from public.odyssey_character_quickbar_layouts t
  where t.character_id = p_character_id;

  v_layout := coalesce(v_layout, jsonb_build_object('slots', '[]'::jsonb));
  v_version := coalesce(v_version, 0);

  v_quick_actions := coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'characterActionId', ca.id,
          'definitionId', ca.ability_def_id,
          'characterSkillId', ca.character_skill_id,
          'sourceCharacterWeaponId', ca.source_character_weapon_id,
          'sourceType', ad.source_type,
          'type', case
            when coalesce(ad.effect_mode, '') = 'attack' or ad.ability_kind = 'attack' then 'attack_technique'
            when coalesce(ad.target_type, 'none') in ('character', 'body_part') then 'directed'
            else 'instant'
          end,
          'name', ad.name,
          'shortDescription', substring(ad.description, 1, 100),
          'fullDescription', ad.description,
          'iconKey', coalesce(ad.data->>'icon_key', 'bolt'),
          'semanticKind', ad.ability_kind,
          'targeting', jsonb_build_object(
            'mode', coalesce(ad.target_type, 'none'),
            'minTargets', 1,
            'maxTargets', 1,
            'allowAllies', true,
            'allowSelf', ad.target_type = 'self',
            'requiresBodyZone', ad.target_type = 'body_part'
          ),
          'costs', jsonb_build_object(
            'main', case when ad.resource_mode = 'pool' then 1 else 0 end,
            'move', 0,
            'psi', case when ad.resource_pool_code = 'psi' then coalesce((ald.data->>'psi_cost')::int, 0) else 0 end,
            'charges', case when ad.resource_mode = 'item' then coalesce(ca.current_charges, 0) else 0 end
          ),
          'cooldown', jsonb_build_object(
            'current', ca.current_cooldown_rounds,
            'max', coalesce(ald.cooldown_rounds, 0),
            'unit', 'turn'
          ),
          'state', jsonb_build_object(
            'available',
              ca.is_enabled
              and not v_has_skip_turn_effect
              and (v_is_alive or ad.target_type = 'none')
              and coalesce(ca.current_cooldown_rounds, 0) <= 0
              and not coalesce(res.insufficient_pool, false)
              and not coalesce(res.insufficient_charges, false)
              and not coalesce(exec.unsupported_effect, false),
            'active', false,
            'disabledReason', case
              when not ca.is_enabled then 'Ability is disabled'
              when v_has_skip_turn_effect then 'Skipping turn'
              when not v_is_alive and ad.target_type <> 'none' then 'Character is dead'
              when coalesce(exec.unsupported_effect, false) then 'Attack effect is not supported yet'
              when coalesce(ca.current_cooldown_rounds, 0) > 0 then format('Cooldown: %s turns', ca.current_cooldown_rounds)
              when coalesce(res.insufficient_pool, false) then format('Not enough %s', coalesce(ad.resource_pool_code, 'resource'))
              when coalesce(res.insufficient_charges, false) then 'No charges left'
              else null
            end,
            'selectable',
              ca.is_enabled
              and not v_has_skip_turn_effect
              and (v_is_alive or ad.target_type = 'none')
              and coalesce(ca.current_cooldown_rounds, 0) <= 0
              and not coalesce(res.insufficient_pool, false)
              and not coalesce(res.insufficient_charges, false)
              and not coalesce(exec.unsupported_effect, false),
            'executionAvailable', not coalesce(exec.unsupported_effect, false),
            'executionReason', case when coalesce(exec.unsupported_effect, false) then 'ACTION_EFFECT_NOT_IMPLEMENTED' else null end,
            'resourceSufficient', not (coalesce(res.insufficient_pool, false) or coalesce(res.insufficient_charges, false))
          ),
          'requirements', jsonb_build_object(
            'weaponClass', null,
            'weaponId', null,
            'conditionSummary', null
          )
        )
        order by ca.sort_order, ca.created_at
      )
      from public.odyssey_character_abilities ca
      join public.odyssey_ability_defs ad on ad.id = ca.ability_def_id
      left join public.odyssey_ability_level_defs ald on ald.ability_def_id = ad.id and ald.ability_level = ca.learned_level
      left join lateral (
        select (
          coalesce(ald.attack_damage_bonus, 0) <> 0
          or coalesce(ald.attack_armor_pierce, 0) <> 0
          or coalesce(ald.ignore_armor, false)
        ) as unsupported_effect
      ) exec on true
      left join public.odyssey_resource_pool_defs rpd on rpd.code = ad.resource_pool_code
      left join public.odyssey_character_resource_pools rp
        on rp.character_id = ca.character_id and rp.resource_pool_def_id = rpd.id
      left join lateral (
        select
          (ad.resource_mode = 'pool' and coalesce(rp.current_value, 0) < coalesce(ald.resource_cost, 0)) as insufficient_pool,
          (ad.resource_mode = 'item' and ca.current_charges is not null and ca.current_charges <= 0) as insufficient_charges
      ) res on true
      where ca.character_id = p_character_id
        and ca.is_hidden = false
        and ca.is_enabled = true
        and ad.ability_kind != 'passive'
        and ad.activation_type in ('manual', 'custom')
    ),
    '[]'::jsonb
  );

  return jsonb_build_object(
    'ok', true,
    'error', null,
    'characterId', p_character_id,
    'quickActions', v_quick_actions,
    'quickbar', jsonb_build_object(
      'slots', coalesce(v_layout->'slots', '[]'::jsonb),
      'maxSlots', 20,
      'version', v_version
    )
  );
end;
$$;

-- ===== END 104_ability_timeout_hotfix.sql =====
