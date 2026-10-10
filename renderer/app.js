/* 卓卓 desktop pet — sprite engine + behavior state machine + speech. */

const CELL_W = 192, CELL_H = 208, COLS = 8;
const SCALE = 0.5;               // 96x104，小巧版
const CAT_LEFT = 112, CAT_RIGHT = 112 + 96;  // cat box inside the 320px window
const ROWS = {
  idle: 0, walk: 1, jump: 2, attack: 3, defend: 4,
  die: 5, win: 6, lose: 7, custom: 8,
};
const FRAME_MS = 125;
const WALK_SPEED = 60;           // px/s, casual stroll
const HUNT_SPEED = 170;          // px/s, zoomies when chasing the cursor
const POOP_SPEED = 110;          // px/s, trotting to a spot to poop
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
  bite: ['啊呜！抓到啦。', '咬你手指头，谁让你逗我。', '哈——（其实没舍得真咬）'],
  startle: ['你干嘛啦！吓喵一跳。', '有刺客！', '魂都给你吓飞了，赔。'],
  needy: ['理理我嘛。', '摸我，现在，立刻。', '你是不是在外面有别的猫了。'],
  happy: ['呼噜呼噜～舒服。', '本喵今天心情不错，赏你摸两下。', '再摸五百年。'],
  poop: ['嗯……（认真）', '拉完了，神清气爽。', '那个……地上有惊喜，你自己看着办。'],
  poopWarn: ['地上有东西哦，铲屎官。', '臭了臭了，还不快铲。', '本喵要坐屎里了，你不管管？'],
  eat: ['咔吱咔吱…好吃。', '小鱼干！爱死你了。', '干饭喵，上线。'],
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

// cursor-reactive interaction state
let cursor = { x: 0, y: 0, t: 0 };
let cursorVel = 0;               // px/s, smoothed
let nearSince = 0;               // when the pointer entered bite range
let lastBiteAt = 0, lastStartleAt = 0, lastNeedyAt = 0;
let purr = 50;                   // 好感度 0..100

let lastPounceAt = 0;
let food = null;                 // {id, x, y} dropped fish, cat walks to eat
let poopCount = 0, lastWarnAt = 0;

// placement mode: false = gravity/fall (mode 1), true = stay where placed (mode 2)
let freeMode = false;
// one spontaneous interaction every 30-60 min: a poop or a mouse-hunt
const T_MIN = 30 * 60 * 1000, T_MAX = 60 * 60 * 1000;
let nextInteractionAt = 0;
let pendingPoopAt = 0;           // post-meal poop (feed -> poop -> clean loop)
let mode = 'none';               // 'none' | 'poopWalk' | 'hunt' | 'retreat'
let poopTx = 0, poopTy = 0;      // spot the cat strolls to before pooping
let huntEndAt = 0;               // the hunt ends once now >= this
let retreatQueued = false;       // interaction over -> trot off to a screen corner
let retreatTx = 0, retreatTy = 0;

function scheduleInteraction(now) {
  nextInteractionAt = now + T_MIN + Math.random() * (T_MAX - T_MIN);
}
function setFree(v) {            // switch placement mode and sync the tray checkbox
  freeMode = v;
  window.petApi.send('sync-free-mode', v);
}
function ensureWalk(now) {
  if (state !== 'walk') { state = 'walk'; curSheet = Math.floor(Math.random() * sheets.length); stateUntil = now + 1e12; }
}
function startPoopWalk(now) {
  setFree(true);                 // pooping roams the whole screen -> mode 2
  const b = bounds(), by = boundsY();
  poopTx = b.minX + 80 + Math.random() * (b.maxX - b.minX - 160);
  poopTy = by.minY + 60 + Math.random() * (by.maxY - by.minY - 120);
  falling = false;
  mode = 'poopWalk';
  ensureWalk(now);
}
function startHunt(now) {
  setFree(true);                 // chasing the mouse roams the whole screen -> mode 2
  falling = false;
  mode = 'hunt';
  huntEndAt = now + 20000;       // hard cap in case it never catches the cursor
  speak('play');
  ensureWalk(now);
}
function startRetreat(now) {
  // Park in a screen corner once an interaction is over. In gravity mode the cat
  // can only reach the two bottom corners.
  const wa = workArea;
  const ys = freeMode ? [wa.y + 90, wa.y + wa.height - 40] : [wa.y + wa.height - 40];
  retreatTx = wa.x + (Math.random() < 0.5 ? 90 : wa.width - 90);
  retreatTy = ys[Math.floor(Math.random() * ys.length)];
  mode = 'retreat';
  ensureWalk(now);
}
function doPoop() {
  const c = catCenter();
  window.petApi.send('spawn-poop', { x: c.x, y: pos.y + winH });
  poopCount++;
}

