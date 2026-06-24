-- Odyssey System: Combat HUD backend foundation
-- Stage 63: ownership helpers, encounter/log schema extensions, usage states, quickbar,
--           token link control visibility, runtime read-model preparation.

alter table public.odyssey_combat_encounters
  add column if not exists state_version integer not null default 0,
  add column if not exists action_default integer not null default 1,
  add column if not exists move_default integer not null default 1,
  add column if not exists started_at timestamptz not null default timezone('utc', now()),
  add column if not exists last_transition_at timestamptz not null default timezone('utc', now());

alter table public.odyssey_initiative_entries
  add column if not exists action_max integer not null default 1,
  add column if not exists action_current integer not null default 1,
  add column if not exists move_max integer not null default 1,
  add column if not exists move_current integer not null default 1,
  add column if not exists reaction_action_max integer not null default 0,
  add column if not exists reaction_action_current integer not null default 0,
  add column if not exists action_converted_to_move boolean not null default false,
  add column if not exists hide_from_initiative_ui boolean not null default false,
  add column if not exists joined_round integer not null default 1,
  add column if not exists movement_version integer not null default 0,
  add column if not exists removed_at timestamptz null,
  add column if not exists removed_reason text null,
  add column if not exists turn_version integer not null default 0,
  add column if not exists last_turn_started_at timestamptz null;

alter table public.odyssey_combat_log
  add column if not exists visibility text not null default 'public',
  add column if not exists owner_character_id uuid null references public.odyssey_characters(id) on delete set null,
  add column if not exists public_data jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'odyssey_combat_log_visibility_check'
  ) then
    alter table public.odyssey_combat_log
      add constraint odyssey_combat_log_visibility_check
      check (visibility in ('public', 'owner_only', 'gm_only'));
  end if;
end;
$$;

alter table public.odyssey_character_weapons
  add column if not exists data jsonb not null default '{}'::jsonb,
  add column if not exists equipped_slot text null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'odyssey_character_weapons_equipped_slot_check'
  ) then
    alter table public.odyssey_character_weapons
      add constraint odyssey_character_weapons_equipped_slot_check
      check (equipped_slot in ('primary', 'secondary') or equipped_slot is null);
  end if;
end;
$$;

create unique index if not exists odyssey_active_encounter_scene_unique
  on public.odyssey_combat_encounters (campaign_id, room_id, scene_id)
  where status = 'active' and ended_at is null;

create index if not exists odyssey_initiative_entries_encounter_active_order_idx
  on public.odyssey_initiative_entries (encounter_id, is_active, order_index);

create index if not exists odyssey_initiative_entries_encounter_character_idx
  on public.odyssey_initiative_entries (encounter_id, character_id);

create index if not exists odyssey_combat_log_encounter_created_idx
  on public.odyssey_combat_log (encounter_id, created_at desc);

create index if not exists odyssey_combat_log_encounter_visibility_created_idx
  on public.odyssey_combat_log (encounter_id, visibility, created_at desc);

create unique index if not exists odyssey_character_weapons_primary_slot_unique
  on public.odyssey_character_weapons (character_id, equipped_slot)
  where equipped_slot = 'primary';

create unique index if not exists odyssey_character_weapons_secondary_slot_unique
  on public.odyssey_character_weapons (character_id, equipped_slot)
  where equipped_slot = 'secondary';

create table if not exists public.odyssey_combat_usage_states (
  id uuid primary key default gen_random_uuid(),
  encounter_id uuid not null references public.odyssey_combat_encounters(id) on delete cascade,
  character_id uuid not null references public.odyssey_characters(id) on delete cascade,
  source_type text not null,
  source_code text not null,
  use_count integer not null default 0,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'odyssey_combat_usage_states_encounter_character_source_key'
  ) then
    alter table public.odyssey_combat_usage_states
      add constraint odyssey_combat_usage_states_encounter_character_source_key
      unique (encounter_id, character_id, source_type, source_code);
  end if;
end;
$$;

create index if not exists odyssey_combat_usage_states_encounter_idx
  on public.odyssey_combat_usage_states (encounter_id, character_id, source_type);

drop trigger if exists odyssey_touch_updated_at_combat_usage_states on public.odyssey_combat_usage_states;
create trigger odyssey_touch_updated_at_combat_usage_states
before update on public.odyssey_combat_usage_states
for each row
execute function public.odyssey_touch_updated_at();

