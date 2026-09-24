import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from './config';
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

// Debug handle: lets devtools (and the headless playtest) inspect or step the loop.
(window as unknown as { gemfall?: Phaser.Game }).gemfall = game;
