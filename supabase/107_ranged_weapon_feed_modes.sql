-- ===== BEGIN 107_ranged_weapon_feed_modes.sql =====
-- Feed mode is now defined per weapon profile:
-- - detachable_magazine
-- - internal_magazine
--
-- Detachable magazines keep the existing behavior.
-- Internal magazines store ammo directly in odyssey_character_weapon_profile_states.

alter table public.odyssey_weapon_model_profiles
  add column if not exists feed_mode text not null default 'detachable_magazine'
    check (feed_mode in ('detachable_magazine', 'internal_magazine'));

alter table public.odyssey_weapon_model_profiles
  add column if not exists internal_capacity integer null
    check (internal_capacity is null or internal_capacity >= 0);

alter table public.odyssey_character_weapon_profile_states
  add column if not exists internal_ammo_type_id uuid null references public.odyssey_ammo_type_defs(id) on delete set null;

alter table public.odyssey_character_weapon_profile_states
  add column if not exists internal_current_rounds integer not null default 0
    check (internal_current_rounds >= 0);

alter table public.odyssey_character_weapon_profile_states
  add column if not exists internal_max_rounds integer not null default 0
    check (internal_max_rounds >= 0);

update public.odyssey_weapon_model_profiles
set
  feed_mode = case
    when coalesce(feed_mode, '') in ('detachable_magazine', 'internal_magazine') then feed_mode
    else 'detachable_magazine'
  end,
  internal_capacity = case
    when coalesce(feed_mode, 'detachable_magazine') = 'internal_magazine'
      then greatest(coalesce(internal_capacity, 0), 0)
    else null
  end
where true;

update public.odyssey_character_weapon_profile_states state
set
  internal_max_rounds = case
    when coalesce(profile.feed_mode, 'detachable_magazine') = 'internal_magazine'
      then greatest(coalesce(profile.internal_capacity, 0), 0)
    else 0
  end,
  internal_current_rounds = greatest(coalesce(state.internal_current_rounds, 0), 0),
  internal_ammo_type_id = case
    when greatest(coalesce(state.internal_current_rounds, 0), 0) <= 0 then null
    else state.internal_ammo_type_id
  end,
  loaded_magazine_id = case
    when coalesce(profile.feed_mode, 'detachable_magazine') = 'internal_magazine' then null
    else state.loaded_magazine_id
  end
from public.odyssey_weapon_model_profiles profile
where profile.id = state.profile_id;

create or replace function public.odyssey_is_internal_ammo_compatible_with_profile(
  p_profile_id uuid,
  p_ammo_type_id uuid
)
returns boolean
language sql
stable
set search_path = public
as $$
  with profile_row as (
    select coalesce(p.caliber_id, wm.caliber_id) as caliber_id
    from public.odyssey_weapon_model_profiles p
    join public.odyssey_weapon_model_defs wm on wm.id = p.weapon_model_id
    where p.id = p_profile_id
  )
  select exists (
    select 1
    from profile_row pr
    join public.odyssey_ammo_type_defs ammo on ammo.id = p_ammo_type_id
    where pr.caliber_id is not null
      and ammo.caliber_id = pr.caliber_id
  );
$$;

create or replace function public.odyssey_ensure_default_weapon_profile(
  p_weapon_model_id uuid
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_profile_id uuid := null;
begin
  select p.id
  into v_profile_id
  from public.odyssey_weapon_model_profiles p
  where p.weapon_model_id = p_weapon_model_id
    and p.is_default = true
  order by p.sort_order, p.created_at, p.id
  limit 1;

  if v_profile_id is not null then
    return v_profile_id;
  end if;

  insert into public.odyssey_weapon_model_profiles (
    weapon_model_id,
    code,
    name,
    description,
    weapon_class_id,
    linked_skill_id,
    caliber_id,
    range_profile_id,
    accuracy_modifier,
    base_melee_damage,
    attack_type,
    feed_mode,
    internal_capacity,
    is_default,
    data,
    tags,
    sort_order
  )
  select
    wm.id,
    'default',
    'Default',
    'Auto-generated default weapon profile.',
    wm.weapon_class_id,
    wm.linked_skill_id,
    wm.caliber_id,
    wm.range_profile_id,
    wm.base_accuracy_bonus,
    coalesce(wm.base_melee_damage, 0),
    case
      when wm.caliber_id is null then 'melee'
      else 'ranged'
    end,
    'detachable_magazine',
    null,
    true,
    '{}'::jsonb,
    coalesce(wm.tags, '[]'::jsonb),
    0
  from public.odyssey_weapon_model_defs wm
  where wm.id = p_weapon_model_id
  on conflict (weapon_model_id, code) do update
  set
    name = excluded.name,
    description = excluded.description,
    weapon_class_id = excluded.weapon_class_id,
    linked_skill_id = excluded.linked_skill_id,
    caliber_id = excluded.caliber_id,
    range_profile_id = excluded.range_profile_id,
    accuracy_modifier = excluded.accuracy_modifier,
    base_melee_damage = excluded.base_melee_damage,
    attack_type = excluded.attack_type,
    feed_mode = coalesce(public.odyssey_weapon_model_profiles.feed_mode, excluded.feed_mode),
    internal_capacity = case
      when coalesce(public.odyssey_weapon_model_profiles.feed_mode, excluded.feed_mode) = 'internal_magazine'
        then greatest(coalesce(public.odyssey_weapon_model_profiles.internal_capacity, excluded.internal_capacity, 0), 0)
      else null
    end,
    is_default = true,
    data = excluded.data,
    tags = excluded.tags,
    sort_order = excluded.sort_order
  returning id into v_profile_id;

  update public.odyssey_weapon_model_profiles
  set is_default = (id = v_profile_id)
  where weapon_model_id = p_weapon_model_id
    and is_default is distinct from (id = v_profile_id);

  return v_profile_id;
end;
$$;

create or replace function public.initialize_character_weapon_profile_states(
  p_character_weapon_id uuid
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_weapon public.odyssey_character_weapons%rowtype;
  v_default_profile_id uuid := null;
  v_active_profile_id uuid := null;
begin
  select *
  into v_weapon
  from public.odyssey_character_weapons w
  where w.id = p_character_weapon_id;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'error', 'WEAPON_NOT_FOUND',
      'weapon_id', p_character_weapon_id
    );
  end if;

  v_default_profile_id := public.odyssey_ensure_default_weapon_profile(v_weapon.weapon_model_id);
  v_active_profile_id := coalesce(v_weapon.active_profile_id, v_default_profile_id);

  if not exists(
    select 1
    from public.odyssey_weapon_model_profiles p
    where p.id = v_active_profile_id
      and p.weapon_model_id = v_weapon.weapon_model_id
  ) then
    v_active_profile_id := v_default_profile_id;
  end if;

  insert into public.odyssey_character_weapon_profile_states (
    character_weapon_id,
    profile_id,
    loaded_magazine_id,
    selected_fire_mode_id,
    internal_ammo_type_id,
    internal_current_rounds,
    internal_max_rounds,
    is_active,
    data
  )
  select
    v_weapon.id,
    p.id,
    case
      when coalesce(p.feed_mode, 'detachable_magazine') <> 'internal_magazine'
           and p.id = v_active_profile_id
        then v_weapon.loaded_magazine_id
      else null
    end,
    case
      when p.id = v_active_profile_id
           and v_weapon.selected_fire_mode_id is not null
           and public.odyssey_is_fire_mode_allowed_for_profile(p.id, v_weapon.selected_fire_mode_id)
        then v_weapon.selected_fire_mode_id
      else public.odyssey_get_default_profile_fire_mode_id(p.id)
    end,
    null,
    0,
    case
      when coalesce(p.feed_mode, 'detachable_magazine') = 'internal_magazine'
        then greatest(coalesce(p.internal_capacity, 0), 0)
      else 0
    end,
    p.id = v_active_profile_id,
    '{}'::jsonb
  from public.odyssey_weapon_model_profiles p
  where p.weapon_model_id = v_weapon.weapon_model_id
  on conflict (character_weapon_id, profile_id) do nothing;

  update public.odyssey_character_weapon_profile_states state
  set
    is_active = (state.profile_id = v_active_profile_id),
    internal_max_rounds = case
      when coalesce(profile.feed_mode, 'detachable_magazine') = 'internal_magazine'
        then greatest(coalesce(profile.internal_capacity, 0), 0)
      else 0
    end,
    loaded_magazine_id = case
      when coalesce(profile.feed_mode, 'detachable_magazine') = 'internal_magazine' then null
      when state.profile_id = v_active_profile_id then state.loaded_magazine_id
      else state.loaded_magazine_id
    end,
    internal_ammo_type_id = case
      when greatest(coalesce(state.internal_current_rounds, 0), 0) <= 0 then null
      else state.internal_ammo_type_id
    end
  from public.odyssey_weapon_model_profiles profile
  where profile.id = state.profile_id
    and state.character_weapon_id = v_weapon.id;

  update public.odyssey_character_weapons
  set active_profile_id = v_active_profile_id
  where id = v_weapon.id
    and active_profile_id is distinct from v_active_profile_id;

  return public.odyssey_sync_character_weapon_profile_cache(v_weapon.id);
end;
$$;

create or replace function public.odyssey_sync_character_weapon_profile_cache(
  p_character_weapon_id uuid
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_weapon public.odyssey_character_weapons%rowtype;
  v_default_profile_id uuid := null;
  v_active_state record;
  v_resolved_fire_mode_id uuid := null;
  v_resolved_magazine_id uuid := null;
  v_resolved_internal_ammo_type_id uuid := null;
  v_resolved_internal_current_rounds integer := 0;
  v_resolved_internal_max_rounds integer := 0;
begin
  select *
  into v_weapon
  from public.odyssey_character_weapons w
  where w.id = p_character_weapon_id;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'error', 'WEAPON_NOT_FOUND',
      'weapon_id', p_character_weapon_id
    );
  end if;

  v_default_profile_id := public.odyssey_ensure_default_weapon_profile(v_weapon.weapon_model_id);

  if v_weapon.active_profile_id is null then
    update public.odyssey_character_weapons
    set active_profile_id = v_default_profile_id
    where id = v_weapon.id;

    v_weapon.active_profile_id := v_default_profile_id;
  end if;

  select
    s.*,
    coalesce(p.feed_mode, 'detachable_magazine') as feed_mode,
    greatest(coalesce(p.internal_capacity, 0), 0) as profile_internal_capacity
  into v_active_state
  from public.odyssey_character_weapon_profile_states s
  join public.odyssey_weapon_model_profiles p on p.id = s.profile_id
  where s.character_weapon_id = v_weapon.id
    and s.profile_id = coalesce(v_weapon.active_profile_id, v_default_profile_id)
  limit 1;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'error', 'PROFILE_STATE_NOT_FOUND',
      'weapon_id', p_character_weapon_id,
      'profile_id', coalesce(v_weapon.active_profile_id, v_default_profile_id)
    );
  end if;

  update public.odyssey_character_weapon_profile_states
  set is_active = (id = v_active_state.id)
  where character_weapon_id = v_weapon.id
    and is_active is distinct from (id = v_active_state.id);

  if v_active_state.selected_fire_mode_id is not null
     and public.odyssey_is_fire_mode_allowed_for_profile(v_active_state.profile_id, v_active_state.selected_fire_mode_id) then
    v_resolved_fire_mode_id := v_active_state.selected_fire_mode_id;
  else
    v_resolved_fire_mode_id := public.odyssey_get_default_profile_fire_mode_id(v_active_state.profile_id);

    update public.odyssey_character_weapon_profile_states
    set selected_fire_mode_id = v_resolved_fire_mode_id
    where id = v_active_state.id
      and selected_fire_mode_id is distinct from v_resolved_fire_mode_id;
  end if;

  if v_active_state.feed_mode = 'internal_magazine' then
    v_resolved_magazine_id := null;
    v_resolved_internal_max_rounds := greatest(coalesce(v_active_state.internal_max_rounds, v_active_state.profile_internal_capacity, 0), 0);
    v_resolved_internal_current_rounds := greatest(least(coalesce(v_active_state.internal_current_rounds, 0), v_resolved_internal_max_rounds), 0);
    v_resolved_internal_ammo_type_id := v_active_state.internal_ammo_type_id;

    if v_resolved_internal_current_rounds <= 0 then
      v_resolved_internal_current_rounds := 0;
      v_resolved_internal_ammo_type_id := null;
    elsif v_resolved_internal_ammo_type_id is not null
      and not public.odyssey_is_internal_ammo_compatible_with_profile(v_active_state.profile_id, v_resolved_internal_ammo_type_id) then
      v_resolved_internal_current_rounds := 0;
      v_resolved_internal_ammo_type_id := null;
    end if;

    update public.odyssey_character_weapon_profile_states
    set
      loaded_magazine_id = null,
      internal_ammo_type_id = v_resolved_internal_ammo_type_id,
      internal_current_rounds = v_resolved_internal_current_rounds,
      internal_max_rounds = v_resolved_internal_max_rounds
    where id = v_active_state.id
      and (
        loaded_magazine_id is not null
        or internal_ammo_type_id is distinct from v_resolved_internal_ammo_type_id
        or internal_current_rounds is distinct from v_resolved_internal_current_rounds
        or internal_max_rounds is distinct from v_resolved_internal_max_rounds
      );
  else
    if v_active_state.loaded_magazine_id is not null
       and public.odyssey_is_magazine_compatible_with_profile(v_active_state.profile_id, v_active_state.loaded_magazine_id) then
      v_resolved_magazine_id := v_active_state.loaded_magazine_id;
    else
      v_resolved_magazine_id := null;

      update public.odyssey_character_weapon_profile_states
      set loaded_magazine_id = null
      where id = v_active_state.id
        and loaded_magazine_id is not null;
    end if;
  end if;

  update public.odyssey_character_weapons
  set
    active_profile_id = v_active_state.profile_id,
    loaded_magazine_id = v_resolved_magazine_id,
    selected_fire_mode_id = v_resolved_fire_mode_id
  where id = v_weapon.id
    and (
      active_profile_id is distinct from v_active_state.profile_id
      or loaded_magazine_id is distinct from v_resolved_magazine_id
      or selected_fire_mode_id is distinct from v_resolved_fire_mode_id
    );

  return jsonb_build_object(
    'ok', true,
    'weapon_id', v_weapon.id,
    'active_profile_id', v_active_state.profile_id,
    'feed_mode', v_active_state.feed_mode,
    'loaded_magazine_id', v_resolved_magazine_id,
    'selected_fire_mode_id', v_resolved_fire_mode_id,
    'internal_ammo_type_id', v_resolved_internal_ammo_type_id,
    'internal_current_rounds', v_resolved_internal_current_rounds,
    'internal_max_rounds', v_resolved_internal_max_rounds
  );
