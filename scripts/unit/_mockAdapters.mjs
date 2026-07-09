function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function indexById(list = []) {
  return new Map(list.map((entry) => [entry.id, entry]));
}

function sourceKeyForDesired(sourceType, abilityDefId, sourceId) {
  return `${sourceType}:${abilityDefId}:${sourceId}`;
}

function normalizeWallKey(a, b) {
  const left = `${a.x},${a.y}`;
  const right = `${b.x},${b.y}`;
  return left < right ? `${left}|${right}` : `${right}|${left}`;
}

function buildWallIndex(walls = []) {
  const wallMap = new Map();
  for (const wall of walls) {
    const key = normalizeWallKey(wall.from, wall.to);
    wallMap.set(key, wall);
  }
  return wallMap;
}

function hasBlockingEdge(wallIndex, from, to) {
  const wall = wallIndex.get(normalizeWallKey(from, to));
  if (!wall) return false;
  if (wall.type === "door") return wall.state !== "open";
  return true;
}

function normalizeGeneratedAbility({
  existing,
  abilityDef,
  sourceType,
  sourceId,
  learnedLevel = 1,
  sourceRecord = null,
  data = {},
  generatedFrom = sourceType,
}) {
  const next = clone(existing ?? {});
  next.id = existing?.id ?? `gen:${sourceType}:${abilityDef.id}:${sourceId}`;
  next.ability_def_id = abilityDef.id;
  next.code = abilityDef.code;
  next.name = abilityDef.name;
  next.generated = true;
  next.source_type = sourceType;
  next.source_key = sourceKeyForDesired(sourceType, abilityDef.id, sourceId);
  next.learned_level = learnedLevel;
  next.is_enabled = true;
  next.is_hidden = false;
  next.activation_type = abilityDef.activation_type ?? "manual";
  next.ability_kind = abilityDef.ability_kind ?? "active";
  next.target_type = abilityDef.target_type ?? "self";
  next.effect_mode = abilityDef.effect_mode ?? "none";
  next.attack_type = abilityDef.attack_type ?? null;
  next.character_skill_id = sourceType === "skill" ? sourceRecord?.id ?? null : null;
  next.source_character_weapon_id = sourceType === "weapon" ? sourceRecord?.id ?? null : null;
  next.source_character_item_id = sourceType === "item" ? sourceRecord?.id ?? null : null;
  next.source_equipment_item_id = sourceType === "equipment" ? sourceRecord?.id ?? null : null;
  next.data = {
    ...(existing?.data ?? {}),
    ...data,
    generated_from: generatedFrom,
  };
  return next;
}

function hideGeneratedAbility(existing, reason) {
  return {
    ...clone(existing),
    is_enabled: false,
    is_hidden: true,
    data: {
      ...(existing?.data ?? {}),
      source_removed: true,
      source_removed_reason: reason,
    },
  };
}

