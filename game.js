(() => {
  const WORLD_W = 12;
  const WORLD_H = 20;
  const PEG_R = 0.31;
  const BALL_R = 0.23;
  const GRAVITY = 13.5;
  const BOUNCE = 0.86;
  const WALL_BOUNCE = 0.9;
  const LAUNCH_SPEED = 11.6;

  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");
  const levelLabel = document.getElementById("levelLabel");
  const scoreLabel = document.getElementById("scoreLabel");
  const ballsLabel = document.getElementById("ballsLabel");

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
  let waitingForNextShot = false;
  let gameFinished = false;
  let saveData = PegStore.load();
  let raf = 0;
  let lastT = 0;

  const colors = {
    bg1: "#111827",
    bg2: "#0b1020",
    wall: "#334155",
    blue: "#38bdf8",
    red: "#ef4444",
    pink: "#f472b6",
    hit: "#f8fafc",
    ball: "#f8fafc",
    guide: "rgba(255,255,255,.55)"
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
      a |= 0;
      a = a + 0x6D2B79F5 | 0;
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
    const choices = pegs.filter(p => !p.removed && p.color === "blue");
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
      id: i,
      x: Number(p.x),
      y: Number(p.y),
      type: "normal",
      color: "blue",
      hit: false,
      removed: false
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
    waitingForNextShot = false;
    gameFinished = false;

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
    const scale = Math.min(rect.width / WORLD_W, rect.height / WORLD_H);
    return {
      scale,
      ox: (rect.width - WORLD_W * scale) / 2,
      oy: (rect.height - WORLD_H * scale) / 2,
      width: WORLD_W * scale,
      height: WORLD_H * scale
    };
  }

  function toScreen(x, y, v = viewport()) {
    return { x: v.ox + x * v.scale, y: v.oy + y * v.scale };
  }

  function launchBall() {
    if (ball || ballsRemaining <= 0 || gameFinished) return;
    ballsRemaining--;
    saveData.career.ballsFired++;
    shotScore = 0;
    shotMultiplier = 1;

    const x = WORLD_W / 2;
    const y = 0.9;
    ball = {
      x, y,
      vx: Math.cos(aimAngle) * LAUNCH_SPEED,
      vy: Math.sin(aimAngle) * LAUNCH_SPEED
    };
    updateHud();
  }

  function scorePeg(p) {
    let base = 100;
    if (p.color === "pink") base = 500;

    const gained = base * shotMultiplier;
    score += gained;
    shotScore += gained;
    saveData.career.pegsHit++;

    if (p.color === "red") {
      saveData.career.redHit++;
      redRemaining--;
    } else if (p.color === "pink") {
      saveData.career.pinkHit++;
      shotMultiplier = Math.min(8, shotMultiplier * 2);
    } else {
      saveData.career.blueHit++;
    }

    saveData.career.totalScore += gained;
    saveData.career.bestShot = Math.max(saveData.career.bestShot, shotScore);
    PegStore.save(saveData);
  }

  function collidePeg(p) {
    if (!ball || p.removed) return;
    const dx = ball.x - p.x;
    const dy = ball.y - p.y;
    const minDist = BALL_R + PEG_R;
    const d2 = dx * dx + dy * dy;
    if (d2 >= minDist * minDist || d2 === 0) return;

    const d = Math.sqrt(d2);
    const nx = dx / d;
    const ny = dy / d;
    const overlap = minDist - d;
    ball.x += nx * overlap;
    ball.y += ny * overlap;

    const dot = ball.vx * nx + ball.vy * ny;
    if (dot < 0) {
      ball.vx -= (1 + BOUNCE) * dot * nx;
      ball.vy -= (1 + BOUNCE) * dot * ny;
    }

    if (!p.hit) {
      p.hit = true;
      scorePeg(p);
      updateHud();
    }
  }

  function endShot() {
    ball = null;
    pegs.forEach(p => {
      if (p.hit) p.removed = true;
    });

    if (redRemaining <= 0) {
      finishGame(true);
      return;
    }
    if (ballsRemaining <= 0) {
      finishGame(false);
      return;
    }

    waitingForNextShot = true;
    spawnPinkIfNeeded();
    waitingForNextShot = false;
  }

  function finishGame(won) {
    gameFinished = true;
    const p = saveData.progress[level.id] || {};
    if (won) {
      saveData.career.gamesWon++;
      p.completed = true;
      p.bestScore = Math.max(p.bestScore || 0, Math.round(score));
      const used = (level.balls ?? 10) - ballsRemaining;
      p.fewestBalls = p.fewestBalls ? Math.min(p.fewestBalls, used) : used;
    } else {
      p.bestScore = Math.max(p.bestScore || 0, Math.round(score));
    }
    saveData.progress[level.id] = p;
    PegStore.save(saveData);

    showOverlay(
      won ? "Level Cleared!" : "Out of Balls",
      won
        ? `Score ${Math.round(score).toLocaleString()} · Seed ${runSeed}`
        : `${redRemaining} red peg${redRemaining === 1 ? "" : "s"} remaining · Seed ${runSeed}`,
      won ? "Next Level" : "Try Again",
      won ? () => loadLevel(currentIndex + 1) : () => loadLevel(currentIndex, runSeed)
    );
  }

  function update(dt) {
    if (!ball) return;

    const steps = 3;
    const sdt = dt / steps;
    for (let s = 0; s < steps; s++) {
      ball.vy += GRAVITY * sdt;
      ball.x += ball.vx * sdt;
      ball.y += ball.vy * sdt;

      if (ball.x - BALL_R < 0) {
        ball.x = BALL_R;
        ball.vx = Math.abs(ball.vx) * WALL_BOUNCE;
      } else if (ball.x + BALL_R > WORLD_W) {
        ball.x = WORLD_W - BALL_R;
        ball.vx = -Math.abs(ball.vx) * WALL_BOUNCE;
      }

      pegs.forEach(collidePeg);

      if (ball.y > WORLD_H + 1.0) {
        endShot();
        return;
      }
    }
  }

  function draw() {
    const rect = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);
    const v = viewport();

    const grad = ctx.createLinearGradient(0, v.oy, 0, v.oy + v.height);
    grad.addColorStop(0, colors.bg1);
    grad.addColorStop(1, colors.bg2);
    ctx.fillStyle = grad;
    ctx.fillRect(v.ox, v.oy, v.width, v.height);

    ctx.strokeStyle = colors.wall;
    ctx.lineWidth = 2;
    ctx.strokeRect(v.ox, v.oy, v.width, v.height);

    const launcher = toScreen(WORLD_W / 2, 0.9, v);
    const barrel = toScreen(
      WORLD_W / 2 + Math.cos(aimAngle) * 0.65,
      0.9 + Math.sin(aimAngle) * 0.65,
      v
    );

    if (!ball && saveData.settings.showGuide) {
      ctx.save();
      ctx.setLineDash([8, 8]);
      ctx.strokeStyle = colors.guide;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(launcher.x, launcher.y);
      const gx = WORLD_W / 2 + Math.cos(aimAngle) * 6.5;
      const gy = 0.9 + Math.sin(aimAngle) * 6.5;
      const gp = toScreen(gx, gy, v);
      ctx.lineTo(gp.x, gp.y);
      ctx.stroke();
      ctx.restore();
    }

    ctx.strokeStyle = "#e2e8f0";
    ctx.lineWidth = Math.max(4, 0.16 * v.scale);
    ctx.beginPath();
    ctx.moveTo(launcher.x, launcher.y);
    ctx.lineTo(barrel.x, barrel.y);
    ctx.stroke();

    pegs.forEach(p => {
      if (p.removed) return;
      const sp = toScreen(p.x, p.y, v);
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, PEG_R * v.scale, 0, Math.PI * 2);
      ctx.fillStyle = p.hit ? colors.hit : colors[p.color];
      ctx.fill();

      if (p.color === "pink" && !p.hit) {
        ctx.strokeStyle = "rgba(255,255,255,.8)";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    });

    if (ball) {
      const bp = toScreen(ball.x, ball.y, v);
      ctx.beginPath();
      ctx.arc(bp.x, bp.y, BALL_R * v.scale, 0, Math.PI * 2);
      ctx.fillStyle = colors.ball;
      ctx.fill();

      if (shotMultiplier > 1) {
        ctx.font = `700 ${Math.max(13, v.scale * .45)}px system-ui`;
        ctx.fillStyle = "#f9a8d4";
        ctx.textAlign = "center";
        ctx.fillText(`×${shotMultiplier}`, bp.x, bp.y - BALL_R * v.scale - 8);
      }
    }

    ctx.font = `600 ${Math.max(11, v.scale * .30)}px system-ui`;
    ctx.fillStyle = "rgba(255,255,255,.7)";
    ctx.textAlign = "left";
    ctx.fillText(`Seed ${runSeed}`, v.ox + 8, v.oy + v.height - 10);
  }

  function frame(t) {
    const dt = Math.min(0.025, Math.max(0, (t - lastT) / 1000 || 0));
    lastT = t;
    update(dt);
    draw();
    raf = requestAnimationFrame(frame);
  }

  function showOverlay(title, text, primaryText, primaryAction) {
    const overlay = document.getElementById("overlay");
    document.getElementById("overlayTitle").textContent = title;
    document.getElementById("overlayText").textContent = text;
    document.getElementById("overlayPrimary").textContent = primaryText;
    document.getElementById("overlayPrimary").onclick = async () => {
      overlay.classList.add("hidden");
      await primaryAction();
    };
    document.getElementById("overlaySecondary").onclick = () => overlay.classList.add("hidden");
    overlay.classList.remove("hidden");
  }

  function canvasPoint(ev) {
    const r = canvas.getBoundingClientRect();
    return { x: ev.clientX - r.left, y: ev.clientY - r.top };
  }

  canvas.addEventListener("pointerdown", ev => {
    if (ball || gameFinished) return;
    dragging = true;
    pointerMoved = false;
    dragLastX = canvasPoint(ev).x;
    canvas.setPointerCapture(ev.pointerId);
  });

  canvas.addEventListener("pointermove", ev => {
    if (!dragging || ball || gameFinished) return;
    const x = canvasPoint(ev).x;
    const dx = x - dragLastX;
    dragLastX = x;
    if (Math.abs(dx) > 0.5) pointerMoved = true;

    const sensitivity = saveData.settings.aimSensitivity || 1;
    aimAngle += dx * 0.008 * sensitivity;
    const min = Math.PI * 0.08;
    const max = Math.PI * 0.92;
    aimAngle = Math.max(min, Math.min(max, aimAngle));
  });

  canvas.addEventListener("pointerup", () => {
    if (!dragging || ball || gameFinished) return;
    dragging = false;
    if (!pointerMoved) launchBall();
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
    saveData.settings.showGuide = showGuideInput.checked;
    PegStore.save(saveData);
  };

  document.getElementById("exportSaveBtn").onclick = () => PegStore.exportSave(saveData);

  document.getElementById("importSaveInput").onchange = async ev => {
    const file = ev.target.files?.[0];
    if (!file) return;
    try {
      saveData = await PegStore.importSave(file);
      alert("Save imported.");
      await loadLevel(currentIndex);
    } catch (e) {
      alert(`Import failed: ${e.message}`);
    }
    ev.target.value = "";
  };

  document.getElementById("resetSaveBtn").onclick = async () => {
    if (!confirm("Reset all local progress and career stats?")) return;
    saveData = PegStore.reset();
    await loadLevel(currentIndex);
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
      await loadManifest();
      fitCanvas();
      await loadLevel(0);
      showOverlay(
        "PegDrop",
        "Drag left/right anywhere on the board to adjust the aim. Tap the board to fire.",
        "Start",
        async () => {}
      );
      cancelAnimationFrame(raf);
      lastT = performance.now();
      raf = requestAnimationFrame(frame);
    } catch (e) {
      console.error(e);
      showOverlay("Load Error", e.message, "Reload", async () => location.reload());
    }
  })();
})();
