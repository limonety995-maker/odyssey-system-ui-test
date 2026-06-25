create or replace function public.initialize_character_rule_defaults(p_character_id uuid)
returns jsonb
language plpgsql
as $$
declare
  v_character_exists boolean := false;
  v_inserted_attributes integer := 0;
  v_inserted_body_parts integer := 0;
begin
  select exists(
    select 1
    from public.odyssey_characters c
    where c.id = p_character_id
      and coalesce(c.is_deleted, false) = false
  )
  into v_character_exists;

  if not v_character_exists then
    raise exception 'Character % was not found', p_character_id;
  end if;

  with inserted as (
    insert into public.odyssey_character_attributes (
      character_id,
      attribute_def_id,
      value
    )
    select
      p_character_id,
      d.id,
      d.default_value
    from public.odyssey_attribute_defs d
    where d.is_custom = false
      and not exists (
        select 1
        from public.odyssey_character_attributes a
        where a.character_id = p_character_id
          and a.attribute_def_id = d.id
      )
    returning 1
  )
  select count(*) into v_inserted_attributes from inserted;

  with inserted as (
    insert into public.odyssey_character_body_parts (
      character_id,
      body_part_def_id,
      part_key,
      max_critical,
      critical,
      serious,
      minor,
      armor_value,
      disabled,
      destroyed,
      sort_order,
      notes
    )
    select
      p_character_id,
      d.id,
      d.code,
      d.default_max_critical,
      0,
      0,
      0,
      0,
      false,
      false,
      d.sort_order,
      ''
    from public.odyssey_body_part_defs d
    where d.is_custom = false
      and d.code not in ('shield', 'special')
      and not exists (
        select 1
        from public.odyssey_character_body_parts b
        where b.character_id = p_character_id
          and b.body_part_def_id = d.id
      )
    returning 1
  )
  select count(*) into v_inserted_body_parts from inserted;

  return jsonb_build_object(
    'character_id', p_character_id,
    'inserted_attributes', v_inserted_attributes,
    'inserted_body_parts', v_inserted_body_parts,
    'rule_sheet', public.get_character_rule_sheet(p_character_id)
  );
end;
$$;

do $$
declare
  v_fk record;
  v_character_id uuid;
  v_rows integer := 0;
  v_affected_characters integer := 0;
  v_merged_duplicate_body_parts integer := 0;
  v_relinked_equipment_items integer := 0;
  v_removed_empty_shield_slots integer := 0;
  v_removed_empty_special_slots integer := 0;
  v_characters_skipped_due_to_real_equipment integer := 0;
