-- 62_runtime_bundle_remove_legacy_name_and_fix_equipment_contract.sql
-- Goal:
--   1) Keep ONE public RPC: public.get_character_runtime_bundle(jsonb)
--   2) Rename the old legacy implementation to an internal helper
--   3) Enrich sections.equipment with the model metadata required by Character Screen
--
-- IMPORTANT:
--   This preserves combat_session behavior in get_character_runtime_bundle.
--   It intentionally keeps one internal helper; physically inlining a ~25k-character
--   implementation into the public function brings no meaningful performance benefit.

begin;

do $migration$
declare
  v_public_sql text;
  v_anchor text := E'\n  if v_campaign_id = \'\' then';
  v_injection text := $inject$

  -- Equipment UI needs model metadata to determine compatible body parts.
  -- Keep the base bundle data, then overlay canonical model fields.
  if jsonb_typeof(v_bundle #> '{sections,equipment}') = 'array' then
    select jsonb_set(
      v_bundle,
      '{sections,equipment}',
      coalesce(
        jsonb_agg(
          existing.item
          || jsonb_build_object(
            'can_equip', coalesce(model.can_equip, true),
            'can_equip_to_body_part', coalesce(model.can_equip_to_body_part, true),
            'default_body_part_code', model.default_body_part_code,
            'flags', coalesce(to_jsonb(model.flags), '{}'::jsonb),
            'tags', coalesce(to_jsonb(model.tags), '[]'::jsonb),
            'effect_data', coalesce(to_jsonb(model.effect_data), '{}'::jsonb),
            'model', jsonb_build_object(
              'id', model.id,
              'code', model.code,
              'name', model.name,
              'item_type', model.item_type,
              'description', coalesce(model.description, ''),
              'can_equip', coalesce(model.can_equip, true),
              'can_equip_to_body_part', coalesce(model.can_equip_to_body_part, true),
              'default_body_part_code', model.default_body_part_code,
              'flags', coalesce(to_jsonb(model.flags), '{}'::jsonb),
              'tags', coalesce(to_jsonb(model.tags), '[]'::jsonb),
              'effect_data', coalesce(to_jsonb(model.effect_data), '{}'::jsonb)
            )
          )
          order by existing.ordinality
        ),
        '[]'::jsonb
      ),
      true
    )
    into v_bundle
    from jsonb_array_elements(v_bundle #> '{sections,equipment}')
      with ordinality as existing(item, ordinality)
    left join public.odyssey_equipment_model_defs model
      on model.id = public.odyssey_try_parse_uuid(existing.item->>'equipment_model_id');
  end if;

$inject$;
begin
  if to_regprocedure('public.get_character_runtime_bundle(jsonb)') is null then
    raise exception 'Missing public.get_character_runtime_bundle(jsonb)';
  end if;

  if to_regprocedure('public.odyssey_get_character_runtime_bundle_legacy(jsonb)') is null
     and to_regprocedure('public.odyssey_build_character_runtime_sections(jsonb)') is null then
    raise exception 'Missing runtime-bundle implementation function';
  end if;

  select pg_get_functiondef('public.get_character_runtime_bundle(jsonb)'::regprocedure)
    into v_public_sql;

  v_public_sql := replace(v_public_sql, E'\r\n', E'\n');

  if to_regprocedure('public.odyssey_get_character_runtime_bundle_legacy(jsonb)') is not null then
    alter function public.odyssey_get_character_runtime_bundle_legacy(jsonb)
      rename to odyssey_build_character_runtime_sections;
  end if;

  v_public_sql := replace(
    v_public_sql,
    'public.odyssey_get_character_runtime_bundle_legacy(',
    'public.odyssey_build_character_runtime_sections('
  );
  v_public_sql := replace(
    v_public_sql,
    'odyssey_get_character_runtime_bundle_legacy(',
    'odyssey_build_character_runtime_sections('
  );

  if position('Equipment UI needs model metadata' in v_public_sql) = 0 then
    if position(v_anchor in v_public_sql) = 0 then
      raise exception 'Could not find the expected insertion point in get_character_runtime_bundle';
    end if;

    v_public_sql := replace(v_public_sql, v_anchor, v_injection || v_anchor);
  end if;

  execute v_public_sql;
end
$migration$;

do $verify$
declare
  v_sql text;
begin
  if to_regprocedure('public.odyssey_get_character_runtime_bundle_legacy(jsonb)') is not null then
    raise exception 'Legacy runtime-bundle function still exists';
  end if;

  select pg_get_functiondef('public.get_character_runtime_bundle(jsonb)'::regprocedure)
    into v_sql;

  if position('odyssey_build_character_runtime_sections' in v_sql) = 0 then
    raise exception 'Public runtime bundle does not call the internal sections helper';
  end if;

  if position('Equipment UI needs model metadata' in v_sql) = 0 then
    raise exception 'Equipment metadata enrichment was not added';
  end if;
end
$verify$;

commit;

-- Manual verification after applying:
-- select jsonb_pretty(
--   public.get_character_runtime_bundle(
--     jsonb_build_object(
--       'character_id', '918f214a-1dfa-4aa2-9c62-cdefdeb8285c',
--       'sections', jsonb_build_array('combat', 'equipment')
--     )
--   ) #> '{sections,equipment}'
-- );
