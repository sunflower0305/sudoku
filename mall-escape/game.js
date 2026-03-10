// ===================== 配置 =====================

const TILE = 32;
const PLAYER_SPEED = 2.5;
const GUARD_SPEED = 1.2;
const GUARD_CHASE_SPEED = 2.4;
const GUARD_CATCH_RANGE = 1.5; // tiles - 抓到你
const GUARD_ALERT_DURATION = 4; // seconds - 激怒持续时间
const MONSTER_SPEED = 0.8;
const MONSTER_CHASE_SPEED = 1.6;
const GUARD_DETECT_RANGE = 5; // tiles
const MONSTER_CHASE_RANGE = 6;
const MONSTER_DAMAGE = 12;
const MONSTER_HIT_COOLDOWN = 1000; // ms
const HEALTH_PACK_HEAL = 30;
const VISION_RADIUS = 6; // tiles
const GAME_MINUTES = 120; // 22:00 to 00:00
const REAL_SECONDS_PER_GAME_MINUTE = 2; // 1 game minute = 2 real seconds → 4 min real

// ===================== 地图数据 =====================
// # = 墙  . = 地板  E = 出口  S = 起点
// G = 警卫  M = 怪物  H = 药包

const MAP_RAW = [
  '########################################',
  '#E....#.........#.......#..............#',
  '#.....#.........#.......#..............#',
  '#.....#.........#.......#......#.......#',
  '##.####...##.####..####.#......#.....###',
  '#.........#.....#......##.....##.......#',
  '#..H......#.....#......##.............##',
  '#.........#.....#......................#',
  '###.######......#....#########.###...###',
  '#..............G.....#......H..........#',
  '#...####............##.................#',
  '#...#..#...####.....##...######........#',
  '#...#..#...#..#.....##...#....#........#',
  '#...#..#.M.#..#..........#....#........#',
  '#......#...#..#..........#.............#',
  '#......#####..####..####.....####......#',
  '#......................................#',
  '##.########.####..####.####.###..#####.#',
  '#....#........#...#.........#..........#',
  '#....#........#...#.........#..........#',
  '#....#..H.....#...#....M....#..........#',
  '#....#........#...#.........#..........#',
  '#.G..#..####.##...###.####..#.....G....#',
  '#..........#............#..............#',
  '#..........#.....M......#..............#',
  '#..........#............#..............#',
  '####.####..#............#..####.######.#',
  '#.............####.####................#',
  '#................H.......S.............#',
  '########################################',
];

// ===================== 解析地图 =====================

const MAP_H = MAP_RAW.length;
const MAP_W = MAP_RAW[0].length;

const map = [];
let playerStart = { x: 0, y: 0 };
let exitPos = { x: 0, y: 0 };
const guardSpawns = [];
const monsterSpawns = [];
const healthPacks = [];

for (let r = 0; r < MAP_H; r++) {
  map[r] = [];
  for (let c = 0; c < MAP_W; c++) {
    const ch = MAP_RAW[r][c];
    switch (ch) {
      case '#':
        map[r][c] = 1;
        break;
      case 'S':
        map[r][c] = 0;
        playerStart = { x: c * TILE + TILE / 2, y: r * TILE + TILE / 2 };
        break;
      case 'E':
        map[r][c] = 0;
        exitPos = { x: c, y: r };
        break;
      case 'G':
        map[r][c] = 0;
        guardSpawns.push({ x: c * TILE + TILE / 2, y: r * TILE + TILE / 2 });
        break;
      case 'M':
        map[r][c] = 0;
        monsterSpawns.push({ x: c * TILE + TILE / 2, y: r * TILE + TILE / 2 });
        break;
      case 'H':
        map[r][c] = 0;
        healthPacks.push({ x: c * TILE + TILE / 2, y: r * TILE + TILE / 2, alive: true });
        break;
      default:
        map[r][c] = 0;
    }
  }
}

// ===================== 寻路辅助 =====================

function isWall(tileX, tileY) {
  if (tileX < 0 || tileX >= MAP_W || tileY < 0 || tileY >= MAP_H) return true;
  return map[tileY][tileX] === 1;
}

