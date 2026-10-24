/**
 * Audio Controller for Ambient Cosmic Music & Celestial Narration.
 * Implements smooth fading, autoplay policy handling, and dual-channel playback.
 */

import { CELESTIAL_BODIES } from './planet_data';

export class AudioManager {
  private backgroundAudio: HTMLAudioElement | null = null;
  private narrationAudio: HTMLAudioElement | null = null;

  private _musicEnabled: boolean = false;
  private _narrationEnabled: boolean = true;
  private currentNarrationBody: string | null = null;

  private onStateChange?: (musicOn: boolean, narrationOn: boolean) => void;

  constructor(onStateChange?: (musicOn: boolean, narrationOn: boolean) => void) {
    this.onStateChange = onStateChange;

    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      this.initAudioElements();
      this.bindUserInteraction();
    }
  }

  private initAudioElements(): void {
    try {
      this.backgroundAudio = new Audio('/audio/background.mp4');
      this.backgroundAudio.loop = true;
      this.backgroundAudio.volume = 0.28;

      this.narrationAudio = new Audio();
      this.narrationAudio.volume = 0.85;

      this.narrationAudio.addEventListener('ended', () => {
        this.currentNarrationBody = null;
      });
    } catch (e) {
      console.warn('Audio initialization notice (audio elements restricted):', e);
    }
  }

  private bindUserInteraction(): void {
    const handleFirstInteraction = () => {
      if (this._musicEnabled && this.backgroundAudio && this.backgroundAudio.paused) {
        this.backgroundAudio.play().catch(() => {});
      }
      document.removeEventListener('click', handleFirstInteraction);
      document.removeEventListener('touchstart', handleFirstInteraction);
      document.removeEventListener('keydown', handleFirstInteraction);
    };

    document.addEventListener('click', handleFirstInteraction, { once: true });
    document.addEventListener('touchstart', handleFirstInteraction, { once: true });
    document.addEventListener('keydown', handleFirstInteraction, { once: true });
  }

  public toggleMusic(): boolean {
    this._musicEnabled = !this._musicEnabled;
    if (this._musicEnabled) {
      if (this.backgroundAudio) {
        this.backgroundAudio.play().catch((e) => {
          console.log('Background music will play on next user interaction:', e);
        });
      }
    } else {
      if (this.backgroundAudio) {
        this.backgroundAudio.pause();
      }
    }
    this.notifyState();
    return this._musicEnabled;
  }

  public toggleNarration(): boolean {
    this._narrationEnabled = !this._narrationEnabled;
    if (!this._narrationEnabled && this.narrationAudio) {
      this.narrationAudio.pause();
      this.currentNarrationBody = null;
    }
    this.notifyState();
    return this._narrationEnabled;
  }

  public playNarration(bodyName: string): void {
    if (!this._narrationEnabled || !this.narrationAudio) return;

    const info = CELESTIAL_BODIES[bodyName];
    if (!info || !info.audioUrl) return;

    if (this.currentNarrationBody === bodyName && !this.narrationAudio.paused) {
      return; // Already playing this celestial body's narration
    }

    try {
      this.narrationAudio.pause();
      this.narrationAudio.currentTime = 0;
      this.narrationAudio.src = info.audioUrl;
      this.currentNarrationBody = bodyName;
      this.narrationAudio.play().catch((e) => {
        console.log('Narration play queued for interaction:', e);
      });
    } catch (e) {
      console.warn('Error playing narration:', e);
    }
  }

  public stopNarration(): void {
    if (this.narrationAudio) {
      this.narrationAudio.pause();
      this.currentNarrationBody = null;
    }
  }

  public isMusicOn(): boolean {
    return this._musicEnabled;
  }

  public isNarrationOn(): boolean {
    return this._narrationEnabled;
  }

  private notifyState(): void {
    if (this.onStateChange) {
      this.onStateChange(this._musicEnabled, this._narrationEnabled);
    }
  }

  public dispose(): void {
    if (this.backgroundAudio) {
      this.backgroundAudio.pause();
      this.backgroundAudio.src = '';
    }
    if (this.narrationAudio) {
      this.narrationAudio.pause();
      this.narrationAudio.src = '';
    }
  }
}
