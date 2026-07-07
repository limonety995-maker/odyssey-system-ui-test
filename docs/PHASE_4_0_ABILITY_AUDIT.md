# Phase 4.0 — Abilities & Quickbar Foundation: Pre-implementation Audit

**Date:** 2026-07-06  
**Repository:** limonety995-maker/odyssey-system-ui-test  
**Branch:** main  
**Scope:** Assess existing ability/skill/perk/psionics/implants/items data model before creating quickbar system.

---

## 1. Executive Summary

A **canonical ability system** already exists in the database:
- `odyssey_ability_defs` / `odyssey_ability_level_defs` / `odyssey_character_abilities` (migrations 29–31, 56)
- `odyssey_perk_defs` / `odyssey_character_perks` (migrations 60–62, 82)
- `odyssey_skill_defs` / `odyssey_character_skills` (migration 39–40, 53)
- `odyssey_resource_pool_defs` / `odyssey_character_resource_pools` (migration 29)

The HUD runtime mapper (`mapBundleToHudSnapshot`, `mapSkills`) already consumes `bundle.abilities.quick_actions` and `bundle.abilities.quickbar_slots` from the server.

**No parallel ability system will be created.** Phase 4.0 will:
1. Extend the existing runtime contract to return full quick-action metadata (cost, cooldown, targeting, availability reason).
2. Create `odyssey_character_quickbar_layouts` table to persist per-character quickbar configuration.
3. Wire HUD components (Skills Block, Quickbar Editor popover) to display and save layout via new RPC.
4. Add debug events for quickbar lifecycle.

---

## 2. Existing Ability-Related Tables & RPC

| Migration | Table / Function | Purpose | Notes |
|---|---|---|---|
| 29 | `odyssey_ability_defs` | Ability definitions (attack, buff, defense, utility, narrative, custom) | `source_type`: psionic, implant, prosthetic, equipment, item, innate, custom |
| 29 | `odyssey_ability_level_defs` | Per-level ability costs, cooldown, bonuses, effect data | Linked to `ability_def_id`, indexed by `ability_level` |
| 29 | `odyssey_character_abilities` | Character's learned/equipped abilities | Tracks `current_cooldown_rounds`, `current_charges`, `is_enabled`, `is_hidden` |
| 29 | `odyssey_resource_pool_defs` | Resource pool definitions (PSI, charges, energy, custom) | `source_type`: attribute, fixed, custom; `recovery_mode`: manual, full_rest, scene, custom |
| 29 | `odyssey_character_resource_pools` | Per-character current/max/reserved resource values | Separate from ability.charges — canonical pool tracker |
| 29 | `get_character_abilities(p_character_id)` | RPC: return abilities + resource pools as jsonb | Called by `get_character_runtime_bundle` |
| 31 | Fix: `odyssey_get_character_ability_effective_level()` | Compute ability's effective level (from linked skill or direct) | Used in attack resolution |
| 56 | `creator_abilities` endpoint | Creator catalog for ability management | Allows ability definition creation via admin UI |
| 60 | `odyssey_perk_defs` | Perk definitions (passive, active, narrative) | `perk_type`: passive, active, narrative; `activation_type`: passive, manual, reaction, scene_start |
| 60 | `odyssey_character_perks` | Character's learned perks | No separate cooldown field; cooldown stored in perk_def data |
| 61 | `creator_perk_catalog` RPC | Creator catalog for perk management | CRUD perks + seed character perks |
| 62 | Combat integration | Perks applied automatically in turn engine | `advance_character_effects` calls perk triggers |
| 82 | Unique constraint fix | `odyssey_character_perks(character_id, perk_def_id)` one-per-character | Deduplication; `on conflict do nothing` |
| 88 | `odyssey_weapon_abilities` | Weapon-specific abilities (fire modes, special techniques) | Source is equipment; activated on perform_attack |
| — | `odyssey_character_skills` | Character's learned skills | `level` field; optional prerequisite for abilities via `linked_skill_id` |

---

## 3. Data Model Audit: Can It Become a Quick Action?