create table if not exists public.odyssey_character_quickbar_slots (
  id uuid primary key default gen_random_uuid(),
  character_id uuid not null references public.odyssey_characters(id) on delete cascade,
  slot_index integer not null,
  action_type text not null,
  action_id uuid null,
  action_code text null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'odyssey_character_quickbar_slots_action_type_check'
  ) then
    alter table public.odyssey_character_quickbar_slots
      add constraint odyssey_character_quickbar_slots_action_type_check
      check (action_type in ('ability', 'perk', 'item', 'weapon_feature'));
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'odyssey_character_quickbar_slots_character_slot_key'
  ) then
    alter table public.odyssey_character_quickbar_slots
      add constraint odyssey_character_quickbar_slots_character_slot_key
      unique (character_id, slot_index);
  end if;
end;
$$;

create index if not exists odyssey_character_quickbar_slots_character_idx
  on public.odyssey_character_quickbar_slots (character_id, slot_index);

drop trigger if exists odyssey_touch_updated_at_quickbar_slots on public.odyssey_character_quickbar_slots;
create trigger odyssey_touch_updated_at_quickbar_slots
before update on public.odyssey_character_quickbar_slots
for each row
execute function public.odyssey_touch_updated_at();

create or replace function public.odyssey_character_display_name(
  p_character_id uuid
)
returns text
language sql
stable
as $$
  select coalesce(
    nullif(trim(c.resources->>'name'), ''),
    nullif(trim(c.owner_player_name), ''),
    c.character_key
  )
  from public.odyssey_characters c
  where c.id = p_character_id
  limit 1
$$;

create or replace function public.odyssey_can_control_character(
  p_character_id uuid,
  p_actor_player_id text default null,
  p_actor_is_gm boolean default false
)
returns jsonb
language plpgsql
stable
as $$
declare
  v_character public.odyssey_characters%rowtype;
  v_actor_player_id text := coalesce(nullif(trim(coalesce(p_actor_player_id, '')), ''), '');
  v_actor_is_gm boolean := coalesce(p_actor_is_gm, false);
begin
  if p_character_id is null then
    return jsonb_build_object(
      'allowed', false,
      'control_mode', 'denied',
      'reason', 'CHARACTER_NOT_FOUND'
    );
  end if;

  select *
  into v_character
  from public.odyssey_characters c
  where c.id = p_character_id
    and coalesce(c.is_deleted, false) = false;

  if not found then
    return jsonb_build_object(
      'allowed', false,
      'control_mode', 'denied',
      'reason', 'CHARACTER_NOT_FOUND'
    );
  end if;

  if v_actor_is_gm then
    return jsonb_build_object(
      'allowed', true,
      'control_mode', 'gm',
      'reason', 'gm'
    );
  end if;

  if v_actor_player_id <> ''
     and nullif(trim(coalesce(v_character.owner_player_id, '')), '') = v_actor_player_id then
    return jsonb_build_object(
      'allowed', true,
      'control_mode', 'owner',
      'reason', 'owner'
    );
  end if;

  return jsonb_build_object(
    'allowed', false,
    'control_mode', 'denied',
    'reason', 'CONTROL_DENIED'
  );
end;
$$;

create or replace function public.assign_character_owner(
  p_payload jsonb
)
returns jsonb
language plpgsql
as $$
declare
  v_character_id uuid := public.odyssey_try_parse_uuid(p_payload->>'character_id');
  v_owner_player_id text := coalesce(nullif(trim(coalesce(p_payload->>'owner_player_id', '')), ''), '');
  v_owner_player_name text := coalesce(nullif(trim(coalesce(p_payload->>'owner_player_name', '')), ''), '');
  v_actor_is_gm boolean := coalesce(nullif(trim(coalesce(p_payload->>'actor_is_gm', '')), '')::boolean, false);
  v_character public.odyssey_characters%rowtype;
begin
  if not v_actor_is_gm then
    return jsonb_build_object(
      'ok', false,
      'error', 'CONTROL_DENIED',
      'message', 'Only the GM may assign character ownership.'
    );
  end if;

  if v_character_id is null then
    return jsonb_build_object(
      'ok', false,
      'error', 'CHARACTER_NOT_FOUND',
      'message', 'character_id is required.'
    );
  end if;

  update public.odyssey_characters c
  set
    owner_player_id = v_owner_player_id,
    owner_player_name = v_owner_player_name
  where c.id = v_character_id
    and coalesce(c.is_deleted, false) = false
  returning * into v_character;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'error', 'CHARACTER_NOT_FOUND',
      'message', 'Character was not found.'
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'character',
      jsonb_build_object(
        'id', v_character.id,
        'character_key', v_character.character_key,
        'owner_player_id', v_character.owner_player_id,
        'owner_player_name', v_character.owner_player_name
      )
  );
end;
$$;

