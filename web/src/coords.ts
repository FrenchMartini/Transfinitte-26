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