| Source | Real Entity | Can Be Quick Action | Why |
|---|---|---|---|
| **Active Ability** (ability_kind not 'passive', activation_type = 'manual') | `odyssey_character_abilities` entry | ✅ YES | Designed for manual activation; has cooldown, cost, targeting metadata. |
| **Active Perk** (perk_type = 'active', activation_type = 'manual') | `odyssey_character_perks` entry | ✅ YES | Can be triggered manually if `activation_type='manual'`; rare in current schema but supported. |
| **Weapon Ability** (fire-mode technique, special action) | `odyssey_weapon_abilities` + linked equipment | ✅ YES (with context) | Tied to active weapon; must validate weapon is equipped. Not yet integrated into quick_actions payload. |
| **Passive Ability** (ability_kind = 'passive' or activation_type = 'passive') | `odyssey_character_abilities` entry | ❌ NO | Always-on; no manual trigger point. Filtered out in `mapSkills`. |
| **Passive Perk** (perk_type = 'passive' or activation_type = 'passive') | `odyssey_character_perks` entry | ❌ NO | Always-on bonuses; not manually activated. |
| **Skill Level Bonus** (attribute bonus from skill) | `odyssey_character_skills` entry | ❌ NO | Passive modifier, not an action. |
| **Weapon Skill Bonus** (class bonus, accuracy bonus) | Linked via `odyssey_skill_defs` | ❌ NO | Passive; baked into attack rolls. |
| **Reaction Action** (reaction trigger, reaction action) | Future: not yet modeled | ⏳ DEFER | Tied to turn state; out of scope for Phase 4.0. |
| **Implant/Prosthetic Active Effect** | `odyssey_character_equipment_items` with active effect | ⏳ MAYBE | Only if explicitly modeled as activation trigger; currently treated as passive effects. |
| **Grenade / Consumable Item** (inventory item usable in combat) | `odyssey_character_items` | ⏳ MAYBE | Requires itemInstance combat activation model; not yet in place. |
| **Injector / Medicine** (consumable with effect) | `odyssey_character_items` | ⏳ MAYBE | Same as grenade; requires consumable activation contract. |
| **Shield Recharge** | Tied to `character_resource_pools` (shield pool) | ⏳ DEFER | Consumable action; not yet a distinct ability. Phase 4.1+. |

**Canonical Quick-Action Sources for Phase 4.0:**
1. `odyssey_character_abilities` where `ability_kind` != 'passive' AND `activation_type` = 'manual' AND `is_hidden` = false AND `is_enabled` = true.
2. `odyssey_character_perks` where `perk_type` = 'active' AND `activation_type` = 'manual' AND deduced from perk_def data.
3. (Optional, Phase 4.1) weapon-linked abilities once target is selected.

---

## 4. Existing Cooldown & Duration Model

| Field | Table | Semantics | Managed By |
|---|---|---|---|
| `current_cooldown_rounds` | `odyssey_character_abilities` | Remaining turns before ability can be used again | `advance_character_ability_states()` (turn-start hook in migration 64) |
| `cooldown_rounds` | `odyssey_ability_level_defs` | Max cooldown for this ability level | Schema; used to reset cooldown after ability is triggered |
| `duration_rounds` | `odyssey_ability_level_defs` | How long the ability's effect persists | Effect data; not directly tracked per-character ability |
| Active effect flags | `odyssey_character_effects` (migration 21) | Temporary state flags (stunned, suppressed, skip_turn, etc.) | `advance_character_effects()` during turn start (migration 64) |

**Current implementations:**
- `advance_character_ability_states()` decrements `current_cooldown_rounds` at turn start.
- Effect duration tracked in `odyssey_character_effects.remaining_turns`, decremented each turn.
- No separate "cooldown decrement" trigger yet (will be Phase 4.1).

---

## 5. Character Ownership & Layout Convention

| Property | Location | Auth Model | Editable By |
|---|---|---|---|
| `character_id` | All ability tables | Foreign key to `odyssey_characters(id)` | Character owner (player) + GM |
| `owner_player_id` | `odyssey_characters` | Direct field | Character creator; changeable via GM UI |
| Quickbar layout | **MISSING** — will create in Phase 4.0 | Should follow character FK pattern | Character owner + GM (UX check; full auth deferred to B0) |

