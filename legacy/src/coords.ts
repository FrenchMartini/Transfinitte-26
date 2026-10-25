/**
 * Coordinate transformations between astronomical heliocentric ecliptic frame and Three.js scene coordinates.
 *
 * Astronomical Ecliptic Frame (right-handed):
 *   +X: Vernal Equinox (in ecliptic plane)
 *   +Y: In ecliptic plane (90 degrees eastward)
 *   +Z: North Ecliptic Pole (perpendicular to ecliptic plane)
 *
 * Three.js Scene Frame (right-handed, Y-up):
 *   +X_scene = +X_ecl
 *   +Y_scene = +Z_ecl (UP)
 *   +Z_scene = -Y_ecl (FORWARD)
 *
 * Floating Origin:
 *   Positions are subtracted relative to an anchor origin in 64-bit float before conversion
 *   to avoid 32-bit single-precision floating point jitter on GPU.
 */

export type Vec3Tuple = [number, number, number];

export function eclipticToScene(
  pos: Vec3Tuple,
  origin: Vec3Tuple = [0.0, 0.0, 0.0],
  scale: number = 1.0
): Vec3Tuple {
  const dx = (pos[0] - origin[0]) * scale;
  const dy = (pos[1] - origin[1]) * scale;
  const dz = (pos[2] - origin[2]) * scale;

  const sx = Object.is(dx, -0) || dx === 0 ? 0 : dx;
  const sy = Object.is(dz, -0) || dz === 0 ? 0 : dz;
  const sz = Object.is(-dy, -0) || dy === 0 ? 0 : -dy;

  return [sx, sy, sz];
}