end;
$$;

create or replace function public.odyssey_get_character_weapon_profile(
  p_character_weapon_id uuid,
  p_profile_id uuid
)
returns jsonb
language sql
stable
set search_path = public
as $$
  with weapon_row as (
    select
      w.id,
      w.weapon_model_id,
      w.active_profile_id,
      w.loaded_magazine_id,
      w.selected_fire_mode_id
    from public.odyssey_character_weapons w
    where w.id = p_character_weapon_id
  ),
  profile_rows as (
    select
      p.id,
      p.weapon_model_id,
      p.code,
      p.name,
      p.description,
      p.attack_type,
      coalesce(p.feed_mode, 'detachable_magazine') as feed_mode,
      greatest(coalesce(p.internal_capacity, 0), 0) as internal_capacity,
      p.data,
      p.tags,
      p.sort_order,
      p.is_default,
      coalesce(pwc.code, mwc.code) as weapon_class_code,
      coalesce(pwc.name, mwc.name) as weapon_class_name,
      coalesce(pskill.code, mskill.code) as linked_skill_code,
      coalesce(pskill.name, mskill.name) as linked_skill_name,
      coalesce(pcal.code, mcal.code) as caliber_code,
      coalesce(pcal.name, mcal.name) as caliber_name,
      coalesce(prp.code, mrp.code) as range_profile_code,
      coalesce(prp.name, mrp.name) as range_profile_name,
      coalesce(p.accuracy_modifier, wm.base_accuracy_bonus) as accuracy_modifier,
      coalesce(p.base_melee_damage, wm.base_melee_damage) as base_melee_damage,
      coalesce(pcal.base_damage_per_round, mcal.base_damage_per_round, 0) as base_damage_per_round,
      case
        when coalesce(p.feed_mode, 'detachable_magazine') = 'internal_magazine' then null
        when s.id is not null then s.loaded_magazine_id
        when coalesce(w.active_profile_id = p.id, p.is_default) then w.loaded_magazine_id
        else null
      end as candidate_loaded_magazine_id,
      case
        when s.id is not null
             and s.selected_fire_mode_id is not null
             and public.odyssey_is_fire_mode_allowed_for_profile(p.id, s.selected_fire_mode_id)
          then s.selected_fire_mode_id
        when coalesce(w.active_profile_id = p.id, p.is_default)
             and w.selected_fire_mode_id is not null
             and public.odyssey_is_fire_mode_allowed_for_profile(p.id, w.selected_fire_mode_id)
          then w.selected_fire_mode_id
        else public.odyssey_get_default_profile_fire_mode_id(p.id)
      end as candidate_selected_fire_mode_id,
      coalesce(s.internal_ammo_type_id, null) as candidate_internal_ammo_type_id,
      greatest(coalesce(s.internal_current_rounds, 0), 0) as candidate_internal_current_rounds,
      greatest(coalesce(s.internal_max_rounds, p.internal_capacity, 0), 0) as candidate_internal_max_rounds,
      coalesce(
        s.is_active,
        case
          when w.active_profile_id is not null then w.active_profile_id = p.id
          else p.is_default
        end,
        false
      ) as is_active
    from weapon_row w
    join public.odyssey_weapon_model_profiles p
      on p.weapon_model_id = w.weapon_model_id
     and p.id = p_profile_id
    join public.odyssey_weapon_model_defs wm on wm.id = w.weapon_model_id
    left join public.odyssey_weapon_class_defs pwc on pwc.id = p.weapon_class_id
    left join public.odyssey_weapon_class_defs mwc on mwc.id = wm.weapon_class_id
    left join public.odyssey_skill_defs pskill on pskill.id = p.linked_skill_id
    left join public.odyssey_skill_defs mskill on mskill.id = wm.linked_skill_id
    left join public.odyssey_caliber_defs pcal on pcal.id = p.caliber_id
    left join public.odyssey_caliber_defs mcal on mcal.id = wm.caliber_id
    left join public.odyssey_range_profile_defs prp on prp.id = p.range_profile_id
    left join public.odyssey_range_profile_defs mrp on mrp.id = wm.range_profile_id
    left join public.odyssey_character_weapon_profile_states s
      on s.character_weapon_id = w.id
     and s.profile_id = p.id
  ),
  resolved_profile as (
    select
      pr.*,
      case
        when pr.feed_mode = 'internal_magazine' then null
        when pr.candidate_loaded_magazine_id is not null
             and public.odyssey_is_magazine_compatible_with_profile(pr.id, pr.candidate_loaded_magazine_id)
          then pr.candidate_loaded_magazine_id
        else null
      end as loaded_magazine_id,
      case
        when pr.candidate_selected_fire_mode_id is not null
             and public.odyssey_is_fire_mode_allowed_for_profile(pr.id, pr.candidate_selected_fire_mode_id)
          then pr.candidate_selected_fire_mode_id
        else public.odyssey_get_default_profile_fire_mode_id(pr.id)
      end as selected_fire_mode_id,
      case
        when pr.feed_mode = 'internal_magazine' then greatest(pr.candidate_internal_max_rounds, pr.internal_capacity, 0)
        else 0
      end as internal_max_rounds,
      case
        when pr.feed_mode = 'internal_magazine'
          then greatest(least(pr.candidate_internal_current_rounds, greatest(pr.candidate_internal_max_rounds, pr.internal_capacity, 0)), 0)
        else 0
      end as internal_current_rounds
    from profile_rows pr
  )
  select coalesce(
    (
      select jsonb_build_object(
        'id', pr.id,
        'code', pr.code,
        'name', pr.name,
        'description', pr.description,
        'attack_type', pr.attack_type,
        'feed_mode', pr.feed_mode,
        'internal_capacity', pr.internal_capacity,
        'weapon_class', pr.weapon_class_code,
        'weapon_class_name', pr.weapon_class_name,
        'linked_skill', pr.linked_skill_code,
        'linked_skill_name', pr.linked_skill_name,
        'caliber', pr.caliber_code,
        'caliber_name', pr.caliber_name,
        'range_profile', pr.range_profile_code,
        'range_profile_name', pr.range_profile_name,
        'accuracy_modifier', pr.accuracy_modifier,
        'base_melee_damage', pr.base_melee_damage,
        'base_damage_per_round', pr.base_damage_per_round,
        'data', pr.data,
        'tags', pr.tags,
        'sort_order', pr.sort_order,
        'is_default', pr.is_default,
        'is_active', pr.is_active,
        'loaded_magazine',
          case
            when cm.id is null then null
            else jsonb_build_object(
              'id', cm.id,
              'name', coalesce(nullif(trim(cm.custom_name), ''), md.name),
              'custom_name', cm.custom_name,
              'current_rounds', cm.current_rounds,
              'capacity', md.capacity,
              'ammo_type', ammo.code,
              'ammo_type_name', ammo.name,
              'magazine_def', md.code,
              'magazine_def_name', md.name
            )
          end,
        'selected_fire_mode',
          case
            when fm.id is null then null
            else jsonb_build_object(
              'id', fm.id,
              'code', fm.code,
              'name', fm.name,
              'fixed_rounds', fm.fixed_rounds,
              'min_rounds', fm.min_rounds,
              'max_rounds', fm.max_rounds,
              'is_random', fm.is_random,
              'accuracy_modifier', fm.accuracy_modifier
            )
          end,
        'internal_ammo_type',
          case
            when pr.feed_mode <> 'internal_magazine'
              or pr.internal_current_rounds <= 0
              or pr.candidate_internal_ammo_type_id is null
              or not public.odyssey_is_internal_ammo_compatible_with_profile(pr.id, pr.candidate_internal_ammo_type_id)
              then null
            else jsonb_build_object(
              'id', iammo.id,
              'code', iammo.code,
              'name', iammo.name,
              'caliber', ical.code,
              'caliber_name', ical.name
            )
          end,
        'internal_current_rounds',
          case when pr.feed_mode = 'internal_magazine' then pr.internal_current_rounds else 0 end,
        'internal_max_rounds',
          case when pr.feed_mode = 'internal_magazine' then pr.internal_max_rounds else 0 end,
        'ammo',
          case
            when pr.feed_mode = 'internal_magazine' then jsonb_build_object(
              'current_rounds', pr.internal_current_rounds,
              'max_rounds', pr.internal_max_rounds,
              'ammo_type', iammo.code,
              'ammo_type_code', iammo.code,
              'ammo_type_name', iammo.name,
              'caliber', ical.code,
              'caliber_name', ical.name
            )
            when cm.id is null then null
            else jsonb_build_object(
              'current_rounds', cm.current_rounds,
              'max_rounds', md.capacity,
              'ammo_type', ammo.code,
              'ammo_type_code', ammo.code,
              'ammo_type_name', ammo.name,
              'caliber', cmdc.code,
              'caliber_name', cmdc.name
            )
          end,
        'available_fire_modes',
          coalesce(
            (
              select jsonb_agg(
                jsonb_build_object(
                  'id', afm.id,
                  'code', afm.code,
                  'name', afm.name,
                  'fixed_rounds', afm.fixed_rounds,
                  'min_rounds', afm.min_rounds,
                  'max_rounds', afm.max_rounds,
                  'is_random', afm.is_random,
                  'accuracy_modifier', afm.accuracy_modifier,
                  'is_default', pfm.is_default
                )
                order by pfm.is_default desc, pfm.sort_order, afm.sort_order, afm.name
              )
              from public.odyssey_weapon_profile_fire_modes pfm
              join public.odyssey_fire_mode_defs afm on afm.id = pfm.fire_mode_id
              where pfm.profile_id = pr.id
            ),
            '[]'::jsonb
          ),
        'compatible_magazines',
          case
            when pr.feed_mode = 'internal_magazine' then '[]'::jsonb
            else coalesce(
              (
                select jsonb_agg(
                  jsonb_build_object(
                    'id', cmd.id,
                    'code', cmd.code,
                    'name', cmd.name,
                    'capacity', cmd.capacity,
                    'caliber', cmdc.code,
                    'caliber_name', cmdc.name,
                    'is_default', ppm.is_default
                  )
                  order by ppm.is_default desc, ppm.sort_order, cmd.sort_order, cmd.name
                )
                from public.odyssey_weapon_profile_magazines ppm
                join public.odyssey_magazine_defs cmd on cmd.id = ppm.magazine_def_id
                join public.odyssey_caliber_defs cmdc on cmdc.id = cmd.caliber_id
                where ppm.profile_id = pr.id
              ),
              '[]'::jsonb
            )
          end
      )
      from resolved_profile pr
      left join public.odyssey_character_magazines cm on cm.id = pr.loaded_magazine_id
      left join public.odyssey_magazine_defs md on md.id = cm.magazine_def_id
      left join public.odyssey_caliber_defs cmdc on cmdc.id = md.caliber_id
      left join public.odyssey_ammo_type_defs ammo on ammo.id = cm.ammo_type_id
      left join public.odyssey_fire_mode_defs fm on fm.id = pr.selected_fire_mode_id
      left join public.odyssey_ammo_type_defs iammo
        on iammo.id = pr.candidate_internal_ammo_type_id
       and pr.feed_mode = 'internal_magazine'
       and pr.internal_current_rounds > 0
       and public.odyssey_is_internal_ammo_compatible_with_profile(pr.id, pr.candidate_internal_ammo_type_id)
      left join public.odyssey_caliber_defs ical on ical.id = iammo.caliber_id
    ),
    null
  );