No special "character layout" or "user preference" table yet. Quickbar will be the first per-character, per-player preference storage.

---

## 6. Runtime Bundle Shape (Current)

From migration 50 and `hud/runtime/runtimeBundleMapper.js`:

```javascript
bundle.abilities: {
  quick_actions: [
    {
      id,                      // uuid or string
      ability_name,            // display name
      ability_type,            // enum: attack_technique, directed, instant, toggle, custom
      source_type,             // enum: psionic, implant, equipment, item, innate, custom
      icon_key,                // icon reference
      color_key,               // semantic color
      action_cost,             // enum: main, move, reaction, free
      cooldown_remaining_turns,// current cooldown
      is_toggled,              // is this toggle ability currently ON?
      disabled_reason,         // human reason why unavailable, or null if available
      tooltip,                 // short help text
      targeting_mode?,         // self, character, body_part, point, area, none
      allows_multiple_targets?,
      uses_point?,
      radius?,
      weapon_requirements?     // list of required weapon classes
    }
  ],
  quickbar_slots: [
    { slot_index, ability_id }
  ]
}
```

**Formed by:** `get_character_runtime_bundle()` which calls `get_character_abilities()` and projects a subset.

**Missing from current runtime:**
- Full `costs: { main, move, psi, charges }` breakdown (only `action_cost` enum).
- Full `targeting: { mode, minTargets, maxTargets, allowAllies, allowSelf, requiresBodyZone }`.
- `state: { available, active, disabledReason, selectable }` (available is inferred from `disabled_reason`).
- `requirements: { weaponClass, weaponId, conditionSummary }` beyond `weapon_requirements` array.
- Quickbar layout versioning/conflict detection (will be Phase 4.0).

---

## 7. HUD Integration Status

| Component | Current State | Phase 4.0 Task |
|---|---|---|
| **Skills module** | Exists; renders a basic skill list | Extend to show quickbar layout; add EDIT button; integrate editor |
| **Skill block render** | `mapBundleToHudSnapshot()` → `mapSkills()` → {library, quickSlots} | Wire `mapSkills()` to server-backed runtime; pass full metadata to UI |
| **Quickbar editor popover** | Missing | Create `odyssey-hud-quickbar-editor` with drag-drop, conflict handling, Save/Cancel |
| **Action Block** | Shows current action in attack/skill path | No changes in Phase 4.0 (ability execution deferred to Phase 4.1) |
| **Target Block** | Shows current target selection | No changes in Phase 4.0 |
| **Combat Session** | Active during encounter | Coexist with quickbar; no mutual blocking |

---

## 8. Decisions for Phase 4.0

### 8a. Canonical Runtime Contract

A new RPC or an extension of `get_character_runtime_bundle()` will return **full quick-action metadata**:

```javascript
get_character_quick_actions_runtime(character_id)
returns {
  characterId: uuid,
  quickActions: [
    {
      characterActionId: uuid,
      definitionId: uuid,
      sourceType: enum,
      type: enum (attack_technique | directed | instant | toggle),
      name: string,
      shortDescription: string,
      fullDescription: string,
      iconKey: string,
      semanticKind: enum (attack | psi | tech | utility | intervention),
      
      targeting: {
        mode: enum,
        minTargets: number,
        maxTargets: number,
        allowAllies: bool,
        allowSelf: bool,
        requiresBodyZone: bool
      },
      
      costs: {
        main: number,
        move: number,
        psi: number,
        charges: number
      },
      
      cooldown: {
        current: number,
        max: number,
        unit: "turn"
      },
      
      state: {
        available: bool,
        active: bool,
        disabledReason: string | null,
        selectable: bool
      },
      
      requirements: {
        weaponClass: string,
        weaponId: uuid,
        conditionSummary: string
      }
    }
  ],
  
  quickbar: {
    slots: [
      { slotIndex: number, characterActionId: uuid | null, empty: bool }
    ],
    maxSlots: number,
    version: number
  }
}
```

**Implementation detail:** This RPC will be a **new SQL function** or an **extension to existing `get_character_runtime_bundle()`** to avoid duplication.

### 8b. Quickbar Persistence

