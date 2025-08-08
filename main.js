/* Tetris Neon - Juego completo con: prompt de nombre, panel de puntaje, next y hold, controles y UI */
(function(){
  // Configuración base
  const COLS = 10, ROWS = 20, CELL = 36; // canvas 360x720
  const BOARD_W = COLS * CELL, BOARD_H = ROWS * CELL;
  const SPEEDS = [1000, 850, 700, 600, 500, 420, 360, 300, 260, 220, 190, 170, 150, 135, 120];
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

  boardCanvas.width = BOARD_W; boardCanvas.height = BOARD_H;
  const isMobile = matchMedia('(hover: none) and (pointer: coarse)').matches || /Mobi|Android/i.test(navigator.userAgent);
  const touchControls = document.getElementById('touchControls');
  if(isMobile){
    touchControls?.setAttribute('aria-hidden','false');
  }

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
      const speed = SPEEDS[Math.min(level-1, SPEEDS.length-1)];
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
    level = 1; lines = 0; score = 0; paused = false; gameOver = false;
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
    for(let y=0; y<p.shape.length; y++){
      for(let x=0; x<p.shape[y].length; x++){
        if(p.shape[y][x]){
          const gy = p.y + y; const gx = p.x + x;
          if(gy>=0) grid[gy][gx] = p.type;
        }
      }
    }
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
      if(newLevel>level) level = newLevel;
      updatePanel();
    }
  }

  function drop(){
    piece.y++;
    if(collide(grid, piece)){
      piece.y--; // revert
      merge(grid, piece);
      clearLines();
      canHold = true;
      spawnPiece();
      if(collide(grid, piece)){
        // game over
        gameOver = true;
        finalScoreEl.textContent = `Puntaje: ${score}`;
        gameOverOverlay.classList.remove('hidden');
        if(score>getBest()) setBest(score);
        updatePanel();
      }
    }
    dropCounter = 0;
  }

  function softDrop(){
    piece.y++;
    if(collide(grid, piece)){
      piece.y--; merge(grid, piece); clearLines(); canHold = true; spawnPiece();
    }else{
      score += SCORE_PER.soft; updatePanel();
    }
    dropCounter = 0;
  }

  function hardDrop(){
    let dist = 0;
    while(!collide(grid, piece)){ piece.y++; dist++; }
    piece.y--; dist--; // overshoot correction
    score += Math.max(0, dist) * SCORE_PER.hard;
    merge(grid, piece); clearLines(); canHold = true; spawnPiece();
    dropCounter = 0; updatePanel();
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
  function drawPreview(ctx2, type){
    ctx2.clearRect(0,0,160,160);
    if(!type) return;
    const shape = SHAPES[type];
    const N = Math.max(shape.length, shape[0].length);
    const cell = 28;
    const offx = Math.floor((160 - N*cell)/2);
    const offy = Math.floor((160 - N*cell)/2);
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
  function updateHold(){ drawPreview(hctx, holdPiece); }

  function updatePanel(){
    $('#score').textContent = score;
    $('#lines').textContent = lines;
    $('#level').textContent = level;
    const best = getBest();
    $('#bestScore').textContent = Math.max(best, score);
  // HUD móvil
  const shud = document.getElementById('scoreHUD'); if(shud) shud.textContent = score;
  const lhud = document.getElementById('linesHUD'); if(lhud) lhud.textContent = lines;
  const lvhud = document.getElementById('levelHUD'); if(lvhud) lvhud.textContent = level;
  const bhud = document.getElementById('bestHUD'); if(bhud) bhud.textContent = Math.max(best, score);
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
    let startX=0, startY=0, startTime=0;
    let moved=false;
    boardCanvas.addEventListener('touchstart', (e)=>{
      const t = e.changedTouches[0];
      startX = t.clientX; startY = t.clientY; startTime = Date.now();
      moved=false;
    }, {passive:true});
    boardCanvas.addEventListener('touchmove', (e)=>{
      moved=true;
    }, {passive:true});
    boardCanvas.addEventListener('touchend', (e)=>{
      if(paused || gameOver) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - startX; const dy = t.clientY - startY;
      const adx = Math.abs(dx); const ady = Math.abs(dy);
      const dt = Date.now() - startTime;
      const SWIPE = 28; // px umbral
      // Tap rápido = rotar CW
      if(!moved || (adx<10 && ady<10 && dt<200)){
        rotate(1); return;
      }
      if(adx>ady && adx>SWIPE){
        // swipe horizontal
        if(dx>0) move(1); else move(-1);
      } else if(ady>SWIPE){
        // hacia abajo = caída dura si es fuerte
        if(dy>0){
          if(ady>60) hardDrop(); else softDrop();
        }
      }
    }, {passive:true});
  }

})();
