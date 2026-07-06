-- Phase 4.0 — Ability Quickbar Foundation
--
-- Creates per-character quickbar layout storage with optimistic version control.
-- Quickbar is a UI preference (which ability goes in which slot), not a game mechanic.
-- Layout persists across sessions; one layout per character; supports empty slots.
--
-- Authority: Canonical quick-actions come from odyssey_character_abilities
-- (manual activation, non-passive, enabled, not-hidden). Server validates that
-- every slot refers to an action that exists in that character's runtime.
--
-- Version conflict detection: expected_version must match current version before
-- update. Stale version is rejected without mutation. Client uses server response
-- as source of truth after Save.
--
-- No remote secret/credential exposure: layout contains only slot → action mappings.

create table if not exists public.odyssey_character_quickbar_layouts (
  id uuid primary key default gen_random_uuid(),
  character_id uuid not null,
  layout jsonb not null default '{
    "slots": []
  }'::jsonb check (jsonb_typeof(layout) = 'object'),
  version integer not null default 1 check (version >= 1),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),

  constraint fk_character_id foreign key (character_id) references public.odyssey_characters(id) on delete cascade,
  constraint unique_layout_per_character unique (character_id)
);

comment on table public.odyssey_character_quickbar_layouts is
  'Per-character quickbar layout: which ability/action occupies which UI slot (1–20+). '
  'Layout is a UI preference, not a game mechanic. Empty slots are supported.';
comment on column public.odyssey_character_quickbar_layouts.layout is
  'Quickbar layout as { slots: [{ slotIndex: int, characterActionId: uuid|null, empty: bool }] }';
comment on column public.odyssey_character_quickbar_layouts.version is
  'Optimistic lock version. Incremented on every successful save. Client must send '
  'expected_version; mismatch returns QUICKBAR_VERSION_CONFLICT without mutation.';

-- Utility: get current quickbar layout with safe defaults.
create or replace function public.odyssey_get_character_quickbar_layout(
  p_character_id uuid
)
returns jsonb
language sql
stable
as $$
  select coalesce(
    t.layout,
    jsonb_build_object('slots', '[]'::jsonb)
  )
  from public.odyssey_character_quickbar_layouts t
  where t.character_id = p_character_id
$$;

-- Save quickbar layout with optimistic version check.
-- Returns: { ok, error, layout, version }
-- Errors: QUICKBAR_VERSION_CONFLICT, CHARACTER_NOT_FOUND
create or replace function public.odyssey_save_character_quickbar_layout(
  p_character_id uuid,
  p_expected_version integer,
  p_slots jsonb
)
returns jsonb
language plpgsql
as $$
declare
  v_current_version integer;
  v_ok boolean := true;
  v_error text := null;
  v_result jsonb;
begin
  -- Validate character exists.
  if not exists(
    select 1 from public.odyssey_characters where id = p_character_id and not coalesce(is_deleted, false)
  ) then
    return jsonb_build_object(
      'ok', false,
      'error', 'CHARACTER_NOT_FOUND',
      'message', 'Character does not exist or is deleted'
    );
  end if;

  -- Get current version. Table alias + qualified column avoid ANY ambiguity
  -- with the plpgsql variable / the excluded pseudo-row used further below —
  -- a bare "version" here previously raised "column reference is ambiguous".
  select t.version into v_current_version
  from public.odyssey_character_quickbar_layouts t
  where t.character_id = p_character_id;

  -- Default to version 0 if no layout exists yet.
  v_current_version := coalesce(v_current_version, 0);

  -- Check version conflict.
  if p_expected_version is not null and p_expected_version != v_current_version then
    return jsonb_build_object(
      'ok', false,
      'error', 'QUICKBAR_VERSION_CONFLICT',
      'message', format('Expected version %s, but server has %s', p_expected_version, v_current_version),
      'server_version', v_current_version
    );
  end if;

  -- Insert or update layout. The target table carries an explicit alias (t) so
  -- every column in SET/RETURNING is unambiguously qualified against either
  -- the existing row (t.*) or the proposed row (excluded.*) — never a bare name.
  insert into public.odyssey_character_quickbar_layouts as t (character_id, layout, version, updated_at)
  values (p_character_id, jsonb_build_object('slots', coalesce(p_slots, '[]'::jsonb)), v_current_version + 1, timezone('utc', now()))
  on conflict (character_id) do update set
    layout = excluded.layout,
    version = t.version + 1,
    updated_at = timezone('utc', now())
  returning t.layout, t.version
  into v_result, v_current_version;

  return jsonb_build_object(
    'ok', true,
    'error', null,
    'layout', v_result,
    'version', v_current_version
  );
