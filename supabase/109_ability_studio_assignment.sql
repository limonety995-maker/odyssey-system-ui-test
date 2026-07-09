-- ===== BEGIN 109_ability_studio_assignment.sql =====
--
-- Phase 4.1C.0 — Ability Studio Foundation.
--
-- Root cause found during the audit (docs/PHASE_4_1C_0_ABILITY_STUDIO_AUDIT.md
-- §6): odyssey_character_abilities rows are today produced EXCLUSIVELY by
-- odyssey_reconcile_character_abilities, which only inserts a row when the
-- character already has a matching skill/perk/item/equipment/weapon tied to
-- the ability via odyssey_ability_grants (source_type in 'skill'|'perk'|
-- 'item'|'equipment'|'weapon'). There is no "GM directly grants ability X to
-- character Y" path independent of one of those five sources.
--
-- This migration adds exactly two new RPCs, mirroring the existing
-- creator_* naming/shape convention:
--   - creator_assign_ability_to_character: inserts (or re-enables) a
--     character_abilities row tagged data.generated_from = 'direct', which
--     odyssey_reconcile_character_abilities's four cleanup passes never
--     touch (each keys off a specific 'skill'/'perk'/'item'/'equipment'
--     string — confirmed by reading every cleanup UPDATE...WHERE clause in
--     102_character_ability_reconcile.sql and 106_universal_granted_abilities.sql).
--   - creator_remove_character_ability: deletes a single direct-assigned row
--     only — refuses for any row generated from a real source, since deleting
--     those out from under the reconcile function would just have it silently
--     recreate them on the next reconcile pass.
--
-- No existing function is modified. Nothing here changes classification,
-- quickbar runtime shape, or any execution path — it only adds a way to
-- create/remove the same kind of row odyssey_reconcile_character_abilities
-- already creates for other sources.

create or replace function public.creator_assign_ability_to_character(
  p_ability_def_id uuid,
  p_character_id uuid
)
returns jsonb
language plpgsql
as $$
declare
  v_ability public.odyssey_ability_defs%rowtype;
  v_character_exists boolean := false;
  v_existing public.odyssey_character_abilities%rowtype;
  v_result jsonb := '{}'::jsonb;
begin
  if p_ability_def_id is null then
    return public.odyssey_creator_error(
      'VALIDATION_ERROR',
      'ability_def_id is required.',
      jsonb_build_array(jsonb_build_object('field', 'ability_def_id', 'message', 'Provide an ability definition id.'))
    );
  end if;

  if p_character_id is null then
    return public.odyssey_creator_error(
      'VALIDATION_ERROR',
      'character_id is required.',
      jsonb_build_array(jsonb_build_object('field', 'character_id', 'message', 'Provide a character id.'))
    );
  end if;

  select *
  into v_ability
  from public.odyssey_ability_defs ability
  where ability.id = p_ability_def_id;

  if not found then
    return public.odyssey_creator_error(
      'ABILITY_NOT_FOUND',
      'Ability definition was not found.',
      jsonb_build_array(jsonb_build_object('field', 'ability_def_id', 'message', 'Unknown ability definition id.'))
    );
  end if;

  select exists(
    select 1
    from public.odyssey_characters c
    where c.id = p_character_id
      and coalesce(c.is_deleted, false) = false
  )
  into v_character_exists;

  if not v_character_exists then
    return public.odyssey_creator_error(
      'CHARACTER_NOT_FOUND',
      'Character does not exist or is deleted.',
      jsonb_build_array(jsonb_build_object('field', 'character_id', 'message', 'Unknown or deleted character id.'))
    );
  end if;

  select *
  into v_existing
  from public.odyssey_character_abilities ability
  where ability.character_id = p_character_id
    and ability.ability_def_id = p_ability_def_id
    and ability.source_equipment_item_id is null
    and ability.source_character_item_id is null
    and ability.source_character_weapon_id is null
  for update of ability;

  if found then
    update public.odyssey_character_abilities
    set
      is_enabled = true,
      is_hidden = false,
      data = coalesce(v_existing.data, '{}'::jsonb) || jsonb_build_object(
        'generated', false,
        'generated_from', 'direct',
        'source_removed', false
      ),
      updated_at = timezone('utc', now())
    where id = v_existing.id
    returning * into v_existing;
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
      p_ability_def_id,
      null,
      1,
      null,
      null,
      null,
      true,
      false,
      jsonb_build_object('generated', false, 'generated_from', 'direct', 'source_removed', false),
      '',
      coalesce(v_ability.sort_order, 0)
    )
    returning * into v_existing;
  end if;

  select public.get_character_abilities(p_character_id) into v_result;

  return jsonb_build_object(
    'ok', true,
    'character_ability_id', v_existing.id,
    'character_id', p_character_id,
    'ability_def_id', p_ability_def_id,
    'abilities', coalesce(v_result->'abilities', '[]'::jsonb)
  );
end;
$$;

create or replace function public.creator_remove_character_ability(
  p_character_ability_id uuid
)
returns jsonb
language plpgsql
as $$
declare
  v_row public.odyssey_character_abilities%rowtype;
  v_generated_from text;
begin
  if p_character_ability_id is null then
    return public.odyssey_creator_error(
      'VALIDATION_ERROR',
      'character_ability_id is required.',
      jsonb_build_array(jsonb_build_object('field', 'character_ability_id', 'message', 'Provide a character ability id.'))
    );
  end if;

  select *
  into v_row
  from public.odyssey_character_abilities ability
  where ability.id = p_character_ability_id
  for update of ability;

  if not found then
    return public.odyssey_creator_error(
      'CHARACTER_ABILITY_NOT_FOUND',
      'Character ability was not found.',
      jsonb_build_array(jsonb_build_object('field', 'character_ability_id', 'message', 'Unknown character ability id.'))
    );
  end if;

  v_generated_from := coalesce(nullif(trim(coalesce(v_row.data->>'generated_from', '')), ''), '');

  if v_row.source_equipment_item_id is not null
     or v_row.source_character_item_id is not null
     or v_row.source_character_weapon_id is not null
     or v_generated_from in ('skill', 'perk', 'item', 'equipment', 'weapon') then
    return public.odyssey_creator_error(
      'CHARACTER_ABILITY_NOT_DIRECT',
      'This ability was granted by a skill/perk/item/equipment/weapon, not assigned directly. Remove its source instead.',
      jsonb_build_array(jsonb_build_object('field', 'character_ability_id', 'message', 'Only directly-assigned abilities can be removed here.'))
    );
  end if;

  delete from public.odyssey_character_abilities
  where id = p_character_ability_id;

  return jsonb_build_object(
    'ok', true,
    'removed_character_ability_id', p_character_ability_id,
    'character_id', v_row.character_id,
    'ability_def_id', v_row.ability_def_id
  );
end;
$$;

grant execute on function public.creator_assign_ability_to_character(uuid, uuid) to anon, authenticated;
grant execute on function public.creator_remove_character_ability(uuid) to anon, authenticated;

-- ===== END 109_ability_studio_assignment.sql =====