const pick = (a) => a[Math.floor(Math.random() * a.length)];
const floorY = () => workArea.y + workArea.height - winH;
const bounds = () => ({
  minX: workArea.x - CAT_LEFT,
  maxX: workArea.x + workArea.width - CAT_RIGHT,
});
// vertical range the window may occupy so the CAT can reach the top/bottom edges
const boundsY = () => ({
  minY: workArea.y - (winH - 104),
  maxY: workArea.y + workArea.height - winH,
});
// steer the window so the cat's body centre eases toward a screen point; returns distance left
function moveToward(tx, ty, speed, dt) {
  const { minX, maxX } = bounds();
  const { minY, maxY } = boundsY();
  const wx = tx - CAT_LEFT - 48;
  const wy = ty - winH + 52;
  const dx = wx - pos.x, dy = wy - pos.y;
  const dist = Math.hypot(dx, dy) || 1;
  const step = speed * dt;
  if (dist <= step) { pos.x = wx; pos.y = wy; }
  else { pos.x += (dx / dist) * step; pos.y += (dy / dist) * step; }
  pos.x = Math.max(minX, Math.min(maxX, pos.x));
  pos.y = Math.max(minY, Math.min(maxY, pos.y));
  dir = dx >= 0 ? 1 : -1;
  return Math.hypot(wx - pos.x, wy - pos.y);
}
// cat centre in screen coords (canvas sits at left:112, 96x104, bottom-anchored)
const catCenter = () => ({ x: pos.x + CAT_LEFT + 48, y: pos.y + winH - 52 });

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
  bite: { row: 'attack', min: 900, max: 900, onEnter: () => speak('bite') },
  startle: { row: 'jump', min: 800, max: 800, onEnter: () => speak('startle') },
  poop: { row: 'defend', min: 2600, max: 2600, onEnter: () => { speak('poop'); doPoop(); } },
  eat: { row: 'win', min: 2600, max: 3200, onEnter: () => speak('eat') },
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

/* ---------- cursor-reactive behaviour (startle / bite / purr) ---------- */

function spawnHeart() {
  const h = document.createElement('div');
  h.className = 'heart';
  h.textContent = '❤️';
  h.style.left = (CAT_LEFT + 20 + Math.random() * 56) + 'px';
  document.body.appendChild(h);
  setTimeout(() => h.remove(), 1200);
}

