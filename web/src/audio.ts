/**
 * Audio Controller for Ambient Cosmic Music & Celestial Voice Narration.
 * Handles autoplay policy, user gestures, and dual-channel playback.
 */

export class AudioManager {
  private backgroundAudio: HTMLAudioElement | null = null;
  private narrationAudio: HTMLAudioElement | null = null;

  private _musicEnabled: boolean = false;
  private _narrationEnabled: boolean = true;
  private currentNarrationBody: string | null = null;
  private onStateChange?: (music: boolean, narration: boolean) => void;

  constructor(onStateChange?: (music: boolean, narration: boolean) => void) {
    this.onStateChange = onStateChange;
    if (typeof window !== 'undefined') {
      this.init();
    }
  }

  private init(): void {
    try {
      this.backgroundAudio = new Audio('/audio/background.mp4');
      this.backgroundAudio.loop = true;
      this.backgroundAudio.volume = 0.25;

      this.narrationAudio = new Audio();
      this.narrationAudio.volume = 0.85;

      this.narrationAudio.addEventListener('ended', () => {
        this.currentNarrationBody = null;
      });

      const handleFirstInteraction = () => {
        if (this._musicEnabled && this.backgroundAudio && this.backgroundAudio.paused) {
          this.backgroundAudio.play().catch(() => {});
        }
        document.removeEventListener('click', handleFirstInteraction);
        document.removeEventListener('keydown', handleFirstInteraction);
      };

      document.addEventListener('click', handleFirstInteraction, { once: true });
      document.addEventListener('keydown', handleFirstInteraction, { once: true });
    } catch (e) {
      console.warn('Audio init warning:', e);
    }
  }

  public toggleMusic(): boolean {
    this._musicEnabled = !this._musicEnabled;
    if (this.backgroundAudio) {
      if (this._musicEnabled) {
        this.backgroundAudio.play().catch(() => {});
      } else {
        this.backgroundAudio.pause();
      }
    }
    this.onStateChange?.(this._musicEnabled, this._narrationEnabled);
    return this._musicEnabled;
  }

  public toggleNarration(): boolean {
    this._narrationEnabled = !this._narrationEnabled;
    if (!this._narrationEnabled) {
      if (this.narrationAudio) {
        this.narrationAudio.pause();
      }
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      this.currentNarrationBody = null;
    }
    this.onStateChange?.(this._musicEnabled, this._narrationEnabled);
    return this._narrationEnabled;
  }

  public playNarration(bodyName: string): void {
    if (!this._narrationEnabled) return;

    const key = bodyName.toLowerCase();

    // Dedicated aerospace spoken narration for Tug and Moon
    if (key === 'tug') {
      if (this.narrationAudio) {
        this.narrationAudio.pause();
      }
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const text = 'Ceres Gravity Tug. A massive 9.4 times 10 to the 20 kilogram asteroid-class tractor hovering ahead of Earth along its orbital path. Powered by dual canted relativistic plasma plumes at 0.3c, it transfers momentum gravitationally to pull Earth out to 2.7 astronomical units.';
        const utter = new SpeechSynthesisUtterance(text);
        utter.rate = 1.02;
        utter.pitch = 1.0;
        this.currentNarrationBody = key;
        window.speechSynthesis.speak(utter);
      }
      return;
    }

    if (key === 'moon') {
      if (this.narrationAudio) {
        this.narrationAudio.pause();
      }
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const text = "The Moon. Earth's only natural satellite, orbiting at an average distance of 384,400 kilometers. Its orbit remains dynamically stable and bound within Earth's Hill sphere throughout the 10,000-year migration.";
        const utter = new SpeechSynthesisUtterance(text);
        utter.rate = 1.02;
        utter.pitch = 1.0;
        this.currentNarrationBody = key;
        window.speechSynthesis.speak(utter);
      }
      return;
    }

    if (!this.narrationAudio) return;

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }

    const validBodies: Record<string, string> = {
      system: '/audio/solar-system.mp3',
      sun: '/audio/sun.mp3',
      mercury: '/audio/mercury.mp3',
      venus: '/audio/venus.mp3',
      earth: '/audio/earth.mp3',
      mars: '/audio/mars.mp3',
      jupiter: '/audio/jupiter.mp3',
      saturn: '/audio/saturn.mp3',
      uranus: '/audio/uranus.mp3',
      neptune: '/audio/neptune.mp3'
    };

    const url = validBodies[key];
    if (!url) return;

    if (this.currentNarrationBody === key && !this.narrationAudio.paused) {
      return;
    }

    try {
      this.narrationAudio.pause();
      this.narrationAudio.currentTime = 0;
      this.narrationAudio.src = url;
      this.currentNarrationBody = key;
      this.narrationAudio.play().catch(() => {});
    } catch {
      // Audio autoplay policy catch
    }
  }

  public isMusicOn(): boolean {
    return this._musicEnabled;
  }

  public isNarrationOn(): boolean {
    return this._narrationEnabled;
  }
}

export const audioManager = new AudioManager();
