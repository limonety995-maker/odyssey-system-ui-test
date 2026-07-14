# Upstream Divergence Audit

Documentation-only audit. No source files were modified to produce this
report. Upstream was only read (`git fetch`), never merged, cherry-picked,
rebased against, or pushed to.

## Summary

Our fork (`origin/main`) and upstream (`odyssey-services/Odyssey_System`)
share a real common ancestor — the 2026-07-09 tree-adoption sync made upstream
a genuine parent of our history, so this is a normal, well-behaved three-way
comparison, not an "unrelated histories" situation. Since that ancestor,
upstream added **41 commits** (mostly weapon-switching, armory/inventory
hotfixes, tactical-move obstacle drawing, and combat-action robustness
fixes), and we added **111 commits** (four full Skills Block execution-class
phases: Direct Ability Attack, Instant/Self, Directed Target, Toggle/Stance,
Passive+Unsupported polish, plus the Ability Studio build-and-revert, plus
this session's earlier sync work itself). The two lines of work are almost
entirely **non-overlapping in intent** — upstream went deep on weapons/combat
plumbing, we went deep on the ability-execution class system — but they
**do overlap on a small number of shared files** (`sceneSelectionController.js`
above all), and there is a real, already-known migration-numbering collision
pattern (108/109 mean completely different things on each side, exactly like
the earlier 102 collision).

The single most important finding of this audit is **not** about divergence
at all: `hud/components/BattleLogBlock.js` and its supporting selector already
exist, unchanged, in **both** repos since the merge-base — and our own
Phase 4.1B.0–4.1B.4 log-entry builders (`hud/log/combatResultLogPolicy.js`)
are **already wired into it** via `ephemeral.combatLog` →
`hudSnapshot.battleLog.entries` → `renderBattleLogPanel(state)`. See
§Battle Log below.

## Current Heads

| | SHA | Version |
|---|---|---|
| Personal repo (`origin/main`) | `6627d6226e3923686f1ab99cec73fab94715c8d7` | 1.8.75 |
| Upstream (`upstream/main`) | `04e0c4cf46ddf8141a6102ea59d0a3859437bb3e` | 1.8.112 |
| Merge-base | `8958a3ab3e9671af9b9684bff5c93c470a9e84c0` | 1.8.69 |

## Commit Divergence

- Upstream-only commits since merge-base: **41** (`git rev-list --count origin/main..upstream/main`)
- Personal-only commits since merge-base: **111** (`git rev-list --count upstream/main..origin/main`)
- Upstream commits are one-version-bump-per-commit (`1.8.70` … `1.8.112`,
  a couple of numbers reused/skipped — 41 commits for ~43 version labels).
- Notable ranges:
  - Upstream: `8958a3a..04e0c4c` — weapon switching, armory/inventory
    read-path hotfixes, tactical-move obstacle drawing, stable Owlbear
    selection resolver, `combat_execute_action`/`perform_attack` robustness
    fixes, RPC error normalizer.
  - Ours: `8958a3a..6627d62` — the upstream tree-adoption sync itself
    (`c9a40b0`/`1e00136`/`71fed75`), then Ability Studio build+revert
    (`b43cb51..f522554`), then Toggle/Stance (`de333f3..a47f9d0`), then
    Passive/Unsupported polish (`f778cf0..6627d62`).

## High-Level Conclusion

**We are far apart in subject matter, close in file footprint on a handful of
shared files, and NOT close in time** — upstream shipped 43 point releases of
combat-plumbing work we don't have; we shipped 4 full ability-execution-class
phases upstream doesn't have. Neither side is "ahead" of the other in the
same direction — this is genuine **parallel divergence**, not a case where
one side is a strict superset of the other.

**Recommendation: do not sync now.** A full sync would need to:
1. Re-port our `perform_attack`/`combat_execute_action` fixes (currently
   `108`/`109` in our numbering) onto upstream's *actual current* bodies of
   those functions (upstream evolved `combat_execute_action` further, through
   their own `113`→`114`; our fix logic would need re-diffing against `114`,
   not our own `104` baseline — same pattern as the two migration-renumbering
   exercises already done this session).
2. Resolve the `SkillBlock.js`/`QuickbarView.js` GM-delete-menu removal (see
   §Skills Block) — upstream deleted a feature we still actively use.
3. Decide what to do with 11 new upstream migrations (110–120) we don't have
   at all, none of which we currently need.

Given none of upstream's 41 commits touch anything we're currently building
(toggle/passive/unsupported ability classes, which are 100% invisible to
upstream — confirmed by `git grep` finding zero hits for `isToggleAbility`,
`isPassiveAbility`, `isUnsupportedAbility`, `deriveToggleAvailability`, or
`activation_type`/`'toggle'` anywhere in `upstream/main`), **there is no
urgency**. The one thing worth doing soon, independent of any sync decision,
is manually verifying whether `BattleLogBlock.js` already renders real combat
events in a live Owlbear session — see below.

## Upstream-Only Changes

93 files touched, `+21461/-2041` lines (dominated by regenerated bundles —
`assets/background.js` alone is +4633/-... lines; see §Deployment). By
feature area, from source files only:

| Area | Files | What it is |
|---|---|---|
| **Weapon switching** | `hud/session/weaponSwitchPayload.js` (new), `api/weaponApi.js`, `supabase/108_weapon_switch_and_full_move_reload.sql`, `109_weapon_switch_runtime_context_and_hud_fixes.sql`, `118_fix_duplicate_active_encounters_and_weapon_switch.sql`, `118_fix_switch_active_weapon_safe_swap.sql` (two different `118`s — see below), `119_free_weapon_switch_and_selection_logs.sql`, `scripts/weapon-switch-command.test.mjs`, `scripts/unit/weapon-switch.test.mjs`, `scripts/unit/weapon-operation-cost.test.mjs` | A full "switch active weapon mid-combat" mechanic — free action, with its own cost/session-log semantics. We have no equivalent; our weapon model has always assumed a fixed active weapon per character. |
| **Armory/inventory read-path hotfixes** | `supabase/110_readonly_quick_actions_and_armory_hotfix.sql`, `111_drop_ambiguous_get_character_armory_overload.sql`, `112_armory_runtime_and_abilities_ambiguity_hotfix.sql`, `116_inventory_reload_ui_resource_wrapper.sql`, `120_readonly_armory_context_hotfix.sql`, `api/inventoryApi.js` | Several PostgREST-overload-ambiguity and read-only-context bugfixes (function overload resolution errors, likely from Postgres picking the wrong overload of `get_character_armory`). Not related to any HUD feature we own. |
| **`combat_execute_action` hardening** | `supabase/113_combat_execute_action_busy_stage.sql`, `114_combat_execute_action_use_ability_refresh_fix.sql` | `113` adds a `v_lock_stage` variable purely for better `ACTION_BUSY_RETRY` diagnostics (which stage was locking when a timeout/lock conflict hit). `114` (the LAST word on this function upstream) fixes something in the post-`use_ability` refresh step. **Confirmed**: the `'ability'` kind dispatch itself is byte-identical to the shared `104` baseline in both (`v_result := public.use_ability(...)`) — no toggle-awareness, expected since toggle is entirely our own post-divergence work. |
| **`perform_attack` hotfix** | `supabase/115_perform_attack_feed_mode_profile_hotfix.sql` | Fixes a DIFFERENT function (`odyssey_perform_weapon_attack`'s feed-mode/internal-ammo resolution — some databases had a partially-upgraded row shape). **Confirmed**: does NOT touch `public.perform_attack` itself, so it does not reintroduce or interact with the session-gate-ordering bug our own `108_direct_ability_attack_session_gate.sql` fixed (upstream simply never fixed that bug — it's not present in their commit set at all). |
| **Tactical Move / obstacles** | `movement/drawingObstacles.js` (new), `movement/moveToolController.js`, `scripts/unit/combat-drawing-obstacles.test.mjs` | A genuinely new mechanic: drawing/tracking obstacles that affect tactical movement (likely line-of-sight/pathing blockers). We have nothing like this. |
| **Selection stability** | `selection/stableOwlbearSelectionResolver.js` (new), `hud/runtime/runtimeRefreshCoordinator.js` (new), `scripts/unit/stable-owlbear-selection-resolver.test.mjs`, `scripts/selection-light-runtime.test.mjs`, `scripts/runtime-refresh-coordinator.test.mjs` | A debounce/coalescing layer around OBR's own token-selection events + a coordinator that tracks "is a runtime refresh currently in flight" (`combatRuntimePending`) to gate HUD interaction during a refresh. This is a real robustness improvement over our current per-ability `pendingXActionId` pattern — see §Skills Block. |
| **RPC error normalization** | `utils/rpcErrorNormalizer.js` (new), `bridge/supabaseBridge.js` | A generic `normalizeRpcError`/`toRpcException` helper, used by the compact-attack-mode work. We don't have an equivalent generic normalizer (each of our payload modules does its own light `describeError`). |
| **Debug Console tweaks** | `hud/debug/DebugConsolePanel.js`, `debugConsole.css`, `debugConsoleConstants.js`, `debugConsoleController.js`, `debugLogStore.js` | Minor — header comment is byte-identical to ours ("TEMPORARY, fully isolated... designed to be deleted later"), so this is incremental polish on the same shared component, not a redesign. |
| **Compact attack display** | `scripts/attack-compact-mode.test.mjs` (new), `screens/resolveAttack/resolveAttackService.js` | A "compact mode" formatting option for attack results, layered on the existing `resolveAttackService`/`basicAttackPayload` pipeline we also use. |
| **Combat session lifecycle** | `supabase/117_end_combat_scene_scope.sql`, `scripts/unit/end-combat-scope.test.mjs`, `scripts/unit/combat-participation-invariants.test.mjs` | Scopes "end combat" to the current scene rather than globally, plus new invariant tests for participation state. |
| **Escape-to-cancel targeting** | `hud/targeting/targetSelectionController.js` (+11 lines) | Small, purely additive: `Escape` now cancels an in-progress target pick, logged via the existing Debug Console event pipeline. No rendering/animation change at all. |
| **Character screen** | `screens/character/characterScreen.js` (+431/-?) | Large but outside our scope — a different screen entirely (character sheet editing, not combat HUD). |
| **Master dump** | `supabase/odyssey_supabase.sql` (+3703) | The full-schema reference dump, regenerated to match upstream's own migration set. Not a source of truth for either side's actual applied migrations. |

## Our-Only Changes

44 files, `+6820/-1455` lines. All of it is the work already reported in this
session's own prior turns:
- `docs/PHASE_4_1B_0` through `PHASE_4_1B_4` audit docs, plus
  `TACTICAL_MOVE_HUD_REFRESH_AUDIT.md`, `TARGET_RING_ANIMATION_AUDIT.md`,
  `BODY_THRESHOLD_AND_ROLL_TRACE_AUDIT.md`.
- `supabase/108_direct_ability_attack_session_gate.sql`,
  `109_toggle_ability_execution.sql` (our own numbering — collides with
  upstream's unrelated same-numbered files, see §Supabase Migrations).
- `hud/abilities/abilityAvailabilityPolicy.js`, `AbilityTooltip.js`,
  `abilityRuntimeMapper.js`, `hud/combat/toggleAbilityPolicy.js`,
  `toggleAbilityPayload.js`, `hud/log/combatResultLogPolicy.js` — the
  classification/execution/logging layer for Direct Attack / Instant/Self /
  Directed Target / Toggle / Passive / Unsupported.
- Corresponding test suites (`direct-ability-attack.test.mjs`,
  `instant-self-ability.test.mjs`, `directed-target-ability.test.mjs`,
  `toggle-ability.test.mjs`, `passive-unsupported-ability.test.mjs`, plus
  fixture updates in `abilities-quickbar-ui.test.mjs`,
  `attack-technique-armed.test.mjs`, `skills-runtime-states.test.mjs`).
- Ability Studio was built and then fully reverted within this same commit
  range (net files: zero — confirmed no Ability Studio file appears in
  either side's current tree).

## Overlapping Files and Conflict Risk

Files changed on **both** sides since merge-base (`comm -12` of the two
file-lists):

| File | Ours | Upstream | Risk |
|---|---|---|---|
| `hud/scene/sceneSelectionController.js` | +167/-? (toggle handler + debug events) | **+2286 lines** (weapon-switch dispatch, obstacle interplay, selection-resolver wiring) | **HIGH** — by far the largest, most central file on both sides. Any future merge here is a real, careful hand-merge, not a fast-forward. |
| `hud/abilities/QuickbarView.js` | +75/-? (toggle/passive/unsupported branches) | +65/-? (**removed** the entire `gmAdmin`/GM-delete-menu feature, changed `occupiedTile`'s 5th parameter from a `gmAdmin` object to a `syncPending` boolean) | **HIGH** — see §Skills Block. Not just line-churn, a genuine signature/feature divergence. |
| `hud/components/SkillBlock.js` | +15/-? | +29/-? (same GM-delete-menu removal, `renderSkillBlock(state)` dropped its second `opts` parameter entirely) | **HIGH** — same root cause as QuickbarView.js. |
| `hud/components/CombatHudModule.js` | +27/-? (toggle click case + hover-selector) | +173/-? (weapon-switch busy-state handling, likely GM-menu removal follow-through) | **MEDIUM-HIGH** — largest upstream churn among the "our phase work" files. |
| `hud/scene/selectionState.js` | +6 (pendingToggleAbilityActionId) | +6 (new `revision`/`reason`/`weaponSwitchInFlight`/`combatRuntimePending` broadcast fields) | **LOW-MEDIUM** — small, additive on both sides, no field-name collisions found. |
| `hud/runtime/runtimeBundleMapper.js` | +2/-? (an em-dash typo fix, from the 2026-07-09 sync validation) | +43/-? (weapon-switch-related runtime context fields) | **LOW** — our change is a one-line cosmetic fix, easy to re-apply on top of anything. |
| `movement/moveToolController.js` | +2/-? (Pages-host icon URL, deploy identity) | +92/-? (obstacle-drawing integration) | **LOW** — our change is purely a deploy-identity constant, trivially portable. |
| `scripts/abilities-quickbar-ui.test.mjs`, `scripts/instant-self-ability.test.mjs` | fixture updates for toggle/passive reclassification | upstream's own updates for their `syncPending`/GM-menu-removal signature change | **MEDIUM** — both sides changed the SAME fixtures for DIFFERENT reasons; a real merge would need both sets of changes reconciled by hand. |
| Manifests/`index.html`/`background.html`/`combat-hud-overlay.html`/bundles/`package.json` | deploy-identity + version bumps | upstream's own deploy identity + version bumps + new test entries | **LOW** (expected, deploy-identity only — see §Deployment) |

## Battle Log / Combat Log Comparison

**This is the single most consequential finding for the user's stated next
phase.**

`hud/components/BattleLogBlock.js`, `hud/core/combatHudSelectors.js`
(`selectCompactBattleLog`), `hud/components/CombatHudLayout.js`, and the
whole `hud/adapters/*`/`hud/models/*`/`hud/core/*` mock-scenario harness
**already exist, byte-identical, in both `origin/main` and `upstream/main`**
— confirmed via `git diff 8958a3a upstream/main -- hud/components/BattleLogBlock.js`
returning zero lines, and the same file existing at the merge-base itself.
**Neither side has touched this rendering layer since the fork.** This means
it predates the whole Phase 3E.0/4.0/4.1 series and is genuinely shared,
foundational code — not an "upstream feature" in the sense the task asked
about, but it IS directly relevant to "has Battle Log already been
implemented."

More importantly: **our own log-entry builders are already wired into it.**
Reading `BattleLogBlock.js`'s `renderBattleLogPanel(state)`:

```js
function selectRecentLogEntries(state) {
  const raw = state?.snapshot?.battleLog?.entries ?? [];
  if (raw.length && Array.isArray(raw[0]?.details)) return raw.slice(0, 5);
  return selectCompactBattleLog(state);
}
```

— it already has an explicit branch (with a comment naming
`hud/log/combatResultLogPolicy.js` by file path) for exactly the entry shape
`{timestamp, type, outcome, title, details, sourceCharacterId, targetCharacterId}`
our own `buildAttackLogEntry`/`buildAbilityExecutionLogEntry`/
`buildDirectedAbilityLogEntry`/`buildToggleAbilityLogEntry`/
`buildReloadLogEntry`/`buildFireModeLogEntry` all produce. And
`hud/scene/selectionState.js` already folds `ephemeral.combatLog` (populated
by every `pushLog(...)` call across all our phase work) into
`hudSnapshot.battleLog.entries` for exactly this component to read. The
plumbing described in the user's own stated vision — "compact visible line...
expandable details... Debug Console remains technical, Battle Log remains
player-readable" — is **already assembled and already receiving real data**
from every ability/attack/reload/fire-mode action this session implemented.

What it does NOT yet have, reading `entryRow()`:
- No expand/collapse per entry — each entry always renders its title + all
  detail lines at once (no "compact line, click to expand" interaction).
- No turn/round grouping.
- No distinct rendering for toggle activation/deactivation vs a plain
  ability use (both go through the same generic `details`-array branch —
  functionally fine, but the "Activated X."/"Deactivated X." text is
  currently indistinguishable in styling from "Used X.").
- The floating panel shows only the 5 most recent entries with no
  scroll/expand for older history (by design, per its own header comment:
  "the 3–5 most recent PUBLIC entries").

**Classification: compatible with our vision, needs adaptation — NOT
"not implemented."** The foundational plumbing (data flow, safe-entry shape,
Debug-Console/Battle-Log separation, no raw JSON) is already exactly what the
user's vision describes; what's missing is presentation polish (expand/
collapse, turn grouping, roll/damage breakdown formatting) layered on top of
already-working data flow, not a new system built from scratch.

**Recommendation: investigate/verify live, then adapt — do not rebuild.**
Before any Battle Log phase, the very first step should be a live Owlbear
check of whether `renderBattleLogPanel` is actually visible/toggleable in the
current HUD layout (its own toggle command is `data-action="toggle-log"` per
its source) — this audit did not run a live browser check (documentation-only
task, per instructions), so this is a "confirm before building" item, not a
confirmed-working claim.

## Skills Block / Ability Execution Comparison

Upstream has **zero** knowledge of any of our 5 newest execution classes.
`git grep` across `upstream/main` for `isToggleAbility`, `isPassiveAbility`,
`isUnsupportedAbility`, `deriveToggleAvailability`, and
`activation_type = 'toggle'` all return zero matches. Upstream's own
`odyssey_get_character_quick_actions_runtime`/`combat_execute_action` are
still exactly at the shared-ancestor's classification (`attack_technique` /
`directed` / `instant` only) plus their own weapon-switch-related fields —
no `toggle`/`passive` type was ever added on their side.

The real overlap is architectural, not feature-level: **upstream removed the
GM inline-delete-menu feature from the quickbar** (`gmDeleteMenu()` deleted
from `QuickbarView.js`; `occupiedTile()`'s 5th parameter changed from a
`gmAdmin` object to a `syncPending` boolean; `renderSkillBlock()` dropped its
entire second `opts` parameter, including `openSkillsMenu`/
`pendingGmDeleteId`). We still actively use this feature (GM can delete a
skill/ability directly from its quickbar tile) — our own toggle/passive/
unsupported branches were built assuming the OLD 5-arg signature is
intact. **Conflict level 4 (architectural conflict)**: not dangerous today
(nothing upstream did can reach our repo without an explicit sync), but a
real decision point if a sync is ever attempted — either we lose GM-delete
convenience, or we'd need to port upstream's `syncPending`/
`combatRuntimePending` concept into our still-alive `gmAdmin` shape by hand.

Separately, upstream's new `syncPending`/`combatRuntimePending` concept (a
global "is a runtime refresh currently in flight" flag that disables the
whole quickbar, backed by their new `runtimeRefreshCoordinator.js` +
`stableOwlbearSelectionResolver.js`) is a genuinely good robustness idea we
don't have an equivalent for — our own pending-state tracking is per-ability
(`pendingDirectAbilityActionId`/`pendingInstantAbilityActionId`/etc.), which
is more granular but doesn't protect against a stale-runtime race during the
brief window between an action's success and the subsequent
`refetchCurrent()` resolving. **Conflict level 2 (compatible, needs
adaptation)** — worth considering for a future robustness pass, independent
of any broader sync.

## Targeting / Target Ring Comparison

Only one small, additive change upstream: `Escape` now cancels an
in-progress target pick (`hud/targeting/targetSelectionController.js`,
+11 lines, a `keydown` listener calling the existing `onCancel()`). **No
change to target-ring rendering, geometry, or animation at all.** Fully
compatible with our "target ring must remain static, local-only,
non-animated" requirement — this doesn't touch the ring itself, only the
picking-mode lifecycle. **Conflict level 1 (compatible, can adopt
directly)** if we ever want the same UX convenience — genuinely low-risk,
small, self-contained.

## Tactical Movement Comparison

Upstream added a real new mechanic — obstacle drawing/tracking
(`movement/drawingObstacles.js`, new, plus `movement/moveToolController.js`
integration, `scripts/unit/combat-drawing-obstacles.test.mjs`). This appears
to be line-of-sight/pathing blockers for tactical movement, something we
have no equivalent for at all. Our own change to `moveToolController.js`
since merge-base is a single-line deploy-identity constant (the hardcoded
`MOVE_TOOL_ICON_URL`), unrelated and trivially compatible. **Conflict level 0
for our own change** (no real overlap in intent, just incidental proximity
in the same file); the obstacle-drawing feature itself is **conflict level 2
(compatible, needs adaptation)** IF we ever want it — it's additive to
tactical move, not a replacement of the custom backend-authoritative movement
model our vision requires. Not investigated further (out of this audit's
declared focus — MOVE display/color-only requirement is untouched by it).

## Supabase Migration Comparison

1. **Upstream-only migration files**: `108_weapon_switch_and_full_move_reload.sql`,
   `109_weapon_switch_runtime_context_and_hud_fixes.sql`,
   `110_readonly_quick_actions_and_armory_hotfix.sql`,
   `111_drop_ambiguous_get_character_armory_overload.sql`,
   `112_armory_runtime_and_abilities_ambiguity_hotfix.sql`,
   `113_combat_execute_action_busy_stage.sql`,
   `114_combat_execute_action_use_ability_refresh_fix.sql`,
   `115_perform_attack_feed_mode_profile_hotfix.sql`,
   `116_inventory_reload_ui_resource_wrapper.sql`,
   `117_end_combat_scene_scope.sql`,
   `118_fix_duplicate_active_encounters_and_weapon_switch.sql`,
   `118_fix_switch_active_weapon_safe_swap.sql` (upstream itself has TWO
   different `118`-numbered files — an internal collision on their own side,
   not ours), `119_free_weapon_switch_and_selection_logs.sql`,
   `120_readonly_armory_context_hotfix.sql`. **11 files we don't have at
   all.**
2. **Our-only migration files**: `108_direct_ability_attack_session_gate.sql`,
   `109_toggle_ability_execution.sql`.
3. **Same number, different content**: **YES — both `108` and `109`
   collide.** Ours are the direct-ability-attack session gate and the toggle
   execution contract; upstream's are weapon-switch foundation and
   weapon-switch runtime-context fixes. Confirmed by diffing file contents —
   completely unrelated SQL. This is the same class of collision already
   handled once before (the original `102` collision from the 2026-07-09
   sync) — **HIGH RISK if a sync is ever attempted**, would require
   renumbering our two files again (to `121`/`122` or similar) exactly like
   the prior renumbering exercise.
4. **Migrations after our current version**: yes, all 11 upstream-only files
   listed above (108 through 120) postdate anything we have.
5. **Overlapping RPCs**: `combat_execute_action` (both sides redefine it
   independently — upstream's last word is migration `114`, ours is `109`);
   `perform_attack` is touched only by us (`108`), not upstream. No RPC name
   collisions beyond the two functions both sides already shared before the
   fork.
6. **Direct answers**:
   - `combat_execute_action`: modified by BOTH sides independently since
     merge-base (upstream: busy-stage tracking + refresh fix; ours: toggle
     routing). Neither side's changes touch the SAME internal logic (upstream
     didn't add lock-stage tracking to the parts we changed, and vice versa),
     but any future sync would need OUR toggle-routing patch re-applied onto
     upstream's `114` body, not blindly merged.
   - `perform_attack`: modified only by us (session-gate fix). Upstream's
     own `perform_attack` still has the bug we fixed — confirmed absent from
     their commit set.
   - `odyssey_get_character_quick_actions_runtime`: modified only by us
     (toggle type + `is_active` derivation). Not touched upstream at all in
     this range.
   - Toggle ability execution / combat sessions / battle log / event
     history: none of these exist in upstream's new commits — toggle is 100%
     ours; combat-session-lifecycle got a scene-scoping fix upstream
     (`117`) unrelated to our work; Battle Log is shared/dormant code from
     BEFORE the fork (see §Battle Log), not new upstream work.

No migrations were applied, edited, or run against any remote database as
part of this audit.

## Deployment / Version / Manifest Differences

Both sides' manifest/`index.html`/`background.html`/`combat-hud-overlay.html`/
bundle changes are exactly what's expected from independent deploy-identity
maintenance: version bumps and `?v=` cache-buster updates on each side's own
release cadence, plus upstream's own Pages host in their manifests (vs ours
pointing at `limonety995-maker.github.io`). `package.json`'s `test:hud` list
differs because each side added its own new test files. **No deployment-only
noise was mistaken for a feature change** in this audit — every bundle diff
mentioned above was traced back to a source-file change first; the only
bundle-only file with no accompanying source change on either side is the
master SQL dump (`supabase/odyssey_supabase.sql`), which is a generated
reference artifact, not hand-written source.

## Compatibility With Our Vision

| Vision point | Upstream status |
|---|---|
| 1. Server/runtime authoritative combat actions | Unaffected — upstream's changes reinforce this (busy-stage tracking, refresh fixes are ABOUT making the authoritative path more robust, not less). |
| 2. HUD never fakes combat effects client-side | Unaffected. |
| 3. Skills Block's 7 classes (ARMED/Direct/Instant/Directed/Toggle/Passive/Unsupported) | Upstream has none of the last 3; would need to be re-ported on top of upstream's `QuickbarView.js`/`SkillBlock.js` signature changes if ever synced. |
| 4. Ability Studio must not return | Upstream never had it; no risk from upstream's side. |
| 5. Target ring static/local/non-animated | Untouched by upstream — fully compatible. |
| 6. Tactical Move custom backend-authoritative | Upstream ADDED to this (obstacles) without replacing the model — compatible if ever adopted. |
| 7. MOVE color-only display | Untouched by upstream. |
| 8. Battle Log player-readable/compact/expandable, separate from Debug Console | Foundational plumbing for this ALREADY EXISTS and is ALREADY WIRED to our own log entries (see §Battle Log) — just missing the expand/collapse and turn-grouping polish the vision describes. |
| 9. Debug Console technical traces | Upstream's Debug Console is the same shared component, lightly polished; unaffected. |
| 10. No automatic remote migrations | Unaffected by this audit (no migrations were applied). |

## Recommended Action Plan

| Area | Upstream approach | Our approach | Conflict level | Recommendation |
|---|---|---|---|---|
| Battle Log | Same dormant, shared component as ours (predates fork) | Already feeding it real entries via `combatResultLogPolicy.js` | 0 (shared code) | **Investigate live first** — confirm it actually renders in Owlbear today, then adapt (expand/collapse, turn grouping) rather than rebuild |
| Skills Block GM-delete-menu | Removed entirely; `syncPending` replaces `gmAdmin` | Still fully alive, extended through Toggle/Passive/Unsupported | 4 | **Needs manual decision** if sync is ever attempted — do not silently adopt upstream's removal |
| Toggle / Passive / Unsupported | Not implemented at all | Fully implemented, tested, this session | 0 | **Continue our plan** — no upstream conflict exists |
| Weapon switching | New full mechanic | Not implemented | 2 | **Investigate later** — real feature gap, not urgent |
| Tactical Move obstacles | New mechanic, additive | Not implemented | 2 | **Investigate later** |
| Target Ring | +Escape-to-cancel only | Static/local/non-animated (unchanged) | 1 | **Adopt now** if desired — trivial, safe, isolated |
| `combat_execute_action`/`perform_attack` robustness | Busy-stage + refresh-fix (114); no session-gate fix | Session-gate fix (108) + toggle routing (109) | 3 | **Adapt later** — re-diff our patches against upstream's `114` body if a sync is ever attempted |
| Migration numbering 108/109 | Weapon-switch content | Ability-attack/toggle content | 5 (numbering collision, not logic conflict) | **Needs manual decision** at sync time — renumber ours, same as the prior 102 collision |
| Selection/refresh robustness (`syncPending`) | New global in-flight-refresh gate | Per-ability pending flags only | 2 | **Investigate later** — genuinely useful idea |
| RPC error normalizer | New generic `rpcErrorNormalizer.js` | Ad-hoc per-module `describeError` | 2 | **Investigate later** — low priority polish |

## Risks

- **Migration renumbering will be needed again** if a sync is ever attempted
  — this is now the THIRD time (102, then 108/109) the two repos have
  independently claimed the same migration numbers. Consider, for a future
  sync, agreeing on a numbering convention up front (e.g., reserve a number
  range) rather than resolving collisions after the fact each time.
- **`sceneSelectionController.js` has grown very large on both sides
  independently** (+2286 upstream, +167 ours since merge-base, on top of an
  already-substantial shared base) — a genuine hand-merge here would be a
  significant, error-prone undertaking, not a mechanical one.
- **The GM-delete-menu removal is a real feature-parity question**, not just
  a technical merge conflict — the user/GM workflow depends on whether that
  feature is still wanted going forward.
- This audit sampled key files/migrations rather than reading every line of
  every one of the 93 upstream-only-changed files — deep verification of any
  SPECIFIC upstream feature (e.g. the exact weapon-switch cost/session-log
  semantics) should happen at the point that feature is actually being
  considered for adoption, not preemptively here.

## Questions for the user

1. Do you want a live Owlbear check of `BattleLogBlock.js` (confirm it
   renders `combatLog` entries today) as the very first step of the planned
   Battle Log phase, before any new code is written?
2. Is the GM inline-delete-menu (delete a skill/ability straight from its
   quickbar tile) something you still want to keep long-term, given upstream
   removed it? This matters for any future sync decision.
3. Do you want weapon-switching and/or tactical-move obstacle-drawing
   evaluated as candidate features to port later, or are they out of scope
   for this fork's direction entirely?
4. Should a future sync reserve non-overlapping migration-number ranges
   between the two repos to stop the recurring collision, or is renumbering
   at sync time an acceptable recurring cost?

## Appendix: Raw Commands and Outputs

Key commands run for this audit (outputs summarized above; full outputs were
inspected during the session but are not reproduced verbatim here to keep
this document a reasonable size):

```bash
git fetch upstream main
git fetch origin main
git rev-parse origin/main            # 6627d6226e3923686f1ab99cec73fab94715c8d7
git rev-parse upstream/main          # 04e0c4cf46ddf8141a6102ea59d0a3859437bb3e
git merge-base origin/main upstream/main   # 8958a3ab3e9671af9b9684bff5c93c470a9e84c0
git rev-list --count origin/main..upstream/main    # 41
git rev-list --count upstream/main..origin/main    # 111
git log --oneline --decorate -20 origin/main
git log --oneline --decorate -20 upstream/main
git diff --stat origin/main...upstream/main        # 93 files, +21461/-2041
git diff --stat upstream/main...origin/main        # 44 files, +6820/-1455
git diff --name-status origin/main...upstream/main
git diff --name-status upstream/main...origin/main
git diff --name-only origin/main...upstream/main | sort > upstream_files.txt
git diff --name-only upstream/main...origin/main | sort > ours_files.txt
comm -12 upstream_files.txt ours_files.txt         # 22 overlapping files
git grep -n "isToggleAbility\|isPassiveAbility\|isUnsupportedAbility" upstream/main -- 'hud/*' 'supabase/*'   # zero matches
git diff 8958a3a upstream/main -- hud/components/BattleLogBlock.js         # zero lines (unchanged since fork)
git cat-file -e origin/main:hud/components/BattleLogBlock.js && echo YES   # YES — exists in our repo too
git show upstream/main:supabase/113_combat_execute_action_busy_stage.sql
git show upstream/main:supabase/114_combat_execute_action_use_ability_refresh_fix.sql
git show upstream/main:supabase/115_perform_attack_feed_mode_profile_hotfix.sql
git diff 8958a3a upstream/main -- hud/abilities/QuickbarView.js
git diff 8958a3a upstream/main -- hud/components/SkillBlock.js
git diff 8958a3a upstream/main -- hud/scene/selectionState.js
git diff 8958a3a upstream/main -- hud/targeting/targetSelectionController.js
```
