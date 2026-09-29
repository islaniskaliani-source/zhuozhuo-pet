/* 卓卓 desktop pet — sprite engine + behavior state machine + speech. */

const CELL_W = 192, CELL_H = 208, COLS = 8;
const SCALE = 0.5;               // 96x104，小巧版
const CAT_LEFT = 112, CAT_RIGHT = 112 + 96;  // cat box inside the 320px window
const ROWS = {
  idle: 0, walk: 1, jump: 2, attack: 3, defend: 4,
  die: 5, win: 6, lose: 7, custom: 8,
};
const FRAME_MS = 125;
const WALK_SPEED = 60;           // px/s
const GRAVITY = 2200;           // px/s^2

const canvas = document.getElementById('cat');
const ctx = canvas.getContext('2d');
const sheets = [];              // two spritesheets -> photo variety per action

const bubble = document.getElementById('bubble');
const bubbleText = document.getElementById('bubble-text');

const LINES = {
  startup: ['本喵上线了，都让让。', '卓卓，参上！', '桌面归我管，有意见喵？'],
  general: [
    '今天也要加油鸭。', '又在摸鱼？本喵看着呢。', '我的罐头呢？',
    '这键盘看起来很好躺。', '谁在敲键盘？吵到本喵了。', '喵～',
    '盯——（盯着你的屏幕）', '坐久了对腰不好，真的。', '本喵今日运势：宜摸鱼。',
    '有没有小鱼干，没有就下次问。', '窗外有只鸟，本喵记下了。',
  ],
  pet: ['呼噜呼噜……', '摸够了没？（没摸够）', '再摸一下也不是不行。', '哼，算你有眼光。'],
  drag: ['哇啊啊要掉了！', '轻点！本喵不是拖鞋！', '飞起来了！！不太优雅但飞起来了。'],
  landing: ['稳。', '落地技术，一流。', '刚才什么都没发生。', '地板还是我的。'],
  groom: ['理个毛，勿念。', '梳理是喵的必修课。'],
  sleep: ['Zzz……', '侧个躺，到点再叫我。'],
  play: ['来抓我啊～', '打滚！谁赞成谁反对？'],
  jump: ['起跳！落地！完美。', '本喵会轻功。'],
  lateNight: ['这么晚还不睡？本喵都困了。', '熬夜掉毛，懂？', '快去睡，本喵命令你。'],
  morning: ['早，铲屎官。', '太阳晒屁股了。'],
  meal: ['到点了，罐头时间。', '干饭不积极，思想有问题。'],
};

let pos = { x: 0, y: 0 };
let winH = 0, winW = 0, workArea = null;
let state = 'idle';
let stateUntil = 0;
let frame = 0;
let lastFrameAt = 0;
let facing = 1;                  // art faces right; 1 = right, -1 = left
let dir = 1;
let falling = false, vy = 0;
let paused = false;
let dragging = false, dragMoved = 0, lastPointer = null;
let bubbleTimer = null, speakTimer = null;
let hoverActive = false;
let curSheet = 0;                // which photo set the current action uses
let homeX = 0;                   // the spot the cat wanders back to after walking
let walkTargetX = 0, walkPhase = 'out', walkDeadline = 0;

const pick = (a) => a[Math.floor(Math.random() * a.length)];
const floorY = () => workArea.y + workArea.height - winH;
const bounds = () => ({
  minX: workArea.x - CAT_LEFT,
  maxX: workArea.x + workArea.width - CAT_RIGHT,
});

function speak(kind) {
  const hour = new Date().getHours();
  let pool = LINES[kind] || LINES.general;
  if (kind === 'general') {
    if (hour >= 0 && hour < 5) pool = Math.random() < 0.6 ? LINES.lateNight : pool;
    else if (hour >= 6 && hour < 9) pool = Math.random() < 0.5 ? LINES.morning : pool;
    else if ((hour === 12) || (hour === 17 && new Date().getMinutes() >= 30))
      pool = Math.random() < 0.5 ? LINES.meal : pool;
  }
  bubbleText.textContent = pick(pool);
  bubble.classList.remove('hidden');
  clearTimeout(bubbleTimer);
  bubbleTimer = setTimeout(() => bubble.classList.add('hidden'), 4500);
}

function scheduleSpeak() {
  clearTimeout(speakTimer);
  speakTimer = setTimeout(() => {
    if (!paused && !dragging) speak('general');
    scheduleSpeak();
  }, 240000 + Math.random() * 120000);   // 4-6 分钟，约 5 分钟一次
}

/* ---------- state machine ---------- */

const STATES = {
  idle: { row: 'idle', min: 150000, max: 210000 },   // 待机 2.5-3.5 分钟才换动作
  walk: { row: 'walk', min: 1e12, max: 1e12 },        // ends when the cat is home
  jump: { row: 'jump', min: 1600, max: 1600, onEnter: () => speak('jump') },
  groom: { row: 'lose', min: 5000, max: 10000, onEnter: () => speak('groom') },
  sleep: { row: 'die', min: 8000, max: 20000, onEnter: () => speak('sleep') },
  play: { row: 'win', min: 3000, max: 6000, onEnter: () => speak('play') },
  petted: { row: 'win', min: 2000, max: 2000, onEnter: () => speak('pet') },
  carried: { row: 'attack', min: 1e12, max: 1e12 },
};

const WEIGHTS = [
  ['idle', 28], ['walk', 32], ['groom', 12], ['sleep', 8],
  ['play', 10], ['jump', 10],
];

