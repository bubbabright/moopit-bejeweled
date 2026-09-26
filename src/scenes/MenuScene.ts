import Phaser from 'phaser';
import {
  DIFFICULTIES,
  DIFFICULTY_ORDER,
  FONT,
  MESSAGE_HOLD_STEPS_MS,
  GAME_HEIGHT,
  GAME_WIDTH,
  GEM_COLORS,
  MENU,
  MODES,
  MODE_ORDER,
  TEX_SIZE,
  menuRowCentres,
  type Difficulty,
  type Mode,
} from '../config';
import { loadSavedRun, loadSettings, saveSettings } from '../core/storage';
import {
  MOOPIT_ACCENT,
  MOOPIT_TAPS,
  MOOPIT_TAP_WINDOW_MS,
  voiceFor,
} from '../messages';
import { BUILD_LABEL } from '../version';
import { haptics } from '../haptics';
import { sfx } from '../audio/sfx';
import { Pill } from '../ui/pill';
import { gemTextureKey } from '../gfx/gems';

const BASE_SCALE = 112 / TEX_SIZE;

export default class MenuScene extends Phaser.Scene {
  private mode: Mode = 'endless';
  private difficulty: Difficulty = 'normal';
  private modePills = new Map<Mode, Pill>();
  private difficultyPills = new Map<Difficulty, Pill>();
  private bestText!: Phaser.GameObjects.Text;
  private resumePill?: Pill;
  private mutePill!: Pill;
  private taglineText!: Phaser.GameObjects.Text;

  private hapticPill!: Pill;
  /** How long in-game messages stay up; each tap steps through `MESSAGE_HOLD_STEPS_MS`. */
  private msgPill!: Pill;

  /** The private voice, unlocked from the title. See `wireMoopitTitle`. */
  private moopit = false;
  private titleTaps = 0;
  private lastTitleTapAt = 0;

  constructor() {
    super('menu');
  }

