/**
 * Haptic feedback (vibration) for the match explosion.
 *
 * Mirrors the `sfx` singleton so the two feedback channels are wired the same way:
 * toggle the `enabled` flag once from settings, then fire events by name.
 *
 * `navigator.vibrate` is unsupported on desktop and on iOS Safari, and browsers refuse
 * it without prior user activation (any earlier tap on the page counts), so every call is guarded and best-effort. Haptics
 * are never the only signal for anything — they only reinforce what is already on
 * screen and audible.
 */

/**
 * Shortest "on" segment worth sending. Android vibration motors need tens of milliseconds
 * to spin up, so an 18 ms pulse is issued, accepted, and never felt. 40 is a tuned guess
 * for mid-range phones, not a measured floor — raise it if plain matches still feel dead.
 */
export const MIN_ON_MS = 40;

type VibratePattern = number | number[];

/** Total length of a pattern, and how hard it hits (sum of its "on" segments). */
const measure = (pattern: VibratePattern): { length: number; weight: number } => {
  const segments = Array.isArray(pattern) ? pattern : [pattern];
  let length = 0;
  let weight = 0;
  segments.forEach((ms, i) => {
    length += ms;
    if (i % 2 === 0) weight += ms;
  });
  return { length, weight };
};

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

  /** When the pattern currently playing ends, and how heavy it is. */
  private busyUntil = 0;
  private busyWeight = 0;

  private warnedRejected = false;

  /**
   * Every `navigator.vibrate` call cancels whatever pattern is still playing. So while one
   * is running, a lighter or equal pattern is dropped (it would only cut the current buzz
   * short), and a heavier one replaces it — a deeper cascade step or a detonation always
   * lands, and a cascade never turns into one continuous drone.
   */
  private pulse(pattern: VibratePattern, force = false): void {
    if (!this.enabled || !this.supported) return;

    const now = Date.now();
    const { length, weight } = measure(pattern);
    if (!force && now < this.busyUntil && weight <= this.busyWeight) return;

    let accepted = false;
    try {
      accepted = navigator.vibrate(pattern);
    } catch {
      /* best-effort: never let feedback break gameplay */
    }

    if (!accepted) {
      // No user activation yet, a cross-origin iframe, or the OS said no. Say so once, so a
      // phone that never buzzes can be diagnosed from the console instead of guessed at.
      if (!this.warnedRejected) {
        this.warnedRejected = true;
        console.warn('haptics: navigator.vibrate() was refused by the browser', pattern);
      }
      return;
    }

    this.busyUntil = now + length;
    this.busyWeight = weight;
  }

  /**
   * The match explosion, scaled by cascade depth to track the rising pitch of the sound:
   * a single match is a tap, a deep chain lands a firmer, longer thump.
   *
   * Callers fire this on the *burst* beat of the clear animation (see
   * `GameScene.animateClear`), not when the cascade resolves, so the buzz lands with the
   * hit instead of ~160 ms before the gems visibly go up.
   *
   * One pulse per cascade step, even when power gems detonate: a step is either a plain
   * match or a detonation, never both.
   */
  explosion(depth: number, heavy = false): void {
    const step = Math.min(Math.max(depth, 1), 6);

    // Line blasts, bombs and hypercubes get a front-loaded, deeper hit than a plain match.
    if (heavy) {
      this.pulse([MIN_ON_MS + 10 + step * 5, 30, 62 + step * 12]);
      return;
    }

    this.pulse(step <= 1 ? [MIN_ON_MS] : [MIN_ON_MS, 30, MIN_ON_MS + step * 8]);
  }

  /**
   * Raw hardware test for the menu's hold-to-test button: vibrates regardless of the BUZZ
   * setting and the busy guard, and reports exactly what the browser said, so a phone that
   * never buzzes can be diagnosed on the phone itself. `ms` of 0 stops any vibration.
   */
  test(ms: number): string {
    if (!this.supported) return 'vibrate() not available in this browser';
    let accepted = false;
    try {
      accepted = navigator.vibrate(ms);
    } catch (err) {
      return `vibrate() threw: ${String(err)}`;
    }
    if (ms === 0) return '';
    // hasBeenActive is Chrome's sticky user activation; without it vibrate() is refused.
    const active = navigator.userActivation?.hasBeenActive;
    const activation = active === undefined ? '' : active ? ' · page tapped: yes' : ' · page tapped: NO';
    this.busyUntil = 0;
    return `vibrate(${ms}) → ${accepted ? 'accepted' : 'REFUSED'}${activation}`;
  }

  /**
   * A short, clearly felt buzz confirming haptics were just switched on. Fire it from the
   * toggle's own tap so the browser has user activation.
   */
  confirm(): void {
    this.pulse(50, true);
  }
}

export const haptics = new Haptics();
