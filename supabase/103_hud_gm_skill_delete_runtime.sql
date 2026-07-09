-- HUD GM delete support: expose source skill linkage in quick-actions runtime
-- so the Skills quickbar can delete either the visible character ability row
-- or its originating character skill row without an extra lookup query.

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
          'characterSkillId', ca.character_skill_id,
          'sourceCharacterWeaponId', ca.source_character_weapon_id,
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
        and ad.activation_type in ('manual', 'custom')
    ),
    '[]'::jsonb
  );

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