function evaluateReactions(now) {
  if (dragging || falling || mode !== 'none') return;
  if (state !== 'idle' && state !== 'walk') return;   // only react from calm states
  if (!cursor.t) return;

  const c = catCenter();
  const dist = Math.hypot(cursor.x - c.x, cursor.y - c.y);

  // Startled by a fast pointer lunging at the cat.
  if (cursorVel > 1500 && dist < 90 && now - lastStartleAt > 6000) {
    lastStartleAt = now;
    purr = Math.max(0, purr - 6);
    return enterState('startle');
  }

  // A slow pointer lingering near the face gets a gentle bite.
  if (dist < 75) {
    if (!nearSince) nearSince = now;
    if (now - nearSince > 550 && now - lastBiteAt > 6000) {
      lastBiteAt = now; nearSince = 0;
      return enterState('bite');
    }
  } else {
    nearSince = 0;
  }

  // Neglected cat fishes for attention.
  if (purr < 25 && now - lastNeedyAt > 45000 && Math.random() < 0.02) {
    lastNeedyAt = now;
    return speak('needy');
  }

  // Too much poop left on the desktop — nag about it.
  if (poopCount >= 2 && now - lastWarnAt > 20000) {
    lastWarnAt = now;
    return speak('poopWarn');
  }
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
    } else if (!dragging && food) {
      // Walk to the dropped fish and eat it.
      ensureWalk(now);
      const c = catCenter();
      const { minX, maxX } = bounds();
      dir = food.x > c.x ? 1 : -1;
      pos.x = Math.max(minX, Math.min(maxX, pos.x + dir * WALK_SPEED * dt));
      if (!freeMode) pos.y = floorY();
      if (Math.abs(food.x - c.x) < 40) {
        window.petApi.send('eat-food', { id: food.id });
        enterState('eat');
      }
      window.petApi.move(pos.x, pos.y);
    } else if (!dragging && mode === 'poopWalk') {
      // Stroll to a chosen spot anywhere on screen, then drop one poop.
      if (moveToward(poopTx, poopTy, POOP_SPEED, dt) < 30) {
        mode = 'none';
        retreatQueued = true;
        enterState('poop');
      } else {
        ensureWalk(now);
      }
      window.petApi.move(pos.x, pos.y);
    } else if (!dragging && mode === 'hunt') {
      // Chase the real cursor across the whole screen; end 3s after catching it.
      if (state === 'bite' && now < stateUntil) {
        // let the pounce animation play
      } else {
        ensureWalk(now);
        const d = moveToward(cursor.x, cursor.y, HUNT_SPEED, dt);
        if (d < 55 && now - lastPounceAt > 2500) {
          lastPounceAt = now;
          enterState('bite');
          huntEndAt = now + 3000;        // catch it, then 3 seconds and done
        }
      }
      if (now >= huntEndAt) { mode = 'none'; enterState('idle'); retreatQueued = true; }
      window.petApi.move(pos.x, pos.y);
    } else if (!dragging && mode === 'retreat') {
      // Walk to a screen corner and stay there.
      if (moveToward(retreatTx, retreatTy, WALK_SPEED * 1.4, dt) < 30) {
        mode = 'none';
        enterState('idle');
      }
      window.petApi.move(pos.x, pos.y);
    } else if (state === 'walk' && !dragging) {
      // Normal wander: out and back to home.
      const { minX, maxX } = bounds();
      const dest = walkPhase === 'out' ? walkTargetX : homeX;
      dir = dest > pos.x ? 1 : -1;
      pos.x += dir * WALK_SPEED * dt;
      pos.x = Math.max(minX, Math.min(maxX, pos.x));
      if (!freeMode) pos.y = floorY();
      const arrived = Math.abs(pos.x - dest) <= WALK_SPEED * dt + 1;
      if (arrived) {
        if (walkPhase === 'out') walkPhase = 'back';
        else { pos.x = homeX; enterState('idle'); }
      } else if (now >= walkDeadline) {
        pos.x = homeX;
        enterState('idle');
      }
      window.petApi.move(pos.x, pos.y);
    }

    // Post-meal poop — the feed -> poop -> clean loop.
    if (pendingPoopAt && now >= pendingPoopAt && !dragging && !falling && !food && mode === 'none') {
      pendingPoopAt = 0;
      startPoopWalk(now);
    }

    // One spontaneous interaction every 30-60 min: a poop or a mouse-hunt.
    if (nextInteractionAt && now >= nextInteractionAt && !dragging && !falling && !food && mode === 'none') {
      nextInteractionAt = 0;
      if (Math.random() < 0.5) startPoopWalk(now);
      else startHunt(now);
      scheduleInteraction(now);
    }

    // Once the interaction's own animation has played out, go park in a corner.
    if (retreatQueued && mode === 'none' && now >= stateUntil && !dragging && !falling && !food) {
      retreatQueued = false;
      startRetreat(now);
    }

    if (state !== 'walk' && mode === 'none' && !food && now >= stateUntil && !dragging && !falling) nextWeightedState();
    evaluateReactions(now);
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
    const now = performance.now();
    enterState('petted');
    stateUntil = now + 2000;
    purr = Math.min(100, purr + 8);
    spawnHeart();
    if (purr >= 80 && Math.random() < 0.6) speak('happy');
    return;
  }
  speak('drag');
  homeX = pos.x;                              // wherever it was dropped is "home" now
  mode = 'none'; retreatQueued = false;        // a manual placement beats the corner
  if (!freeMode && pos.y < floorY()) {         // gravity mode + dropped mid-air: fall
    falling = true;
    vy = 0;
  } else {
    enterState('idle');
  }
});

