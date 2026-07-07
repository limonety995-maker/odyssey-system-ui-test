import { buildLine, buildShape, buildText } from "@owlbear-rodeo/sdk";

export const PREVIEW_LINE_ID = "com.odyssey-system/combat-movement-preview-line";
export const PREVIEW_LABEL_ID = "com.odyssey-system/combat-movement-preview-label";
export const PREVIEW_GHOST_ID = "com.odyssey-system/combat-movement-preview-marker";

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

export function buildPreviewLineItem(preview, originScene) {
  const lineColor = preview?.blocked
    ? "#ffb347"
    : preview?.inRange
      ? "#71f79f"
      : "#ff7c6d";

  return buildLine()
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
}

export function buildPreviewLabelItem(preview, originScene) {
  const textColor = "#ffffff";
  const labelPosition = getPreviewLabelPosition(originScene, preview.scene);

  return buildText()
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
}

export function buildPreviewMarkerItem(preview, grid) {
  const gridDpi = Math.max(Number(grid?.gridDpi ?? 0) || 0, 1);
  const size = Math.max(gridDpi - 8, 12);
  const fillColor = preview?.blocked
    ? "#ff9a2f"
    : preview?.inRange
      ? "#4fd47d"
      : "#ff5f57";
  const strokeColor = preview?.blocked
    ? "#ffd08a"
    : preview?.inRange
      ? "#d9ffe5"
      : "#ffd0cc";

  return buildShape()
    .id(PREVIEW_GHOST_ID)
    .name("Combat Movement Marker")
    .layer("POINTER")
    .locked(true)
    .disableHit(true)
    .disableAutoZIndex(true)
    .position({
      x: (Number(preview?.scene?.x ?? 0) || 0) - size / 2,
      y: (Number(preview?.scene?.y ?? 0) || 0) - size / 2,
    })
    .width(size)
    .height(size)
    .shapeType("RECTANGLE")
    .fillColor(fillColor)
    .fillOpacity(0.24)
    .strokeColor(strokeColor)
    .strokeOpacity(0.98)
    .strokeWidth(4)
    .strokeDash([])
    .build();
}

export function buildPreviewItems({ preview, originScene, grid }) {
  const line = buildPreviewLineItem(preview, originScene);
  const label = buildPreviewLabelItem(preview, originScene);
  const ghost = buildPreviewMarkerItem(preview, grid);

  return {
    line,
    label,
    ghost,
  };
}