  create(): void {
    this.modePills.clear();
    this.difficultyPills.clear();
    this.resumePill = undefined;
    this.titleTaps = 0;

    // Read before drawTitle, which picks its wording from it.
    this.moopit = loadSettings().moopit;

    this.drawBackdrop();
    this.drawTitle();

    // ── Mode picker ────────────────────────────────────────────────────────────
    this.sectionLabel('MODE', 250);
    const modeCentres = menuRowCentres(MODE_ORDER.length, GAME_WIDTH);
    MODE_ORDER.forEach((mode, i) => {
      const pill = new Pill(this, {
        x: modeCentres[i],
        y: 312,
        w: MENU.pillW,
        h: 92,
        label: MODES[mode].label,
        sub: MODES[mode].sub,
        variant: 'ghost',
        fontSize: 24,
        onClick: () => this.selectMode(mode),
      });
      this.modePills.set(mode, pill);
    });

    // ── Difficulty picker ─────────────────────────────────────────────────────
    this.sectionLabel('DIFFICULTY', 392);
    const difficultyCentres = menuRowCentres(DIFFICULTY_ORDER.length, GAME_WIDTH);
    DIFFICULTY_ORDER.forEach((difficulty, i) => {
      const pill = new Pill(this, {
        x: difficultyCentres[i],
        y: 452,
        w: MENU.pillW,
        h: 78,
        label: DIFFICULTIES[difficulty].label,
        sub: DIFFICULTIES[difficulty].sub,
        variant: 'ghost',
        fontSize: 22,
        onClick: () => this.selectDifficulty(difficulty),
      });
      this.difficultyPills.set(difficulty, pill);
    });

    // ── Play ──────────────────────────────────────────────────────────────────
    const play = new Pill(this, {
      x: GAME_WIDTH / 2,
      y: 576,
      w: 460,
      h: 88,
      label: 'PLAY',
      variant: 'primary',
      fontSize: 32,
      radius: 24,
      onClick: () => {
        sfx.unlock();
        this.scene.start('game', { mode: this.mode, difficulty: this.difficulty });
      },
    });
    this.tweens.add({
      targets: play,
      scaleX: 1.02,
      scaleY: 1.02,
      duration: 1400,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    const saved = loadSavedRun();
    if (saved) {
      this.resumePill = new Pill(this, {
        x: GAME_WIDTH / 2,
        y: 668,
        w: 460,
        h: 72,
        label: 'RESUME RUN',
        sub: `${MODES[saved.mode].label} · ${DIFFICULTIES[saved.difficulty].label} · ${saved.score.toLocaleString()} pts`,
        variant: 'accent',
        fontSize: 22,
        onClick: () => {
          sfx.unlock();
          this.scene.start('game', {
            mode: saved.mode,
            difficulty: saved.difficulty,
            resume: true,
          });
        },
      });
    }

    this.bestText = this.add
      .text(GAME_WIDTH / 2, 736, '', {
        fontFamily: FONT,
        fontSize: '20px',
        color: '#c9c6f5',
      })
      .setOrigin(0.5);

    this.add
      .text(
        GAME_WIDTH / 2,
        792,
        'Tap two neighbours · or drag · or arrows + Enter',
        { fontFamily: FONT, fontSize: '17px', color: '#8e8ac4' },
      )
      .setOrigin(0.5);

    this.add
      .text(GAME_WIDTH / 2, 820, 'SPACE · hint      P · pause      M · mute', {
        fontFamily: FONT,
        fontSize: '16px',
        color: '#6f6ba8',
      })
      .setOrigin(0.5);

    // Which build is this? Auto-deploy makes it easy to be staring at a stale
    // bundle, so the version and commit are visible on the menu.
    this.add
      .text(GAME_WIDTH / 2, 856, BUILD_LABEL, {
        fontFamily: FONT,
        fontSize: '14px',
        color: '#57548a',
      })
      .setOrigin(0.5);

    const settings = loadSettings();
    sfx.muted = settings.muted;
    haptics.enabled = settings.haptics;
    this.mutePill = new Pill(this, {
      x: GAME_WIDTH - 92,
      y: 54,
      w: 130,
      h: 52,
      label: settings.muted ? 'SOUND OFF' : 'SOUND ON',
      variant: 'ghost',
      fontSize: 16,
      radius: 14,
      onClick: () => this.toggleMute(),
    });

    // Sits alongside the sound toggle: two 130px pills with a 14px gap, ending at
    // the same right margin as the sound pill.
    this.hapticPill = new Pill(this, {
      x: GAME_WIDTH - 92 - 130 - 14,
      y: 54,
      w: 130,
      h: 52,
      label: settings.haptics ? 'BUZZ ON' : 'BUZZ OFF',
      variant: 'ghost',
      fontSize: 16,
      radius: 14,
      onClick: () => this.toggleHaptics(),
    });

    this.createBuzzTest();

    // Leftmost of the top row, one more 130px slot left of HOLD TO TEST.
    this.msgPill = new Pill(this, {
      x: GAME_WIDTH - 92 - 3 * (130 + 14),
      y: 54,
      w: 130,
      h: 52,
      label: messageHoldLabel(settings.messageHoldMs),
      variant: 'ghost',
      fontSize: 16,
      radius: 14,
      onClick: () => this.cycleMessageHold(),
    });

    this.selectMode(this.mode);
    this.selectDifficulty(this.difficulty);
  }

  /**
   * Hold-to-test vibration, left of the BUZZ pill. Holding fires 200 ms pulses back to back
   * so the motor runs continuously; releasing (or sliding off) stops it. A line under the
   * version stamp shows what the browser answered, so a silent phone can be diagnosed without devtools.
   */
  private createBuzzTest(): void {
    const status = this.add
      .text(GAME_WIDTH / 2, 880, '', {
        fontFamily: FONT,
        fontSize: '14px',
        color: '#c9c6f5',
      })
      .setOrigin(0.5);

    const pulseMs = 200;
    let timer: Phaser.Time.TimerEvent | undefined;

    const stop = (): void => {
      if (!timer) return;
      timer.remove();
      timer = undefined;
      haptics.test(0);
    };
    const pulse = (): void => {
      status.setText(haptics.test(pulseMs));
    };

    const testPill = new Pill(this, {
      x: GAME_WIDTH - 92 - 2 * (130 + 14),
      y: 54,
      w: 130,
      h: 52,
      label: 'HOLD TO TEST',
      variant: 'ghost',
      fontSize: 14,
      radius: 14,
      onClick: stop,
    });
    testPill.on('pointerdown', () => {
      stop();
      pulse();
      timer = this.time.addEvent({ delay: pulseMs - 20, loop: true, callback: pulse });
    });
    testPill.on('pointerout', stop);
    this.input.on('pointerup', stop);
    this.events.once('shutdown', () => {
      stop();
      this.input.off('pointerup', stop);
    });
  }

  // ── Backdrop & title ─────────────────────────────────────────────────────────

  private drawBackdrop(): void {
    const g = this.add.graphics();

    // Floating gems give the menu depth without any asset pipeline.
    for (let i = 0; i < 9; i++) {
      const type = i % GEM_COLORS.length;
      const sprite = this.add
        .image(
          Phaser.Math.Between(60, GAME_WIDTH - 60),
          Phaser.Math.Between(60, GAME_HEIGHT - 60),
          gemTextureKey(type, 'none'),
        )
        .setScale(BASE_SCALE * Phaser.Math.FloatBetween(0.5, 1.15))
        .setAlpha(Phaser.Math.FloatBetween(0.05, 0.13))
        .setAngle(Phaser.Math.Between(0, 360));

      this.tweens.add({
        targets: sprite,
        y: sprite.y + Phaser.Math.Between(-70, 70),
        angle: sprite.angle + Phaser.Math.Between(-40, 40),
        duration: Phaser.Math.Between(5000, 11000),
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }

    // Faint vignette-ish frame.
    g.fillStyle(0x000000, 0.16);
    g.fillRoundedRect(18, 18, GAME_WIDTH - 36, GAME_HEIGHT - 36, 34);
    g.lineStyle(1, 0xffffff, 0.05);
    g.strokeRoundedRect(18, 18, GAME_WIDTH - 36, GAME_HEIGHT - 36, 34);
  }

  private drawTitle(): void {
    const title = this.add
      .text(GAME_WIDTH / 2, 140, 'GEMFALL', {
        fontFamily: FONT,
        fontSize: '96px',
        fontStyle: 'bold',
        color: '#ffffff',
      })
      .setOrigin(0.5);
    title.setShadow(0, 8, 'rgba(10,4,32,0.75)', 14, true, true);

    // Gradient illusion: overlay a second, tinted copy clipped by alpha tween.
    const gloss = this.add
      .text(GAME_WIDTH / 2, 140, 'GEMFALL', {
        fontFamily: FONT,
        fontSize: '96px',
        fontStyle: 'bold',
        color: '#c7d2fe',
      })
      .setOrigin(0.5)
      .setAlpha(0.55)
      .setBlendMode(Phaser.BlendModes.ADD);

    this.tweens.add({
      targets: gloss,
      alpha: 0.18,
      duration: 2200,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    this.taglineText = this.add
      .text(GAME_WIDTH / 2, 200, voiceFor(this.moopit).menuTagline, {
        fontFamily: FONT,
        fontSize: '21px',
        color: this.moopit ? MOOPIT_ACCENT : '#a5a2d8',
      })
      .setOrigin(0.5);

    this.wireMoopitTitle(title, gloss);
  }

  /**
   * The way into the private voice: seven taps on the title, close together, and nothing on
   * screen that says they are there. Each tap gets a small squash so a curious player can
   * feel it counting, and the count forgets itself if the taps are too far apart — otherwise
   * a queue of stray taps would eventually fall through the door.
   *
   * The title art never changes — this only decides what the line under it says.
   * The gloss is tweened with the title so the two copies never separate while squashing.
   */
  private wireMoopitTitle(title: Phaser.GameObjects.Text, gloss: Phaser.GameObjects.Text): void {
    title.setInteractive({ useHandCursor: true });
    title.on('pointerdown', () => {
      const now = this.time.now;
      this.titleTaps = now - this.lastTitleTapAt > MOOPIT_TAP_WINDOW_MS ? 1 : this.titleTaps + 1;
      this.lastTitleTapAt = now;

      sfx.unlock();
      sfx.click();
      this.tweens.add({
        targets: [title, gloss],
        scale: { from: 0.94, to: 1 },
        duration: 90,
        ease: 'Quad.easeOut',
      });

      if (this.titleTaps < MOOPIT_TAPS) return;
      this.titleTaps = 0;
      this.setMoopit(!this.moopit);
    });
  }

  /** Flip the private voice, remember the choice, and make it obvious it landed. */
  private setMoopit(on: boolean): void {
    this.moopit = on;

    const settings = loadSettings();
    settings.moopit = on;
    saveSettings(settings);

    this.taglineText.setText(voiceFor(on).menuTagline).setColor(on ? MOOPIT_ACCENT : '#a5a2d8');

    haptics.confirm();
    sfx.newBest();
    if (!settings.reducedMotion) this.cameras.main.flash(220, 129, 140, 248);
  }

  private sectionLabel(text: string, y: number): void {
    this.add
      .text(64, y, text, {
        fontFamily: FONT,
        fontSize: '17px',
        color: '#8e8ac4',
        letterSpacing: 4,
      })
      .setOrigin(0, 0.5);
  }

  // ── Selection ────────────────────────────────────────────────────────────────

  private selectMode(mode: Mode): void {
    this.mode = mode;
    for (const [key, pill] of this.modePills) pill.setSelected(key === mode);
    this.refreshBest();
  }

  private selectDifficulty(difficulty: Difficulty): void {
    this.difficulty = difficulty;
    for (const [key, pill] of this.difficultyPills) pill.setSelected(key === difficulty);
    this.refreshBest();
  }

  private refreshBest(): void {
    const best = loadSavedRun();
    // Reading through storage keeps the display honest after a run that just ended.
    const scores = (() => {
      try {
        return JSON.parse(window.localStorage.getItem('bejeweled.highscores.v1') ?? '{}') as Record<
          string,
          { score: number }
        >;
      } catch {
        return {};
      }
    })();
    const entry = scores[`${this.mode}:${this.difficulty}`];
    this.bestText.setText(
      entry
        ? `BEST · ${MODES[this.mode].label} · ${DIFFICULTIES[this.difficulty].label} — ${entry.score.toLocaleString()}`
        : `NO SCORE YET · ${MODES[this.mode].label} · ${DIFFICULTIES[this.difficulty].label}`,
    );
    void best;
  }

  private toggleMute(): void {
    const settings = loadSettings();
    settings.muted = !settings.muted;
    saveSettings(settings);
    sfx.muted = settings.muted;
    this.mutePill.setLabel(settings.muted ? 'SOUND OFF' : 'SOUND ON');
    if (!settings.muted) {
      sfx.unlock();
      sfx.click();
    }
  }

  private toggleHaptics(): void {
    const settings = loadSettings();
    settings.haptics = !settings.haptics;
    saveSettings(settings);
    haptics.enabled = settings.haptics;
    this.hapticPill.setLabel(settings.haptics ? 'BUZZ ON' : 'BUZZ OFF');
    // Fire one so the toggle demonstrates itself.
    if (settings.haptics) haptics.confirm();
  }

  private cycleMessageHold(): void {
    const settings = loadSettings();
    const steps: readonly number[] = MESSAGE_HOLD_STEPS_MS;
    // loadSettings guarantees a listed step, so indexOf is never -1 here.
    settings.messageHoldMs = steps[(steps.indexOf(settings.messageHoldMs) + 1) % steps.length];
    saveSettings(settings);
    this.msgPill.setLabel(messageHoldLabel(settings.messageHoldMs));
  }
}

/** "MSG 1.5s", "MSG 3s" — the pill's label for a message time. */
const messageHoldLabel = (ms: number): string => `MSG ${ms / 1000}s`;
