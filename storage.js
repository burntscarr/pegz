const PegStore = (() => {
  const KEY = "pegdrop-save-v1";

  const defaultSave = () => ({
    version: 1,
    settings: {
      aimSensitivity: 1,
      showGuide: true
    },
    progress: {},
    career: {
      gamesPlayed: 0,
      gamesWon: 0,
      ballsFired: 0,
      pegsHit: 0,
      blueHit: 0,
      redHit: 0,
      pinkHit: 0,
      totalScore: 0,
      bestShot: 0,
      pinksSpawned: 0
    }
  });

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return defaultSave();
      const parsed = JSON.parse(raw);
      const base = defaultSave();
      return {
        ...base,
        ...parsed,
        settings: { ...base.settings, ...(parsed.settings || {}) },
        career: { ...base.career, ...(parsed.career || {}) },
        progress: parsed.progress || {}
      };
    } catch {
      return defaultSave();
    }
  }

  function save(data) {
    localStorage.setItem(KEY, JSON.stringify(data));
  }

  function reset() {
    const fresh = defaultSave();
    save(fresh);
    return fresh;
  }

  function exportSave(data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "pegdrop-save.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  async function importSave(file) {
    const text = await file.text();
    const data = JSON.parse(text);
    if (!data || typeof data !== "object") throw new Error("Invalid save file.");
    save(data);
    return load();
  }

  return { load, save, reset, exportSave, importSave };
})();
