const TILE = 32;
const GRID_W = 25;
const GRID_H = 18;
const WIDTH = GRID_W * TILE;
const HEIGHT = GRID_H * TILE;

const sceneState = {
  map: [],
  wallLayer: null,
  player: null,
  exit: null,
  keys: null,
  enemies: null,
  keyboard: null,
  hud: {},
  score: 0,
  life: 3,
  level: 1,
  keysCollected: 0,
  requiredKeys: 3,
  lanternEnergy: 100,
  gameOver: false,
};

new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  width: WIDTH,
  height: HEIGHT,
  pixelArt: true,
  backgroundColor: "#06080f",
  physics: {
    default: "arcade",
    arcade: { gravity: { y: 0 }, debug: false },
  },
  scene: { preload, create, update },
});

function preload() {}

function create() {
  createTextures(this);
  this.cameras.main.setRoundPixels(true);
  this.physics.world.setBounds(0, 0, WIDTH, HEIGHT);

  sceneState.keyboard = this.input.keyboard.addKeys({
    up: "W",
    left: "A",
    down: "S",
    right: "D",
    run: "SHIFT",
    recharge: "SPACE",
  });

  buildLevel(this);
  createHud(this);
  this.time.addEvent({ delay: 1000, loop: true, callback: onSecondTick, callbackScope: this });
}

function update(_, delta) {
  if (sceneState.gameOver) return;

  handleMovement(sceneState.player, delta);
  updateEnemies(delta);
  updateLanternEffect();

  if (Phaser.Input.Keyboard.JustDown(sceneState.keyboard.recharge) && sceneState.score >= 10) {
    sceneState.score -= 10;
    sceneState.lanternEnergy = Math.min(100, sceneState.lanternEnergy + 35);
  }

  syncHud();
}

function createTextures(scene) {
  const g = scene.add.graphics();

  g.fillStyle(0x6cf9ff, 1);
  g.fillRect(0, 0, 16, 16);
  g.generateTexture("player", 16, 16);
  g.clear();

  g.fillStyle(0x2b2f3d, 1);
  g.fillRect(0, 0, TILE, TILE);
  g.fillStyle(0x39435f, 1);
  g.fillRect(4, 4, 8, 8);
  g.generateTexture("wall", TILE, TILE);
  g.clear();

  g.fillStyle(0x131a2d, 1);
  g.fillRect(0, 0, TILE, TILE);
  g.fillStyle(0x1a223d, 1);
  g.fillRect(0, 0, TILE, 1);
  g.fillRect(0, 0, 1, TILE);
  g.generateTexture("floor", TILE, TILE);
  g.clear();

  g.fillStyle(0xffdd55, 1);
  g.fillRect(4, 2, 8, 12);
  g.fillStyle(0xffffff, 1);
  g.fillRect(7, 4, 2, 4);
  g.generateTexture("key", 16, 16);
  g.clear();

  g.fillStyle(0x4dff88, 1);
  g.fillRect(0, 0, 18, 18);
  g.fillStyle(0x11331d, 1);
  g.fillRect(4, 4, 10, 10);
  g.generateTexture("exit", 18, 18);
  g.clear();

  g.fillStyle(0x8a2be2, 1);
  g.fillRect(0, 0, 16, 16);
  g.fillStyle(0xffffff, 0.2);
  g.fillRect(2, 2, 12, 12);
  g.generateTexture("enemy", 16, 16);
  g.destroy();
}

function buildLevel(scene) {
  clearOldLevel();
  sceneState.map = makeMaze(GRID_W, GRID_H);

  const walls = scene.physics.add.staticGroup();
  for (let y = 0; y < GRID_H; y += 1) {
    for (let x = 0; x < GRID_W; x += 1) {
      scene.add.image(x * TILE + TILE / 2, y * TILE + TILE / 2, "floor");
      if (sceneState.map[y][x] === 1) {
        walls.create(x * TILE + TILE / 2, y * TILE + TILE / 2, "wall");
      }
    }
  }

  sceneState.wallLayer = walls;
  placeEntities(scene);
  createCollisions(scene);
}

