import type { SimulationFrame, BodyTelemetry, TugTelemetry } from './types';
import { YEAR_SECONDS, AU_METERS } from './config';

export const activeSimState = {
  time_s: 0,
  year: 0,
  frame: null as SimulationFrame | null
};

export function findBoundingFrames(
  frames: SimulationFrame[],
  time_s: number
): [number, number, number] {
  if (frames.length === 0) {
    return [0, 0, 0];
  }
  if (frames.length === 1 || time_s <= frames[0].time_s) {
    return [0, 0, 0];
  }
  const lastIdx = frames.length - 1;
  if (time_s >= frames[lastIdx].time_s) {
    return [lastIdx, lastIdx, 0];
  }

  let low = 0;
  let high = lastIdx;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (frames[mid].time_s <= time_s) {
      if (mid === lastIdx || frames[mid + 1].time_s > time_s) {
        const i0 = mid;
        const i1 = mid + 1;
        const t0 = frames[i0].time_s;
        const t1 = frames[i1].time_s;
        const alpha = t1 > t0 ? (time_s - t0) / (t1 - t0) : 0;
        return [i0, i1, Math.max(0, Math.min(1, alpha))];
      }
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return [0, 0, 0];
}

function lerp(a: number, b: number, t: number): number {
  return a + t * (b - a);
}

function interpolateBody(
  name: string,
  b0: BodyTelemetry,
  b1: BodyTelemetry,
  alpha: number,
  dtFrame_s: number,
  _tau_s: number
): BodyTelemetry {
  if (name === 'Sun' || (Math.abs(b0.x) < 0.01 && Math.abs(b0.y) < 0.01)) {
    return {
      x: 0.0,
      y: 0.0,
      z: 0.0,
      vx: 0.0,
      vy: 0.0,
      vz: 0.0,
      mass_kg: b0.mass_kg
    };
  }

  // Polar interpolation prevents chord cuts through Sun on long frame intervals
  if (dtFrame_s >= 86400.0) {
    const r0 = Math.sqrt(b0.x * b0.x + b0.y * b0.y);
    const r1 = Math.sqrt(b1.x * b1.x + b1.y * b1.y);
    const r_curr = lerp(r0, r1, alpha);

    const r_mid = Math.max(0.1, 0.5 * (r0 + r_curr));
    const omega = (2.0 * Math.PI) / (Math.pow(r_mid, 1.5) * YEAR_SECONDS);
    const expectedDeltaTheta = omega * dtFrame_s;

    const theta0 = Math.atan2(b0.y, b0.x);
    const theta1 = Math.atan2(b1.y, b1.x);

    // Exact unwrapped boundary matching: guarantees zero snapping across frame transitions
    const k = Math.round((theta0 + expectedDeltaTheta - theta1) / (2.0 * Math.PI));
    const theta1_unwrapped = theta1 + k * 2.0 * Math.PI;
    const totalDeltaTheta = theta1_unwrapped - theta0;

    const theta_curr = theta0 + alpha * totalDeltaTheta;

    const v0 = Math.sqrt(b0.vx * b0.vx + b0.vy * b0.vy);
    const v1 = Math.sqrt(b1.vx * b1.vx + b1.vy * b1.vy);
    const v_curr = lerp(v0, v1, alpha);

    return {
      x: r_curr * Math.cos(theta_curr),
      y: r_curr * Math.sin(theta_curr),
      z: lerp(b0.z, b1.z, alpha),
      vx: -v_curr * Math.sin(theta_curr),
      vy: v_curr * Math.cos(theta_curr),
      vz: lerp(b0.vz, b1.vz, alpha),
      mass_kg: b0.mass_kg
    };
  }

  return {
    x: lerp(b0.x, b1.x, alpha),
    y: lerp(b0.y, b1.y, alpha),
    z: lerp(b0.z, b1.z, alpha),
    vx: lerp(b0.vx, b1.vx, alpha),
    vy: lerp(b0.vy, b1.vy, alpha),
    vz: lerp(b0.vz, b1.vz, alpha),
    mass_kg: b0.mass_kg
  };
}

function interpolateTug(
  t0?: TugTelemetry | null,
  t1?: TugTelemetry | null,
  alpha?: number
): TugTelemetry | null {
  if (!t0) return t1 || null;
  if (!t1) return t0;
  const a = alpha ?? 0;
  return {
    thrust_n: lerp(t0.thrust_n, t1.thrust_n, a),
    tug_earth_distance_m: lerp(t0.tug_earth_distance_m, t1.tug_earth_distance_m, a),
    beam_power_w: lerp(t0.beam_power_w, t1.beam_power_w, a),
    beam_directions: t0.beam_directions,
    propellant_spent_kg: lerp(t0.propellant_spent_kg, t1.propellant_spent_kg, a),
    beam_clearance_earth_m:
      t0.beam_clearance_earth_m != null && t1.beam_clearance_earth_m != null
        ? lerp(t0.beam_clearance_earth_m, t1.beam_clearance_earth_m, a)
        : t0.beam_clearance_earth_m ?? t1.beam_clearance_earth_m ?? null,
    beam_clearance_moon_m:
      t0.beam_clearance_moon_m != null && t1.beam_clearance_moon_m != null
        ? lerp(t0.beam_clearance_moon_m, t1.beam_clearance_moon_m, a)
        : t0.beam_clearance_moon_m ?? t1.beam_clearance_moon_m ?? null
  };
}

export function interpolateFrame(frames: SimulationFrame[], time_s: number): SimulationFrame {
  const [i0, i1, alpha] = findBoundingFrames(frames, time_s);
  const f0 = frames[i0];
  const f1 = frames[i1];

  const clampedTime = Math.max(frames[0].time_s, Math.min(frames[frames.length - 1].time_s, time_s));

  if (i0 === i1 || alpha === 0) {
    return { ...f0, time_s: clampedTime };
  }

  const dtFrame_s = f1.time_s - f0.time_s;
  const tau_s = clampedTime - f0.time_s;

  const bodies: Record<string, BodyTelemetry> = {};
  for (const name of Object.keys(f0.bodies)) {
    if (f1.bodies[name]) {
      bodies[name] = interpolateBody(name, f0.bodies[name], f1.bodies[name], alpha, dtFrame_s, tau_s);
    } else {
      bodies[name] = f0.bodies[name];
    }
  }

  // Tug standoff position along Earth velocity vector
  if (bodies['Earth'] && bodies['Tug'] && dtFrame_s >= 86400.0) {
    const earth = bodies['Earth'];
    const r_e = Math.sqrt(earth.x * earth.x + earth.y * earth.y);
    if (r_e > 0.01) {
      const tx = -earth.y / r_e;
      const ty = earth.x / r_e;
      const d_m = f0.tug_telemetry?.tug_earth_distance_m || 1.2701e9;
      const d_au = d_m / AU_METERS;
      bodies['Tug'].x = earth.x + d_au * tx;
      bodies['Tug'].y = earth.y + d_au * ty;
      bodies['Tug'].z = earth.z;
    }
  }

  const insolation =
    f0.insolation_w_m2 != null && f1.insolation_w_m2 != null
      ? lerp(f0.insolation_w_m2, f1.insolation_w_m2, alpha)
      : f0.insolation_w_m2 ?? f1.insolation_w_m2 ?? null;

  const wasteHeat =
    f0.waste_heat_w_m2 != null && f1.waste_heat_w_m2 != null
      ? lerp(f0.waste_heat_w_m2, f1.waste_heat_w_m2, alpha)
      : f0.waste_heat_w_m2 ?? f1.waste_heat_w_m2 ?? null;

  const moonDist =
    f0.moon_distance_m != null && f1.moon_distance_m != null
      ? lerp(f0.moon_distance_m, f1.moon_distance_m, alpha)
      : f0.moon_distance_m ?? f1.moon_distance_m ?? null;

  return {
    time_s: clampedTime,
    step_index: f0.step_index,
    bodies,
    tug_telemetry: interpolateTug(f0.tug_telemetry, f1.tug_telemetry, alpha),
    ledger_drifts: f0.ledger_drifts,
    flag_count: f0.flag_count,
    joint_angles_rad: null,
    segment_safety_factors: f0.segment_safety_factors ?? f1.segment_safety_factors ?? null,
    insolation_w_m2: insolation,
    waste_heat_w_m2: wasteHeat,
    moon_distance_m: moonDist
  };
}
