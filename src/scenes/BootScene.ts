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