create or replace function public.clear_character_owner(
  p_payload jsonb
)
returns jsonb
language plpgsql
as $$
declare
  v_character_id uuid := public.odyssey_try_parse_uuid(p_payload->>'character_id');
  v_actor_is_gm boolean := coalesce(nullif(trim(coalesce(p_payload->>'actor_is_gm', '')), '')::boolean, false);
begin
  if not v_actor_is_gm then
    return jsonb_build_object(
      'ok', false,
      'error', 'CONTROL_DENIED',
      'message', 'Only the GM may clear character ownership.'
    );
  end if;

  return public.assign_character_owner(
    jsonb_build_object(
      'character_id', v_character_id,
      'owner_player_id', '',
      'owner_player_name', '',
      'actor_is_gm', true
    )
  );
end;
$$;

create or replace function public.get_character_quickbar(
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
stable
as $$
declare
  v_character_id uuid := public.odyssey_try_parse_uuid(p_payload->>'character_id');
  v_control jsonb := '{}'::jsonb;
  v_slots jsonb := '[]'::jsonb;
begin
  if v_character_id is null then
    return jsonb_build_object(
      'ok', false,
      'error', 'CHARACTER_NOT_FOUND',
      'message', 'character_id is required.'
    );
  end if;

  v_control := public.odyssey_can_control_character(
    v_character_id,
    p_payload->>'actor_player_id',
    coalesce(nullif(trim(coalesce(p_payload->>'actor_is_gm', '')), '')::boolean, false)
  );

  if coalesce((v_control->>'allowed')::boolean, false) = false then
    return jsonb_build_object(
      'ok', false,
      'error', 'CONTROL_DENIED',
      'message', 'You cannot view this quickbar.'
    );
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', q.id,
        'slot_index', q.slot_index,
        'action_type', q.action_type,
        'action_id', q.action_id,
        'action_code', q.action_code,
        'data', coalesce(q.data, '{}'::jsonb)
      )
      order by q.slot_index, q.created_at, q.id
    ),
    '[]'::jsonb
  )
  into v_slots
  from public.odyssey_character_quickbar_slots q
  where q.character_id = v_character_id;

  return jsonb_build_object(
    'ok', true,
    'character_id', v_character_id,
    'slots', v_slots
  );
end;
$$;

create or replace function public.save_character_quickbar(
  p_payload jsonb
)
returns jsonb
language plpgsql
as $$
declare
  v_character_id uuid := public.odyssey_try_parse_uuid(p_payload->>'character_id');
  v_actor_is_gm boolean := coalesce(nullif(trim(coalesce(p_payload->>'actor_is_gm', '')), '')::boolean, false);
  v_slots_input jsonb := coalesce(p_payload->'slots', '[]'::jsonb);
  v_control jsonb := '{}'::jsonb;
  v_slot jsonb;
  v_slot_index integer;
  v_action_type text;
  v_action_id uuid;
  v_action_code text;
  v_data jsonb;
begin
  if v_character_id is null then
    return jsonb_build_object(
      'ok', false,
      'error', 'CHARACTER_NOT_FOUND',
      'message', 'character_id is required.'
    );
  end if;

  if jsonb_typeof(v_slots_input) <> 'array' then
    return jsonb_build_object(
      'ok', false,
      'error', 'INVALID_PAYLOAD',
      'message', 'slots must be an array.'
    );
  end if;

  v_control := public.odyssey_can_control_character(
    v_character_id,
    p_payload->>'actor_player_id',
    v_actor_is_gm
  );

  if coalesce((v_control->>'allowed')::boolean, false) = false then
    return jsonb_build_object(
      'ok', false,
      'error', 'CONTROL_DENIED',
      'message', 'You cannot edit this quickbar.'
    );
  end if;

  delete from public.odyssey_character_quickbar_slots
  where character_id = v_character_id;

  for v_slot in
    select value
    from jsonb_array_elements(v_slots_input)
  loop
    v_slot_index := coalesce(nullif(trim(coalesce(v_slot->>'slot_index', '')), '')::integer, -1);
    v_action_type := lower(trim(coalesce(v_slot->>'action_type', '')));
    v_action_id := public.odyssey_try_parse_uuid(v_slot->>'action_id');
    v_action_code := nullif(trim(coalesce(v_slot->>'action_code', '')), '');
    v_data := case
      when jsonb_typeof(v_slot->'data') = 'object' then v_slot->'data'
      else '{}'::jsonb
    end;

    if v_slot_index < 0 then
      continue;
    end if;

    if v_action_type not in ('ability', 'perk', 'item', 'weapon_feature') then
      return jsonb_build_object(
        'ok', false,
        'error', 'INVALID_ACTION_KIND',
        'message', format('Unsupported quickbar action type: %s.', coalesce(v_action_type, ''))
      );
    end if;

    if v_action_type = 'perk' and v_action_id is not null then
      if exists (
        select 1
        from public.odyssey_character_perks owned
        join public.odyssey_perk_defs perk on perk.id = owned.perk_def_id
        where owned.character_id = v_character_id
          and owned.id = v_action_id
          and (
            coalesce(perk.perk_type, 'passive') = 'passive'
            or coalesce(perk.activation_type, 'passive') = 'passive'
          )
      ) then
        return jsonb_build_object(
          'ok', false,
          'error', 'PERK_IS_PASSIVE',
          'message', 'Passive perks cannot be placed into active quickbar slots.'
        );
      end if;
    end if;

    insert into public.odyssey_character_quickbar_slots (
      character_id,
      slot_index,
      action_type,
      action_id,
      action_code,
      data
    )
    values (
      v_character_id,
      v_slot_index,
      v_action_type,
      v_action_id,
      v_action_code,
      coalesce(v_data, '{}'::jsonb)
    );
  end loop;

  return public.get_character_quickbar(
    jsonb_build_object(
      'character_id', v_character_id,
      'actor_player_id', p_payload->>'actor_player_id',
      'actor_is_gm', v_actor_is_gm
    )
  );