function enterState(name) {
  state = name;
  const s = STATES[name];
  curSheet = Math.floor(Math.random() * sheets.length);   // a different photo set each time
  stateUntil = performance.now() + s.min + Math.random() * (s.max - s.min);
  if (name === 'walk') {
    // Remember where we started, stroll to a nearby point, then come back.
    const { minX, maxX } = bounds();
    homeX = pos.x;
    const room = 240;
    let tx = homeX + (Math.random() < 0.5 ? -1 : 1) * (120 + Math.random() * room);
    tx = Math.max(minX + 30, Math.min(maxX - 30, tx));
    if (Math.abs(tx - homeX) < 80) tx = homeX + (tx >= homeX ? 80 : -80);
    walkTargetX = tx;
    walkPhase = 'out';
    walkDeadline = performance.now() + 30000;            // hard safety cap
  }
  if (s.onEnter) s.onEnter();
}

function nextWeightedState() {
  const total = WEIGHTS.reduce((n, w) => n + w[1], 0);
  let r = Math.random() * total;
  for (const [name, weight] of WEIGHTS) {
    if ((r -= weight) <= 0) return enterState(name);
  }
  enterState('idle');
}

/* ---------- rendering ---------- */

function draw(now) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const sheet = sheets[curSheet];
  if (!sheet || !sheet.complete || !sheet.naturalWidth) return;

  if (now - lastFrameAt >= FRAME_MS) {
    lastFrameAt = now;
    frame = (frame + 1) % COLS;
  }
  const row = ROWS[STATES[state].row];
  const sx = frame * CELL_W, sy = row * CELL_H;
  const face = state === 'walk' ? dir : facing;

  ctx.save();
  if (face === -1) {
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(sheet, sx, sy, CELL_W, CELL_H, 0, 0, CELL_W * SCALE, CELL_H * SCALE);
  ctx.restore();
}

/* ---------- movement / physics loop ---------- */

let lastTick = performance.now();

function tick(now) {
  const dt = Math.min(0.05, (now - lastTick) / 1000);
  lastTick = now;

  if (!paused) {
    if (falling) {
      vy += GRAVITY * dt;
      pos.y += vy * dt;
      if (pos.y >= floorY()) {
        pos.y = floorY();
        falling = false;
        speak('landing');
        enterState('idle');
      }
      window.petApi.move(pos.x, pos.y);
    } else if (state === 'walk' && !dragging) {
      const { minX, maxX } = bounds();
      const dest = walkPhase === 'out' ? walkTargetX : homeX;
      dir = dest > pos.x ? 1 : -1;
      pos.x += dir * WALK_SPEED * dt;
      pos.x = Math.max(minX, Math.min(maxX, pos.x));
      pos.y = floorY();
      const arrived = Math.abs(pos.x - dest) <= WALK_SPEED * dt + 1;
      if (arrived) {
        if (walkPhase === 'out') {
          walkPhase = 'back';
        } else {
          pos.x = homeX;              // snapped back to the original spot
          enterState('idle');
        }
      } else if (now >= walkDeadline) {
        pos.x = homeX;
        enterState('idle');
      }
      window.petApi.move(pos.x, pos.y);
    }

    if (state !== 'walk' && now >= stateUntil && !dragging && !falling) nextWeightedState();
    draw(now);
  }
  requestAnimationFrame(tick);
}

/* ---------- interaction ---------- */

function isOnCat(clientX, clientY) {
  const r = canvas.getBoundingClientRect();
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  const dx = (clientX - cx) / (r.width * 0.46), dy = (clientY - cy) / (r.height * 0.48);
  return dx * dx + dy * dy <= 1;
}

document.addEventListener('mousemove', (e) => {
  const on = isOnCat(e.clientX, e.clientY);
  if (on !== hoverActive) {
    hoverActive = on;
    window.petApi.setCatHover(on);
  }
  if (dragging) {
    const dx = e.screenX - lastPointer.x, dy = e.screenY - lastPointer.y;
    dragMoved += Math.abs(dx) + Math.abs(dy);
    lastPointer = { x: e.screenX, y: e.screenY };
    pos.x += dx; pos.y += dy;
    window.petApi.move(pos.x, pos.y);
  }
});

canvas.addEventListener('mousedown', (e) => {
  if (e.button !== 0 || paused) return;
  dragging = true;
  dragMoved = 0;
  lastPointer = { x: e.screenX, y: e.screenY };
  enterState('carried');
});

window.addEventListener('mouseup', () => {
  if (!dragging) return;
  dragging = false;
  if (dragMoved < 6) {                       // a click, not a grab
    enterState('petted');
    stateUntil = performance.now() + 2000;
    return;
  }
  speak('drag');
  homeX = pos.x;                              // wherever it was dropped is "home" now
  if (pos.y < floorY()) {                      // dropped mid-air: fall
    falling = true;
    vy = 0;
  } else {
    enterState('idle');
  }
});

/* ---------- tray / global messages ---------- */

window.petApi.on('set-paused', (p) => { paused = p; });
window.petApi.on('force-speak', () => speak('general'));

/* ---------- boot ---------- */

let boundsReady = false, sheetsReady = 0;

function tryBoot() {
  if (!(boundsReady && sheetsReady === sheets.length) || winH === 0) return;
  homeX = pos.x;
  speak('startup');
  scheduleSpeak();
  enterState('idle');
  requestAnimationFrame(tick);
}

['../assets/spritesheet.webp', '../assets/spritesheet2.webp'].forEach((src) => {
  const img = new Image();
  img.onload = () => { sheetsReady++; tryBoot(); };
  img.src = src;
  sheets.push(img);
});

window.petApi.getBounds().then((b) => {
  pos = { x: b.x, y: b.y };
  winW = b.w; winH = b.h;
  workArea = b.workArea;
  boundsReady = true;
  tryBoot();
});
