import { describe, it, expect } from 'vitest';
import { validateReplayData, formatValueOrNull, parseConditions, shouldShowThresholdBanner } from '../src/loader';
import mockData from '../mock/replay_mock.json';

describe('Replay Schema Validation and Loader', () => {
  it('validates a compliant OCTO_JSON replay object', () => {
    const result = validateReplayData(mockData);
    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.data).toBeDefined();
    expect(result.data?.meta.concept).toBe('Ceres Tug');
  });

  it('rejects an invalid replay format or missing frames', () => {
    const badData = { format: 'WRONG', version: 1 };
    const result = validateReplayData(badData);
    expect(result.isValid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('formats null or undefined fields strictly as "not available yet"', () => {
    expect(formatValueOrNull(null)).toBe('not available yet');
    expect(formatValueOrNull(undefined)).toBe('not available yet');
    expect(formatValueOrNull(2.7, (v) => `${v.toFixed(1)} AU`)).toBe('2.7 AU');
    expect(formatValueOrNull(0)).toBe('0');
  });

  it('determines threshold banner visibility from meta.thresholds_confirmed', () => {
    expect(shouldShowThresholdBanner({ thresholds_confirmed: false })).toBe(true);
    expect(shouldShowThresholdBanner({ thresholds_confirmed: true })).toBe(false);
    expect(shouldShowThresholdBanner(undefined)).toBe(true);
  });

  it('extracts conditions and identifies failures and first failing times', () => {
    const conditions = parseConditions(mockData);
    expect(conditions.length).toBeGreaterThanOrEqual(1);

    const failing = conditions.filter((c) => c.status === 'FAIL');
    expect(failing.length).toBeGreaterThanOrEqual(1);

    const wasteHeatCond = conditions.find((c) => c.id === 'max_surface_waste_heat');
    expect(wasteHeatCond).toBeDefined();
    expect(wasteHeatCond?.status).toBe('FAIL');
    expect(wasteHeatCond?.first_failing_time_s).toBeGreaterThan(0);
  });

  it('verifies mock file contains all mandatory test cases from requirements', () => {
    // 1. Some null fields
    expect(mockData.num_arm_segments).toBeNull();
    expect(mockData.frames[0].joint_angles_rad).toBeNull();

    // 2. One failing condition
    const hasFailingCondition = mockData.conditions?.some((c: any) => c.status === 'FAIL');
    expect(hasFailingCondition).toBe(true);

    // 3. One unconfirmed-threshold flag
    const hasUnconfirmedFlag = mockData.flags?.some((f: any) => f.code === 'UNCONFIRMED_THRESHOLD');
    expect(hasUnconfirmedFlag).toBe(true);

    // 4. A segment safety factor below 1.5
    const hasLowSafetyFactor = mockData.frames.some((frame: any) => {
      const factors = frame.segment_safety_factors;
      if (!factors) return false;
      return Object.values(factors).some((v: any) => typeof v === 'number' && v < 1.5);
    });
    expect(hasLowSafetyFactor).toBe(true);
  });
});
