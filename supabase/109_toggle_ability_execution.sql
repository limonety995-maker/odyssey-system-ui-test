-- ===== BEGIN 109_toggle_ability_execution.sql =====
--
-- Phase 4.1B.3 — Toggle / Stance / Maintained Abilities from Skills Block.
--
-- Root cause found during the audit (docs/PHASE_4_1B_3_TOGGLE_STANCE_MAINTAINED_AUDIT.md
-- §1-6): the server has NO toggle/active-state concept today.
-- odyssey_get_character_quick_actions_runtime's own `type` CASE only ever
-- produces attack_technique/directed/instant, and its `state.active` field is
-- a literal hardcoded `false` — never read from any table. combat_execute_action
-- routes every `kind:'ability'` call to use_ability unconditionally, and
-- use_ability's apply_effect branch always calls add_character_effect once,
-- with no check for "is this effect already active" and no removal path.
--
-- Fix, closing exactly that gap and nothing else:
--   1. Add 'toggle' as a valid odyssey_ability_defs.activation_type value.
--   2. Derive `type:'toggle'` and a TRUE `state.active` (from whether an
--      odyssey_character_effects row with source_id = this character_ability_id
--      is currently is_active — that linkage already existed, unused, since
--      88_weapon_abilities.sql's apply_effect branch already sets it) in
--      odyssey_get_character_quick_actions_runtime.
--   3. Route `kind:'ability'` toggle abilities through a new
--      toggle_character_ability(jsonb) instead of use_ability, from
--      combat_execute_action.
--   4. toggle_character_ability: if an active effect already exists for this
--      ability, deactivate it (free — no cost, no cooldown change). Otherwise
--      delegate activation ENTIRELY to the existing, unchanged
--      odyssey_use_ability_with_weapon_support_legacy (the same function
--      instant/self abilities already execute through) — same cost, same
--      cooldown, same effect application every other ability class already
--      gets. No effect-resolution logic is duplicated.
--
-- No upkeep/per-turn drain is implemented — no such mechanism exists anywhere
-- in this schema, and inventing one is out of this phase's scope (see audit
-- §8). No existing ability_defs row uses activation_type='toggle' (confirmed
-- in the audit, §7) — this migration is purely additive.

do $$
declare
  v_constraint_name text;
begin
  select conname
  into v_constraint_name
  from pg_constraint
  where conrelid = 'public.odyssey_ability_defs'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%activation_type%';

  if v_constraint_name is not null then
    execute format(
      'alter table public.odyssey_ability_defs drop constraint %I',
      v_constraint_name
    );
  end if;
end;
$$;

alter table public.odyssey_ability_defs
  add constraint odyssey_ability_defs_activation_type_check
  check (activation_type in ('manual', 'passive', 'on_attack', 'on_hit', 'always', 'custom', 'toggle'));

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
            when ad.activation_type = 'toggle' then 'toggle'
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
            -- Phase 4.1B.3: TRUE server-authoritative active state — derived
            -- from whether a currently-active effect exists whose source_id
            -- is this character_ability_id (the same linkage every
            -- apply_effect ability already writes on activation). Was a
            -- hardcoded `false` before this migration.
            'active', coalesce(active_state.is_active, false),
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
      left join lateral (
        select exists(
          select 1
          from public.odyssey_character_effects fx
          where fx.source_id = ca.id::text
            and fx.is_active = true
        ) as is_active
      ) active_state on true
      where ca.character_id = p_character_id
        and ca.is_hidden = false
        and ca.is_enabled = true
        and ad.ability_kind != 'passive'
        and ad.activation_type in ('manual', 'custom', 'toggle')
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

