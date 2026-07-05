function isGm(player) {
  return String(player?.role ?? "").trim().toUpperCase() === "GM";
}

export function resolveCombatMovementPermission({
  player,
  participant,
  viewerControlledCharacterIds,
}) {
  const controlledIds = viewerControlledCharacterIds instanceof Set
    ? viewerControlledCharacterIds
    : new Set(
      Array.isArray(viewerControlledCharacterIds)
        ? viewerControlledCharacterIds.map((value) => String(value ?? "").trim()).filter(Boolean)
        : [],
    );

  const characterId = String(participant?.character_id ?? "").trim();
  const playerIsGm = isGm(player);
  const controlAllowed = playerIsGm
    || participant?.control?.allowed === true
    || (characterId && controlledIds.has(characterId));
  const currentTurn = participant?.is_current_turn === true;

  if (!participant) {
    return {
      canPreview: false,
      canCommit: false,
      measureOnly: false,
      currentTurn: false,
      controlAllowed: false,
      gmOverrideActive: false,
      message: "This token is not an active combat participant.",
    };
  }

  if (!controlAllowed) {
    return {
      canPreview: false,
      canCommit: false,
      measureOnly: false,
      currentTurn,
      controlAllowed: false,
      gmOverrideActive: false,
      message: "You cannot control this combatant.",
    };
  }

  if (currentTurn) {
    return {
      canPreview: true,
      canCommit: true,
      measureOnly: false,
      currentTurn: true,
      controlAllowed: true,
      gmOverrideActive: false,
      message: "",
    };
  }

  return {
    canPreview: true,
    canCommit: false,
    measureOnly: true,
    currentTurn: false,
    controlAllowed: true,
    gmOverrideActive: false,
    message: "It is not your turn.",
  };
}
