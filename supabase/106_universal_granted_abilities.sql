-- ===== BEGIN 106_universal_granted_abilities.sql =====
-- Universal granted abilities from skills / perks / items / equipment / weapons.
-- Visibility and usability are separated:
--   - generated character ability stays visible while the source exists
--   - runtime state decides whether it is currently usable

alter table public.odyssey_ability_grants
  add column if not exists grant_mode text not null default 'available';

alter table public.odyssey_ability_grants
  add column if not exists requires_equipped boolean not null default false;

alter table public.odyssey_ability_grants
  add column if not exists requires_installed boolean not null default false;

alter table public.odyssey_ability_grants
  add column if not exists requires_selected_source boolean not null default false;

alter table public.odyssey_ability_grants
  add column if not exists default_current_charges integer null;

alter table public.odyssey_ability_grants
  add column if not exists default_max_charges integer null;

alter table public.odyssey_ability_grants
  add column if not exists reload_item_code text null;

alter table public.odyssey_ability_grants
  add column if not exists reload_item_cost integer not null default 1;

do $$
declare
  v_constraint_name text;
begin
  select conname
  into v_constraint_name
  from pg_constraint
  where conrelid = 'public.odyssey_ability_grants'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%source_type in%';

  if v_constraint_name is not null then
    execute format(
      'alter table public.odyssey_ability_grants drop constraint %I',
      v_constraint_name
    );
  end if;
end;
$$;

alter table public.odyssey_ability_grants
  drop constraint if exists odyssey_ability_grants_source_type_check;

alter table public.odyssey_ability_grants
  add constraint odyssey_ability_grants_source_type_check
  check (
    source_type in (
      'skill',
      'perk',
      'item',
      'equipment',
      'armor',
      'implant',
      'prosthetic',
      'weapon'
    )
  );

alter table public.odyssey_ability_grants
  drop constraint if exists odyssey_ability_grants_grant_mode_check;

alter table public.odyssey_ability_grants
  add constraint odyssey_ability_grants_grant_mode_check
  check (grant_mode in ('available', 'passive', 'activated'));