create or replace function public.toggle_character_ability(
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
  v_ability record;
  v_active_effect record;
  v_refresh jsonb := '{}'::jsonb;
  v_activation_result jsonb := '{}'::jsonb;
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
    ability.id,
    ability.character_id,
    def.name as ability_name,
    def.activation_type
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

  if v_ability.activation_type <> 'toggle' then
    return jsonb_build_object(
      'ok', false,
      'error', 'TOGGLE_NOT_SUPPORTED',
      'message', format('%s is not a toggle ability.', v_ability.ability_name),
      'character_ability_id', v_character_ability_id
    );
  end if;

  select *
  into v_active_effect
  from public.odyssey_character_effects fx
  where fx.source_id = v_character_ability_id::text
    and fx.is_active = true
  order by fx.created_at desc
  limit 1
  for update of fx;

  if found then
    -- Deactivation: free — no cost, no cooldown change. Mirrors
    -- remove_character_effect(uuid)'s own update, inlined here so this stays
    -- in the same transaction as the ability-row lock above.
    update public.odyssey_character_effects
    set is_active = false, updated_at = timezone('utc', now())
    where id = v_active_effect.id;

    v_refresh := public.odyssey_refresh_character_combat_state(v_ability.character_id);

    return jsonb_build_object(
      'ok', true,
      'active', false,
      'character_ability_id', v_character_ability_id,
      'character_id', v_ability.character_id,
      'ability', jsonb_build_object('name', v_ability.ability_name),
      'combat_state', coalesce(v_refresh->'combat_state', '{}'::jsonb),
      'message', format('%s deactivated.', v_ability.ability_name)
    );
  end if;

  -- Activation: delegate entirely to the existing, unchanged apply_effect
  -- resolver — same cost consumption, same cooldown, same effect application
  -- every other apply_effect ability already gets. No logic duplicated.
  v_activation_result := public.odyssey_use_ability_with_weapon_support_legacy(v_payload);

  if coalesce((v_activation_result->>'ok')::boolean, false) = false then
    return v_activation_result;
  end if;

  return v_activation_result || jsonb_build_object('active', true);
end;
$$;

create or replace function public.combat_execute_action(
  p_payload jsonb
)
returns jsonb
language plpgsql
as $body$
declare
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_encounter_id uuid := public.odyssey_try_parse_uuid(v_payload->>'encounter_id');
  v_character_id uuid := public.odyssey_try_parse_uuid(v_payload->>'character_id');
  v_kind text := lower(trim(coalesce(v_payload->>'kind', '')));
  v_include_runtime boolean := coalesce(nullif(trim(coalesce(v_payload->>'include_runtime', '')), '')::boolean, false);
  v_actor_player_id text := coalesce(nullif(trim(coalesce(v_payload->>'actor_player_id', '')), ''), '');
  v_actor_is_gm boolean := coalesce(nullif(trim(coalesce(v_payload->>'actor_is_gm', '')), '')::boolean, false);
  v_intent jsonb := case when jsonb_typeof(v_payload->'intent') = 'object' then v_payload->'intent' else '{}'::jsonb end;
  v_encounter public.odyssey_combat_encounters%rowtype;
  v_entry public.odyssey_initiative_entries%rowtype;
  v_control jsonb := '{}'::jsonb;
  v_versions jsonb := '{}'::jsonb;
  v_cost jsonb := '{}'::jsonb;
  v_result jsonb := '{}'::jsonb;
  v_action_cost integer := 0;
  v_move_cost integer := 0;
  v_use_reaction boolean := false;
  v_post_refresh jsonb := '{}'::jsonb;
  v_result_target_character_id uuid := null;
  v_result_combat_state jsonb := '{}'::jsonb;
  -- Phase 4.1B.3: resolved once, only for kind:'ability', to decide whether
  -- this specific ability routes through toggle_character_ability instead of
  -- use_ability. Every other kind, and every non-toggle ability, is
  -- byte-for-byte unchanged from the prior body.
  v_toggle_character_ability_id uuid := null;
  v_toggle_activation_type text := null;
begin
  perform set_config('lock_timeout', '1500ms', true);

  if v_kind not in ('attack', 'reload', 'ability', 'perk', 'item', 'move') then
    return jsonb_build_object('ok', false, 'error', 'INVALID_ACTION_KIND', 'message', 'Unsupported action kind.');
  end if;

  select *
  into v_encounter
  from public.odyssey_combat_encounters
  where id = v_encounter_id
    and status = 'active'
    and ended_at is null
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'ENCOUNTER_NOT_ACTIVE', 'message', 'Encounter is not active.');
  end if;

  select *
  into v_entry
  from public.odyssey_initiative_entries
  where encounter_id = v_encounter_id
    and character_id = v_character_id
    and is_active = true
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'PARTICIPANT_NOT_FOUND', 'message', 'Participant was not found.');
  end if;

  v_control := public.odyssey_can_control_character(v_character_id, v_actor_player_id, v_actor_is_gm);
  if coalesce((v_control->>'allowed')::boolean, false) = false then
    return jsonb_build_object('ok', false, 'error', 'CONTROL_DENIED', 'message', 'You cannot control this participant.');
  end if;

  if v_encounter.active_entry_id is distinct from v_entry.id then
    if coalesce(v_entry.reaction_action_current, 0) > 0 then
      v_use_reaction := true;
    else
      return jsonb_build_object('ok', false, 'error', 'NOT_CURRENT_TURN', 'message', 'It is not this participant''s turn.');
    end if;
  end if;

  v_versions := public.odyssey_validate_combat_versions(
    v_encounter_id,
    nullif(trim(coalesce(v_payload->>'expected_encounter_version', '')), '')::integer,
    v_character_id,
    nullif(trim(coalesce(v_payload->>'expected_character_state_version', '')), '')::integer
  );
  if coalesce((v_versions->>'ok')::boolean, false) = false then
    return v_versions;
  end if;

  v_cost := public.odyssey_get_combat_action_cost_context(
    v_encounter_id,
    v_character_id,
    v_kind,
    case when v_kind in ('ability', 'perk', 'item') then v_kind else null end,
    public.odyssey_try_parse_uuid(coalesce(v_intent->>'character_ability_id', v_intent->>'character_perk_id', v_intent->>'character_item_id')),
    v_intent
  );

  v_action_cost := greatest(coalesce(nullif(trim(coalesce(v_cost->>'action_cost', '')), '')::integer, 0), 0);
  v_move_cost := greatest(coalesce(nullif(trim(coalesce(v_cost->>'move_cost', '')), '')::integer, 0), 0);

  if not v_use_reaction and coalesce(v_entry.action_current, 0) < v_action_cost then
    return jsonb_build_object('ok', false, 'error', 'ACTION_NOT_AVAILABLE', 'message', 'Not enough ACTION is available.');
  end if;

  if coalesce(v_entry.move_current, 0) < v_move_cost then
    return jsonb_build_object('ok', false, 'error', 'MOVE_NOT_AVAILABLE', 'message', 'Not enough MOVE is available.');
  end if;

  if v_use_reaction and coalesce(v_entry.reaction_action_current, 0) <= 0 then
    return jsonb_build_object('ok', false, 'error', 'REACTION_NOT_AVAILABLE', 'message', 'No reaction action is available.');
  end if;

  case v_kind
    when 'attack' then
      v_result := public.perform_attack(
        v_intent
        || jsonb_build_object(
          'encounter_id', v_encounter_id,
          'attacker_character_id', v_character_id
        )
      );
    when 'reload' then
      v_result := public.load_weapon_profile_magazine(v_intent);
    when 'ability' then
      -- Phase 4.1B.3: resolve the target ability's activation_type BEFORE
      -- dispatch — a toggle ability routes to toggle_character_ability,
      -- every other ability keeps calling use_ability exactly as before.
      v_toggle_character_ability_id := public.odyssey_try_parse_uuid(v_intent->>'character_ability_id');
      if v_toggle_character_ability_id is not null then
        select def.activation_type
        into v_toggle_activation_type
        from public.odyssey_character_abilities ability
        join public.odyssey_ability_defs def on def.id = ability.ability_def_id
        where ability.id = v_toggle_character_ability_id;
      else
        select ability.id, def.activation_type
        into v_toggle_character_ability_id, v_toggle_activation_type
        from public.odyssey_character_abilities ability
        join public.odyssey_ability_defs def on def.id = ability.ability_def_id
        where ability.character_id = coalesce(public.odyssey_try_parse_uuid(v_intent->>'character_id'), v_character_id)
          and def.code = lower(trim(coalesce(v_intent->>'ability_code', '')))
          and ability.is_enabled = true
        order by ability.sort_order, ability.created_at, ability.id
        limit 1;
      end if;

      if v_toggle_activation_type = 'toggle' then
        v_result := public.toggle_character_ability(v_intent || jsonb_build_object('encounter_id', v_encounter_id));
      else
        v_result := public.use_ability(v_intent || jsonb_build_object('encounter_id', v_encounter_id));
      end if;
    when 'perk' then
      v_result := public.use_character_perk(v_intent || jsonb_build_object('encounter_id', v_encounter_id));
    when 'item' then
      v_result := public.use_character_item(v_intent || jsonb_build_object('encounter_id', v_encounter_id));
    when 'move' then
      v_result := public.combat_spend_move(
        jsonb_build_object(
          'encounter_id', v_encounter_id,
          'character_id', v_character_id,
          'actor_player_id', v_actor_player_id,
          'actor_is_gm', v_actor_is_gm,
          'move_cost', v_move_cost
        ) || v_intent
      );
  end case;

  if coalesce((v_result->>'ok')::boolean, false) = false then
    return v_result;
  end if;

  if v_kind <> 'move' then
    perform public.odyssey_apply_turn_costs(v_entry.id, v_action_cost, v_move_cost, v_use_reaction);
    perform public.odyssey_increment_encounter_state_version(v_encounter_id);
  end if;

  v_result_target_character_id := public.odyssey_try_parse_uuid(v_result->>'target_character_id');
  v_result_combat_state := case
    when jsonb_typeof(v_result->'combat_state') = 'object' then v_result->'combat_state'
    else '{}'::jsonb
  end;

  if v_kind = 'ability'
     and v_result_target_character_id = v_character_id
     and v_result_combat_state <> '{}'::jsonb then
    v_post_refresh := jsonb_build_object(
      'ok', true,
      'character_id', v_character_id,
      'combat_state', v_result_combat_state,
      'state_version', nullif(v_result#>>'{combat_state,state_version}', '')::integer
    );
  else
    v_post_refresh := public.odyssey_refresh_character_combat_state(v_character_id);
  end if;

  if v_kind = 'perk'
     and coalesce(nullif(v_result->>'force_end_turn', '')::boolean, false)
     and not v_use_reaction then
    perform public.odyssey_start_next_eligible_turn(v_encounter_id);
  end if;

  return jsonb_build_object(
    'ok', true,
    'encounter_state_version', (select state_version from public.odyssey_combat_encounters where id = v_encounter_id),
    'character_state_version', coalesce((v_post_refresh->>'state_version')::integer, null),
    'spent',
      jsonb_build_object(
        'action_cost', v_action_cost,
        'move_cost', v_move_cost,
        'used_reaction', v_use_reaction
      ),
    'result', v_result,
    'acting_combat_state', coalesce(v_post_refresh->'combat_state', '{}'::jsonb),
    'runtime', case
      when v_include_runtime then public.odyssey_build_combat_runtime(v_encounter_id, v_actor_player_id, v_actor_is_gm, v_actor_is_gm, 5)
      else null
    end
  );
exception
  when lock_not_available then
    return jsonb_build_object(
      'ok', false,
      'error', 'ACTION_BUSY_RETRY',
      'message', 'Character state is busy. Please retry.'
    );
  when query_canceled then
    if SQLERRM ilike '%statement timeout%' or SQLERRM ilike '%lock timeout%' then
      return jsonb_build_object(
        'ok', false,
        'error', 'ACTION_BUSY_RETRY',
        'message', 'Character state is busy. Please retry.'
      );
    end if;
    raise;
end;
$body$;

grant execute on function public.odyssey_get_character_quick_actions_runtime(uuid) to anon, authenticated;
grant execute on function public.toggle_character_ability(jsonb) to anon, authenticated;
grant execute on function public.combat_execute_action(jsonb) to anon, authenticated;

-- ===== END 109_toggle_ability_execution.sql =====
