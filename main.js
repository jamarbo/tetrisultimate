/* Tetris Neon - Juego completo con: prompt de nombre, panel de puntaje, next y hold, controles y UI */
(function(){
  // Configuración base
  const COLS = 10, ROWS = 20, CELL = 36; // canvas 360x720
  const BOARD_W = COLS * CELL, BOARD_H = ROWS * CELL;
  const SPEEDS = [1000, 850, 700, 600, 500, 420, 360, 300, 260, 220, 190, 170, 150, 135, 120];
  // Incremento gradual adicional (además del nivel por líneas)
  const DIFFICULTY = {
    linesStep: 5,      // cada 5 líneas, sube un poco la velocidad
    locksStep: 10,     // o cada 10 piezas fijadas
    bonusMs: 30,       // restar 30ms al tiempo de caída
    minSpeedMs: 70     // límite inferior de velocidad
  };
  const SCORE_PER = { single:100, double:300, triple:500, tetris:800, soft:1, hard:2 }; // base, multiplicado por nivel

  const COLORS = {
    I: '#00e8ff',
    O: '#ffd200',
    T: '#a76bff',
    S: '#00ffa9',
    Z: '#ff6b8a',
    J: '#4aa3ff',
    L: '#ffa24a',
    G: 'rgba(255,255,255,.07)' // ghost
  };

  const SHAPES = {
    I: [
      [0,0,0,0],
      [1,1,1,1],
      [0,0,0,0],
      [0,0,0,0],
    ],
    O: [
      [1,1],
      [1,1],
    ],
    T: [
      [0,1,0],
      [1,1,1],
      [0,0,0],
    ],
    S: [
      [0,1,1],
      [1,1,0],
      [0,0,0],
    ],
    Z: [
      [1,1,0],
      [0,1,1],
      [0,0,0],
    ],
    J: [
      [1,0,0],
      [1,1,1],
      [0,0,0],
    ],
    L: [
      [0,0,1],
      [1,1,1],
      [0,0,0],
    ],
  };

  // Utilidades
  const $ = (s)=>document.querySelector(s);
  const boardCanvas = $('#board');
  const nextCanvas = $('#next');
  const holdCanvas = $('#hold');
  const ctx = boardCanvas.getContext('2d');
  const nctx = nextCanvas.getContext('2d');
  const hctx = holdCanvas.getContext('2d');
  const nextHUDCanvas = document.getElementById('nextHUD');
  const nhctx = nextHUDCanvas ? nextHUDCanvas.getContext('2d') : null;
  // FX layer
  const fxLayer = document.getElementById('fxLayer');

  boardCanvas.width = BOARD_W; boardCanvas.height = BOARD_H;
  const isMobile = matchMedia('(hover: none) and (pointer: coarse)').matches || /Mobi|Android/i.test(navigator.userAgent);
  const touchControls = document.getElementById('touchControls');
  if(isMobile){
    touchControls?.setAttribute('aria-hidden','false');
  }
  const rtModeEl = document.getElementById('rtMode');
  setRealtimeBadge();

  // -------- Audio / SFX --------
  const MUTE_KEY = 'tetris_mute';
  const audioToggle = document.getElementById('audioToggle');
  let audioCtx = null;
  let isMuted = false;
  try{ isMuted = (localStorage.getItem(MUTE_KEY) === '1'); }catch{}
  updateAudioToggleUI();
  audioToggle?.addEventListener('click', ()=>{
    isMuted = !isMuted;
    try{ localStorage.setItem(MUTE_KEY, isMuted ? '1' : '0'); }catch{}
    updateAudioToggleUI();
  });
  function updateAudioToggleUI(){
    if(!audioToggle) return;
    audioToggle.dataset.muted = isMuted ? 'true' : 'false';
    audioToggle.textContent = isMuted ? '🔈' : '🔊';
    audioToggle.setAttribute('aria-label', isMuted ? 'Sonido desactivado' : 'Sonido activado');
  }
  function ensureCtx(){
    if(isMuted) return null;
    if(!audioCtx){
      try{ audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
      catch{ audioCtx = null; }
    }
    return audioCtx;
  }
  function envGain(duration=0.2, curve='exp'){ // helper ADSR simple
    const ctx = ensureCtx(); if(!ctx) return null;
    const g = ctx.createGain();
    const now = ctx.currentTime;
    g.gain.cancelScheduledValues(now);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.6, now + 0.02);
    if(curve==='exp') g.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    else g.gain.linearRampToValueAtTime(0.0001, now + duration);
    g.connect(ctx.destination);
    setTimeout(()=> g.disconnect(), duration*1000 + 50);
    return g;
  }
  function playStarSparkle(){
    const ctx = ensureCtx(); if(!ctx) return;
    const base = 880; // A5
    for(let i=0;i<3;i++){
      const o = ctx.createOscillator();
      const g = envGain(0.25);
      if(!g) return;
      o.type = 'triangle';
      o.frequency.setValueAtTime(base + i*120, ctx.currentTime);
      o.connect(g);
      o.start(); o.stop(ctx.currentTime + 0.25);
      setTimeout(()=> o.disconnect(), 300);
    }
    // light noise sparkle
    const noiseDur = 0.18;
    const b = ctx.createBuffer(1, ctx.sampleRate * noiseDur, ctx.sampleRate);
    const d = b.getChannelData(0);
    for(let i=0;i<d.length;i++) d[i] = (Math.random()*2-1)*0.2;
    const nsrc = ctx.createBufferSource(); nsrc.buffer = b;
    const ng = envGain(noiseDur, 'lin'); if(!ng) return;
    nsrc.connect(ng); nsrc.start(); setTimeout(()=> nsrc.disconnect(), noiseDur*1000+50);
  }

  function playFanfareApplause(){
    const ctx = ensureCtx(); if(!ctx) return;
    const now = ctx.currentTime;
    // Fanfare: triad arpeggio + quick brass-like (saw) swells
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5]; // C5, E5, G5, C6, E6
    notes.forEach((f,i)=>{
      const o = ctx.createOscillator();
      const g = envGain(0.45, 'exp'); if(!g) return;
      o.type = i%2? 'square':'triangle';
      o.frequency.setValueAtTime(f, now + i*0.1);
      o.connect(g); o.start(now + i*0.1); o.stop(now + i*0.1 + 0.45);
      setTimeout(()=> o.disconnect(), 600);
    });
    // Brass sweep
    const o2 = ctx.createOscillator(); const g2 = envGain(1.1, 'lin'); if(g2){
      o2.type='sawtooth'; o2.frequency.setValueAtTime(440, now+0.12);
      o2.frequency.exponentialRampToValueAtTime(1046.5, now+0.85);
      o2.connect(g2); o2.start(now+0.12); o2.stop(now+1.25);
      setTimeout(()=> o2.disconnect(), 1400);
    }
    // Applause (filtered noise burst with repeats)
    const makeNoise = (t, dur, amp=0.22)=>{
      const b = ctx.createBuffer(1, ctx.sampleRate*dur, ctx.sampleRate);
      const d = b.getChannelData(0);
      for(let i=0;i<d.length;i++) d[i] = (Math.random()*2-1) * (Math.random()) * amp;
      const src = ctx.createBufferSource(); src.buffer = b;
      const ng = envGain(dur*1.2, 'lin'); if(!ng) return;
      src.connect(ng); src.start(t); setTimeout(()=> src.disconnect(), dur*1000+80);
    };
    makeNoise(now+0.25, 0.45, 0.24);
    makeNoise(now+0.6, 0.45, 0.22);
    makeNoise(now+0.95, 0.45, 0.2);
    // Optimistic pops (explosions suaves)
    for(let i=0;i<6;i++){
      const t = now + 0.15 + i*0.14;
      const o = ctx.createOscillator(); const g = envGain(0.26,'exp'); if(!g) break;
      o.type='sine'; o.frequency.setValueAtTime(920, t);
      o.frequency.exponentialRampToValueAtTime(320, t+0.2);
      o.connect(g); o.start(t); o.stop(t+0.26);
      setTimeout(()=> o.disconnect(), 360);
    }
    // Rolling tom-like sweep for extra punch
    const tom = ctx.createOscillator(); const tg = envGain(0.5,'lin'); if(tg){
      tom.type='sine'; tom.frequency.setValueAtTime(180, now+0.2);
      tom.frequency.exponentialRampToValueAtTime(120, now+0.6);
      tom.connect(tg); tom.start(now+0.2); tom.stop(now+0.7);
      setTimeout(()=> tom.disconnect(), 800);
    }
  }
  function playWah(){
    const ctx = ensureCtx(); if(!ctx) return;
  const o = ctx.createOscillator(); const g = envGain(1.2, 'lin'); if(!g) return;
  o.type = 'sawtooth';
  const now = ctx.currentTime;
  o.frequency.setValueAtTime(280, now);
  o.frequency.exponentialRampToValueAtTime(90, now + 1.0);
  o.connect(g);
  o.start(); o.stop(now + 1.1);
  setTimeout(()=> o.disconnect(), 1200);
  }

  // -------- Multijugador (hasta 4) ---------
  const roomForm = document.getElementById('roomForm');
  const roomIdInput = document.getElementById('roomIdInput');
  const leaveRoomBtn = document.getElementById('leaveRoom');
  const scoreBody = document.getElementById('scoreBody');
  let roomId = null;
  let realtime = null; // {send, subscribe, close}
  let unsubscribe = null;
  let playerId = `${Math.random().toString(36).slice(2,8)}`;
  let players = {}; // id -> {name, score, lines}
  const MAX_PLAYERS = 4;

  // Estado del juego
  let grid = createMatrix(COLS, ROWS);
  let piece = null; // pieza actual
  let nextQueue = []; // cola 7-bag
  let holdPiece = null;
  let canHold = true;
  let dropCounter = 0;
  let lastTime = 0;
  let level = 1;
  let lines = 0;
  let score = 0;
  let paused = false;
  let gameOver = false;
  let prevLevel = 1; // para detectar incrementos
  // contadores de dificultad incremental
  let bonusSpeedMs = 0; // velocidad extra (ms restados al base)
  let linesSinceBonus = 0;
  let locksSinceBonus = 0;

  // Usuario / mejores puntajes localStorage
  const userKey = 'tetris_user';
  const bestKey = 'tetris_best';
  let userName = loadUser();
  updateUserUI();

  // UI overlays
  const pauseOverlay = $('#pauseOverlay');
  const gameOverOverlay = $('#gameOverOverlay');
  const finalScoreEl = $('#finalScore');

  // Modal nombre si no hay
  const nameModal = $('#nameModal');
  const nameForm = $('#nameForm');
  const nameInput = $('#nameInput');
  const skipNameBtn = $('#skipName');
  const changeNameBtn = $('#changeNameBtn');

  if(!userName){
    openNameModal();
  }
  changeNameBtn.addEventListener('click', openNameModal);
  nameForm.addEventListener('submit', (e)=>{
    e.preventDefault();
    const v = (nameInput.value||'').trim().slice(0,20);
    userName = v || 'Invitado';
    saveUser(userName);
    updateUserUI();
    closeNameModal();
  });
  skipNameBtn.addEventListener('click', ()=>{
    userName = 'Invitado';
    saveUser(userName);
    updateUserUI();
    closeNameModal();
  });

  // Inicialización de cola y pieza
  refillBag();
  spawnPiece();
  drawAll();
  updateNext();
  if(nhctx) updateNextHUD();
  updateHold();
  updatePanel();
  requestAnimationFrame(update);

  // Controles
  document.addEventListener('keydown', (e)=>{
    // Evita scroll con flechas/espacio cuando jugamos
    const isTextInput = ['INPUT','TEXTAREA'].includes((e.target||{}).tagName);
    const blockCodes = ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Space'];
    if(!isTextInput && blockCodes.includes(e.code)) e.preventDefault();

    if(gameOver){
      if(e.code === 'Space') restart();
      return;
    }
    if(e.code === 'KeyP'){ togglePause(); return; }
    if(paused) return;

    switch(e.code){
      case 'ArrowLeft': move(-1); break;
      case 'ArrowRight': move(1); break;
      case 'ArrowUp': rotate(1); break; // CW
      case 'KeyZ': rotate(-1); break; // CCW
      case 'ArrowDown': softDrop(); break;
      case 'Space': hardDrop(); break;
      case 'KeyC':
      case 'ShiftLeft':
      case 'ShiftRight': hold(); break;
    }
  });

  $('#retryBtn').addEventListener('click', restart);

  // Controles táctiles
  setupTouchControls();

  // Multijugador UI
  if(roomForm){
    roomForm.addEventListener('submit', (e)=>{
      e.preventDefault();
      const rid = (roomIdInput?.value||'').trim().slice(0,12);
      if(!rid) return;
      joinRoom(rid);
    });
    leaveRoomBtn?.addEventListener('click', leaveRoom);
  }

  // Funciones de usuario
  function loadUser(){
    try{ return sessionStorage.getItem(userKey) || localStorage.getItem(userKey) || ''; }
    catch{ return ''; }
  }
  function saveUser(name){
    try{ sessionStorage.setItem(userKey, name); localStorage.setItem(userKey, name);}catch{}
  }
  function getBest(){
    try{ return Number(localStorage.getItem(bestKey) || 0);}catch{return 0}
  }
  function setBest(v){
    try{ localStorage.setItem(bestKey, String(v)); }catch{}
  }
  function updateUserUI(){
  const uname = userName || 'Invitado';
  $('#userName').textContent = uname;
  $('#panelUser').textContent = uname;
  $('#panelUserHUD') && ($('#panelUserHUD').textContent = uname);
  $('#bestScore').textContent = getBest();
  $('#bestHUD') && ($('#bestHUD').textContent = getBest());
    // sync nombre en multijugador
    if(roomId){
      if(!players[playerId]) players[playerId] = {name:uname, score, lines};
      else players[playerId].name = uname;
      send({type:'update', id:playerId, name:uname, score, lines});
      renderScoreboard();
    }
  }
  function openNameModal(){
    nameModal.setAttribute('aria-hidden','false');
    setTimeout(()=> nameInput.focus(), 50);
  }
  function closeNameModal(){
    nameModal.setAttribute('aria-hidden','true');
  }

  // Motor de juego
  function update(time=0){
    if(!paused && !gameOver){
      const dt = time - lastTime; lastTime = time;
      dropCounter += dt;
  const base = SPEEDS[Math.min(level-1, SPEEDS.length-1)];
  const speed = Math.max(DIFFICULTY.minSpeedMs, base - bonusSpeedMs);
      if(dropCounter > speed){
        drop();
      }
    }
    drawAll();
    requestAnimationFrame(update);
  }

  function restart(){
    grid = createMatrix(COLS, ROWS);
    piece = null; nextQueue = []; holdPiece = null; canHold = true; dropCounter = 0; lastTime = 0;
  level = 1; lines = 0; score = 0; paused = false; gameOver = false; prevLevel = 1;
    bonusSpeedMs = 0; linesSinceBonus = 0; locksSinceBonus = 0;
    refillBag(); spawnPiece(); updateNext(); updateHold(); updatePanel();
    gameOverOverlay.classList.add('hidden');
  }

  function togglePause(){
    paused = !paused;
    pauseOverlay.classList.toggle('hidden', !paused);
  }

  function createMatrix(w,h){
    return Array.from({length:h}, ()=> Array(w).fill(null));
  }

  function collide(mat, p){
    for(let y=0; y<p.shape.length; y++){
      for(let x=0; x<p.shape[y].length; x++){
        if(!p.shape[y][x]) continue;
        const gx = p.x + x; const gy = p.y + y;
        if(gx<0 || gx>=COLS || gy>=ROWS) return true;
        if(gy>=0 && grid[gy][gx]) return true;
      }
    }
    return false;
  }

  function merge(mat, p){
    // Devuelve true si alguna celda quedó por encima del tablero (game over)
    let overflow = false;
    for(let y=0; y<p.shape.length; y++){
      for(let x=0; x<p.shape[y].length; x++){
        if(!p.shape[y][x]) continue;
        const gy = p.y + y; const gx = p.x + x;
        if(gy < 0){ overflow = true; continue; }
        grid[gy][gx] = p.type;
      }
    }
    return overflow;
  }

  function clearLines(){
    let cleared = 0;
    for(let y=grid.length-1; y>=0; ){
      if(grid[y].every(c=>!!c)){
        grid.splice(y,1);
        grid.unshift(Array(COLS).fill(null));
        cleared++;
      } else y--;
    }
    if(cleared>0){
      const base = cleared===1?SCORE_PER.single:cleared===2?SCORE_PER.double:cleared===3?SCORE_PER.triple:SCORE_PER.tetris;
      score += base * level;
      lines += cleared;
  const newLevel = 1 + Math.floor(lines/10);
  if(newLevel>level){ level = newLevel; onLevelUp(level); playStarSparkle(); playFanfareApplause(); }
      updatePanel();
    }
    return cleared;
  }

  function drop(){
    piece.y++;
    if(collide(grid, piece)){
      piece.y--; // revert
      const overflow = merge(grid, piece);
      let cleared = 0;
      if(!overflow){
        cleared = clearLines();
        if(cleared>0){
          linesSinceBonus += cleared;
          maybeIncreaseDifficultyByLines();
        }
      }
      canHold = true;
      afterLock();
      if(overflow){
        // game over por desbordamiento
        endGame();
      } else {
        spawnPiece();
        if(collide(grid, piece)){
          endGame();
        }
      }
    }
    dropCounter = 0;
  }

  function softDrop(){
    piece.y++;
    if(collide(grid, piece)){
      piece.y--;
      const overflow = merge(grid, piece);
      if(!overflow){
        const cleared = clearLines();
        if(cleared>0){ linesSinceBonus+=cleared; maybeIncreaseDifficultyByLines(); }
      }
      canHold = true; afterLock();
      if(overflow){ endGame(); }
      else { spawnPiece(); if(collide(grid, piece)) endGame(); }
    } else {
      score += SCORE_PER.soft; updatePanel();
    }
    dropCounter = 0;
  }

  function hardDrop(){
    let dist = 0;
    while(!collide(grid, piece)){ piece.y++; dist++; }
    piece.y--; dist--; // overshoot correction
    score += Math.max(0, dist) * SCORE_PER.hard;
    const overflow = merge(grid, piece);
    if(!overflow){
      const cleared = clearLines(); if(cleared>0){ linesSinceBonus+=cleared; maybeIncreaseDifficultyByLines(); }
    }
    canHold = true; afterLock();
    if(overflow){ endGame(); }
    else { spawnPiece(); if(collide(grid, piece)) endGame(); }
    dropCounter = 0; updatePanel();
  }

  function endGame(){
    gameOver = true;
    finalScoreEl.textContent = `Puntaje: ${score}`;
    gameOverOverlay.classList.remove('hidden');
    showGameOverFx();
    playWah();
    if(score>getBest()) setBest(score);
    updatePanel();
  }

  function afterLock(){
    locksSinceBonus++;
    if(locksSinceBonus >= DIFFICULTY.locksStep){
      bonusSpeedMs += DIFFICULTY.bonusMs;
      locksSinceBonus = 0;
    }
  }

  function maybeIncreaseDifficultyByLines(){
    if(linesSinceBonus >= DIFFICULTY.linesStep){
      const steps = Math.floor(linesSinceBonus / DIFFICULTY.linesStep);
      bonusSpeedMs += steps * DIFFICULTY.bonusMs;
      linesSinceBonus = linesSinceBonus % DIFFICULTY.linesStep;
    }
  }

  function move(dir){
    piece.x += dir;
    if(collide(grid, piece)) piece.x -= dir;
  }

  function rotate(dir){
    const s = piece.shape;
    const rotated = rotateMatrix(s, dir);
    const prev = piece.shape; piece.shape = rotated;
    // wall kicks básicos
    const kicks = [0, -1, 1, -2, 2];
    let kicked = false;
    for(const k of kicks){
      piece.x += k;
      if(!collide(grid, piece)){ kicked = true; break; }
      piece.x -= k;
    }
    if(!kicked) piece.shape = prev;
  }

  function rotateMatrix(m, dir){
    const N = m.length;
    const r = Array.from({length:N},()=>Array(N).fill(0));
    for(let y=0;y<N;y++) for(let x=0;x<N;x++){
      if(dir>0) r[x][N-1-y]=m[y][x];
      else r[N-1-x][y]=m[y][x];
    }
    return r;
  }

  function newPiece(type){
    const raw = SHAPES[type];
    // pad to square for rotation consistency
    const N = Math.max(raw.length, raw[0].length);
    const m = Array.from({length:N},(_,y)=>Array.from({length:N},(_,x)=> (raw[y] && raw[y][x]) ? 1 : 0));
    return { type, shape:m, x: Math.floor(COLS/2)-Math.ceil(N/2), y: -2 };
  }

  function refillBag(){
    const bag = ['I','O','T','S','Z','J','L'];
    // Fisher-Yates
    for(let i=bag.length-1;i>0;i--){
      const j = Math.floor(Math.random()*(i+1));
      [bag[i],bag[j]]=[bag[j],bag[i]];
    }
    nextQueue.push(...bag);
  }

  function spawnPiece(){
    if(nextQueue.length<7) refillBag();
    const type = nextQueue.shift();
    piece = newPiece(type);
    updateNext();
    if(nhctx) updateNextHUD();
  }

  function hold(){
    if(!canHold) return;
    if(!holdPiece){
      holdPiece = piece.type;
      spawnPiece();
    } else {
      const tmp = holdPiece; holdPiece = piece.type; piece = newPiece(tmp);
    }
    canHold = false; updateHold();
  }

  function drawAll(){
    ctx.clearRect(0,0,BOARD_W,BOARD_H);
    drawGrid();
    drawGhost();
    drawPiece(piece);
  }

  function drawGrid(){
    for(let y=0;y<ROWS;y++){
      for(let x=0;x<COLS;x++){
        const cell = grid[y][x];
        if(cell){ drawCell(x,y,COLORS[cell]); }
        else {
          // sutil rejilla
          ctx.strokeStyle = 'rgba(255,255,255,.04)';
          ctx.strokeRect(x*CELL, y*CELL, CELL, CELL);
        }
      }
    }
  }

  function drawPiece(p){
    for(let y=0;y<p.shape.length;y++) for(let x=0;x<p.shape[y].length;x++){
      if(!p.shape[y][x]) continue;
      const gx = p.x + x, gy = p.y + y;
      if(gy>=0) drawCell(gx, gy, COLORS[p.type]);
    }
  }

  function drawGhost(){
    const ghost = { ...piece, y: piece.y };
    while(!collide(grid, ghost)) ghost.y++;
    ghost.y--;
    for(let y=0;y<ghost.shape.length;y++) for(let x=0;x<ghost.shape[y].length;x++){
      if(!ghost.shape[y][x]) continue;
      const gx = ghost.x + x, gy = ghost.y + y;
      if(gy>=0) drawCell(gx, gy, COLORS.G, true);
    }
  }

  function drawCell(x,y,color,ghost=false){
    const px = x*CELL, py = y*CELL;
    // base
    ctx.fillStyle = ghost? color : shade(color, -14);
    ctx.fillRect(px+1, py+1, CELL-2, CELL-2);
    // inner glow
    if(!ghost){
      const grad = ctx.createLinearGradient(px, py, px+CELL, py+CELL);
      grad.addColorStop(0, addAlpha('#ffffff', .14));
      grad.addColorStop(1, addAlpha('#000000', .2));
      ctx.fillStyle = grad;
      ctx.fillRect(px+3, py+3, CELL-6, CELL-6);

      ctx.strokeStyle = addAlpha(color, .8);
      ctx.lineWidth = 2;
      ctx.strokeRect(px+1.5, py+1.5, CELL-3, CELL-3);
      // glow border
      ctx.shadowColor = color;
      ctx.shadowBlur = 12;
      ctx.strokeStyle = addAlpha(color, .6);
      ctx.strokeRect(px+3.5, py+3.5, CELL-7, CELL-7);
      ctx.shadowBlur = 0;
    }
  }

  function addAlpha(hex, a){
    if(hex.startsWith('rgba')) return hex;
    // parse hex #rrggbb
    const c = hex.replace('#','');
    const r = parseInt(c.substring(0,2),16);
    const g = parseInt(c.substring(2,4),16);
    const b = parseInt(c.substring(4,6),16);
    return `rgba(${r},${g},${b},${a})`;
  }

  function shade(hex, p){
    const c = hex.replace('#','');
    const r = Math.min(255, Math.max(0, parseInt(c.substring(0,2),16) + p));
    const g = Math.min(255, Math.max(0, parseInt(c.substring(2,4),16) + p));
    const b = Math.min(255, Math.max(0, parseInt(c.substring(4,6),16) + p));
    return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
  }

  // Next y Hold dibujos simples
  function drawPreview(ctx2, type, size=160){
    ctx2.clearRect(0,0,size,size);
    if(!type) return;
    const shape = SHAPES[type];
    const N = Math.max(shape.length, shape[0].length);
    const cell = Math.max(14, Math.floor(size/(N+1)));
    const offx = Math.floor((size - N*cell)/2);
    const offy = Math.floor((size - N*cell)/2);
    // square pad
    const m = Array.from({length:N},(_,y)=>Array.from({length:N},(_,x)=> (shape[y] && shape[y][x]) ? 1 : 0));
    for(let y=0;y<N;y++) for(let x=0;x<N;x++){
      if(!m[y][x]) continue;
      const px = offx + x*cell;
      const py = offy + y*cell;
      // block
      ctx2.fillStyle = shade(COLORS[type], -14);
      ctx2.fillRect(px+1,py+1,cell-2,cell-2);
      ctx2.strokeStyle = addAlpha(COLORS[type], .8);
      ctx2.lineWidth = 2;
      ctx2.strokeRect(px+1.5,py+1.5,cell-3,cell-3);
      ctx2.shadowColor = COLORS[type];
      ctx2.shadowBlur = 10;
      ctx2.strokeStyle = addAlpha(COLORS[type], .6);
      ctx2.strokeRect(px+3.5,py+3.5,cell-7,cell-7);
      ctx2.shadowBlur = 0;
    }
  }
  function updateNext(){ drawPreview(nctx, nextQueue[0]); }
  function updateNextHUD(){ drawPreview(nhctx, nextQueue[0], 56); }
  function updateHold(){ drawPreview(hctx, holdPiece); }

  function updatePanel(){
    $('#score').textContent = score;
    $('#lines').textContent = lines;
    $('#level').textContent = level;
  prevLevel = level;
    const best = getBest();
    $('#bestScore').textContent = Math.max(best, score);
  // HUD móvil
  const shud = document.getElementById('scoreHUD'); if(shud) shud.textContent = score;
  const lhud = document.getElementById('linesHUD'); if(lhud) lhud.textContent = lines;
  const lvhud = document.getElementById('levelHUD'); if(lvhud) lvhud.textContent = level;
  const bhud = document.getElementById('bestHUD'); if(bhud) bhud.textContent = Math.max(best, score);
    // Sync multijugador
    if(roomId){
      const uname = userName || 'Invitado';
      if(!players[playerId]) players[playerId] = {name:uname, score, lines};
      players[playerId].score = score; players[playerId].lines = lines;
      send({type:'update', id:playerId, name:uname, score, lines});
      renderScoreboard();
    }
  }

  // --------- FX helpers ---------
  function showGameOverFx(){
    if(!fxLayer) return;
    // Red flash
    const flash = document.createElement('div');
    flash.className = 'fx-flash';
    fxLayer.appendChild(flash);
    setTimeout(()=> flash.remove(), 600);

    // Sad face drop
    const el = document.createElement('div');
    el.className = 'fx fx-text fx-sad';
    el.style.top = '18%';
    el.innerHTML = 'Perdió <span aria-hidden="true">😢</span>';
    fxLayer.appendChild(el);
    setTimeout(()=> el.remove(), 2400);

    // Falling stars of pain
    const count = 8;
    for(let i=0;i<count;i++){
      const st = document.createElement('div');
      st.className = 'fx-fallstar';
      const dx = (Math.random()*140 - 70).toFixed(0);
      const sc = (0.8 + Math.random()*0.6).toFixed(2);
      st.style.setProperty('--dx', `${dx}px`);
      st.style.setProperty('--scale', sc);
      st.style.top = '22%';
      st.style.left = '50%';
      st.innerHTML = `<span class="fx-painstar">✦</span>`;
      fxLayer.appendChild(st);
      setTimeout(()=> st.remove(), 1500 + Math.random()*300);
    }
  }

  function onLevelUp(lvl){
    if(!fxLayer) return;
    // Headline rainbow "¡Nivel X!" (longer)
    const head = document.createElement('div');
    head.className = 'fx fx-rainbow';
    head.style.top = '20%';
    head.textContent = `¡Nivel ${lvl}!`;
    fxLayer.appendChild(head);
    setTimeout(()=> head.remove(), 4500);

    // Secondary starline below
    const el = document.createElement('div');
    el.className = 'fx fx-text fx-starline';
    el.style.top = '26%';
    el.innerHTML = `<span class="fx-star">★</span> Nivel ${lvl} <span class="fx-star">★</span>`;
    fxLayer.appendChild(el);
    setTimeout(()=> el.remove(), 2600);

    // Confetti burst (more pieces, longer)
    const colors = ['#ffd369','#5b8cff','#00ffc6','#ff8aa3','#a76bff'];
  const pieces = 90;
    for(let i=0;i<pieces;i++){
      const c = document.createElement('div');
      c.className = 'fx-confetti';
      const dx = (Math.random()*520 - 260).toFixed(0);
      const dy = (-140 - Math.random()*200).toFixed(0);
      const rot = (Math.random()*720 - 360).toFixed(0) + 'deg';
      c.style.background = colors[i % colors.length];
      c.style.setProperty('--dx', `${dx}px`);
      c.style.setProperty('--dy', `${dy}`);
      c.style.setProperty('--rot', rot);
      fxLayer.appendChild(c);
  setTimeout(()=> c.remove(), 3400 + Math.random()*800);
    }
  }

  // Sticky header: ocultar/mostrar al desplazar en móvil
  if(isMobile){
    let lastY = window.scrollY;
    window.addEventListener('scroll', ()=>{
      const y = window.scrollY;
      const body = document.body;
      if(y > lastY + 8) body.classList.add('hide-header');
      else if(y < lastY - 8) body.classList.remove('hide-header');
      lastY = y;
    }, {passive:true});
  }

  // ----- Controles táctiles y gestos -----
  function setupTouchControls(){
    const btn = (id)=>document.getElementById(id);
    const bind = (el, handler)=> el && el.addEventListener('click', ()=>{ if(!paused && !gameOver) handler(); });
    bind(btn('btnLeft'), ()=> move(-1));
    bind(btn('btnRight'), ()=> move(1));
    bind(btn('btnRotateCW'), ()=> rotate(1));
    bind(btn('btnRotateCCW'), ()=> rotate(-1));
    bind(btn('btnSoft'), ()=> softDrop());
    bind(btn('btnHard'), ()=> hardDrop());
    bind(btn('btnHold'), ()=> hold());
    btn('btnPause')?.addEventListener('click', togglePause);

    // Gestos en el canvas: swipe y tap
    // Config parámetros de gestos (fácil de ajustar)
    const GESTURES = {
      SWIPE: 32,            // umbral mayor => requiere desplazamiento más claro
      TAP_MAX_MOVE: 12,
      TAP_MAX_DT: 230,
      DOUBLE_TAP_DT: 300,
      DRAG_CELL_PX: 36      // más píxeles por celda => menos sensibilidad
    };
    let startX=0, startY=0, startTime=0;
    let moved=false;
    let lastTapTime = 0; let lastTapX=0; let lastTapY=0;
    let multiTouch = false; // detectar tap con dos dedos
    boardCanvas.addEventListener('touchstart', (e)=>{
      // Evita que el gesto inicie scroll/pull-to-refresh
      e.preventDefault();
      const t = e.changedTouches[0];
      startX = t.clientX; startY = t.clientY; startTime = Date.now();
      moved=false;
      multiTouch = (e.touches && e.touches.length === 2);
    }, {passive:false});
    boardCanvas.addEventListener('touchmove', (e)=>{
      // Bloquea scroll mientras se gesticula sobre el canvas
      e.preventDefault();
      moved=true;
    }, {passive:false});
    boardCanvas.addEventListener('touchend', (e)=>{
      // Evita que el end dispare scroll/rebote
      e.preventDefault();
      if(paused || gameOver) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - startX; const dy = t.clientY - startY;
      const adx = Math.abs(dx); const ady = Math.abs(dy);
      const dt = Date.now() - startTime;
      const SWIPE = GESTURES.SWIPE;
      // Tap con dos dedos = rotar antihoraria inmediata
      if(multiTouch && !moved && dt < GESTURES.TAP_MAX_DT){
        rotate(-1); return;
      }
      // Tap rápido o casi sin movimiento => rotación (CW o doble tap CCW)
      if(!moved || (adx < GESTURES.TAP_MAX_MOVE && ady < GESTURES.TAP_MAX_MOVE && dt < GESTURES.TAP_MAX_DT)){
        const now = Date.now();
        const distLastTap = Math.hypot(startX - lastTapX, startY - lastTapY);
        if(now - lastTapTime < GESTURES.DOUBLE_TAP_DT && distLastTap < 40){
          rotate(-1); // doble tap => CCW
          lastTapTime = 0; // reset para evitar triple
        } else {
          rotate(1); // simple tap => CW
          lastTapTime = now; lastTapX = startX; lastTapY = startY;
        }
        // ligera vibración si disponible
        if(navigator.vibrate) try{ navigator.vibrate(8); }catch{}
        return;
      }
      if(adx > ady && adx > SWIPE){
        // Swipe horizontal menos sensible: sólo más pasos con desplazamientos muy amplios
        let steps = 1;
        if(adx > SWIPE * 2.6) steps = 2;
        if(adx > SWIPE * 4.2) steps = 3;
        if(adx > SWIPE * 5.8) steps = 4; // raramente
        const dir = dx > 0 ? 1 : -1;
        for(let i=0;i<steps;i++) move(dir);
      } else if(ady > SWIPE){
        // Swipe vertical
        if(dy > 0){
          // Hacia abajo: si es muy rápido o largo => hard drop, sino soft
          const strong = ady > SWIPE*1.6 || dt < 170;
          if(strong) hardDrop(); else softDrop();
        } else {
          // Hacia arriba: usar como HOLD de la pieza
          hold();
        }
      }
    }, {passive:false});

    // Arrastre horizontal continuo (mientras se mantiene el dedo) para mover varias columnas
    let lastStep = 0; // número de "celdas" ya aplicadas durante el drag
    boardCanvas.addEventListener('touchstart', ()=>{ lastStep = 0; }, {passive:false});
    boardCanvas.addEventListener('touchmove', (e)=>{
      if(paused || gameOver) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - startX;
  const cellPx = GESTURES.DRAG_CELL_PX;
      const step = Math.trunc(dx / cellPx);
      const delta = step - lastStep;
      // Limitar a un movimiento por evento para no saltar 2-3 celdas con un micro desplazamiento
      if(delta > 0){ move(1); lastStep += 1; }
      else if(delta < 0){ move(-1); lastStep -= 1; }
    }, {passive:false});
  }

  // ----------- Multijugador lógica -----------
  function loadFirebase(cfg){
    return new Promise((resolve,reject)=>{
      if(window.firebase && window.firebase.firestore){ return resolve(window.firebase); }
      const add = (src)=> new Promise((res,rej)=>{ const s=document.createElement('script'); s.src=src; s.onload=res; s.onerror=rej; document.head.appendChild(s); });
      add('https://www.gstatic.com/firebasejs/9.6.11/firebase-app-compat.js')
        .then(()=> add('https://www.gstatic.com/firebasejs/9.6.11/firebase-firestore-compat.js'))
        .then(()=> resolve(window.firebase))
        .catch(reject);
    });
  }

  function initRealtime(rid){
    const cfg = (window.REALTIME_CONFIG || {provider:'local'});
    const hasValidFirebase = cfg && cfg.firebase &&
      cfg.firebase.apiKey && !/^TU_/i.test(cfg.firebase.apiKey) &&
      cfg.firebase.projectId && !/^TU_/i.test(cfg.firebase.projectId) &&
      cfg.firebase.appId && !/^TU_/i.test(cfg.firebase.appId);
    if(cfg.provider === 'firebase' && hasValidFirebase){
  setRealtimeBadge('firebase');
      return {
        send: async (data)=>{
          try{
            const fb = await loadFirebase(cfg.firebase);
            const app = fb.apps?.length ? fb.app() : fb.initializeApp(cfg.firebase);
            const db = fb.firestore();
            const docRef = db.collection('tetris-rooms').doc(rid);
            await docRef.set({updatedAt: Date.now()}, {merge:true});
            await docRef.collection('events').add({...data, t: Date.now()});
          }catch(e){/* noop */}
        },
        subscribe: (cb)=>{
          let un;
          loadFirebase(cfg.firebase).then((fb)=>{
            const db = fb.firestore();
            const docRef = db.collection('tetris-rooms').doc(rid);
            un = docRef.collection('events').orderBy('t','asc').onSnapshot((snap)=>{
              snap.docChanges().forEach((ch)=>{ if(ch.type==='added') cb(ch.doc.data()); });
            });
          });
          return ()=> un && un();
        },
        close: ()=>{/* firestore unsubscribe handled above */}
      };
    } else {
      setRealtimeBadge('local');
      // Local (pestañas del mismo navegador)
      const ch = new BroadcastChannel(`tetris-${rid}`);
      return {
        send: (data)=> ch.postMessage(data),
        subscribe: (cb)=> { ch.onmessage = (e)=> cb(e.data); return ()=> ch.close(); },
        close: ()=> ch.close()
      };
    }
  }

  function setRealtimeBadge(mode){
    const cfg = (window.REALTIME_CONFIG || {provider:'local'});
    const hasValid = cfg.firebase && cfg.firebase.apiKey && !/^TU_/i.test(cfg.firebase.apiKey) && cfg.firebase.projectId && !/^TU_/i.test(cfg.firebase.projectId) && cfg.firebase.appId && !/^TU_/i.test(cfg.firebase.appId);
    const effective = mode || ((cfg.provider==='firebase' && hasValid) ? 'firebase' : 'local');
    if(rtModeEl){
      rtModeEl.textContent = `modo: ${effective}`;
      rtModeEl.style.borderColor = effective==='firebase' ? 'rgba(0,255,198,.6)' : 'rgba(255,255,255,.14)';
      rtModeEl.style.background = effective==='firebase' ? 'linear-gradient(180deg, rgba(0,255,198,.15), rgba(91,140,255,.12))' : 'rgba(255,255,255,.06)';
    }
  }

  function joinRoom(rid){
    if(roomId) leaveRoom();
    roomId = rid;
    realtime = initRealtime(rid);
    // suscribir a eventos
    try{ unsubscribe = realtime.subscribe(handleEvent); }catch{}
    // anunciar presencia
    send({type:'join', id:playerId, name:userName||'Invitado'});
    players[playerId] = {name:userName||'Invitado', score, lines};
    renderScoreboard();
  }

  function leaveRoom(){
    if(!roomId) return;
    send({type:'leave', id:playerId});
    if(typeof unsubscribe === 'function') try{ unsubscribe(); }catch{}
    try{ realtime?.close?.(); }catch{}
    realtime = null; roomId = null; unsubscribe = null;
    players = {};
    if(scoreBody) scoreBody.innerHTML = '';
  }

  function send(payload){
    if(!realtime) return;
    try{ realtime.send(payload); }catch{}
  }

  function handleEvent(ev){
    if(!ev || !ev.type) return;
    switch(ev.type){
      case 'join':{
        if(Object.keys(players).length >= MAX_PLAYERS && !players[ev.id]) return;
        players[ev.id] = players[ev.id] || {name:ev.name||'Invitado', score:0, lines:0};
        renderScoreboard();
        break;
      }
      case 'leave':{
        delete players[ev.id];
        renderScoreboard();
        break;
      }
      case 'update':{
        if(!players[ev.id]) players[ev.id] = {name:ev.name||'Invitado', score:0, lines:0};
        players[ev.id].name = ev.name || players[ev.id].name;
        players[ev.id].score = ev.score|0;
        players[ev.id].lines = ev.lines|0;
        renderScoreboard();
        break;
      }
    }
  }

  function renderScoreboard(){
    if(!scoreBody) return;
    if(!roomId){ scoreBody.innerHTML=''; return; }
    const list = Object.entries(players).map(([id,p])=> ({id,...p}));
    list.sort((a,b)=> b.score - a.score || b.lines - a.lines);
    scoreBody.innerHTML = list.slice(0,MAX_PLAYERS).map(p=>
      `<div class="srow"><span>${escapeHtml(p.name)}</span><span>${p.score}</span><span>${p.lines}</span></div>`
    ).join('');
  }

  function escapeHtml(s){
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
  }

})();