function canMoveTo(x, y, radius) {
  const r = radius || 6;
  const left = Math.floor((x - r) / TILE);
  const right = Math.floor((x + r) / TILE);
  const top = Math.floor((y - r) / TILE);
  const bottom = Math.floor((y + r) / TILE);
  for (let ty = top; ty <= bottom; ty++) {
    for (let tx = left; tx <= right; tx++) {
      if (isWall(tx, ty)) return false;
    }
  }
  return true;
}

function hasLineOfSight(x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const steps = Math.ceil(dist / (TILE / 2));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const px = x1 + dx * t;
    const py = y1 + dy * t;
    if (isWall(Math.floor(px / TILE), Math.floor(py / TILE))) return false;
  }
  return true;
}

// Simple BFS pathfinding for guards
function findPath(fromX, fromY, toX, toY) {
  const sx = Math.floor(fromX / TILE);
  const sy = Math.floor(fromY / TILE);
  const ex = Math.floor(toX / TILE);
  const ey = Math.floor(toY / TILE);

  if (sx === ex && sy === ey) return null;

  const visited = new Set();
  const queue = [{ x: sx, y: sy, path: [] }];
  visited.add(`${sx},${sy}`);

  const dirs = [[0, -1], [0, 1], [-1, 0], [1, 0]];

  while (queue.length > 0) {
    const cur = queue.shift();
    for (const [ddx, ddy] of dirs) {
      const nx = cur.x + ddx;
      const ny = cur.y + ddy;
      const key = `${nx},${ny}`;
      if (visited.has(key)) continue;
      if (isWall(nx, ny)) continue;
      visited.add(key);
      const newPath = [...cur.path, { x: nx * TILE + TILE / 2, y: ny * TILE + TILE / 2 }];
      if (nx === ex && ny === ey) return newPath;
      if (newPath.length > 30) continue; // limit search
      queue.push({ x: nx, y: ny, path: newPath });
    }
  }
  return null;
}

// ===================== 警卫巡逻路线生成 =====================

function generatePatrolRoute(startX, startY) {
  const sx = Math.floor(startX / TILE);
  const sy = Math.floor(startY / TILE);
  const route = [{ x: startX, y: startY }];
  const dirs = [[0, -1], [0, 1], [-1, 0], [1, 0]];

  let cx = sx, cy = sy;
  for (let i = 0; i < 6; i++) {
    const shuffled = dirs.slice().sort(() => Math.random() - 0.5);
    let moved = false;
    for (const [ddx, ddy] of shuffled) {
      const steps = 2 + Math.floor(Math.random() * 4);
      let nx = cx, ny = cy;
      let valid = true;
      for (let s = 0; s < steps; s++) {
        nx += ddx;
        ny += ddy;
        if (isWall(nx, ny)) { valid = false; break; }
      }
      if (valid && !(nx === sx && ny === sy)) {
        cx = nx;
        cy = ny;
        route.push({ x: cx * TILE + TILE / 2, y: cy * TILE + TILE / 2 });
        moved = true;
        break;
      }
    }
    if (!moved) break;
  }
  // Return to start
  route.push({ x: startX, y: startY });
  return route;
}

// ===================== Canvas 初始化 =====================

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

function resizeCanvas() {
  canvas.width = window.innerWidth * devicePixelRatio;
  canvas.height = window.innerHeight * devicePixelRatio;
  ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

const W = () => window.innerWidth;
const H = () => window.innerHeight;

// ===================== 游戏状态 =====================

let gameState = 'start'; // start | playing | won | lost
let player = null;
let guards = [];
let monsters = [];
let items = [];
let gameTime = 0; // in game minutes from 22:00
let realTimer = 0;
let lastTime = 0;
let camera = { x: 0, y: 0 };
let keys = {};
let dpadDir = { x: 0, y: 0 };
let damageFlash = 0;
let isMobile = false;

// Detect mobile
function checkMobile() {
  isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  document.getElementById('dpad').hidden = !isMobile || gameState !== 'playing';
}
checkMobile();

// ===================== 输入处理 =====================

document.addEventListener('keydown', e => {
  keys[e.key] = true;
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
    e.preventDefault();
  }
});

document.addEventListener('keyup', e => {
  keys[e.key] = false;
});

