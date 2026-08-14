(() => {
  const WORLD_W = 12;
  const WORLD_H = 20;
  const PEG_R = 0.31;
  const BALL_R = 0.23;
  const GRAVITY = 13.5;
  const BOUNCE = 0.86;
  const WALL_BOUNCE = 0.9;
  const LAUNCH_SPEED = 11.6;
  const PEG_LIFETIME = 10.0;
  const GUIDE_SECONDS = 1.35;

  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");
  const levelLabel = document.getElementById("levelLabel");
  const scoreLabel = document.getElementById("scoreLabel");
  const ballsLabel = document.getElementById("ballsLabel");
  const redsLabel = document.getElementById("redsLabel");
  const gameWrap = document.getElementById("gameWrap");

  let manifest = [];
  let currentIndex = 0;
  let level = null;
  let pegs = [];
  let ball = null;
  let aimAngle = Math.PI / 2;
  let dragging = false;
  let dragLastX = 0;
  let pointerMoved = false;
  let score = 0;
  let ballsRemaining = 0;
  let shotScore = 0;
  let shotMultiplier = 1;
  let runSeed = 1;
  let redRemaining = 0;
  let pinkSpawnedThisLevel = 0;
  let gameFinished = false;
  let saveData = PegStore.load();
  let raf = 0;
  let lastT = 0;
  let gameClock = 0;
  let popups = [];
  let particles = [];
  let celebration = null;

  const colors = {
    bg1: "#111827", bg2: "#0b1020", wall: "#334155",
    blue: "#38bdf8", red: "#ef4444", pink: "#f472b6",
    hit: "#f8fafc", ball: "#f8fafc", guide: "rgba(255,255,255,.58)"
  };

  function hashSeed(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function mulberry32(a) {
    return function() {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function chooseRedPegs(seed) {
    const rng = mulberry32(seed);
    const eligible = pegs.filter(p => p.type === "normal");
    const min = Math.max(0, level.redPercentMin ?? 35);
    const max = Math.max(min, level.redPercentMax ?? 45);
    const percent = min + Math.floor(rng() * (max - min + 1));
    const count = Math.max(1, Math.round(eligible.length * percent / 100));
    const shuffled = [...eligible].sort(() => rng() - 0.5);
    shuffled.forEach((p, i) => p.color = i < count ? "red" : "blue");
    redRemaining = count;
  }

  function spawnPinkIfNeeded() {
    if (pinkSpawnedThisLevel >= 3) return;
    if (pegs.some(p => p.color === "pink" && !p.removed)) return;
    const choices = pegs.filter(p => !p.removed && !p.hit && p.color === "blue");
    if (!choices.length) return;
    const rng = mulberry32(hashSeed(`${runSeed}:pink:${pinkSpawnedThisLevel}:${ballsRemaining}:${score}`));
    const p = choices[Math.floor(rng() * choices.length)];
    if (!p) return;
    p.color = "pink";
    pinkSpawnedThisLevel++;
    saveData.career.pinksSpawned++;
    PegStore.save(saveData);
  }

  async function loadManifest() {
    const res = await fetch("levels/index.json", { cache: "no-store" });
    manifest = await res.json();
    if (!Array.isArray(manifest) || !manifest.length) throw new Error("No levels found.");
  }

  async function loadLevel(index, forcedSeed = null) {
    currentIndex = (index + manifest.length) % manifest.length;
    const id = manifest[currentIndex];
    const res = await fetch(`levels/${id}.json`, { cache: "no-store" });
    level = await res.json();

    pegs = (level.pegs || []).map((p, i) => ({
      id: i, x: Number(p.x), y: Number(p.y), type: "normal",
      color: "blue", hit: false, hitAt: null, removed: false
    }));

    runSeed = forcedSeed ?? ((crypto.getRandomValues(new Uint32Array(1))[0]) >>> 0);
    chooseRedPegs(hashSeed(`${level.id}:${runSeed}`));

    score = 0;
    ballsRemaining = level.balls ?? 10;
    ball = null;
    shotScore = 0;
    shotMultiplier = 1;
    aimAngle = Math.PI / 2;
    pinkSpawnedThisLevel = 0;
    gameFinished = false;
    gameClock = 0;
    popups = [];
    particles = [];
    celebration = null;
    gameWrap.classList.remove("celebrating");

    saveData.career.gamesPlayed++;
    const p = saveData.progress[level.id] || {};
    p.plays = (p.plays || 0) + 1;
    saveData.progress[level.id] = p;
    PegStore.save(saveData);
    updateHud();
  }

  function updateHud() {
    levelLabel.textContent = level?.id || "---";
    scoreLabel.textContent = Math.round(score).toLocaleString();
    ballsLabel.textContent = ballsRemaining;
    redsLabel.textContent = redRemaining;
  }

  function fitCanvas() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function viewport() {
    const rect = canvas.getBoundingClientRect();
    const baseScale = Math.min(rect.width / WORLD_W, rect.height / WORLD_H);
    if (!celebration) {
      return { scale: baseScale, ox: (rect.width - WORLD_W * baseScale) / 2,
        oy: (rect.height - WORLD_H * baseScale) / 2,
        width: WORLD_W * baseScale, height: WORLD_H * baseScale };
    }

    const u = Math.min(1, celebration.t / celebration.duration);
    const pulse = Math.sin(Math.PI * u);
    const zoom = 1 + 0.42 * pulse;
    const scale = baseScale * zoom;
    const shake = (1-u) * 7;
    const sx = (Math.random() - .5) * shake;
    const sy = (Math.random() - .5) * shake;
    return {
      scale,
      ox: rect.width / 2 - celebration.x * scale + sx,
      oy: rect.height / 2 - celebration.y * scale + sy,
      width: WORLD_W * scale,
      height: WORLD_H * scale
    };
  }

  function toScreen(x, y, v = viewport()) {
    return { x: v.ox + x * v.scale, y: v.oy + y * v.scale };
  }

  function launchBall() {
    if (ball || ballsRemaining <= 0 || gameFinished || celebration) return;
    ballsRemaining--;
    saveData.career.ballsFired++;
    shotScore = 0;
    shotMultiplier = 1;
    ball = {
      x: WORLD_W / 2, y: 0.9,
      vx: Math.cos(aimAngle) * LAUNCH_SPEED,
      vy: Math.sin(aimAngle) * LAUNCH_SPEED
    };
    updateHud();
  }

  function addPopup(x, y, text, color="#ffffff", scale=1) {
    popups.push({ x, y, text, color, scale, age: 0, duration: .9 });
  }

  function startFinalRedCelebration(p) {
    if (celebration) return;
    celebration = { x: p.x, y: p.y, t: 0, duration: 1.55 };
    gameWrap.classList.add("celebrating");
    for (let i = 0; i < 42; i++) {
      const a = Math.random() * Math.PI * 2;
      const speed = 1.5 + Math.random() * 5.5;
      particles.push({
        x: p.x, y: p.y,
        vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
        life: .6 + Math.random() * .8,
        age: 0,
        size: .06 + Math.random() * .12
      });
    }
  }

  function scorePeg(p) {
    const originalColor = p.color;
    const base = originalColor === "pink" ? 500 : 100;
    const gained = base * shotMultiplier;
    score += gained;
    shotScore += gained;
    saveData.career.pegsHit++;

    if (originalColor === "red") {
      saveData.career.redHit++;
      redRemaining--;
    } else if (originalColor === "pink") {
      saveData.career.pinkHit++;
    } else {
      saveData.career.blueHit++;
    }

    addPopup(p.x, p.y - .35, `+${gained.toLocaleString()}`, originalColor === "pink" ? "#f9a8d4" : "#ffffff");

    if (originalColor === "pink") {
      shotMultiplier = Math.min(8, shotMultiplier * 2);
      addPopup(p.x, p.y - .9, `×${shotMultiplier}`, "#f472b6", 1.25);
    }

    saveData.career.totalScore += gained;
    saveData.career.bestShot = Math.max(saveData.career.bestShot, shotScore);
    PegStore.save(saveData);

    if (originalColor === "red" && redRemaining === 0) startFinalRedCelebration(p);
  }

  function collideBodyWithPeg(body, p, scoreHit=true) {
    if (p.removed) return false;
    const dx = body.x - p.x;
    const dy = body.y - p.y;
    const minDist = BALL_R + PEG_R;
    const d2 = dx * dx + dy * dy;
    if (d2 >= minDist * minDist || d2 === 0) return false;
    const d = Math.sqrt(d2);
    const nx = dx / d, ny = dy / d;
    const overlap = minDist - d;
    body.x += nx * overlap;
    body.y += ny * overlap;
    const dot = body.vx * nx + body.vy * ny;
    if (dot < 0) {
      body.vx -= (1 + BOUNCE) * dot * nx;
      body.vy -= (1 + BOUNCE) * dot * ny;
    }
    if (scoreHit && !p.hit) {
      p.hit = true;
      p.hitAt = gameClock;
      scorePeg(p);
      updateHud();
    }
    return true;
  }

  function applyWalls(body) {
    if (body.x - BALL_R < 0) {
      body.x = BALL_R;
      body.vx = Math.abs(body.vx) * WALL_BOUNCE;
    } else if (body.x + BALL_R > WORLD_W) {
      body.x = WORLD_W - BALL_R;
      body.vx = -Math.abs(body.vx) * WALL_BOUNCE;
    }
    if (body.y - BALL_R < 0) {
      body.y = BALL_R;
      body.vy = Math.abs(body.vy) * WALL_BOUNCE;
    }
  }

  function endShot() {
    ball = null;
    if (redRemaining <= 0) {
      finishGame(true);
      return;
    }
    if (ballsRemaining <= 0) {
      finishGame(false);
      return;
    }
    spawnPinkIfNeeded();
  }

  function finishGame(won) {
    if (gameFinished) return;
    gameFinished = true;
    const p = saveData.progress[level.id] || {};
    const rounded = Math.round(score);
    const oldBest = p.bestScore || 0;
    if (rounded > oldBest) {
      p.bestScore = rounded;
      p.bestSeed = runSeed;
    }
    if (won) {
      saveData.career.gamesWon++;
      p.completed = true;
      const used = (level.balls ?? 10) - ballsRemaining;
      p.fewestBalls = p.fewestBalls ? Math.min(p.fewestBalls, used) : used;
    }
    saveData.progress[level.id] = p;
    PegStore.save(saveData);

    showOverlay(
      won ? "Level Cleared!" : "Out of Balls",
      won
        ? `Score ${rounded.toLocaleString()} · Seed ${runSeed}`
        : `${redRemaining} red peg${redRemaining === 1 ? "" : "s"} remaining · Seed ${runSeed}`,
      won ? "Next Level" : "Try Again",
      won ? () => loadLevel(currentIndex + 1) : () => loadLevel(currentIndex, runSeed)
    );
  }

  function update(realDt) {
    gameClock += realDt;

    for (const p of pegs) {
      if (p.hit && !p.removed && p.hitAt !== null && gameClock - p.hitAt >= PEG_LIFETIME) {
        p.removed = true;
      }
    }

    for (const p of popups) p.age += realDt;
    popups = popups.filter(p => p.age < p.duration);

    for (const p of particles) {
      p.age += realDt;
      p.vy += 6 * realDt;
      p.x += p.vx * realDt;
      p.y += p.vy * realDt;
    }
    particles = particles.filter(p => p.age < p.life);

    let timeScale = 1;
    if (celebration) {
      celebration.t += realDt;
      timeScale = .20;
      if (celebration.t >= celebration.duration) {
        celebration = null;
        gameWrap.classList.remove("celebrating");
      }
    }

    if (!ball) return;
    const dt = realDt * timeScale;
    const steps = 4;
    const sdt = dt / steps;
    for (let s = 0; s < steps; s++) {
      ball.vy += GRAVITY * sdt;
      ball.x += ball.vx * sdt;
      ball.y += ball.vy * sdt;
      applyWalls(ball);
      pegs.forEach(p => collideBodyWithPeg(ball, p, true));
      if (ball.y > WORLD_H + 1.0) {
        endShot();
        return;
      }
    }
  }

  function predictedGuide() {
    const b = {
      x: WORLD_W / 2, y: 0.9,
      vx: Math.cos(aimAngle) * LAUNCH_SPEED,
      vy: Math.sin(aimAngle) * LAUNCH_SPEED
    };
    const pts = [{x:b.x,y:b.y}];
    const dt = 1/90;
    let afterFirstPeg = null;
    for (let t=0; t<GUIDE_SECONDS; t+=dt) {
      b.vy += GRAVITY * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      applyWalls(b);
      let hit = false;
      for (const p of pegs) {
        if (!p.removed && collideBodyWithPeg(b, p, false)) { hit = true; break; }
      }
      if (hit && afterFirstPeg === null) afterFirstPeg = .28;
      if (afterFirstPeg !== null) {
        afterFirstPeg -= dt;
        if (afterFirstPeg <= 0) break;
      }
      if (b.y > WORLD_H) break;
      if (pts.length === 0 || t * 90 % 6 < 1) pts.push({x:b.x,y:b.y});
    }
    return pts;
  }

  function draw() {
    const rect = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);
    const v = viewport();

    const grad = ctx.createLinearGradient(0, v.oy, 0, v.oy + v.height);
    grad.addColorStop(0, colors.bg1); grad.addColorStop(1, colors.bg2);
    ctx.fillStyle = grad;
    ctx.fillRect(v.ox, v.oy, v.width, v.height);
    ctx.strokeStyle = colors.wall;
    ctx.lineWidth = 2;
    ctx.strokeRect(v.ox, v.oy, v.width, v.height);

    const launcher = toScreen(WORLD_W / 2, 0.9, v);
    const barrel = toScreen(WORLD_W / 2 + Math.cos(aimAngle) * 0.65,
      0.9 + Math.sin(aimAngle) * 0.65, v);

    if (!ball && !celebration && saveData.settings.showGuide) {
      const guide = predictedGuide();
      ctx.fillStyle = colors.guide;
      for (let i=1; i<guide.length; i+=2) {
        const gp = toScreen(guide[i].x, guide[i].y, v);
        ctx.beginPath();
        ctx.arc(gp.x, gp.y, Math.max(1.5, v.scale*.055), 0, Math.PI*2);
        ctx.fill();
      }
    }

    ctx.strokeStyle = "#e2e8f0";
    ctx.lineWidth = Math.max(4, 0.16 * v.scale);
    ctx.beginPath(); ctx.moveTo(launcher.x, launcher.y); ctx.lineTo(barrel.x, barrel.y); ctx.stroke();

    pegs.forEach(p => {
      if (p.removed) return;
      const sp = toScreen(p.x, p.y, v);
      ctx.beginPath(); ctx.arc(sp.x, sp.y, PEG_R * v.scale, 0, Math.PI * 2);
      ctx.fillStyle = p.hit ? colors.hit : colors[p.color]; ctx.fill();
      if (p.hit) {
        const left = Math.max(0, PEG_LIFETIME - (gameClock - p.hitAt));
        ctx.strokeStyle = `rgba(255,255,255,${0.18 + 0.35*(left/PEG_LIFETIME)})`;
        ctx.lineWidth = Math.max(1, v.scale*.045); ctx.stroke();
      } else if (p.color === "pink") {
        ctx.strokeStyle = "rgba(255,255,255,.8)"; ctx.lineWidth = 1.5; ctx.stroke();
      }
    });

    if (ball) {
      const bp = toScreen(ball.x, ball.y, v);
      ctx.beginPath(); ctx.arc(bp.x, bp.y, BALL_R * v.scale, 0, Math.PI * 2);
      ctx.fillStyle = colors.ball; ctx.fill();
      if (shotMultiplier > 1) {
        ctx.font = `700 ${Math.max(13, v.scale * .45)}px system-ui`;
        ctx.fillStyle = "#f9a8d4"; ctx.textAlign = "center";
        ctx.fillText(`×${shotMultiplier}`, bp.x, bp.y - BALL_R * v.scale - 8);
      }
    }

    for (const p of particles) {
      const sp = toScreen(p.x,p.y,v);
      const alpha = 1 - p.age/p.life;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = Math.random() > .45 ? "#ef4444" : "#facc15";
      ctx.beginPath(); ctx.arc(sp.x,sp.y,p.size*v.scale,0,Math.PI*2); ctx.fill();
    }
    ctx.globalAlpha = 1;

    for (const p of popups) {
      const sp = toScreen(p.x, p.y - p.age*.7, v);
      const alpha = 1 - p.age/p.duration;
      ctx.globalAlpha = alpha;
      ctx.font = `800 ${Math.max(12, v.scale*.34*p.scale)}px system-ui`;
      ctx.fillStyle = p.color; ctx.textAlign = "center";
      ctx.fillText(p.text, sp.x, sp.y);
    }
    ctx.globalAlpha = 1;

    if (celebration) {
      const u = celebration.t / celebration.duration;
      const flash = Math.max(0, 1 - u*4);
      if (flash > 0) {
        ctx.fillStyle = `rgba(255,255,255,${flash*.75})`;
        ctx.fillRect(0,0,rect.width,rect.height);
      }
    }

    ctx.font = `600 ${Math.max(11, v.scale * .30)}px system-ui`;
    ctx.fillStyle = "rgba(255,255,255,.7)"; ctx.textAlign = "left";
    ctx.fillText(`Seed ${runSeed}`, v.ox + 8, v.oy + v.height - 10);
  }

  function frame(t) {
    const dt = Math.min(0.025, Math.max(0, (t - lastT) / 1000 || 0));
    lastT = t; update(dt); draw(); raf = requestAnimationFrame(frame);
  }

  function showOverlay(title, text, primaryText, primaryAction) {
    const overlay = document.getElementById("overlay");
    document.getElementById("overlayTitle").textContent = title;
    document.getElementById("overlayText").textContent = text;
    document.getElementById("overlayPrimary").textContent = primaryText;
    document.getElementById("overlayPrimary").onclick = async () => {
      overlay.classList.add("hidden"); await primaryAction();
    };
    document.getElementById("overlaySecondary").onclick = () => overlay.classList.add("hidden");
    overlay.classList.remove("hidden");
  }

  function canvasPoint(ev) {
    const r = canvas.getBoundingClientRect();
    return { x: ev.clientX - r.left, y: ev.clientY - r.top };
  }

  canvas.addEventListener("pointerdown", ev => {
    if (ball || gameFinished || celebration) return;
    dragging = true; pointerMoved = false; dragLastX = canvasPoint(ev).x;
    canvas.setPointerCapture(ev.pointerId);
  });
  canvas.addEventListener("pointermove", ev => {
    if (!dragging || ball || gameFinished || celebration) return;
    const x = canvasPoint(ev).x; const dx = x - dragLastX; dragLastX = x;
    if (Math.abs(dx) > 0.5) pointerMoved = true;
    const sensitivity = saveData.settings.aimSensitivity || 1;
    aimAngle += dx * 0.008 * sensitivity;
    aimAngle = Math.max(Math.PI*.08, Math.min(Math.PI*.92, aimAngle));
  });
  canvas.addEventListener("pointerup", () => {
    if (!dragging || ball || gameFinished || celebration) return;
    dragging = false; if (!pointerMoved) launchBall();
  });

  document.getElementById("restartBtn").onclick = () => loadLevel(currentIndex, runSeed);
  document.getElementById("prevLevel").onclick = () => loadLevel(currentIndex - 1);
  document.getElementById("nextLevel").onclick = () => loadLevel(currentIndex + 1);

  const settingsDialog = document.getElementById("settingsDialog");
  const sensitivityInput = document.getElementById("sensitivityInput");
  const sensitivityValue = document.getElementById("sensitivityValue");
  const showGuideInput = document.getElementById("showGuideInput");
  document.getElementById("settingsBtn").onclick = () => {
    sensitivityInput.value = saveData.settings.aimSensitivity;
    sensitivityValue.textContent = Number(sensitivityInput.value).toFixed(2);
    showGuideInput.checked = !!saveData.settings.showGuide;
    settingsDialog.showModal();
  };
  sensitivityInput.oninput = () => {
    saveData.settings.aimSensitivity = Number(sensitivityInput.value);
    sensitivityValue.textContent = Number(sensitivityInput.value).toFixed(2);
    PegStore.save(saveData);
  };
  showGuideInput.onchange = () => {
    saveData.settings.showGuide = showGuideInput.checked; PegStore.save(saveData);
  };
  document.getElementById("exportSaveBtn").onclick = () => PegStore.exportSave(saveData);
  document.getElementById("importSaveInput").onchange = async ev => {
    const file = ev.target.files?.[0]; if (!file) return;
    try { saveData = await PegStore.importSave(file); alert("Save imported."); await loadLevel(currentIndex); }
    catch (e) { alert(`Import failed: ${e.message}`); }
    ev.target.value = "";
  };
  document.getElementById("resetSaveBtn").onclick = async () => {
    if (!confirm("Reset all local progress and career stats?")) return;
    saveData = PegStore.reset(); await loadLevel(currentIndex);
  };
  document.getElementById("statsBtn").onclick = () => {
    const c = saveData.career;
    const completed = Object.values(saveData.progress).filter(x => x.completed).length;
    document.getElementById("statsBody").innerHTML = `
      <div class="stat-grid">
        <div>Levels completed</div><div>${completed}</div>
        <div>Games played</div><div>${c.gamesPlayed}</div>
        <div>Games won</div><div>${c.gamesWon}</div>
        <div>Balls fired</div><div>${c.ballsFired}</div>
        <div>Pegs hit</div><div>${c.pegsHit}</div>
        <div>Blue pegs</div><div>${c.blueHit}</div>
        <div>Red pegs</div><div>${c.redHit}</div>
        <div>Pink pegs</div><div>${c.pinkHit}</div>
        <div>Pink pegs spawned</div><div>${c.pinksSpawned}</div>
        <div>Total score</div><div>${Math.round(c.totalScore).toLocaleString()}</div>
        <div>Best shot</div><div>${Math.round(c.bestShot).toLocaleString()}</div>
      </div>`;
    document.getElementById("statsDialog").showModal();
  };

  window.addEventListener("resize", fitCanvas);
  (async () => {
    try {
      await loadManifest(); fitCanvas(); await loadLevel(0);
      showOverlay("PegDrop", "Drag left/right anywhere on the board to adjust the aim. Tap the board to fire.", "Start", async () => {});
      cancelAnimationFrame(raf); lastT = performance.now(); raf = requestAnimationFrame(frame);
    } catch (e) {
      console.error(e); showOverlay("Load Error", e.message, "Reload", async () => location.reload());
    }
  })();
})();