export function reconcileCharacterAbilities({
  character,
  skills = [],
  perks = [],
  items = [],
  weapons = [],
  abilityDefs = [],
  existingCharacterAbilities = [],
  abilityGrants = [],
}) {
  const abilityDefById = indexById(abilityDefs);
  const desired = new Map();
  const inserted = [];
  const updated = [];
  const hidden = [];
  const unchanged = [];

  for (const skill of skills) {
    for (const abilityDef of abilityDefs) {
      if (abilityDef.linked_skill_id && abilityDef.linked_skill_id === skill.skill_def_id) {
        const key = sourceKeyForDesired("skill", abilityDef.id, skill.skill_def_id);
        desired.set(key, {
          key,
          abilityDef,
          sourceType: "skill",
          sourceId: skill.skill_def_id,
          sourceRecord: skill,
          learnedLevel: skill.level ?? 1,
          data: {},
          generatedFrom: "skill",
        });
      }
    }
  }

  for (const grant of abilityGrants) {
    const abilityDef = abilityDefById.get(grant.ability_def_id);
    if (!abilityDef) continue;

    if (grant.source_type === "perk") {
      const perk = perks.find((entry) => entry.perk_def_id === grant.source_def_id || entry.id === grant.source_def_id);
      if (!perk) continue;
      const key = sourceKeyForDesired("perk", abilityDef.id, perk.perk_def_id ?? perk.id);
      desired.set(key, {
        key,
        abilityDef,
        sourceType: "perk",
        sourceId: perk.perk_def_id ?? perk.id,
        sourceRecord: perk,
        learnedLevel: 1,
        data: {},
        generatedFrom: "perk",
      });
    }

    if (grant.source_type === "weapon") {
      for (const weapon of weapons.filter((entry) => entry.weapon_model_id === grant.source_def_id)) {
        if (grant.require_equipped && !weapon.is_equipped) continue;
        const key = sourceKeyForDesired("weapon", abilityDef.id, weapon.id);
        desired.set(key, {
          key,
          abilityDef,
          sourceType: "weapon",
          sourceId: weapon.id,
          sourceRecord: weapon,
          learnedLevel: 1,
          data: {},
          generatedFrom: "weapon_model",
        });
      }
    }

    if (grant.source_type === "item") {
      for (const item of items.filter((entry) => entry.item_def_id === grant.source_def_id && entry.type === "item")) {
        const key = sourceKeyForDesired("item", abilityDef.id, item.id);
        desired.set(key, {
          key,
          abilityDef,
          sourceType: "item",
          sourceId: item.id,
          sourceRecord: item,
          learnedLevel: 1,
          data: {},
          generatedFrom: "item",
        });
      }
    }

    if (grant.source_type === "equipment") {
      for (const item of items.filter((entry) => entry.item_def_id === grant.source_def_id && entry.type === "equipment")) {
        if (grant.require_equipped && !item.is_equipped) continue;
        const key = sourceKeyForDesired("equipment", abilityDef.id, item.id);
        desired.set(key, {
          key,
          abilityDef,
          sourceType: "equipment",
          sourceId: item.id,
          sourceRecord: item,
          learnedLevel: 1,
          data: {},
          generatedFrom: "equipment",
        });
      }
    }
  }

  const resultAbilities = [];
  const existingGeneratedByKey = new Map();

  for (const ability of existingCharacterAbilities) {
    if (ability.generated) {
      const key = ability.source_key
        ?? sourceKeyForDesired(
          ability.source_type,
          ability.ability_def_id,
          ability.source_character_weapon_id
            ?? ability.source_character_item_id
            ?? ability.source_equipment_item_id
            ?? ability.character_skill_id
            ?? ability.data?.source_def_id
            ?? "unknown",
        );
      existingGeneratedByKey.set(key, ability);
    }
  }

  for (const [key, desiredEntry] of desired.entries()) {
    const existing = existingGeneratedByKey.get(key);
    const next = normalizeGeneratedAbility({
      existing,
      abilityDef: desiredEntry.abilityDef,
      sourceType: desiredEntry.sourceType,
      sourceId: desiredEntry.sourceId,
      sourceRecord: desiredEntry.sourceRecord,
      learnedLevel: desiredEntry.learnedLevel,
      data: desiredEntry.data,
      generatedFrom: desiredEntry.generatedFrom,
    });
    resultAbilities.push(next);
    if (!existing) {
      inserted.push(next);
    } else if (JSON.stringify(existing) === JSON.stringify(next)) {
      unchanged.push(next);
    } else {
      updated.push(next);
    }
  }

  for (const ability of existingCharacterAbilities) {
    if (!ability.generated) {
      resultAbilities.push(clone(ability));
      unchanged.push(clone(ability));
      continue;
    }
    if (!desired.has(ability.source_key)) {
      let reason = "missing_source";
      if (ability.source_type === "skill") reason = "missing_skill";
      if (ability.source_type === "perk") reason = "missing_perk";
      if (ability.source_type === "item") reason = "missing_item";
      if (ability.source_type === "equipment") reason = "missing_equipment";
      if (ability.source_type === "weapon") reason = "missing_weapon";
      const hiddenAbility = hideGeneratedAbility(ability, reason);
      resultAbilities.push(hiddenAbility);
      hidden.push(hiddenAbility);
    }
  }

  const deduped = new Map();
  for (const ability of resultAbilities) {
    deduped.set(ability.id, ability);
  }

  return {
    character_id: character?.id ?? null,
    abilities: [...deduped.values()],
    inserted,
    updated,
    hidden,
    unchanged,
  };
}