end;
$$;

create or replace function public.combat_get_log(
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
stable
as $$
declare
  v_encounter_id uuid := public.odyssey_try_parse_uuid(p_payload->>'encounter_id');
  v_room_id text := coalesce(nullif(trim(coalesce(p_payload->>'room_id', '')), ''), '');
  v_actor_is_gm boolean := coalesce(nullif(trim(coalesce(p_payload->>'actor_is_gm', '')), '')::boolean, false);
  v_actor_player_id text := coalesce(nullif(trim(coalesce(p_payload->>'actor_player_id', '')), ''), '');
  v_limit integer := greatest(1, least(coalesce(nullif(trim(coalesce(p_payload->>'limit', '')), '')::integer, 50), 200));
  v_viewer_character_ids uuid[] := array[]::uuid[];
  v_rows jsonb := '[]'::jsonb;
begin
  if v_actor_player_id <> '' then
    select coalesce(array_agg(c.id), array[]::uuid[])
    into v_viewer_character_ids
    from public.odyssey_characters c
    where coalesce(c.is_deleted, false) = false
      and c.owner_player_id = v_actor_player_id;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', l.id,
        'encounter_id', l.encounter_id,
        'room_id', l.room_id,
        'scene_id', l.scene_id,
        'round_number', l.round_number,
        'actor_character_id', l.actor_character_id,
        'target_character_id', l.target_character_id,
        'owner_character_id', l.owner_character_id,
        'visibility', l.visibility,
        'event_type', l.event_type,
        'message', l.message,
        'public_data', coalesce(l.public_data, '{}'::jsonb),
        'created_by', l.created_by,
        'created_at', l.created_at
      )
      order by l.created_at desc, l.id desc
    ),
    '[]'::jsonb
  )
  into v_rows
  from (
    select *
    from public.odyssey_combat_log l
    where (v_encounter_id is null or l.encounter_id = v_encounter_id)
      and (v_room_id = '' or l.room_id = v_room_id)
      and (
        l.visibility = 'public'
        or (
          l.visibility = 'owner_only'
          and (
            v_actor_is_gm
            or l.owner_character_id = any(v_viewer_character_ids)
          )
        )
        or (l.visibility = 'gm_only' and v_actor_is_gm)
      )
    order by l.created_at desc, l.id desc
    limit v_limit
  ) l;

  return jsonb_build_object(
    'ok', true,
    'rows', v_rows
  );
end;
$$;

