-- Stage 70: allow effect-based skill bonuses to scale up to the promoted GM caps.
-- Base max_level stays in defs as 1/3/5, but effective skill level may reach:
-- - 10 for 5-level skills
-- - 5 for 3-level skills
-- - 1 for passive/1-level skills

create or replace function public.odyssey_get_effective_character_skill_states(
  p_character_id uuid
)
returns table (
  character_skill_id uuid,
  skill_def_id uuid,
  skill_code text,
  skill_name text,
  skill_category text,
  description text,
  skill_tags jsonb,
  sort_order integer,
  max_level integer,
  is_passive boolean,
  is_trained boolean,
  purchased_level integer,
  base_effective_level integer,
  effect_level_modifier integer,
  effect_skill_bonus integer,
  effective_level integer,
  skill_bonus integer,
  highest_available_level integer,
  current_level_requirements_met boolean,
  next_available_level integer,
  governing_attribute_def_id uuid,
  main_attribute_def_id uuid,
  main_attribute_code text,
  main_attribute_name text,
  main_base_value integer,
  main_effect_modifier integer,
  main_effective_value integer,
  secondary_attribute_def_id uuid,
  secondary_attribute_code text,
  secondary_attribute_name text,
  secondary_base_value integer,
  secondary_effect_modifier integer,
  secondary_effective_value integer,
  custom_name text,
  notes text
)
language sql
stable
as $$
  with selected_character as (
    select c.id
    from public.odyssey_characters c
    where c.id = p_character_id
      and coalesce(c.is_deleted, false) = false
  ),
  effect_summary as (
    select public.get_character_effect_summary(p_character_id) as effect_summary
    from selected_character
  ),
  skill_rows as (
    select
      s.id as character_skill_id,
      d.id as skill_def_id,
      d.code as skill_code,
      d.name as skill_name,
      d.category as skill_category,
      d.description,
      d.tags as skill_tags,
      d.sort_order,
      d.max_level,
      (d.category = 'passive' or d.max_level = 1) as is_passive,
      (s.id is not null) as is_trained,
      coalesce(s.level, 0) as purchased_level,
      s.governing_attribute_def_id,
      d.main_attribute_id as configured_main_attribute_def_id,
      d.secondary_attribute_id as configured_secondary_attribute_def_id,
      s.custom_name,
      s.notes
    from selected_character c
    cross join public.odyssey_skill_defs d
    left join public.odyssey_character_skills s
      on s.character_id = c.id
     and s.skill_def_id = d.id
  ),
  resolved_rows as (
    select
      skill_rows.*,
      case
        when skill_rows.governing_attribute_def_id is not null
          and skill_rows.configured_secondary_attribute_def_id is not null
          and skill_rows.governing_attribute_def_id in (
            skill_rows.configured_main_attribute_def_id,
            skill_rows.configured_secondary_attribute_def_id
          )
          then skill_rows.governing_attribute_def_id
        else skill_rows.configured_main_attribute_def_id
      end as resolved_main_attribute_def_id,
      case
        when skill_rows.governing_attribute_def_id is not null
          and skill_rows.configured_secondary_attribute_def_id is not null
          and skill_rows.governing_attribute_def_id in (
            skill_rows.configured_main_attribute_def_id,
            skill_rows.configured_secondary_attribute_def_id
          )
          then case
            when skill_rows.governing_attribute_def_id = skill_rows.configured_main_attribute_def_id
              then skill_rows.configured_secondary_attribute_def_id
            else skill_rows.configured_main_attribute_def_id
          end
        else skill_rows.configured_secondary_attribute_def_id
      end as resolved_secondary_attribute_def_id
    from skill_rows
  ),
  attribute_rows as (
    select
      resolved_rows.*,
      main_attr.code as main_attribute_code,
      main_attr.name as main_attribute_name,
      coalesce(main_value.value, main_attr.default_value, 0) as main_base_value,
      case
        when main_attr.code is null then 0
        else coalesce(
          nullif(jsonb_extract_path_text(effect_summary.effect_summary, 'modifiers', 'attributes', main_attr.code), '')::integer,
          0
        )
      end as main_effect_modifier,
      coalesce(main_value.value, main_attr.default_value, 0)
        + case
            when main_attr.code is null then 0
            else coalesce(
              nullif(jsonb_extract_path_text(effect_summary.effect_summary, 'modifiers', 'attributes', main_attr.code), '')::integer,
              0
            )
          end as main_effective_value,
      secondary_attr.code as secondary_attribute_code,
      secondary_attr.name as secondary_attribute_name,
      coalesce(secondary_value.value, secondary_attr.default_value, 0) as secondary_base_value,
      case
        when secondary_attr.code is null then 0
        else coalesce(
          nullif(jsonb_extract_path_text(effect_summary.effect_summary, 'modifiers', 'attributes', secondary_attr.code), '')::integer,
          0
        )
      end as secondary_effect_modifier,
      coalesce(secondary_value.value, secondary_attr.default_value, 0)
        + case
            when secondary_attr.code is null then 0
            else coalesce(
              nullif(jsonb_extract_path_text(effect_summary.effect_summary, 'modifiers', 'attributes', secondary_attr.code), '')::integer,
              0
            )
          end as secondary_effective_value,
      coalesce(
        nullif(jsonb_extract_path_text(effect_summary.effect_summary, 'modifiers', 'skills', resolved_rows.skill_code), '')::integer,
        0
      ) as effect_level_modifier
    from resolved_rows
    cross join effect_summary
    left join public.odyssey_attribute_defs main_attr on main_attr.id = resolved_rows.resolved_main_attribute_def_id
    left join public.odyssey_character_attributes main_value
      on main_value.character_id = p_character_id
     and main_value.attribute_def_id = main_attr.id
    left join public.odyssey_attribute_defs secondary_attr on secondary_attr.id = resolved_rows.resolved_secondary_attribute_def_id
    left join public.odyssey_character_attributes secondary_value
      on secondary_value.character_id = p_character_id
     and secondary_value.attribute_def_id = secondary_attr.id
  ),
  availability as (
    select
      attribute_rows.*,
      case
        when attribute_rows.is_passive then attribute_rows.purchased_level
        else coalesce(
          (
            select max(req.level)
            from public.odyssey_skill_level_requirements req
            where req.skill_def_id = attribute_rows.skill_def_id
              and (
                req.main_attribute_required is null
                or coalesce(attribute_rows.main_effective_value, 0) >= req.main_attribute_required
              )
              and (
                req.secondary_attribute_required is null
                or coalesce(attribute_rows.secondary_effective_value, 0) >= req.secondary_attribute_required
              )
          ),
          0
        )
      end as highest_available_level,
      case
        when attribute_rows.purchased_level <= 0 then true
        when attribute_rows.is_passive then true
        else coalesce(
          (
            select
              (
                (req.main_attribute_required is null or coalesce(attribute_rows.main_effective_value, 0) >= req.main_attribute_required)
                and (req.secondary_attribute_required is null or coalesce(attribute_rows.secondary_effective_value, 0) >= req.secondary_attribute_required)
              )
            from public.odyssey_skill_level_requirements req
            where req.skill_def_id = attribute_rows.skill_def_id
              and req.level = attribute_rows.purchased_level
            limit 1
          ),
          false
        )
      end as current_level_requirements_met,
      (
        select min(req.level)
        from public.odyssey_skill_level_requirements req
        where req.skill_def_id = attribute_rows.skill_def_id
          and req.level > case
            when attribute_rows.is_passive then attribute_rows.purchased_level
            else coalesce(
              (
                select max(req2.level)
                from public.odyssey_skill_level_requirements req2
                where req2.skill_def_id = attribute_rows.skill_def_id
                  and (
                    req2.main_attribute_required is null
                    or coalesce(attribute_rows.main_effective_value, 0) >= req2.main_attribute_required
                  )
                  and (
                    req2.secondary_attribute_required is null
                    or coalesce(attribute_rows.secondary_effective_value, 0) >= req2.secondary_attribute_required
                  )
              ),
              0
            )
          end
      ) as next_available_level
    from attribute_rows
  ),
  final_rows as (
    select
      availability.character_skill_id,
      availability.skill_def_id,
      availability.skill_code,
      availability.skill_name,
      availability.skill_category,
      availability.description,
      availability.skill_tags,
      availability.sort_order,
      availability.max_level,
      availability.is_passive,
      availability.is_trained,
      availability.purchased_level,
      case
        when availability.is_passive then availability.purchased_level
        else least(availability.purchased_level, greatest(availability.highest_available_level, 0))
      end as base_effective_level,
      case
        when availability.is_passive then 0
        else availability.effect_level_modifier
      end as effect_level_modifier,
      0 as effect_skill_bonus,
      case
        when availability.is_passive then availability.purchased_level
        else least(
          greatest(
            least(availability.purchased_level, greatest(availability.highest_available_level, 0))
            + availability.effect_level_modifier,
            0
          ),
          case
            when availability.max_level >= 5 then 10
            when availability.max_level = 3 then 5
            else availability.max_level
          end
        )
      end as effective_level,
      availability.highest_available_level,
      availability.current_level_requirements_met,
      availability.next_available_level,
      availability.governing_attribute_def_id,
      availability.resolved_main_attribute_def_id as main_attribute_def_id,
      availability.main_attribute_code,
      availability.main_attribute_name,
      availability.main_base_value,
      availability.main_effect_modifier,
      availability.main_effective_value,
      availability.resolved_secondary_attribute_def_id as secondary_attribute_def_id,
      availability.secondary_attribute_code,
      availability.secondary_attribute_name,
      availability.secondary_base_value,
      availability.secondary_effect_modifier,
      availability.secondary_effective_value,
      availability.custom_name,
      availability.notes
    from availability
  )
  select
    final_rows.character_skill_id,
    final_rows.skill_def_id,
    final_rows.skill_code,
    final_rows.skill_name,
    final_rows.skill_category,
    final_rows.description,
    final_rows.skill_tags,
    final_rows.sort_order,
    final_rows.max_level,
    final_rows.is_passive,
    final_rows.is_trained,
    final_rows.purchased_level,
    final_rows.base_effective_level,
    final_rows.effect_level_modifier,
    final_rows.effect_skill_bonus,
    final_rows.effective_level,
    case
      when final_rows.is_passive then 0
      else final_rows.effective_level * 10
    end as skill_bonus,
    final_rows.highest_available_level,
    final_rows.current_level_requirements_met,
    final_rows.next_available_level,
    final_rows.governing_attribute_def_id,
    final_rows.main_attribute_def_id,
    final_rows.main_attribute_code,
    final_rows.main_attribute_name,
    final_rows.main_base_value,
    final_rows.main_effect_modifier,
    final_rows.main_effective_value,
    final_rows.secondary_attribute_def_id,
    final_rows.secondary_attribute_code,
    final_rows.secondary_attribute_name,
    final_rows.secondary_base_value,
    final_rows.secondary_effect_modifier,
    final_rows.secondary_effective_value,
    final_rows.custom_name,
    final_rows.notes
  from final_rows
  order by final_rows.skill_category, final_rows.sort_order, final_rows.skill_name;
$$;
