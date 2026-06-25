-- 77_effective_skill_satisfies_penalty_requirements_v2.sql
-- Replaces migration 77 that failed due to a whitespace-sensitive text substitution.
--
-- Rule:
-- Any active effect that grants an effective skill level may satisfy a skill-gated
-- penalty requirement. This includes equipment, implants, prosthetics, abilities,
-- and other active character effects represented by the normal effect engine.
--
-- Current use:
-- get_character_armor_summary() uses this rule for armor training requirements.

begin;

create or replace function public.odyssey_character_has_effective_skill(
  p_character_id uuid,
  p_skill_code text,
  p_minimum_level integer default 1
)
returns boolean
language sql
stable
as $function$
  select exists (
    select 1
    from public.odyssey_get_effective_character_skill_states(p_character_id) skill
    where skill.skill_code = lower(trim(coalesce(p_skill_code, '')))
      and coalesce(skill.effective_level, 0) >= greatest(coalesce(p_minimum_level, 1), 1)
  );
$function$;

create or replace function public.get_character_armor_summary(p_character_id uuid)
returns jsonb
language plpgsql
stable
as $function$
declare
  v_character_exists boolean := false;
  v_total_equipped_armor_value integer := 0;
  v_class_def jsonb := '{}'::jsonb;
  v_required_skill_code text := null;
  v_has_required_skill boolean := false;
  v_penalty_profile text := 'none';
  v_penalty_profile_data jsonb := '{}'::jsonb;
  v_penalty_effect_data jsonb := '{}'::jsonb;
  v_head_protected boolean := false;
  v_torso_protected boolean := false;
  v_special_protection boolean := false;
  v_helpless_execution_protected boolean := false;
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

  select coalesce(sum(coalesce(e.armor_value, 0)), 0)
  into v_total_equipped_armor_value
  from public.odyssey_character_equipment_items e
  where e.character_id = p_character_id
    and e.is_equipped = true
    and e.equipped_body_part_id is not null;

  v_class_def := public.odyssey_get_armor_class_definition(v_total_equipped_armor_value);
  v_required_skill_code := nullif(trim(coalesce(v_class_def->>'required_skill_code', '')), '');

  -- Migration 77:
  -- Use the authoritative effective level, not only permanent rows in
  -- odyssey_character_skills. Therefore any active item/implant/prosthetic/effect
  -- that grants the required passive skill can satisfy the armor requirement.
  if v_required_skill_code is not null then
    v_has_required_skill := public.odyssey_character_has_effective_skill(
      p_character_id,
      v_required_skill_code,
      1
    );
  else
    v_has_required_skill := true;
  end if;

  if coalesce(v_class_def->>'code', 'none') = 'none' then
    v_penalty_profile := 'none';
    v_penalty_profile_data := '{}'::jsonb;
  elsif v_has_required_skill then
    v_penalty_profile := 'trained';
    v_penalty_profile_data := coalesce(v_class_def->'trained_penalties', '{}'::jsonb);
  else
    v_penalty_profile := 'untrained';
    v_penalty_profile_data := coalesce(v_class_def->'untrained_penalties', '{}'::jsonb);
  end if;

  v_penalty_effect_data := public.odyssey_build_armor_penalty_effect_data(v_penalty_profile_data);

  with equipped_items as (
    select
      case
        when jsonb_typeof(e.data->'flags') = 'object'
          then coalesce(m.flags, '{}'::jsonb) || (e.data->'flags')
        else coalesce(m.flags, '{}'::jsonb)
      end as effective_flags,
      public.odyssey_resolve_body_part_code(b.part_key, d.code) as body_part_code
    from public.odyssey_character_equipment_items e
    join public.odyssey_equipment_model_defs m on m.id = e.equipment_model_id
    join public.odyssey_character_body_parts b on b.id = e.equipped_body_part_id
    left join public.odyssey_body_part_defs d on d.id = b.body_part_def_id
    where e.character_id = p_character_id
      and e.is_equipped = true
      and e.equipped_body_part_id is not null
  )
  select
    coalesce(bool_or(body_part_code = 'head'), false),
    coalesce(bool_or(body_part_code = 'torso'), false),
    coalesce(
      bool_or(
        lower(coalesce(effective_flags->>'protects_helpless_execution', 'false'))
          in ('true', '1', 'yes', 'on')
      ),
      false
    )
  into
    v_head_protected,
    v_torso_protected,
    v_special_protection
  from equipped_items;

  v_helpless_execution_protected :=
    coalesce(v_class_def->>'code', 'none') in ('medium', 'heavy', 'superheavy')
    and (
      (v_head_protected and v_torso_protected)
      or v_special_protection
    );

  return jsonb_build_object(
    'ok', true,
    'character_id', p_character_id,
    'total_equipped_armor_value', v_total_equipped_armor_value,
    'armor_class', coalesce(v_class_def->>'code', 'none'),
    'required_skill_code', v_required_skill_code,
    'has_required_skill', v_has_required_skill,
    'penalty_profile', v_penalty_profile,
    'head_protected', v_head_protected,
    'torso_protected', v_torso_protected,
    'special_protection', v_special_protection,
    'helpless_execution_protected', v_helpless_execution_protected,
    'penalty_effect_data', v_penalty_effect_data,
    'class_definition', v_class_def
  );
end;
$function$;

-- Rebuild existing armor penalty effects immediately.
do $refresh$
declare
  v_character record;
begin
  for v_character in
    select c.id
    from public.odyssey_characters c
    where coalesce(c.is_deleted, false) = false
      and (
        exists (
          select 1
          from public.odyssey_character_equipment_items e
          where e.character_id = c.id
            and e.is_equipped = true
        )
        or exists (
          select 1
          from public.odyssey_character_effects effect_row
          where effect_row.character_id = c.id
            and effect_row.effect_key = 'armor_penalty'
            and effect_row.is_active = true
        )
      )
  loop
    perform public.recompute_character_armor(v_character.id);
    perform public.odyssey_refresh_character_combat_state(v_character.id);
  end loop;
end
$refresh$;

commit;

-- Verification:
-- select
--   public.get_character_armor_summary('918f214a-1dfa-4aa2-9c62-cdefdeb8285c')
--     ->> 'has_required_skill' as has_required_skill,
--   public.get_character_armor_summary('918f214a-1dfa-4aa2-9c62-cdefdeb8285c')
--     ->> 'penalty_profile' as penalty_profile;
--
-- With Prot-EXO-01 equipped:
-- has_required_skill = true
-- penalty_profile = trained
