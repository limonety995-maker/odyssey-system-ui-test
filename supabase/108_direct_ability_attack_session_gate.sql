-- ===== BEGIN 108_direct_ability_attack_session_gate.sql =====
--
-- Phase 4.1B.0 — Direct Ability Attack from Skills Block.
--
-- Renumbered from 102 → 108 on 2026-07-09 during the upstream tree-adoption
-- sync (odyssey-services/Odyssey_System @ 8958a3a): the upstream repo
-- independently used migration number 102 for an unrelated change
-- (102_character_ability_reconcile.sql). Confirmed by diffing upstream's
-- current public.perform_attack against this migration's own body: the ONLY
-- difference is exactly the fix described below — upstream has NOT applied
-- this fix under any other migration (102-107 were checked; none redefine
-- perform_attack). Content is otherwise byte-identical to the original
-- 102_direct_ability_attack_session_gate.sql.
--
-- Root cause found during the audit (docs/PHASE_4_1B_0_DIRECT_ABILITY_ATTACK_AUDIT.md
-- §14): public.perform_attack(jsonb) already redirects a payload carrying
-- character_ability_id/ability_code to public.odyssey_perform_ability_attack
-- (migration 29 onward) — a fully working single-target ability-attack
-- resolver (rolls, damage, armor-pierce/ignore-armor, PSI/resource cost,
-- cooldown) that already supports abilities with a nonzero attack_damage_bonus
-- (e.g. Etheric Strike) with NO "unsupported effect" restriction of its own —
-- that restriction (migration 100's ACTION_EFFECT_NOT_IMPLEMENTED) is scoped
-- ONLY to the separate armed-attack-technique-on-weapon-attack channel.
--
-- BUT: that redirect (`return public.odyssey_perform_ability_attack(v_payload);`)
-- happens BEFORE perform_attack's own Phase 3E.0 combat-session gate (the
-- STATE_VERSION_CONFLICT / NOT_CURRENT_TURN / ACTION_NOT_AVAILABLE checks) and
-- before the post-resolution MAIN-action-cost consumption
-- (odyssey_apply_turn_costs) + encounter-version bump
-- (odyssey_increment_encounter_state_version) that every WEAPON attack going
-- through this same function already gets. A direct ability attack therefore
-- resolved fully (roll/damage/PSI/cooldown) but WITHOUT the server ever
-- checking whose turn it is or spending a MAIN action — the one authoritative
-- guarantee this phase's spec requires ("The server must be authoritative
-- for: whether it is the character's turn ... MAIN/action cost ... encounter
-- state version").
--
-- Fix: reorder so the session gate runs BEFORE the ability redirect (exactly
-- like it already does before the weapon path), and apply the SAME
-- MAIN-cost-consumption + encounter-version-bump + cost-summary attachment to
-- a successfully-resolved ability attack that a successfully-resolved weapon
-- attack already gets — reusing odyssey_apply_turn_costs /
-- odyssey_increment_encounter_state_version / odyssey_build_session_cost_summary
-- verbatim (the exact same helper functions the weapon path uses a few dozen
-- lines further down in this same function). odyssey_perform_ability_attack
-- itself is NOT modified at all — its roll/damage/resource/cooldown
-- resolution was already correct and is untouched.
--
-- Every other line of this function (weapon-attack path, armed-technique
-- validation/consumption, perk hooks, finalize) is copied verbatim from
-- 100_armed_attack_technique_execution.sql — this migration changes ONLY the
-- ordering of the session-gate block and the body of the ability-attack
-- branch.