/* ---------- tray / global messages ---------- */

window.petApi.on('set-paused', (p) => { paused = p; });
window.petApi.on('force-speak', () => speak('general'));

window.petApi.on('set-free-mode', (v) => {
  freeMode = !!v;
  if (freeMode) {
    falling = false;
  } else if (!dragging && pos.y < floorY()) {
    falling = true; vy = 0;                 // back to gravity: settle to the floor
  }
});

window.petApi.on('trigger-hunt', () => {
  const now = performance.now();
  if (dragging || falling || food || mode !== 'none') return;
  startHunt(now);
});

window.petApi.on('cursor', (c) => {
  const now = performance.now();
  const dt = (now - cursor.t) / 1000;
  if (cursor.t > 0 && dt > 0) {
    const speed = Math.hypot(c.x - cursor.x, c.y - cursor.y) / dt;
    cursorVel = cursorVel * 0.5 + speed * 0.5;      // smooth
  }
  cursor = { x: c.x, y: c.y, t: now };
});

window.petApi.on('food-dropped', (f) => { food = f; });

window.petApi.on('food-eaten', () => {
  food = null;
  retreatQueued = true;                                                        // eat, then go back to the corner
  pendingPoopAt = performance.now() + 30000 + Math.random() * 30000;   // eat -> poop (loop)
});

window.petApi.on('poop-cleaned', () => {
  poopCount = Math.max(0, poopCount - 1);
  purr = Math.min(100, purr + 5);
  speak('happy');
  spawnHeart();
});

/* ---------- meal-time feeding (auto) ---------- */
// breakfast 09:00-09:30, lunch 11:30-12:30, dinner 17:30-18:30
const MEALS = [[9, 0, 9, 30], [11, 30, 12, 30], [17, 30, 18, 30]];
let lastMealKey = '';
function checkMeal() {
  const d = new Date();
  const mins = d.getHours() * 60 + d.getMinutes();
  for (let i = 0; i < MEALS.length; i++) {
    const [h1, m1, h2, m2] = MEALS[i];
    if (mins >= h1 * 60 + m1 && mins <= h2 * 60 + m2) {
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}-${i}`;
      if (lastMealKey !== key && mode === 'none' && !food && !dragging && !falling) {
        lastMealKey = key;
        speak('meal');
        window.petApi.send('meal-feed');     // main drops a fish; the cat trots over and eats it
      }
      return;
    }
  }
}

/* ---------- boot ---------- */

let boundsReady = false, sheetsReady = 0;

function tryBoot() {
  if (!(boundsReady && sheetsReady === sheets.length) || winH === 0) return;
  homeX = pos.x;
  speak('startup');
  scheduleSpeak();
  setInterval(() => { purr = Math.max(0, purr - 2); }, 30000);   // 好感度缓慢衰减
  scheduleInteraction(performance.now());                        // 每 30-60 分钟一次自发互动
  checkMeal(); setInterval(checkMeal, 30000);                    // 饭点自动投喂
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