update public.odyssey_ability_grants
set
  grant_mode = coalesce(nullif(trim(coalesce(data->>'grant_mode', '')), ''), grant_mode, 'available'),
  requires_equipped =
    case
      when lower(coalesce(data->>'requires_equipped', '')) in ('true', '1', 'yes', 'on') then true
      when lower(coalesce(data->>'requires_equipped', '')) in ('false', '0', 'no', 'off') then false
      else requires_equipped
    end,
  requires_installed =
    case
      when lower(coalesce(data->>'requires_installed', '')) in ('true', '1', 'yes', 'on') then true
      when lower(coalesce(data->>'requires_installed', '')) in ('false', '0', 'no', 'off') then false
      else requires_installed
    end,
  requires_selected_source =
    case
      when lower(coalesce(data->>'requires_selected_source', '')) in ('true', '1', 'yes', 'on') then true
      when lower(coalesce(data->>'requires_selected_source', '')) in ('false', '0', 'no', 'off') then false
      else requires_selected_source
    end,
  default_current_charges =
    case
      when default_current_charges is not null then default_current_charges
      when coalesce(data->>'default_current_charges', '') ~ '^-?[0-9]+$' then greatest((data->>'default_current_charges')::integer, 0)
      else null
    end,
  default_max_charges =
    case
      when default_max_charges is not null then default_max_charges
      when coalesce(data->>'default_max_charges', '') ~ '^-?[0-9]+$' then greatest((data->>'default_max_charges')::integer, 0)
      else null
    end,
  reload_item_code =
    coalesce(
      nullif(trim(coalesce(reload_item_code, '')), ''),
      nullif(trim(coalesce(data#>>'{reload,item_code}', '')), ''),
      nullif(trim(coalesce(data->>'reload_item_code', '')), ''),
      nullif(trim(coalesce(data->>'requires_reload_item_code', '')), '')
    ),
  reload_item_cost =
    case
      when coalesce(data#>>'{reload,item_cost_per_reload}', '') ~ '^-?[0-9]+$' then greatest((data#>>'{reload,item_cost_per_reload}')::integer, 1)
      when coalesce(data->>'reload_item_cost', '') ~ '^-?[0-9]+$' then greatest((data->>'reload_item_cost')::integer, 1)
      else greatest(coalesce(reload_item_cost, 1), 1)
    end
where true;

do $$
declare
  v_function_def text := null;
begin
  select pg_get_functiondef(p.oid)
  into v_function_def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'creator_upsert_ability'
    and pg_get_function_identity_arguments(p.oid) = 'p_payload jsonb';

  if v_function_def is null then
    raise exception 'Function public.creator_upsert_ability(jsonb) was not found.';
  end if;

  v_function_def := replace(
    v_function_def,
    $old_source_types$('psionic', 'implant', 'prosthetic', 'equipment', 'item', 'weapon', 'skill', 'perk', 'innate', 'custom')$old_source_types$,
    $new_source_types$('psionic', 'implant', 'prosthetic', 'equipment', 'armor', 'item', 'weapon', 'skill', 'perk', 'innate', 'custom')$new_source_types$
  );

  v_function_def := replace(
    v_function_def,
    $old_effect_modes$('attack', 'apply_effect', 'grant_special', 'narrative', 'custom')$old_effect_modes$,
    $new_effect_modes$('attack', 'apply_effect', 'grant_special', 'activate_weapon_feature', 'narrative', 'custom')$new_effect_modes$
  );

  execute v_function_def;
end;
$$;

create or replace function public.odyssey_get_unified_ability_grants()
returns table (
  source_type text,
  source_def_id uuid,
  ability_def_id uuid,
  grant_mode text,
  requires_equipped boolean,
  requires_installed boolean,
  requires_selected_source boolean,
  default_current_charges integer,
  default_max_charges integer,
  reload_item_code text,
  reload_item_cost integer,
  min_level integer,
  is_enabled boolean,
  sort_order integer,
  data jsonb,
  profile_id uuid,
  profile_code text
)
language sql
stable
as $$
  with explicit_grants as (
    select
      lower(trim(g.source_type)) as source_type,
      g.source_def_id,
      g.ability_def_id,
      coalesce(nullif(trim(g.grant_mode), ''), 'available') as grant_mode,
      coalesce(g.requires_equipped, false) as requires_equipped,
      coalesce(g.requires_installed, false) as requires_installed,
      coalesce(g.requires_selected_source, false) as requires_selected_source,
      g.default_current_charges,
      g.default_max_charges,
      nullif(trim(coalesce(g.reload_item_code, '')), '') as reload_item_code,
      greatest(coalesce(g.reload_item_cost, 1), 1) as reload_item_cost,
      greatest(coalesce(g.min_level, 1), 1) as min_level,
      coalesce(g.is_enabled, true) as is_enabled,
      coalesce(g.sort_order, 0) as sort_order,
      coalesce(g.data, '{}'::jsonb) as data,
      null::uuid as profile_id,
      null::text as profile_code,
      0 as priority
    from public.odyssey_ability_grants g
  ),
  item_legacy as (
    select
      'item'::text as source_type,
      link.item_def_id as source_def_id,
      link.ability_def_id,
      coalesce(link.grant_mode, 'activated') as grant_mode,
      false as requires_equipped,
      false as requires_installed,
      false as requires_selected_source,
      case
        when coalesce(link.data->>'default_current_charges', '') ~ '^-?[0-9]+$' then greatest((link.data->>'default_current_charges')::integer, 0)
        else null
      end as default_current_charges,
      case
        when coalesce(link.data->>'default_max_charges', '') ~ '^-?[0-9]+$' then greatest((link.data->>'default_max_charges')::integer, 0)
        else null
      end as default_max_charges,
      coalesce(
        nullif(trim(coalesce(link.data#>>'{reload,item_code}', '')), ''),
        nullif(trim(coalesce(link.data->>'reload_item_code', '')), ''),
        nullif(trim(coalesce(link.data->>'requires_reload_item_code', '')), '')
      ) as reload_item_code,
      case
        when coalesce(link.data#>>'{reload,item_cost_per_reload}', '') ~ '^-?[0-9]+$' then greatest((link.data#>>'{reload,item_cost_per_reload}')::integer, 1)
        when coalesce(link.data->>'reload_item_cost', '') ~ '^-?[0-9]+$' then greatest((link.data->>'reload_item_cost')::integer, 1)
        else 1
      end as reload_item_cost,
      1 as min_level,
      coalesce(link.is_enabled, true) as is_enabled,
      coalesce(link.sort_order, 0) as sort_order,
      coalesce(link.data, '{}'::jsonb) as data,
      null::uuid as profile_id,
      null::text as profile_code,
      10 as priority
    from public.odyssey_item_def_abilities link
    where coalesce(link.is_enabled, true) = true
      and not exists (
        select 1
        from public.odyssey_ability_grants g
        where g.source_type = 'item'
          and g.source_def_id = link.item_def_id
          and g.ability_def_id = link.ability_def_id
      )
  ),
  equipment_legacy as (
    select
      case
        when model.item_type in ('armor', 'shield', 'special_protection') then 'armor'
        when model.item_type = 'implant' then 'implant'
        when model.item_type = 'prosthetic' then 'prosthetic'
        else 'equipment'
      end as source_type,
      link.equipment_model_id as source_def_id,
      link.ability_def_id,
      coalesce(link.grant_mode, 'available') as grant_mode,
      case
        when model.item_type in ('armor', 'shield', 'special_protection') then true
        when lower(coalesce(link.data->>'requires_equipped', '')) in ('true', '1', 'yes', 'on') then true
        when lower(coalesce(link.data->>'requires_equipped', '')) in ('false', '0', 'no', 'off') then false
        else false
      end as requires_equipped,
      case
        when model.item_type in ('implant', 'prosthetic') then true
        when lower(coalesce(link.data->>'requires_installed', '')) in ('true', '1', 'yes', 'on') then true
        when lower(coalesce(link.data->>'requires_installed', '')) in ('false', '0', 'no', 'off') then false
        else false
      end as requires_installed,
      false as requires_selected_source,
      case
        when coalesce(link.data->>'default_current_charges', '') ~ '^-?[0-9]+$' then greatest((link.data->>'default_current_charges')::integer, 0)
        else null
      end as default_current_charges,
      case
        when coalesce(link.data->>'default_max_charges', '') ~ '^-?[0-9]+$' then greatest((link.data->>'default_max_charges')::integer, 0)
        else null
      end as default_max_charges,
      coalesce(
        nullif(trim(coalesce(link.data#>>'{reload,item_code}', '')), ''),
        nullif(trim(coalesce(link.data->>'reload_item_code', '')), ''),
        nullif(trim(coalesce(link.data->>'requires_reload_item_code', '')), '')
      ) as reload_item_code,
      case
        when coalesce(link.data#>>'{reload,item_cost_per_reload}', '') ~ '^-?[0-9]+$' then greatest((link.data#>>'{reload,item_cost_per_reload}')::integer, 1)
        when coalesce(link.data->>'reload_item_cost', '') ~ '^-?[0-9]+$' then greatest((link.data->>'reload_item_cost')::integer, 1)
        else 1
      end as reload_item_cost,
      1 as min_level,
      coalesce(link.is_enabled, true) as is_enabled,
      coalesce(link.sort_order, 0) as sort_order,
      coalesce(link.data, '{}'::jsonb) as data,
      null::uuid as profile_id,
      null::text as profile_code,
      10 as priority
    from public.odyssey_equipment_model_abilities link
    join public.odyssey_equipment_model_defs model on model.id = link.equipment_model_id
    where coalesce(link.is_enabled, true) = true
      and not exists (
        select 1
        from public.odyssey_ability_grants g
        where g.source_def_id = link.equipment_model_id
          and g.ability_def_id = link.ability_def_id
          and g.source_type in ('equipment', 'armor', 'implant', 'prosthetic')
      )
  ),
  weapon_legacy as (
    select
      'weapon'::text as source_type,
      link.weapon_model_id as source_def_id,
      link.ability_def_id,
      'available'::text as grant_mode,
      false as requires_equipped,
      false as requires_installed,
      true as requires_selected_source,
      case
        when coalesce(link.data->>'default_current_charges', '') ~ '^-?[0-9]+$' then greatest((link.data->>'default_current_charges')::integer, 0)
        else null
      end as default_current_charges,
      case
        when coalesce(link.data->>'default_max_charges', '') ~ '^-?[0-9]+$' then greatest((link.data->>'default_max_charges')::integer, 0)
        else null
      end as default_max_charges,
      coalesce(
        nullif(trim(coalesce(link.data#>>'{reload,item_code}', '')), ''),
        nullif(trim(coalesce(link.data->>'reload_item_code', '')), ''),
        nullif(trim(coalesce(link.data->>'requires_reload_item_code', '')), '')
      ) as reload_item_code,
      case
        when coalesce(link.data#>>'{reload,item_cost_per_reload}', '') ~ '^-?[0-9]+$' then greatest((link.data#>>'{reload,item_cost_per_reload}')::integer, 1)
        when coalesce(link.data->>'reload_item_cost', '') ~ '^-?[0-9]+$' then greatest((link.data->>'reload_item_cost')::integer, 1)
        else 1
      end as reload_item_cost,
      1 as min_level,
      coalesce(link.is_enabled_by_default, true) as is_enabled,
      coalesce(link.sort_order, 0) as sort_order,
      coalesce(link.data, '{}'::jsonb) as data,
      link.profile_id,
      profile.code as profile_code,
      10 as priority
    from public.odyssey_weapon_model_ability_links link
    left join public.odyssey_weapon_model_profiles profile on profile.id = link.profile_id
    where not exists (
      select 1
      from public.odyssey_ability_grants g
      where g.source_type = 'weapon'
        and g.source_def_id = link.weapon_model_id
        and g.ability_def_id = link.ability_def_id
    )
  ),
  combined as (
    select * from explicit_grants
    union all
    select * from item_legacy
    union all
    select * from equipment_legacy
    union all
    select * from weapon_legacy
  )
  select distinct on (
    source_type,
    source_def_id,
    ability_def_id,
    coalesce(profile_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
    source_type,
    source_def_id,
    ability_def_id,
    grant_mode,
    requires_equipped,
    requires_installed,
    requires_selected_source,
    default_current_charges,
    default_max_charges,
    reload_item_code,
    reload_item_cost,
    min_level,
    is_enabled,
    sort_order,
    data,
    profile_id,
    profile_code
  from combined
  where coalesce(is_enabled, true) = true
  order by
    source_type,
    source_def_id,
    ability_def_id,
    coalesce(profile_id, '00000000-0000-0000-0000-000000000000'::uuid),
    priority,
    sort_order,
    ability_def_id;
$$;

create or replace function public.odyssey_get_character_active_weapon_id(
  p_character_id uuid
)
returns uuid
language sql
stable
as $$
  select weapon.id
  from public.odyssey_character_weapons weapon
  where weapon.character_id = p_character_id
  order by
    case
      when weapon.equipped_slot = 'primary' then 0
      when weapon.equipped_slot = 'secondary' then 1
      else 2
    end,
    weapon.updated_at desc,
    weapon.created_at desc,
    weapon.id
  limit 1;
$$;

create or replace function public.odyssey_get_character_ability_source_state(
  p_character_ability_id uuid,
  p_selected_character_weapon_id uuid default null
)
returns jsonb
language plpgsql
stable
as $$
declare
  v_ability record;
  v_generated_from text := '';
  v_requires_selected_source boolean := false;
  v_requires_equipped boolean := false;
  v_requires_installed boolean := false;
  v_selected_character_weapon_id uuid := p_selected_character_weapon_id;
  v_source_type text := 'custom';
  v_source_label text := '';
  v_available boolean := true;
  v_disabled_reason text := null;
  v_disabled_code text := null;
  v_reload_item_code text := null;
  v_reload_item_cost integer := 1;
  v_reload_required boolean := false;
begin
  select
    ability.id,
    ability.character_id,
    ability.ability_def_id,
    ability.source_character_weapon_id,
    ability.source_equipment_item_id,
    ability.source_character_item_id,
    ability.is_enabled,
    ability.is_hidden,
    ability.current_charges,
    ability.max_charges,
    ability.data,
    def.code as ability_code,
    def.name as ability_name,
    def.source_type as ability_source_type,
    def.resource_item_code,
    weapon.id as weapon_id,
    weapon.character_id as weapon_character_id,
    weapon.active_profile_id as weapon_active_profile_id,
    weapon.custom_name as weapon_custom_name,
    weapon_model.id as weapon_model_id,
    weapon_model.code as weapon_model_code,
    weapon_model.name as weapon_model_name,
    equipment.id as equipment_id,
    equipment.character_id as equipment_character_id,
    equipment.is_equipped as equipment_is_equipped,
    equipment.equipped_body_part_id as equipment_body_part_id,
    equipment.custom_name as equipment_custom_name,
    equipment_model.id as equipment_model_id,
    equipment_model.code as equipment_model_code,
    equipment_model.name as equipment_model_name,
    equipment_model.item_type as equipment_item_type,
    item.id as item_id,
    item.character_id as item_character_id,
    item.quantity as item_quantity,
    item.custom_name as item_custom_name,
    item_def.id as item_def_id,
    item_def.code as item_def_code,
    item_def.name as item_def_name
  into v_ability
  from public.odyssey_character_abilities ability
  join public.odyssey_ability_defs def on def.id = ability.ability_def_id
  left join public.odyssey_character_weapons weapon on weapon.id = ability.source_character_weapon_id
  left join public.odyssey_weapon_model_defs weapon_model on weapon_model.id = weapon.weapon_model_id
  left join public.odyssey_character_equipment_items equipment on equipment.id = ability.source_equipment_item_id
  left join public.odyssey_equipment_model_defs equipment_model on equipment_model.id = equipment.equipment_model_id
  left join public.odyssey_character_items item on item.id = ability.source_character_item_id
  left join public.odyssey_item_defs item_def on item_def.id = item.item_def_id
  where ability.id = p_character_ability_id;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'error', 'ABILITY_NOT_FOUND',
      'character_ability_id', p_character_ability_id
    );
  end if;

  v_generated_from := lower(trim(coalesce(
    nullif(v_ability.data->>'generated_from', ''),
    nullif(v_ability.ability_source_type, ''),
    'custom'
  )));

  v_requires_selected_source :=
    case
      when lower(coalesce(v_ability.data->>'requires_selected_source', '')) in ('true', '1', 'yes', 'on') then true
      when lower(coalesce(v_ability.data->>'requires_selected_source', '')) in ('false', '0', 'no', 'off') then false
      else v_ability.source_character_weapon_id is not null
    end;

  v_requires_equipped :=
    case
      when lower(coalesce(v_ability.data->>'requires_equipped', '')) in ('true', '1', 'yes', 'on') then true
      when lower(coalesce(v_ability.data->>'requires_equipped', '')) in ('false', '0', 'no', 'off') then false
      else v_generated_from = 'armor'
    end;

  v_requires_installed :=
    case
      when lower(coalesce(v_ability.data->>'requires_installed', '')) in ('true', '1', 'yes', 'on') then true
      when lower(coalesce(v_ability.data->>'requires_installed', '')) in ('false', '0', 'no', 'off') then false
      else v_generated_from in ('equipment', 'implant', 'prosthetic')
    end;

  v_reload_item_code := coalesce(
    nullif(trim(coalesce(v_ability.data#>>'{reload,item_code}', '')), ''),
    nullif(trim(coalesce(v_ability.data->>'reload_item_code', '')), ''),
    nullif(trim(coalesce(v_ability.data->>'requires_reload_item_code', '')), ''),
    nullif(trim(coalesce(v_ability.resource_item_code, '')), '')
  );
  v_reload_item_cost :=
    case
      when coalesce(v_ability.data#>>'{reload,item_cost_per_reload}', '') ~ '^-?[0-9]+$' then greatest((v_ability.data#>>'{reload,item_cost_per_reload}')::integer, 1)
      when coalesce(v_ability.data->>'reload_item_cost', '') ~ '^-?[0-9]+$' then greatest((v_ability.data->>'reload_item_cost')::integer, 1)
      else 1
    end;
  v_reload_required := v_ability.max_charges is not null and coalesce(v_ability.current_charges, 0) <= 0;

  if v_ability.source_character_weapon_id is not null then
    v_source_type := 'weapon';
    v_source_label := coalesce(nullif(trim(coalesce(v_ability.weapon_custom_name, '')), ''), v_ability.weapon_model_name, v_ability.ability_name);
    if v_selected_character_weapon_id is null then
      v_selected_character_weapon_id := public.odyssey_get_character_active_weapon_id(v_ability.character_id);
    end if;

    if coalesce((v_ability.data->>'source_removed')::boolean, false) or v_ability.weapon_id is null then
      v_available := false;
      v_disabled_code := 'SOURCE_REMOVED';
      v_disabled_reason := format('%s is no longer available.', v_source_label);
    elsif nullif(trim(coalesce(v_ability.data->>'required_profile_id', '')), '') is not null
      and v_ability.weapon_active_profile_id::text <> nullif(trim(coalesce(v_ability.data->>'required_profile_id', '')), '') then
      v_available := false;
      v_disabled_code := 'WEAPON_PROFILE_REQUIREMENT_NOT_MET';
      v_disabled_reason := format('Switch %s profile.', v_source_label);
    elsif v_requires_selected_source
      and v_selected_character_weapon_id is distinct from v_ability.source_character_weapon_id then
      v_available := false;
      v_disabled_code := 'WEAPON_REQUIREMENT_NOT_MET';
      v_disabled_reason := format('Select %s.', v_source_label);
    end if;
  elsif v_ability.source_equipment_item_id is not null then
    v_source_type :=
      case
        when v_ability.equipment_item_type in ('armor', 'shield', 'special_protection') then 'armor'
        when v_ability.equipment_item_type = 'implant' then 'implant'
        when v_ability.equipment_item_type = 'prosthetic' then 'prosthetic'
        else coalesce(nullif(v_generated_from, ''), 'equipment')
      end;
    v_source_label := coalesce(nullif(trim(coalesce(v_ability.equipment_custom_name, '')), ''), v_ability.equipment_model_name, v_ability.ability_name);

    if coalesce((v_ability.data->>'source_removed')::boolean, false) or v_ability.equipment_id is null then
      v_available := false;
      v_disabled_code := 'SOURCE_REMOVED';
      v_disabled_reason := format('%s is no longer available.', v_source_label);
    elsif v_requires_equipped and not coalesce(v_ability.equipment_is_equipped, false) then
      v_available := false;
      v_disabled_code := 'EQUIPMENT_NOT_EQUIPPED';
      v_disabled_reason := format('Equip %s.', v_source_label);
    elsif v_requires_installed
      and not coalesce(v_ability.equipment_is_equipped, false)
      and v_ability.equipment_body_part_id is null then
      v_available := false;
      v_disabled_code := 'EQUIPMENT_NOT_INSTALLED';
      v_disabled_reason := format('Install %s.', v_source_label);
    end if;
  elsif v_ability.source_character_item_id is not null then
    v_source_type := 'item';
    v_source_label := coalesce(nullif(trim(coalesce(v_ability.item_custom_name, '')), ''), v_ability.item_def_name, v_ability.ability_name);

    if coalesce((v_ability.data->>'source_removed')::boolean, false)
       or v_ability.item_id is null
       or coalesce(v_ability.item_quantity, 0) <= 0 then
      v_available := false;
      v_disabled_code := 'ITEM_SOURCE_NOT_AVAILABLE';
      v_disabled_reason := format('%s is no longer available.', v_source_label);
    end if;
  else
    v_source_type := coalesce(nullif(v_generated_from, ''), coalesce(v_ability.ability_source_type, 'custom'));
    v_source_label := coalesce(nullif(trim(coalesce(v_ability.data->>'source_label', '')), ''), v_ability.ability_name);

    if coalesce((v_ability.data->>'source_removed')::boolean, false) then
      v_available := false;
      v_disabled_code := 'SOURCE_REMOVED';
      v_disabled_reason := format('%s is no longer available.', v_source_label);
    end if;
  end if;

  return jsonb_build_object(
    'ok', true,
    'characterAbilityId', v_ability.id,
    'sourceType', v_source_type,
    'sourceLabel', v_source_label,
    'sourceCharacterWeaponId', case when v_ability.source_character_weapon_id is not null then v_ability.source_character_weapon_id::text else null end,
    'sourceEquipmentItemId', case when v_ability.source_equipment_item_id is not null then v_ability.source_equipment_item_id::text else null end,
    'sourceCharacterItemId', case when v_ability.source_character_item_id is not null then v_ability.source_character_item_id::text else null end,
    'selectedCharacterWeaponId', case when v_selected_character_weapon_id is not null then v_selected_character_weapon_id::text else null end,
    'available', v_available,
    'disabledReason', v_disabled_reason,
    'disabledCode', v_disabled_code,
    'reload', jsonb_strip_nulls(
      jsonb_build_object(
        'required', v_reload_required,
        'itemCode', v_reload_item_code,
        'itemCost', v_reload_item_cost
      )
    ),
    'requirements', jsonb_build_object(
      'weaponId', case when v_ability.source_character_weapon_id is not null then v_ability.source_character_weapon_id::text else null end,
      'equipmentItemId', case when v_ability.source_equipment_item_id is not null then v_ability.source_equipment_item_id::text else null end,
      'itemId', case when v_ability.source_character_item_id is not null then v_ability.source_character_item_id::text else null end,
      'requiresSelectedSource', v_requires_selected_source,
      'requiresEquipped', v_requires_equipped,
      'requiresInstalled', v_requires_installed,
      'conditionSummary', v_disabled_reason
    )
  );
end;
$$;

create or replace function public.odyssey_validate_character_ability_source(
  p_character_ability_id uuid,
  p_selected_character_weapon_id uuid default null
)
returns jsonb
language plpgsql
stable
as $$
declare
  v_state jsonb := public.odyssey_get_character_ability_source_state(
    p_character_ability_id,
    p_selected_character_weapon_id
  );
  v_disabled_code text := coalesce(v_state->>'disabledCode', '');
begin
  if coalesce((v_state->>'ok')::boolean, false) = false then
    return v_state;
  end if;

  if coalesce((v_state->>'available')::boolean, false) = true then
    return jsonb_build_object(
      'ok', true,
      'source_state', v_state
    );
  end if;

  return jsonb_build_object(
    'ok', false,
    'error',
      case v_disabled_code
        when 'WEAPON_REQUIREMENT_NOT_MET' then 'WEAPON_REQUIREMENT_NOT_MET'
        when 'WEAPON_PROFILE_REQUIREMENT_NOT_MET' then 'ABILITY_NOT_AVAILABLE_FOR_WEAPON_PROFILE'
        when 'EQUIPMENT_NOT_EQUIPPED' then 'EQUIPMENT_NOT_EQUIPPED'
        when 'EQUIPMENT_NOT_INSTALLED' then 'EQUIPMENT_NOT_INSTALLED'
        when 'ITEM_SOURCE_NOT_AVAILABLE' then 'SOURCE_REMOVED'
        when 'SOURCE_REMOVED' then 'SOURCE_REMOVED'
        else 'ABILITY_SOURCE_REQUIREMENT_NOT_MET'
      end,
    'message', coalesce(v_state->>'disabledReason', 'Ability source requirement is not met.'),
    'character_ability_id', p_character_ability_id,
    'source_state', v_state
  );
end;
$$;

create or replace function public.initialize_character_weapon_abilities(
  p_character_weapon_id uuid
)
returns jsonb
language plpgsql
as $$
declare
  v_weapon record;
  v_grant record;
  v_payload_data jsonb := '{}'::jsonb;
  v_processed_ability_ids uuid[] := '{}'::uuid[];
  v_upserted_count integer := 0;
  v_hidden_count integer := 0;
begin
  select
    weapon.id,
    weapon.character_id,
    weapon.weapon_model_id,
    model.code as weapon_model_code,
    model.name as weapon_model_name
  into v_weapon
  from public.odyssey_character_weapons weapon
  join public.odyssey_weapon_model_defs model on model.id = weapon.weapon_model_id
  where weapon.id = p_character_weapon_id;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'error', 'CHARACTER_WEAPON_NOT_FOUND',
      'character_weapon_id', p_character_weapon_id
    );
  end if;

  for v_grant in
    select grant_link.*
    from public.odyssey_get_unified_ability_grants() grant_link
    where grant_link.source_type = 'weapon'
      and grant_link.source_def_id = v_weapon.weapon_model_id
      and grant_link.is_enabled = true
    order by
      case when grant_link.profile_id is null then 1 else 0 end,
      grant_link.sort_order,
      grant_link.ability_def_id
  loop
    v_payload_data := jsonb_strip_nulls(
      coalesce(v_grant.data, '{}'::jsonb)
      || jsonb_build_object(
        'generated', true,
        'generated_from', 'weapon',
        'weapon_model_id', v_weapon.weapon_model_id::text,
        'weapon_model_code', v_weapon.weapon_model_code,
        'weapon_model_name', v_weapon.weapon_model_name,
        'source_label', v_weapon.weapon_model_name,
        'grant_mode', v_grant.grant_mode,
        'requires_selected_source', coalesce(v_grant.requires_selected_source, true),
        'requires_equipped', coalesce(v_grant.requires_equipped, false),
        'requires_installed', coalesce(v_grant.requires_installed, false),
        'source_removed', false,
        'required_profile_id', case when v_grant.profile_id is not null then v_grant.profile_id::text else null end,
        'required_profile_code', v_grant.profile_code,
        'default_current_charges', v_grant.default_current_charges,
        'default_max_charges', v_grant.default_max_charges,
        'reload_item_code', v_grant.reload_item_code,
        'reload_item_cost', v_grant.reload_item_cost,
        'reload',
          case
            when v_grant.reload_item_code is not null then jsonb_build_object(
              'mode',
                case
                  when v_grant.default_max_charges is not null then 'per_charge'
                  else 'reset'
                end,
              'item_code', v_grant.reload_item_code,
              'item_cost_per_reload', v_grant.reload_item_cost
            )
            else null
          end
      )
    );

    insert into public.odyssey_character_abilities (
      character_id,
      ability_def_id,
      character_skill_id,
      learned_level,
      source_character_weapon_id,
      is_enabled,
      is_hidden,
      current_cooldown_rounds,
      current_charges,
      max_charges,
      data,
      notes,
      sort_order
    )
    values (
      v_weapon.character_id,
      v_grant.ability_def_id,
      null,
      greatest(coalesce(nullif(trim(coalesce(v_payload_data->>'learned_level', '')), '')::integer, 1), 1),
      v_weapon.id,
      true,
      false,
      greatest(coalesce(nullif(trim(coalesce(v_payload_data->>'cooldown_rounds', '')), '')::integer, 0), 0),
      v_grant.default_current_charges,
      v_grant.default_max_charges,
      v_payload_data,
      '',
      coalesce(v_grant.sort_order, 0)
    )
    on conflict (character_id, ability_def_id, source_character_weapon_id)
    where source_character_weapon_id is not null
    do update
    set
      learned_level = excluded.learned_level,
      is_enabled = true,
      is_hidden = false,
      current_charges =
        case
          when public.odyssey_character_abilities.current_charges is null then excluded.current_charges
          else public.odyssey_character_abilities.current_charges
        end,
      max_charges =
        case
          when public.odyssey_character_abilities.max_charges is null then excluded.max_charges
          else public.odyssey_character_abilities.max_charges
        end,
      data = excluded.data,
      sort_order = excluded.sort_order,
      updated_at = timezone('utc', now());

    v_processed_ability_ids := array_append(v_processed_ability_ids, v_grant.ability_def_id);
    v_upserted_count := v_upserted_count + 1;
  end loop;

  update public.odyssey_character_abilities ability
  set
    is_enabled = false,
    is_hidden = true,
    data =
      coalesce(ability.data, '{}'::jsonb)
      || jsonb_build_object(
        'generated', true,
        'generated_from', 'weapon',
        'source_removed', true,
        'source_removed_reason', 'missing_weapon'
      ),
    updated_at = timezone('utc', now())
  where ability.character_id = v_weapon.character_id
    and ability.source_character_weapon_id = v_weapon.id
    and coalesce(ability.data->>'generated_from', '') = 'weapon'
    and (
      coalesce(array_length(v_processed_ability_ids, 1), 0) = 0
      or not (ability.ability_def_id = any(v_processed_ability_ids))
    );

  get diagnostics v_hidden_count = row_count;

  return jsonb_build_object(
    'ok', true,
    'character_weapon_id', v_weapon.id,
    'character_id', v_weapon.character_id,
    'weapon_model_id', v_weapon.weapon_model_id,
    'upserted_count', v_upserted_count,
    'hidden_count', v_hidden_count
  );
end;
$$;

create or replace function public.odyssey_reconcile_character_abilities(
  p_character_id uuid
)
returns jsonb
language plpgsql
as $$
declare
  v_character_exists boolean := false;
  v_skill_upserted integer := 0;
  v_skill_hidden integer := 0;
  v_perk_upserted integer := 0;
  v_perk_hidden integer := 0;
  v_item_upserted integer := 0;
  v_item_hidden integer := 0;
  v_equipment_upserted integer := 0;
  v_equipment_hidden integer := 0;
  v_weapon_hidden integer := 0;
  v_weapon_result jsonb := '[]'::jsonb;
  v_source record;
  v_existing public.odyssey_character_abilities%rowtype;
  v_payload_data jsonb := '{}'::jsonb;
  v_weapon_sync_result jsonb := '{}'::jsonb;
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
      'character_id', p_character_id
    );
  end if;

  for v_source in
    with mapped_skill_grants as (
      select
        ad.id as ability_def_id,
        grant_link.source_def_id as skill_def_id,
        cs.id as character_skill_id,
        greatest(coalesce(cs.level, 0), 0) as skill_level,
        coalesce(grant_link.sort_order, ad.sort_order, 0) as sort_order,
        jsonb_strip_nulls(
          coalesce(grant_link.data, '{}'::jsonb)
          || jsonb_build_object(
            'generated', true,
            'generated_from', 'skill',
            'skill_def_id', grant_link.source_def_id::text,
            'character_skill_id', cs.id::text,
            'grant_mode', grant_link.grant_mode,
            'source_removed', false
          )
        ) as grant_data,
        0 as source_priority
      from public.odyssey_get_unified_ability_grants() grant_link
      join public.odyssey_ability_defs ad on ad.id = grant_link.ability_def_id
      join public.odyssey_character_skills cs
        on cs.character_id = p_character_id
       and cs.skill_def_id = grant_link.source_def_id
      where grant_link.source_type = 'skill'
        and grant_link.is_enabled = true
        and greatest(coalesce(cs.level, 0), 0) >= greatest(coalesce(grant_link.min_level, 1), 1)
    ),
    legacy_skill_grants as (
      select
        ad.id as ability_def_id,
        ad.linked_skill_id as skill_def_id,
        cs.id as character_skill_id,
        greatest(coalesce(cs.level, 0), 0) as skill_level,
        coalesce(ad.sort_order, 0) as sort_order,
        jsonb_build_object(
          'generated', true,
          'generated_from', 'skill',
          'generated_from_legacy_linked_skill_id', true,
          'skill_def_id', ad.linked_skill_id::text,
          'character_skill_id', cs.id::text,
          'source_removed', false
        ) as grant_data,
        1 as source_priority
      from public.odyssey_ability_defs ad
      join public.odyssey_character_skills cs
        on cs.character_id = p_character_id
       and cs.skill_def_id = ad.linked_skill_id
      where ad.linked_skill_id is not null
        and not exists (
          select 1
          from public.odyssey_get_unified_ability_grants() grant_link
          where grant_link.source_type = 'skill'
            and grant_link.source_def_id = ad.linked_skill_id
            and grant_link.ability_def_id = ad.id
        )
    )
    select distinct on (combined.ability_def_id, combined.character_skill_id)
      combined.*
    from (
      select * from mapped_skill_grants
      union all
      select * from legacy_skill_grants
    ) combined
    order by combined.ability_def_id, combined.character_skill_id, combined.source_priority
  loop
    select *
    into v_existing
    from public.odyssey_character_abilities ability
    where ability.character_id = p_character_id
      and ability.ability_def_id = v_source.ability_def_id
      and ability.source_equipment_item_id is null
      and ability.source_character_item_id is null
      and ability.source_character_weapon_id is null
      and coalesce(ability.data->>'generated_from', 'skill') = 'skill'
    for update of ability;

    if found then
      update public.odyssey_character_abilities
      set
        character_skill_id = v_source.character_skill_id,
        learned_level = v_source.skill_level,
        is_enabled = true,
        is_hidden = false,
        data = v_source.grant_data,
        sort_order = v_source.sort_order,
        updated_at = timezone('utc', now())
      where id = v_existing.id;
    else
      insert into public.odyssey_character_abilities (
        character_id,
        ability_def_id,
        character_skill_id,
        learned_level,
        source_equipment_item_id,
        source_character_item_id,
        source_character_weapon_id,
        is_enabled,
        is_hidden,
        data,
        notes,
        sort_order
      )
      values (
        p_character_id,
        v_source.ability_def_id,
        v_source.character_skill_id,
        v_source.skill_level,
        null,
        null,
        null,
        true,
        false,
        v_source.grant_data,
        '',
        v_source.sort_order
      );
    end if;

    v_skill_upserted := v_skill_upserted + 1;
  end loop;

  update public.odyssey_character_abilities ability
  set
    is_enabled = false,
    is_hidden = true,
    character_skill_id = null,
    data =
      coalesce(ability.data, '{}'::jsonb)
      || jsonb_build_object(
        'generated', true,
        'generated_from', 'skill',
        'source_removed', true,
        'source_removed_reason', 'missing_skill'
      ),
    updated_at = timezone('utc', now())
  where ability.character_id = p_character_id
    and ability.source_equipment_item_id is null
    and ability.source_character_item_id is null
    and ability.source_character_weapon_id is null
    and coalesce(ability.data->>'generated_from', 'skill') = 'skill'
    and not exists (
      select 1
      from public.odyssey_character_skills skill_row
      where skill_row.character_id = p_character_id
        and (
          skill_row.id = ability.character_skill_id
          or skill_row.skill_def_id = public.odyssey_try_parse_uuid(ability.data->>'skill_def_id')
        )
    );

  get diagnostics v_skill_hidden = row_count;

  for v_source in
    select
      grant_link.ability_def_id,
      cp.id as character_perk_id,
      cp.perk_def_id,
      coalesce(grant_link.sort_order, 0) as sort_order,
      jsonb_strip_nulls(
        coalesce(grant_link.data, '{}'::jsonb)
        || jsonb_build_object(
          'generated', true,
          'generated_from', 'perk',
          'perk_def_id', cp.perk_def_id::text,
          'character_perk_id', cp.id::text,
          'grant_mode', grant_link.grant_mode,
          'source_removed', false
        )
      ) as grant_data
    from public.odyssey_character_perks cp
    join public.odyssey_get_unified_ability_grants() grant_link
      on grant_link.source_type = 'perk'
     and grant_link.source_def_id = cp.perk_def_id
     and grant_link.is_enabled = true
    where cp.character_id = p_character_id
  loop
    select *
    into v_existing
    from public.odyssey_character_abilities ability
    where ability.character_id = p_character_id
      and ability.ability_def_id = v_source.ability_def_id
      and ability.source_equipment_item_id is null
      and ability.source_character_item_id is null
      and ability.source_character_weapon_id is null
      and coalesce(ability.data->>'generated_from', '') = 'perk'
    for update of ability;

    if found then
      update public.odyssey_character_abilities
      set
        character_skill_id = null,
        learned_level = greatest(coalesce(v_existing.learned_level, 1), 1),
        is_enabled = true,
        is_hidden = false,
        data = v_source.grant_data,
        sort_order = v_source.sort_order,
        updated_at = timezone('utc', now())
      where id = v_existing.id;
    else
      insert into public.odyssey_character_abilities (
        character_id,
        ability_def_id,
        character_skill_id,
        learned_level,
        source_equipment_item_id,
        source_character_item_id,
        source_character_weapon_id,
        is_enabled,
        is_hidden,
        data,
        notes,
        sort_order
      )
      values (
        p_character_id,
        v_source.ability_def_id,
        null,
        1,
        null,
        null,
        null,
        true,
        false,
        v_source.grant_data,
        '',
        v_source.sort_order
      );
    end if;

    v_perk_upserted := v_perk_upserted + 1;
  end loop;

  update public.odyssey_character_abilities ability
  set
    is_enabled = false,
    is_hidden = true,
    data =
      coalesce(ability.data, '{}'::jsonb)
      || jsonb_build_object(
        'generated', true,
        'generated_from', 'perk',
        'source_removed', true,
        'source_removed_reason', 'missing_perk'
      ),
    updated_at = timezone('utc', now())
  where ability.character_id = p_character_id
    and ability.source_equipment_item_id is null
    and ability.source_character_item_id is null
    and ability.source_character_weapon_id is null
    and coalesce(ability.data->>'generated_from', '') = 'perk'
    and not exists (
      select 1
      from public.odyssey_character_perks cp
      where cp.character_id = p_character_id
        and cp.id = public.odyssey_try_parse_uuid(ability.data->>'character_perk_id')
    );

  get diagnostics v_perk_hidden = row_count;

  for v_source in
    select
      grant_link.ability_def_id,
      item.id as source_character_item_id,
      item.item_def_id,
      coalesce(grant_link.sort_order, item.sort_order, 0) as sort_order,
      grant_link.default_current_charges,
      grant_link.default_max_charges,
      jsonb_strip_nulls(
        coalesce(grant_link.data, '{}'::jsonb)
        || jsonb_build_object(
          'generated', true,
          'generated_from', 'item',
          'item_def_id', item.item_def_id::text,
          'source_character_item_id', item.id::text,
          'source_label', coalesce(nullif(trim(coalesce(item.custom_name, '')), ''), item_def.name),
          'grant_mode', grant_link.grant_mode,
          'requires_equipped', grant_link.requires_equipped,
          'requires_installed', grant_link.requires_installed,
          'requires_selected_source', grant_link.requires_selected_source,
          'default_current_charges', grant_link.default_current_charges,
          'default_max_charges', grant_link.default_max_charges,
          'reload_item_code', grant_link.reload_item_code,
          'reload_item_cost', grant_link.reload_item_cost,
          'reload',
            case
              when grant_link.reload_item_code is not null then jsonb_build_object(
                'mode',
                  case
                    when grant_link.default_max_charges is not null then 'per_charge'
                    else 'reset'
                  end,
                'item_code', grant_link.reload_item_code,
                'item_cost_per_reload', grant_link.reload_item_cost
              )
              else null
            end,
          'source_removed', false
        )
      ) as grant_data
    from public.odyssey_character_items item
    join public.odyssey_item_defs item_def on item_def.id = item.item_def_id
    join public.odyssey_get_unified_ability_grants() grant_link
      on grant_link.source_type = 'item'
     and grant_link.source_def_id = item.item_def_id
     and grant_link.is_enabled = true
    where item.character_id = p_character_id
      and coalesce(item.quantity, 0) > 0
  loop
    select *
    into v_existing
    from public.odyssey_character_abilities ability
    where ability.character_id = p_character_id
      and ability.ability_def_id = v_source.ability_def_id
      and ability.source_character_item_id = v_source.source_character_item_id
    for update of ability;

    if found then
      update public.odyssey_character_abilities
      set
        character_skill_id = null,
        learned_level = greatest(coalesce(v_existing.learned_level, 1), 1),
        is_enabled = true,
        is_hidden = false,
        data = v_source.grant_data,
        sort_order = v_source.sort_order,
        updated_at = timezone('utc', now())
      where id = v_existing.id;
    else
      insert into public.odyssey_character_abilities (
        character_id,
        ability_def_id,
        character_skill_id,
        learned_level,
        source_equipment_item_id,
        source_character_item_id,
        source_character_weapon_id,
        is_enabled,
        is_hidden,
        current_charges,
        max_charges,
        data,
        notes,
        sort_order
      )
      values (
        p_character_id,
        v_source.ability_def_id,
        null,
        1,
        null,
        v_source.source_character_item_id,
        null,
        true,
        false,
        v_source.default_current_charges,
        v_source.default_max_charges,
        v_source.grant_data,
        '',
        v_source.sort_order
      );
    end if;

    v_item_upserted := v_item_upserted + 1;
  end loop;

  update public.odyssey_character_abilities ability
  set
    is_enabled = false,
    is_hidden = true,
    data =
      coalesce(ability.data, '{}'::jsonb)
      || jsonb_build_object(
        'generated', true,
        'generated_from', 'item',
        'source_removed', true,
        'source_removed_reason', 'missing_item'
      ),
    updated_at = timezone('utc', now())
  where ability.character_id = p_character_id
    and ability.source_character_item_id is not null
    and coalesce(ability.data->>'generated_from', '') = 'item'
    and not exists (
      select 1
      from public.odyssey_character_items item
      where item.id = ability.source_character_item_id
        and item.character_id = p_character_id
        and coalesce(item.quantity, 0) > 0
    );

  get diagnostics v_item_hidden = row_count;

  for v_source in
    select
      grant_link.ability_def_id,
      item.id as source_equipment_item_id,
      item.equipment_model_id,
      model.item_type,
      coalesce(grant_link.sort_order, item.sort_order, 0) as sort_order,
      grant_link.default_current_charges,
      grant_link.default_max_charges,
      jsonb_strip_nulls(
        coalesce(grant_link.data, '{}'::jsonb)
        || jsonb_build_object(
          'generated', true,
          'generated_from', grant_link.source_type,
          'equipment_model_id', item.equipment_model_id::text,
          'equipment_model_code', model.code,
          'source_equipment_item_id', item.id::text,
          'source_label', coalesce(nullif(trim(coalesce(item.custom_name, '')), ''), model.name),
          'grant_mode', grant_link.grant_mode,
          'requires_equipped', grant_link.requires_equipped,
          'requires_installed', grant_link.requires_installed,
          'requires_selected_source', grant_link.requires_selected_source,
          'default_current_charges', grant_link.default_current_charges,
          'default_max_charges', grant_link.default_max_charges,
          'reload_item_code', grant_link.reload_item_code,
          'reload_item_cost', grant_link.reload_item_cost,
          'reload',
            case
              when grant_link.reload_item_code is not null then jsonb_build_object(
                'mode',
                  case
                    when grant_link.default_max_charges is not null then 'per_charge'
                    else 'reset'
                  end,
                'item_code', grant_link.reload_item_code,
                'item_cost_per_reload', grant_link.reload_item_cost
              )
              else null
            end,
          'source_removed', false
        )
      ) as grant_data
    from public.odyssey_character_equipment_items item
    join public.odyssey_equipment_model_defs model on model.id = item.equipment_model_id
    join public.odyssey_get_unified_ability_grants() grant_link
      on grant_link.source_def_id = item.equipment_model_id
     and grant_link.source_type in ('equipment', 'armor', 'implant', 'prosthetic')
     and grant_link.is_enabled = true
    where item.character_id = p_character_id
  loop
    select *
    into v_existing
    from public.odyssey_character_abilities ability
    where ability.character_id = p_character_id
      and ability.ability_def_id = v_source.ability_def_id
      and ability.source_equipment_item_id = v_source.source_equipment_item_id
    for update of ability;

    if found then
      update public.odyssey_character_abilities
      set
        character_skill_id = null,
        learned_level = greatest(coalesce(v_existing.learned_level, 1), 1),
        is_enabled = true,
        is_hidden = false,
        data = v_source.grant_data,
        sort_order = v_source.sort_order,
        updated_at = timezone('utc', now())
      where id = v_existing.id;
    else
      insert into public.odyssey_character_abilities (
        character_id,
        ability_def_id,
        character_skill_id,
        learned_level,
        source_equipment_item_id,
        source_character_item_id,
        source_character_weapon_id,
        is_enabled,
        is_hidden,
        current_charges,
        max_charges,
        data,
        notes,
        sort_order
      )
      values (
        p_character_id,
        v_source.ability_def_id,
        null,
        1,
        v_source.source_equipment_item_id,
        null,
        null,
        true,
        false,
        v_source.default_current_charges,
        v_source.default_max_charges,
        v_source.grant_data,
        '',
        v_source.sort_order
      );
    end if;

    v_equipment_upserted := v_equipment_upserted + 1;
  end loop;

  update public.odyssey_character_abilities ability
  set
    is_enabled = false,
    is_hidden = true,
    data =
      coalesce(ability.data, '{}'::jsonb)
      || jsonb_build_object(
        'generated', true,
        'generated_from', coalesce(nullif(ability.data->>'generated_from', ''), 'equipment'),
        'source_removed', true,
        'source_removed_reason', 'missing_equipment'
      ),
    updated_at = timezone('utc', now())
  where ability.character_id = p_character_id
    and ability.source_equipment_item_id is not null
    and coalesce(ability.data->>'generated_from', '') in ('equipment', 'armor', 'implant', 'prosthetic')
    and not exists (
      select 1
      from public.odyssey_character_equipment_items item
      where item.id = ability.source_equipment_item_id
        and item.character_id = p_character_id
    );

  get diagnostics v_equipment_hidden = row_count;

  for v_source in
    select weapon.id
    from public.odyssey_character_weapons weapon
    where weapon.character_id = p_character_id
  loop
    v_weapon_sync_result := public.initialize_character_weapon_abilities(v_source.id);
    v_weapon_result := v_weapon_result || jsonb_build_array(v_weapon_sync_result);
  end loop;

  update public.odyssey_character_abilities ability
  set
    is_enabled = false,
    is_hidden = true,
    data =
      coalesce(ability.data, '{}'::jsonb)
      || jsonb_build_object(
        'generated', true,
        'generated_from', 'weapon',
        'source_removed', true,
        'source_removed_reason', 'missing_weapon'
      ),
    updated_at = timezone('utc', now())
  where ability.character_id = p_character_id
    and ability.source_character_weapon_id is not null
    and coalesce(ability.data->>'generated_from', '') = 'weapon'
    and not exists (
      select 1
      from public.odyssey_character_weapons weapon
      where weapon.id = ability.source_character_weapon_id
        and weapon.character_id = p_character_id
    );

  get diagnostics v_weapon_hidden = row_count;

  return jsonb_build_object(
    'ok', true,
    'character_id', p_character_id,
    'skill_upserted', v_skill_upserted,
    'skill_hidden', v_skill_hidden,
    'perk_upserted', v_perk_upserted,
    'perk_hidden', v_perk_hidden,
    'item_upserted', v_item_upserted,
    'item_hidden', v_item_hidden,
    'equipment_upserted', v_equipment_upserted,
    'equipment_hidden', v_equipment_hidden,
    'weapon_hidden', v_weapon_hidden,
    'weapon_result', v_weapon_result
  );
end;
$$;

do $$
begin
  if to_regprocedure('public.get_character_abilities(uuid)') is not null
     and to_regprocedure('public.odyssey_get_character_abilities_legacy(uuid)') is null then
    alter function public.get_character_abilities(uuid)
      rename to odyssey_get_character_abilities_legacy;
  end if;
end;
$$;

create or replace function public.get_character_abilities(
  p_character_id uuid
)
returns jsonb
language plpgsql
stable
as $$
declare
  v_result jsonb := public.odyssey_get_character_abilities_legacy(p_character_id);
  v_abilities jsonb := '[]'::jsonb;
begin
  if coalesce((v_result->>'ok')::boolean, false) = false then
    return v_result;
  end if;

  select coalesce(
    jsonb_agg(
      ability_rows.ability
      || jsonb_strip_nulls(
        jsonb_build_object(
          'sourceLabel', source_state->>'sourceLabel',
          'runtimeState',
            jsonb_build_object(
              'available', coalesce((source_state->>'available')::boolean, true),
              'disabledReason', source_state->>'disabledReason'
            ),
          'source',
            jsonb_strip_nulls(
              coalesce(
                case
                  when jsonb_typeof(ability_rows.ability->'source') = 'object' then ability_rows.ability->'source'
                  else '{}'::jsonb
                end,
                '{}'::jsonb
              )
              || jsonb_build_object(
                'type', source_state->>'sourceType',
                'character_weapon_id', nullif(source_state->>'sourceCharacterWeaponId', ''),
                'character_equipment_item_id', nullif(source_state->>'sourceEquipmentItemId', ''),
                'character_item_id', nullif(source_state->>'sourceCharacterItemId', ''),
                'label', source_state->>'sourceLabel',
                'requirements', source_state->'requirements'
              )
            )
        )
      )
      order by ability_rows.sort_order, ability_rows.created_at, ability_rows.id
    ),
    '[]'::jsonb
  )
  into v_abilities
  from (
    select
      ability.id,
      ability.sort_order,
      ability.created_at,
      jsonb_build_object(
        'id', ability.id,
        'character_id', ability.character_id,
        'ability_def_id', def.id,
        'code', def.code,
        'name', def.name,
        'ability_kind', def.ability_kind,
        'source_type', def.source_type,
        'activation_type', def.activation_type,
        'target_type', def.target_type,
        'effect_mode', def.effect_mode,
        'attack_type', def.attack_type,
        'description', def.description,
        'linked_skill_id', def.linked_skill_id,
        'character_skill_id', ability.character_skill_id,
        'learned_level', ability.learned_level,
        'effective_level', public.odyssey_get_character_ability_effective_level(ability.id),
        'is_enabled', ability.is_enabled,
        'is_hidden', ability.is_hidden,
        'current_cooldown_rounds', ability.current_cooldown_rounds,
        'current_charges', ability.current_charges,
        'max_charges', ability.max_charges,
        'source_equipment_item_id', ability.source_equipment_item_id,
        'source_character_item_id', ability.source_character_item_id,
        'source_character_weapon_id', ability.source_character_weapon_id,
        'data', ability.data,
        'notes', ability.notes,
        'tags', def.tags
      ) as ability
    from public.odyssey_character_abilities ability
    join public.odyssey_ability_defs def on def.id = ability.ability_def_id
    where ability.character_id = p_character_id
      and ability.is_hidden = false
      and ability.is_enabled = true
  ) ability_rows
  cross join lateral public.odyssey_get_character_ability_source_state(ability_rows.id, null) source_state;

  return v_result || jsonb_build_object('abilities', v_abilities);
end;
$$;

do $$
begin
  if to_regprocedure('public.odyssey_get_character_quick_actions_runtime(uuid)') is not null
     and to_regprocedure('public.odyssey_get_character_quick_actions_runtime_legacy(uuid)') is null then
    alter function public.odyssey_get_character_quick_actions_runtime(uuid)
      rename to odyssey_get_character_quick_actions_runtime_legacy;
  end if;
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
  v_has_skip_turn_effect boolean;
  v_quick_actions jsonb := '[]'::jsonb;
  v_layout jsonb := jsonb_build_object('slots', '[]'::jsonb);
  v_version integer := 0;
  v_selected_weapon_id uuid := null;
begin
  select exists(
    select 1
    from public.odyssey_characters
    where id = p_character_id
      and not coalesce(is_deleted, false)
  )
  into v_character_exists;

  if not v_character_exists then
    return jsonb_build_object(
      'ok', false,
      'error', 'CHARACTER_NOT_FOUND',
      'message', 'Character does not exist or is deleted',
      'characterId', p_character_id,
      'quickActions', '[]'::jsonb,
      'quickbar', jsonb_build_object('slots', '[]'::jsonb, 'maxSlots', 20, 'version', 0)
    );
  end if;

  select coalesce(cs.is_alive, true)
  into v_is_alive
  from public.odyssey_characters c
  left join public.odyssey_character_combat_state cs on cs.character_id = c.id
  where c.id = p_character_id;

  v_has_skip_turn_effect := public.odyssey_character_has_active_effect_flag(p_character_id, 'skip_turn');
  v_selected_weapon_id := public.odyssey_get_character_active_weapon_id(p_character_id);

  select t.layout, t.version
  into v_layout, v_version
  from public.odyssey_character_quickbar_layouts t
  where t.character_id = p_character_id;

  v_layout := coalesce(v_layout, jsonb_build_object('slots', '[]'::jsonb));
  v_version := coalesce(v_version, 0);

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'characterActionId', ability.id,
        'definitionId', def.id,
        'characterSkillId', ability.character_skill_id,
        'sourceCharacterWeaponId', nullif(source_state->>'sourceCharacterWeaponId', ''),
        'sourceEquipmentItemId', nullif(source_state->>'sourceEquipmentItemId', ''),
        'sourceCharacterItemId', nullif(source_state->>'sourceCharacterItemId', ''),
        'sourceType', coalesce(source_state->>'sourceType', def.source_type),
        'sourceLabel', source_state->>'sourceLabel',
        'type',
          case
            when coalesce(def.effect_mode, '') = 'attack' or def.ability_kind = 'attack' then 'attack_technique'
            when coalesce(def.target_type, 'none') in ('character', 'body_part') then 'directed'
            else 'instant'
          end,
        'name', def.name,
        'shortDescription', substring(def.description, 1, 100),
        'fullDescription', def.description,
        'iconKey', coalesce(def.data->>'icon_key', 'bolt'),
        'semanticKind', def.ability_kind,
        'targeting', jsonb_build_object(
          'mode', coalesce(def.target_type, 'none'),
          'minTargets', 1,
          'maxTargets', 1,
          'allowAllies', true,
          'allowSelf', def.target_type = 'self',
          'requiresBodyZone', def.target_type = 'body_part'
        ),
        'costs', jsonb_build_object(
          'main', case when def.resource_mode = 'pool' then 1 else 0 end,
          'move', 0,
          'psi', case when def.resource_pool_code = 'psi' then coalesce((level_data.data->>'psi_cost')::integer, 0) else 0 end,
          'charges', coalesce(ability.current_charges, 0)
        ),
        'cooldown', jsonb_build_object(
          'current', ability.current_cooldown_rounds,
          'max', coalesce(level_data.cooldown_rounds, 0),
          'unit', 'turn'
        ),
        'reload',
          jsonb_strip_nulls(
            jsonb_build_object(
              'required',
                coalesce((source_state#>>'{reload,required}')::boolean, false)
                and ability.max_charges is not null,
              'itemCode', nullif(source_state#>>'{reload,itemCode}', ''),
              'itemCost', coalesce(nullif(source_state#>>'{reload,itemCost}', '')::integer, 1)
            )
          ),
        'state', jsonb_build_object(
          'available',
            ability.is_enabled
            and not v_has_skip_turn_effect
            and (v_is_alive or def.target_type = 'none')
            and coalesce(ability.current_cooldown_rounds, 0) <= 0
            and not coalesce(res.insufficient_pool, false)
            and not coalesce(res.insufficient_charges, false)
            and coalesce((source_state->>'available')::boolean, true),
          'active', false,
          'disabledReason',
            case
              when not ability.is_enabled then 'Ability is disabled'
              when v_has_skip_turn_effect then 'Skipping turn'
              when not v_is_alive and def.target_type <> 'none' then 'Character is dead'
              when coalesce(ability.current_cooldown_rounds, 0) > 0 then format('Cooldown: %s turns', ability.current_cooldown_rounds)
              when coalesce(res.insufficient_pool, false) then format('Not enough %s', coalesce(def.resource_pool_code, 'resource'))
              when coalesce(res.insufficient_charges, false)
                then coalesce(
                  case
                    when nullif(source_state#>>'{reload,itemCode}', '') is not null
                      then format('Reload with %s.', source_state#>>'{reload,itemCode}')
                    else 'No charges left'
                  end,
                  'No charges left'
                )
              when coalesce((source_state->>'available')::boolean, true) = false then source_state->>'disabledReason'
              else null
            end,
          'selectable',
            ability.is_enabled
            and not v_has_skip_turn_effect
            and (v_is_alive or def.target_type = 'none')
            and coalesce(ability.current_cooldown_rounds, 0) <= 0
            and not coalesce(res.insufficient_pool, false)
            and not coalesce(res.insufficient_charges, false)
            and coalesce((source_state->>'available')::boolean, true),
          'executionAvailable', true,
          'executionReason', null,
          'resourceSufficient', not (coalesce(res.insufficient_pool, false) or coalesce(res.insufficient_charges, false))
        ),
        'requirements',
          jsonb_strip_nulls(
            jsonb_build_object(
              'weaponClass', null,
              'weaponId', nullif(source_state#>>'{requirements,weaponId}', ''),
              'equipmentItemId', nullif(source_state#>>'{requirements,equipmentItemId}', ''),
              'itemId', nullif(source_state#>>'{requirements,itemId}', ''),
              'requiresSelectedSource', coalesce((source_state#>>'{requirements,requiresSelectedSource}')::boolean, false),
              'requiresEquipped', coalesce((source_state#>>'{requirements,requiresEquipped}')::boolean, false),
              'requiresInstalled', coalesce((source_state#>>'{requirements,requiresInstalled}')::boolean, false),
              'conditionSummary', nullif(source_state#>>'{requirements,conditionSummary}', '')
            )
          )
      )
      order by ability.sort_order, ability.created_at, ability.id
    ),
    '[]'::jsonb
  )
  into v_quick_actions
  from public.odyssey_character_abilities ability
  join public.odyssey_ability_defs def on def.id = ability.ability_def_id
  left join lateral (
    select level_entry.*
    from public.odyssey_ability_level_defs level_entry
    where level_entry.ability_def_id = def.id
      and level_entry.ability_level <= public.odyssey_get_character_ability_effective_level(ability.id)
    order by level_entry.ability_level desc
    limit 1
  ) level_data on true
  left join public.odyssey_resource_pool_defs rpd on rpd.code = def.resource_pool_code
  left join public.odyssey_character_resource_pools rp
    on rp.character_id = ability.character_id
   and rp.resource_pool_def_id = rpd.id
  cross join lateral public.odyssey_get_character_ability_source_state(
    ability.id,
    v_selected_weapon_id
  ) source_state
  left join lateral (
    select
      (def.resource_mode = 'pool' and coalesce(rp.current_value, 0) < coalesce(level_data.resource_cost, 0)) as insufficient_pool,
      ((ability.max_charges is not null and coalesce(ability.current_charges, 0) <= 0)) as insufficient_charges
  ) res on true
  where ability.character_id = p_character_id
    and ability.is_hidden = false
    and ability.is_enabled = true
    and def.ability_kind != 'passive'
    and def.activation_type in ('manual', 'custom');

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

do $$
begin
  if to_regprocedure('public.odyssey_use_ability_with_weapon_support(jsonb)') is not null
     and to_regprocedure('public.odyssey_use_ability_with_weapon_support_legacy(jsonb)') is null then
    alter function public.odyssey_use_ability_with_weapon_support(jsonb)
      rename to odyssey_use_ability_with_weapon_support_legacy;
  end if;
end;
$$;

create or replace function public.odyssey_use_ability_with_weapon_support(
  p_payload jsonb
)
returns jsonb
language plpgsql
as $$
declare
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_character_ability_id uuid := public.odyssey_try_parse_uuid(v_payload->>'character_ability_id');
  v_character_id uuid := public.odyssey_try_parse_uuid(v_payload->>'character_id');
  v_ability_code text := lower(trim(coalesce(v_payload->>'ability_code', '')));
  v_selected_character_weapon_id uuid := public.odyssey_try_parse_uuid(v_payload->>'selected_character_weapon_id');
  v_source_validation jsonb := '{}'::jsonb;
  v_ability record;
  v_level record;
  v_effective_level integer := 0;
  v_merged_ability_data jsonb := '{}'::jsonb;
  v_resource_result jsonb := '{}'::jsonb;
  v_activation_result jsonb := '{}'::jsonb;
  v_refresh jsonb := '{}'::jsonb;
  v_feature_code text := '';
begin
  if v_character_ability_id is null then
    if v_character_id is null or v_ability_code = '' then
      return jsonb_build_object(
        'ok', false,
        'error', 'ABILITY_NOT_FOUND',
        'message', 'character_ability_id or character_id + ability_code is required.'
      );
    end if;

    select ability.id
    into v_character_ability_id
    from public.odyssey_character_abilities ability
    join public.odyssey_ability_defs def on def.id = ability.ability_def_id
    where ability.character_id = v_character_id
      and def.code = v_ability_code
      and ability.is_enabled = true
    order by ability.sort_order, ability.created_at, ability.id
    limit 1;
  end if;

  v_source_validation := public.odyssey_validate_character_ability_source(
    v_character_ability_id,
    v_selected_character_weapon_id
  );
  if coalesce((v_source_validation->>'ok')::boolean, false) = false then
    return v_source_validation;
  end if;

  select
    ability.*,
    def.code as ability_code,
    def.name as ability_name,
    def.ability_kind,
    def.source_type,
    def.activation_type,
    def.target_type,
    def.effect_mode,
    def.attack_type,
    def.resource_item_code,
    def.data as def_data
  into v_ability
  from public.odyssey_character_abilities ability
  join public.odyssey_ability_defs def on def.id = ability.ability_def_id
  where ability.id = v_character_ability_id
    and ability.is_enabled = true
  for update of ability;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'error', 'ABILITY_NOT_FOUND',
      'character_ability_id', v_character_ability_id
    );
  end if;

  if v_ability.effect_mode <> 'activate_weapon_feature' then
    return public.odyssey_use_ability_with_weapon_support_legacy(v_payload);
  end if;

  v_effective_level := public.odyssey_get_character_ability_effective_level(v_character_ability_id);
  select *
  into v_level
  from public.odyssey_ability_level_defs level_data
  where level_data.ability_def_id = v_ability.ability_def_id
    and level_data.ability_level <= v_effective_level
  order by level_data.ability_level desc
  limit 1;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'error', 'ABILITY_LEVEL_NOT_AVAILABLE',
      'character_ability_id', v_character_ability_id,
      'effective_level', v_effective_level
    );
  end if;

  v_merged_ability_data := public.odyssey_merge_runtime_data(
    public.odyssey_merge_runtime_data(
      coalesce(v_ability.def_data, '{}'::jsonb),
      coalesce(v_ability.data, '{}'::jsonb)
    ),
    coalesce(v_level.data, '{}'::jsonb)
  );

  v_feature_code := lower(trim(coalesce(
    nullif(v_merged_ability_data->>'weapon_feature_code', ''),
    nullif(v_merged_ability_data->>'feature_code', ''),
    v_ability.ability_code
  )));

  if v_ability.source_character_weapon_id is null or v_feature_code = '' then
    return jsonb_build_object(
      'ok', false,
      'error', 'WEAPON_FEATURE_NOT_CONFIGURED',
      'message', 'The bridge ability does not define a weapon_feature_code.'
    );
  end if;

  v_resource_result := public.odyssey_consume_character_ability_cost(v_character_ability_id);
  if coalesce((v_resource_result->>'ok')::boolean, false) = false then
    return v_resource_result;
  end if;

  if coalesce(v_level.cooldown_rounds, 0) > 0 then
    update public.odyssey_character_abilities
    set current_cooldown_rounds = v_level.cooldown_rounds
    where id = v_character_ability_id;
  end if;

  v_activation_result := public.activate_weapon_feature(
    jsonb_build_object(
      'character_weapon_id', v_ability.source_character_weapon_id::text,
      'feature_code', v_feature_code
    )
  );

  if coalesce((v_activation_result->>'ok')::boolean, false) = false then
    return v_activation_result;
  end if;

  v_refresh := coalesce(public.odyssey_refresh_character_combat_state(v_ability.character_id)->'combat_state', '{}'::jsonb);

  return jsonb_build_object(
    'ok', true,
    'character_ability_id', v_character_ability_id,
    'character_id', v_ability.character_id,
    'source_character_weapon_id', v_ability.source_character_weapon_id,
    'ability',
      jsonb_build_object(
        'code', v_ability.ability_code,
        'name', v_ability.ability_name,
        'ability_kind', v_ability.ability_kind,
        'source_type', v_ability.source_type,
        'effect_mode', v_ability.effect_mode,
        'effective_level', v_effective_level
      ),
    'resource', v_resource_result,
    'result', jsonb_build_object('weapon_feature', v_activation_result),
    'combat_state', v_refresh,
    'message', format('%s activated.', v_ability.ability_name)
  );
end;
$$;

create or replace function public.use_ability(
  p_payload jsonb
)
returns jsonb
language plpgsql
as $$
declare
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_character_weapon_id uuid := public.odyssey_try_parse_uuid(v_payload->>'character_weapon_id');
  v_selected_character_weapon_id uuid := public.odyssey_try_parse_uuid(v_payload->>'selected_character_weapon_id');
  v_character_id uuid := public.odyssey_try_parse_uuid(coalesce(v_payload->>'character_id', v_payload->>'attacker_character_id'));
  v_character_ability_id uuid := public.odyssey_try_parse_uuid(v_payload->>'character_ability_id');
  v_ability_code text := lower(trim(coalesce(v_payload->>'ability_code', '')));
  v_lock_state jsonb := '{}'::jsonb;
  v_source_validation jsonb := '{}'::jsonb;
  v_ability record;
begin
  if v_character_ability_id is not null or (v_character_id is not null and v_ability_code <> '') then
    select
      ability.id,
      ability.character_id,
      ability.source_character_weapon_id
    into v_ability
    from public.odyssey_character_abilities ability
    join public.odyssey_ability_defs def on def.id = ability.ability_def_id
    where (
      (v_character_ability_id is not null and ability.id = v_character_ability_id)
      or (
        v_character_ability_id is null
        and ability.character_id = v_character_id
        and def.code = v_ability_code
      )
    )
    order by ability.sort_order, ability.created_at, ability.id
    limit 1;

    if found then
      v_source_validation := public.odyssey_validate_character_ability_source(
        v_ability.id,
        v_selected_character_weapon_id
      );
      if coalesce((v_source_validation->>'ok')::boolean, false) = false then
        return v_source_validation;
      end if;

      v_character_id := v_ability.character_id;
      if v_ability.source_character_weapon_id is not null then
        v_character_weapon_id := v_ability.source_character_weapon_id;
        v_payload := v_payload || jsonb_build_object(
          'character_weapon_id', v_character_weapon_id::text,
          'character_id', v_character_id::text
        );
      end if;
    end if;
  end if;

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

  return public.odyssey_use_ability_with_weapon_support(v_payload);
end;
$$;

create or replace function public.odyssey_perform_ability_attack(
  p_payload jsonb
)
returns jsonb
language plpgsql
as $$
declare
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_character_ability_id uuid := public.odyssey_try_parse_uuid(v_payload->>'character_ability_id');
  v_attacker_character_id uuid := public.odyssey_try_parse_uuid(coalesce(v_payload->>'attacker_character_id', v_payload->>'character_id'));
  v_ability_code text := lower(trim(coalesce(v_payload->>'ability_code', '')));
  v_selected_character_weapon_id uuid := public.odyssey_try_parse_uuid(v_payload->>'selected_character_weapon_id');
  v_ability record;
  v_source_validation jsonb := '{}'::jsonb;
  v_weapon_effect_summary jsonb := '{}'::jsonb;
  v_runtime_modifiers jsonb := '[]'::jsonb;
  v_existing_runtime_data jsonb := case
    when jsonb_typeof(v_payload->'runtime_data') = 'object' then v_payload->'runtime_data'
    else '{}'::jsonb
  end;
  v_runtime_data jsonb := '{}'::jsonb;
  v_result jsonb := '{}'::jsonb;
begin
  if v_character_ability_id is not null or (v_attacker_character_id is not null and v_ability_code <> '') then
    select
      ability.id,
      ability.character_id,
      ability.source_character_weapon_id
    into v_ability
    from public.odyssey_character_abilities ability
    join public.odyssey_ability_defs def on def.id = ability.ability_def_id
    where (
      (v_character_ability_id is not null and ability.id = v_character_ability_id)
      or (
        v_character_ability_id is null
        and ability.character_id = v_attacker_character_id
        and def.code = v_ability_code
      )
    )
    order by ability.sort_order, ability.created_at, ability.id
    limit 1;
  end if;

  if found then
    v_source_validation := public.odyssey_validate_character_ability_source(
      v_ability.id,
      v_selected_character_weapon_id
    );
    if coalesce((v_source_validation->>'ok')::boolean, false) = false then
      return v_source_validation;
    end if;
  end if;

  if found and v_ability.source_character_weapon_id is not null then
    v_attacker_character_id := v_ability.character_id;
    v_weapon_effect_summary := public.odyssey_get_weapon_effect_summary(
      v_attacker_character_id,
      v_ability.source_character_weapon_id
    );

    if coalesce(nullif(v_weapon_effect_summary->>'attack_accuracy', '')::integer, 0) <> 0 then
      v_runtime_modifiers := v_runtime_modifiers || jsonb_build_array(
        jsonb_build_object('target', 'attack_accuracy', 'value', coalesce(nullif(v_weapon_effect_summary->>'attack_accuracy', '')::integer, 0))
      );
    end if;
    if coalesce(nullif(v_weapon_effect_summary->>'damage', '')::integer, 0) <> 0 then
      v_runtime_modifiers := v_runtime_modifiers || jsonb_build_array(
        jsonb_build_object('target', 'damage', 'value', coalesce(nullif(v_weapon_effect_summary->>'damage', '')::integer, 0))
      );
    end if;
    if coalesce(nullif(v_weapon_effect_summary->>'armor_pierce', '')::integer, 0) <> 0 then
      v_runtime_modifiers := v_runtime_modifiers || jsonb_build_array(
        jsonb_build_object('target', 'armor_pierce', 'value', coalesce(nullif(v_weapon_effect_summary->>'armor_pierce', '')::integer, 0))
      );
    end if;
    if coalesce(nullif(v_weapon_effect_summary->>'aim_difficulty', '')::integer, 0) <> 0 then
      v_runtime_modifiers := v_runtime_modifiers || jsonb_build_array(
        jsonb_build_object('target', 'aim_difficulty', 'value', coalesce(nullif(v_weapon_effect_summary->>'aim_difficulty', '')::integer, 0))
      );
    end if;
    if coalesce(nullif(v_weapon_effect_summary->>'range', '')::integer, 0) <> 0 then
      v_runtime_modifiers := v_runtime_modifiers || jsonb_build_array(
        jsonb_build_object('target', 'range', 'value', coalesce(nullif(v_weapon_effect_summary->>'range', '')::integer, 0))
      );
    end if;

    if jsonb_array_length(v_runtime_modifiers) > 0 then
      v_runtime_data := public.odyssey_merge_runtime_data(
        v_existing_runtime_data,
        jsonb_build_object('modifiers', v_runtime_modifiers)
      );
      v_payload := v_payload || jsonb_build_object('runtime_data', v_runtime_data);
    end if;

    v_payload := v_payload || jsonb_build_object(
      'character_weapon_id', v_ability.source_character_weapon_id::text,
      'attacker_character_id', v_attacker_character_id::text,
      'character_id', v_attacker_character_id::text
    );
  end if;

  v_result := public.odyssey_perform_ability_attack_legacy(v_payload);
  if found and v_ability.source_character_weapon_id is not null and coalesce((v_result->>'ok')::boolean, false) = true then
    v_result := v_result || jsonb_build_object(
      'weapon_effects', v_weapon_effect_summary
    );
  end if;

  return v_result;
end;
$$;

create or replace function public.reload_character_ability(
  p_payload jsonb
)
returns jsonb
language plpgsql
as $$
declare
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_character_ability_id uuid := public.odyssey_try_parse_uuid(v_payload->>'character_ability_id');
  v_source_validation jsonb := '{}'::jsonb;
  v_ability record;
  v_result jsonb := '{}'::jsonb;
begin
  if v_character_ability_id is null then
    return jsonb_build_object(
      'ok', false,
      'error', 'ABILITY_NOT_FOUND',
      'message', 'character_ability_id is required.'
    );
  end if;

  select
    ability.id,
    ability.character_id,
    ability.current_charges,
    ability.max_charges
  into v_ability
  from public.odyssey_character_abilities ability
  where ability.id = v_character_ability_id;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'error', 'ABILITY_NOT_FOUND',
      'character_ability_id', v_character_ability_id
    );
  end if;

  v_source_validation := public.odyssey_validate_character_ability_source(v_character_ability_id, null);
  if coalesce((v_source_validation->>'ok')::boolean, false) = false then
    return v_source_validation;
  end if;

  if v_ability.max_charges is null or v_ability.max_charges <= 0 then
    return jsonb_build_object(
      'ok', false,
      'error', 'ABILITY_NOT_RELOADABLE',
      'character_ability_id', v_character_ability_id
    );
  end if;

  if coalesce(v_ability.current_charges, 0) >= v_ability.max_charges then
    return jsonb_build_object(
      'ok', false,
      'error', 'ABILITY_ALREADY_FULL',
      'character_ability_id', v_character_ability_id
    );
  end if;

  v_result := public.reload_feature_resource(
    jsonb_build_object(
      'feature_instance_type', 'character_ability',
      'feature_instance_id', v_character_ability_id::text,
      'quantity', 1
    )
  );

  if coalesce((v_result->>'ok')::boolean, false) = false then
    return jsonb_build_object(
      'ok', false,
      'error',
        case coalesce(v_result->>'error', '')
          when 'FEATURE_NOT_RELOADABLE' then 'ABILITY_NOT_RELOADABLE'
          when 'FEATURE_INSTANCE_NOT_FOUND' then 'ABILITY_NOT_FOUND'
          when 'NO_RESOURCE_ITEM' then 'RELOAD_ITEM_NOT_FOUND'
          when 'INSUFFICIENT_RESOURCE_ITEM' then 'RELOAD_ITEM_INSUFFICIENT'
          when 'NO_CHARGE_CAPACITY' then 'ABILITY_ALREADY_FULL'
          else coalesce(v_result->>'error', 'ABILITY_RELOAD_FAILED')
        end,
      'message', coalesce(v_result->>'message', 'Unable to reload ability.'),
      'character_ability_id', v_character_ability_id,
      'details', v_result
    );
  end if;

  return v_result || jsonb_build_object(
    'character_ability_id', v_character_ability_id
  );
end;
$$;

grant execute on function public.odyssey_get_unified_ability_grants() to anon, authenticated;
grant execute on function public.odyssey_get_character_active_weapon_id(uuid) to anon, authenticated;
grant execute on function public.odyssey_get_character_ability_source_state(uuid, uuid) to anon, authenticated;
grant execute on function public.odyssey_validate_character_ability_source(uuid, uuid) to anon, authenticated;
grant execute on function public.reload_character_ability(jsonb) to anon, authenticated;

-- ===== END 106_universal_granted_abilities.sql =====