A new table `odyssey_character_quickbar_layouts`:

```sql
create table odyssey_character_quickbar_layouts (
  id uuid primary key,
  character_id uuid not null unique,
  layout jsonb not null,  -- { slots: [{ slotIndex, characterActionId }] }
  version integer not null default 1,
  created_at timestamptz,
  updated_at timestamptz
);
```

RPC `save_character_quickbar_layout(character_id, expected_version, slots)`:
- Validates each slot's action exists in canonical runtime.
- Prevents duplicates (one action per slot).
- Returns `{ ok, error, new_layout, new_version }`.
- Version conflict returns `{ ok: false, error: "QUICKBAR_VERSION_CONFLICT" }`.

### 8c. What Is Deferred to Phase 4.1

- PSI spending (requires resource mutation).
- Cooldown decrement (requires turn-start hook refinement).
- Directed action targeting (requires target-picking UI integration).
- Instant action mutation (mutation trigger).
- Toggle activation (toggle state mutation).
- Attack-technique integration into `perform_attack()`.
- Point/area/multi-target selection UI.
- Reaction actions (turn state context).
- Preparation actions.
- Auto-seeding sample abilities into character data.

---

## 9. Test Coverage Plan (Phase 4.0)

1. ✅ Runtime contains only quickbar-eligible actions.
2. ✅ Passive abilities are filtered out.
3. ✅ All four action types map correctly.
4. ✅ Empty slots are preserved.
5. ✅ One action cannot occupy two slots.
6. ✅ Drag slot-to-slot moves action.
7. ✅ Drag library-to-occupied-slot is predictable (no duplicate).
8. ✅ Temporarily unavailable action can be assigned but disabled in HUD.
9. ✅ Editor Cancel does not mutate server layout.
10. ✅ Save uses expected version.
11. ✅ Version conflict doesn't clobber server state.
12. ✅ Removed/missing action is visible and deletable.
13. ✅ Runtime does not leak inventory/private target/auth.
14. ✅ Normal click on action does not trigger combat RPC.
15. ✅ Skills UI does not change Target/Action Block in Phase 4.0.
16. ✅ Tooltip shows server reason, cost, cooldown, targeting.
17. ✅ Slots 1–10 on first row; 11+ create upward second row.
18. ✅ Existing Gun, Target, Combat Session, Attack, Debug Console tests pass.

---

## 10. Files to Create / Modify

### New Files (Phase 4.0)

- `supabase/92_ability_quickbar_foundation.sql` — quickbar table + RPC
- `hud/abilities/abilityApi.js` — RPC wrappers
- `hud/abilities/abilityRuntimeMapper.js` — PURE mapper
- `hud/abilities/quickbarLayoutPolicy.js` — validation, version checks
- `hud/abilities/quickbarController.js` — background controller
- `hud/abilities/AbilityTooltip.js` — tooltip render
- `hud/abilities/QuickbarEditorPanel.js` — editor UI
- `docs/PHASE_4_0_ABILITY_AUDIT.md` — this document
- `scripts/abilities-quickbar.test.mjs` — tests

### Modified Files (Phase 4.0)

- `hud/runtime/runtimeBundleMapper.js` — hook up new runtime contract
- `hud/components/SkillBlock.js` — add EDIT button, integrate quickbar display
- `hud/overlay/hudLayout.js` — add popover ID for editor
- `hud/overlay/overlayConstants.js` — add BC channel
- `hud/overlay/combatHudOverlayPage.js` — route handler for quickbar editor
- `hud/overlay/combatHudOverlayController.js` — lifecycle + command dispatch
- `hud/debug/debugConsoleEvents.js` — add quickbar events
- `package.json` — add test script

---

## 11. Confirmation

✅ **No new parallel ability system will be created.**  
✅ **Canonical sources: `odyssey_character_abilities`, `odyssey_character_perks`, `odyssey_weapon_abilities`.**  
✅ **Quickbar layout is a new per-character UI preference, not a game mechanic.**  
✅ **Phase 4.0 builds the framework; Phase 4.1 implements ability execution.**  
✅ **No SQL migrations have been applied to remote Supabase yet.**

---

*End of audit document.*
