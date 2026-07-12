# Phase 4.1B.4 — Passive Display + Unsupported Reasons Polish: audit

Baseline: `HEAD=a47f9d0` (1.8.74). Toggle execution (Phase 4.1B.3) is live in
code; migration `109_toggle_ability_execution.sql` exists but its applied
status on the real DB is not assumed either way. No toggle seed ability is
created in this phase (per instructions).

## 1/2. Existing quickbar runtime action types

The live `type` CASE (`odyssey_get_character_quick_actions_runtime`, last
redefined in `109_toggle_ability_execution.sql` — confirmed no later
migration touches it) produces exactly these values, in this order:

```sql
'type', case
  when coalesce(ad.effect_mode, '') = 'attack' or ad.ability_kind = 'attack' then 'attack_technique'
  when ad.activation_type = 'toggle' then 'toggle'
  when coalesce(ad.target_type, 'none') in ('character', 'body_part') then 'directed'
  else 'instant'
end,
```

**There is no `'passive'` branch and never has been.** Only 4 string values are
ever produced: `attack_technique`, `toggle`, `directed`, `instant`.

## 3. Do passive abilities currently appear in quickActions?

**No — they are excluded before the query even reaches the `type` CASE.** The
query's `WHERE` clause has two independent filters that both exclude
"passive" abilities, keyed off two DIFFERENT columns:

```sql
where ca.character_id = p_character_id
  and ca.is_hidden = false
  and ca.is_enabled = true
  and ad.ability_kind != 'passive'
  and ad.activation_type in ('manual', 'custom', 'toggle')
```

- `ad.ability_kind != 'passive'` — `ability_kind` is the semantic classification
  enum (`attack|buff|support|defense|passive|utility|narrative|custom`).
- `ad.activation_type in ('manual', 'custom', 'toggle')` — `activation_type` is
  a SEPARATE enum (`manual|passive|on_attack|on_hit|always|custom|toggle`,
  confirmed by the constraint in `29_active_abilities_schema.sql`, widened for
  `toggle` in `109_toggle_ability_execution.sql`). `'passive'` is not in this
  allow-list either.

So an ability is excluded from the quickbar entirely if EITHER its
`ability_kind='passive'` OR its `activation_type='passive'` — two independent,
confusingly-similarly-named signals, both already correctly excluding. A
client can never receive `type:'passive'` today, because the row itself never
reaches the `SELECT` in the first place.

**Consequence for this phase:** "passive ability display" work is necessarily
DEFENSIVE/FORWARD-COMPATIBLE only — there is no live data path that can
exercise it today, and this phase does not change the `WHERE` clause (that
would be a genuine behavior change — surfacing content that's never been
shown before — not a display polish, and is not requested). This is
documented honestly rather than silently building UI for an unreachable case
without saying so.

## 4. Fields describing an ability (current state, per class)

