import type { ReplayData } from '../types';
import { validateReplayData } from '../loader';

/**
 * Export replay data to a JSON file and trigger browser download.
 * Conforms to the DRAFT v2 replay schema in backend/py/export_replay.py.
 */
export function exportReplayJson(replayData: ReplayData, customFilename?: string): void {
  const exportPayload: ReplayData = {
    format: replayData.format || 'OCTO_JSON',
    version: 2,
    status: replayData.status || 'DRAFT',
    meta: {
      concept: replayData.meta?.concept || 'Ceres Tug',
      thresholds_confirmed: replayData.meta?.thresholds_confirmed ?? true,
      config_hash: replayData.meta?.config_hash || 'sha256:unknown',
      units: replayData.meta?.units || {
        time: 's',
        distance: 'AU',
        velocity: 'km/s',
        mass: 'kg',
        force: 'N',
        power: 'W',
      },
      focus_body_id: replayData.meta?.focus_body_id || 'Sun',
      frame_count: replayData.frames?.length || 0,
      downsampling_note:
        replayData.meta?.downsampling_note ||
        'Exported from D-Orbit Planetary Flight Control System.',
    },
    mission_summary: replayData.mission_summary,
    monitors_summary: replayData.monitors_summary,
    frames: replayData.frames || [],
    flags: replayData.flags || [],
    conditions: replayData.conditions || [],
    enablers: replayData.enablers || [],
  };

  const jsonStr = JSON.stringify(exportPayload, null, 2);

  if (typeof document === 'undefined') {
    return;
  }

  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const filename = customFilename || `dorbit_replay.json`;

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export interface ReplayImportResult {
  success: boolean;
  data?: ReplayData;
  error?: string;
  frameCount?: number;
  concept?: string;
  durationYears?: number;
}

/**
 * Reads and validates an uploaded File object against the DRAFT v2 replay schema.
 */
export async function parseAndValidateReplayFile(file: File): Promise<ReplayImportResult> {
  if (!file.name.toLowerCase().endsWith('.json') && file.type !== 'application/json') {
    return {
      success: false,
      error: `Selected file "${file.name}" is not a JSON document. Please upload a valid .json replay file.`,
    };
  }

  try {
    let text: string;
    if (typeof file.text === 'function') {
      text = await file.text();
    } else if (typeof FileReader !== 'undefined') {
      text = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsText(file);
      });
    } else {
      return { success: false, error: 'File reading is not supported in this environment.' };
    }

    const parsed = JSON.parse(text);
    const validation = validateReplayData(parsed);

    if (!validation.isValid || !validation.data) {
      return {
        success: false,
        error: `Validation failed:\n• ${validation.errors.join('\n• ')}`,
      };
    }

    const data = validation.data;
    const frames = data.frames || [];
    const durationSec = frames.length > 0 ? frames[frames.length - 1].time_s - frames[0].time_s : 0;
    const durationYears = durationSec / 31557600.0;

    return {
      success: true,
      data,
      frameCount: frames.length,
      concept: data.meta?.concept || 'Unknown Concept',
      durationYears,
    };
  } catch (err: any) {
    return {
      success: false,
      error: `JSON syntax error: ${err?.message || String(err)}`,
    };
  }
}
