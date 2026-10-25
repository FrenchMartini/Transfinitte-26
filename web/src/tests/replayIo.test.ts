import { describe, it, expect, vi, beforeEach } from 'vitest';
import { exportReplayJson, parseAndValidateReplayFile } from '../utils/replayIo';
import mockData from '../mock/replay_mock.json';
import type { ReplayData } from '../types';

describe('replayIo (Export and Import Replay Utilities)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('exports replay data to JSON and initiates browser download', () => {
    const mockAnchor = {
      href: '',
      download: '',
      click: vi.fn(),
    };
    const originalDoc = (globalThis as any).document;
    const originalUrl = (globalThis as any).URL;

    (globalThis as any).document = {
      createElement: vi.fn().mockReturnValue(mockAnchor),
      body: {
        appendChild: vi.fn(),
        removeChild: vi.fn(),
      },
    };
    (globalThis as any).URL = {
      createObjectURL: vi.fn().mockReturnValue('blob:test-url'),
      revokeObjectURL: vi.fn(),
    };

    exportReplayJson(mockData as unknown as ReplayData, 'test_replay.json');

    expect(mockAnchor.download).toBe('test_replay.json');
    expect(mockAnchor.click).toHaveBeenCalled();
    expect((globalThis as any).document.body.appendChild).toHaveBeenCalledWith(mockAnchor);
    expect((globalThis as any).document.body.removeChild).toHaveBeenCalledWith(mockAnchor);

    (globalThis as any).document = originalDoc;
    (globalThis as any).URL = originalUrl;
  });

  it('successfully parses and validates a valid replay File', async () => {
    const validJson = JSON.stringify(mockData);
    const file = new File([validJson], 'mission_replay.json', { type: 'application/json' });

    const result = await parseAndValidateReplayFile(file);
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.concept).toBe('Ceres Tug');
    expect(result.frameCount).toBeGreaterThan(0);
    expect(result.durationYears).toBeGreaterThan(0);
  });

  it('rejects a file with invalid replay format', async () => {
    const badJson = JSON.stringify({ format: 'INVALID_FORMAT', version: 1 });
    const file = new File([badJson], 'bad_replay.json', { type: 'application/json' });

    const result = await parseAndValidateReplayFile(file);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Validation failed');
  });

  it('rejects a non-JSON file extension', async () => {
    const file = new File(['text content'], 'notes.txt', { type: 'text/plain' });

    const result = await parseAndValidateReplayFile(file);
    expect(result.success).toBe(false);
    expect(result.error).toContain('not a JSON document');
  });

  it('rejects malformed JSON syntax', async () => {
    const malformedJson = '{ "format": "OCTO_JSON", broken...';
    const file = new File([malformedJson], 'corrupted.json', { type: 'application/json' });

    const result = await parseAndValidateReplayFile(file);
    expect(result.success).toBe(false);
    expect(result.error).toContain('JSON syntax error');
  });
});
