-- Odyssey System: perk combat automation and weapon locks
-- Stage 65: canonical dead-state wrapper, weapon lock checks, perk context, patient hunter,
--           first time no movement binding, calibrating persistence, and attack wrapper refresh.

do $$
begin
  if to_regprocedure('public.odyssey_get_effective_character_stats_legacy(uuid)') is null
     and to_regprocedure('public.get_effective_character_stats(uuid)') is not null then
    alter function public.get_effective_character_stats(uuid)
      rename to odyssey_get_effective_character_stats_legacy;
  end if;
end;
$$;

create or replace function public.get_effective_character_stats(
  p_character_id uuid
)
returns jsonb
language plpgsql
stable
as $$
declare
  v_result jsonb := '{}'::jsonb;
  v_force_dead boolean := false;
begin
  v_result := public.odyssey_get_effective_character_stats_legacy(p_character_id);

  if coalesce((v_result->>'ok')::boolean, false) = false then
    return v_result;
  end if;

  select exists(
    select 1
    from public.odyssey_character_effects e
    where e.character_id = p_character_id
      and e.is_active = true
      and coalesce(nullif(e.data#>>'{flags,force_dead}', '')::boolean, false)
  )
  into v_force_dead;

  if v_force_dead then
    v_result := jsonb_set(v_result, '{derived,is_alive}', 'false'::jsonb, true);
    v_result := jsonb_set(v_result, '{derived,is_conscious}', 'false'::jsonb, true);
    v_result := jsonb_set(v_result, '{derived,helpless}', 'true'::jsonb, true);
    v_result := jsonb_set(v_result, '{derived,skip_main_action}', 'true'::jsonb, true);
    v_result := jsonb_set(v_result, '{derived,skip_movement}', 'true'::jsonb, true);
    v_result := jsonb_set(v_result, '{derived,consumes_full_turn}', 'true'::jsonb, true);
    v_result := jsonb_set(v_result, '{derived,main_actions_per_turn}', '0'::jsonb, true);
    v_result := jsonb_set(v_result, '{derived,movement_available_m}', '0'::jsonb, true);
  end if;

  return v_result;
end;
$$;

create or replace function public.odyssey_get_weapon_runtime_context(
  p_character_weapon_id uuid
)
returns jsonb
language sql
stable
as $$
  with weapon_row as (
    select
      w.id as character_weapon_id,
      w.character_id,
      w.weapon_model_id,
      w.active_profile_id,
      w.loaded_magazine_id,
      w.selected_fire_mode_id,
      coalesce(nullif(trim(w.custom_name), ''), wm.name) as weapon_name,
      wm.code as weapon_model_code,
      wm.tags as model_tags,
      coalesce(w.data, '{}'::jsonb) as weapon_data,
      wc.code as weapon_class_code,
      wc.name as weapon_class_name,
      p.id as profile_id,
      coalesce(p.code, '') as profile_code,
      coalesce(p.tags, '[]'::jsonb) as profile_tags,
      coalesce(p.attack_type, 'ranged') as attack_type,
      coalesce(p.range_profile_id, wm.range_profile_id) as range_profile_id,
      coalesce(rp.code, mrp.code) as range_profile_code,
      coalesce(p.caliber_id, wm.caliber_id) as caliber_id,
      coalesce(cal.code, mcal.code) as caliber_code,
      coalesce(fm.code, default_fm.code, '') as fire_mode_code,
      coalesce(fm.id, default_fm.id) as fire_mode_id,
      cm.current_rounds as loaded_magazine_current_rounds,
      md.capacity as loaded_magazine_capacity,
      ammo.code as loaded_ammo_code,
      w.equipped_slot
    from public.odyssey_character_weapons w
    join public.odyssey_weapon_model_defs wm on wm.id = w.weapon_model_id
    join public.odyssey_weapon_class_defs wc on wc.id = wm.weapon_class_id
    left join public.odyssey_weapon_model_profiles p on p.id = w.active_profile_id
    left join public.odyssey_range_profile_defs rp on rp.id = p.range_profile_id
    left join public.odyssey_range_profile_defs mrp on mrp.id = wm.range_profile_id
    left join public.odyssey_caliber_defs cal on cal.id = p.caliber_id
    left join public.odyssey_caliber_defs mcal on mcal.id = wm.caliber_id
    left join public.odyssey_fire_mode_defs fm on fm.id = w.selected_fire_mode_id
    left join lateral (
      select fm2.id, fm2.code
      from public.odyssey_weapon_profile_fire_modes pfm2
      join public.odyssey_fire_mode_defs fm2 on fm2.id = pfm2.fire_mode_id
      where pfm2.profile_id = w.active_profile_id
        and pfm2.is_default = true
      order by pfm2.sort_order, pfm2.created_at, pfm2.id
      limit 1
    ) default_fm on true
    left join public.odyssey_character_magazines cm on cm.id = w.loaded_magazine_id
    left join public.odyssey_magazine_defs md on md.id = cm.magazine_def_id
    left join public.odyssey_ammo_type_defs ammo on ammo.id = cm.ammo_type_id
    where w.id = p_character_weapon_id
  ),
  weapon_tags as (
    select
      wr.character_weapon_id,
      coalesce(
        jsonb_agg(distinct tag_rows.tag) filter (where tag_rows.tag <> ''),
        '[]'::jsonb
      ) as tags
    from weapon_row wr
    left join lateral (
      select lower(trim(value)) as tag
      from jsonb_array_elements_text(coalesce(wr.model_tags, '[]'::jsonb)) value
      union
      select lower(trim(value)) as tag
      from jsonb_array_elements_text(coalesce(wr.profile_tags, '[]'::jsonb)) value
      union
      select lower(trim(coalesce(wr.weapon_class_code, '')))
      union
      select lower(trim(coalesce(wr.weapon_model_code, '')))
      union
      select lower(trim(coalesce(wr.profile_code, '')))
    ) tag_rows on true
    group by wr.character_weapon_id
  )
  select coalesce(
    (
      select jsonb_build_object(
        'ok', true,
        'character_weapon_id', wr.character_weapon_id,
        'character_id', wr.character_id,
        'weapon_model_id', wr.weapon_model_id,
        'active_profile_id', wr.active_profile_id,
        'profile_id', wr.profile_id,
        'weapon_name', wr.weapon_name,
        'weapon_model_code', wr.weapon_model_code,
        'weapon_class_code', wr.weapon_class_code,
        'weapon_class_name', wr.weapon_class_name,
        'profile_code', wr.profile_code,
        'attack_type', wr.attack_type,
        'range_profile_id', wr.range_profile_id,
        'range_profile_code', wr.range_profile_code,
        'caliber_id', wr.caliber_id,
        'caliber_code', wr.caliber_code,
        'fire_mode_id', wr.fire_mode_id,
        'fire_mode_code', wr.fire_mode_code,
        'loaded_magazine_id', wr.loaded_magazine_id,
        'loaded_magazine_current_rounds', wr.loaded_magazine_current_rounds,
        'loaded_magazine_capacity', wr.loaded_magazine_capacity,
        'loaded_ammo_code', wr.loaded_ammo_code,
        'weapon_tags', coalesce(tags.tags, '[]'::jsonb),
        'weapon_data', coalesce(wr.weapon_data, '{}'::jsonb),
        'equipped_slot', wr.equipped_slot
      )
      from weapon_row wr
      left join weapon_tags tags on tags.character_weapon_id = wr.character_weapon_id
    ),
    jsonb_build_object(
      'ok', false,
      'error', 'WEAPON_NOT_FOUND',
      'message', 'Weapon was not found.'
    )
  );
$$;

create or replace function public.odyssey_get_weapon_lock_state(
  p_character_id uuid,
  p_character_weapon_id uuid
)
returns jsonb
language plpgsql
stable
as $$
declare
  v_weapon_context jsonb := '{}'::jsonb;
  v_active_effects jsonb := '[]'::jsonb;
  v_weapon_locked boolean := false;
  v_actor_attack_locked boolean := false;
  v_reason text := '';
  v_error_code text := null;
  v_message text := null;
begin
  if p_character_id is null or p_character_weapon_id is null then
    return jsonb_build_object(
      'ok', false,
      'error', 'INVALID_PAYLOAD',
      'message', 'character_id and character_weapon_id are required.'
    );
  end if;

  v_weapon_context := public.odyssey_get_weapon_runtime_context(p_character_weapon_id);
  if coalesce((v_weapon_context->>'ok')::boolean, false) = false then
    return v_weapon_context;
  end if;

  if public.odyssey_try_parse_uuid(v_weapon_context->>'character_id') is distinct from p_character_id then
    return jsonb_build_object(
      'ok', false,
      'error', 'WEAPON_NOT_OWNED',
      'message', 'Weapon does not belong to this character.',
      'character_weapon_id', p_character_weapon_id
    );
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', e.id,
        'effect_key', e.effect_key,
        'perk_code', coalesce(e.data->>'perk_code', ''),
        'reason', coalesce(e.data#>>'{flags,reason}', e.data->>'reason', ''),
        'name', e.name,
        'data', coalesce(e.data, '{}'::jsonb)
      )
      order by e.updated_at desc, e.created_at desc, e.id desc
    ),
    '[]'::jsonb
  )
  into v_active_effects
  from public.odyssey_character_effects e
  where e.character_id = p_character_id
    and e.is_active = true
    and (
      (
        coalesce(e.data->>'character_weapon_id', '') = p_character_weapon_id::text
        and (
          coalesce(lower(e.data#>>'{flags,weapon_locked}'), 'false') in ('true', '1', 'yes', 'on')
          or coalesce(e.data->>'perk_code', '') in ('ratatatata', 'not_full_auto', 'coil_cooling', 'patient_hunter')
          or split_part(coalesce(e.effect_key, ''), ':', 1) in ('coil_cooling', 'suppression_fire_active', 'ratatatata', 'patient_hunter')
        )
      )
      or coalesce(lower(e.data#>>'{flags,actor_attack_locked}'), 'false') in ('true', '1', 'yes', 'on')
    );

  select exists(
    select 1
    from jsonb_array_elements(v_active_effects) effect
    where coalesce(lower(effect#>>'{data,flags,weapon_locked}'), 'false') in ('true', '1', 'yes', 'on')
       or split_part(coalesce(effect->>'effect_key', ''), ':', 1) in ('coil_cooling', 'suppression_fire_active')
  )
  into v_weapon_locked;

  select exists(
    select 1
    from jsonb_array_elements(v_active_effects) effect
    where coalesce(lower(effect#>>'{data,flags,actor_attack_locked}'), 'false') in ('true', '1', 'yes', 'on')
  )
  into v_actor_attack_locked;

  if v_weapon_locked or v_actor_attack_locked then
    select
      coalesce(
        nullif(trim(coalesce(effect->>'reason', '')), ''),
        nullif(trim(coalesce(effect->>'perk_code', '')), ''),
        split_part(coalesce(effect->>'effect_key', ''), ':', 1),
        'weapon_locked'
      )
    into v_reason
    from jsonb_array_elements(v_active_effects) effect
    limit 1;

    if exists (
      select 1
      from jsonb_array_elements(v_active_effects) effect
      where coalesce(effect->>'perk_code', '') = 'coil_cooling'
         or split_part(coalesce(effect->>'effect_key', ''), ':', 1) = 'coil_cooling'
         or coalesce(effect->>'reason', '') = 'coil_cooling'
    ) then
      v_error_code := 'WEAPON_COOLING';
      v_message := 'Weapon is cooling down and cannot be used right now.';
    elsif v_actor_attack_locked then
      v_error_code := 'ACTOR_ATTACK_LOCKED';
      v_message := 'This character cannot perform attack actions right now.';
    else
      v_error_code := 'WEAPON_LOCKED';
      v_message := 'Weapon is currently locked by an active perk or effect.';
    end if;
  end if;

  return jsonb_build_object(
    'ok', true,
    'character_id', p_character_id,
    'character_weapon_id', p_character_weapon_id,
    'locked', v_weapon_locked,
    'actor_attack_locked', v_actor_attack_locked,
    'reason', v_reason,
    'error', v_error_code,
    'message', v_message,
    'active_effects', coalesce(v_active_effects, '[]'::jsonb)
  );
end;
$$;

create or replace function public.odyssey_get_character_attack_perk_context(
  p_character_id uuid,
  p_character_weapon_id uuid,
  p_target_character_id uuid default null,
  p_target_body_part_id uuid default null,
  p_distance_m numeric default 0,
  p_fire_mode_code text default null,
  p_attack_type text default null,
  p_encounter_id uuid default null
)
returns jsonb
language plpgsql
stable
as $$
declare
  v_weapon_context jsonb := '{}'::jsonb;
  v_weapon_tags jsonb := '[]'::jsonb;
  v_range_json jsonb := '{}'::jsonb;
  v_range_band text := null;
  v_range_modifier integer := 0;
  v_effective_fire_mode_code text := '';
  v_effective_attack_type text := '';
  v_attack_accuracy_bonus integer := 0;
  v_range_penalty_reduction integer := 0;
  v_ignore_clinch_penalty boolean := false;
  v_ammo_base_damage_multiplier integer := 1;
  v_flags jsonb := '{}'::jsonb;
  v_perk_modifiers jsonb := '[]'::jsonb;
  v_consume_effect_ids jsonb := '[]'::jsonb;
  v_target_armor_value integer := 0;
  v_dual_pistol_count integer := 0;
  v_calibrating_bonus integer := 0;
  v_bonus integer := 0;
  v_multiplier integer := 1;
  v_target_movement_version integer := 0;
  v_effect record;
  v_perk record;
begin
  if p_character_id is null or p_character_weapon_id is null then
    return jsonb_build_object(
      'ok', false,
      'error', 'INVALID_PAYLOAD',
      'message', 'character_id and character_weapon_id are required.'
    );
  end if;

  v_weapon_context := public.odyssey_get_weapon_runtime_context(p_character_weapon_id);
  if coalesce((v_weapon_context->>'ok')::boolean, false) = false then
    return v_weapon_context;
  end if;

  if public.odyssey_try_parse_uuid(v_weapon_context->>'character_id') is distinct from p_character_id then
    return jsonb_build_object(
      'ok', false,
      'error', 'WEAPON_NOT_OWNED',
      'message', 'Weapon does not belong to this character.',
      'character_weapon_id', p_character_weapon_id
    );
  end if;

  v_weapon_tags := coalesce(v_weapon_context->'weapon_tags', '[]'::jsonb);
  v_effective_fire_mode_code := lower(trim(coalesce(nullif(p_fire_mode_code, ''), v_weapon_context->>'fire_mode_code', '')));
  v_effective_attack_type := lower(trim(coalesce(nullif(p_attack_type, ''), v_weapon_context->>'attack_type', '')));

  if public.odyssey_try_parse_uuid(v_weapon_context->>'range_profile_id') is not null then
    v_range_json := public.odyssey_get_range_profile_modifier(
      public.odyssey_try_parse_uuid(v_weapon_context->>'range_profile_id'),
      greatest(coalesce(p_distance_m, 0), 0)
    );
    v_range_band := nullif(coalesce(v_range_json->>'range_band', ''), '');
    v_range_modifier := coalesce((v_range_json->>'modifier')::integer, 0);
  end if;

  if p_target_body_part_id is not null then
    select greatest(coalesce(b.armor_value, 0), 0)
    into v_target_armor_value
    from public.odyssey_character_body_parts b
    where b.id = p_target_body_part_id
      and (p_target_character_id is null or b.character_id = p_target_character_id)
    limit 1;
  end if;

  if p_encounter_id is not null and p_target_character_id is not null then
    select coalesce(e.movement_version, 0)
    into v_target_movement_version
    from public.odyssey_initiative_entries e
    where e.encounter_id = p_encounter_id
      and e.character_id = p_target_character_id
      and e.is_active = true
    order by e.updated_at desc, e.id desc
    limit 1;
  end if;

  select count(*)
  into v_dual_pistol_count
  from public.odyssey_character_weapons w
  join public.odyssey_weapon_model_defs wm on wm.id = w.weapon_model_id
  left join public.odyssey_weapon_model_profiles p on p.id = w.active_profile_id
  left join public.odyssey_weapon_class_defs wc on wc.id = coalesce(p.weapon_class_id, wm.weapon_class_id)
  where w.character_id = p_character_id
    and (
      coalesce(wm.tags, '[]'::jsonb) ? 'pistol'
      or coalesce(p.tags, '[]'::jsonb) ? 'pistol'
      or lower(coalesce(wc.code, '')) = 'pistol'
      or lower(coalesce(wm.code, '')) = 'pistol'
      or lower(coalesce(p.code, '')) = 'pistol'
    );

  for v_perk in
    select
      perk_def.id as perk_def_id,
      perk_def.code,
      coalesce(perk_def.effect_data, '{}'::jsonb) as effect_data
    from public.odyssey_character_perks owned
    join public.odyssey_perk_defs perk_def on perk_def.id = owned.perk_def_id
    where owned.character_id = p_character_id
      and coalesce(perk_def.is_enabled, true) = true
  loop
    case v_perk.code
      when 'cards_money' then
        if v_weapon_tags ? 'pistol' and v_dual_pistol_count >= 2 then
          v_flags := v_flags || jsonb_build_object('offhand_attack_enabled', true);
          v_perk_modifiers := v_perk_modifiers || jsonb_build_array(
            jsonb_build_object('perk_code', v_perk.code, 'modifier', 'offhand_attack_enabled', 'value', true)
          );
        end if;
      when 'for_the_brotherhood_and_yard_pistols' then
        if v_weapon_tags ? 'pistol' and v_range_band = 'clinch' and v_range_modifier < 0 then
          v_bonus := abs(v_range_modifier);
          v_attack_accuracy_bonus := v_attack_accuracy_bonus + v_bonus;
          v_ignore_clinch_penalty := true;
        end if;
      when 'flutter_like_butterfly' then
        if v_weapon_tags ? 'smg'
           and v_range_band = 'short'
           and v_effective_fire_mode_code in ('burst_3', 'burst_5') then
          v_bonus := coalesce(nullif(trim(coalesce(v_perk.effect_data#>>'{effects,attack_accuracy_bonus}', '')), '')::integer, 15);
          v_attack_accuracy_bonus := v_attack_accuracy_bonus + v_bonus;
        end if;
      when 'for_the_brotherhood_and_yard_shotguns' then
        if (v_weapon_tags ? 'shotgun' or v_weapon_tags ? 'shotguns') and v_range_band = 'clinch' then
          v_bonus := coalesce(nullif(trim(coalesce(v_perk.effect_data#>>'{effects,range_penalty_reduction}', '')), '')::integer, 15);
          v_attack_accuracy_bonus := v_attack_accuracy_bonus + v_bonus;
          v_range_penalty_reduction := greatest(v_range_penalty_reduction, v_bonus);
        end if;
      when 'head_taker' then
        if v_effective_attack_type = 'ranged'
           and (v_weapon_tags ? 'shotgun' or v_weapon_tags ? 'shotguns')
           and v_range_band in ('clinch', 'short')
           and v_target_armor_value <= coalesce(nullif(trim(coalesce(v_perk.effect_data#>>'{conditions,target_armor_value_max}', '')), '')::integer, 0) then
          v_multiplier := coalesce(nullif(trim(coalesce(v_perk.effect_data#>>'{effects,ammo_base_damage_multiplier}', '')), '')::integer, 2);
          v_ammo_base_damage_multiplier := greatest(v_ammo_base_damage_multiplier, v_multiplier);
        end if;
      when 'calibrating' then
        if v_weapon_tags ? 'sniper' or v_weapon_tags ? 'precision' or v_weapon_tags ? 'rifle' then
          v_calibrating_bonus := coalesce(
            nullif(trim(coalesce(v_weapon_context#>>'{weapon_data,perk_modifiers,calibrating,accuracy_bonus}', '')), '')::integer,
            nullif(trim(coalesce(v_weapon_context#>>'{weapon_data,perks,calibrating,accuracy_bonus}', '')), '')::integer,
            nullif(trim(coalesce(v_weapon_context#>>'{weapon_data,calibrating_accuracy_bonus}', '')), '')::integer,
            0
          );
          if v_calibrating_bonus > 0 then
            v_attack_accuracy_bonus := v_attack_accuracy_bonus + v_calibrating_bonus;
          end if;
        end if;
      else
        null;
    end case;
  end loop;

  for v_effect in
    select
      e.id,
      e.effect_key,
      coalesce(e.data, '{}'::jsonb) as data
    from public.odyssey_character_effects e
    where e.character_id = p_character_id
      and e.is_active = true
      and coalesce(e.data->>'character_weapon_id', '') = p_character_weapon_id::text
      and coalesce(e.data->>'perk_code', '') in ('not_full_auto', 'first_time_no', 'patient_hunter')
    order by e.updated_at desc, e.created_at desc, e.id desc
  loop
    if coalesce(v_effect.data->>'perk_code', '') = 'not_full_auto' then
      select greatest(
        coalesce(nullif(trim(coalesce(modifier->>'value', '')), '')::integer, 1),
        1
      )
      into v_multiplier
      from jsonb_array_elements(coalesce(v_effect.data->'modifiers', '[]'::jsonb)) modifier
      where coalesce(modifier->>'target', '') = 'ammo_base_damage'
        and coalesce(modifier->>'operation', '') = 'multiply'
      limit 1;

      if coalesce(v_multiplier, 1) > 1 then
        v_ammo_base_damage_multiplier := greatest(v_ammo_base_damage_multiplier, v_multiplier);
      end if;
    elsif coalesce(v_effect.data->>'perk_code', '') = 'first_time_no'
      and coalesce(v_effect.data->>'target_character_id', '') = coalesce(p_target_character_id::text, '') then
      if coalesce(nullif(v_effect.data->>'target_movement_version', '')::integer, v_target_movement_version) = v_target_movement_version then
        select coalesce(
          sum(coalesce(nullif(trim(coalesce(modifier->>'value', '')), '')::integer, 0)),
          0
        )
        into v_bonus
        from jsonb_array_elements(coalesce(v_effect.data->'modifiers', '[]'::jsonb)) modifier
        where coalesce(modifier->>'target', '') = 'attack_accuracy'
          and coalesce(modifier->>'operation', '') = 'add';

        if coalesce(v_bonus, 0) > 0 then
          v_attack_accuracy_bonus := v_attack_accuracy_bonus + v_bonus;
          v_consume_effect_ids := v_consume_effect_ids || jsonb_build_array(v_effect.id::text);
        end if;
      end if;
    elsif coalesce(v_effect.data->>'perk_code', '') = 'patient_hunter' then
      v_bonus := greatest(coalesce(nullif(trim(coalesce(v_effect.data->>'accuracy_bonus', '')), '')::integer, 0), 0);
      if v_bonus > 0 then
        v_attack_accuracy_bonus := v_attack_accuracy_bonus + v_bonus;
      end if;
    end if;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'blocked', false,
    'block_reason', null,
    'character_id', p_character_id,
    'character_weapon_id', p_character_weapon_id,
    'target_character_id', p_target_character_id,
    'target_body_part_id', p_target_body_part_id,
    'range_band', v_range_band,
    'range_modifier', v_range_modifier,
    'attack_accuracy_bonus', v_attack_accuracy_bonus,
    'range_penalty_reduction', v_range_penalty_reduction,
    'ignore_clinch_penalty', v_ignore_clinch_penalty,
    'ammo_base_damage_multiplier', v_ammo_base_damage_multiplier,
    'offhand_attack_enabled', coalesce((v_flags->>'offhand_attack_enabled')::boolean, false),
    'flags', coalesce(v_flags, '{}'::jsonb),
    'applied_perks', coalesce(v_perk_modifiers, '[]'::jsonb),
    'active_effects', coalesce(v_consume_effect_ids, '[]'::jsonb),
    'perk_modifiers', coalesce(v_perk_modifiers, '[]'::jsonb),
    'consume_effect_ids', coalesce(v_consume_effect_ids, '[]'::jsonb)
  );
end;
$$;

create or replace function public.odyssey_grant_first_time_no_retry_effect(
  p_character_id uuid,
  p_character_weapon_id uuid,
  p_target_character_id uuid,
  p_target_movement_version integer default 0,
  p_created_by text default ''
)
returns jsonb
language plpgsql
as $$
declare
  v_weapon_context jsonb := '{}'::jsonb;
  v_perk record;
  v_effect_key text := '';
  v_effect_id uuid := null;
  v_effect_data jsonb := '{}'::jsonb;
  v_accuracy_bonus integer := 25;
begin
  if p_character_id is null or p_character_weapon_id is null or p_target_character_id is null then
    return jsonb_build_object('ok', true, 'applied', false);
  end if;

  select
    perk_def.id as perk_def_id,
    perk_def.code,
    perk_def.name,
    coalesce(perk_def.description, '') as description,
    coalesce(perk_def.effect_data, '{}'::jsonb) as effect_data
  into v_perk
  from public.odyssey_character_perks owned
  join public.odyssey_perk_defs perk_def on perk_def.id = owned.perk_def_id
  where owned.character_id = p_character_id
    and perk_def.code = 'first_time_no'
    and coalesce(perk_def.is_enabled, true) = true
  limit 1;

  if not found then
    return jsonb_build_object('ok', true, 'applied', false);
  end if;

  v_weapon_context := public.odyssey_get_weapon_runtime_context(p_character_weapon_id);
  if coalesce((v_weapon_context->>'ok')::boolean, false) = false then
    return jsonb_build_object('ok', true, 'applied', false);
  end if;

  if not (
    coalesce(v_weapon_context->'weapon_tags', '[]'::jsonb) ? 'sniper'
    or coalesce(v_weapon_context->'weapon_tags', '[]'::jsonb) ? 'precision'
    or coalesce(v_weapon_context->'weapon_tags', '[]'::jsonb) ? 'rifle'
  ) then
    return jsonb_build_object('ok', true, 'applied', false);
  end if;

  v_effect_key := public.odyssey_build_perk_weapon_effect_key('first_time_no', p_character_weapon_id);
  v_accuracy_bonus := coalesce(
    nullif(trim(coalesce(v_perk.effect_data#>>'{effects,attack_accuracy_bonus}', '')), '')::integer,
    25
  );

  v_effect_data := jsonb_build_object(
    'perk_code', 'first_time_no',
    'character_weapon_id', p_character_weapon_id::text,
    'target_character_id', p_target_character_id::text,
    'target_movement_version', p_target_movement_version,
    'duration_rounds', 2,
    'category', 'combat',
    'flags', jsonb_build_object('consume_on_attack', true),
    'modifiers',
      jsonb_build_array(
        jsonb_build_object(
          'target', 'attack_accuracy',
          'operation', 'add',
          'value', v_accuracy_bonus
        )
      )
  );

  update public.odyssey_character_effects
  set
    is_active = false,
    rounds_left = 0,
    updated_at = timezone('utc', now())
  where character_id = p_character_id
    and effect_key = v_effect_key
    and is_active = true;

  insert into public.odyssey_character_effects (
    character_id,
    effect_key,
    name,
    description,
    source,
    source_type,
    source_id,
    source_character_id,
    duration_type,
    rounds_left,
    data,
    is_active,
    created_by
  )
  values (
    p_character_id,
    v_effect_key,
    v_perk.name,
    v_perk.description,
    'perk',
    'perk',
    v_perk.perk_def_id,
    p_character_id,
    'rounds',
    2,
    v_effect_data,
    true,
    p_created_by
  )
  returning id into v_effect_id;

  return jsonb_build_object('ok', true, 'applied', true, 'effect_id', v_effect_id);
end;
$$;

create or replace function public.odyssey_apply_perk_post_attack_hooks(
  p_payload jsonb
)
returns jsonb
language plpgsql
as $$
declare
  v_attacker_character_id uuid := public.odyssey_try_parse_uuid(p_payload->>'attacker_character_id');
  v_character_weapon_id uuid := public.odyssey_try_parse_uuid(p_payload->>'character_weapon_id');
  v_target_character_id uuid := public.odyssey_try_parse_uuid(p_payload->>'target_character_id');
  v_target_movement_version integer := coalesce(nullif(trim(coalesce(p_payload->>'target_movement_version', '')), '')::integer, 0);
  v_created_by text := coalesce(nullif(trim(coalesce(p_payload->>'created_by', '')), ''), '');
  v_hit boolean := coalesce(nullif(trim(coalesce(p_payload->>'hit', '')), '')::boolean, false);
  v_target_alive_before boolean := coalesce(nullif(trim(coalesce(p_payload->>'target_alive_before', '')), '')::boolean, true);
  v_target_alive_after boolean := coalesce(nullif(trim(coalesce(p_payload->>'target_alive_after', '')), '')::boolean, true);
  v_weapon_context jsonb := '{}'::jsonb;
  v_refresh jsonb := '{}'::jsonb;
  v_has_calibrating boolean := false;
begin
  if v_attacker_character_id is null or v_character_weapon_id is null then
    return jsonb_build_object('ok', true, 'applied', false);
  end if;

  update public.odyssey_character_effects
  set
    is_active = false,
    rounds_left = 0,
    updated_at = timezone('utc', now())
  where character_id = v_attacker_character_id
    and is_active = true
    and coalesce(data->>'character_weapon_id', '') = v_character_weapon_id::text
    and coalesce(data->>'perk_code', '') = 'patient_hunter';

  if v_target_alive_before and not v_target_alive_after then
    select exists(
      select 1
      from public.odyssey_character_perks owned
      join public.odyssey_perk_defs perk on perk.id = owned.perk_def_id
      where owned.character_id = v_attacker_character_id
        and perk.code = 'calibrating'
        and coalesce(perk.is_enabled, true) = true
    )
    into v_has_calibrating;

    if v_has_calibrating then
      update public.odyssey_character_weapons
      set data = jsonb_set(
        jsonb_set(
          coalesce(data, '{}'::jsonb),
          '{perk_modifiers,calibrating,kill_count}',
          to_jsonb(
            coalesce(nullif(data#>>'{perk_modifiers,calibrating,kill_count}', '')::integer, 0) + 1
          ),
          true
        ),
        '{perk_modifiers,calibrating,accuracy_bonus}',
        to_jsonb(
          coalesce(nullif(data#>>'{perk_modifiers,calibrating,accuracy_bonus}', '')::integer, 0) + 1
        ),
        true
      )
      where id = v_character_weapon_id;
    end if;
  end if;

  v_refresh := public.odyssey_refresh_character_combat_state(v_attacker_character_id);
  return jsonb_build_object(
    'ok', true,
    'attacker_state', coalesce(v_refresh->'combat_state', '{}'::jsonb)
  );
end;
$$;

do $$
begin
  if to_regprocedure('public.get_character_armory(uuid)') is not null
     and to_regprocedure('public.odyssey_get_character_armory_legacy(uuid)') is null then
    alter function public.get_character_armory(uuid)
      rename to odyssey_get_character_armory_legacy;
  end if;
end;
$$;

create or replace function public.get_character_armory(
  p_character_id uuid
)
returns jsonb
language plpgsql
as $$
declare
  v_armory jsonb := '{}'::jsonb;
  v_weapons jsonb := '[]'::jsonb;
begin
  v_armory := public.odyssey_get_character_armory_legacy(p_character_id);

  select coalesce(
    jsonb_agg(
      item.value
      || jsonb_build_object(
        'data', coalesce(w.data, '{}'::jsonb),
        'equipped_slot', w.equipped_slot
      )
      order by ordinality
    ),
    '[]'::jsonb
  )
  into v_weapons
  from jsonb_array_elements(coalesce(v_armory->'weapons', '[]'::jsonb)) with ordinality as item(value, ordinality)
  left join public.odyssey_character_weapons w
    on w.id = public.odyssey_try_parse_uuid(item.value->>'id');

  return v_armory || jsonb_build_object(
    'weapons', coalesce(v_weapons, '[]'::jsonb)
  );
end;
$$;

do $$
begin
  if to_regprocedure('public.get_character_runtime_bundle(jsonb)') is not null
     and to_regprocedure('public.odyssey_get_character_runtime_bundle_legacy(jsonb)') is null then
    alter function public.get_character_runtime_bundle(jsonb)
      rename to odyssey_get_character_runtime_bundle_legacy;
  end if;
end;
$$;

create or replace function public.get_character_runtime_bundle(
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
stable
as $$
declare
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_sections_raw jsonb := v_payload->'sections';
  v_filtered_sections jsonb := '[]'::jsonb;
  v_item text;
  v_bundle jsonb := '{}'::jsonb;
  v_sections jsonb := '{}'::jsonb;
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
      v_bundle := public.odyssey_get_character_runtime_bundle_legacy(
        (v_payload - 'sections') || jsonb_build_object('sections', jsonb_build_array('summary'))
      );
    else
      v_bundle := public.odyssey_get_character_runtime_bundle_legacy(
        (v_payload - 'sections') || jsonb_build_object('sections', v_filtered_sections)
      );
    end if;
  else
    v_wants_combat_session := true;
    v_bundle := public.odyssey_get_character_runtime_bundle_legacy(v_payload);
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
  if v_wants_combat_session then
    v_sections := v_sections || jsonb_build_object('combat_session', coalesce(v_combat_session, 'null'::jsonb));
  end if;

  return v_bundle || jsonb_build_object('sections', v_sections);
end;
$$;

do $$
begin
  if to_regprocedure('public.use_character_perk(jsonb)') is not null
     and to_regprocedure('public.odyssey_use_character_perk_legacy(jsonb)') is null then
    alter function public.use_character_perk(jsonb)
      rename to odyssey_use_character_perk_legacy;
  end if;
end;
$$;

create or replace function public.use_character_perk(
  p_payload jsonb
)
returns jsonb
language plpgsql
as $$
declare
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_character_id uuid := public.odyssey_try_parse_uuid(v_payload->>'character_id');
  v_perk_code text := lower(trim(coalesce(v_payload->>'perk_code', '')));
  v_character_weapon_id uuid := public.odyssey_try_parse_uuid(v_payload->>'character_weapon_id');
  v_encounter_id uuid := public.odyssey_try_parse_uuid(v_payload->>'encounter_id');
  v_scene_id text := coalesce(nullif(trim(coalesce(v_payload->>'scene_id', '')), ''), '');
  v_created_by text := coalesce(nullif(trim(coalesce(v_payload->>'created_by', '')), ''), '');
  v_character public.odyssey_characters%rowtype;
  v_weapon_context jsonb := '{}'::jsonb;
  v_lock_state jsonb := '{}'::jsonb;
  v_perk record;
  v_effect_key text := '';
  v_existing_effect public.odyssey_character_effects%rowtype;
  v_usage_state public.odyssey_combat_usage_states%rowtype;
  v_effect_id uuid := null;
  v_bonus integer := 0;
  v_stack integer := 0;
  v_log_id uuid := null;
begin
  if v_perk_code not in ('patient_hunter', 'not_han_solo') then
    return public.odyssey_use_character_perk_legacy(v_payload);
  end if;

  select *
  into v_character
  from public.odyssey_characters c
  where c.id = v_character_id
    and coalesce(c.is_deleted, false) = false;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'CHARACTER_NOT_FOUND', 'message', 'Character was not found.');
  end if;

  select
    p.id as perk_def_id,
    p.code,
    p.name,
    coalesce(p.description, '') as description,
    coalesce(p.effect_data, '{}'::jsonb) as effect_data,
    owned.id as character_perk_id
  into v_perk
  from public.odyssey_perk_defs p
  left join public.odyssey_character_perks owned
    on owned.perk_def_id = p.id
   and owned.character_id = v_character_id
  where p.code = v_perk_code;

  if not found or v_perk.character_perk_id is null then
    return jsonb_build_object('ok', false, 'error', 'PERK_NOT_OWNED', 'message', 'Character does not own this perk.');
  end if;

  if v_perk_code = 'not_han_solo' then
    if v_encounter_id is null then
      return jsonb_build_object('ok', false, 'error', 'ENCOUNTER_NOT_FOUND', 'message', 'encounter_id is required for this perk.');
    end if;

    insert into public.odyssey_combat_usage_states (
      encounter_id,
      character_id,
      source_type,
      source_code,
      use_count,
      data
    )
    values (
      v_encounter_id,
      v_character_id,
      'perk',
      'not_han_solo',
      1,
      '{}'::jsonb
    )
    on conflict (encounter_id, character_id, source_type, source_code)
    do update
    set use_count = public.odyssey_combat_usage_states.use_count + 1
    returning * into v_usage_state;

    if coalesce(v_usage_state.use_count, 0) > 1 then
      return jsonb_build_object(
        'ok', false,
        'error', 'PERK_ALREADY_ACTIVE',
        'message', 'This once-per-encounter perk was already used.'
      );
    end if;

    v_log_id := public.odyssey_combat_log_insert(
      coalesce(v_character.campaign_id, ''),
      coalesce(v_character.room_id, ''),
      v_scene_id,
      v_encounter_id,
      null,
      v_character_id,
      null,
      v_character_id,
      'public',
      'perk_use',
      public.odyssey_character_display_name(v_character_id) || ' uses perk "' || v_perk.name || '".',
      jsonb_build_object('perk_code', v_perk.code, 'gm_hint', coalesce(v_perk.description, 'GM resolves this perk.')),
      jsonb_build_object('perk_code', v_perk.code),
      v_created_by
    );

    return jsonb_build_object(
      'ok', true,
      'perk_code', v_perk.code,
      'message', 'Perk use recorded.',
      'gm_hint', coalesce(v_perk.description, 'GM resolves this perk.'),
      'log_id', v_log_id
    );
  end if;

  if v_character_weapon_id is null then
    return jsonb_build_object('ok', false, 'error', 'WEAPON_REQUIRED', 'message', 'character_weapon_id is required for this perk.');
  end if;

  v_lock_state := public.odyssey_get_weapon_lock_state(v_character_id, v_character_weapon_id);
  if coalesce((v_lock_state->>'locked')::boolean, false)
     or coalesce((v_lock_state->>'actor_attack_locked')::boolean, false) then
    return jsonb_build_object(
      'ok', false,
      'error', coalesce(v_lock_state->>'error', 'WEAPON_LOCKED'),
      'message', coalesce(v_lock_state->>'message', 'Weapon is locked.')
    );
  end if;

  v_weapon_context := public.odyssey_get_weapon_runtime_context(v_character_weapon_id);
  if coalesce((v_weapon_context->>'ok')::boolean, false) = false then
    return v_weapon_context;
  end if;

  if not (
    coalesce(v_weapon_context->'weapon_tags', '[]'::jsonb) ? 'rifle'
    or coalesce(v_weapon_context->'weapon_tags', '[]'::jsonb) ? 'sniper'
    or coalesce(v_weapon_context->'weapon_tags', '[]'::jsonb) ? 'precision'
  ) then
    return jsonb_build_object('ok', false, 'error', 'WEAPON_NOT_COMPATIBLE', 'message', 'Weapon is not compatible with this perk.');
  end if;

  v_effect_key := public.odyssey_build_perk_weapon_effect_key('patient_hunter', v_character_weapon_id);

  select *
  into v_existing_effect
  from public.odyssey_character_effects e
  where e.character_id = v_character_id
    and e.effect_key = v_effect_key
    and e.is_active = true
  order by e.updated_at desc, e.id desc
  limit 1
  for update;

  v_stack := least(coalesce(nullif(v_existing_effect.data->>'stack_count', '')::integer, 0) + 1, 5);
  v_bonus := least(v_stack * 20, 100);

  if found then
    update public.odyssey_character_effects
    set
      data = coalesce(data, '{}'::jsonb)
        || jsonb_build_object(
          'perk_code', 'patient_hunter',
          'character_weapon_id', v_character_weapon_id::text,
          'stack_count', v_stack,
          'accuracy_bonus', v_bonus
        ),
      updated_at = timezone('utc', now())
    where id = v_existing_effect.id
    returning id into v_effect_id;
  else
    insert into public.odyssey_character_effects (
      character_id,
      effect_key,
      name,
      description,
      source,
      source_type,
      source_id,
      source_character_id,
      duration_type,
      rounds_left,
      data,
      is_active,
      created_by
    )
    values (
      v_character_id,
      v_effect_key,
      v_perk.name,
      v_perk.description,
      'perk',
      'perk',
      v_perk.perk_def_id,
      v_character_id,
      'scene',
      null,
      jsonb_build_object(
        'perk_code', 'patient_hunter',
        'character_weapon_id', v_character_weapon_id::text,
        'stack_count', v_stack,
        'accuracy_bonus', v_bonus
      ),
      true,
      v_created_by
    )
    returning id into v_effect_id;
  end if;

  v_log_id := public.odyssey_combat_log_insert(
    coalesce(v_character.campaign_id, ''),
    coalesce(v_character.room_id, ''),
    v_scene_id,
    v_encounter_id,
    null,
    v_character_id,
    null,
    v_character_id,
    'public',
    'perk_use',
    public.odyssey_character_display_name(v_character_id) || ' prepares a patient shot.',
    jsonb_build_object(
      'perk_code', 'patient_hunter',
      'character_weapon_id', v_character_weapon_id,
      'stack_count', v_stack,
      'accuracy_bonus', v_bonus
    ),
    jsonb_build_object(
      'perk_code', 'patient_hunter',
      'stack_count', v_stack,
      'accuracy_bonus', v_bonus
    ),
    v_created_by
  );

  return jsonb_build_object(
    'ok', true,
    'perk_code', 'patient_hunter',
    'effect_id', v_effect_id,
    'stack_count', v_stack,
    'accuracy_bonus', v_bonus,
    'force_end_turn', true,
    'log_id', v_log_id
  );
end;
$$;

do $$
begin
  if to_regprocedure('public.activate_weapon_feature(jsonb)') is not null
     and to_regprocedure('public.odyssey_activate_weapon_feature_legacy(jsonb)') is null then
    alter function public.activate_weapon_feature(jsonb)
      rename to odyssey_activate_weapon_feature_legacy;
  end if;
end;
$$;

create or replace function public.activate_weapon_feature(
  p_payload jsonb
)
returns jsonb
language plpgsql
as $$
declare
  v_character_weapon_id uuid := public.odyssey_try_parse_uuid(p_payload->>'character_weapon_id');
  v_character_id uuid := null;
  v_lock_state jsonb := '{}'::jsonb;
begin
  if v_character_weapon_id is not null then
    select character_id into v_character_id
    from public.odyssey_character_weapons
    where id = v_character_weapon_id;

    if v_character_id is not null then
      v_lock_state := public.odyssey_get_weapon_lock_state(v_character_id, v_character_weapon_id);
      if coalesce((v_lock_state->>'locked')::boolean, false)
         or coalesce((v_lock_state->>'actor_attack_locked')::boolean, false) then
        return jsonb_build_object(
          'ok', false,
          'error', coalesce(v_lock_state->>'error', 'WEAPON_LOCKED'),
          'message', coalesce(v_lock_state->>'message', 'Weapon is locked.')
        );
      end if;
    end if;
  end if;

  return public.odyssey_activate_weapon_feature_legacy(p_payload);
end;
$$;

do $$
begin
  if to_regprocedure('public.use_ability(jsonb)') is not null
     and to_regprocedure('public.odyssey_use_ability_legacy(jsonb)') is null then
    alter function public.use_ability(jsonb)
      rename to odyssey_use_ability_legacy;
  end if;
end;
$$;

create or replace function public.use_ability(
  p_payload jsonb
)
returns jsonb
language plpgsql
as $$
declare
  v_character_weapon_id uuid := public.odyssey_try_parse_uuid(p_payload->>'character_weapon_id');
  v_character_id uuid := public.odyssey_try_parse_uuid(coalesce(p_payload->>'character_id', p_payload->>'attacker_character_id'));
  v_lock_state jsonb := '{}'::jsonb;
begin
  if v_character_weapon_id is not null and v_character_id is not null then
    v_lock_state := public.odyssey_get_weapon_lock_state(v_character_id, v_character_weapon_id);
    if coalesce((v_lock_state->>'locked')::boolean, false)
       or coalesce((v_lock_state->>'actor_attack_locked')::boolean, false) then
      return jsonb_build_object(
        'ok', false,
        'error', coalesce(v_lock_state->>'error', 'WEAPON_LOCKED'),
        'message', coalesce(v_lock_state->>'message', 'Weapon is locked.')
      );
    end if;
  end if;

  return public.odyssey_use_ability_legacy(p_payload);
end;
$$;

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
  v_weapon_id uuid := public.odyssey_try_parse_uuid(v_payload->>'weapon_id');
  v_character_weapon_id uuid := public.odyssey_try_parse_uuid(coalesce(v_payload->>'character_weapon_id', v_payload->>'weapon_id'));
  v_distance_m numeric := greatest(coalesce(nullif(trim(coalesce(v_payload->>'distance_m', '')), '')::numeric, 0), 0);
  v_encounter_id uuid := public.odyssey_try_parse_uuid(v_payload->>'encounter_id');
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
  v_post_hooks jsonb := jsonb_build_object('ok', true);
  v_refresh_attacker boolean := false;
  v_target_alive_before boolean := true;
  v_target_alive_after boolean := true;
  v_target_movement_version integer := 0;
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
    end if;

    return public.odyssey_perform_ability_attack(v_payload);
  end if;

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
  v_result := public.odyssey_perform_weapon_attack(v_payload);

  if coalesce((v_result->>'ok')::boolean, false) = true then
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

    if v_refresh_attacker and v_attacker_character_id is not null then
      v_result := v_result || jsonb_build_object(
        'attacker_state',
        coalesce(public.odyssey_refresh_character_combat_state(v_attacker_character_id)->'combat_state', '{}'::jsonb),
        'post_attack_perks',
          jsonb_build_object(
            'consumed_effect_ids', coalesce(v_perk_context_result->'consume_effect_ids', '[]'::jsonb),
            'retry_effect', v_retry_effect,
            'post_hooks', v_post_hooks
          )
      );
    else
      v_result := v_result || jsonb_build_object(
        'post_attack_perks',
          jsonb_build_object(
            'consumed_effect_ids', coalesce(v_perk_context_result->'consume_effect_ids', '[]'::jsonb),
            'retry_effect', v_retry_effect,
            'post_hooks', v_post_hooks
          )
      );
    end if;

    return public.odyssey_finalize_attack_result(v_result, v_target_character_id, v_target_body_part_id);
  end if;

  return v_result;
end;
$$;

grant execute on function public.get_effective_character_stats(uuid) to anon, authenticated;
grant execute on function public.odyssey_get_weapon_runtime_context(uuid) to anon, authenticated;
grant execute on function public.odyssey_get_weapon_lock_state(uuid, uuid) to anon, authenticated;
grant execute on function public.odyssey_get_character_attack_perk_context(uuid, uuid, uuid, uuid, numeric, text, text, uuid) to anon, authenticated;
grant execute on function public.odyssey_grant_first_time_no_retry_effect(uuid, uuid, uuid, integer, text) to anon, authenticated;
grant execute on function public.odyssey_apply_perk_post_attack_hooks(jsonb) to anon, authenticated;
grant execute on function public.use_character_perk(jsonb) to anon, authenticated;
grant execute on function public.activate_weapon_feature(jsonb) to anon, authenticated;
grant execute on function public.use_ability(jsonb) to anon, authenticated;
grant execute on function public.perform_attack(jsonb) to anon, authenticated;
grant execute on function public.get_character_armory(uuid) to anon, authenticated;
grant execute on function public.get_character_runtime_bundle(jsonb) to anon, authenticated;
