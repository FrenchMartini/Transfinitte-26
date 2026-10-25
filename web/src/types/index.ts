export interface ReplayUnits {
  time?: string;
  distance?: string;
  velocity?: string;
  mass?: string;
  force?: string;
  power?: string;
  [key: string]: string | undefined;
}

export interface ReplayMeta {
  concept: string;
  thresholds_confirmed: boolean;
  config_hash: string;
  units: ReplayUnits;
  focus_body_id: string;
  frame_count: number;
  downsampling_note: string;
  [key: string]: unknown;
}

export interface BodyTelemetry {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  mass_kg: number;
  [key: string]: unknown;
}

export interface TugTelemetry {
  thrust_n: number;
  tug_earth_distance_m: number;
  beam_power_w: number;
  beam_directions: [number, number, number][] | number[][];
  propellant_spent_kg: number;
  beam_clearance_earth_m?: number | null;
  beam_clearance_moon_m?: number | null;
  [key: string]: unknown;
}

export interface LedgerDrifts {
  energy: number | null;
  momentum: number | null;
  angular_momentum: number | null;
  mass: number | null;
}

export interface SimulationFrame {
  time_s: number;
  step_index: number;
  bodies: Record<string, BodyTelemetry>;
  tug_telemetry?: TugTelemetry | null;
  ledger_drifts?: LedgerDrifts | null;
  flag_count?: number;
  joint_angles_rad?: unknown;
  segment_safety_factors?: Record<string, number> | null;
  insolation_w_m2?: number | null;
  waste_heat_w_m2?: number | null;
  moon_distance_m?: number | null;
  [key: string]: unknown;
}

export interface ReplayFlag {
  code: string;
  t: number;
  source: string;
  quantity: string;
  value: number;
  limit: number;
  enabler_id?: string | null;
  [key: string]: unknown;
}

export interface ConditionRecord {
  id: string;
  name: string;
  status: 'PASS' | 'FAIL' | 'UNKNOWN' | string;
  measured_value?: number | null;
  limit?: number | null;
  first_failing_time_s?: number | null;
  enabler_id?: string | null;
  assumed?: boolean;
}

export interface EnablerRecord {
  id: string;
  name: string;
  relaxes?: string[];
  value?: number;
  justification?: string;
  [key: string]: unknown;
}

export interface ReplayData {
  format: string;
  version: number;
  status: string;
  meta: ReplayMeta;
  num_bodies: number;
  num_arm_segments: null;
  flags?: ReplayFlag[];
  conditions?: ConditionRecord[];
  enablers?: EnablerRecord[];
  frames: SimulationFrame[];
}
