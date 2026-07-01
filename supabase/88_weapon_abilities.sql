-- 88_weapon_abilities.sql

create table if not exists public.odyssey_weapon_model_ability_links (
  id uuid primary key default gen_random_uuid(),
  weapon_model_id uuid not null references public.odyssey_weapon_model_defs(id) on delete cascade,
  ability_def_id uuid not null references public.odyssey_ability_defs(id) on delete cascade,
  profile_id uuid null references public.odyssey_weapon_model_profiles(id) on delete cascade,
  is_enabled_by_default boolean not null default true,
  sort_order integer not null default 0,
  data jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object'),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists odyssey_weapon_model_ability_links_unique_idx
  on public.odyssey_weapon_model_ability_links (
    weapon_model_id,
    ability_def_id,
    coalesce(profile_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

create index if not exists odyssey_weapon_model_ability_links_weapon_idx
  on public.odyssey_weapon_model_ability_links (weapon_model_id, sort_order, created_at);

create index if not exists odyssey_weapon_model_ability_links_profile_idx
  on public.odyssey_weapon_model_ability_links (profile_id, sort_order, created_at);

create index if not exists odyssey_weapon_model_ability_links_ability_idx
  on public.odyssey_weapon_model_ability_links (ability_def_id, sort_order, created_at);

alter table public.odyssey_weapon_model_ability_links enable row level security;

drop policy if exists "odyssey_weapon_model_ability_links_full_access" on public.odyssey_weapon_model_ability_links;
create policy "odyssey_weapon_model_ability_links_full_access"
on public.odyssey_weapon_model_ability_links
for all
to anon, authenticated
using (true)
with check (true);

grant select, insert, update, delete on public.odyssey_weapon_model_ability_links to anon, authenticated;

drop trigger if exists odyssey_touch_updated_at_weapon_model_ability_links on public.odyssey_weapon_model_ability_links;
create trigger odyssey_touch_updated_at_weapon_model_ability_links
before update on public.odyssey_weapon_model_ability_links
for each row
execute function public.odyssey_touch_updated_at();

alter table public.odyssey_character_abilities
  add column if not exists source_character_weapon_id uuid null references public.odyssey_character_weapons(id) on delete cascade;

alter table public.odyssey_character_effects
  add column if not exists source_character_weapon_id uuid null references public.odyssey_character_weapons(id) on delete cascade;

drop index if exists public.odyssey_character_abilities_unique_source_idx;
create unique index if not exists odyssey_character_abilities_unique_source_idx
  on public.odyssey_character_abilities (
    character_id,
    ability_def_id,
    coalesce(source_equipment_item_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(source_character_item_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(source_character_weapon_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

create unique index if not exists odyssey_character_abilities_weapon_source_idx
  on public.odyssey_character_abilities (character_id, ability_def_id, source_character_weapon_id)
  where source_character_weapon_id is not null;

create index if not exists odyssey_character_effects_weapon_source_idx
  on public.odyssey_character_effects (source_character_weapon_id, is_active, updated_at desc)
  where source_character_weapon_id is not null;

alter table public.odyssey_character_abilities
  drop constraint if exists odyssey_character_abilities_single_source_check;

alter table public.odyssey_character_abilities
  add constraint odyssey_character_abilities_single_source_check
  check (num_nonnulls(source_equipment_item_id, source_character_item_id, source_character_weapon_id) <= 1);

create or replace function public.odyssey_sync_weapon_model_ability_links_from_legacy(
  p_weapon_model_id uuid default null
)
returns void
language plpgsql
as $$
begin
  insert into public.odyssey_weapon_model_ability_links (
    weapon_model_id,
    ability_def_id,
    profile_id,
    is_enabled_by_default,
    sort_order,
    data
  )
  select
    legacy.weapon_model_id,
    legacy.ability_def_id,
    legacy.profile_id,
    coalesce(legacy.is_enabled, true),
    coalesce(legacy.sort_order, 0),
    coalesce(legacy.data, '{}'::jsonb)
  from public.odyssey_weapon_model_abilities legacy
  where p_weapon_model_id is null
     or legacy.weapon_model_id = p_weapon_model_id
  on conflict (
    weapon_model_id,
    ability_def_id,
    coalesce(profile_id, '00000000-0000-0000-0000-000000000000'::uuid)
  ) do update
  set
    is_enabled_by_default = excluded.is_enabled_by_default,
    sort_order = excluded.sort_order,
    data = excluded.data,
    updated_at = timezone('utc', now());

  delete from public.odyssey_weapon_model_ability_links link
  where (p_weapon_model_id is null or link.weapon_model_id = p_weapon_model_id)
    and not exists (
      select 1
      from public.odyssey_weapon_model_abilities legacy
      where legacy.weapon_model_id = link.weapon_model_id
        and legacy.ability_def_id = link.ability_def_id
        and legacy.profile_id is not distinct from link.profile_id
    );
end;
$$;

create or replace function public.odyssey_build_weapon_ability_effect_key(
  p_character_weapon_id uuid,
  p_ability_code text,
  p_effect_code text default null
)
returns text
language plpgsql
immutable
as $$
declare
  v_weapon_id text := coalesce(p_character_weapon_id::text, '');
  v_ability_code text := lower(trim(coalesce(p_ability_code, '')));
  v_effect_code text := lower(trim(coalesce(p_effect_code, '')));
begin
  if v_weapon_id = '' then
    return coalesce(nullif(v_effect_code, ''), nullif(v_ability_code, ''), 'weapon_ability');
  end if;

  if v_effect_code <> '' then
    return format('weapon_ability:%s:%s:%s', v_weapon_id, coalesce(nullif(v_ability_code, ''), 'ability'), v_effect_code);
  end if;

  return format('weapon_ability:%s:%s', v_weapon_id, coalesce(nullif(v_ability_code, ''), 'ability'));
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
  v_link record;
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

  perform public.odyssey_sync_weapon_model_ability_links_from_legacy(v_weapon.weapon_model_id);

  for v_link in
    with ranked_links as (
      select
        link.*,
        profile.code as profile_code,
        row_number() over (
          partition by link.ability_def_id
          order by
            case when link.profile_id is null then 1 else 0 end,
            link.sort_order,
            link.created_at,
            link.id
        ) as link_rank
      from public.odyssey_weapon_model_ability_links link
      left join public.odyssey_weapon_model_profiles profile on profile.id = link.profile_id
      where link.weapon_model_id = v_weapon.weapon_model_id
    )
    select *
    from ranked_links
    where link_rank = 1
    order by sort_order, created_at, id
  loop
    v_payload_data := jsonb_strip_nulls(
      coalesce(v_link.data, '{}'::jsonb)
      || jsonb_build_object(
        'generated', true,
        'generated_from', 'weapon_model',
        'weapon_link_id', v_link.id::text,
        'weapon_model_id', v_weapon.weapon_model_id::text,
        'weapon_model_code', v_weapon.weapon_model_code,
        'weapon_model_name', v_weapon.weapon_model_name,
        'required_profile_id', case when v_link.profile_id is not null then v_link.profile_id::text else null end,
        'required_profile_code', v_link.profile_code,
        'source_removed', false
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
      v_link.ability_def_id,
      null,
      greatest(coalesce(nullif(trim(coalesce(v_payload_data->>'learned_level', '')), '')::integer, 1), 1),
      v_weapon.id,
      coalesce(v_link.is_enabled_by_default, true),
      false,
      greatest(coalesce(nullif(trim(coalesce(v_payload_data->>'cooldown_rounds', '')), '')::integer, 0), 0),
      nullif(trim(coalesce(v_payload_data->>'default_current_charges', '')), '')::integer,
      nullif(trim(coalesce(v_payload_data->>'default_max_charges', '')), '')::integer,
      v_payload_data,
      '',
      coalesce(v_link.sort_order, 0)
    )
    on conflict (character_id, ability_def_id, source_character_weapon_id)
    where source_character_weapon_id is not null
    do update
    set
      learned_level = greatest(coalesce(public.odyssey_character_abilities.learned_level, 0), greatest(coalesce(nullif(trim(coalesce(excluded.data->>'learned_level', '')), '')::integer, 1), 1)),
      is_enabled = excluded.is_enabled,
      is_hidden = false,
      data = excluded.data,
      sort_order = excluded.sort_order,
      updated_at = timezone('utc', now())
    ;

    v_processed_ability_ids := array_append(v_processed_ability_ids, v_link.ability_def_id);
    v_upserted_count := v_upserted_count + 1;
  end loop;

  update public.odyssey_character_abilities ability
  set
    is_enabled = false,
    is_hidden = true,
    data = jsonb_set(coalesce(ability.data, '{}'::jsonb), '{source_removed}', 'true'::jsonb, true),
    updated_at = timezone('utc', now())
  where ability.character_id = v_weapon.character_id
    and ability.source_character_weapon_id = v_weapon.id
    and coalesce((ability.data->>'generated')::boolean, false) = true
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

create or replace function public.odyssey_sync_character_weapon_abilities_for_model(
  p_weapon_model_id uuid
)
returns void
language plpgsql
as $$
declare
  v_weapon record;
begin
  if p_weapon_model_id is null then
    return;
  end if;

  for v_weapon in
    select weapon.id
    from public.odyssey_character_weapons weapon
    where weapon.weapon_model_id = p_weapon_model_id
  loop
    perform public.initialize_character_weapon_abilities(v_weapon.id);
  end loop;
end;
$$;

create or replace function public.odyssey_handle_legacy_weapon_ability_links_sync()
returns trigger
language plpgsql
as $$
declare
  v_weapon_model_id uuid := coalesce(new.weapon_model_id, old.weapon_model_id);
begin
  perform public.odyssey_sync_weapon_model_ability_links_from_legacy(v_weapon_model_id);
  perform public.odyssey_sync_character_weapon_abilities_for_model(v_weapon_model_id);
  return null;
end;
$$;

drop trigger if exists odyssey_sync_weapon_ability_links_legacy_ins_upd on public.odyssey_weapon_model_abilities;
create trigger odyssey_sync_weapon_ability_links_legacy_ins_upd
after insert or update or delete on public.odyssey_weapon_model_abilities
for each row
execute function public.odyssey_handle_legacy_weapon_ability_links_sync();

create or replace function public.odyssey_initialize_character_weapon_abilities_trigger()
returns trigger
language plpgsql
as $$
begin
  perform public.initialize_character_weapon_abilities(new.id);
  return new;
end;
$$;

drop trigger if exists odyssey_initialize_character_weapon_abilities_after_write on public.odyssey_character_weapons;
create trigger odyssey_initialize_character_weapon_abilities_after_write
after insert or update of weapon_model_id, character_id on public.odyssey_character_weapons
for each row
execute function public.odyssey_initialize_character_weapon_abilities_trigger();

do $$
declare
  v_weapon record;
begin
  perform public.odyssey_sync_weapon_model_ability_links_from_legacy(null);

  for v_weapon in
    select weapon.id
    from public.odyssey_character_weapons weapon
  loop
    perform public.initialize_character_weapon_abilities(v_weapon.id);
  end loop;
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

  perform public.initialize_character_weapon_abilities(weapon.id)
  from public.odyssey_character_weapons weapon
  where weapon.character_id = p_character_id;

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
            else 'null'::jsonb
          end,
        'data', data,
        'notes', notes,
        'tags', tags,
        'level_data',
          case
            when level_data.id is null then null
            else jsonb_build_object(
              'id', level_data.id,
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
          end
      )
      order by sort_order, def_sort_order, code
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

create or replace function public.get_character_armory(
  p_character_id uuid
)
returns jsonb
language plpgsql
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

create or replace function public.add_character_effect(
  p_payload jsonb
)
returns jsonb
language plpgsql
as $$
declare
  v_character_id uuid := nullif(trim(coalesce(p_payload->>'character_id', '')), '')::uuid;
  v_effect_code text := lower(trim(coalesce(p_payload->>'effect_code', '')));
  v_effect_key text := trim(coalesce(p_payload->>'effect_key', ''));
  v_name text := trim(coalesce(p_payload->>'name', ''));
  v_description text := coalesce(p_payload->>'description', '');
  v_duration_type text := lower(trim(coalesce(p_payload->>'duration_type', '')));
  v_rounds_left integer := nullif(trim(coalesce(p_payload->>'rounds_left', '')), '')::integer;
  v_source text := coalesce(p_payload->>'source', '');
  v_source_type text := coalesce(p_payload->>'source_type', '');
  v_source_id uuid := nullif(trim(coalesce(p_payload->>'source_id', '')), '')::uuid;
  v_source_character_id uuid := nullif(trim(coalesce(p_payload->>'source_character_id', '')), '')::uuid;
  v_source_character_weapon_id uuid := nullif(trim(coalesce(p_payload->>'source_character_weapon_id', '')), '')::uuid;
  v_created_by text := trim(coalesce(p_payload->>'created_by', ''));
  v_payload_data jsonb := case when jsonb_typeof(p_payload->'data') = 'object' then p_payload->'data' else '{}'::jsonb end;
  v_payload_category text := lower(trim(coalesce(p_payload->>'category', '')));
  v_stacks integer := greatest(coalesce(nullif(trim(coalesce(p_payload->>'stacks', '')), '')::integer, 1), 1);
  v_effect_def public.odyssey_effect_defs%rowtype;
  v_stacking_mode text := 'stack';
  v_merged_data jsonb := '{}'::jsonb;
  v_existing_effect_id uuid := null;
  v_inserted_id uuid := null;
  v_refresh jsonb := '{}'::jsonb;
  v_effective_stats jsonb := '{}'::jsonb;
  v_effect_json jsonb := '{}'::jsonb;
begin
  if v_character_id is null then
    return jsonb_build_object(
      'ok', false,
      'error', 'CHARACTER_NOT_FOUND',
      'message', 'character_id is required.'
    );
  end if;

  if not exists (
    select 1
    from public.odyssey_characters c
    where c.id = v_character_id
      and coalesce(c.is_deleted, false) = false
  ) then
    return jsonb_build_object(
      'ok', false,
      'error', 'CHARACTER_NOT_FOUND',
      'character_id', v_character_id
    );
  end if;

  if v_source_character_weapon_id is not null and not exists (
    select 1
    from public.odyssey_character_weapons weapon
    where weapon.id = v_source_character_weapon_id
      and weapon.character_id = v_source_character_id
  ) then
    return jsonb_build_object(
      'ok', false,
      'error', 'WEAPON_ABILITY_SOURCE_NOT_AVAILABLE',
      'message', 'Weapon source was not found for this effect.',
      'source_character_weapon_id', v_source_character_weapon_id
    );
  end if;

  if v_effect_code <> '' then
    select *
    into v_effect_def
    from public.odyssey_effect_defs d
    where d.code = v_effect_code;

    if not found then
      return jsonb_build_object(
        'ok', false,
        'error', 'EFFECT_DEF_NOT_FOUND',
        'effect_code', v_effect_code
      );
    end if;
  end if;

  if v_payload_category <> '' and v_payload_category not in ('buff', 'debuff', 'condition', 'combat', 'psionic', 'equipment', 'weapon', 'armor', 'narrative', 'custom') then
    v_payload_category := 'custom';
  end if;

  if v_effect_def.id is not null then
    v_effect_key := coalesce(nullif(v_effect_key, ''), v_effect_def.code);
    v_name := coalesce(nullif(v_name, ''), v_effect_def.name);
    v_description := coalesce(nullif(v_description, ''), v_effect_def.description);
    v_duration_type := coalesce(nullif(v_duration_type, ''), v_effect_def.default_duration_type);
    if v_rounds_left is null then
      v_rounds_left := v_effect_def.default_rounds;
    end if;
    v_stacking_mode := v_effect_def.stacking_mode;
    v_merged_data := public.odyssey_merge_effect_data(v_effect_def.data, v_payload_data);
  else
    v_stacking_mode := 'stack';
    if v_payload_category = '' then
      v_payload_category := 'custom';
    end if;
    v_merged_data := public.odyssey_merge_effect_data('{}'::jsonb, v_payload_data);
  end if;

  if v_payload_category <> '' then
    v_merged_data := jsonb_set(v_merged_data, '{category}', to_jsonb(v_payload_category), true);
  end if;

  v_duration_type := case v_duration_type
    when 'rounds' then 'rounds'
    when 'until_turn_start' then 'until_turn_start'
    when 'until_turn_end' then 'until_turn_end'
    when 'scene' then 'scene'
    when 'until_used' then 'until_used'
    else 'manual'
  end;

  if v_effect_key = '' then
    v_effect_key := regexp_replace(
      regexp_replace(lower(coalesce(nullif(v_name, ''), 'custom_effect')), '[^a-z0-9]+', '_', 'g'),
      '(^_+|_+$)',
      '',
      'g'
    );
  end if;

  if v_effect_key = '' then
    v_effect_key := 'custom_effect';
  end if;

  if v_name = '' then
    v_name := initcap(replace(v_effect_key, '_', ' '));
  end if;

  if v_stacking_mode in ('replace', 'highest', 'lowest') then
    update public.odyssey_character_effects
    set
      is_active = false,
      updated_at = timezone('utc', now())
    where character_id = v_character_id
      and is_active = true
      and effect_key = v_effect_key;
  elsif v_stacking_mode = 'unique' then
    select e.id
    into v_existing_effect_id
    from public.odyssey_character_effects e
    where e.character_id = v_character_id
      and e.is_active = true
      and e.effect_key = v_effect_key
    order by e.created_at desc, e.id desc
    limit 1;

    if v_existing_effect_id is not null then
      v_effective_stats := public.get_effective_character_stats(v_character_id);
      select jsonb_build_object(
        'id', e.id,
        'effect_def_id', e.effect_def_id,
        'code', coalesce(d.code, e.effect_key),
        'effect_key', e.effect_key,
        'name', e.name,
        'category', coalesce(d.category, nullif(e.data->>'category', ''), 'custom'),
        'description', e.description,
        'source', e.source,
        'source_type', e.source_type,
        'source_id', e.source_id,
        'source_character_id', e.source_character_id,
        'source_character_weapon_id', e.source_character_weapon_id,
        'duration_type', e.duration_type,
        'rounds_left', e.rounds_left,
        'stacks', e.stacks,
        'data', e.data,
        'created_by', e.created_by,
        'created_at', e.created_at,
        'updated_at', e.updated_at
      )
      into v_effect_json
      from public.odyssey_character_effects e
      left join public.odyssey_effect_defs d on d.id = e.effect_def_id
      where e.id = v_existing_effect_id;

      return jsonb_build_object(
        'ok', true,
        'created', false,
        'character_id', v_character_id,
        'effect', v_effect_json,
        'effective_stats', v_effective_stats,
        'combat_state',
          coalesce(
            (
              select jsonb_build_object(
                'character_id', s.character_id,
                'campaign_id', s.campaign_id,
                'room_id', s.room_id,
                'body_summary', s.body_summary,
                'armor_summary', s.armor_summary,
                'active_effects', s.active_effects,
                'active_penalties', s.active_penalties,
                'effective_stats', s.effective_stats,
                'combat_flags', s.combat_flags,
                'overlay_text', s.overlay_text,
                'overlay_data', s.overlay_data,
                'tracker_minor', s.tracker_minor,
                'tracker_serious', s.tracker_serious,
                'is_alive', s.is_alive,
                'is_conscious', s.is_conscious,
                'state_version', s.state_version,
                'updated_at', s.updated_at
              )
              from public.odyssey_character_combat_state s
              where s.character_id = v_character_id
            ),
            '{}'::jsonb
          )
      );
    end if;
  end if;

  insert into public.odyssey_character_effects (
    character_id,
    effect_def_id,
    effect_key,
    name,
    description,
    source,
    source_type,
    source_id,
    source_character_id,
    source_character_weapon_id,
    duration_type,
    rounds_left,
    stacks,
    data,
    is_active,
    created_by
  )
  values (
    v_character_id,
    v_effect_def.id,
    v_effect_key,
    v_name,
    v_description,
    v_source,
    v_source_type,
    v_source_id,
    v_source_character_id,
    v_source_character_weapon_id,
    v_duration_type,
    v_rounds_left,
    v_stacks,
    v_merged_data,
    true,
    v_created_by
  )
  returning id into v_inserted_id;

  v_refresh := public.odyssey_refresh_character_combat_state(v_character_id);
  v_effective_stats := public.get_effective_character_stats(v_character_id);

  select jsonb_build_object(
    'id', e.id,
    'effect_def_id', e.effect_def_id,
    'code', coalesce(d.code, e.effect_key),
    'effect_key', e.effect_key,
    'name', e.name,
    'category', coalesce(d.category, nullif(e.data->>'category', ''), 'custom'),
    'description', e.description,
    'source', e.source,
    'source_type', e.source_type,
    'source_id', e.source_id,
    'source_character_id', e.source_character_id,
    'source_character_weapon_id', e.source_character_weapon_id,
    'duration_type', e.duration_type,
    'rounds_left', e.rounds_left,
    'stacks', e.stacks,
    'data', e.data,
    'created_by', e.created_by,
    'created_at', e.created_at,
    'updated_at', e.updated_at
  )
  into v_effect_json
  from public.odyssey_character_effects e
  left join public.odyssey_effect_defs d on d.id = e.effect_def_id
  where e.id = v_inserted_id;

  return jsonb_build_object(
    'ok', true,
    'created', true,
    'character_id', v_character_id,
    'effect', v_effect_json,
    'effective_stats', v_effective_stats,
    'combat_state', coalesce(v_refresh->'combat_state', '{}'::jsonb)
  );
end;
$$;

create or replace function public.odyssey_use_ability_with_weapon_support(
  p_payload jsonb
)
returns jsonb
language plpgsql
as $$
declare
  v_character_ability_id uuid := nullif(trim(coalesce(p_payload->>'character_ability_id', '')), '')::uuid;
  v_character_id uuid := nullif(trim(coalesce(p_payload->>'character_id', '')), '')::uuid;
  v_ability_code text := lower(trim(coalesce(p_payload->>'ability_code', '')));
  v_target_character_id uuid := nullif(trim(coalesce(p_payload->>'target_character_id', '')), '')::uuid;
  v_target_body_part_id uuid := nullif(trim(coalesce(p_payload->>'target_body_part_id', '')), '')::uuid;
  v_target_armor_item_id uuid := nullif(trim(coalesce(p_payload->>'target_armor_item_id', '')), '')::uuid;
  v_scene_id text := coalesce(nullif(trim(coalesce(p_payload->>'scene_id', '')), ''), '');
  v_created_by text := coalesce(nullif(trim(coalesce(p_payload->>'created_by', '')), ''), '');
  v_encounter_id uuid := nullif(trim(coalesce(p_payload->>'encounter_id', '')), '')::uuid;
  v_ability record;
  v_level record;
  v_effective_level integer := 0;
  v_target_part record;
  v_resource_result jsonb := '{}'::jsonb;
  v_effect_result jsonb := '{}'::jsonb;
  v_effect_results jsonb := '[]'::jsonb;
  v_merged_ability_data jsonb := '{}'::jsonb;
  v_effect_payload_data jsonb := '{}'::jsonb;
  v_effect_code text := '';
  v_effect_links jsonb := '[]'::jsonb;
  v_effect_link jsonb := '{}'::jsonb;
  v_link_data jsonb := '{}'::jsonb;
  v_link_effect_code text := '';
  v_link_effect_id uuid := null;
  v_effect_instance_data jsonb := '{}'::jsonb;
  v_effect_context jsonb := '{}'::jsonb;
  v_refresh jsonb := '{}'::jsonb;
  v_log_id uuid := null;
  v_log_data jsonb := '{}'::jsonb;
  v_message text := '';
  v_source_character_weapon_id uuid := null;
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
    def.resource_mode,
    def.resource_pool_code,
    def.resource_item_code,
    def.description as ability_description,
    def.effect_data as def_effect_data,
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

  v_character_id := v_ability.character_id;
  v_source_character_weapon_id := v_ability.source_character_weapon_id;
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

  v_merged_ability_data :=
    coalesce(v_ability.def_data, '{}'::jsonb)
    || coalesce(v_ability.data, '{}'::jsonb)
    || coalesce(v_level.data, '{}'::jsonb);

  v_effect_payload_data := public.odyssey_merge_effect_data(
    public.odyssey_merge_effect_data(
      coalesce(v_ability.def_effect_data, '{}'::jsonb),
      case
        when jsonb_typeof(v_ability.data->'effect_data') = 'object' then v_ability.data->'effect_data'
        else '{}'::jsonb
      end
    ),
    coalesce(v_level.effect_data, '{}'::jsonb)
  );

  v_effect_code := lower(trim(coalesce(
    nullif(v_merged_ability_data->>'effect_code', ''),
    nullif(v_effect_payload_data->>'effect_code', ''),
    ''
  )));

  if jsonb_typeof(v_merged_ability_data->'effect_links') = 'array' then
    v_effect_links := v_merged_ability_data->'effect_links';
  end if;

  if v_ability.ability_kind = 'attack' or v_ability.effect_mode = 'attack' then
    return jsonb_build_object(
      'ok', false,
      'error', 'ABILITY_REQUIRES_ATTACK_RESOLUTION',
      'message', 'Attack abilities must be resolved through perform_attack.',
      'character_ability_id', v_character_ability_id
    );
  end if;

  if v_ability.target_type = 'self' then
    v_target_character_id := v_character_id;
  elsif v_target_character_id is null then
    v_target_character_id := v_character_id;
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

  v_effect_context := jsonb_strip_nulls(
    jsonb_build_object(
      'selected_body_part_id', case when v_target_body_part_id is not null then v_target_body_part_id::text else null end,
      'selected_armor_item_id', case when v_target_armor_item_id is not null then v_target_armor_item_id::text else null end,
      'source_character_weapon_id', case when v_source_character_weapon_id is not null then v_source_character_weapon_id::text else null end
    )
  );

  if v_ability.effect_mode = 'apply_effect' then
    if jsonb_typeof(v_effect_links) = 'array' and jsonb_array_length(v_effect_links) > 0 then
      for v_effect_link in
        select value
        from jsonb_array_elements(v_effect_links)
        order by coalesce(nullif(value->>'sort_order', '')::integer, 0)
      loop
        v_link_effect_code := lower(trim(coalesce(v_effect_link->>'effect_code', '')));
        v_link_effect_id := nullif(trim(coalesce(v_effect_link->>'effect_def_id', '')), '')::uuid;
        if v_link_effect_code = '' and v_link_effect_id is not null then
          select effect_def.code
          into v_link_effect_code
          from public.odyssey_effect_defs effect_def
          where effect_def.id = v_link_effect_id;
        end if;

        if v_link_effect_code = '' then
          return jsonb_build_object(
            'ok', false,
            'error', 'ABILITY_EFFECT_NOT_CONFIGURED',
            'message', 'One of the linked effects is missing effect_def_id/effect_code.',
            'character_ability_id', v_character_ability_id
          );
        end if;

        v_link_data := case
          when jsonb_typeof(v_effect_link->'data') = 'object' then v_effect_link->'data'
          else '{}'::jsonb
        end;
        v_effect_instance_data := public.odyssey_merge_effect_data(v_effect_payload_data, v_link_data);
        if v_effect_context <> '{}'::jsonb then
          v_effect_instance_data := public.odyssey_merge_effect_data(
            v_effect_instance_data,
            jsonb_build_object('context', v_effect_context)
          );
        end if;

        v_effect_result := public.add_character_effect(
          jsonb_build_object(
            'character_id', v_target_character_id,
            'effect_code', v_link_effect_code,
            'effect_key',
              case
                when v_source_character_weapon_id is not null
                  then public.odyssey_build_weapon_ability_effect_key(v_source_character_weapon_id, v_ability.ability_code, v_link_effect_code)
                else v_ability.ability_code || ':' || v_link_effect_code
              end,
            'name', v_ability.ability_name,
            'description', v_ability.ability_description,
            'category',
              case
                when v_ability.source_type = 'psionic' then 'psionic'
                when v_ability.source_type in ('implant', 'prosthetic', 'equipment', 'item') then 'equipment'
                when v_source_character_weapon_id is not null then 'weapon'
                else 'custom'
              end,
            'duration_type', case when v_level.duration_rounds is not null and v_level.duration_rounds > 0 then 'rounds' else 'manual' end,
            'rounds_left', v_level.duration_rounds,
            'source', v_ability.ability_name,
            'source_type', case when v_source_character_weapon_id is not null then 'weapon_ability' else v_ability.source_type end,
            'source_id', v_character_ability_id::text,
            'source_character_id', v_character_id::text,
            'source_character_weapon_id', case when v_source_character_weapon_id is not null then v_source_character_weapon_id::text else null end,
            'data',
              public.odyssey_merge_effect_data(
                v_effect_instance_data,
                jsonb_strip_nulls(jsonb_build_object(
                  'scope', case when v_source_character_weapon_id is not null then 'weapon' else null end,
                  'source_character_weapon_id', case when v_source_character_weapon_id is not null then v_source_character_weapon_id::text else null end,
                  'source_character_ability_id', v_character_ability_id::text
                ))
              ),
            'created_by', v_created_by
          )
        );

        if coalesce((v_effect_result->>'ok')::boolean, false) = false then
          return v_effect_result;
        end if;

        v_refresh := coalesce(v_effect_result->'combat_state', v_refresh);
        v_effect_results := v_effect_results || jsonb_build_array(coalesce(v_effect_result->'effect', '{}'::jsonb));
      end loop;

      v_effect_result := jsonb_build_object(
        'ok', true,
        'effects', v_effect_results,
        'combat_state', v_refresh
      );
    elsif v_effect_code <> '' then
      v_effect_instance_data := v_effect_payload_data;
      if v_effect_context <> '{}'::jsonb then
        v_effect_instance_data := public.odyssey_merge_effect_data(
          v_effect_instance_data,
          jsonb_build_object('context', v_effect_context)
        );
      end if;

      v_effect_result := public.add_character_effect(
        jsonb_build_object(
          'character_id', v_target_character_id,
          'effect_code', v_effect_code,
          'effect_key',
            case
              when v_source_character_weapon_id is not null
                then public.odyssey_build_weapon_ability_effect_key(v_source_character_weapon_id, v_ability.ability_code, null)
              else v_ability.ability_code
            end,
          'name', v_ability.ability_name,
          'description', v_ability.ability_description,
          'category',
            case
              when v_ability.source_type = 'psionic' then 'psionic'
              when v_ability.source_type in ('implant', 'prosthetic', 'equipment', 'item') then 'equipment'
              when v_source_character_weapon_id is not null then 'weapon'
              else 'custom'
            end,
          'duration_type', case when v_level.duration_rounds is not null and v_level.duration_rounds > 0 then 'rounds' else 'manual' end,
          'rounds_left', v_level.duration_rounds,
          'source', v_ability.ability_name,
          'source_type', case when v_source_character_weapon_id is not null then 'weapon_ability' else v_ability.source_type end,
          'source_id', v_character_ability_id::text,
          'source_character_id', v_character_id::text,
          'source_character_weapon_id', case when v_source_character_weapon_id is not null then v_source_character_weapon_id::text else null end,
          'data',
            public.odyssey_merge_effect_data(
              v_effect_instance_data,
              jsonb_strip_nulls(jsonb_build_object(
                'scope', case when v_source_character_weapon_id is not null then 'weapon' else null end,
                'source_character_weapon_id', case when v_source_character_weapon_id is not null then v_source_character_weapon_id::text else null end,
                'source_character_ability_id', v_character_ability_id::text
              ))
            ),
          'created_by', v_created_by
        )
      );

      if coalesce((v_effect_result->>'ok')::boolean, false) = false then
        return v_effect_result;
      end if;

      v_refresh := coalesce(v_effect_result->'combat_state', '{}'::jsonb);
    else
      v_refresh := coalesce(public.odyssey_refresh_character_combat_state(v_target_character_id)->'combat_state', '{}'::jsonb);
      v_effect_result := jsonb_build_object(
        'ok', true,
        'narrative_only', true,
        'combat_state', v_refresh
      );
    end if;
  elsif v_ability.effect_mode = 'grant_special' then
    select
      b.id,
      b.character_id,
      b.part_key,
      b.max_critical,
      b.critical
    into v_target_part
    from public.odyssey_character_body_parts b
    left join public.odyssey_body_part_defs d on d.id = b.body_part_def_id
    where b.character_id = v_target_character_id
      and coalesce(d.code, public.odyssey_normalize_part_code(b.part_key)) = 'special'
    limit 1
    for update of b;

    if not found then
      return jsonb_build_object(
        'ok', false,
        'error', 'SPECIAL_BODY_PART_NOT_FOUND',
        'target_character_id', v_target_character_id
      );
    end if;

    update public.odyssey_character_body_parts
    set
      natural_armor_value = greatest(coalesce(v_level.special_armor_value, 0), 0),
      max_critical = greatest(coalesce(v_level.special_max_critical, max_critical), 0),
      critical = 0,
      serious = 0,
      minor = 0,
      disabled = false,
      destroyed = false
    where id = v_target_part.id;

    perform public.recompute_character_armor(v_target_character_id);
    v_refresh := coalesce(public.odyssey_refresh_character_combat_state(v_target_character_id)->'combat_state', '{}'::jsonb);
    v_effect_result := jsonb_build_object(
      'ok', true,
      'special', public.odyssey_get_character_body_part_state(v_target_part.id),
      'combat_state', v_refresh
    );
  else
    v_refresh := coalesce(public.odyssey_refresh_character_combat_state(v_target_character_id)->'combat_state', '{}'::jsonb);
    v_effect_result := jsonb_build_object(
      'ok', true,
      'narrative_only', true,
      'combat_state', v_refresh
    );
  end if;

  v_message := format(
    '%s uses %s.',
    coalesce(
      (
        select coalesce(nullif(trim(c.resources->>'name'), ''), c.character_key)
        from public.odyssey_characters c
        where c.id = v_character_id
      ),
      v_character_id::text
    ),
    v_ability.ability_name
  );

  v_log_data := jsonb_build_object(
    'type', 'ability_use',
    'ok', true,
    'character_ability_id', v_character_ability_id,
    'character_id', v_character_id,
    'target_character_id', v_target_character_id,
    'target_body_part_id', v_target_body_part_id,
    'target_armor_item_id', v_target_armor_item_id,
    'source_character_weapon_id', v_source_character_weapon_id,
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
    'result', v_effect_result
  );

  insert into public.odyssey_combat_log (
    campaign_id,
    room_id,
    scene_id,
    encounter_id,
    actor_character_id,
    target_character_id,
    event_type,
    message,
    data,
    created_by
  )
  values (
    coalesce((select c.campaign_id from public.odyssey_characters c where c.id = v_character_id), ''),
    coalesce((select c.room_id from public.odyssey_characters c where c.id = v_character_id), ''),
    v_scene_id,
    v_encounter_id,
    v_character_id,
    v_target_character_id,
    'ability_use',
    v_message,
    v_log_data,
    v_created_by
  )
  returning id into v_log_id;

  perform public.odyssey_trim_combat_log(v_encounter_id, coalesce((select c.room_id from public.odyssey_characters c where c.id = v_character_id), ''));

  return jsonb_build_object(
    'ok', true,
    'character_ability_id', v_character_ability_id,
    'character_id', v_character_id,
    'target_character_id', v_target_character_id,
    'target_body_part_id', v_target_body_part_id,
    'target_armor_item_id', v_target_armor_item_id,
    'source_character_weapon_id', v_source_character_weapon_id,
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
    'result', v_effect_result,
    'combat_state', v_refresh,
    'log_id', v_log_id
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
  v_character_id uuid := public.odyssey_try_parse_uuid(coalesce(v_payload->>'character_id', v_payload->>'attacker_character_id'));
  v_character_ability_id uuid := public.odyssey_try_parse_uuid(v_payload->>'character_ability_id');
  v_ability_code text := lower(trim(coalesce(v_payload->>'ability_code', '')));
  v_lock_state jsonb := '{}'::jsonb;
  v_ability record;
  v_required_profile_id uuid := null;
begin
  if v_character_ability_id is not null or (v_character_id is not null and v_ability_code <> '') then
    select
      ability.id,
      ability.character_id,
      ability.source_character_weapon_id,
      ability.is_enabled,
      ability.is_hidden,
      ability.data,
      def.code as ability_code
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

    if found and v_ability.source_character_weapon_id is not null then
      v_character_weapon_id := v_ability.source_character_weapon_id;
      v_character_id := v_ability.character_id;
      v_required_profile_id := public.odyssey_try_parse_uuid(v_ability.data->>'required_profile_id');

      if coalesce(v_ability.is_enabled, false) = false
         or coalesce(v_ability.is_hidden, false) = true
         or coalesce((v_ability.data->>'source_removed')::boolean, false) then
        return jsonb_build_object(
          'ok', false,
          'error', 'WEAPON_ABILITY_SOURCE_NOT_AVAILABLE',
          'message', 'This weapon ability is no longer available on the source weapon.',
          'character_ability_id', v_ability.id,
          'character_weapon_id', v_character_weapon_id
        );
      end if;

      if not exists (
        select 1
        from public.odyssey_character_weapons weapon
        where weapon.id = v_character_weapon_id
          and weapon.character_id = v_character_id
      ) then
        return jsonb_build_object(
          'ok', false,
          'error', 'WEAPON_ABILITY_SOURCE_NOT_AVAILABLE',
          'message', 'The source weapon for this ability is not available.',
          'character_ability_id', v_ability.id,
          'character_weapon_id', v_character_weapon_id
        );
      end if;

      if v_required_profile_id is not null and not exists (
        select 1
        from public.odyssey_character_weapons weapon
        where weapon.id = v_character_weapon_id
          and weapon.active_profile_id = v_required_profile_id
      ) then
        return jsonb_build_object(
          'ok', false,
          'error', 'ABILITY_NOT_AVAILABLE_FOR_WEAPON_PROFILE',
          'message', 'This weapon ability is not available for the currently active weapon profile.',
          'character_ability_id', v_ability.id,
          'character_weapon_id', v_character_weapon_id,
          'required_profile_id', v_required_profile_id
        );
      end if;

      v_payload := v_payload || jsonb_build_object(
        'character_weapon_id', v_character_weapon_id::text,
        'character_id', v_character_id::text
      );
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

grant execute on function public.odyssey_sync_weapon_model_ability_links_from_legacy(uuid) to anon, authenticated;
grant execute on function public.odyssey_build_weapon_ability_effect_key(uuid, text, text) to anon, authenticated;
grant execute on function public.initialize_character_weapon_abilities(uuid) to anon, authenticated;
grant execute on function public.odyssey_sync_character_weapon_abilities_for_model(uuid) to anon, authenticated;
grant execute on function public.odyssey_use_ability_with_weapon_support(jsonb) to anon, authenticated;