$$;

create or replace function public.load_weapon_profile_magazine(
  p_payload jsonb
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_character_weapon_id uuid := public.odyssey_try_parse_uuid(p_payload->>'character_weapon_id');
  v_profile_id uuid := public.odyssey_try_parse_uuid(p_payload->>'profile_id');
  v_character_magazine_id uuid := public.odyssey_try_parse_uuid(p_payload->>'character_magazine_id');
  v_weapon public.odyssey_character_weapons%rowtype;
  v_target_state_id uuid := null;
  v_target_feed_mode text := 'detachable_magazine';
  v_affected_weapons uuid[];
  v_item uuid;
  v_magazine public.odyssey_character_magazines%rowtype;
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

  perform public.initialize_character_weapon_profile_states(v_weapon.id);

  select
    s.id,
    coalesce(p.feed_mode, 'detachable_magazine')
  into
    v_target_state_id,
    v_target_feed_mode
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

  if v_target_feed_mode <> 'detachable_magazine' then
    return jsonb_build_object(
      'ok', false,
      'error', 'WEAPON_FEED_MODE_INVALID',
      'message', 'This weapon profile uses an internal magazine and cannot load detachable magazines.'
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

  return jsonb_build_object(
    'ok', true,
    'weapon_id', v_weapon.id,
    'profile_id', v_profile_id,
    'profile', public.odyssey_get_character_weapon_profile(v_weapon.id, v_profile_id),
    'armory', public.get_character_armory(v_weapon.character_id)
  );
end;
$$;

create or replace function public.unload_weapon_magazine(
  p_payload jsonb
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_character_weapon_id uuid := public.odyssey_try_parse_uuid(p_payload->>'character_weapon_id');
  v_profile_id uuid := public.odyssey_try_parse_uuid(p_payload->>'profile_id');
  v_weapon public.odyssey_character_weapons%rowtype;
  v_target_state_id uuid := null;
  v_target_feed_mode text := 'detachable_magazine';
  v_loaded_magazine_id uuid := null;
begin
  if v_character_weapon_id is null then
    return jsonb_build_object(
      'ok', false,
      'error', 'CHARACTER_WEAPON_ID_REQUIRED',
      'message', 'character_weapon_id is required.'
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

  perform public.initialize_character_weapon_profile_states(v_weapon.id);

  if v_profile_id is null then
    v_profile_id := v_weapon.active_profile_id;
  end if;

  select
    s.id,
    coalesce(p.feed_mode, 'detachable_magazine'),
    s.loaded_magazine_id
  into
    v_target_state_id,
    v_target_feed_mode,
    v_loaded_magazine_id
  from public.odyssey_character_weapon_profile_states s
  join public.odyssey_weapon_model_profiles p on p.id = s.profile_id
  where s.character_weapon_id = v_weapon.id
    and s.profile_id = v_profile_id
  limit 1;

  if v_target_state_id is null then
    return jsonb_build_object(
      'ok', false,
      'error', 'PROFILE_NOT_FOUND',
      'message', 'Selected profile was not found for this weapon.'
    );
  end if;

  if v_target_feed_mode <> 'detachable_magazine' then
    return jsonb_build_object(
      'ok', false,
      'error', 'WEAPON_FEED_MODE_INVALID',
      'message', 'This weapon profile uses an internal magazine and has no detachable magazine to unload.'
    );
  end if;

  if v_loaded_magazine_id is null then
    return jsonb_build_object(
      'ok', false,
      'error', 'NO_MAGAZINE',
      'message', 'No magazine is currently loaded.'
    );
  end if;

  update public.odyssey_character_weapon_profile_states
  set loaded_magazine_id = null
  where id = v_target_state_id;

  perform public.odyssey_sync_character_weapon_profile_cache(v_weapon.id);

  return jsonb_build_object(
    'ok', true,
    'weapon_id', v_weapon.id,
    'profile_id', v_profile_id,
    'character_magazine_id', v_loaded_magazine_id,
    'profile', public.odyssey_get_character_weapon_profile(v_weapon.id, v_profile_id),
    'armory', public.get_character_armory(v_weapon.character_id)
  );
end;
$$;

create or replace function public.load_weapon_internal_rounds(
  p_payload jsonb
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_character_weapon_id uuid := public.odyssey_try_parse_uuid(p_payload->>'character_weapon_id');
  v_profile_id uuid := public.odyssey_try_parse_uuid(p_payload->>'profile_id');
  v_ammo_stock_id uuid := public.odyssey_try_parse_uuid(p_payload->>'ammo_stock_id');
  v_quantity integer := greatest(coalesce(nullif(trim(coalesce(p_payload->>'quantity', '')), '')::integer, 0), 0);
  v_allow_partial boolean := coalesce(nullif(trim(coalesce(p_payload->>'allow_partial', '')), '')::boolean, false);
  v_weapon public.odyssey_character_weapons%rowtype;
  v_state record;
  v_stock record;
  v_capacity integer := 0;
  v_missing_rounds integer := 0;
  v_available_rounds integer := 0;
  v_requested_quantity integer := 0;
  v_loaded_quantity integer := 0;
  v_rounds_after integer := 0;
  v_stock_quantity_after integer := 0;
begin
  if v_character_weapon_id is null or v_profile_id is null or v_ammo_stock_id is null then
    return jsonb_build_object(
      'ok', false,
      'error', 'INVALID_PAYLOAD',
      'message', 'character_weapon_id, profile_id and ammo_stock_id are required.'
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

  perform public.initialize_character_weapon_profile_states(v_weapon.id);

  select
    s.id,
    s.character_weapon_id,
    s.profile_id,
    s.internal_ammo_type_id,
    greatest(coalesce(s.internal_current_rounds, 0), 0) as internal_current_rounds,
    greatest(coalesce(s.internal_max_rounds, p.internal_capacity, 0), 0) as internal_max_rounds,
    coalesce(p.feed_mode, 'detachable_magazine') as feed_mode,
    coalesce(p.caliber_id, wm.caliber_id) as caliber_id
  into v_state
  from public.odyssey_character_weapon_profile_states s
  join public.odyssey_weapon_model_profiles p on p.id = s.profile_id
  join public.odyssey_weapon_model_defs wm on wm.id = p.weapon_model_id
  where s.character_weapon_id = v_weapon.id
    and s.profile_id = v_profile_id
  for update of s;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'error', 'PROFILE_NOT_FOUND',
      'message', 'Selected profile was not found for this weapon.'
    );
  end if;

  if v_state.feed_mode <> 'internal_magazine' then
    return jsonb_build_object(
      'ok', false,
      'error', 'WEAPON_FEED_MODE_INVALID',
      'message', 'This weapon profile uses detachable magazines.'
    );
  end if;

  select
    s.id,
    s.character_id,
    s.display_name,
    s.caliber_id,
    s.ammo_type_id,
    s.quantity,
    ammo.code as ammo_type_code,
    ammo.name as ammo_type_name,
    ammo.caliber_id as ammo_caliber_id
  into v_stock
  from public.odyssey_character_ammo_stock s
  join public.odyssey_ammo_type_defs ammo on ammo.id = s.ammo_type_id
  where s.id = v_ammo_stock_id
  for update of s;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'error', 'AMMO_STOCK_NOT_FOUND',
      'message', 'Ammo stock was not found.'
    );
  end if;

  if v_stock.character_id <> v_weapon.character_id then
    return jsonb_build_object(
      'ok', false,
      'error', 'CHARACTER_MISMATCH',
      'message', 'Ammo stock does not belong to the weapon owner.'
    );
  end if;

  if v_state.caliber_id is null or v_stock.ammo_caliber_id is null or v_state.caliber_id <> v_stock.ammo_caliber_id then
    return jsonb_build_object(
      'ok', false,
      'error', 'CALIBER_MISMATCH',
      'message', 'Ammo caliber does not match the weapon profile caliber.'
    );
  end if;

  if v_state.internal_current_rounds > 0
     and v_state.internal_ammo_type_id is not null
     and v_state.internal_ammo_type_id <> v_stock.ammo_type_id then
    return jsonb_build_object(
      'ok', false,
      'error', 'WEAPON_HAS_DIFFERENT_AMMO_TYPE',
      'message', 'The internal magazine already contains a different ammo type.'
    );
  end if;

  v_capacity := greatest(coalesce(v_state.internal_max_rounds, 0), 0);
  v_missing_rounds := greatest(v_capacity - v_state.internal_current_rounds, 0);
  if v_missing_rounds <= 0 then
    return jsonb_build_object(
      'ok', false,
      'error', 'INTERNAL_MAGAZINE_FULL',
      'message', 'The internal magazine is already full.'
    );
  end if;

  v_available_rounds := greatest(coalesce(v_stock.quantity, 0), 0);
  if v_quantity <= 0 then
    v_requested_quantity := v_missing_rounds;
  else
    v_requested_quantity := least(v_quantity, v_missing_rounds);
  end if;

  if v_requested_quantity <= 0 then
    return jsonb_build_object(
      'ok', false,
      'error', 'INVALID_PAYLOAD',
      'message', 'Requested quantity must resolve to at least one round.'
    );
  end if;

  if v_available_rounds <= 0 then
    return jsonb_build_object(
      'ok', false,
      'error', 'NOT_ENOUGH_AMMO_STOCK',
      'requested_quantity', v_requested_quantity,
      'available_quantity', v_available_rounds
    );
  end if;

  if not v_allow_partial and v_available_rounds < v_requested_quantity then
    return jsonb_build_object(
      'ok', false,
      'error', 'NOT_ENOUGH_AMMO_STOCK',
      'requested_quantity', v_requested_quantity,
      'available_quantity', v_available_rounds
    );
  end if;

  v_loaded_quantity := least(v_requested_quantity, v_available_rounds);
  if v_loaded_quantity <= 0 then
    return jsonb_build_object(
      'ok', false,
      'error', 'NOT_ENOUGH_AMMO_STOCK',
      'requested_quantity', v_requested_quantity,
      'available_quantity', v_available_rounds
    );
  end if;

  v_rounds_after := v_state.internal_current_rounds + v_loaded_quantity;
  v_stock_quantity_after := greatest(v_available_rounds - v_loaded_quantity, 0);

  if v_stock_quantity_after <= 0 then
    delete from public.odyssey_character_ammo_stock
    where id = v_stock.id;
  else
    update public.odyssey_character_ammo_stock
    set quantity = v_stock_quantity_after
    where id = v_stock.id;
  end if;

  update public.odyssey_character_weapon_profile_states
  set
    internal_ammo_type_id = case
      when internal_current_rounds <= 0 then v_stock.ammo_type_id
      else internal_ammo_type_id
    end,
    internal_current_rounds = v_rounds_after,
    internal_max_rounds = v_capacity
  where id = v_state.id;

  perform public.odyssey_sync_character_weapon_profile_cache(v_weapon.id);

  return jsonb_build_object(
    'ok', true,
    'weapon_id', v_weapon.id,
    'profile_id', v_profile_id,
    'loaded_quantity', v_loaded_quantity,
    'requested_quantity', v_requested_quantity,
    'profile', public.odyssey_get_character_weapon_profile(v_weapon.id, v_profile_id),
    'armory', public.get_character_armory(v_weapon.character_id)
  );
end;
$$;

create or replace function public.unload_weapon_internal_rounds(
  p_payload jsonb
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_character_weapon_id uuid := public.odyssey_try_parse_uuid(p_payload->>'character_weapon_id');
  v_profile_id uuid := public.odyssey_try_parse_uuid(p_payload->>'profile_id');
  v_quantity integer := coalesce(nullif(trim(coalesce(p_payload->>'quantity', '')), '')::integer, 0);
  v_weapon public.odyssey_character_weapons%rowtype;
  v_state record;
  v_unload_quantity integer := 0;
  v_rounds_after integer := 0;
  v_stock record;
  v_stock_id uuid := null;
  v_stock_quantity_before integer := 0;
  v_stock_quantity_after integer := 0;
begin
  if v_character_weapon_id is null or v_profile_id is null then
    return jsonb_build_object(
      'ok', false,
      'error', 'INVALID_PAYLOAD',
      'message', 'character_weapon_id and profile_id are required.'
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

  perform public.initialize_character_weapon_profile_states(v_weapon.id);

  select
    s.id,
    s.character_weapon_id,
    s.profile_id,
    s.internal_ammo_type_id,
    greatest(coalesce(s.internal_current_rounds, 0), 0) as internal_current_rounds,
    greatest(coalesce(s.internal_max_rounds, p.internal_capacity, 0), 0) as internal_max_rounds,
    coalesce(p.feed_mode, 'detachable_magazine') as feed_mode,
    coalesce(p.caliber_id, wm.caliber_id) as caliber_id
  into v_state
  from public.odyssey_character_weapon_profile_states s
  join public.odyssey_weapon_model_profiles p on p.id = s.profile_id
  join public.odyssey_weapon_model_defs wm on wm.id = p.weapon_model_id
  where s.character_weapon_id = v_weapon.id
    and s.profile_id = v_profile_id
  for update of s;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'error', 'PROFILE_NOT_FOUND',
      'message', 'Selected profile was not found for this weapon.'
    );
  end if;

  if v_state.feed_mode <> 'internal_magazine' then
    return jsonb_build_object(
      'ok', false,
      'error', 'WEAPON_FEED_MODE_INVALID',
      'message', 'This weapon profile uses detachable magazines.'
    );
  end if;

  if v_state.internal_current_rounds <= 0 or v_state.internal_ammo_type_id is null then
    return jsonb_build_object(
      'ok', false,
      'error', 'NO_AMMO',
      'message', 'The internal magazine is empty.'
    );
  end if;

  if v_quantity <= 0 then
    v_unload_quantity := v_state.internal_current_rounds;
  else
    v_unload_quantity := least(v_quantity, v_state.internal_current_rounds);
  end if;

  if v_unload_quantity <= 0 then
    return jsonb_build_object(
      'ok', false,
      'error', 'INVALID_PAYLOAD',
      'message', 'Requested quantity must resolve to at least one round.'
    );
  end if;

  select *
  into v_stock
  from public.odyssey_character_ammo_stock s
  where s.character_id = v_weapon.character_id
    and s.caliber_id = v_state.caliber_id
    and s.ammo_type_id = v_state.internal_ammo_type_id
  order by s.created_at, s.id
  limit 1
  for update;

  if found then
    v_stock_id := v_stock.id;
    v_stock_quantity_before := coalesce(v_stock.quantity, 0);
    v_stock_quantity_after := v_stock_quantity_before + v_unload_quantity;

    update public.odyssey_character_ammo_stock
    set quantity = v_stock_quantity_after
    where id = v_stock_id;
  else
    insert into public.odyssey_character_ammo_stock (
      character_id,
      display_name,
      caliber_id,
      ammo_type_id,
      quantity
    )
    select
      v_weapon.character_id,
      coalesce(ammo.name, ammo.code),
      v_state.caliber_id,
      v_state.internal_ammo_type_id,
      v_unload_quantity
    from public.odyssey_ammo_type_defs ammo
    where ammo.id = v_state.internal_ammo_type_id
    returning id into v_stock_id;

    v_stock_quantity_before := 0;
    v_stock_quantity_after := v_unload_quantity;
  end if;

  v_rounds_after := greatest(v_state.internal_current_rounds - v_unload_quantity, 0);

  update public.odyssey_character_weapon_profile_states
  set
    internal_current_rounds = v_rounds_after,
    internal_ammo_type_id = case
      when v_rounds_after <= 0 then null
      else internal_ammo_type_id
    end,
    internal_max_rounds = greatest(coalesce(internal_max_rounds, 0), 0)
  where id = v_state.id;

  perform public.odyssey_sync_character_weapon_profile_cache(v_weapon.id);

  return jsonb_build_object(
    'ok', true,
    'weapon_id', v_weapon.id,
    'profile_id', v_profile_id,
    'unloaded_quantity', v_unload_quantity,
    'ammo_stock_id', v_stock_id,
    'profile', public.odyssey_get_character_weapon_profile(v_weapon.id, v_profile_id),
    'armory', public.get_character_armory(v_weapon.character_id)
  );
end;
$$;

create or replace function public.odyssey_creator_build_weapon_bundle(
  p_weapon_model_id uuid
)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  v_weapon jsonb := null;
  v_profiles jsonb := '[]'::jsonb;
  v_fire_modes jsonb := '[]'::jsonb;
  v_magazines jsonb := '[]'::jsonb;
  v_features jsonb := '[]'::jsonb;
  v_ability_links jsonb := '[]'::jsonb;
begin
  select jsonb_build_object(
    'id', wm.id,
    'code', wm.code,
    'name', wm.name,
    'weapon_class_id', wm.weapon_class_id,
    'weapon_class_code', wc.code,
    'weapon_class_name', wc.name,
    'linked_skill_id', wm.linked_skill_id,
    'linked_skill_code', skill.code,
    'linked_skill_name', skill.name,
    'caliber_id', wm.caliber_id,
    'caliber_code', caliber.code,
    'caliber_name', caliber.name,
    'range_profile_id', wm.range_profile_id,
    'range_profile_code', range_profile.code,
    'range_profile_name', range_profile.name,
    'base_accuracy_bonus', wm.base_accuracy_bonus,
    'base_melee_damage', coalesce(wm.base_melee_damage, 0),
    'description', coalesce(wm.description, ''),
    'tags', coalesce(wm.tags, '[]'::jsonb),
    'is_custom', wm.is_custom,
    'sort_order', wm.sort_order,
    'created_at', wm.created_at,
    'updated_at', wm.updated_at
  )
  into v_weapon
  from public.odyssey_weapon_model_defs wm
  left join public.odyssey_weapon_class_defs wc on wc.id = wm.weapon_class_id
  left join public.odyssey_skill_defs skill on skill.id = wm.linked_skill_id
  left join public.odyssey_caliber_defs caliber on caliber.id = wm.caliber_id
  left join public.odyssey_range_profile_defs range_profile on range_profile.id = wm.range_profile_id
  where wm.id = p_weapon_model_id;

  if v_weapon is null then
    return public.odyssey_creator_error(
      'WEAPON_NOT_FOUND',
      'Weapon model was not found.',
      jsonb_build_array(jsonb_build_object('field', 'id', 'message', 'Unknown weapon model id.'))
    );
  end if;

  select coalesce(
    jsonb_agg(profile_row.item order by profile_row.sort_order, profile_row.name, profile_row.code),
    '[]'::jsonb
  )
  into v_profiles
  from (
    select
      p.sort_order,
      p.name,
      p.code,
      jsonb_build_object(
        'id', p.id,
        'code', p.code,
        'name', p.name,
        'description', p.description,
        'attack_type', p.attack_type,
        'feed_mode', coalesce(p.feed_mode, 'detachable_magazine'),
        'internal_capacity', p.internal_capacity,
        'weapon_class_id', p.weapon_class_id,
        'weapon_class_code', wc.code,
        'weapon_class_name', wc.name,
        'linked_skill_id', p.linked_skill_id,
        'linked_skill_code', skill.code,
        'linked_skill_name', skill.name,
        'caliber_id', p.caliber_id,
        'caliber_code', caliber.code,
        'caliber_name', caliber.name,
        'range_profile_id', p.range_profile_id,
        'range_profile_code', range_profile.code,
        'range_profile_name', range_profile.name,
        'accuracy_modifier', p.accuracy_modifier,
        'base_melee_damage', p.base_melee_damage,
        'is_default', p.is_default,
        'sort_order', p.sort_order,
        'data', coalesce(p.data, '{}'::jsonb),
        'tags', coalesce(p.tags, '[]'::jsonb),
        'default_fire_mode_id',
          (
            select pfm.fire_mode_id
            from public.odyssey_weapon_profile_fire_modes pfm
            where pfm.profile_id = p.id
            order by pfm.is_default desc, pfm.sort_order, pfm.created_at, pfm.id
            limit 1
          ),
        'default_magazine_def_id',
          (
            select ppm.magazine_def_id
            from public.odyssey_weapon_profile_magazines ppm
            where ppm.profile_id = p.id
            order by ppm.is_default desc, ppm.sort_order, ppm.created_at, ppm.id
            limit 1
          ),
        'fire_mode_ids',
          coalesce(
            (
              select jsonb_agg(to_jsonb(pfm.fire_mode_id) order by pfm.sort_order, pfm.created_at, pfm.id)
              from public.odyssey_weapon_profile_fire_modes pfm
              where pfm.profile_id = p.id
            ),
            '[]'::jsonb
          ),
        'magazine_def_ids',
          coalesce(
            (
              select jsonb_agg(to_jsonb(ppm.magazine_def_id) order by ppm.sort_order, ppm.created_at, ppm.id)
              from public.odyssey_weapon_profile_magazines ppm
              where ppm.profile_id = p.id
            ),
            '[]'::jsonb
          )
      ) as item
    from public.odyssey_weapon_model_profiles p
    left join public.odyssey_weapon_class_defs wc on wc.id = p.weapon_class_id
    left join public.odyssey_skill_defs skill on skill.id = p.linked_skill_id
    left join public.odyssey_caliber_defs caliber on caliber.id = p.caliber_id
    left join public.odyssey_range_profile_defs range_profile on range_profile.id = p.range_profile_id
    where p.weapon_model_id = p_weapon_model_id
  ) profile_row;

  select coalesce(
    jsonb_agg(item order by sort_order, name, code),
    '[]'::jsonb
  )
  into v_fire_modes
  from (
    select
      fm.sort_order,
      fm.name,
      fm.code,
      jsonb_build_object(
        'id', fm.id,
        'code', fm.code,
        'name', fm.name,
        'description', fm.description,
        'fixed_rounds', fm.fixed_rounds,
        'min_rounds', fm.min_rounds,
        'max_rounds', fm.max_rounds,
        'is_random', fm.is_random,
        'accuracy_modifier', fm.accuracy_modifier,
        'sort_order', fm.sort_order
      ) as item
    from public.odyssey_fire_mode_defs fm
  ) fire_mode_row;

  select coalesce(
    jsonb_agg(item order by sort_order, name, code),
    '[]'::jsonb
  )
  into v_magazines
  from (
    select
      md.sort_order,
      md.name,
      md.code,
      jsonb_build_object(
        'id', md.id,
        'code', md.code,
        'name', md.name,
        'description', md.description,
        'capacity', md.capacity,
        'caliber_id', md.caliber_id,
        'caliber_code', caliber.code,
        'caliber_name', caliber.name,
        'sort_order', md.sort_order
      ) as item
    from public.odyssey_magazine_defs md
    left join public.odyssey_caliber_defs caliber on caliber.id = md.caliber_id
  ) magazine_row;

  v_features := public.odyssey_creator_build_weapon_feature_links(p_weapon_model_id);
  v_ability_links := public.odyssey_creator_build_weapon_ability_links(p_weapon_model_id);

  return jsonb_build_object(
    'ok', true,
    'weapon', v_weapon,
    'profiles', coalesce(v_profiles, '[]'::jsonb),
    'fire_modes', coalesce(v_fire_modes, '[]'::jsonb),
    'magazines', coalesce(v_magazines, '[]'::jsonb),
    'feature_links', coalesce(v_features, '[]'::jsonb),
    'ability_links', coalesce(v_ability_links, '[]'::jsonb)
  );
end;
$$;

do $do$
declare
  v_function_def text := null;
begin
  select pg_get_functiondef(p.oid)
  into v_function_def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'creator_upsert_weapon'
    and pg_get_function_identity_arguments(p.oid) = 'p_payload jsonb';

  if v_function_def is null then
    raise exception 'Function public.creator_upsert_weapon(jsonb) was not found.';
  end if;

  if position('v_profile_feed_mode' in v_function_def) = 0 then
    v_function_def := replace(
      v_function_def,
      $old$
  v_profile_attack_type text := '';
  v_profile_weapon_class_id uuid := null;
  v_profile_skill_id uuid := null;
  v_profile_caliber_id uuid := null;
  v_profile_range_profile_id uuid := null;
  v_profile_accuracy_modifier integer := 0;
  v_profile_base_melee_damage integer := 0;
  v_profile_is_default boolean := false;
  v_profile_sort_order integer := 0;
  v_profile_data jsonb := '{}'::jsonb;
  v_profile_tags jsonb := '[]'::jsonb;
  v_profile_fire_mode_ids jsonb := '[]'::jsonb;
  v_profile_magazine_ids jsonb := '[]'::jsonb;
$old$,
      $new$
  v_profile_attack_type text := '';
  v_profile_feed_mode text := 'detachable_magazine';
  v_profile_internal_capacity integer := null;
  v_profile_weapon_class_id uuid := null;
  v_profile_skill_id uuid := null;
  v_profile_caliber_id uuid := null;
  v_profile_range_profile_id uuid := null;
  v_profile_accuracy_modifier integer := 0;
  v_profile_base_melee_damage integer := 0;
  v_profile_is_default boolean := false;
  v_profile_sort_order integer := 0;
  v_profile_data jsonb := '{}'::jsonb;
  v_profile_tags jsonb := '[]'::jsonb;
  v_profile_fire_mode_ids jsonb := '[]'::jsonb;
  v_profile_magazine_ids jsonb := '[]'::jsonb;
$new$
    );
  end if;

  if position($needle$v_profile_feed_mode :=$needle$ in v_function_def) = 0 then
    v_function_def := replace(
      v_function_def,
      $old$
    v_profile_attack_type := lower(trim(coalesce(v_profile->>'attack_type', 'ranged')));
    v_profile_is_default := coalesce(nullif(trim(coalesce(v_profile->>'is_default', '')), '')::boolean, false);
$old$,
      $new$
    v_profile_attack_type := lower(trim(coalesce(v_profile->>'attack_type', 'ranged')));
    v_profile_feed_mode := case
      when v_profile_attack_type = 'ranged'
           and lower(trim(coalesce(v_profile->>'feed_mode', 'detachable_magazine'))) = 'internal_magazine'
        then 'internal_magazine'
      else 'detachable_magazine'
    end;
    v_profile_internal_capacity := case
      when v_profile_attack_type = 'ranged' and v_profile_feed_mode = 'internal_magazine'
        then greatest(coalesce(nullif(trim(coalesce(v_profile->>'internal_capacity', '')), '')::integer, 0), 0)
      else null
    end;
    v_profile_is_default := coalesce(nullif(trim(coalesce(v_profile->>'is_default', '')), '')::boolean, false);
$new$
    );
  end if;

  v_function_def := replace(
    v_function_def,
    $old$
    if v_profile_attack_type = 'ranged' then
      if v_profile_caliber_id is null or not exists (select 1 from public.odyssey_caliber_defs where id = v_profile_caliber_id) then
        return public.odyssey_creator_error(
          'VALIDATION_ERROR',
          'Ranged profiles require a valid caliber.',
          jsonb_build_array(jsonb_build_object('field', 'profiles', 'message', 'Unknown or missing caliber_id for a ranged profile.'))
        );
      end if;

      if jsonb_array_length(v_profile_magazine_ids) = 0 then
        return public.odyssey_creator_error(
          'VALIDATION_ERROR',
          'Ranged profiles require at least one magazine definition.',
          jsonb_build_array(jsonb_build_object('field', 'profiles', 'message', 'magazine_def_ids cannot be empty for ranged profiles.'))
        );
      end if;
    end if;
$old$,
    $new$
    if v_profile_attack_type = 'ranged' then
      if v_profile_caliber_id is null or not exists (select 1 from public.odyssey_caliber_defs where id = v_profile_caliber_id) then
        return public.odyssey_creator_error(
          'VALIDATION_ERROR',
          'Ranged profiles require a valid caliber.',
          jsonb_build_array(jsonb_build_object('field', 'profiles', 'message', 'Unknown or missing caliber_id for a ranged profile.'))
        );
      end if;

      if v_profile_feed_mode = 'internal_magazine' then
        if greatest(coalesce(v_profile_internal_capacity, 0), 0) <= 0 then
          return public.odyssey_creator_error(
            'VALIDATION_ERROR',
            'Internal magazine profiles require internal_capacity > 0.',
            jsonb_build_array(jsonb_build_object('field', 'profiles', 'message', 'internal_capacity must be greater than 0 for internal magazine profiles.'))
          );
        end if;
      elsif jsonb_array_length(v_profile_magazine_ids) = 0 then
        return public.odyssey_creator_error(
          'VALIDATION_ERROR',
          'Ranged detachable-magazine profiles require at least one magazine definition.',
          jsonb_build_array(jsonb_build_object('field', 'profiles', 'message', 'magazine_def_ids cannot be empty for detachable magazine profiles.'))
        );
      end if;
    end if;
$new$
  );

  v_function_def := replace(
    v_function_def,
    $old$
        accuracy_modifier = v_profile_accuracy_modifier,
        base_melee_damage = v_profile_base_melee_damage,
        attack_type = v_profile_attack_type,
        is_default = v_profile_is_default,
$old$,
    $new$
        accuracy_modifier = v_profile_accuracy_modifier,
        base_melee_damage = v_profile_base_melee_damage,
        attack_type = v_profile_attack_type,
        feed_mode = v_profile_feed_mode,
        internal_capacity = case
          when v_profile_feed_mode = 'internal_magazine' then greatest(coalesce(v_profile_internal_capacity, 0), 0)
          else null
        end,
        is_default = v_profile_is_default,
$new$
  );

  v_function_def := replace(
    v_function_def,
    $old$
          base_melee_damage,
          attack_type,
          is_default,
          data,
          tags,
          sort_order
        )
$old$,
    $new$
          base_melee_damage,
          attack_type,
          feed_mode,
          internal_capacity,
          is_default,
          data,
          tags,
          sort_order
        )
$new$
  );

  v_function_def := replace(
    v_function_def,
    $old$
          v_profile_base_melee_damage,
          v_profile_attack_type,
          v_profile_is_default,
          v_profile_data,
          v_profile_tags,
          v_profile_sort_order
        )
$old$,
    $new$
          v_profile_base_melee_damage,
          v_profile_attack_type,
          v_profile_feed_mode,
          case
            when v_profile_feed_mode = 'internal_magazine' then greatest(coalesce(v_profile_internal_capacity, 0), 0)
            else null
          end,
          v_profile_is_default,
          v_profile_data,
          v_profile_tags,
          v_profile_sort_order
        )
$new$
  );

  v_function_def := replace(
    v_function_def,
    $old$
            base_melee_damage = v_profile_base_melee_damage,
            attack_type = v_profile_attack_type,
            is_default = v_profile_is_default,
            data = v_profile_data,
            tags = v_profile_tags,
            sort_order = v_profile_sort_order
$old$,
    $new$
            base_melee_damage = v_profile_base_melee_damage,
            attack_type = v_profile_attack_type,
            feed_mode = v_profile_feed_mode,
            internal_capacity = case
              when v_profile_feed_mode = 'internal_magazine' then greatest(coalesce(v_profile_internal_capacity, 0), 0)
              else null
            end,
            is_default = v_profile_is_default,
            data = v_profile_data,
            tags = v_profile_tags,
            sort_order = v_profile_sort_order
$new$
  );

  v_function_def := replace(
    v_function_def,
    $old$    if v_profile_attack_type = 'ranged' then$old$,
    $new$    if v_profile_attack_type = 'ranged' and v_profile_feed_mode = 'detachable_magazine' then$new$
  );

  v_function_def := replace(
    v_function_def,
    $old$
        v_profile_attack_type <> 'ranged'
        or not exists (
$old$,
    $new$
        v_profile_attack_type <> 'ranged'
        or v_profile_feed_mode <> 'detachable_magazine'
        or not exists (
$new$
  );

  execute v_function_def;
end;
$do$;

do $do$
declare
  v_function_def text := null;
begin
  select pg_get_functiondef(p.oid)
  into v_function_def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'odyssey_perform_weapon_attack'
    and pg_get_function_identity_arguments(p.oid) = 'p_payload jsonb';

  if v_function_def is null then
    raise exception 'Function public.odyssey_perform_weapon_attack(jsonb) was not found.';
  end if;

  if position('v_internal_ammo_type_id uuid := null;' in v_function_def) = 0 then
    v_function_def := replace(
      v_function_def,
      $old$
  v_attack_type text := null;
  v_magazine record;
  v_magazine_id uuid := null;
  v_ammo_code text := null;
  v_bullets_spent integer := 0;
  v_remaining_rounds integer := null;
$old$,
      $new$
  v_attack_type text := null;
  v_profile_feed_mode text := 'detachable_magazine';
  v_internal_ammo_type_id uuid := null;
  v_internal_current_rounds integer := 0;
  v_internal_max_rounds integer := 0;
  v_magazine record;
  v_magazine_id uuid := null;
  v_ammo_code text := null;
  v_bullets_spent integer := 0;
  v_remaining_rounds integer := null;
$new$
    );
  end if;

  if position('coalesce(p.feed_mode, ''detachable_magazine'') as feed_mode' in v_function_def) = 0 then
    v_function_def := replace(
      v_function_def,
      $old$
      select
        s.id as profile_state_id,
        p.id as profile_id,
        p.code,
        p.name,
        p.attack_type,
        coalesce(p.weapon_class_id, v_weapon_model.weapon_class_id) as weapon_class_id,
        coalesce(pwc.code, v_weapon_model.weapon_class_code) as weapon_class_code,
        coalesce(pwc.name, v_weapon_model.weapon_class_name) as weapon_class_name,
        coalesce(p.linked_skill_id, v_weapon_model.linked_skill_id) as linked_skill_id,
        coalesce(pskill.code, v_weapon_model.linked_skill_code) as linked_skill_code,
        coalesce(pskill.name, v_weapon_model.linked_skill_name) as linked_skill_name,
        coalesce(p.caliber_id, v_weapon_model.caliber_id) as caliber_id,
        coalesce(pcal.code, v_weapon_model.caliber_code) as caliber_code,
        coalesce(pcal.name, v_weapon_model.caliber_name) as caliber_name,
        coalesce(pcal.base_damage_per_round, v_weapon_model.base_damage_per_round, 0) as base_damage_per_round,
        coalesce(p.range_profile_id, v_weapon_model.range_profile_id) as range_profile_id,
        coalesce(prp.code, v_weapon_model.range_profile_code) as range_profile_code,
        coalesce(prp.name, v_weapon_model.range_profile_name) as range_profile_name,
        coalesce(p.accuracy_modifier, v_weapon_model.base_accuracy_bonus) as accuracy_modifier,
        coalesce(p.base_melee_damage, v_weapon_model.base_melee_damage) as base_melee_damage
      into v_weapon_profile
$old$,
      $new$
      select
        s.id as profile_state_id,
        p.id as profile_id,
        p.code,
        p.name,
        p.attack_type,
        coalesce(p.feed_mode, 'detachable_magazine') as feed_mode,
        greatest(coalesce(p.internal_capacity, 0), 0) as internal_capacity,
        greatest(coalesce(s.internal_current_rounds, 0), 0) as internal_current_rounds,
        greatest(coalesce(s.internal_max_rounds, p.internal_capacity, 0), 0) as internal_max_rounds,
        s.internal_ammo_type_id,
        coalesce(p.weapon_class_id, v_weapon_model.weapon_class_id) as weapon_class_id,
        coalesce(pwc.code, v_weapon_model.weapon_class_code) as weapon_class_code,
        coalesce(pwc.name, v_weapon_model.weapon_class_name) as weapon_class_name,
        coalesce(p.linked_skill_id, v_weapon_model.linked_skill_id) as linked_skill_id,
        coalesce(pskill.code, v_weapon_model.linked_skill_code) as linked_skill_code,
        coalesce(pskill.name, v_weapon_model.linked_skill_name) as linked_skill_name,
        coalesce(p.caliber_id, v_weapon_model.caliber_id) as caliber_id,
        coalesce(pcal.code, v_weapon_model.caliber_code) as caliber_code,
        coalesce(pcal.name, v_weapon_model.caliber_name) as caliber_name,
        coalesce(pcal.base_damage_per_round, v_weapon_model.base_damage_per_round, 0) as base_damage_per_round,
        coalesce(p.range_profile_id, v_weapon_model.range_profile_id) as range_profile_id,
        coalesce(prp.code, v_weapon_model.range_profile_code) as range_profile_code,
        coalesce(prp.name, v_weapon_model.range_profile_name) as range_profile_name,
        coalesce(p.accuracy_modifier, v_weapon_model.base_accuracy_bonus) as accuracy_modifier,
        coalesce(p.base_melee_damage, v_weapon_model.base_melee_damage) as base_melee_damage
      into v_weapon_profile
$new$
    );
  end if;

  if position($needle$v_profile_feed_mode := coalesce(v_weapon_profile.feed_mode, 'detachable_magazine');$needle$ in v_function_def) = 0 then
    v_function_def := replace(
      v_function_def,
      $old$
  if v_error_code is null then
    v_attack_type := coalesce(v_weapon_profile.attack_type, '');
    if v_attack_type not in ('ranged', 'melee') then
      v_error_code := 'ATTACK_TYPE_REQUIRED_FOR_PROFILE';
      v_error_message := 'Active weapon profile must be a strict ranged or melee profile.';
    end if;
  end if;
$old$,
      $new$
  if v_error_code is null then
    v_attack_type := coalesce(v_weapon_profile.attack_type, '');
    v_profile_feed_mode := coalesce(v_weapon_profile.feed_mode, 'detachable_magazine');
    v_internal_ammo_type_id := v_weapon_profile.internal_ammo_type_id;
    v_internal_current_rounds := greatest(coalesce(v_weapon_profile.internal_current_rounds, 0), 0);
    v_internal_max_rounds := greatest(coalesce(v_weapon_profile.internal_max_rounds, v_weapon_profile.internal_capacity, 0), 0);
    if v_attack_type not in ('ranged', 'melee') then
      v_error_code := 'ATTACK_TYPE_REQUIRED_FOR_PROFILE';
      v_error_message := 'Active weapon profile must be a strict ranged or melee profile.';
    end if;
  end if;
$new$
    );
  end if;

  v_function_def := replace(
    v_function_def,
    $old$
  if v_error_code is null and v_attack_type = 'ranged' then
    if v_weapon.loaded_magazine_id is null then
      v_error_code := 'NO_MAGAZINE';
      v_error_message := 'Weapon requires a loaded magazine.';
    else
      select
        cm.id,
        cm.character_id,
        cm.magazine_def_id,
        cm.ammo_type_id,
        cm.current_rounds,
        md.code as magazine_def_code,
        md.name as magazine_def_name,
        md.capacity,
        md.caliber_id as magazine_caliber_id,
        caliber.code as magazine_caliber_code,
        ammo.code as ammo_code,
        ammo.name as ammo_name,
        ammo.caliber_id as ammo_caliber_id,
        ammo.damage_modifier,
        ammo.accuracy_modifier,
        ammo.armor_pierce
      into v_magazine
      from public.odyssey_character_magazines cm
      join public.odyssey_magazine_defs md on md.id = cm.magazine_def_id
      join public.odyssey_caliber_defs caliber on caliber.id = md.caliber_id
      join public.odyssey_ammo_type_defs ammo on ammo.id = cm.ammo_type_id
      where cm.id = v_weapon.loaded_magazine_id
        and cm.character_id = v_attacker_character_id;

      if not found then
        v_error_code := 'INVALID_MAGAZINE';
        v_error_message := 'Loaded magazine was not found or does not belong to the attacker.';
      else
        v_magazine_id := v_magazine.id;
        v_ammo_code := v_magazine.ammo_code;
      end if;

      if v_error_code is null then
        if not public.odyssey_is_magazine_compatible_with_profile(v_weapon_profile.profile_id, v_magazine.id)
           or (v_weapon_profile.caliber_id is not null and v_magazine.magazine_caliber_id <> v_weapon_profile.caliber_id)
           or v_magazine.ammo_caliber_id <> v_magazine.magazine_caliber_id then
          v_error_code := 'INVALID_MAGAZINE';
          v_error_message := 'Loaded magazine is incompatible with the active profile.';
        elsif coalesce(v_magazine.current_rounds, 0) <= 0 then
          v_error_code := 'NO_AMMO';
          v_error_message := 'Loaded magazine is empty.';
        else
          if coalesce(v_fire_mode.is_random, false) then
            if v_magazine.current_rounds >= coalesce(v_fire_mode.min_rounds, 1) then
              v_bullets_spent :=
                floor(
                  random()
                  * (
                      least(
                        coalesce(v_fire_mode.max_rounds, v_magazine.current_rounds),
                        v_magazine.current_rounds
                      )
                      - coalesce(v_fire_mode.min_rounds, 1)
                      + 1
                    )
                )::integer + coalesce(v_fire_mode.min_rounds, 1);
            else
              v_bullets_spent := v_magazine.current_rounds;
            end if;
          else
            v_bullets_spent := least(coalesce(v_fire_mode.fixed_rounds, 0), v_magazine.current_rounds);
          end if;

          if v_bullets_spent <= 0 then
            v_error_code := 'NO_AMMO';
            v_error_message := 'Attack cannot be made because there is no ammunition to spend.';
          else
            v_ammo_accuracy_modifier := coalesce(v_magazine.accuracy_modifier, 0);
            v_ammo_damage_modifier := coalesce(v_magazine.damage_modifier, 0);
            v_armor_pierce := coalesce(v_magazine.armor_pierce, 0);
            v_bullet_damage := greatest(coalesce(v_weapon_profile.base_damage_per_round, 0) + v_ammo_damage_modifier, 0);
            v_total_weapon_damage := v_bullet_damage * v_bullets_spent;
            v_remaining_rounds := v_magazine.current_rounds - v_bullets_spent;
          end if;
        end if;
      end if;
    end if;
  elsif v_error_code is null then
$old$,
    $new$
  if v_error_code is null and v_attack_type = 'ranged' then
    if v_profile_feed_mode = 'internal_magazine' then
      if v_internal_current_rounds <= 0 or v_internal_ammo_type_id is null then
        v_error_code := 'NO_AMMO';
        v_error_message := 'Weapon internal magazine is empty.';
      else
        select
          ammo.id,
          ammo.code as ammo_code,
          ammo.name as ammo_name,
          ammo.caliber_id as ammo_caliber_id,
          ammo.damage_modifier,
          ammo.accuracy_modifier,
          ammo.armor_pierce
        into v_magazine
        from public.odyssey_ammo_type_defs ammo
        where ammo.id = v_internal_ammo_type_id;

        if not found or not public.odyssey_is_internal_ammo_compatible_with_profile(v_weapon_profile.profile_id, v_internal_ammo_type_id) then
          v_error_code := 'NO_AMMO';
          v_error_message := 'Weapon internal magazine contains invalid ammunition.';
        else
          v_magazine_id := null;
          v_ammo_code := v_magazine.ammo_code;
          if coalesce(v_fire_mode.is_random, false) then
            if v_internal_current_rounds < coalesce(v_fire_mode.min_rounds, 1) then
              v_error_code := 'NOT_ENOUGH_AMMO';
              v_error_message := 'Not enough rounds are loaded for this fire mode.';
            else
              v_bullets_spent :=
                floor(
                  random()
                  * (
                      least(
                        coalesce(v_fire_mode.max_rounds, v_internal_current_rounds),
                        v_internal_current_rounds
                      )
                      - coalesce(v_fire_mode.min_rounds, 1)
                      + 1
                    )
                )::integer + coalesce(v_fire_mode.min_rounds, 1);
            end if;
          else
            if v_internal_current_rounds < coalesce(v_fire_mode.fixed_rounds, 0) then
              v_error_code := 'NOT_ENOUGH_AMMO';
              v_error_message := 'Not enough rounds are loaded for this fire mode.';
            else
              v_bullets_spent := coalesce(v_fire_mode.fixed_rounds, 0);
            end if;
          end if;

          if v_error_code is null then
            if v_bullets_spent <= 0 then
              v_error_code := 'NO_AMMO';
              v_error_message := 'Attack cannot be made because there is no ammunition to spend.';
            else
              v_ammo_accuracy_modifier := coalesce(v_magazine.accuracy_modifier, 0);
              v_ammo_damage_modifier := coalesce(v_magazine.damage_modifier, 0);
              v_armor_pierce := coalesce(v_magazine.armor_pierce, 0);
              v_bullet_damage := greatest(coalesce(v_weapon_profile.base_damage_per_round, 0) + v_ammo_damage_modifier, 0);
              v_total_weapon_damage := v_bullet_damage * v_bullets_spent;
              v_remaining_rounds := v_internal_current_rounds - v_bullets_spent;
            end if;
          end if;
        end if;
      end if;
    elsif v_weapon.loaded_magazine_id is null then
      v_error_code := 'NO_MAGAZINE';
      v_error_message := 'Weapon requires a loaded magazine.';
    else
      select
        cm.id,
        cm.character_id,
        cm.magazine_def_id,
        cm.ammo_type_id,
        cm.current_rounds,
        md.code as magazine_def_code,
        md.name as magazine_def_name,
        md.capacity,
        md.caliber_id as magazine_caliber_id,
        caliber.code as magazine_caliber_code,
        ammo.code as ammo_code,
        ammo.name as ammo_name,
        ammo.caliber_id as ammo_caliber_id,
        ammo.damage_modifier,
        ammo.accuracy_modifier,
        ammo.armor_pierce
      into v_magazine
      from public.odyssey_character_magazines cm
      join public.odyssey_magazine_defs md on md.id = cm.magazine_def_id
      join public.odyssey_caliber_defs caliber on caliber.id = md.caliber_id
      join public.odyssey_ammo_type_defs ammo on ammo.id = cm.ammo_type_id
      where cm.id = v_weapon.loaded_magazine_id
        and cm.character_id = v_attacker_character_id;

      if not found then
        v_error_code := 'INVALID_MAGAZINE';
        v_error_message := 'Loaded magazine was not found or does not belong to the attacker.';
      else
        v_magazine_id := v_magazine.id;
        v_ammo_code := v_magazine.ammo_code;
      end if;

      if v_error_code is null then
        if not public.odyssey_is_magazine_compatible_with_profile(v_weapon_profile.profile_id, v_magazine.id)
           or (v_weapon_profile.caliber_id is not null and v_magazine.magazine_caliber_id <> v_weapon_profile.caliber_id)
           or v_magazine.ammo_caliber_id <> v_magazine.magazine_caliber_id then
          v_error_code := 'INVALID_MAGAZINE';
          v_error_message := 'Loaded magazine is incompatible with the active profile.';
        elsif coalesce(v_magazine.current_rounds, 0) <= 0 then
          v_error_code := 'NO_AMMO';
          v_error_message := 'Loaded magazine is empty.';
        else
          if coalesce(v_fire_mode.is_random, false) then
            if v_magazine.current_rounds < coalesce(v_fire_mode.min_rounds, 1) then
              v_error_code := 'NOT_ENOUGH_AMMO';
              v_error_message := 'Not enough rounds are loaded for this fire mode.';
            else
              v_bullets_spent :=
                floor(
                  random()
                  * (
                      least(
                        coalesce(v_fire_mode.max_rounds, v_magazine.current_rounds),
                        v_magazine.current_rounds
                      )
                      - coalesce(v_fire_mode.min_rounds, 1)
                      + 1
                    )
                )::integer + coalesce(v_fire_mode.min_rounds, 1);
            end if;
          else
            if v_magazine.current_rounds < coalesce(v_fire_mode.fixed_rounds, 0) then
              v_error_code := 'NOT_ENOUGH_AMMO';
              v_error_message := 'Not enough rounds are loaded for this fire mode.';
            else
              v_bullets_spent := coalesce(v_fire_mode.fixed_rounds, 0);
            end if;
          end if;

          if v_error_code is null then
            if v_bullets_spent <= 0 then
              v_error_code := 'NO_AMMO';
              v_error_message := 'Attack cannot be made because there is no ammunition to spend.';
            else
              v_ammo_accuracy_modifier := coalesce(v_magazine.accuracy_modifier, 0);
              v_ammo_damage_modifier := coalesce(v_magazine.damage_modifier, 0);
              v_armor_pierce := coalesce(v_magazine.armor_pierce, 0);
              v_bullet_damage := greatest(coalesce(v_weapon_profile.base_damage_per_round, 0) + v_ammo_damage_modifier, 0);
              v_total_weapon_damage := v_bullet_damage * v_bullets_spent;
              v_remaining_rounds := v_magazine.current_rounds - v_bullets_spent;
            end if;
          end if;
        end if;
      end if;
    end if;
  elsif v_error_code is null then
$new$
  );

  v_function_def := replace(
    v_function_def,
    $old$
    if v_attack_type = 'ranged' then
      update public.odyssey_character_magazines
      set current_rounds = v_remaining_rounds
      where id = v_magazine_id;
    end if;
$old$,
    $new$
    if v_attack_type = 'ranged' then
      if v_profile_feed_mode = 'internal_magazine' then
        update public.odyssey_character_weapon_profile_states
        set
          internal_current_rounds = greatest(coalesce(v_remaining_rounds, 0), 0),
          internal_ammo_type_id = case
            when greatest(coalesce(v_remaining_rounds, 0), 0) <= 0 then null
            else internal_ammo_type_id
          end
        where id = v_weapon_profile.profile_state_id;
      else
        update public.odyssey_character_magazines
        set current_rounds = v_remaining_rounds
        where id = v_magazine_id;
      end if;
    end if;
$new$
  );

  execute v_function_def;
end;
$do$;

create or replace function public.get_character_armory(
  p_character_id uuid
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_weapons jsonb := '[]'::jsonb;
  v_magazines jsonb := '[]'::jsonb;
begin
  perform public.initialize_character_weapon_abilities(weapon.id)
  from public.odyssey_character_weapons weapon
  where weapon.character_id = p_character_id;

  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', w.id,
          'character_id', w.character_id,
          'custom_name', w.custom_name,
          'name', coalesce(nullif(trim(w.custom_name), ''), wm.name),
          'notes', w.notes,
          'sort_order', w.sort_order,
          'active_profile_id', w.active_profile_id,
          'data', coalesce(w.data, '{}'::jsonb),
          'equipped_slot', w.equipped_slot,
          'model',
            jsonb_build_object(
              'id', wm.id,
              'code', wm.code,
              'name', wm.name,
              'weapon_class', mwc.code,
              'weapon_class_name', mwc.name,
              'linked_skill', mskill.code,
              'linked_skill_name', mskill.name,
              'caliber', mcal.code,
              'caliber_name', mcal.name,
              'base_accuracy_bonus', wm.base_accuracy_bonus,
              'base_melee_damage', wm.base_melee_damage,
              'range_profile', mrp.code,
              'range_profile_name', mrp.name,
              'tags', wm.tags
            ),
          'feed_mode', coalesce(runtime.active_profile_json->>'feed_mode', 'detachable_magazine'),
          'internal_capacity', coalesce(nullif(runtime.active_profile_json->>'internal_capacity', '')::integer, 0),
          'internal_current_rounds', coalesce(nullif(runtime.active_profile_json->>'internal_current_rounds', '')::integer, 0),
          'internal_max_rounds', coalesce(nullif(runtime.active_profile_json->>'internal_max_rounds', '')::integer, 0),
          'internal_ammo_type', coalesce(runtime.active_profile_json->'internal_ammo_type', 'null'::jsonb),
          'ammo', coalesce(runtime.active_profile_json->'ammo', 'null'::jsonb),
          'uses_magazine',
            case
              when coalesce(runtime.active_profile_json->>'attack_type', 'ranged') <> 'ranged' then false
              when coalesce(runtime.active_profile_json->>'feed_mode', 'detachable_magazine') = 'internal_magazine' then false
              else true
            end,
          'requires_ammo',
            coalesce(runtime.active_profile_json->>'attack_type', 'ranged') = 'ranged',
          'can_reload',
            case
              when coalesce(runtime.active_profile_json->>'attack_type', 'ranged') <> 'ranged' then false
              when coalesce(runtime.active_profile_json->>'feed_mode', 'detachable_magazine') = 'internal_magazine' then false
              else true
            end,
          'active_profile', runtime.active_profile_json,
          'profiles', runtime.profiles_json,
          'features', coalesce(runtime.features_bundle->'features', '[]'::jsonb),
          'loaded_magazine', coalesce(runtime.active_profile_json->'loaded_magazine', 'null'::jsonb),
          'selected_fire_mode', coalesce(runtime.active_profile_json->'selected_fire_mode', 'null'::jsonb),
          'available_fire_modes', coalesce(runtime.active_profile_json->'available_fire_modes', '[]'::jsonb),
          'compatible_magazines', coalesce(runtime.active_profile_json->'compatible_magazines', '[]'::jsonb),
          'lock_state', public.odyssey_get_weapon_lock_state(w.character_id, w.id),
          'weapon_abilities',
            coalesce(
              (
                select jsonb_agg(
                  jsonb_build_object(
                    'id', ability.id,
                    'character_weapon_id', w.id,
                    'ability_def_id', ability.ability_def_id,
                    'code', def.code,
                    'name', def.name,
                    'ability_kind', def.ability_kind,
                    'activation_type', def.activation_type,
                    'effect_mode', def.effect_mode,
                    'attack_type', def.attack_type,
                    'effective_level', greatest(coalesce(skill.level, ability.learned_level, 0), 0),
                    'is_enabled', ability.is_enabled,
                    'is_hidden', ability.is_hidden,
                    'current_cooldown_rounds', ability.current_cooldown_rounds,
                    'current_charges', ability.current_charges,
                    'max_charges', ability.max_charges,
                    'required_profile_id', nullif(trim(coalesce(ability.data->>'required_profile_id', '')), ''),
                    'required_profile_code', nullif(trim(coalesce(ability.data->>'required_profile_code', '')), ''),
                    'is_available_for_active_profile',
                      case
                        when nullif(trim(coalesce(ability.data->>'required_profile_id', '')), '') is null then true
                        else w.active_profile_id::text = nullif(trim(coalesce(ability.data->>'required_profile_id', '')), '')
                      end
                  )
                  order by ability.sort_order, def.sort_order, def.code
                )
                from public.odyssey_character_abilities ability
                join public.odyssey_ability_defs def on def.id = ability.ability_def_id
                left join public.odyssey_character_skills skill
                  on skill.character_id = ability.character_id
                 and skill.skill_def_id = def.linked_skill_id
                where ability.character_id = p_character_id
                  and ability.source_character_weapon_id = w.id
              ),
              '[]'::jsonb
            )
        )
        order by w.sort_order, coalesce(nullif(trim(w.custom_name), ''), wm.name), w.id
      ),
      '[]'::jsonb
    )
  into v_weapons
  from public.odyssey_character_weapons w
  join public.odyssey_weapon_model_defs wm on wm.id = w.weapon_model_id
  join public.odyssey_weapon_class_defs mwc on mwc.id = wm.weapon_class_id
  join public.odyssey_skill_defs mskill on mskill.id = wm.linked_skill_id
  left join public.odyssey_caliber_defs mcal on mcal.id = wm.caliber_id
  join public.odyssey_range_profile_defs mrp on mrp.id = wm.range_profile_id
  left join lateral (
    select
      public.odyssey_get_active_character_weapon_profile(w.id) as active_profile_json,
      public.odyssey_get_character_weapon_profiles(w.id) as profiles_json,
      public.get_character_weapon_features(w.id) as features_bundle
  ) runtime on true
  where w.character_id = p_character_id;

  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', cm.id,
          'character_id', cm.character_id,
          'custom_name', cm.custom_name,
          'name', coalesce(nullif(trim(cm.custom_name), ''), md.name),
          'notes', cm.notes,
          'current_rounds', cm.current_rounds,
          'magazine_def',
            jsonb_build_object(
              'id', md.id,
              'code', md.code,
              'name', md.name,
              'capacity', md.capacity,
              'caliber', caliber.code,
              'caliber_name', caliber.name
            ),
          'ammo_type',
            jsonb_build_object(
              'id', ammo.id,
              'code', ammo.code,
              'name', ammo.name,
              'caliber', ammo_caliber.code,
              'caliber_name', ammo_caliber.name
            )
        )
        order by md.sort_order, md.name, cm.created_at, cm.id
      ),
      '[]'::jsonb
    )
  into v_magazines
  from public.odyssey_character_magazines cm
  join public.odyssey_magazine_defs md on md.id = cm.magazine_def_id
  join public.odyssey_caliber_defs caliber on caliber.id = md.caliber_id
  join public.odyssey_ammo_type_defs ammo on ammo.id = cm.ammo_type_id
  join public.odyssey_caliber_defs ammo_caliber on ammo_caliber.id = ammo.caliber_id
  where cm.character_id = p_character_id;

  return jsonb_build_object(
    'character_id', p_character_id,
    'weapons', coalesce(v_weapons, '[]'::jsonb),
    'magazines', coalesce(v_magazines, '[]'::jsonb)
  );
end;
$$;

grant execute on function public.odyssey_is_internal_ammo_compatible_with_profile(uuid, uuid) to anon, authenticated;
grant execute on function public.unload_weapon_magazine(jsonb) to anon, authenticated;
grant execute on function public.load_weapon_internal_rounds(jsonb) to anon, authenticated;
grant execute on function public.unload_weapon_internal_rounds(jsonb) to anon, authenticated;

-- ===== END 107_ranged_weapon_feed_modes.sql =====