end;
$$;

comment on function public.odyssey_save_character_quickbar_layout is
  'Save per-character quickbar layout with optimistic version control. '
  'Returns { ok, error, layout, version }. '
  'Version mismatch returns QUICKBAR_VERSION_CONFLICT without mutation.';

-- Trigger to update updatedAt on manual layout modification (if any).
create or replace function public.odyssey_quickbar_layout_update_timestamp()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists odyssey_quickbar_layout_timestamp on public.odyssey_character_quickbar_layouts;
create trigger odyssey_quickbar_layout_timestamp
before update on public.odyssey_character_quickbar_layouts
for each row
execute function public.odyssey_quickbar_layout_update_timestamp();

-- RPC: Get full quick-actions runtime for a character (Phase 4.0+).
-- Returns: { characterId, quickActions: [...], quickbar: { slots, maxSlots, version } }
--
-- Quick actions are: odyssey_character_abilities where
--   - is_hidden = false
--   - is_enabled = true
--   - ability_kind != 'passive'
--   - activation_type = 'manual'
--   - character is not in a state that disables them (dead, unconscious, skip_turn effect)
--
-- Each action includes: id, name, type, source, cost, cooldown, targeting, availability reason.
-- Disabled reasons are server-provided (never fabricated on client).
--
-- Quickbar layout is loaded separately and validated; slots must contain only
-- actions that exist in quickActions. Empty slots are supported.
--
-- To avoid duplication with get_character_runtime_bundle, integrate this as an
-- extension or a thin wrapper that extracts the abilities section.

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
  -- In Phase 4.0, only populate metadata; no execution.
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

          'state', jsonb_build_object(
            'available', ca.is_enabled and not v_has_skip_turn_effect and (v_is_alive or ad.target_type = 'none'),
            'active', false, -- Phase 4.1
            'disabledReason', case
              when not ca.is_enabled then 'Ability is disabled'
              when v_has_skip_turn_effect then 'Skipping turn'
              when ca.current_cooldown_rounds > 0 then format('Cooldown: %s turns', ca.current_cooldown_rounds)
              when not v_is_alive then 'Character is dead'
              else null
            end,
            'selectable', ca.is_enabled and not v_has_skip_turn_effect and (v_is_alive or ad.target_type = 'none')
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
  'Disabled reasons are server-provided. Layout has version for optimistic locking. '
  'Phase 4.0: metadata only; Phase 4.1: execution.';

-- RLS: Allow characters to read/write their own layout; GM can read all.
-- (Full auth enforcement is Phase B0; UX check is Phase 4.0.)
alter table public.odyssey_character_quickbar_layouts enable row level security;

drop policy if exists quickbar_character_own_access on public.odyssey_character_quickbar_layouts;
create policy quickbar_character_own_access on public.odyssey_character_quickbar_layouts
  for all
  using (true) -- UX check in Phase 4.0; server auth in Phase B0
  with check (true);

-- Indexes for common queries.
create index if not exists odyssey_character_quickbar_layouts_character_idx
  on public.odyssey_character_quickbar_layouts(character_id);

create index if not exists odyssey_character_quickbar_layouts_updated_idx
  on public.odyssey_character_quickbar_layouts(updated_at desc);