function clearOldLevel() {
  [sceneState.player, sceneState.exit, sceneState.keys, sceneState.enemies, sceneState.wallLayer].forEach((obj) => {
    if (obj && obj.destroy) obj.destroy(true);
  });
}

function placeEntities(scene) {
  sceneState.keysCollected = 0;
  sceneState.requiredKeys = Math.min(5, 2 + sceneState.level);

  const spawn = randomEmptyCell();
  sceneState.player = scene.physics.add.sprite(cellToPx(spawn.x), cellToPx(spawn.y), "player");
  sceneState.player.setCollideWorldBounds(true);
  sceneState.player.setDrag(300, 300);
  sceneState.player.setMaxVelocity(175);

  const exitCell = randomEmptyCellFarFrom(spawn, 12);
  sceneState.exit = scene.physics.add.staticImage(cellToPx(exitCell.x), cellToPx(exitCell.y), "exit");

  sceneState.keys = scene.physics.add.group();
  for (let i = 0; i < sceneState.requiredKeys; i += 1) {
    const cell = randomEmptyCell();
    sceneState.keys.create(cellToPx(cell.x), cellToPx(cell.y), "key").setScale(1.1);
  }

  sceneState.enemies = scene.physics.add.group();
  const enemyCount = Math.min(7, 2 + sceneState.level);
  for (let i = 0; i < enemyCount; i += 1) {
    const cell = randomEmptyCellFarFrom(spawn, 6);
    const enemy = sceneState.enemies.create(cellToPx(cell.x), cellToPx(cell.y), "enemy");
    enemy.speed = Phaser.Math.Between(50, 78) + sceneState.level * 4;
  }
}

function createCollisions(scene) {
  scene.physics.add.collider(sceneState.player, sceneState.wallLayer);
  scene.physics.add.collider(sceneState.enemies, sceneState.wallLayer);

  scene.physics.add.overlap(sceneState.player, sceneState.keys, (_, key) => {
    key.destroy();
    sceneState.keysCollected += 1;
    sceneState.score += 25;
  });

  scene.physics.add.overlap(sceneState.player, sceneState.enemies, onPlayerHit, null, scene);

  scene.physics.add.overlap(sceneState.player, sceneState.exit, () => {
    if (sceneState.keysCollected < sceneState.requiredKeys) return;
    sceneState.level += 1;
    sceneState.score += 120;
    sceneState.lanternEnergy = Math.min(100, sceneState.lanternEnergy + 20);
    buildLevel(scene);
  });
}

function handleMovement(player) {
  const cursors = player.scene.input.keyboard.createCursorKeys();
  const speed = sceneState.keyboard.run.isDown ? 180 : 130;
  let vx = 0;
  let vy = 0;

  if (sceneState.keyboard.left.isDown || cursors.left.isDown) vx = -speed;
  if (sceneState.keyboard.right.isDown || cursors.right.isDown) vx = speed;
  if (sceneState.keyboard.up.isDown || cursors.up.isDown) vy = -speed;
  if (sceneState.keyboard.down.isDown || cursors.down.isDown) vy = speed;

  player.setVelocity(vx, vy);
}

function updateEnemies() {
  sceneState.enemies.children.iterate((enemy) => {
    if (!enemy || !sceneState.player) return;

    const dist = Phaser.Math.Distance.Between(enemy.x, enemy.y, sceneState.player.x, sceneState.player.y);
    const seesPlayer = dist < 210 || sceneState.lanternEnergy < 15;

    if (seesPlayer) {
      enemy.scene.physics.moveToObject(enemy, sceneState.player, enemy.speed);
      enemy.setTint(0xff4d70);
    } else {
      enemy.setTint(0xffffff);
      enemy.setVelocity(
        Math.sin(enemy.y * 0.05) * 30,
        Math.cos(enemy.x * 0.05) * 30,
      );
    }
  });
}

function updateLanternEffect() {
  const glow = 0.2 + sceneState.lanternEnergy / 100;
  sceneState.player.setAlpha(Math.min(1, glow));
  sceneState.enemies.children.iterate((enemy) => {
    if (!enemy) return;
    const dist = Phaser.Math.Distance.Between(enemy.x, enemy.y, sceneState.player.x, sceneState.player.y);
    enemy.setAlpha(dist < 160 * glow ? 1 : 0.3);
  });
}