// D-Pad
document.querySelectorAll('.dpad-btn').forEach(btn => {
  const dir = btn.dataset.dir;
  const setDir = (active) => {
    if (dir === 'up') dpadDir.y = active ? -1 : 0;
    if (dir === 'down') dpadDir.y = active ? 1 : 0;
    if (dir === 'left') dpadDir.x = active ? -1 : 0;
    if (dir === 'right') dpadDir.x = active ? 1 : 0;
  };
  btn.addEventListener('touchstart', e => { e.preventDefault(); setDir(true); });
  btn.addEventListener('touchend', e => { e.preventDefault(); setDir(false); });
  btn.addEventListener('touchcancel', e => { e.preventDefault(); setDir(false); });
});

function getInputDir() {
  let dx = 0, dy = 0;
  if (keys['ArrowUp'] || keys['w'] || keys['W']) dy -= 1;
  if (keys['ArrowDown'] || keys['s'] || keys['S']) dy += 1;
  if (keys['ArrowLeft'] || keys['a'] || keys['A']) dx -= 1;
  if (keys['ArrowRight'] || keys['d'] || keys['D']) dx += 1;
  dx += dpadDir.x;
  dy += dpadDir.y;
  if (dx !== 0 && dy !== 0) {
    const inv = 1 / Math.SQRT2;
    dx *= inv;
    dy *= inv;
  }
  return { x: dx, y: dy };
}

// ===================== 游戏初始化 =====================

function initGame() {
  player = {
    x: playerStart.x,
    y: playerStart.y,
    hp: 100,
    maxHp: 100,
    lastHit: 0,
    dir: 0, // angle facing
    walking: false,
    walkFrame: 0,
  };

  guards = guardSpawns.map(sp => {
    const route = generatePatrolRoute(sp.x, sp.y);
    return {
      x: sp.x,
      y: sp.y,
      route: route,
      routeIdx: 0,
      speed: GUARD_SPEED,
      dir: Math.random() * Math.PI * 2,
      state: 'patrol', // patrol | alert | caught
      alertTimer: 0,
    };
  });

  monsters = monsterSpawns.map(sp => ({
    x: sp.x,
    y: sp.y,
    speed: MONSTER_SPEED,
    dir: Math.random() * Math.PI * 2,
    wanderTimer: 0,
    chasing: false,
  }));

  items = healthPacks.map(hp => ({ ...hp, alive: true }));

  gameTime = 0;
  realTimer = 0;
  lastTime = 0;
  damageFlash = 0;
  gameState = 'playing';
  keys = {};
  dpadDir = { x: 0, y: 0 };

  document.getElementById('hud').hidden = false;
  document.getElementById('startScreen').hidden = true;
  document.getElementById('gameOverScreen').hidden = true;
  checkMobile();
}

// ===================== 更新逻辑 =====================

