const SQRT3 = Math.sqrt(3);

export function normalizeObrGridType(value) {
  switch (String(value ?? "").trim().toUpperCase()) {
    case "SQUARE":
      return "square";
    case "HEX_VERTICAL":
      return "hex_vertical";
    case "HEX_HORIZONTAL":
      return "hex_horizontal";
    default:
      return "";
  }
}

export function normalizeDistanceMode(gridType, measurement) {
  const tacticalType = normalizeObrGridType(gridType);
  if (tacticalType === "hex_vertical" || tacticalType === "hex_horizontal") {
    return "hex";
  }
  switch (String(measurement ?? "").trim().toUpperCase()) {
    case "CHEBYSHEV":
      return "chebyshev";
    case "MANHATTAN":
      return "manhattan";
    default:
      return "";
  }
}

export function isSupportedObrGrid(grid) {
  return Boolean(
    normalizeObrGridType(grid?.type) &&
    normalizeDistanceMode(grid?.type, grid?.measurement) &&
    Number(grid?.dpi) > 0,
  );
}

export function normalizeTacticalGridSettings(raw) {
  if (!raw || typeof raw !== "object") return null;
  const gridType = String(raw.grid_type ?? raw.gridType ?? "").trim().toLowerCase();
  const distanceMode = String(raw.distance_mode ?? raw.distanceMode ?? "").trim().toLowerCase();
  const gridDpi = Number(raw.grid_dpi ?? raw.gridDpi ?? 0) || 0;
  const metersPerCell = Number(raw.meters_per_cell ?? raw.metersPerCell ?? 1) || 1;
  const anchorX = Number(raw.anchor_scene_x ?? raw.anchorSceneX ?? 0) || 0;
  const anchorY = Number(raw.anchor_scene_y ?? raw.anchorSceneY ?? 0) || 0;
  if (!gridType || !distanceMode || gridDpi <= 0 || metersPerCell <= 0) {
    return null;
  }
  return {
    gridType,
    distanceMode,
    gridDpi,
    metersPerCell,
    anchor: { x: anchorX, y: anchorY },
    updatedAt: String(raw.updated_at ?? raw.updatedAt ?? "").trim(),
  };
}

function cubeRound({ x, y, z }) {
  let rx = Math.round(x);
  let ry = Math.round(y);
  let rz = Math.round(z);

  const xDiff = Math.abs(rx - x);
  const yDiff = Math.abs(ry - y);
  const zDiff = Math.abs(rz - z);

  if (xDiff > yDiff && xDiff > zDiff) {
    rx = -ry - rz;
  } else if (yDiff > zDiff) {
    ry = -rx - rz;
  } else {
    rz = -rx - ry;
  }

  return { x: rx, y: ry, z: rz };
}

function axialRound(q, r) {
  const cube = cubeRound({ x: q, y: -q - r, z: r });
  return { q: cube.x, r: cube.z };
}

function getSquareCellCenterAnchor(settings) {
  return {
    x: Number(settings.anchor?.x ?? 0) || 0,
    y: Number(settings.anchor?.y ?? 0) || 0,
  };
}

export function getSquareCellScenePosition(grid, cell) {
  const settings = normalizeTacticalGridSettings(grid);

  if (
    !settings
    || settings.gridType !== "square"
    || !cell
  ) {
    return null;
  }

  const q = Number(cell.q ?? cell.cell_q ?? 0) || 0;
  const r = Number(cell.r ?? cell.cell_r ?? 0) || 0;
  const anchor = getSquareCellCenterAnchor(settings);

  return {
    x: anchor.x + q * settings.gridDpi,
    y: anchor.y + r * settings.gridDpi,
  };
}

export function getSquareCellFromScenePosition(grid, position) {
  const settings = normalizeTacticalGridSettings(grid);

  if (
    !settings
    || settings.gridType !== "square"
    || !position
  ) {
    return null;
  }

  const anchor = getSquareCellCenterAnchor(settings);
  return {
    q: Math.round(
      ((Number(position.x) || 0) - anchor.x) / settings.gridDpi,
    ),
    r: Math.round(
      ((Number(position.y) || 0) - anchor.y) / settings.gridDpi,
    ),
  };
}