function onSecondTick() {
  if (sceneState.gameOver) return;
  sceneState.lanternEnergy = Math.max(0, sceneState.lanternEnergy - 2 - Math.floor(sceneState.level / 3));
  if (sceneState.lanternEnergy === 0) {
    sceneState.life -= 1;
    sceneState.lanternEnergy = 40;
  }
  if (sceneState.life <= 0) {
    sceneState.gameOver = true;
    sceneState.player.setTint(0xff0000);
    sceneState.player.setVelocity(0, 0);
    sceneState.hud.message.setText("GAME OVER - Recarregue a página");
  }
}

function onPlayerHit(player) {
  if (player.invulnerable || sceneState.gameOver) return;
  player.invulnerable = true;
  sceneState.life -= 1;
  sceneState.lanternEnergy = Math.max(25, sceneState.lanternEnergy - 15);
  player.setTint(0xffffff);
  player.scene.time.delayedCall(700, () => {
    player.clearTint();
    player.invulnerable = false;
  });
}

function createHud(scene) {
  const style = { fontFamily: '"Press Start 2P"', fontSize: "12px", color: "#c6f7ff" };
  sceneState.hud.text = scene.add.text(12, 10, "", style).setScrollFactor(0).setDepth(10);
  sceneState.hud.message = scene
    .add.text(WIDTH / 2, HEIGHT - 14, "", { ...style, fontSize: "11px", color: "#ffda7a" })
    .setOrigin(0.5, 1)
    .setDepth(10);
  syncHud();
}

function syncHud() {
  sceneState.hud.text.setText([
    `Nivel: ${sceneState.level}`,
    `Vida: ${sceneState.life}`,
    `Pontos: ${sceneState.score}`,
    `Chaves: ${sceneState.keysCollected}/${sceneState.requiredKeys}`,
    `Luz: ${sceneState.lanternEnergy}%`,
  ]);

  if (!sceneState.gameOver && sceneState.keysCollected < sceneState.requiredKeys) {
    sceneState.hud.message.setText("Colete todas as chaves para abrir a saída");
  } else if (!sceneState.gameOver) {
    sceneState.hud.message.setText("Saída liberada! Corra para o portal verde");
  }
}

function makeMaze(w, h) {
  const grid = Array.from({ length: h }, () => Array(w).fill(1));
  const startX = 1;
  const startY = 1;
  grid[startY][startX] = 0;
  const stack = [{ x: startX, y: startY }];
  const dirs = [
    { x: 2, y: 0 },
    { x: -2, y: 0 },
    { x: 0, y: 2 },
    { x: 0, y: -2 },
  ];

  while (stack.length) {
    const current = stack[stack.length - 1];
    const neighbors = Phaser.Utils.Array.Shuffle(dirs)
      .map((d) => ({ x: current.x + d.x, y: current.y + d.y, bx: current.x + d.x / 2, by: current.y + d.y / 2 }))
      .filter((n) => n.x > 0 && n.y > 0 && n.x < w - 1 && n.y < h - 1 && grid[n.y][n.x] === 1);

    if (!neighbors.length) {
      stack.pop();
      continue;
    }

    const next = neighbors[0];
    grid[next.by][next.bx] = 0;
    grid[next.y][next.x] = 0;
    stack.push({ x: next.x, y: next.y });
  }

  return grid;
}

function randomEmptyCell() {
  let x;
  let y;
  do {
    x = Phaser.Math.Between(1, GRID_W - 2);
    y = Phaser.Math.Between(1, GRID_H - 2);
  } while (sceneState.map[y][x] !== 0);
  return { x, y };
}

function randomEmptyCellFarFrom(origin, minDist) {
  let cell = randomEmptyCell();
  let retries = 0;
  while (Phaser.Math.Distance.Between(cell.x, cell.y, origin.x, origin.y) < minDist && retries < 80) {
    cell = randomEmptyCell();
    retries += 1;
  }
  return cell;
}

function cellToPx(cell) {
  return cell * TILE + TILE / 2;
}
