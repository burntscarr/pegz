(() => {
  const WORLD_W = 12;
  const WORLD_H = 20;
  const canvas = document.getElementById("editorCanvas");
  const ctx = canvas.getContext("2d");

  let pegs = [];
  let preview = null;
  let previewSeed = null;

  function fit() {
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(r.width * dpr);
    canvas.height = Math.floor(r.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }

  function viewport() {
    const r = canvas.getBoundingClientRect();
    const scale = Math.min(r.width / WORLD_W, r.height / WORLD_H);
    return {
      scale,
      ox: (r.width - WORLD_W * scale) / 2,
      oy: (r.height - WORLD_H * scale) / 2
    };
  }

  function key(x,y) { return `${x},${y}`; }

  function draw() {
    const r = canvas.getBoundingClientRect();
    ctx.clearRect(0,0,r.width,r.height);
    const v = viewport();
    const w = WORLD_W * v.scale, h = WORLD_H * v.scale;
    ctx.fillStyle = "#111827";
    ctx.fillRect(v.ox,v.oy,w,h);

    ctx.strokeStyle = "rgba(255,255,255,.09)";
    ctx.lineWidth = 1;

    for (let x=0; x<=WORLD_W*2; x++) {
      const xx = v.ox + x * 0.5 * v.scale;
      ctx.beginPath();
      ctx.moveTo(xx, v.oy);
      ctx.lineTo(xx, v.oy+h);
      ctx.stroke();
    }
    for (let y=0; y<=WORLD_H*2; y++) {
      const yy = v.oy + y * 0.5 * v.scale;
      ctx.beginPath();
      ctx.moveTo(v.ox, yy);
      ctx.lineTo(v.ox+w, yy);
      ctx.stroke();
    }

    for (const p of pegs) {
      const px = v.ox + p.x*v.scale, py = v.oy + p.y*v.scale;
      let color = "#38bdf8";
      if (preview?.red.has(key(p.x,p.y))) color = "#ef4444";
      ctx.beginPath();
      ctx.arc(px,py,Math.max(5,v.scale*.28),0,Math.PI*2);
      ctx.fillStyle = color;
      ctx.fill();
    }
  }

  function nearestPoint(ev) {
    const r = canvas.getBoundingClientRect();
    const v = viewport();
    const wx = (ev.clientX-r.left-v.ox)/v.scale;
    const wy = (ev.clientY-r.top-v.oy)/v.scale;
    const half = document.getElementById("halfGrid").checked || ev.shiftKey;
    const step = half ? 0.5 : 1;
    const x = Math.round(wx/step)*step;
    const y = Math.round(wy/step)*step;
    return {
      x: Math.max(0.5, Math.min(WORLD_W-0.5, x)),
      y: Math.max(1.5, Math.min(WORLD_H-0.5, y))
    };
  }

  canvas.addEventListener("pointerdown", ev => {
    const p = nearestPoint(ev);
    const idx = pegs.findIndex(q => q.x===p.x && q.y===p.y);
    if (idx >= 0) pegs.splice(idx,1);
    else pegs.push(p);
    preview = null;
    previewSeed = null;
    update();
  });

  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function randomize() {
    if (!pegs.length) return;
    previewSeed = crypto.getRandomValues(new Uint32Array(1))[0] >>> 0;
    const r = rng(previewSeed);
    const min = +document.getElementById("redMin").value || 35;
    const max = Math.max(min, +document.getElementById("redMax").value || 45);
    const pct = min + Math.floor(r()*(max-min+1));
    const count = Math.max(1, Math.round(pegs.length*pct/100));
    const arr = [...pegs].sort(()=>r()-.5);
    preview = { red: new Set(arr.slice(0,count).map(p=>key(p.x,p.y))) };
    update();
  }

  function levelData() {
    const id = String(document.getElementById("levelId").value || "001").padStart(3,"0");
    return {
      id,
      balls: +document.getElementById("balls").value || 10,
      redPercentMin: +document.getElementById("redMin").value || 35,
      redPercentMax: +document.getElementById("redMax").value || 45,
      pegs: [...pegs].sort((a,b)=>a.y-b.y || a.x-b.x)
    };
  }

  function update() {
    document.getElementById("pegCount").textContent = pegs.length;
    document.getElementById("seedLabel").textContent = previewSeed ?? "—";
    draw();
  }

  function download() {
    const data = levelData();
    const blob = new Blob([JSON.stringify(data,null,2)],{type:"application/json"});
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${data.id}.json`;
    a.click();
    setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  }

  function test() {
    const data = levelData();
    localStorage.setItem("pegdrop-editor-test-level", JSON.stringify(data));
    alert("Test export stored locally.\n\nFor this starter build, download the JSON and add it to /levels plus levels/index.json to play it in the main game.");
  }

  document.getElementById("randomizeBtn").onclick = randomize;
  document.getElementById("clearPreviewBtn").onclick = () => { preview=null; previewSeed=null; update(); };
  document.getElementById("downloadBtn").onclick = download;
  document.getElementById("testBtn").onclick = test;
  document.getElementById("clearBtn").onclick = () => {
    if (confirm("Remove every peg from this board?")) {
      pegs=[]; preview=null; previewSeed=null; update();
    }
  };

  window.addEventListener("resize", fit);

  // Starter pattern.
  for (let y=4; y<=16; y+=2) {
    const offset = (y/2)%2 ? 1.5 : 2.5;
    for (let x=offset; x<WORLD_W; x+=2) pegs.push({x,y});
  }

  fit();
  update();
})();
