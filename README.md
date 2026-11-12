# 🐦 Flappy Bird — Web Browser Game

A Flappy Bird clone built with **pure HTML5, CSS, and vanilla JavaScript** — no frameworks, no libraries, no image/sound assets. It runs entirely in the browser and is fully responsive on mobile, tablet, and desktop.

---

## 🎮 Features

| Feature | Details |
|---|---|
| **Mobile responsive** | Canvas auto-fits any screen size & aspect ratio, letterboxed for ultra-wide displays |
| **Retina-crisp rendering** | Uses `devicePixelRatio` (capped at 2 for performance) so graphics stay sharp on phone screens |
| **Touch / Click / Keyboard** | Tap the screen, click with the mouse, or press `Space` / `↑` / `W` |
| **Delta-time physics** | Gravity & speed are time-based, so the game plays identically on 60 Hz and 120 Hz displays |
| **Persistent high score** | Best score saved in `localStorage` |
| **Generated sound effects** | Flap / score / crash sounds synthesized at runtime with the **Web Audio API** (no audio files), with a mute button |
| **Procedural art** | Bird, pipes, clouds, bushes, and ground are all drawn with Canvas 2D code — zero downloads |
| **Battery friendly** | Game loop pauses cleanly when the tab is hidden; delta-time is clamped to avoid physics jumps |

---

## 🗂 File Structure

```
flappy/
├── index.html    # Page skeleton: canvas, score display, start/game-over overlays
├── style.css     # Responsive layout, panels, buttons, safe-area handling
├── game.js       # All game logic: physics, collisions, rendering, audio, input
└── README.md     # This file
```

---

## 🛠 How It's Made (Technical Overview)

### 1. Rendering — HTML5 Canvas with a virtual resolution
The game world is designed around a **fixed virtual height (700px)**. On every resize, the canvas reads `window.innerWidth/innerHeight` and `devicePixelRatio`, computes a virtual viewport that matches the screen's aspect ratio, and scales all coordinates uniformly. Leftover space is letterboxed with dark bars. This means one set of game constants works on every device.

```js
const scale = Math.min(canvas.width / viewW, canvas.height / viewH);
ctx.setTransform(scale, 0, 0, scale, offX, offY); // virtual → screen coords
```

### 2. Game loop — `requestAnimationFrame` + delta time
The loop computes the time elapsed since the last frame (`dt`, clamped to 50 ms) and multiplies all velocities by it:

```js
bird.vel = Math.min(bird.vel + GRAVITY * dt, MAX_FALL_SPEED);
bird.y  += bird.vel * dt;
```

This decouples physics from frame rate — the game speed is identical on any device.

### 3. Game states
Three states drive the whole flow:
- **READY** — bird idles with a bobbing animation; overlay shows the start panel.
- **PLAYING** — physics run, pipes spawn and move, collisions are checked.
- **DEAD** — bird tumbles to the ground; game-over panel appears with the score.

### 4. Pipes & collision
Pipes are objects `{ x, gapY, passed }` spawned every `PIPE_SPACING / PIPE_SPEED` seconds, with a random gap position. Collision uses **circle-vs-rectangle** detection (the bird is a circle) instead of the buggy axis-only check:

```js
const nx = Math.max(rx, Math.min(cx, rx + rw)); // clamp circle center to rect
const ny = Math.max(ry, Math.min(cy, ry + rh));
return (cx-nx)² + (cy-ny)² < r²;
```

Scoring happens when a pipe's right edge passes the bird — counted via the `passed` flag.

### 5. Audio — Web Audio API
All sounds (flap, score chime, crash, death slide) are **generated oscillators** — no audio files:

```js
const osc = audioCtx.createOscillator();
const gain = audioCtx.createGain();
osc.frequency.setValueAtTime(freq, t);       // + exponential ramp for slide
gain.gain.exponentialRampToValueAtTime(0.0001, t + dur); // fade out
```

### 6. Mobile optimizations
- `viewport` meta with `viewport-fit=cover` + `env(safe-area-inset-*)` for notched phones
- `100dvh` unit so the layout survives mobile browser URL bars
- `touch-action: manipulation` and prevented `dblclick` / `touchmove` to kill double-tap zoom & pull-to-refresh
- Pointer Events (`pointerdown`) unify touch, mouse, and pen input
- DPR capped at 2, and the pause-on-hidden-tab behavior, to save battery

### 7. Persistence
`localStorage` stores the best score (`flappyBest`) and mute preference (`flappyMuted`).

---

## ▶ How to Run the Local Server

The game is plain static files — you just need to serve the folder over HTTP (a raw `file://` open also works, but a local server is the proper way and avoids browser restrictions).

### Option 1 — Python (already installed on most systems)

```bash
cd /path/to/flappy

# Python 3
python -m http.server 8080
# or on some systems: python3 -m http.server 8080
```

Then open **http://localhost:8080** in your browser.

### Option 2 — Node.js

```bash
cd /path/to/flappy
npx serve .          # uses any free port
# or
npx http-server -p 8080
```

Then open the URL it prints (e.g. **http://localhost:8080**).

### Option 3 — VS Code

Install the **Live Server** extension → right-click `index.html` → **Open with Live Server**.

### Option 4 — PHP

```bash
cd /path/to/flappy
php -S localhost:8080
```

### 📱 Play on your phone (same Wi-Fi)

1. Find your computer's local IP:
   - Linux/macOS: `hostname -I` or `ipconfig getifaddr en0`
   - Windows: `ipconfig` → look for *IPv4 Address*
2. Start the server: `python -m http.server 8080`
3. On your phone, visit `http://<YOUR_IP>:8080` (e.g. `http://192.168.1.5:8080`)
   - Make sure both devices are on the same Wi-Fi network.
4. 💡 Tip: in Chrome you can also use **chrome://inspect** for wireless debugging.

> 🚨 **Important for Termux (Android):** if you're serving from Termux and want to play in your phone's browser, use `http://localhost:8080` directly — no IP lookup needed.

---

## 🕹 Controls

| Action | Mobile | Desktop |
|---|---|---|
| Flap / Start | Tap the screen | Click, or press `Space` / `↑` / `W` |
| Restart | Tap Restart button | Click Restart, then tap/click to flap |
| Mute | Tap 🔊 / 🔇 button | Same |

**Rules:** Don't hit the pipes or the ground. Each pipe you pass = 1 point. Green pipes are faster than your reflexes think. Good luck! 🟢
