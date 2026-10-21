import type { ParamKey } from "./params";

/**
 * The common settings: the kinds of setting that many effects have, such as
 * Pan X or Opacity. Each effect shows its common settings under a Common
 * heading, at the bottom of its group. A MIDI control assigned to one of
 * them moves that setting in every effect (see commonKeys).
 */
export type CommonRole = "panX" | "panY" | "zoom" | "rotation" | "opacity";

/** The common settings in the order they show, with their shared names. */
export const COMMON_ROLES: readonly (readonly [CommonRole, string])[] = [
  ["panX", "Pan X"], ["panY", "Pan Y"], ["zoom", "Zoom"], ["rotation", "Rotation"], ["opacity", "Opacity"]
];

/**
 * The settings that are common settings, and their kind. Trails' Zoom and
 * Turn are not: they move the picture a little more each frame, not once.
 */
const ROLES: Partial<Record<ParamKey, CommonRole>> = {
  panX: "panX", mapPanX: "panX", mobiusPanX: "panX",
  panY: "panY", mapPanY: "panY", mobiusPanY: "panY",
  zoom: "zoom", mapScale: "zoom", juliaZoom: "zoom", mobiusZoom: "zoom",
  rotation: "rotation", mapAngle: "rotation", mobiusTurn: "rotation", drosteRotation: "rotation",
  foldOpacity: "opacity", mapOpacity: "opacity", warpOpacity: "opacity", smearAmount: "opacity", contourOpacity: "opacity",
  driverAmount: "opacity", cameraAmount: "opacity", sortAmount: "opacity", particleAmount: "opacity", overlayOpacity: "opacity"
};

/** The kind of common setting that "key" is, or undefined for a setting of its effect's own. */
export function commonRole(key: ParamKey): CommonRole | undefined {
  return ROLES[key];
}

/** Every setting of the same kind as "key" (with "key" itself), or only "key" when it is not a common setting. */
export function commonKeys(key: ParamKey): ParamKey[] {
  const role = ROLES[key];
  return role ? (Object.keys(ROLES) as ParamKey[]).filter((each) => ROLES[each] === role) : [key];
}

/** The shared name of the kind of common setting that "key" is. */
export function commonName(key: ParamKey): string | undefined {
  const role = ROLES[key];
  return COMMON_ROLES.find(([each]) => each === role)?.[1];
}

/**
 * Splits an effect's settings: its own settings, in their order, and its
 * common settings, in the order of COMMON_ROLES.
 */
export function splitCommon(keys: readonly ParamKey[]): { own: ParamKey[]; common: ParamKey[] } {
  const order = (key: ParamKey) => COMMON_ROLES.findIndex(([role]) => role === ROLES[key]);
  return {
    own: keys.filter((key) => !ROLES[key]),
    common: keys.filter((key) => ROLES[key]).sort((a, b) => order(a) - order(b))
  };
}