export function sceneToCell(grid, position) {
  const settings = normalizeTacticalGridSettings(grid);
  if (!settings || !position) return null;

  if (settings.gridType === "square") {
    return getSquareCellFromScenePosition(settings, position);
  }

  const x = (Number(position.x) || 0) - settings.anchor.x;
  const y = (Number(position.y) || 0) - settings.anchor.y;

  if (settings.gridType === "hex_vertical") {
    const size = settings.gridDpi / SQRT3;
    const q = ((SQRT3 / 3) * x - (1 / 3) * y) / size;
    const r = ((2 / 3) * y) / size;
    return axialRound(q, r);
  }

  if (settings.gridType === "hex_horizontal") {
    const size = settings.gridDpi / SQRT3;
    const q = ((2 / 3) * x) / size;
    const r = ((-1 / 3) * x + (SQRT3 / 3) * y) / size;
    return axialRound(q, r);
  }

  return null;
}

export function cellToScene(grid, cell) {
  const settings = normalizeTacticalGridSettings(grid);
  if (!settings || !cell) return null;
  const q = Number(cell.q ?? cell.cell_q ?? 0) || 0;
  const r = Number(cell.r ?? cell.cell_r ?? 0) || 0;

  if (settings.gridType === "square") {
    return getSquareCellScenePosition(settings, { q, r });
  }

  if (settings.gridType === "hex_vertical") {
    const size = settings.gridDpi / SQRT3;
    return {
      x: settings.anchor.x + size * SQRT3 * (q + r / 2),
      y: settings.anchor.y + size * 1.5 * r,
    };
  }

  if (settings.gridType === "hex_horizontal") {
    const size = settings.gridDpi / SQRT3;
    return {
      x: settings.anchor.x + size * 1.5 * q,
      y: settings.anchor.y + size * SQRT3 * (r + q / 2),
    };
  }

  return null;
}

export function snapSquarePointerToCellCenter(grid, pointerPosition) {
  const settings = normalizeTacticalGridSettings(grid);

  if (
    !settings
    || settings.gridType !== "square"
    || !pointerPosition
  ) {
    return null;
  }

  const cell = getSquareCellFromScenePosition(settings, pointerPosition);
  if (!cell) {
    return null;
  }

  return {
    cell,
    scene: getSquareCellScenePosition(settings, cell),
  };
}

export function buildStraightSquarePath(fromCell, toCell) {
  if (!fromCell || !toCell) return [];

  let q = Number(fromCell.q ?? fromCell.cell_q ?? 0) || 0;
  let r = Number(fromCell.r ?? fromCell.cell_r ?? 0) || 0;
  const targetQ = Number(toCell.q ?? toCell.cell_q ?? 0) || 0;
  const targetR = Number(toCell.r ?? toCell.cell_r ?? 0) || 0;

  const path = [{ q, r }];

  while (q !== targetQ || r !== targetR) {
    if (q < targetQ) q += 1;
    else if (q > targetQ) q -= 1;

    if (r < targetR) r += 1;
    else if (r > targetR) r -= 1;

    path.push({ q, r });
  }

  return path;
}

export function computeDistanceCells(grid, fromCell, toCell) {
  const settings = normalizeTacticalGridSettings(grid);
  if (!settings || !fromCell || !toCell) return 0;
  const fromQ = Number(fromCell.q ?? fromCell.cell_q ?? 0) || 0;
  const fromR = Number(fromCell.r ?? fromCell.cell_r ?? 0) || 0;
  const toQ = Number(toCell.q ?? toCell.cell_q ?? 0) || 0;
  const toR = Number(toCell.r ?? toCell.cell_r ?? 0) || 0;
  const dx = Math.abs(toQ - fromQ);
  const dy = Math.abs(toR - fromR);

  if (settings.gridType === "square") {
    return settings.distanceMode === "manhattan"
      ? dx + dy
      : Math.max(dx, dy);
  }

  return (dx + dy + Math.abs((toQ + toR) - (fromQ + fromR))) / 2;
}

export function computeMoveCostMeters(grid, fromCell, toCell) {
  const settings = normalizeTacticalGridSettings(grid);
  if (!settings) return 0;
  return computeDistanceCells(settings, fromCell, toCell) * settings.metersPerCell;
}

export function sameCell(a, b) {
  if (!a || !b) return false;
  return (
    (Number(a.q ?? a.cell_q ?? 0) || 0) === (Number(b.q ?? b.cell_q ?? 0) || 0) &&
    (Number(a.r ?? a.cell_r ?? 0) || 0) === (Number(b.r ?? b.cell_r ?? 0) || 0)
  );
}
