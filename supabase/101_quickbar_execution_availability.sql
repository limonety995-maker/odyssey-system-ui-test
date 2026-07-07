-- Odyssey System: Phase 4.1A.2 — Skills Block Runtime States & Ability
-- Details (server).
--
-- Redefines odyssey_get_character_quick_actions_runtime (migration 92 —
-- fully reissued each time, never hot-patched, safe to redefine again) to
-- close two honesty gaps found in docs/PHASE_4_1A_2_SKILLS_RUNTIME_UI_AUDIT.md:
--
-- 1. `state.available`/`state.disabledReason` never factored in cooldown or
--    resource (PSI/charges) sufficiency — only is_enabled/skip_turn/alive.
--    A technique on cooldown or lacking PSI reported `available: true`, so
--    the client had no honest way to grey it out or refuse to arm it without
--    re-deriving the check itself (exactly the "client guesses" anti-pattern
--    Phase 4.1A.2 forbids).
--
-- 2. No field told the client whether a technique's own EFFECT is actually
--    executable on the current weapon-attack path. perform_attack (migration
--    100) rejects a technique with a nonzero attack_damage_bonus/
--    attack_armor_pierce/ignore_armor as ACTION_EFFECT_NOT_IMPLEMENTED, but
--    the quickbar runtime never surfaced that ahead of time — a HUD wanting
--    to warn the player before Attack would have had to hardcode a check on
--    the ability's name (e.g. "Ethric Strike"), which is explicitly what
--    this phase must NOT do. The new `executionAvailable`/`executionReason`
--    fields are computed from the EXACT SAME odyssey_ability_level_defs
--    columns migration 100 already checks (`ald` was already joined here for
--    cost/cooldown display) — one shared definition of "unsupported effect",
--    never a second client-side copy.
--
-- Everything else in this function (field shapes, join structure, the
-- pre-existing ald-at-learned_level imprecision noted in the audit doc) is
-- unchanged.

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
  -- Validate character exists.
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

  -- Check character state eligibility. Alive/conscious live on the combat-state
  -- table (odyssey_character_combat_state), NOT on odyssey_characters; a character
  -- with no combat-state row yet is treated as alive + conscious (defaults).
  select coalesce(cs.is_alive, true), coalesce(cs.is_conscious, true)
  into v_is_alive, v_is_conscious
  from public.odyssey_characters c
  left join public.odyssey_character_combat_state cs on cs.character_id = c.id
  where c.id = p_character_id;

  -- Check for a skip_turn effect via the canonical engine helper (reads the
  -- effect's data.flags.skip_turn — the same source the turn engine uses).
  v_has_skip_turn_effect := public.odyssey_character_has_active_effect_flag(p_character_id, 'skip_turn');

  -- Fetch quickbar layout and version (qualified — see the save function for why).
  select t.layout, t.version into v_layout, v_version
  from public.odyssey_character_quickbar_layouts t
  where t.character_id = p_character_id;

  v_layout := coalesce(v_layout, jsonb_build_object('slots', '[]'::jsonb));
  -- No saved layout yet -> version 0, matching odyssey_save_character_quickbar_layout's
  -- own "no row" default. A client that reads version 0 here and saves with
  -- expected_version=0 must succeed (first insert bumps it to 1) — these two
  -- functions must never disagree on what "nothing saved yet" means.
  v_version := coalesce(v_version, 0);

  -- Build quick-actions list from odyssey_character_abilities.
  -- Disabled reasons are server-determined, never fabricated.
  v_quick_actions := coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'characterActionId', ca.id,
          'definitionId', ca.ability_def_id,
          'sourceType', ad.source_type,
          -- Canonical action type (one of attack_technique|directed|instant|toggle),
          -- derived from the definition. activation_type ('manual') is NOT the type.
          -- Toggle has no schema marker yet → deferred to Phase 4.1 (data convention).
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

          -- Phase 4.1A.2: available/disabledReason now factor in cooldown and
          -- resource sufficiency (previously display-only via disabledReason's
          -- cooldown text — never part of `available` itself), plus the new
          -- unsupported-effect check. exec.unsupported_effect and
          -- res.insufficient_* are computed once per row (LEFT JOIN LATERAL
          -- below) and reused here rather than repeating the expressions.
          'state', jsonb_build_object(
            'available',
              ca.is_enabled
              and not v_has_skip_turn_effect
              and (v_is_alive or ad.target_type = 'none')
              and coalesce(ca.current_cooldown_rounds, 0) <= 0
              and not coalesce(res.insufficient_pool, false)
              and not coalesce(res.insufficient_charges, false)
              and not coalesce(exec.unsupported_effect, false),
            'active', false, -- Phase 4.1
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
            -- Distinct from `available`: whether this ability's OWN effect can
            -- run on the current execution path at all, independent of
            -- cooldown/resources/turn state. Reuses the exact same
            -- odyssey_ability_level_defs columns perform_attack (migration
            -- 100) checks — one shared definition, never a client-side guess
            -- or a name-based check.
            'executionAvailable', not coalesce(exec.unsupported_effect, false),
            'executionReason', case when coalesce(exec.unsupported_effect, false) then 'ACTION_EFFECT_NOT_IMPLEMENTED' else null end,
            -- Structural signal so the client can tell "insufficient resource"
            -- apart from any other reason WITHOUT parsing disabledReason text.
            'resourceSufficient', not (coalesce(res.insufficient_pool, false) or coalesce(res.insufficient_charges, false))
          ),

          'requirements', jsonb_build_object(
            'weaponClass', null, -- Phase 4.1: weapon-linked actions
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
  -- Character's PSI (or other pool) balance, when this ability spends one —
  -- (character_id, resource_pool_def_id) is at most one row, same assumption
  -- migration 100's odyssey_consume_character_ability_cost call site makes.
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

comment on function public.odyssey_get_character_quick_actions_runtime is
  'Fetch full quick-actions runtime for a character, including quickbar layout. '
  'Returns only eligible actions (manual, non-passive, enabled, not-hidden). '
  'available/disabledReason/executionAvailable/executionReason are all '
  'server-determined (cooldown, resource sufficiency, and effect-grammar '
  'support) — Phase 4.1A.2. Layout has version for optimistic locking.';

grant execute on function public.odyssey_get_character_quick_actions_runtime(uuid) to anon, authenticated;