function update(dt) {
  if (gameState !== 'playing') return;

  // Timer
  realTimer += dt;
  gameTime = Math.floor(realTimer / REAL_SECONDS_PER_GAME_MINUTE);
  if (gameTime >= GAME_MINUTES) {
    endGame('time');
    return;
  }

  // Player movement
  const dir = getInputDir();
  player.walking = dir.x !== 0 || dir.y !== 0;
  if (player.walking) {
    player.dir = Math.atan2(dir.y, dir.x);
    player.walkFrame += dt * 8;
    const nx = player.x + dir.x * PLAYER_SPEED;
    const ny = player.y + dir.y * PLAYER_SPEED;
    if (canMoveTo(nx, player.y, 6)) player.x = nx;
    if (canMoveTo(player.x, ny, 6)) player.y = ny;
  }

  // Check exit
  const ptx = Math.floor(player.x / TILE);
  const pty = Math.floor(player.y / TILE);
  if (ptx === exitPos.x && pty === exitPos.y) {
    endGame('win');
    return;
  }

  // Update guards
  for (const g of guards) {
    const dpx = player.x - g.x;
    const dpy = player.y - g.y;
    const dDist = Math.sqrt(dpx * dpx + dpy * dpy);
    const canSee = hasLineOfSight(g.x, g.y, player.x, player.y);

    // 近距离抓住 → 游戏结束
    if (dDist < GUARD_CATCH_RANGE * TILE && canSee) {
      g.state = 'caught';
      endGame('guard');
      return;
    }

    // 外层视野 → 激怒追击
    if (dDist < GUARD_DETECT_RANGE * TILE && canSee) {
      g.state = 'alert';
      g.alertTimer = GUARD_ALERT_DURATION;
    }

    if (g.state === 'alert') {
      g.alertTimer -= dt;
      // 追击玩家
      if (dDist > 1) {
        const spd = GUARD_CHASE_SPEED;
        const nx = g.x + (dpx / dDist) * spd;
        const ny = g.y + (dpy / dDist) * spd;
        if (canMoveTo(nx, g.y, 6)) g.x = nx;
        if (canMoveTo(g.x, ny, 6)) g.y = ny;
        g.dir = Math.atan2(dpy, dpx);
      }
      // 追击超时 → 恢复巡逻
      if (g.alertTimer <= 0) {
        g.state = 'patrol';
      }
    } else {
      // 正常巡逻
      const target = g.route[g.routeIdx];
      const gdx = target.x - g.x;
      const gdy = target.y - g.y;
      const gDist = Math.sqrt(gdx * gdx + gdy * gdy);
      if (gDist < 2) {
        g.routeIdx = (g.routeIdx + 1) % g.route.length;
      } else {
        g.x += (gdx / gDist) * GUARD_SPEED;
        g.y += (gdy / gDist) * GUARD_SPEED;
        g.dir = Math.atan2(gdy, gdx);
      }
    }
  }

  // Update monsters
  const now = Date.now();
  for (const m of monsters) {
    const mdx = player.x - m.x;
    const mdy = player.y - m.y;
    const mDist = Math.sqrt(mdx * mdx + mdy * mdy);

    if (mDist < MONSTER_CHASE_RANGE * TILE && hasLineOfSight(m.x, m.y, player.x, player.y)) {
      // Chase player
      m.chasing = true;
      const spd = MONSTER_CHASE_SPEED;
      const nmx = m.x + (mdx / mDist) * spd;
      const nmy = m.y + (mdy / mDist) * spd;
      if (canMoveTo(nmx, m.y, 6)) m.x = nmx;
      if (canMoveTo(m.x, nmy, 6)) m.y = nmy;
      m.dir = Math.atan2(mdy, mdx);
    } else {
      // Wander
      m.chasing = false;
      m.wanderTimer -= dt;
      if (m.wanderTimer <= 0) {
        m.dir = Math.random() * Math.PI * 2;
        m.wanderTimer = 1 + Math.random() * 3;
      }
      const nmx = m.x + Math.cos(m.dir) * MONSTER_SPEED;
      const nmy = m.y + Math.sin(m.dir) * MONSTER_SPEED;
      if (canMoveTo(nmx, nmy, 6)) {
        m.x = nmx;
        m.y = nmy;
      } else {
        m.dir = Math.random() * Math.PI * 2;
      }
    }

    // Hit player
    if (mDist < TILE * 0.8 && now - player.lastHit > MONSTER_HIT_COOLDOWN) {
      player.hp -= MONSTER_DAMAGE;
      player.lastHit = now;
      damageFlash = 0.3;
      if (player.hp <= 0) {
        player.hp = 0;
        endGame('monster');
        return;
      }
    }
  }

  // Health packs
  for (const item of items) {
    if (!item.alive) continue;
    const idx = item.x - player.x;
    const idy = item.y - player.y;
    if (Math.sqrt(idx * idx + idy * idy) < TILE * 0.8) {
      player.hp = Math.min(player.maxHp, player.hp + HEALTH_PACK_HEAL);
      item.alive = false;
    }
  }

  // Damage flash
  if (damageFlash > 0) damageFlash -= dt;

  // Camera
  camera.x = player.x - W() / 2;
  camera.y = player.y - H() / 2;
  camera.x = Math.max(0, Math.min(MAP_W * TILE - W(), camera.x));
  camera.y = Math.max(0, Math.min(MAP_H * TILE - H(), camera.y));
}

// ===================== 渲染 =====================