create or replace function public.perform_attack(
  p_payload jsonb
)
returns jsonb
language plpgsql
as $$
declare
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_character_ability_id uuid := public.odyssey_try_parse_uuid(v_payload->>'character_ability_id');
  v_ability_code text := lower(trim(coalesce(v_payload->>'ability_code', '')));
  v_attacker_character_id uuid := public.odyssey_try_parse_uuid(coalesce(v_payload->>'attacker_character_id', v_payload->>'character_id'));
  v_target_character_id uuid := public.odyssey_try_parse_uuid(v_payload->>'target_character_id');
  v_target_body_part_id uuid := public.odyssey_try_parse_uuid(v_payload->>'target_body_part_id');
  v_character_weapon_id uuid := public.odyssey_try_parse_uuid(coalesce(v_payload->>'character_weapon_id', v_payload->>'weapon_id'));
  v_distance_m numeric := greatest(coalesce(nullif(trim(coalesce(v_payload->>'distance_m', '')), '')::numeric, 0), 0);
  v_encounter_id uuid := public.odyssey_try_parse_uuid(v_payload->>'encounter_id');
  v_debug boolean := coalesce(nullif(trim(coalesce(v_payload->>'debug', '')), '')::boolean, false);
  v_lock_state jsonb := '{}'::jsonb;
  v_perk_context_result jsonb := jsonb_build_object(
    'ok', true,
    'attack_accuracy_bonus', 0,
    'ammo_base_damage_multiplier', 1,
    'flags', '{}'::jsonb,
    'perk_modifiers', '[]'::jsonb,
    'consume_effect_ids', '[]'::jsonb
  );
  v_attack_context jsonb := '{}'::jsonb;
  v_existing_bonus integer := 0;
  v_perk_bonus integer := 0;
  v_result jsonb := '{}'::jsonb;
  v_retry_effect jsonb := jsonb_build_object('ok', true, 'applied', false);
  v_post_hooks jsonb := jsonb_build_object(
    'ok', true,
    'attacker_changed', false,
    'target_changed', false,
    'changed_effect_ids', '[]'::jsonb,
    'changed_weapon_ids', '[]'::jsonb
  );
  v_refresh_attacker boolean := false;
  v_refresh_target boolean := false;
  v_target_alive_before boolean := true;
  v_target_alive_after boolean := true;
  v_target_movement_version integer := 0;
  v_finalized jsonb := '{}'::jsonb;
  v_attacker_refresh_result jsonb := '{}'::jsonb;
  v_target_refresh_result jsonb := '{}'::jsonb;
  v_started_at timestamptz := clock_timestamp();
  v_stage_started_at timestamptz := clock_timestamp();
  v_weapon_validation_ms numeric := 0;
  v_damage_apply_ms numeric := 0;
  v_perk_hooks_ms numeric := 0;
  v_final_refresh_attacker_ms numeric := 0;
  v_final_refresh_target_ms numeric := 0;
  v_finalize_result_ms numeric := 0;
  -- Phase 3E.0 session gate state
  v_participation jsonb := null;
  v_expected_session_version integer := nullif(trim(coalesce(v_payload->>'expected_encounter_version', '')), '')::integer;
  v_session_use_reaction boolean := false;
  -- Phase 4.1A armed attack technique state
  v_armed_action_ids jsonb := case
    when jsonb_typeof(v_payload->'armed_action_ids') = 'array' then v_payload->'armed_action_ids'
    else '[]'::jsonb
  end;
  v_armed_action_id uuid := null;
  v_armed_ability record;
  v_armed_level record;
  v_armed_effective_level integer := 0;
  v_armed_technique_bonus integer := 0;
  v_armed_pool_current integer := null;
  v_armed_payload_attack_type text := nullif(trim(coalesce(v_payload->>'attack_type', '')), '');
  v_armed_results jsonb := '[]'::jsonb;
  v_armed_cost_result jsonb := null;
  v_armed_cooldown_before integer := 0;
  v_armed_cooldown_after integer := 0;