export function buildQuickActionsRuntime({ abilities = [], encounter = null, characterState = {} }) {
  const quickActions = abilities
    .filter((ability) => ability.is_hidden !== true)
    .filter((ability) => ability.is_enabled !== false)
    .filter((ability) => !["passive", "automatic"].includes(ability.activation_type))
    .filter((ability) => ability.ability_kind !== "passive")
    .map((ability) => ({
      characterActionId: ability.id,
      code: ability.code,
      name: ability.name,
      sourceType: ability.source_type,
      type: ability.effect_mode === "attack" ? "attack_technique" : (ability.target_type === "self" ? "instant" : "directed"),
      state: {
        available: true,
        executionAvailable: ability.executionAvailable ?? true,
        resourceSufficient: ability.resourceSufficient ?? true,
      },
    }));

  return {
    ok: true,
    encounter_id: encounter?.id ?? null,
    is_current_turn: !!characterState.is_current_turn,
    quickActions,
  };
}

export function startEncounterMock(participants = []) {
  const sorted = clone(participants).sort((a, b) => (b.initiative ?? 0) - (a.initiative ?? 0));
  return {
    ok: true,
    round: 1,
    current_index: 0,
    participants: sorted.map((entry, index) => ({
      ...entry,
      is_current_turn: index === 0,
      move_current: entry.move_max ?? 10,
    })),
  };
}

export function endTurnMock(session) {
  const next = clone(session);
  const current = next.current_index ?? 0;
  const following = (current + 1) % next.participants.length;
  if (following === 0) next.round += 1;
  next.current_index = following;
  next.participants = next.participants.map((entry, index) => ({
    ...entry,
    is_current_turn: index === following,
    move_current: index === following ? entry.move_max : entry.move_current,
  }));
  return next;
}

export function previewPathWithWalls({ start, destination, walls = [] }) {
  const wallIndex = buildWallIndex(walls);
  const path = [clone(start)];
  let current = clone(start);

  while (current.x !== destination.x || current.y !== destination.y) {
    const stepX = Math.sign(destination.x - current.x);
    const stepY = Math.sign(destination.y - current.y);
    const next = { x: current.x + stepX, y: current.y + stepY };

    if (stepX !== 0 && stepY !== 0) {
      if (
        hasBlockingEdge(wallIndex, current, { x: current.x + stepX, y: current.y }) ||
        hasBlockingEdge(wallIndex, current, { x: current.x, y: current.y + stepY })
      ) {
        return { allowed: false, lastReachable: current, path };
      }
    }

    if (hasBlockingEdge(wallIndex, current, next)) {
      return { allowed: false, lastReachable: current, path };
    }

    current = next;
    path.push(clone(current));
  }

  return { allowed: true, lastReachable: current, path };
}

export function evaluateCombatMovement({ session, characterId, start, destination, distance, walls = [] }) {
  const participant = session.participants.find((entry) => entry.character_id === characterId);
  if (!participant?.is_current_turn) {
    return { ok: false, reason: "not_current_turn" };
  }
  if ((participant.move_current ?? 0) < distance) {
    return { ok: false, reason: "insufficient_move" };
  }
  const preview = previewPathWithWalls({ start, destination, walls });
  if (!preview.allowed) {
    return { ok: false, reason: "path_blocked", lastReachable: preview.lastReachable };
  }
  const nextSession = clone(session);
  const idx = nextSession.participants.findIndex((entry) => entry.character_id === characterId);
  nextSession.participants[idx].move_current -= distance;
  nextSession.participants[idx].position = clone(destination);
  return { ok: true, session: nextSession, preview };
}