| Field | Present? | Notes |
|---|---|---|
| `action.type` | present | one of `attack_technique\|toggle\|directed\|instant` only |
| `semanticKind` | present | `ability_kind` verbatim — CAN be `'passive'` on an ability that still reaches the client (e.g. a `buff`-`ability_kind` toggle has `ability_kind` unrelated to whether it's excluded) — see §7 nuance below |
| `state.active` | present | true server-truth since Phase 4.1B.3 (`odyssey_character_effects` lookup) |
| `state.available` | present | is_enabled, skip-turn, alive/target_type, cooldown, resource, unsupported-effect all folded in |
| `state.executionAvailable` | present | `not unsupported_effect` — computed for EVERY row regardless of type (attack_damage_bonus/attack_armor_pierce/ignore_armor on the active level) |
| `state.executionReason` | present | `'ACTION_EFFECT_NOT_IMPLEMENTED'` or `null` |
| `state.disabledReason` | present | human string, server-authored |
| `cooldown` | present | current/max/unit |
| `costs` | present | main/move/psi/charges |
| effect metadata | partial | no effect-type/payload field is returned to the client at all (by design — Phase 4.0 spec: never leak raw ability-definition JSON) |

## 5/6/7. How "unsupported" is represented today, and the real gap

`deriveSlotAvailability` (shared, used by anything NOT direct-attack/toggle)
already produces `SLOT_AVAILABILITY.unsupported` generically whenever
`state.executionAvailable === false` — this is SERVER-TRUTH and already
correctly wired for `instant`/`directed` abilities (reused unchanged).

But there is a SECOND, different kind of "unsupported" that has **no
classifier and no marker at all today**: a non-attack ability with
`target_type='body_part'` (`type==='directed'`,
`targeting.requiresBodyZone===true`). `isDirectedTargetAbility`'s own existing
doc comment says this combination is *"deliberately OUT of scope ... falls
through to the existing show-ability-detail click"* — but it falls through
with **no distinguishing marker at all**. Concretely: such an ability
typically has `available:true`/`executionAvailable:true` (nothing server-side
blocks it structurally), so `deriveSlotAvailability` would return `ready` —
the tile would render exactly like a normal, working ability, with no lock
icon, no "Unsupported" label, nothing — even though clicking it does
**nothing but open the detail card** (no execute-* command exists for it).
This is the honesty gap this phase is actually about.

**Third gap found**: `deriveToggleAvailability` (Phase 4.1B.3) does **not**
check `state.executionAvailable` at all — unlike every other derivation in
this file. A toggle ability that somehow had an unsupported-effect flag set
(structurally possible but not expected in practice, since toggles are never
`effect_mode='attack'`) would silently fall through cooldown/resource/ready
checks instead of reporting unsupported. Minor, but a real inconsistency
worth closing while touching this exact code.

**Reason provenance** (server-truth vs client-derived), per the task's own
question:
- Server-truth: `state.disabledReason`, `state.executionReason`,
  `state.available`, `state.executionAvailable`, `state.resourceSufficient`,
  cooldown values — never fabricated, always copied verbatim (existing Phase
  4.0/4.1 rule, unchanged).
- Client-derived: the "Unsupported" *classification* itself for the
  body-zone-without-attack combination is a CLIENT inference from
  `type`+`targeting.requiresBodyZone` (no server field says "this is
  unsupported" for this specific reason) — must be labeled distinctly from a
  server-given reason, never presented as if the server said it.

## 8. How QuickbarView currently decides click/disabled/marker/tooltip

`occupiedTile()` computes, in order: `isTechnique` → `directAttack` →
`instantSelf` → `directedTarget` → `toggleAbility`, each mutually exclusive by
construction (server `type` is exactly one value, and `isDirectAttackAbility`
requires `type==='attack_technique'` specifically). Anything matching NONE of
these (today: the body-zone-without-attack combination, or a hypothetical
future unrecognized type) falls to the existing generic branch:
`dataAction = isTechnique ? "toggle-armed-technique" : "show-ability-detail"`,
`disabled = action.state?.available === false` (the generic server flag,
un-overridden).

**Click routing today is already safe** — no unclassified/unsupported action
can reach an execute-* command, because `dataAction` for anything unmatched is
always `"show-ability-detail"` (or `toggle-armed-technique` only for real
attack_technique rows), never one of the execute-* strings. This phase does
not need to CLOSE a routing hole; it needs to make the ALREADY-safe fallback
state visually and textually honest instead of indistinguishable from
"ready."

**Important interaction found**: `CombatHudModule.js`'s `"show-ability-detail"`
click case starts with `if (t.classList.contains("is-disabled")) break;` — so
if this phase marks a slot `is-disabled` (which the task explicitly wants for
"unsupported ability appears disabled"), its detail card would stop opening
on CLICK. The existing precedent for this exact tension is
`attack_technique`: a disabled technique still shows its detail via
HOVER/FOCUS (`techniqueSlotFromTarget`'s selector, checked in
`onSlotDetailHover`/`onSlotDetailFocusIn`), independent of the click
handler's `is-disabled` guard. This phase reuses that exact mechanism for
unsupported/passive tiles rather than inventing a new one.

## 9. Are passive abilities currently clickable?

Moot — none can exist in the runtime today (see §3). If one somehow appeared
(future data), it would currently render via the same untouched generic
fallback as any other unmatched type: `show-ability-detail`, disabled only if
`state.available===false`. Not dangerous (never executes), but not honestly
labeled "Passive" either.

## 10. Can unsupported abilities accidentally dispatch execution?

No — confirmed above (§8). Every execute-* dataAction requires its own
specific classifier to be true first; an unsupported/unrecognized action
matches none of them.

## 11. Ambiguous classifications?

None found among the 5 existing execution classes — each requires a
different, non-overlapping combination of `type` (+ `executionReason` for
direct-attack, + `requiresBodyZone` for directed) that cannot simultaneously
satisfy two classifiers. The one previously-unhandled combination
(`directed` + `requiresBodyZone:true`, non-attack) is exactly the "Unsupported"
gap this phase closes with an explicit classifier rather than an implicit,
unlabeled fallback.

## 12. Final implementation plan

**No migration** — confirmed: the runtime already has every field needed to
distinguish unsupported from ready/passive/executable (`type`,
`targeting.requiresBodyZone`, `state.executionAvailable`). The passive gap is
not a missing-metadata problem — it's a deliberate, pre-existing exclusion
filter that this phase does not change. Everything here is a frontend
classification/display fix:

1. `hud/abilities/abilityAvailabilityPolicy.js`: add `isPassiveAbility`,
   `isUnsupportedAbility`, `isUnknownAbility` (defensive — see §3/§9), and fix
   `deriveToggleAvailability` to check `executionAvailable` like every other
   derivation.
2. `hud/abilities/QuickbarView.js`: recognize passive/unsupported/unknown as
   their own mutually-exclusive branches (still `show-ability-detail`,
   forced `disabled:true`, distinct marker), and extend the hover/focus
   detail-card selector (`techniqueSlotFromTarget` in `CombatHudModule.js`) to
   include them — reusing the exact `attack_technique` precedent for
   "disabled but still needs its detail reachable."
3. `hud/abilities/AbilityTooltip.js`: add `Type`/`Execution`/`Reason` lines for
   passive and unsupported, distinguishing server-given reasons from the
   client-derived "no execution path for this target/body-zone combination"
   inference.
4. No Debug Console changes beyond what's already logged — adding a new event
   on every render would violate "do not spam Debug Console on every render";
   nothing NEW calls a server RPC in this phase, so there is nothing new worth
   tracing server-side. (No `ability-click-blocked` event is added: nothing in
   this phase can newly reach a blocked execution attempt that wasn't already
   safely inert before.)