begin
  if v_target_character_id is not null then
    select coalesce(s.is_alive, true)
    into v_target_alive_before
    from public.odyssey_character_combat_state s
    where s.character_id = v_target_character_id;

    if v_encounter_id is not null then
      select coalesce(e.movement_version, 0)
      into v_target_movement_version
      from public.odyssey_initiative_entries e
      where e.encounter_id = v_encounter_id
        and e.character_id = v_target_character_id
        and e.is_active = true
      order by e.updated_at desc, e.id desc
      limit 1;
    end if;
  end if;

  -- Phase 3E.0: server-authoritative combat-session gate. Looked up from the
  -- ATTACKER'S OWN participation — never from client-sent encounter context —
  -- so removing combat_session/encounter fields from the payload cannot
  -- bypass the action economy while the character is in an active encounter.
  --
  -- Phase 4.1B.0: moved to run BEFORE the ability-attack redirect below (it
  -- used to run only for the weapon-attack path) so a direct ability attack
  -- gets the exact same turn-order/MAIN-action/encounter-version enforcement
  -- a weapon attack already gets — see this migration's header comment.
  v_participation := public.odyssey_get_active_participation(v_attacker_character_id);
  if v_participation is not null then
    if v_expected_session_version is not null
       and v_expected_session_version <> coalesce((v_participation->>'state_version')::integer, 0) then
      return jsonb_build_object(
        'ok', false,
        'error', 'STATE_VERSION_CONFLICT',
        'message', 'Combat state changed. Reload authoritative runtime.',
        'encounter_state_version', (v_participation->>'state_version')::integer
      );
    end if;

    if coalesce((v_participation->>'is_current_turn')::boolean, false) = false then
      if coalesce((v_participation->>'reaction_action_current')::integer, 0) > 0 then
        v_session_use_reaction := true;
      else
        return jsonb_build_object(
          'ok', false,
          'error', 'NOT_CURRENT_TURN',
          'message', 'It is not this character''s turn.'
        );
      end if;
    end if;

    if not v_session_use_reaction
       and coalesce((v_participation->>'action_current')::integer, 0) < 1 then
      return jsonb_build_object(
        'ok', false,
        'error', 'ACTION_NOT_AVAILABLE',
        'message', 'MAIN action is already spent.'
      );
    end if;
  end if;

  -- Phase 4.1B.0: direct single-target ability attack. odyssey_perform_ability_attack
  -- itself resolves the roll/damage/resource(PSI)/cooldown — that part was
  -- already correct and is untouched by this migration. What was missing is
  -- everything below: a RESOLVED ability attack (hit and miss identically,
  -- exactly like the weapon path) spends MAIN (or the reaction action)
  -- atomically with the encounter version bump, using the SAME helper
  -- functions the weapon-attack path below already uses. A rejected/failed
  -- ability attack (v_result.ok = false) returns immediately and spends
  -- nothing — same contract as every other rejection path in this function.
  if v_character_ability_id is not null or v_ability_code <> '' then
    v_result := public.odyssey_perform_ability_attack(v_payload);

    if coalesce((v_result->>'ok')::boolean, false) = false then
      return v_result;
    end if;

    if v_participation is not null then
      perform public.odyssey_apply_turn_costs(
        public.odyssey_try_parse_uuid(v_participation->>'entry_id'),
        1,
        0,
        v_session_use_reaction
      );
      perform public.odyssey_increment_encounter_state_version(
        public.odyssey_try_parse_uuid(v_participation->>'encounter_id')
      );
      v_result := v_result || jsonb_build_object(
        'combat_session',
        public.odyssey_build_session_cost_summary(v_participation, v_session_use_reaction)
      );
    end if;

    return v_result;
  end if;

  -- ---------------------------------------------------------------------
  -- Phase 4.1A: armed attack technique validation. Runs BEFORE the weapon
  -- lock / perk context / odyssey_perform_weapon_attack call, so nothing is
  -- spent when an armed technique is rejected. Max one armed id until a real
  -- stack_group column exists anywhere in the schema (see migration header).
  -- ---------------------------------------------------------------------
  if jsonb_array_length(v_armed_action_ids) > 1 then
    return jsonb_build_object(
      'ok', false,
      'error', 'ACTION_STACK_CONFLICT',
      'message', 'Only one attack technique may be armed at a time until stack groups exist.'
    );
  end if;

  if jsonb_array_length(v_armed_action_ids) = 1 then
    v_armed_action_id := public.odyssey_try_parse_uuid(v_armed_action_ids->>0);

    if v_armed_action_id is null then
      return jsonb_build_object(
        'ok', false,
        'error', 'ARMED_ACTION_INVALID',
        'message', 'Armed action id is malformed.'
      );
    end if;

    select
      ability.id,
      ability.character_id,
      ability.current_cooldown_rounds,
      ability.current_charges,
      ability.learned_level,
      def.id as ability_def_id,
      def.code as ability_code,
      def.name as ability_name,
      def.ability_kind,
      def.effect_mode,
      def.attack_type,
      def.target_type,
      def.resource_mode,
      def.resource_pool_code
    into v_armed_ability
    from public.odyssey_character_abilities ability
    join public.odyssey_ability_defs def on def.id = ability.ability_def_id
    where ability.id = v_armed_action_id
      and ability.character_id = v_attacker_character_id
      and ability.is_enabled = true
      and ability.is_hidden = false
    for update of ability;

    if not found then
      return jsonb_build_object(
        'ok', false,
        'error', 'ARMED_ACTION_INVALID',
        'message', 'Armed action does not belong to the attacker, or no longer exists.',
        'character_ability_id', v_armed_action_id
      );
    end if;

    if coalesce(v_armed_ability.effect_mode, '') <> 'attack' and coalesce(v_armed_ability.ability_kind, '') <> 'attack' then
      return jsonb_build_object(
        'ok', false,
        'error', 'ARMED_ACTION_INVALID',
        'message', 'Armed action is not an attack technique.',
        'character_ability_id', v_armed_action_id
      );
    end if;

    if coalesce(v_armed_ability.current_cooldown_rounds, 0) > 0 then
      return jsonb_build_object(
        'ok', false,
        'error', 'ARMED_ACTION_ON_COOLDOWN',
        'message', format('%s is on cooldown for %s more turn(s).', v_armed_ability.ability_name, v_armed_ability.current_cooldown_rounds),
        'character_ability_id', v_armed_action_id,
        'cooldown_rounds_left', v_armed_ability.current_cooldown_rounds
      );
    end if;

    if coalesce(v_armed_ability.target_type, 'none') not in ('character', 'body_part') then
      return jsonb_build_object(
        'ok', false,
        'error', 'TARGET_REQUIREMENT_NOT_MET',
        'message', format('%s cannot be aimed at a weapon-attack target.', v_armed_ability.ability_name),
        'character_ability_id', v_armed_action_id
      );
    end if;

    -- Requirements.weaponClass/weaponId have no canonical source yet (see
    -- audit §2/§4) — the one real, existing field is the technique's own
    -- attack_type (ranged/melee), checked only when the client actually sends
    -- one. If the client never sends attack_type this check is a no-op —
    -- documented in the audit rather than papered over with an invented
    -- weapon lookup.
    if v_armed_ability.attack_type is not null
       and v_armed_payload_attack_type is not null
       and v_armed_ability.attack_type <> v_armed_payload_attack_type then
      return jsonb_build_object(
        'ok', false,
        'error', 'WEAPON_REQUIREMENT_NOT_MET',
        'message', format('%s requires a %s attack.', v_armed_ability.ability_name, v_armed_ability.attack_type),
        'character_ability_id', v_armed_action_id
      );
    end if;

    v_armed_effective_level := public.odyssey_get_character_ability_effective_level(v_armed_action_id);

    select *
    into v_armed_level
    from public.odyssey_ability_level_defs level_data
    where level_data.ability_def_id = v_armed_ability.ability_def_id
      and level_data.ability_level <= v_armed_effective_level
    order by level_data.ability_level desc
    limit 1;

    if not found then
      return jsonb_build_object(
        'ok', false,
        'error', 'ARMED_ACTION_INVALID',
        'message', 'No level data is available for this attack technique.',
        'character_ability_id', v_armed_action_id
      );
    end if;

    -- Scope for 4.1A: only the additive accuracy bonus is supported on the
    -- weapon-attack path (see migration header). A damage/armor effect is
    -- rejected honestly rather than silently dropped.
    if coalesce(v_armed_level.attack_damage_bonus, 0) <> 0
       or coalesce(v_armed_level.attack_armor_pierce, 0) <> 0
       or coalesce(v_armed_level.ignore_armor, false) then
      return jsonb_build_object(
        'ok', false,
        'error', 'ACTION_EFFECT_NOT_IMPLEMENTED',
        'message', format('%s has a damage/armor effect not yet supported for weapon attacks.', v_armed_ability.ability_name),
        'character_ability_id', v_armed_action_id
      );
    end if;

    if v_armed_ability.resource_mode = 'pool' then
      select coalesce(p.current_value, 0)
      into v_armed_pool_current
      from public.odyssey_character_resource_pools p
      join public.odyssey_resource_pool_defs d on d.id = p.resource_pool_def_id
      where p.character_id = v_armed_ability.character_id
        and d.code = v_armed_ability.resource_pool_code
      for update of p;

      if coalesce(v_armed_pool_current, 0) < coalesce(v_armed_level.resource_cost, 0) then
        return jsonb_build_object(
          'ok', false,
          'error', 'NOT_ENOUGH_PSI',
          'message', format('Not enough %s for %s.', coalesce(v_armed_ability.resource_pool_code, 'resource'), v_armed_ability.ability_name),
          'character_ability_id', v_armed_action_id,
          'required', coalesce(v_armed_level.resource_cost, 0),
          'available', coalesce(v_armed_pool_current, 0)
        );
      end if;
    elsif v_armed_ability.resource_mode = 'item' and v_armed_ability.current_charges is not null then
      -- current_charges is the same field the quickbar already displays as
      -- costs.charges (migration 92) — this check agrees with what the
      -- player already sees, even though the deeper consume function's own
      -- item-resource branch spends from inventory rather than this counter
      -- (a pre-existing Phase 4.0 nuance, documented in the audit).
      if coalesce(v_armed_ability.current_charges, 0) <= 0 then
        return jsonb_build_object(
          'ok', false,
          'error', 'NOT_ENOUGH_CHARGES',
          'message', format('%s has no charges left.', v_armed_ability.ability_name),
          'character_ability_id', v_armed_action_id
        );
      end if;
    end if;

    v_armed_technique_bonus := coalesce(v_armed_level.attack_accuracy_bonus, 0);
    v_armed_cooldown_before := coalesce(v_armed_ability.current_cooldown_rounds, 0);
  end if;

  v_stage_started_at := clock_timestamp();

  if v_attacker_character_id is not null and v_character_weapon_id is not null then
    v_lock_state := public.odyssey_get_weapon_lock_state(v_attacker_character_id, v_character_weapon_id);
    if coalesce((v_lock_state->>'locked')::boolean, false)
       or coalesce((v_lock_state->>'actor_attack_locked')::boolean, false) then
      return jsonb_build_object(
        'ok', false,
        'error', coalesce(v_lock_state->>'error', 'WEAPON_LOCKED'),
        'message', coalesce(v_lock_state->>'message', 'Weapon is currently locked.'),
        'character_weapon_id', v_character_weapon_id
      );
    end if;

    v_perk_context_result := public.odyssey_get_character_attack_perk_context(
      v_attacker_character_id,
      v_character_weapon_id,
      v_target_character_id,
      v_target_body_part_id,
      v_distance_m,
      nullif(trim(coalesce(v_payload->>'fire_mode_code', '')), ''),
      nullif(trim(coalesce(v_payload->>'attack_type', '')), ''),
      v_encounter_id
    );

    if coalesce((v_perk_context_result->>'ok')::boolean, false) = false then
      return v_perk_context_result;
    end if;
  end if;

  v_weapon_validation_ms := extract(epoch from (clock_timestamp() - v_stage_started_at)) * 1000.0;

  v_attack_context := case
    when jsonb_typeof(v_payload->'attack_context') = 'object' then v_payload->'attack_context'
    else '{}'::jsonb
  end;
  v_existing_bonus := coalesce(nullif(trim(coalesce(v_attack_context->>'manual_attack_bonus', '')), '')::integer, 0);
  v_perk_bonus := coalesce(nullif(trim(coalesce(v_perk_context_result->>'attack_accuracy_bonus', '')), '')::integer, 0);

  if v_perk_bonus <> 0 or v_armed_technique_bonus <> 0 then
    v_attack_context := v_attack_context || jsonb_build_object('manual_attack_bonus', v_existing_bonus + v_perk_bonus + v_armed_technique_bonus);
    v_payload := v_payload || jsonb_build_object('attack_context', v_attack_context);
  end if;

  v_payload := v_payload || jsonb_build_object('perk_context', v_perk_context_result - 'ok');

  v_stage_started_at := clock_timestamp();
  v_result := public.odyssey_perform_weapon_attack(v_payload);
  v_damage_apply_ms := extract(epoch from (clock_timestamp() - v_stage_started_at)) * 1000.0;

  if coalesce((v_result->>'ok')::boolean, false) = false then
    return v_result;
  end if;

  -- Phase 3E.0: a RESOLVED attack (hit AND miss identically) spends MAIN (or
  -- the reaction action) atomically with the encounter version bump. Failed /
  -- rejected attacks returned above spend nothing.
  if v_participation is not null then
    perform public.odyssey_apply_turn_costs(
      public.odyssey_try_parse_uuid(v_participation->>'entry_id'),
      1,
      0,
      v_session_use_reaction
    );
    perform public.odyssey_increment_encounter_state_version(
      public.odyssey_try_parse_uuid(v_participation->>'encounter_id')
    );
  end if;

  -- Phase 4.1A: the armed technique is consumed ONLY now that the attack is
  -- resolved (hit or miss both count, exactly like MAIN above). Reuses
  -- odyssey_consume_character_ability_cost verbatim — the same function the
  -- ability-cast path already uses — so there is only ever one PSI/charge
  -- consumption implementation. A resource-consume failure here (extremely
  -- unlikely — the pool row was already locked and checked above in the same
  -- transaction) is recorded on the armed_actions entry rather than failing
  -- the already-resolved attack; nothing else in this function rolls back a
  -- resolved weapon attack for any reason, and this is no exception.
  if v_armed_action_id is not null then
    v_armed_cost_result := public.odyssey_consume_character_ability_cost(v_armed_action_id);
    v_armed_cooldown_after := v_armed_cooldown_before;

    if coalesce((v_armed_cost_result->>'ok')::boolean, false) then
      if coalesce(v_armed_level.cooldown_rounds, 0) > 0 then
        update public.odyssey_character_abilities
        set current_cooldown_rounds = v_armed_level.cooldown_rounds
        where id = v_armed_action_id;
        v_armed_cooldown_after := v_armed_level.cooldown_rounds;
      end if;

      v_armed_results := jsonb_build_array(
        jsonb_build_object(
          'characterActionId', v_armed_action_id,
          'name', v_armed_ability.ability_name,
          'stackGroup', null,
          'validated', true,
          'applied', true,
          'costsConsumed', v_armed_cost_result,
          'cooldownBefore', v_armed_cooldown_before,
          'cooldownAfter', v_armed_cooldown_after,
          'reason', null
        )
      );
    else
      v_armed_results := jsonb_build_array(
        jsonb_build_object(
          'characterActionId', v_armed_action_id,
          'name', v_armed_ability.ability_name,
          'stackGroup', null,
          'validated', true,
          'applied', false,
          'costsConsumed', null,
          'cooldownBefore', v_armed_cooldown_before,
          'cooldownAfter', v_armed_cooldown_before,
          'reason', coalesce(v_armed_cost_result->>'error', 'ARMED_ACTION_INVALID')
        )
      );
    end if;
  end if;

  if jsonb_array_length(coalesce(v_perk_context_result->'consume_effect_ids', '[]'::jsonb)) > 0 then
    update public.odyssey_character_effects e
    set
      is_active = false,
      rounds_left = 0,
      updated_at = timezone('utc', now())
    where e.character_id = v_attacker_character_id
      and e.id in (
        select public.odyssey_try_parse_uuid(value)
        from jsonb_array_elements_text(coalesce(v_perk_context_result->'consume_effect_ids', '[]'::jsonb)) value
      );
    v_refresh_attacker := true;
  end if;

  if v_target_character_id is not null then
    v_target_alive_after := coalesce(
      nullif(v_result#>>'{target_state,is_alive}', '')::boolean,
      nullif(v_result#>>'{target_state,combat_state,is_alive}', '')::boolean,
      v_target_alive_before
    );
  end if;

  v_stage_started_at := clock_timestamp();
  v_post_hooks := public.odyssey_apply_perk_post_attack_hooks(
    jsonb_build_object(
      'attacker_character_id', v_attacker_character_id,
      'character_weapon_id', v_character_weapon_id,
      'target_character_id', v_target_character_id,
      'target_movement_version', v_target_movement_version,
      'created_by', coalesce(v_payload->>'actor_token_id', ''),
      'hit', coalesce(v_result->>'hit', 'false'),
      'target_alive_before', v_target_alive_before,
      'target_alive_after', v_target_alive_after
    )
  );
  v_perk_hooks_ms := extract(epoch from (clock_timestamp() - v_stage_started_at)) * 1000.0;

  if not coalesce((v_result->>'hit')::boolean, false) then
    v_retry_effect := public.odyssey_grant_first_time_no_retry_effect(
      v_attacker_character_id,
      v_character_weapon_id,
      v_target_character_id,
      v_target_movement_version,
      coalesce(v_payload->>'actor_token_id', '')
    );
    if coalesce((v_retry_effect->>'applied')::boolean, false) = true then
      v_refresh_attacker := true;
    end if;
  end if;

  if jsonb_array_length(coalesce(v_result->'expired_attack_effects', '[]'::jsonb)) > 0 then
    v_refresh_attacker := true;
  end if;

  if coalesce((v_post_hooks->>'attacker_changed')::boolean, false) then
    v_refresh_attacker := true;
  end if;

  if v_armed_action_id is not null then
    v_refresh_attacker := true;
  end if;

  v_refresh_target :=
    coalesce((v_post_hooks->>'target_changed')::boolean, false)
    or coalesce(nullif(jsonb_extract_path_text(v_result, 'damage', 'body_minor_delta'), '')::integer, 0) > 0
    or coalesce(nullif(jsonb_extract_path_text(v_result, 'damage', 'body_serious_delta'), '')::integer, 0) > 0
    or coalesce(nullif(jsonb_extract_path_text(v_result, 'damage', 'body_critical_delta'), '')::integer, 0) > 0
    or coalesce(nullif(jsonb_extract_path_text(v_result, 'damage', 'armor_minor_delta'), '')::integer, 0) > 0
    or coalesce(nullif(jsonb_extract_path_text(v_result, 'damage', 'armor_serious_delta'), '')::integer, 0) > 0
    or coalesce(nullif(jsonb_extract_path_text(v_result, 'damage', 'armor_critical_delta'), '')::integer, 0) > 0;

  v_result := v_result || jsonb_build_object(
    'post_attack_perks',
      jsonb_build_object(
        'consumed_effect_ids', coalesce(v_perk_context_result->'consume_effect_ids', '[]'::jsonb),
        'retry_effect', v_retry_effect,
        'post_hooks', v_post_hooks
      ),
    'armed_actions', v_armed_results
  );

  v_stage_started_at := clock_timestamp();
  v_finalized := public.odyssey_finalize_attack_result(v_result, v_target_character_id, v_target_body_part_id);
  v_finalize_result_ms := extract(epoch from (clock_timestamp() - v_stage_started_at)) * 1000.0;

  if v_refresh_target and v_target_character_id is not null then
    v_stage_started_at := clock_timestamp();
    v_target_refresh_result := public.odyssey_refresh_character_combat_state(v_target_character_id);
    v_final_refresh_target_ms := extract(epoch from (clock_timestamp() - v_stage_started_at)) * 1000.0;
    v_finalized := v_finalized || jsonb_build_object(
      'target_state',
      coalesce(v_target_refresh_result->'combat_state', '{}'::jsonb)
    );
  end if;

  if v_refresh_attacker and v_attacker_character_id is not null then
    v_stage_started_at := clock_timestamp();
    v_attacker_refresh_result := public.odyssey_refresh_character_combat_state(v_attacker_character_id);
    v_final_refresh_attacker_ms := extract(epoch from (clock_timestamp() - v_stage_started_at)) * 1000.0;
    v_finalized := v_finalized || jsonb_build_object(
      'attacker_state',
      coalesce(v_attacker_refresh_result->'combat_state', '{}'::jsonb)
    );
  end if;

  if v_participation is not null then
    v_finalized := v_finalized || jsonb_build_object(
      'combat_session',
      public.odyssey_build_session_cost_summary(v_participation, v_session_use_reaction)
    );
  end if;

  if v_debug then
    v_finalized := v_finalized || jsonb_build_object(
      'diagnostics',
      jsonb_build_object(
        'total_ms', extract(epoch from (clock_timestamp() - v_started_at)) * 1000.0,
        'stages',
        jsonb_build_object(
          'weapon_validation_ms', v_weapon_validation_ms,
          'attacker_state_ms', 0,
          'target_state_ms', 0,
          'damage_apply_ms', v_damage_apply_ms,
          'perk_hooks_ms', v_perk_hooks_ms,
          'final_refresh_attacker_ms', v_final_refresh_attacker_ms,
          'final_refresh_target_ms', v_final_refresh_target_ms,
          'finalize_result_ms', v_finalize_result_ms
        )
      )
    );
  end if;

  return v_finalized;
end;
$$;

grant execute on function public.perform_attack(jsonb) to anon, authenticated;

-- ===== END 108_direct_ability_attack_session_gate.sql =====