const COLORS = {
  wall: '#1a1a2e',
  wallTop: '#252545',
  floor: '#2a2a3d',
  floorTile: '#303050',
  exit: '#44cc44',
  player: '#ffb6c1',
  playerDark: '#d4848f',
  guard: '#4a90d9',
  guardLight: '#6ab0ff',
  monster: '#c94444',
  monsterDark: '#8a2222',
  health: '#44cc44',
  fog: '#0a0a1a',
};

function render() {
  ctx.fillStyle = COLORS.fog;
  ctx.fillRect(0, 0, W(), H());

  ctx.save();
  ctx.translate(-camera.x, -camera.y);

  // Calculate visible tile range
  const startCol = Math.max(0, Math.floor(camera.x / TILE) - 1);
  const endCol = Math.min(MAP_W, Math.ceil((camera.x + W()) / TILE) + 1);
  const startRow = Math.max(0, Math.floor(camera.y / TILE) - 1);
  const endRow = Math.min(MAP_H, Math.ceil((camera.y + H()) / TILE) + 1);

  // Draw map
  for (let r = startRow; r < endRow; r++) {
    for (let c = startCol; c < endCol; c++) {
      const x = c * TILE;
      const y = r * TILE;

      // Distance from player for fog
      const dx = (c + 0.5) * TILE - player.x;
      const dy = (r + 0.5) * TILE - player.y;
      const dist = Math.sqrt(dx * dx + dy * dy) / TILE;

      if (dist > VISION_RADIUS + 2) continue;

      if (map[r][c] === 1) {
        ctx.fillStyle = COLORS.wall;
        ctx.fillRect(x, y, TILE, TILE);
        // Top face effect
        ctx.fillStyle = COLORS.wallTop;
        ctx.fillRect(x, y, TILE, TILE * 0.3);
      } else {
        ctx.fillStyle = COLORS.floor;
        ctx.fillRect(x, y, TILE, TILE);
        // Floor tile pattern
        if ((r + c) % 2 === 0) {
          ctx.fillStyle = COLORS.floorTile;
          ctx.fillRect(x + 1, y + 1, TILE - 2, TILE - 2);
        }
      }

      // Exit tile
      if (c === exitPos.x && r === exitPos.y) {
        ctx.fillStyle = COLORS.exit;
        ctx.globalAlpha = 0.4 + Math.sin(Date.now() / 300) * 0.2;
        ctx.fillRect(x, y, TILE, TILE);
        ctx.globalAlpha = 1;
        // EXIT text
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 10px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('EXIT', x + TILE / 2, y + TILE / 2);
      }
    }
  }

  // Health packs
  for (const item of items) {
    if (!item.alive) continue;
    const dx = item.x - player.x;
    const dy = item.y - player.y;
    if (Math.sqrt(dx * dx + dy * dy) / TILE > VISION_RADIUS + 1) continue;
    drawHealthPack(item.x, item.y);
  }

  // Monsters
  for (const m of monsters) {
    const dx = m.x - player.x;
    const dy = m.y - player.y;
    if (Math.sqrt(dx * dx + dy * dy) / TILE > VISION_RADIUS + 1) continue;
    drawMonster(m);
  }

  // Guards + vision cone
  for (const g of guards) {
    const dx = g.x - player.x;
    const dy = g.y - player.y;
    if (Math.sqrt(dx * dx + dy * dy) / TILE > VISION_RADIUS + 6) continue;
    drawGuardVision(g);
    drawGuard(g);
  }

  // Player
  drawPlayer();

  ctx.restore();

  // Fog of war overlay
  drawFog();

  // Damage flash
  if (damageFlash > 0) {
    ctx.fillStyle = `rgba(255, 0, 0, ${damageFlash * 0.5})`;
    ctx.fillRect(0, 0, W(), H());
  }

  // HUD updates
  updateHUD();
}