create or replace function public.get_scene_token_links(
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
stable
as $$
declare
  v_room_id text := coalesce(nullif(trim(coalesce(p_payload->>'room_id', '')), ''), '');
  v_scene_id text := coalesce(nullif(trim(coalesce(p_payload->>'scene_id', '')), ''), '');
  v_campaign_id text := coalesce(nullif(trim(coalesce(p_payload->>'campaign_id', '')), ''), '');
  v_token_id text := coalesce(nullif(trim(coalesce(p_payload->>'token_id', '')), ''), '');
  v_include_inactive boolean := coalesce(nullif(trim(coalesce(p_payload->>'include_inactive', '')), '')::boolean, false);
  v_actor_player_id text := coalesce(nullif(trim(coalesce(p_payload->>'actor_player_id', '')), ''), '');
  v_actor_is_gm boolean := coalesce(nullif(trim(coalesce(p_payload->>'actor_is_gm', '')), '')::boolean, false);
  v_links jsonb := '[]'::jsonb;
begin
  if v_room_id = '' or v_scene_id = '' then
    return jsonb_build_object(
      'ok', false,
      'error', 'INVALID_PAYLOAD',
      'message', 'room_id and scene_id are required.'
    );
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', t.id,
        'campaign_id', t.campaign_id,
        'room_id', t.room_id,
        'scene_id', t.scene_id,
        'token_id', t.token_id,
        'token_name', t.token_name,
        'token_layer', t.token_layer,
        'is_active', t.is_active,
        'last_seen_at', t.last_seen_at,
        'updated_at', t.updated_at,
        'character', case when c.id is null then null else jsonb_build_object(
          'id', c.id,
          'character_key', c.character_key,
          'display_name', public.odyssey_character_display_name(c.id),
          'character_bucket', c.character_bucket,
          'source_template_id', c.source_template_id,
          'source_template_key', c.source_template_key,
          'enabled', c.enabled,
          'is_deleted', c.is_deleted,
          'owner_player_id', c.owner_player_id,
          'owner_player_name', c.owner_player_name,
          'control', public.odyssey_can_control_character(c.id, v_actor_player_id, v_actor_is_gm)
        ) end,
        'state', case when c.id is null then null else jsonb_build_object(
          'state_version', coalesce(s.state_version, c.active_combat_state_version, 0),
          'status_summary', coalesce(nullif(trim(s.status_summary), ''), public.odyssey_build_character_status_summary(c.id)),
          'overlay_text', coalesce(s.overlay_text, ''),
          'is_alive', coalesce(s.is_alive, true),
          'is_conscious', coalesce(s.is_conscious, true),
          'updated_at', s.updated_at
        ) end
      )
      order by t.is_active desc, t.updated_at desc, t.created_at desc, t.token_name, t.token_id
    ),
    '[]'::jsonb
  )
  into v_links
  from public.odyssey_token_links t
  left join public.odyssey_characters c on c.id = t.character_id
  left join public.odyssey_character_combat_state s on s.character_id = t.character_id
  where t.room_id = v_room_id
    and t.scene_id = v_scene_id
    and (v_campaign_id = '' or t.campaign_id = v_campaign_id)
    and (v_token_id = '' or t.token_id = v_token_id)
    and (v_include_inactive or t.is_active = true);

  return jsonb_build_object(
    'ok', true,
    'room_id', v_room_id,
    'scene_id', v_scene_id,
    'links', v_links
  );
end;
$$;

grant execute on function public.odyssey_character_display_name(uuid) to anon, authenticated;
grant execute on function public.odyssey_can_control_character(uuid, text, boolean) to anon, authenticated;
grant execute on function public.assign_character_owner(jsonb) to anon, authenticated;
grant execute on function public.clear_character_owner(jsonb) to anon, authenticated;
grant execute on function public.get_character_quickbar(jsonb) to anon, authenticated;
grant execute on function public.save_character_quickbar(jsonb) to anon, authenticated;
grant execute on function public.combat_get_log(jsonb) to anon, authenticated;
grant execute on function public.get_scene_token_links(jsonb) to anon, authenticated;

alter table public.odyssey_combat_usage_states enable row level security;
alter table public.odyssey_character_quickbar_slots enable row level security;

drop policy if exists "odyssey_combat_usage_states_full_access" on public.odyssey_combat_usage_states;
create policy "odyssey_combat_usage_states_full_access"
on public.odyssey_combat_usage_states
for all
to anon, authenticated
using (true)
with check (true);

drop policy if exists "odyssey_character_quickbar_slots_full_access" on public.odyssey_character_quickbar_slots;
create policy "odyssey_character_quickbar_slots_full_access"
on public.odyssey_character_quickbar_slots
for all
to anon, authenticated
using (true)
with check (true);

grant select, insert, update, delete on public.odyssey_combat_usage_states to anon, authenticated;
grant select, insert, update, delete on public.odyssey_character_quickbar_slots to anon, authenticated;

do $$
begin
  begin
    alter publication supabase_realtime add table public.odyssey_combat_encounters;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.odyssey_initiative_entries;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.odyssey_combat_log;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.odyssey_character_combat_state;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.odyssey_character_effects;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.odyssey_character_weapons;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.odyssey_character_weapon_profile_states;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.odyssey_character_weapon_feature_states;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.odyssey_character_magazines;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.odyssey_character_abilities;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.odyssey_character_resource_pools;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.odyssey_token_links;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;
end;
$$;
