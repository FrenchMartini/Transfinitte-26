import type { ReplayData, ConditionRecord } from './types';

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  data?: ReplayData;
}

export function validateReplayData(raw: unknown): ValidationResult {
  const errors: string[] = [];

  if (!raw || typeof raw !== 'object') {
    return { isValid: false, errors: ['Replay payload is not a valid JSON object.'] };
  }

  const data = raw as Partial<ReplayData>;

  if (data.format !== 'OCTO_JSON' && data.format !== 'OCTO_SIMULATION_JSON' && data.format !== 'OCTO_REPLAY') {
    errors.push(`Invalid format identifier: expected "OCTO_JSON" or "OCTO_SIMULATION_JSON", got "${data.format}".`);
  }

  if (data.version !== 2) {
    errors.push(`Unsupported schema version: expected 2, got ${data.version}.`);
  }

  if (!data.meta || typeof data.meta !== 'object') {
    errors.push('Missing top-level "meta" object.');
  } else {
    if (!data.meta.concept) {
      errors.push('Missing "meta.concept".');
    }
    if (typeof (data.meta as any).thresholds_confirmed === 'string') {
      (data.meta as any).thresholds_confirmed = (data.meta as any).thresholds_confirmed === 'true';
    }
    if (typeof data.meta.thresholds_confirmed !== 'boolean') {
      errors.push('Missing or non-boolean "meta.thresholds_confirmed".');
    }
  }

  if (!Array.isArray(data.frames)) {
    errors.push('Missing or invalid "frames" array.');
  } else if (data.frames.length === 0) {
    errors.push('The "frames" sequence contains zero frames.');
  } else {
    const f0 = data.frames[0];
    if (typeof f0.time_s !== 'number' || !f0.bodies || typeof f0.bodies !== 'object') {
      errors.push('Frame 0 is missing required fields ("time_s" or "bodies").');
    }
  }

  if (errors.length > 0) {
    return { isValid: false, errors };
  }

  return { isValid: true, errors: [], data: data as ReplayData };
}

export function formatValueOrNull<T>(
  val: T | null | undefined,
  formatter?: (v: T) => string
): string {
  if (val === null || val === undefined) {
    return 'not available yet';
  }
  if (formatter) {
    return formatter(val);
  }
  return String(val);
}

export function shouldShowThresholdBanner(meta?: { thresholds_confirmed?: boolean }): boolean {
  if (!meta || typeof meta.thresholds_confirmed !== 'boolean') {
    return true;
  }
  return meta.thresholds_confirmed === false;
}

export function parseConditions(data: Partial<ReplayData>): ConditionRecord[] {
  if (Array.isArray(data.conditions)) {
    return data.conditions;
  }
  return [];
}