function drawPlayer() {
  const x = player.x;
  const y = player.y;
  const size = 12;
  const bounce = player.walking ? Math.sin(player.walkFrame) * 2 : 0;

  // Body
  ctx.fillStyle = COLORS.player;
  ctx.beginPath();
  ctx.arc(x, y - 4 + bounce, size * 0.5, 0, Math.PI * 2);
  ctx.fill();

  // Head
  ctx.fillStyle = '#ffe0e8';
  ctx.beginPath();
  ctx.arc(x, y - 12 + bounce, size * 0.4, 0, Math.PI * 2);
  ctx.fill();

  // Hair
  ctx.fillStyle = '#5a3825';
  ctx.beginPath();
  ctx.arc(x, y - 15 + bounce, size * 0.35, Math.PI, Math.PI * 2);
  ctx.fill();
  // Pigtails
  ctx.fillStyle = '#5a3825';
  ctx.beginPath();
  ctx.arc(x - 5, y - 10 + bounce, 2.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x + 5, y - 10 + bounce, 2.5, 0, Math.PI * 2);
  ctx.fill();

  // Skirt
  ctx.fillStyle = COLORS.playerDark;
  ctx.beginPath();
  ctx.moveTo(x - 6, y + bounce);
  ctx.lineTo(x + 6, y + bounce);
  ctx.lineTo(x + 8, y + 6 + bounce);
  ctx.lineTo(x - 8, y + 6 + bounce);
  ctx.closePath();
  ctx.fill();
}

function drawGuard(g) {
  const x = g.x;
  const y = g.y;
  const isAlert = g.state === 'alert';

  // 激怒时头顶感叹号
  if (isAlert) {
    ctx.fillStyle = '#ff3333';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('!', x, y - 22);
  }

  // Body
  ctx.fillStyle = isAlert ? '#ff4444' : COLORS.guard;
  ctx.beginPath();
  ctx.arc(x, y - 2, 7, 0, Math.PI * 2);
  ctx.fill();

  // Head
  ctx.fillStyle = '#deb887';
  ctx.beginPath();
  ctx.arc(x, y - 10, 5, 0, Math.PI * 2);
  ctx.fill();

  // Hat
  ctx.fillStyle = '#1a3a6a';
  ctx.fillRect(x - 6, y - 16, 12, 4);
  ctx.fillRect(x - 4, y - 19, 8, 4);

  // Direction indicator
  ctx.fillStyle = COLORS.guardLight;
  ctx.beginPath();
  ctx.arc(x + Math.cos(g.dir) * 5, y - 10 + Math.sin(g.dir) * 5, 1.5, 0, Math.PI * 2);
  ctx.fill();
}

function drawGuardVision(g) {
  const isAlert = g.state === 'alert';
  const range = GUARD_DETECT_RANGE * TILE;
  const catchRange = GUARD_CATCH_RANGE * TILE;

  // 外层视野圈（警戒区）
  ctx.beginPath();
  ctx.arc(g.x, g.y, range, 0, Math.PI * 2);
  ctx.fillStyle = isAlert ? 'rgba(255, 60, 60, 0.1)' : 'rgba(74, 144, 217, 0.06)';
  ctx.fill();
  // 外圈边框
  ctx.beginPath();
  ctx.arc(g.x, g.y, range, 0, Math.PI * 2);
  ctx.strokeStyle = isAlert ? 'rgba(255, 60, 60, 0.25)' : 'rgba(74, 144, 217, 0.12)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // 内层抓捕圈（危险区）
  ctx.beginPath();
  ctx.arc(g.x, g.y, catchRange, 0, Math.PI * 2);
  ctx.fillStyle = isAlert ? 'rgba(255, 0, 0, 0.2)' : 'rgba(255, 100, 100, 0.08)';
  ctx.fill();

  // 方向锥
  const coneAngle = Math.PI / 3;
  ctx.beginPath();
  ctx.moveTo(g.x, g.y);
  ctx.arc(g.x, g.y, range * 0.7, g.dir - coneAngle / 2, g.dir + coneAngle / 2);
  ctx.closePath();
  ctx.fillStyle = isAlert ? 'rgba(255, 60, 60, 0.15)' : 'rgba(74, 144, 217, 0.1)';
  ctx.fill();
}