export function resolveAttackMock({ session, attackerId, targetId, ability, roll = 50, weapon = null }) {
  const active = session.participants.find((entry) => entry.is_current_turn);
  if (!active || active.character_id !== attackerId) {
    return { ok: false, reason: "not_current_turn" };
  }
  if (!targetId) {
    return { ok: false, reason: "no_target" };
  }
  if (ability?.is_hidden || ability?.is_enabled === false) {
    return { ok: false, reason: "ability_disabled" };
  }
  let result = "success";
  if (roll >= 95) result = "critical_success";
  if (roll <= 5) result = "critical_failure";
  return {
    ok: true,
    event: {
      attacker: attackerId,
      target: targetId,
      weapon: weapon?.id ?? null,
      ability: ability?.id ?? null,
      roll,
      result,
    },
  };
}

export function fireWeaponMock({ weapon, magazine }) {
  if (!magazine || (magazine.current ?? 0) <= 0) {
    return { ok: false, reason: "empty_magazine" };
  }
  return {
    ok: true,
    weapon: clone(weapon),
    magazine: {
      ...clone(magazine),
      current: magazine.current - 1,
    },
  };
}

export function reloadWeaponMock({ weapon, reserveMagazines = [] }) {
  const nextMagazine = reserveMagazines.find((entry) => (entry.current ?? 0) > 0);
  if (!nextMagazine) {
    return { ok: false, reason: "no_reserve_magazine" };
  }
  return {
    ok: true,
    weapon: {
      ...clone(weapon),
      active_magazine_id: nextMagazine.id,
    },
    magazine: clone(nextMagazine),
  };
}

export function applyBodyDamageMock({ bodyParts = [], partKey, damage = 1, wound = "minor" }) {
  const next = clone(bodyParts);
  const part = next.find((entry) => entry.key === partKey);
  if (!part) {
    return { ok: false, reason: "missing_body_part" };
  }
  part.current_hp = Math.max(0, (part.current_hp ?? 0) - damage);
  if (wound === "minor") part.minor = (part.minor ?? 0) + 1;
  if (wound === "serious") part.serious = (part.serious ?? 0) + 1;
  if (part.current_hp <= 0) {
    part.conditions = [...(part.conditions ?? []), "disabled"];
  }
  return { ok: true, bodyParts: next };
}

export function selectTargetMock({ token, distance = 0, maxRange = Infinity }) {
  if (!token?.character_id) {
    return { ok: false, reason: "no_character_link" };
  }
  if (distance > maxRange) {
    return { ok: false, reason: "out_of_range" };
  }
  return { ok: true, target_character_id: token.character_id };
}

export function resolveCharacterAccess({ viewer, character, tokenLink }) {
  if (!tokenLink?.character_id) {
    return { status: "empty", reason: "noCharacterLink", canViewSelectedCharacter: false, canControl: false };
  }
  if (viewer?.role === "GM") {
    return { status: "ready", canViewSelectedCharacter: true, canControl: true };
  }
  if (character?.owner_player_id && character.owner_player_id === viewer?.id) {
    return { status: "ready", canViewSelectedCharacter: true, canControl: true };
  }
  return { status: "ready", canViewSelectedCharacter: false, canControl: false, reason: "notOwner" };
}

export function buildRuntimeBundleMock({
  character,
  skills = [],
  abilities = [],
  weapons = [],
  equipment = [],
  combat = null,
  bodyParts = [],
}) {
  return {
    snapshot: {
      entity: {
        summary: {
          id: character.id,
          name: character.name,
        },
        bodyParts: clone(bodyParts),
      },
      skills: clone(skills),
      abilities: clone(abilities),
      weapons: clone(weapons),
      equipment: clone(equipment),
      quickActions: buildQuickActionsRuntime({ abilities, encounter: combat, characterState: { is_current_turn: combat?.is_current_turn } }).quickActions,
      combat: combat
        ? {
            encounter_id: combat.id,
            round: combat.round,
            is_current_turn: !!combat.is_current_turn,
            move_current: combat.move_current,
            move_max: combat.move_max,
          }
        : null,
    },
  };
}