begin
  create temp table tmp_odyssey_body_part_fk_columns (
    schema_name text not null,
    table_name text not null,
    column_name text not null
  ) on commit drop;

  insert into tmp_odyssey_body_part_fk_columns (
    schema_name,
    table_name,
    column_name
  )
  select
    ns.nspname as schema_name,
    cls.relname as table_name,
    att.attname as column_name
  from pg_constraint con
  join pg_class cls
    on cls.oid = con.conrelid
  join pg_namespace ns
    on ns.oid = cls.relnamespace
  join lateral unnest(con.conkey) with ordinality as child_key(attnum, ord)
    on true
  join lateral unnest(con.confkey) with ordinality as parent_key(attnum, ord)
    on parent_key.ord = child_key.ord
  join pg_attribute att
    on att.attrelid = con.conrelid
   and att.attnum = child_key.attnum
  where con.contype = 'f'
    and con.confrelid = 'public.odyssey_character_body_parts'::regclass
    and array_length(con.conkey, 1) = 1
    and array_length(con.confkey, 1) = 1;

  create temp table tmp_odyssey_body_part_refcounts (
    body_part_id uuid primary key,
    refcount bigint not null default 0
  ) on commit drop;

  for v_fk in
    select *
    from tmp_odyssey_body_part_fk_columns
  loop
    execute format(
      'insert into tmp_odyssey_body_part_refcounts (body_part_id, refcount)
       select t.%1$I as body_part_id, count(*)::bigint as refcount
       from %2$I.%3$I t
       where t.%1$I is not null
       group by t.%1$I
       on conflict (body_part_id) do update
       set refcount = tmp_odyssey_body_part_refcounts.refcount + excluded.refcount',
      v_fk.column_name,
      v_fk.schema_name,
      v_fk.table_name
    );
  end loop;

  create temp table tmp_odyssey_body_part_ranked on commit drop as
  with body_part_rows as (
    select
      b.id,
      b.character_id,
      b.body_part_def_id,
      b.custom_name,
      b.part_key,
      b.max_critical,
      b.critical,
      b.serious,
      b.minor,
      b.disabled,
      b.destroyed,
      coalesce(b.natural_armor_value, 0) as natural_armor_value,
      coalesce(b.notes, '') as notes,
      b.sort_order,
      b.created_at,
      d.code as def_code,
      coalesce((
        select count(*)::integer
        from public.odyssey_character_equipment_items e
        where e.equipped_body_part_id = b.id
      ), 0) as equipment_ref_count,
      coalesce(refs.refcount, 0) as any_ref_count,
      case
        when lower(trim(coalesce(b.part_key, ''))) = lower(trim(coalesce(d.code, ''))) then 1
        else 0
      end as exact_code_match,
      case
        when public.odyssey_resolve_body_part_code(b.part_key, d.code) = d.code then 1
        else 0
      end as normalized_code_match,
      case
        when coalesce(b.minor, 0) > 0
          or coalesce(b.serious, 0) > 0
          or coalesce(b.critical, 0) > 0
          or coalesce(b.natural_armor_value, 0) > 0
          or coalesce(b.disabled, false)
          or coalesce(b.destroyed, false)
          or nullif(trim(coalesce(b.notes, '')), '') is not null
        then 1
        else 0
      end as has_state
    from public.odyssey_character_body_parts b
    join public.odyssey_body_part_defs d
      on d.id = b.body_part_def_id
    left join tmp_odyssey_body_part_refcounts refs
      on refs.body_part_id = b.id
    where b.body_part_def_id is not null
  )
  select
    body_part_rows.*,
    count(*) over (
      partition by body_part_rows.character_id, body_part_rows.body_part_def_id
    ) as duplicate_count,
    row_number() over (
      partition by body_part_rows.character_id, body_part_rows.body_part_def_id
      order by
        body_part_rows.exact_code_match desc,
        body_part_rows.normalized_code_match desc,
        body_part_rows.equipment_ref_count desc,
        body_part_rows.any_ref_count desc,
        body_part_rows.has_state desc,
        body_part_rows.created_at asc,
        body_part_rows.id asc
    ) as duplicate_rank
  from body_part_rows;

  create temp table tmp_odyssey_body_part_relink on commit drop as
  select
    dup.character_id,
    dup.body_part_def_id,
    dup.id as duplicate_id,
    canon.id as canonical_id
  from tmp_odyssey_body_part_ranked dup
  join tmp_odyssey_body_part_ranked canon
    on canon.character_id = dup.character_id
   and canon.body_part_def_id = dup.body_part_def_id
   and canon.duplicate_rank = 1
  where dup.duplicate_count > 1
    and dup.duplicate_rank > 1;

  create temp table tmp_odyssey_body_part_merge on commit drop as
  select
    canon.character_id,
    canon.body_part_def_id,
    canon.id as canonical_id,
    canon.def_code,
    min(all_rows.sort_order)::integer as merged_sort_order,
    max(coalesce(all_rows.max_critical, 0))::integer as merged_max_critical,
    max(coalesce(all_rows.critical, 0))::integer as merged_critical,
    max(coalesce(all_rows.serious, 0))::integer as merged_serious,
    max(coalesce(all_rows.minor, 0))::integer as merged_minor,
    bool_or(coalesce(all_rows.disabled, false)) as merged_disabled,
    bool_or(coalesce(all_rows.destroyed, false)) as merged_destroyed,
    max(coalesce(all_rows.natural_armor_value, 0))::integer as merged_natural_armor_value,
    coalesce(
      min(nullif(trim(coalesce(all_rows.notes, '')), ''))
        filter (where nullif(trim(coalesce(all_rows.notes, '')), '') is not null),
      ''
    ) as merged_notes,
    coalesce(
      min(nullif(trim(coalesce(all_rows.custom_name, '')), ''))
        filter (where nullif(trim(coalesce(all_rows.custom_name, '')), '') is not null),
      ''
    ) as merged_custom_name
  from tmp_odyssey_body_part_ranked canon
  join tmp_odyssey_body_part_ranked all_rows
    on all_rows.character_id = canon.character_id
   and all_rows.body_part_def_id = canon.body_part_def_id
  where canon.duplicate_count > 1
    and canon.duplicate_rank = 1
  group by
    canon.character_id,
    canon.body_part_def_id,
    canon.id,
    canon.def_code;

  create temp table tmp_odyssey_affected_characters (
    character_id uuid primary key
  ) on commit drop;

  update public.odyssey_character_body_parts b
  set
    part_key = merge_rows.def_code,
    max_critical = greatest(coalesce(merge_rows.merged_max_critical, 0), 0),
    critical = greatest(coalesce(merge_rows.merged_critical, 0), 0),
    serious = greatest(coalesce(merge_rows.merged_serious, 0), 0),
    minor = greatest(coalesce(merge_rows.merged_minor, 0), 0),
    disabled = coalesce(merge_rows.merged_disabled, false),
    destroyed = coalesce(merge_rows.merged_destroyed, false),
    natural_armor_value = greatest(coalesce(merge_rows.merged_natural_armor_value, 0), 0),
    sort_order = coalesce(merge_rows.merged_sort_order, b.sort_order),
    custom_name = case
      when nullif(trim(coalesce(b.custom_name, '')), '') is not null then b.custom_name
      when nullif(trim(coalesce(merge_rows.merged_custom_name, '')), '') is not null then merge_rows.merged_custom_name
      else b.custom_name
    end,
    notes = case
      when nullif(trim(coalesce(b.notes, '')), '') is not null then b.notes
      when nullif(trim(coalesce(merge_rows.merged_notes, '')), '') is not null then merge_rows.merged_notes
      else ''
    end,
    updated_at = timezone('utc', now())
  from tmp_odyssey_body_part_merge merge_rows
  where b.id = merge_rows.canonical_id;

  insert into tmp_odyssey_affected_characters (character_id)
  select distinct character_id
  from tmp_odyssey_body_part_merge
  on conflict (character_id) do nothing;

  for v_fk in
    select *
    from tmp_odyssey_body_part_fk_columns
  loop
    execute format(
      'update %1$I.%2$I target
       set %3$I = map.canonical_id
       from tmp_odyssey_body_part_relink map
       where target.%3$I = map.duplicate_id
         and target.%3$I is distinct from map.canonical_id',
      v_fk.schema_name,
      v_fk.table_name,
      v_fk.column_name
    );
    get diagnostics v_rows = row_count;
    v_relinked_equipment_items := v_relinked_equipment_items + v_rows;
  end loop;

  delete from public.odyssey_character_body_parts body_part
  using tmp_odyssey_body_part_relink relink
  where body_part.id = relink.duplicate_id;
  get diagnostics v_merged_duplicate_body_parts = row_count;

  with normalized_rows as (
    update public.odyssey_character_body_parts b
    set
      part_key = d.code,
      sort_order = d.sort_order,
      updated_at = timezone('utc', now())
    from public.odyssey_body_part_defs d
    where d.id = b.body_part_def_id
      and d.is_custom = false
      and d.code not in ('shield', 'special')
      and public.odyssey_resolve_body_part_code(b.part_key, d.code) = d.code
      and b.part_key is distinct from d.code
      and not exists (
        select 1
        from public.odyssey_character_body_parts existing_part
        where existing_part.character_id = b.character_id
          and existing_part.id <> b.id
          and existing_part.part_key = d.code
      )
    returning b.character_id
  )
  insert into tmp_odyssey_affected_characters (character_id)
  select distinct character_id
  from normalized_rows
  on conflict (character_id) do nothing;

  truncate table tmp_odyssey_body_part_refcounts;

  for v_fk in
    select *
    from tmp_odyssey_body_part_fk_columns
  loop
    execute format(
      'insert into tmp_odyssey_body_part_refcounts (body_part_id, refcount)
       select t.%1$I as body_part_id, count(*)::bigint as refcount
       from %2$I.%3$I t
       where t.%1$I is not null
       group by t.%1$I
       on conflict (body_part_id) do update
       set refcount = tmp_odyssey_body_part_refcounts.refcount + excluded.refcount',
      v_fk.column_name,
      v_fk.schema_name,
      v_fk.table_name
    );
  end loop;

  create temp table tmp_odyssey_placeholder_candidates on commit drop as
  select
    b.id,
    b.character_id,
    d.code
  from public.odyssey_character_body_parts b
  join public.odyssey_body_part_defs d
    on d.id = b.body_part_def_id
  left join tmp_odyssey_body_part_refcounts refs
    on refs.body_part_id = b.id
  where d.code in ('shield', 'special')
    and coalesce(refs.refcount, 0) = 0
    and coalesce(b.natural_armor_value, 0) = 0
    and coalesce(b.armor_value, 0) = 0
    and coalesce(b.minor, 0) = 0
    and coalesce(b.serious, 0) = 0
    and coalesce(b.critical, 0) = 0
    and coalesce(b.armor_critical, 0) = 0
    and coalesce(b.armor_max_critical, 0) = 0
    and coalesce(b.armor_destroyed, false) = false
    and coalesce(b.disabled, false) = false
    and coalesce(b.destroyed, false) = false
    and nullif(trim(coalesce(b.notes, '')), '') is null
    and nullif(trim(coalesce(b.custom_name, '')), '') is null;

  insert into tmp_odyssey_affected_characters (character_id)
  select distinct character_id
  from tmp_odyssey_placeholder_candidates
  on conflict (character_id) do nothing;

  select
    count(distinct b.character_id)
  into v_characters_skipped_due_to_real_equipment
  from public.odyssey_character_body_parts b
  join public.odyssey_body_part_defs d
    on d.id = b.body_part_def_id
  left join tmp_odyssey_body_part_refcounts refs
    on refs.body_part_id = b.id
  where d.code in ('shield', 'special')
    and coalesce(refs.refcount, 0) > 0;

  delete from public.odyssey_character_body_parts body_part
  using tmp_odyssey_placeholder_candidates candidate
  where body_part.id = candidate.id
    and candidate.code = 'shield';
  get diagnostics v_removed_empty_shield_slots = row_count;

  delete from public.odyssey_character_body_parts body_part
  using tmp_odyssey_placeholder_candidates candidate
  where body_part.id = candidate.id
    and candidate.code = 'special';
  get diagnostics v_removed_empty_special_slots = row_count;

  for v_character_id in
    select character_id
    from tmp_odyssey_affected_characters
    order by character_id
  loop
    perform public.recompute_character_armor(v_character_id);
    perform public.odyssey_refresh_character_combat_state(v_character_id);
    v_affected_characters := v_affected_characters + 1;
  end loop;

  raise notice 'affected_characters=%', v_affected_characters;
  raise notice 'merged_duplicate_body_parts=%', v_merged_duplicate_body_parts;
  raise notice 'relinked_equipment_items=%', v_relinked_equipment_items;
  raise notice 'removed_empty_shield_slots=%', v_removed_empty_shield_slots;
  raise notice 'removed_empty_special_slots=%', v_removed_empty_special_slots;
  raise notice 'characters_skipped_due_to_real_equipment=%', v_characters_skipped_due_to_real_equipment;
end;
$$;