function drawMonster(m) {
  const x = m.x;
  const y = m.y;
  const pulse = Math.sin(Date.now() / 200) * 2;

  // Shadow body
  ctx.fillStyle = m.chasing ? '#ff3333' : COLORS.monster;
  ctx.beginPath();
  ctx.arc(x, y, 8 + pulse * 0.5, 0, Math.PI * 2);
  ctx.fill();

  // Dark core
  ctx.fillStyle = COLORS.monsterDark;
  ctx.beginPath();
  ctx.arc(x, y, 5, 0, Math.PI * 2);
  ctx.fill();

  // Eyes
  ctx.fillStyle = '#ff0';
  ctx.beginPath();
  ctx.arc(x - 3, y - 2, 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x + 3, y - 2, 2, 0, Math.PI * 2);
  ctx.fill();

  // Pupils
  ctx.fillStyle = '#000';
  const pdx = player.x - x;
  const pdy = player.y - y;
  const pAngle = Math.atan2(pdy, pdx);
  ctx.beginPath();
  ctx.arc(x - 3 + Math.cos(pAngle), y - 2 + Math.sin(pAngle), 1, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x + 3 + Math.cos(pAngle), y - 2 + Math.sin(pAngle), 1, 0, Math.PI * 2);
  ctx.fill();
}

