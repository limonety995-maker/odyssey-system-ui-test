import { buildImage, buildLine, buildText } from "@owlbear-rodeo/sdk";

export const PREVIEW_LINE_ID = "com.odyssey-system/combat-movement-preview-line";
export const PREVIEW_LABEL_ID = "com.odyssey-system/combat-movement-preview-label";
export const PREVIEW_GHOST_ID = "com.odyssey-system/combat-movement-preview-ghost";

function ensureObject(value) {
  return value && typeof value === "object" ? value : {};
}

function ensureVector2(value, fallback = { x: 1, y: 1 }) {
  return {
    x: Number(value?.x ?? fallback.x ?? 1) || 1,
    y: Number(value?.y ?? fallback.y ?? 1) || 1,
  };
}

function isImageToken(item) {
  return String(item?.type ?? "").trim().toUpperCase() === "IMAGE"
    && item?.image
    && typeof item.image === "object"
    && typeof item.image.url === "string"
    && item.image.url.trim() !== "";
}

function buildGhostDebugInfo(sourceToken) {
  return {
    type: String(sourceToken?.type ?? "").trim().toUpperCase(),
    hasImage: !!(sourceToken?.image && typeof sourceToken.image === "object"),
    hasImageUrl: typeof sourceToken?.image?.url === "string" && sourceToken.image.url.trim() !== "",
    hasGrid: !!(sourceToken?.grid && typeof sourceToken.grid === "object"),
    hasPosition: !!(sourceToken?.position && typeof sourceToken.position === "object"),
  };
}

function buildGhostToken(sourceToken, position) {
  if (!isImageToken(sourceToken) || !position) return null;

  const token = ensureObject(sourceToken);
  if (!token.grid || typeof token.grid !== "object") {
    return null;
  }

  const ghost = buildImage(token.image, token.grid)
    .id(PREVIEW_GHOST_ID)
    .name("Combat Movement Ghost")
    .layer("CHARACTER")
    .locked(true)
    .disableHit(true)
    .disableAutoZIndex(true)
    .position({
      x: Number(position.x) || 0,
      y: Number(position.y) || 0,
    })
    .rotation(Number(token.rotation ?? 0) || 0)
    .scale(ensureVector2(token.scale))
    .visible(true)
    .metadata({});

  if (Array.isArray(token.disableAttachmentBehavior) && token.disableAttachmentBehavior.length) {
    ghost.disableAttachmentBehavior(token.disableAttachmentBehavior);
  }

  return ghost.build();
}

function getPreviewLabelPosition(originScene, targetScene) {
  const dx = Number(targetScene?.x ?? 0) - Number(originScene?.x ?? 0);
  const dy = Number(targetScene?.y ?? 0) - Number(originScene?.y ?? 0);
  return {
    x: Number(originScene?.x ?? 0) + dx / 2,
    y: Number(originScene?.y ?? 0) + dy / 2,
  };
}

export function buildPreviewLabel(preview) {
  if (!preview) return "";
  if (preview.blocked) {
    return `${preview.moveCostM} m / ${preview.moveLimitM} m - Path blocked`;
  }
  if (!preview.inRange) {
    return `${preview.moveCostM} m / ${preview.moveLimitM} m - Too far`;
  }
  return `${preview.moveCostM} m / ${preview.moveLimitM} m`;
}

export function buildPreviewItems({ preview, originScene, selectedToken }) {
  const lineColor = preview?.blocked
    ? "#ffb347"
    : preview?.inRange
      ? "#71f79f"
      : "#ff7c6d";
  const textColor = "#ffffff";
  const labelPosition = getPreviewLabelPosition(originScene, preview.scene);

  const line = buildLine()
    .id(PREVIEW_LINE_ID)
    .name("Combat Movement Preview")
    .layer("POINTER")
    .locked(true)
    .disableHit(true)
    .startPosition(originScene)
    .endPosition(preview.scene)
    .strokeColor(lineColor)
    .strokeOpacity(0.98)
    .strokeWidth(6)
    .strokeDash([12, 8])
    .disableAutoZIndex(true)
    .build();

  const label = buildText()
    .id(PREVIEW_LABEL_ID)
    .name("Combat Movement Label")
    .layer("TEXT")
    .locked(true)
    .disableHit(true)
    .disableAutoZIndex(true)
    .position(labelPosition)
    .textType("PLAIN")
    .plainText(buildPreviewLabel(preview))
    .fontSize(26)
    .fontWeight(700)
    .padding(10)
    .textAlign("CENTER")
    .textAlignVertical("MIDDLE")
    .fillColor(textColor)
    .fillOpacity(1)
    .strokeColor(preview?.blocked ? "#5a3200" : "#08111f")
    .strokeOpacity(1)
    .strokeWidth(6)
    .build();

  let ghost = null;
  let ghostError = null;
  try {
    ghost = buildGhostToken(selectedToken, preview.scene);
  } catch (error) {
    ghostError = error;
  }

  return {
    line,
    label,
    ghost,
    ghostError,
    ghostDebugInfo: buildGhostDebugInfo(selectedToken),
  };
}
