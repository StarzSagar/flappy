/* =========================================================
   Flappy Bird — vanilla JS + HTML5 Canvas
   - Fixed internal resolution, scaled to any screen (responsive)
   - DPR-aware rendering (crisp on retina/mobile)
   - Delta-time based physics (consistent speed on any refresh rate)
   - Touch / mouse / keyboard input
   - WebAudio sound (no assets needed)
   ========================================================= */

(() => {
  "use strict";

  // ---------- Setup ----------
  const canvas = document.getElementById("game-canvas");
  const ctx = canvas.getContext("2d");

  const scoreDisplay = document.getElementById("score-display");
  const overlay = document.getElementById("overlay");
  const startPanel = document.getElementById("start-panel");
  const gameoverPanel = document.getElementById("gameover-panel");
  const finalScoreEl = document.getElementById("final-score");
  const bestScoreEl = document.getElementById("best-score");
  const newBestEl = document.getElementById("new-best");
  const muteBtn = document.getElementById("mute-btn");

  // Fixed internal game resolution — everything is designed for this,
  // then uniformly scaled to fit the real screen (letterboxed).
  const W = 400;               // virtual width
  const H = 700;               // virtual height
  const BASE_GROUND = 90;      // ground strip height in virtual px

  // Virtual game-world height that adapts to the screen aspect ratio,
  // so tall phones see more sky and wide screens stay playable.
  let viewW = W, viewH = H;    // current virtual viewport

  // ---------- Game constants (tuned for feel) ----------
  const GRAVITY = 1500;        // px/s^2
  const FLAP_VELOCITY = -420;  // px/s impulse
  const MAX_FALL_SPEED = 700;
  const PIPE_SPEED = 165;      // px/s leftward
  const PIPE_W = 62;
  const PIPE_GAP = 185;        // gap between top & bottom pipe
  const PIPE_SPACING = 250;    // horizontal distance between pipes
  const BIRD_X = 90;           // fixed x position of the bird
  const BIRD_R = 15;           // bird collision radius

  // ---------- State ----------
  const State = { READY: 0, PLAYING: 1, DEAD: 2 };
  let state = State.READY;

  let bird = { y: H * 0.42, vel: 0, rot: 0, wing: 0 };
  let pipes = [];              // {x, gapY, passed}
  let clouds = [];
  let bushes = [];
  let score = 0;
  let best = +(localStorage.getItem("flappyBest") || 0);
  let spawnTimer = 0;
  let deathTimer = 0;
  let groundX = 0;
  let frames = 0;              // for animations

  // ---------- Audio (WebAudio, generated — zero assets) ----------
  let audioCtx = null;
  let muted = localStorage.getItem("flappyMuted") === "1";

  function beep(freq, dur = 0.08, type = "square", vol = 0.06, slide = 0) {
    if (muted) return;
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === "suspended") audioCtx.resume();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
      if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), audioCtx.currentTime + dur);
      gain.gain.setValueAtTime(vol, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + dur);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + dur);
    } catch (_) { /* audio unavailable — ignore */ }
  }

  const sfx = {
    flap: () => beep(500, 0.08, "square", 0.05, -200),
    score: () => { beep(880, 0.07, "square", 0.05); setTimeout(() => beep(1175, 0.09, "square", 0.05), 70); },
    hit: () => beep(160, 0.2, "sawtooth", 0.09, -100),
    die: () => beep(300, 0.4, "triangle", 0.07, -260),
  };

  function toggleMute() {
    muted = !muted;
    localStorage.setItem("flappyMuted", muted ? "1" : "0");
    muteBtn.textContent = muted ? "🔇" : "🔊";
  }
  muteBtn.textContent = muted ? "🔇" : "🔊";
  muteBtn.addEventListener("pointerdown", (e) => { e.stopPropagation(); toggleMute(); });

  // ---------- Responsive canvas sizing ----------
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2); // cap DPR for performance
    const realW = window.innerWidth;
    const realH = window.innerHeight;
    const aspect = realW / realH;

    // Fit a virtual viewport with the screen's aspect ratio,
    // keeping height near the design height for consistent difficulty.
    viewH = H;
    viewW = Math.round(H * aspect);
    if (viewW < 300) {          // very narrow — keep minimum width
      viewW = 300;
      viewH = Math.round(300 / aspect);
    } else if (viewW > 700) {   // very wide (desktop) — cap and letterbox height
      viewW = 700;
      viewH = Math.round(700 / aspect);
    }

    canvas.width = Math.round(realW * dpr);
    canvas.height = Math.round(realH * dpr);
    canvas.style.width = realW + "px";
    canvas.style.height = realH + "px";
  }
  window.addEventListener("resize", resize);
  window.addEventListener("orientationchange", () => setTimeout(resize, 100));
  resize();

  // ---------- Input ----------
  function flap() {
    if (state === State.READY) {
      startGame();
      bird.vel = FLAP_VELOCITY;
    } else if (state === State.PLAYING) {
      bird.vel = FLAP_VELOCITY;
      bird.wing = 0;
      sfx.flap();
    } else if (state === State.DEAD && deathTimer > 0.7) {
      // after the death animation, tapping restarts the run
      resetGame();
      flap();
    }
  }

  function press(e) {
    // Buttons handle their own clicks; ignore presses on them.
    if (e.target.closest && e.target.closest("button")) return;
    e.preventDefault();
    flap();
  }

  canvas.addEventListener("pointerdown", press, { passive: false });
  document.addEventListener("keydown", (e) => {
    if (e.code === "Space" || e.code === "ArrowUp" || e.code === "KeyW") {
      e.preventDefault();
      flap();
    }
  });

  document.getElementById("start-btn").addEventListener("click", () => flap());
  document.getElementById("restart-btn").addEventListener("click", () => {
    resetGame();
    flap();
  });

  // ---------- Game flow ----------
  function startGame() {
    state = State.PLAYING;
    overlay.classList.add("hidden");
    startPanel.classList.add("hidden");
    gameoverPanel.classList.add("hidden");
    scoreDisplay.style.opacity = "1";
  }

  function resetGame() {
    state = State.READY;      // back to READY so flap() can start a new run
    deathTimer = 0;
    bird = { y: viewH * 0.42, vel: 0, rot: 0, wing: 0 };
    pipes = [];
    spawnTimer = 0;
    score = 0;
    updateScore();
  }

  function showGameOver() {
    state = State.DEAD;
    sfx.hit();
    setTimeout(sfx.die, 150);
    finalScoreEl.textContent = score;
    const isBest = score > best;
    if (isBest) {
      best = score;
      localStorage.setItem("flappyBest", best);
    }
    bestScoreEl.textContent = best;
    newBestEl.classList.toggle("hidden", !isBest);
    gameoverPanel.classList.remove("hidden");
    overlay.classList.remove("hidden");
  }

  function updateScore() {
    scoreDisplay.textContent = score;
  }

  // ---------- Spawning & scenery ----------
  function spawnPipe() {
    const margin = 70;
    const gapY = margin + Math.random() * (viewH - BASE_GROUND - PIPE_GAP - margin * 2);
    pipes.push({ x: viewW + PIPE_W, gapY, passed: false });
  }

  function initScenery() {
    clouds = Array.from({ length: 6 }, (_, i) => ({
      x: Math.random() * viewW,
      y: 40 + Math.random() * (viewH * 0.4),
      s: 0.5 + Math.random() * 0.9,
      speed: 12 + Math.random() * 18,
    }));
    bushes = Array.from({ length: 8 }, () => ({
      x: Math.random() * viewW,
      w: 40 + Math.random() * 60,
      h: 18 + Math.random() * 22,
    }));
  }
  initScenery();

  // ---------- Update ----------
  function update(dt) {
    frames++;
    groundX = (groundX - PIPE_SPEED * dt) % 24;

    // clouds drift always (even on menu)
    for (const c of clouds) {
      c.x -= c.speed * dt;
      if (c.x < -80) { c.x = viewW + 40; c.y = 40 + Math.random() * (viewH * 0.4); }
    }

    if (state === State.READY) {
      // bird idles, bobbing
      bird.y = viewH * 0.42 + Math.sin(frames / 18) * 8;
      bird.rot = 0;
      return;
    }

    if (state === State.PLAYING) {
      // bird physics
      bird.vel = Math.min(bird.vel + GRAVITY * dt, MAX_FALL_SPEED);
      bird.y += bird.vel * dt;
      bird.rot = Math.max(-25, Math.min(80, bird.vel / 450 * 60 - 20));

      // pipes
      spawnTimer -= dt;
      if (spawnTimer <= 0) {
        spawnPipe();
        spawnTimer = PIPE_SPACING / PIPE_SPEED;
      }
      for (const p of pipes) p.x -= PIPE_SPEED * dt;
      pipes = pipes.filter((p) => p.x + PIPE_W > -10);

      // scoring
      for (const p of pipes) {
        if (!p.passed && p.x + PIPE_W < BIRD_X - BIRD_R) {
          p.passed = true;
          score++;
          updateScore();
          sfx.score();
        }
      }

      // collisions
      const groundY = viewH - BASE_GROUND;
      if (bird.y + BIRD_R >= groundY) {
        bird.y = groundY - BIRD_R;
        showGameOver();
      }
      if (bird.y - BIRD_R < 0) { bird.y = BIRD_R; bird.vel = 0; }

      for (const p of pipes) {
        if (circleRect(BIRD_X, bird.y, BIRD_R - 2, p.x, 0, PIPE_W, p.gapY) ||
            circleRect(BIRD_X, bird.y, BIRD_R - 2, p.x, p.gapY + PIPE_GAP, PIPE_W, groundY - (p.gapY + PIPE_GAP))) {
          showGameOver();
          break;
        }
      }
    }

    if (state === State.DEAD) {
      deathTimer += dt;
      // bird falls to the ground after death
      bird.vel = Math.min(bird.vel + GRAVITY * dt, MAX_FALL_SPEED);
      bird.y = Math.min(bird.y + bird.vel * dt, viewH - BASE_GROUND - BIRD_R);
      bird.rot = Math.min(bird.rot + 300 * dt, 90);
    }
  }

  // circle-vs-axis-aligned-rect collision
  function circleRect(cx, cy, r, rx, ry, rw, rh) {
    const nx = Math.max(rx, Math.min(cx, rx + rw));
    const ny = Math.max(ry, Math.min(cy, ry + rh));
    const dx = cx - nx, dy = cy - ny;
    return dx * dx + dy * dy < r * r;
  }

  // ---------- Rendering ----------
  // Convert virtual coords -> screen coords. We scale uniformly to fit
  // the canvas and center the leftover space (letterbox).
  function draw() {
    const dprW = canvas.width, dprH = canvas.height;
    const scale = Math.min(dprW / viewW, dprH / viewH);
    const offX = (dprW - viewW * scale) / 2;
    const offY = (dprH - viewH * scale) / 2;

    ctx.setTransform(scale, 0, 0, scale, offX, offY);

    // sky
    const sky = ctx.createLinearGradient(0, 0, 0, viewH);
    sky.addColorStop(0, "#4ec0ca");
    sky.addColorStop(0.75, "#8fd6de");
    sky.addColorStop(1, "#c9ecb7");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, viewW, viewH);

    drawClouds();
    drawBushes();
    drawPipes();
    drawGround();
    drawBird();

    // letterbox bars (barely visible, keeps ultra-wide screens clean)
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#1b1b1b";
    if (offY > 0) {
      ctx.fillRect(0, 0, dprW, offY);
      ctx.fillRect(0, dprH - offY, dprW, offY);
    }
    if (offX > 0) {
      ctx.fillRect(0, 0, offX, dprH);
      ctx.fillRect(dprW - offX, 0, offX, dprH);
    }
  }

  function drawClouds() {
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    for (const c of clouds) {
      const s = c.s * 16;
      ctx.beginPath();
      ctx.arc(c.x, c.y, s, 0, Math.PI * 2);
      ctx.arc(c.x + s, c.y + s * 0.2, s * 0.8, 0, Math.PI * 2);
      ctx.arc(c.x - s, c.y + s * 0.3, s * 0.7, 0, Math.PI * 2);
      ctx.arc(c.x + s * 0.4, c.y - s * 0.6, s * 0.7, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawBushes() {
    const groundY = viewH - BASE_GROUND;
    ctx.fillStyle = "#7ec850";
    for (const b of bushes) {
      ctx.beginPath();
      ctx.arc(b.x, groundY, b.h, Math.PI, 0);
      ctx.arc(b.x + b.w * 0.6, groundY, b.h * 0.8, Math.PI, 0);
      ctx.fill();
    }
  }

  function drawPipes() {
    const groundY = viewH - BASE_GROUND;
    for (const p of pipes) {
      const topH = p.gapY;
      const botY = p.gapY + PIPE_GAP;
      const botH = groundY - botY;

      drawPipeBody(p.x, 0, PIPE_W, topH);
      drawPipeBody(p.x, botY, PIPE_W, botH);
      // lips (wider caps)
      drawPipeCap(p.x - 3, topH - 26);
      drawPipeCap(p.x - 3, botY);
    }
  }

  function drawPipeBody(x, y, w, h) {
    if (h <= 0) return;
    const g = ctx.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, "#5dbb46");
    g.addColorStop(0.3, "#8ee06a");
    g.addColorStop(0.7, "#5dbb46");
    g.addColorStop(1, "#3e8a31");
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = "#2d6624";
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y, w - 2, h);
  }

  function drawPipeCap(x, y) {
    const w = PIPE_W + 6, h = 26;
    const g = ctx.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, "#5dbb46");
    g.addColorStop(0.3, "#8ee06a");
    g.addColorStop(0.7, "#5dbb46");
    g.addColorStop(1, "#3e8a31");
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = "#2d6624";
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
  }

  function drawGround() {
    const groundY = viewH - BASE_GROUND;
    // dirt
    ctx.fillStyle = "#ded895";
    ctx.fillRect(0, groundY, viewW, BASE_GROUND);
    // grass strip
    ctx.fillStyle = "#7ec850";
    ctx.fillRect(0, groundY, viewW, 14);
    // striped pattern (scrolling)
    ctx.fillStyle = "#9be26a";
    for (let x = groundX; x < viewW; x += 24) {
      ctx.beginPath();
      ctx.moveTo(x, groundY + 14);
      ctx.lineTo(x + 12, groundY + 14);
      ctx.lineTo(x + 4, groundY + 6);
      ctx.lineTo(x - 8, groundY + 6);
      ctx.closePath();
      ctx.fill();
    }
    // top edge line
    ctx.fillStyle = "#5a9e3d";
    ctx.fillRect(0, groundY, viewW, 3);
  }

  function drawBird() {
    const x = BIRD_X, y = bird.y;
    const flapPhase = state === State.PLAYING || state === State.READY
      ? Math.sin(frames / 4) * (bird.vel < 0 ? 1 : 0.4)
      : 0;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((bird.rot * Math.PI) / 180);

    // body
    ctx.fillStyle = "#ffd93b";
    ctx.strokeStyle = "#7a5b00";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 0, 17, 13, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // belly
    ctx.fillStyle = "#fff3b0";
    ctx.beginPath();
    ctx.ellipse(2, 5, 10, 7, 0, 0, Math.PI * 2);
    ctx.fill();

    // wing (animated)
    ctx.fillStyle = "#f5a623";
    ctx.beginPath();
    ctx.ellipse(-2, 2 + flapPhase * 6, 9, 5, flapPhase * 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // eye
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(8, -5, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#222";
    ctx.beginPath();
    ctx.arc(9.5, -5, 2.2, 0, Math.PI * 2);
    ctx.fill();

    // beak
    ctx.fillStyle = "#ff7f50";
    ctx.beginPath();
    ctx.moveTo(14, -2);
    ctx.lineTo(24, 1);
    ctx.lineTo(14, 5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.restore();
  }

  // ---------- Main loop (delta-time based) ----------
  let lastTime = performance.now();
  function loop(now) {
    // clamp dt so a backgrounded tab doesn't cause a physics jump
    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;

    if (state !== State.DEAD || deathTimer < 0.7) update(dt);
    else { groundX = (groundX - PIPE_SPEED * dt) % 24; } // freeze world, keep ground still too

    draw();
    requestAnimationFrame(loop);
  }

  // Pause the loop when the tab is hidden (battery friendly)
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) lastTime = performance.now();
  });

  // Prevent double-tap zoom & pull-to-refresh on mobile
  document.addEventListener("dblclick", (e) => e.preventDefault(), { passive: false });
  document.addEventListener("touchmove", (e) => e.preventDefault(), { passive: false });

  // Boot
  updateScore();
  requestAnimationFrame(loop);
})();