function drawHealthPack(x, y) {
  const bob = Math.sin(Date.now() / 400) * 2;

  // Glow
  ctx.beginPath();
  ctx.arc(x, y + bob, 10, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(68, 204, 68, 0.15)';
  ctx.fill();

  // Box
  ctx.fillStyle = '#fff';
  ctx.fillRect(x - 6, y - 6 + bob, 12, 12);
  ctx.fillStyle = COLORS.health;
  ctx.fillRect(x - 1.5, y - 4 + bob, 3, 8);
  ctx.fillRect(x - 4, y - 1.5 + bob, 8, 3);
}

function drawFog() {
  // Create radial gradient fog centered on player (screen space)
  const px = player.x - camera.x;
  const py = player.y - camera.y;
  const innerR = VISION_RADIUS * TILE * 0.5;
  const outerR = VISION_RADIUS * TILE;

  // We draw a full-screen dark overlay and cut out a circle
  ctx.save();

  // Create clipping path that's the inverse of a circle
  ctx.fillStyle = COLORS.fog;
  ctx.beginPath();
  // Outer rectangle
  ctx.rect(0, 0, W(), H());
  // Inner circle (counter-clockwise to create hole)
  ctx.moveTo(px + outerR, py);
  ctx.arc(px, py, outerR, 0, Math.PI * 2, true);
  ctx.fill();

  // Soft edge gradient
  const grad = ctx.createRadialGradient(px, py, innerR, px, py, outerR);
  grad.addColorStop(0, 'rgba(10, 10, 26, 0)');
  grad.addColorStop(0.5, 'rgba(10, 10, 26, 0.3)');
  grad.addColorStop(1, 'rgba(10, 10, 26, 0.85)');

  ctx.beginPath();
  ctx.arc(px, py, outerR, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.restore();
}

function updateHUD() {
  // HP
  const hpPct = player.hp / player.maxHp;
  document.getElementById('hpFill').style.width = (hpPct * 100) + '%';
  document.getElementById('hpText').textContent = Math.ceil(player.hp);

  // HP bar color
  const hpFill = document.getElementById('hpFill');
  if (hpPct > 0.5) {
    hpFill.style.background = `linear-gradient(90deg, #44cc44, #88ee88)`;
  } else if (hpPct > 0.25) {
    hpFill.style.background = `linear-gradient(90deg, #ddaa00, #ffcc44)`;
  } else {
    hpFill.style.background = `linear-gradient(90deg, #cc2222, #ff4444)`;
  }

  // Cartoon clock
  const totalMinutes = 22 * 60 + gameTime;
  const hours = Math.floor(totalMinutes / 60) % 24;
  const mins = totalMinutes % 60;
  const clockStr = String(hours).padStart(2, '0') + ':' + String(mins).padStart(2, '0');
  // 根据小时选 emoji 钟表: 🕙10 🕥10:30 🕚11 🕦11:30 🕛12
  const clockEmojis = { '22:00':'🕙','22:30':'🕥','23:00':'🕚','23:30':'🕦','0:00':'🕛' };
  let emoji = '🕙';
  if (hours === 22 && mins >= 30) emoji = '🕥';
  if (hours === 23 && mins < 30) emoji = '🕚';
  if (hours === 23 && mins >= 30) emoji = '🕦';
  if (hours === 0 || (hours === 23 && mins >= 55)) emoji = '🕛';
  const clockEl = document.getElementById('clock');
  clockEl.textContent = `${emoji} ${clockStr}`;

  // Urgent when past 23:30
  clockEl.classList.toggle('urgent', gameTime > 90);

  // Countdown timer
  const totalGameSec = GAME_MINUTES * REAL_SECONDS_PER_GAME_MINUTE;
  const remainSec = Math.max(0, Math.ceil(totalGameSec - realTimer));
  const tm = String(Math.floor(remainSec / 60)).padStart(2, '0');
  const ts = String(remainSec % 60).padStart(2, '0');
  const timerEl = document.getElementById('timer');
  timerEl.textContent = `${tm}:${ts}`;
  timerEl.classList.toggle('urgent', remainSec <= 30);
}

// ===================== 游戏结束 =====================

function endGame(reason) {
  gameState = reason === 'win' ? 'won' : 'lost';
  document.getElementById('hud').hidden = true;
  document.getElementById('dpad').hidden = true;

  const titleEl = document.getElementById('resultTitle');
  const textEl = document.getElementById('resultText');

  if (reason === 'win') {
    titleEl.textContent = '成功逃脱！';
    titleEl.style.color = '#44cc44';
    const usedMinutes = gameTime;
    const clockH = Math.floor((22 * 60 + usedMinutes) / 60) % 24;
    const clockM = (22 * 60 + usedMinutes) % 60;
    const timeStr = String(clockH).padStart(2, '0') + ':' + String(clockM).padStart(2, '0');
    const realSec = Math.floor(realTimer);
    const rm = String(Math.floor(realSec / 60)).padStart(2, '0');
    const rs = String(realSec % 60).padStart(2, '0');
    textEl.innerHTML = `小女孩成功逃出了商场！<br>游戏时间：${timeStr}<br>实际用时：${rm}:${rs}<br>剩余血量：${Math.ceil(player.hp)}`;
    saveBestTime(usedMinutes);
  } else if (reason === 'guard') {
    titleEl.textContent = '被警卫发现了！';
    titleEl.style.color = '#4a90d9';
    textEl.textContent = '你被警卫抓住了...小心躲避他们的视线！';
  } else if (reason === 'monster') {
    titleEl.textContent = '血量耗尽！';
    titleEl.style.color = '#c94444';
    textEl.textContent = '小女孩被怪物击倒了...注意收集药包回复血量！';
  } else {
    titleEl.textContent = '时间到了！';
    titleEl.style.color = '#ffd700';
    textEl.textContent = '午夜12点了...你没能在关门前逃出商场。';
  }

  document.getElementById('gameOverScreen').hidden = false;
}

// ===================== 最佳记录 =====================

function getBestTime() {
  try {
    return JSON.parse(localStorage.getItem('mall-escape-best'));
  } catch { return null; }
}

function saveBestTime(minutes) {
  const current = getBestTime();
  if (current === null || minutes < current) {
    localStorage.setItem('mall-escape-best', JSON.stringify(minutes));
  }
}

function showBestRecord() {
  const best = getBestTime();
  const el = document.getElementById('bestRecord');
  if (best !== null) {
    const totalMinutes = 22 * 60 + best;
    const h = Math.floor(totalMinutes / 60) % 24;
    const m = totalMinutes % 60;
    el.textContent = `最佳逃脱时间：${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  } else {
    el.textContent = '';
  }
}

// ===================== 游戏循环 =====================

function gameLoop(timestamp) {
  if (lastTime === 0) lastTime = timestamp;
  const dt = Math.min((timestamp - lastTime) / 1000, 0.05); // cap dt
  lastTime = timestamp;

  if (gameState === 'playing') {
    update(dt);
    render();
  }

  requestAnimationFrame(gameLoop);
}

// ===================== 事件绑定 =====================

document.getElementById('btnStart').addEventListener('click', () => {
  initGame();
  lastTime = 0;
});

document.getElementById('btnRestart').addEventListener('click', () => {
  initGame();
  lastTime = 0;
});

// ===================== 启动 =====================

showBestRecord();
requestAnimationFrame(gameLoop);
