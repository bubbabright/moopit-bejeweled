import Phaser from 'phaser';
import { DIFFICULTIES, MODES, type Difficulty, type Mode } from '../config';
import { generateGemTextures, generateUtilityTextures } from '../gfx/gems';

/** Generates all procedural art, then hands off to the menu (or a deep-linked run). */
export default class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  create(): void {
    generateUtilityTextures(this);
    generateGemTextures(this);

    // Canvas text draws with whatever face is ready at the time, so wait for the message font
    // before any scene makes text. Capped, so a slow or failed load falls back to Inter.
    const fontReady = document.fonts?.load('700 32px Fredoka') ?? Promise.resolve();
    const cap = new Promise((resolve) => window.setTimeout(resolve, 1500));
    void Promise.race([fontReady, cap])
      .catch(() => undefined)
      .then(() => this.handOff());
  }

  private handOff(): void {

    // Hide the HTML boot splash now that textures exist.
    const boot = document.getElementById('boot');
    if (boot) {
      boot.classList.add('done');
      window.setTimeout(() => boot.remove(), 400);
    }

    // Deep link: index.html?auto=1&mode=timed&difficulty=hard skips the menu.
    const params = new URLSearchParams(window.location.search);
    const mode = params.get('mode') as Mode | null;
    const difficulty = params.get('difficulty') as Difficulty | null;

    if (params.get('auto') === '1' && mode && difficulty && mode in MODES && difficulty in DIFFICULTIES) {
      this.scene.start('game', { mode, difficulty });
      return;
    }

    this.scene.start('menu');
  }
}
