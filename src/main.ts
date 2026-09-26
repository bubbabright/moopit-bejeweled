import Phaser from 'phaser';
import '@fontsource/fredoka/latin-700.css';
import { GAME_HEIGHT, GAME_WIDTH } from './config';
import { BUILD_LABEL } from './version';
import BootScene from './scenes/BootScene';
import MenuScene from './scenes/MenuScene';
import GameScene from './scenes/GameScene';

/**
 * GEMFALL — an original Bejeweled-like match-3 game.
 * Transparent canvas: the page CSS supplies the gradient world behind the board.
 */
const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  transparent: true,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  render: {
    antialias: true,
    roundPixels: false,
    powerPreference: 'high-performance',
  },
  scene: [BootScene, MenuScene, GameScene],
});

// Debug handle: lets devtools (and the headless playtest) inspect or step the loop,
// and read which build is running.
const debug = window as unknown as {
  gemfall?: Phaser.Game;
  gemfallVersion?: string;
  gemfallPhaser?: string;
};
debug.gemfall = game;
debug.gemfallVersion = BUILD_LABEL;
// Phaser is bundled, not global, so expose its version for diagnostics.
debug.gemfallPhaser = Phaser.VERSION;
