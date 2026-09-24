/**
 * Haptic feedback (vibration) for the match explosion.
 *
 * Mirrors the `sfx` singleton so the two feedback channels are wired the same way:
 * toggle the `enabled` flag once from settings, then fire events by name.
 *
 * `navigator.vibrate` is unsupported on desktop and on iOS Safari, and browsers ignore
 * it without prior user activation, so every call is guarded and best-effort. Haptics
 * are never the only signal for anything — they only reinforce what is already on
 * screen and audible.
 */

/** Minimum gap between pulses, so a cascade does not turn into a continuous buzz. */
const MIN_GAP_MS = 45;

type VibratePattern = number | number[];

const platformSupports = (): boolean => {
  try {
    return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
  } catch {
    return false;
  }
};

class Haptics {
  /** Honoured only when the platform supports vibration at all. */
  enabled = true;

  readonly supported = platformSupports();

  private lastPulseAt = 0;

  private pulse(pattern: VibratePattern, force = false): void {
    if (!this.enabled || !this.supported) return;

    const now = Date.now();
    if (!force && now - this.lastPulseAt < MIN_GAP_MS) return;
    this.lastPulseAt = now;

    try {
      navigator.vibrate(pattern);
    } catch {
      /* best-effort: never let feedback break gameplay */
    }
  }

  /**
   * The match explosion. Scaled by cascade depth to track the rising pitch of the
   * sound: a single match is a tap, a deep chain lands a firmer, longer thump.
   */
  match(depth: number): void {
    const step = Math.min(Math.max(depth, 1), 6);
    this.pulse(step <= 1 ? [18] : [16, 22, 18 + step * 8]);
  }

  /** Bigger explosions get a heavier hit: line blasts, bombs and hypercubes. */
  detonation(): void {
    this.pulse([30, 40, 70]);
  }

  /** Call from a user gesture so the platform unlocks vibration where it requires it. */
  unlock(): void {
    this.pulse(1, true);
  }
}

export const haptics = new Haptics();
