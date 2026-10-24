import { describe, expect, it } from 'vitest';
import { AudioManager } from '../src/audio';

describe('AudioManager', () => {
  it('initializes with music off and narration on by default', () => {
    const audio = new AudioManager();
    expect(audio.isMusicOn()).toBe(false);
    expect(audio.isNarrationOn()).toBe(true);
  });

  it('toggles music and narration states and triggers state callback', () => {
    let notifiedMusic = false;
    let notifiedNarration = true;
    const audio = new AudioManager((m, n) => {
      notifiedMusic = m;
      notifiedNarration = n;
    });

    const mState = audio.toggleMusic();
    expect(mState).toBe(true);
    expect(audio.isMusicOn()).toBe(true);
    expect(notifiedMusic).toBe(true);

    const nState = audio.toggleNarration();
    expect(nState).toBe(false);
    expect(audio.isNarrationOn()).toBe(false);
    expect(notifiedNarration).toBe(false);
  });
});
