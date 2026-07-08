-- ===== BEGIN 102_character_ability_reconcile.sql =====

do $$
declare
  v_constraint_name text;
begin
  select conname
  into v_constraint_name
  from pg_constraint
  where conrelid = 'public.odyssey_ability_defs'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%source_type%';

  if v_constraint_name is not null then
    execute format(
      'alter table public.odyssey_ability_defs drop constraint %I',
      v_constraint_name
    );
  end if;
end;
$$;

alter table public.odyssey_ability_defs
  add constraint odyssey_ability_defs_source_type_check_v2
  check (
    source_type in (
      'psionic',
      'implant',
      'prosthetic',
      'equipment',
      'item',
      'weapon',
      'skill',
      'perk',
      'innate',
      'custom'
    )
  );

create table if not exists public.odyssey_ability_grants (
  id uuid primary key default gen_random_uuid(),
  source_type text not null check (
    source_type in ('skill', 'perk', 'item', 'equipment', 'weapon')
  ),
  source_def_id uuid not null,
  ability_def_id uuid not null references public.odyssey_ability_defs(id) on delete cascade,
  min_level integer not null default 1,
  is_enabled boolean not null default true,
  data jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object'),
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists odyssey_ability_grants_unique
  on public.odyssey_ability_grants (source_type, source_def_id, ability_def_id);

create index if not exists odyssey_ability_grants_source_idx
  on public.odyssey_ability_grants (source_type, source_def_id, is_enabled, sort_order);

create index if not exists odyssey_ability_grants_ability_idx
  on public.odyssey_ability_grants (ability_def_id, sort_order);

alter table public.odyssey_ability_grants enable row level security;

drop policy if exists "odyssey_ability_grants_full_access" on public.odyssey_ability_grants;
create policy "odyssey_ability_grants_full_access"
on public.odyssey_ability_grants
for all
to anon, authenticated
using (true)
with check (true);

grant select, insert, update, delete on public.odyssey_ability_grants to anon, authenticated;

drop trigger if exists odyssey_touch_updated_at_ability_grants on public.odyssey_ability_grants;
create trigger odyssey_touch_updated_at_ability_grants
before update on public.odyssey_ability_grants
for each row
execute function public.odyssey_touch_updated_at();

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
    with legacy_skill_grants as (
      select
        ad.id as ability_def_id,
        ad.code as ability_code,
        ad.linked_skill_id as skill_def_id,
        cs.id as character_skill_id,
        greatest(coalesce(cs.level, 0), 0) as skill_level,
        coalesce(ad.sort_order, 0) as sort_order,
        '{}'::jsonb as grant_data,
        0 as source_priority
      from public.odyssey_ability_defs ad
      join public.odyssey_character_skills cs
        on cs.character_id = p_character_id
       and cs.skill_def_id = ad.linked_skill_id
      where ad.source_type = 'skill'
        and ad.linked_skill_id is not null
    ),
    mapped_skill_grants as (
      select
        ad.id as ability_def_id,
        ad.code as ability_code,
        grant_link.source_def_id as skill_def_id,
        cs.id as character_skill_id,
        greatest(coalesce(cs.level, 0), 0) as skill_level,
        coalesce(grant_link.sort_order, ad.sort_order, 0) as sort_order,
        coalesce(grant_link.data, '{}'::jsonb) as grant_data,
        1 as source_priority
      from public.odyssey_ability_grants grant_link
      join public.odyssey_ability_defs ad on ad.id = grant_link.ability_def_id
      join public.odyssey_character_skills cs
        on cs.character_id = p_character_id
       and cs.skill_def_id = grant_link.source_def_id
      where grant_link.source_type = 'skill'
        and grant_link.is_enabled = true
        and greatest(coalesce(cs.level, 0), 0) >= greatest(coalesce(grant_link.min_level, 1), 1)
    )
    select distinct on (combined.ability_def_id, combined.character_skill_id)
      combined.*
    from (
      select * from legacy_skill_grants
      union all
      select * from mapped_skill_grants
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

    v_payload_data :=
      coalesce(v_existing.data, '{}'::jsonb)
      || coalesce(v_source.grant_data, '{}'::jsonb)
      || jsonb_build_object(
        'generated', true,
        'generated_from', 'skill',
        'skill_def_id', v_source.skill_def_id::text,
        'character_skill_id', v_source.character_skill_id::text,
        'source_removed', false
      );

    if found then
      update public.odyssey_character_abilities
      set
        character_skill_id = v_source.character_skill_id,
        learned_level = v_source.skill_level,
        is_enabled = true,
        is_hidden = false,
        data = v_payload_data,
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
        v_payload_data,
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
    and exists (
      select 1
      from public.odyssey_ability_defs ad
      where ad.id = ability.ability_def_id
        and (
          (ad.source_type = 'skill' and ad.linked_skill_id is not null)
          or exists (
            select 1
            from public.odyssey_ability_grants grant_link
            where grant_link.ability_def_id = ad.id
              and grant_link.source_type = 'skill'
          )
        )
    )
    and not exists (
      select 1
      from public.odyssey_ability_defs ad
      left join public.odyssey_character_skills skill_row
        on skill_row.character_id = p_character_id
       and skill_row.skill_def_id = ad.linked_skill_id
      where ad.id = ability.ability_def_id
        and ad.source_type = 'skill'
        and ad.linked_skill_id is not null
        and skill_row.id is not null
      union all
      select 1
      from public.odyssey_ability_grants grant_link
      join public.odyssey_character_skills skill_row
        on skill_row.character_id = p_character_id
       and skill_row.skill_def_id = grant_link.source_def_id
      where grant_link.ability_def_id = ability.ability_def_id
        and grant_link.source_type = 'skill'
        and grant_link.is_enabled = true
        and greatest(coalesce(skill_row.level, 0), 0) >= greatest(coalesce(grant_link.min_level, 1), 1)
    );

  get diagnostics v_skill_hidden = row_count;

  for v_source in
    select
      ad.id as ability_def_id,
      ad.code as ability_code,
      cp.id as character_perk_id,
      cp.perk_def_id,
      coalesce(grant_link.sort_order, ad.sort_order, 0) as sort_order,
      coalesce(grant_link.data, '{}'::jsonb) as grant_data
    from public.odyssey_character_perks cp
    join public.odyssey_ability_grants grant_link
      on grant_link.source_type = 'perk'
     and grant_link.source_def_id = cp.perk_def_id
     and grant_link.is_enabled = true
    join public.odyssey_ability_defs ad on ad.id = grant_link.ability_def_id
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

    v_payload_data :=
      coalesce(v_existing.data, '{}'::jsonb)
      || coalesce(v_source.grant_data, '{}'::jsonb)
      || jsonb_build_object(
        'generated', true,
        'generated_from', 'perk',
        'perk_def_id', v_source.perk_def_id::text,
        'character_perk_id', v_source.character_perk_id::text,
        'source_removed', false
      );

    if found then
      update public.odyssey_character_abilities
      set
        character_skill_id = null,
        learned_level = greatest(coalesce(v_existing.learned_level, 1), 1),
        is_enabled = true,
        is_hidden = false,
        data = v_payload_data,
        sort_order = v_source.sort_order,
        updated_at = timezone('utc', now())
      where id = v_existing.id;
    else
      begin
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
          v_payload_data,
          '',
          v_source.sort_order
        );
      exception
        when unique_violation then
          null;
      end;
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
      join public.odyssey_ability_grants grant_link
        on grant_link.source_type = 'perk'
       and grant_link.source_def_id = cp.perk_def_id
       and grant_link.ability_def_id = ability.ability_def_id
       and grant_link.is_enabled = true
      where cp.character_id = p_character_id
    );

  get diagnostics v_perk_hidden = row_count;

  for v_source in
    select
      ad.id as ability_def_id,
      ad.code as ability_code,
      item.id as source_character_item_id,
      item.item_def_id,
      coalesce(link.sort_order, ad.sort_order, item.sort_order, 0) as sort_order,
      coalesce(link.grant_mode, 'activated') as grant_mode,
      coalesce(link.data, '{}'::jsonb) as grant_data
    from public.odyssey_character_items item
    join public.odyssey_item_def_abilities link
      on link.item_def_id = item.item_def_id
     and link.is_enabled = true
    join public.odyssey_ability_defs ad on ad.id = link.ability_def_id
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

    v_payload_data :=
      coalesce(v_existing.data, '{}'::jsonb)
      || coalesce(v_source.grant_data, '{}'::jsonb)
      || jsonb_build_object(
        'generated', true,
        'generated_from', 'item',
        'item_def_id', v_source.item_def_id::text,
        'source_character_item_id', v_source.source_character_item_id::text,
        'grant_mode', v_source.grant_mode,
        'source_removed', false
      );

    if found then
      update public.odyssey_character_abilities
      set
        character_skill_id = null,
        learned_level = greatest(coalesce(v_existing.learned_level, 1), 1),
        is_enabled = true,
        is_hidden = false,
        data = v_payload_data,
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
        v_source.source_character_item_id,
        null,
        true,
        false,
        v_payload_data,
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
    and not exists (
      select 1
      from public.odyssey_character_items item
      join public.odyssey_item_def_abilities link
        on link.item_def_id = item.item_def_id
       and link.ability_def_id = ability.ability_def_id
       and link.is_enabled = true
      where item.id = ability.source_character_item_id
        and item.character_id = p_character_id
        and coalesce(item.quantity, 0) > 0
    );

  get diagnostics v_item_hidden = row_count;

  for v_source in
    select
      ad.id as ability_def_id,
      ad.code as ability_code,
      item.id as source_equipment_item_id,
      item.equipment_model_id,
      coalesce(link.sort_order, ad.sort_order, item.sort_order, 0) as sort_order,
      coalesce(link.grant_mode, 'available') as grant_mode,
      coalesce(link.data, '{}'::jsonb) as grant_data
    from public.odyssey_character_equipment_items item
    join public.odyssey_equipment_model_abilities link
      on link.equipment_model_id = item.equipment_model_id
     and link.is_enabled = true
    join public.odyssey_ability_defs ad on ad.id = link.ability_def_id
    where item.character_id = p_character_id
      and item.is_equipped = true
  loop
    select *
    into v_existing
    from public.odyssey_character_abilities ability
    where ability.character_id = p_character_id
      and ability.ability_def_id = v_source.ability_def_id
      and ability.source_equipment_item_id = v_source.source_equipment_item_id
    for update of ability;

    v_payload_data :=
      coalesce(v_existing.data, '{}'::jsonb)
      || coalesce(v_source.grant_data, '{}'::jsonb)
      || jsonb_build_object(
        'generated', true,
        'generated_from', 'equipment',
        'equipment_model_id', v_source.equipment_model_id::text,
        'source_equipment_item_id', v_source.source_equipment_item_id::text,
        'grant_mode', v_source.grant_mode,
        'source_removed', false
      );

    if found then
      update public.odyssey_character_abilities
      set
        character_skill_id = null,
        learned_level = greatest(coalesce(v_existing.learned_level, 1), 1),
        is_enabled = true,
        is_hidden = false,
        data = v_payload_data,
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
        v_source.source_equipment_item_id,
        null,
        null,
        true,
        false,
        v_payload_data,
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
        'generated_from', 'equipment',
        'source_removed', true,
        'source_removed_reason', 'missing_equipment'
      ),
    updated_at = timezone('utc', now())
  where ability.character_id = p_character_id
    and ability.source_equipment_item_id is not null
    and not exists (
      select 1
      from public.odyssey_character_equipment_items item
      join public.odyssey_equipment_model_abilities link
        on link.equipment_model_id = item.equipment_model_id
       and link.ability_def_id = ability.ability_def_id
       and link.is_enabled = true
      where item.id = ability.source_equipment_item_id
        and item.character_id = p_character_id
        and item.is_equipped = true
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

create or replace function public.odyssey_reconcile_character_abilities_trigger()
returns trigger
language plpgsql
as $$
declare
  v_character_id uuid := coalesce(new.character_id, old.character_id);
begin
  if v_character_id is not null then
    perform public.odyssey_reconcile_character_abilities(v_character_id);
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

drop trigger if exists odyssey_reconcile_character_abilities_on_skills on public.odyssey_character_skills;
create trigger odyssey_reconcile_character_abilities_on_skills
after insert or update or delete on public.odyssey_character_skills
for each row
execute function public.odyssey_reconcile_character_abilities_trigger();

drop trigger if exists odyssey_reconcile_character_abilities_on_perks on public.odyssey_character_perks;
create trigger odyssey_reconcile_character_abilities_on_perks
after insert or update or delete on public.odyssey_character_perks
for each row
execute function public.odyssey_reconcile_character_abilities_trigger();

drop trigger if exists odyssey_reconcile_character_abilities_on_items on public.odyssey_character_items;
create trigger odyssey_reconcile_character_abilities_on_items
after insert or update or delete on public.odyssey_character_items
for each row
execute function public.odyssey_reconcile_character_abilities_trigger();

drop trigger if exists odyssey_reconcile_character_abilities_on_equipment on public.odyssey_character_equipment_items;
create trigger odyssey_reconcile_character_abilities_on_equipment
after insert or update or delete on public.odyssey_character_equipment_items
for each row
execute function public.odyssey_reconcile_character_abilities_trigger();

drop trigger if exists odyssey_reconcile_character_abilities_on_weapons on public.odyssey_character_weapons;
create trigger odyssey_reconcile_character_abilities_on_weapons
after insert or update or delete on public.odyssey_character_weapons
for each row
execute function public.odyssey_reconcile_character_abilities_trigger();

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

  perform public.odyssey_reconcile_character_abilities(p_character_id);

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
as $
declare
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_sections_raw jsonb := v_payload->'sections';
  v_filtered_sections jsonb := '[]'::jsonb;
  v_item text;
  v_bundle jsonb := '{}'::jsonb;
  v_sections jsonb := '{}'::jsonb;
  v_rule_sheet jsonb := '{}'::jsonb;
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
  if v_character_id is not null then
    perform public.odyssey_reconcile_character_abilities(v_character_id);
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
$;

create or replace function public.odyssey_get_character_quick_actions_runtime(
  p_character_id uuid
)
returns jsonb
language plpgsql
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

  perform public.odyssey_reconcile_character_abilities(p_character_id);

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
    ),
    '[]'::jsonb
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
    and ad.activation_type in ('manual', 'custom');

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

-- ===== END 102_character_ability_reconcile.sql =====
