(() => {
  "use strict";

  const RANKING_STORAGE_KEY = "gridlab-rankings-v1";
  const ADMIN_SEQUENCE = "haejyun1324";
  const stages = {
    tutorial: {
      id: "tutorial",
      title: "4×4 튜토리얼",
      kind: "TUTORIAL",
      size: 4,
      description: "최소 4칸을 선택해 격자 전체를 채워 보세요.",
      preset: [],
      walls: [],
      guides: [2, 7],
    },
    open: {
      id: "open",
      title: "첫 번째 파도",
      kind: "8×8 퍼즐",
      size: 8,
      description: "미리 켜진 칸 두 곳에서 확산을 시작하세요.",
      preset: [0, 63],
      walls: [18, 45],
      guides: [],
    },
    gates: {
      id: "gates",
      title: "좁은 통로",
      kind: "8×8 퍼즐",
      size: 8,
      description: "벽을 피해 활성 칸의 연결 고리를 만들어 보세요.",
      preset: [8, 55],
      walls: [10, 11, 12, 27, 28, 29, 34, 35, 36, 51, 52, 53],
      guides: [],
    },
    islands: {
      id: "islands",
      title: "두 개의 섬",
      kind: "8×8 퍼즐",
      size: 8,
      description: "여러 장애물 사이로 확산 경로를 찾아보세요.",
      preset: [3, 60, 24],
      walls: [1, 9, 17, 25, 38, 39, 46, 47, 54],
      guides: [],
    },
  };

  const elements = {
    grid: document.querySelector("#grid"),
    stageTitle: document.querySelector("#stage-title"),
    stageKind: document.querySelector("#stage-kind"),
    stageDescription: document.querySelector("#stage-description"),
    stagePickerWrap: document.querySelector("#stage-picker-wrap"),
    stageSelect: document.querySelector("#stage-select"),
    seedCount: document.querySelector("#seed-count"),
    progressValue: document.querySelector("#progress-value"),
    progressBar: document.querySelector("#progress-bar"),
    startButton: document.querySelector("#start-button"),
    stopButton: document.querySelector("#stop-button"),
    restoreButton: document.querySelector("#restore-button"),
    resetButton: document.querySelector("#reset-button"),
    message: document.querySelector("#game-message"),
    clearPanel: document.querySelector("#clear-panel"),
    clearMessage: document.querySelector("#clear-message"),
    scoreForm: document.querySelector("#score-form"),
    nickname: document.querySelector("#nickname"),
    nextStageButton: document.querySelector("#next-stage-button"),
    rankingBody: document.querySelector("#ranking-body"),
    rankingStage: document.querySelector("#ranking-stage"),
    rankingPanel: document.querySelector("#ranking-panel"),
    previewGrid: document.querySelector("#preview-grid"),
    gameView: document.querySelector("#game-view"),
    adminView: document.querySelector("#admin-view"),
    adminRankingBody: document.querySelector("#admin-ranking-body"),
    adminMessage: document.querySelector("#admin-message"),
    adminHomeButton: document.querySelector("#admin-home-button"),
  };

  let currentStage = stages.tutorial;
  let seeds = new Set();
  let active = new Set();
  let running = false;
  let timer = null;
  let cleared = false;
  let scoreSubmitted = false;
  let rankings = loadRankings();
  let previewTimer = null;
  let gameInitialized = false;
  let adminSequenceInput = "";
  let adminViewOpen = false;

  function defaultRankings() {
    return {
        open: [],
        gates: [],
        islands: [],
    };
  }

  function loadRankings() {
    const defaults = defaultRankings();
    try {
      const saved = localStorage.getItem(RANKING_STORAGE_KEY);
      if (!saved) return defaults;
      const parsed = JSON.parse(saved);
      delete parsed.tutorial;
      for (const stageId of Object.keys(defaults)) {
        if (!Array.isArray(parsed[stageId])) parsed[stageId] = defaults[stageId];
        parsed[stageId] = parsed[stageId]
          .filter((entry) => entry && typeof entry.nickname === "string" && Number.isFinite(entry.count))
          .slice(0, 100);
      }
      return parsed;
    } catch (error) {
      console.error("랭킹 데이터를 불러오지 못했습니다.", error);
      return defaults;
    }
  }

  function saveRankings() {
    try {
      localStorage.setItem(RANKING_STORAGE_KEY, JSON.stringify(rankings));
      return true;
    } catch (error) {
      console.error("랭킹 데이터를 저장하지 못했습니다.", error);
      elements.message.textContent = "랭킹을 브라우저에 저장하지 못했습니다. 저장 공간 설정을 확인해 주세요.";
      return false;
    }
  }

  function renderGrid() {
    const { size } = currentStage;
    elements.grid.replaceChildren();
    elements.grid.style.setProperty("--grid-size", size);
    elements.grid.setAttribute("aria-label", `${size} 곱하기 ${size} 게임 격자`);

    for (let index = 0; index < size * size; index += 1) {
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "cell";
      cell.dataset.index = String(index);
      cell.setAttribute("role", "gridcell");
      const row = Math.floor(index / size) + 1;
      const column = (index % size) + 1;

      if (currentStage.walls.includes(index)) {
        cell.classList.add("wall");
        cell.disabled = true;
        cell.setAttribute("aria-label", `${row}행 ${column}열, 장애물`);
      } else {
        if (currentStage.guides.includes(index) && seeds.size === 0 && !cleared) {
          cell.classList.add("guide");
        }
        cell.addEventListener("click", () => toggleSeed(index));
        cell.setAttribute("aria-label", `${row}행 ${column}열, ${getCellState(index)}`);
      }

      updateCell(cell, index);
      elements.grid.append(cell);
    }
    updateProgress();
  }

  function getCellState(index) {
    if (seeds.has(index)) return "내 초기 활성 칸";
    if (active.has(index)) return "확산된 칸";
    if (currentStage.preset.includes(index)) return "처음 활성 칸";
    return "비활성 칸";
  }

  function updateCell(cell, index) {
    if (currentStage.walls.includes(index)) return;
    cell.classList.toggle("seed", seeds.has(index));
    cell.classList.toggle("spread", active.has(index) && !seeds.has(index) && !currentStage.preset.includes(index));
    cell.classList.toggle("preset", active.has(index) && currentStage.preset.includes(index));
    cell.setAttribute("aria-label", `${Math.floor(index / currentStage.size) + 1}행 ${(index % currentStage.size) + 1}열, ${getCellState(index)}`);
    cell.disabled = running || cleared;
  }

  function renderRankings() {
    elements.rankingPanel.hidden = currentStage.size !== 8;
    if (currentStage.size !== 8) return;
    const entries = [...(rankings[currentStage.id] || [])]
      .sort((a, b) => a.count - b.count || a.nickname.localeCompare(b.nickname))
      .slice(0, 10);
    elements.rankingStage.textContent = currentStage.title;
    elements.rankingBody.replaceChildren();
    if (entries.length === 0) {
      const row = document.createElement("tr");
      const cell = document.createElement("td");
      cell.colSpan = 3;
      cell.textContent = "아직 등록된 기록이 없습니다.";
      row.append(cell);
      elements.rankingBody.append(row);
      return;
    }

    entries.forEach((entry, index) => {
      const row = document.createElement("tr");
      const rank = document.createElement("td");
      const nickname = document.createElement("td");
      const count = document.createElement("td");
      rank.textContent = String(index + 1).padStart(2, "0");
      nickname.textContent = entry.nickname;
      count.textContent = `${entry.count}칸`;
      row.append(rank, nickname, count);
      elements.rankingBody.append(row);
    });
  }

  function updateProgress() {
    const fillable = currentStage.size * currentStage.size - currentStage.walls.length;
    const activated = active.size;
    const percent = Math.floor((activated / fillable) * 100);
    elements.progressValue.textContent = `${percent}%`;
    elements.progressBar.style.width = `${percent}%`;
    elements.seedCount.textContent = String(seeds.size);
  }

  function updateButtons() {
    elements.startButton.disabled = running || cleared || seeds.size === 0;
    elements.stopButton.hidden = !running;
    elements.restoreButton.disabled = running || seeds.size === 0;
    elements.resetButton.disabled = running && !cleared;
    elements.stageSelect.disabled = running;
    elements.grid.setAttribute("aria-disabled", String(running || cleared));
    elements.grid.querySelectorAll(".cell").forEach((cell) => {
      if (!cell.classList.contains("wall")) cell.disabled = running || cleared;
    });
  }

  function updateStageDisplay() {
    elements.stageTitle.textContent = currentStage.title;
    elements.stageKind.textContent = currentStage.kind;
    elements.stageDescription.textContent = currentStage.description;
    elements.stagePickerWrap.hidden = currentStage.id === "tutorial";
    elements.scoreForm.hidden = currentStage.size !== 8;
    renderRankings();
  }

  function toggleSeed(index) {
    if (running || cleared || currentStage.walls.includes(index)) return;
    if (seeds.has(index)) {
      seeds.delete(index);
      active.delete(index);
    } else {
      if (active.has(index)) return;
      seeds.add(index);
      active.add(index);
    }
    elements.message.textContent = "";
    renderGrid();
    updateButtons();
  }

  function findNextWave() {
    const next = [];
    for (let index = 0; index < currentStage.size * currentStage.size; index += 1) {
      if (currentStage.walls.includes(index) || active.has(index)) continue;
      const row = Math.floor(index / currentStage.size);
      const column = index % currentStage.size;
      let activeNeighbors = 0;
      if (row > 0 && active.has(index - currentStage.size)) activeNeighbors += 1;
      if (row < currentStage.size - 1 && active.has(index + currentStage.size)) activeNeighbors += 1;
      if (column > 0 && active.has(index - 1)) activeNeighbors += 1;
      if (column < currentStage.size - 1 && active.has(index + 1)) activeNeighbors += 1;
      if (activeNeighbors >= 2) next.push(index);
    }
    return next;
  }

  function startSpread() {
    if (running || cleared || seeds.size === 0) return;
    active = new Set([...seeds, ...currentStage.preset]);
    running = true;
    elements.message.textContent = "확산 중…";
    renderGrid();
    updateButtons();
    timer = window.setInterval(() => {
      const next = findNextWave();
      if (next.length === 0) {
        stopSpread();
        const fillable = currentStage.size * currentStage.size - currentStage.walls.length;
        if (active.size === fillable) {
          finishStage();
        } else {
          elements.message.textContent = "더 이상 확산되지 않습니다. 초기 배치를 바꾸거나 복구해 보세요.";
        }
        return;
      }

      next.forEach((index) => active.add(index));
      renderGrid();
      const fillable = currentStage.size * currentStage.size - currentStage.walls.length;
      if (active.size === fillable) finishStage();
    }, 400);
  }

  function stopSpread() {
    if (timer !== null) window.clearInterval(timer);
    timer = null;
    running = false;
    updateButtons();
  }

  function finishStage() {
    stopSpread();
    cleared = true;
    elements.clearPanel.hidden = false;
    elements.clearMessage.textContent = `클리어! 총 ${seeds.size}칸을 사용했습니다.`;
    elements.scoreForm.hidden = scoreSubmitted || currentStage.size !== 8;
    elements.nextStageButton.hidden = currentStage.id !== "tutorial";
    elements.message.textContent = "모든 칸이 활성화되었습니다!";
    renderGrid();
    updateButtons();
  }

  function restorePlacement() {
    stopSpread();
    active = new Set([...seeds, ...currentStage.preset]);
    cleared = false;
    scoreSubmitted = false;
    elements.clearPanel.hidden = true;
    elements.scoreForm.hidden = false;
    elements.message.textContent = "처음 선택한 배치로 돌아왔습니다.";
    renderGrid();
    updateButtons();
  }

  function resetStage() {
    stopSpread();
    seeds = new Set();
    active = new Set(currentStage.preset);
    cleared = false;
    scoreSubmitted = false;
    elements.clearPanel.hidden = true;
    elements.scoreForm.hidden = false;
    elements.message.textContent = "초기 상태로 돌아왔습니다.";
    renderGrid();
    updateButtons();
  }

  function selectStage(stageId) {
    const nextStage = stages[stageId];
    if (!nextStage || nextStage.id === currentStage.id) return;
    stopSpread();
    currentStage = nextStage;
    seeds = new Set();
    active = new Set(currentStage.preset);
    cleared = false;
    scoreSubmitted = false;
    elements.clearPanel.hidden = true;
    elements.scoreForm.hidden = false;
    elements.message.textContent = "";
    updateStageDisplay();
    renderGrid();
    updateButtons();
  }

  function registerScore(event) {
    event.preventDefault();
    if (!cleared || scoreSubmitted || currentStage.size !== 8) return;
    const nickname = elements.nickname.value.trim();
    if (!nickname) {
      elements.nickname.focus();
      return;
    }
    if (!rankings[currentStage.id]) rankings[currentStage.id] = [];
    rankings[currentStage.id].push({ nickname, count: seeds.size });
    rankings[currentStage.id].sort((a, b) => a.count - b.count || a.nickname.localeCompare(b.nickname));
    rankings[currentStage.id] = rankings[currentStage.id].slice(0, 100);
    if (!saveRankings()) return;

    scoreSubmitted = true;
    elements.scoreForm.hidden = true;
    elements.message.textContent = "기록을 랭킹에 등록했습니다.";
    elements.nickname.value = "";
    renderRankings();
  }

  function createPreview() {
    const cells = [];
    for (let index = 0; index < 9; index += 1) {
      const cell = document.createElement("span");
      cell.className = "preview-cell";
      cell.setAttribute("aria-hidden", "true");
      elements.previewGrid.append(cell);
      cells.push(cell);
    }

    const schedule = [0, 4, 1, 3, 5, 7, 2, 6, 8];
    const seedIndexes = new Set([0, 4]);
    let step = 0;
    function animate() {
      cells.forEach((cell) => cell.classList.remove("seed", "spread"));
      schedule.slice(0, Math.min(step, schedule.length)).forEach((index) => {
        cells[index].classList.add(seedIndexes.has(index) ? "seed" : "spread");
      });
      step = step >= schedule.length ? 0 : step + 1;
    }
    animate();
    previewTimer = window.setInterval(animate, 520);
  }

  function setup() {
    Object.values(stages).filter((stage) => stage.size === 8).forEach((stage) => {
      const option = document.createElement("option");
      option.value = stage.id;
      option.textContent = stage.title;
      elements.stageSelect.append(option);
    });

    elements.startButton.addEventListener("click", startSpread);
    elements.stopButton.addEventListener("click", () => {
      stopSpread();
      elements.message.textContent = "확산을 멈췄습니다. 복구하거나 계속 준비할 수 있습니다.";
    });
    elements.restoreButton.addEventListener("click", restorePlacement);
    elements.resetButton.addEventListener("click", resetStage);
    elements.stageSelect.addEventListener("change", (event) => selectStage(event.target.value));
    elements.scoreForm.addEventListener("submit", registerScore);
    elements.nextStageButton.addEventListener("click", () => {
      elements.stageSelect.value = "open";
      selectStage("open");
    });

    active = new Set(currentStage.preset);
    updateStageDisplay();
    renderGrid();
    updateButtons();
    createPreview();
    gameInitialized = true;
  }

  function renderAdminRankings() {
    elements.adminRankingBody.replaceChildren();
    const entries = Object.values(stages).filter((stage) => stage.size === 8).flatMap((stage) => {
      const sorted = (rankings[stage.id] || [])
        .map((entry, recordIndex) => ({ entry, recordIndex }))
        .sort((a, b) => a.entry.count - b.entry.count || a.entry.nickname.localeCompare(b.entry.nickname));
      return sorted.map(({ entry, recordIndex }, index) => ({
        stageId: stage.id,
        stage: stage.title,
        rank: index + 1,
        recordIndex,
        ...entry,
      }));
    });

    if (entries.length === 0) {
      const row = document.createElement("tr");
      const cell = document.createElement("td");
      cell.colSpan = 5;
      cell.textContent = "저장된 랭킹이 없습니다.";
      row.append(cell);
      elements.adminRankingBody.append(row);
      return;
    }

    entries.forEach((entry) => {
      const row = document.createElement("tr");
      [entry.stage, String(entry.rank).padStart(2, "0"), entry.nickname, `${entry.count}칸`]
        .forEach((value) => {
          const cell = document.createElement("td");
          cell.textContent = value;
          row.append(cell);
        });
      const actionCell = document.createElement("td");
      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "button button-row-delete";
      deleteButton.textContent = "삭제";
      deleteButton.setAttribute("aria-label", `${entry.stage} ${entry.nickname} ${entry.count}칸 기록 삭제`);
      deleteButton.addEventListener("click", () => deleteRanking(entry.stageId, entry.recordIndex));
      actionCell.append(deleteButton);
      row.append(actionCell);
      elements.adminRankingBody.append(row);
    });
  }

  function deleteRanking(stageId, recordIndex) {
    const records = rankings[stageId];
    const entry = records && records[recordIndex];
    if (!entry) {
      elements.adminMessage.textContent = "삭제할 랭킹 기록을 찾을 수 없습니다.";
      renderAdminRankings();
      return;
    }

    const stage = stages[stageId];
    if (!window.confirm(`${stage.title}의 ${entry.nickname} (${entry.count}칸) 기록을 삭제할까요?`)) return;

    const updatedRankings = {
      ...rankings,
      [stageId]: records.filter((_, index) => index !== recordIndex),
    };
    try {
      localStorage.setItem(RANKING_STORAGE_KEY, JSON.stringify(updatedRankings));
      rankings = updatedRankings;
      renderAdminRankings();
      renderRankings();
      elements.adminMessage.textContent = `${entry.nickname}의 랭킹 기록을 삭제했습니다.`;
    } catch (error) {
      console.error("랭킹 기록을 삭제하지 못했습니다.", error);
      elements.adminMessage.textContent = "랭킹 삭제에 실패했습니다. 브라우저 저장 공간을 확인해 주세요.";
    }
  }

  function enterAdmin() {
    if (gameInitialized) stopSpread();
    adminViewOpen = true;
    elements.gameView.hidden = true;
    elements.adminView.hidden = false;
    elements.adminMessage.textContent = "";
    renderAdminRankings();
  }

  function exitAdmin() {
    adminViewOpen = false;
    adminSequenceInput = "";
    elements.gameView.hidden = true;
    elements.adminView.hidden = true;
    elements.gameView.hidden = false;
    if (!gameInitialized) setup();
  }

  function handleAdminSequence(event) {
    if (event.ctrlKey || event.altKey || event.metaKey || event.key.length !== 1) return;
    const target = event.target;
    if (target instanceof HTMLElement && (
      target.isContentEditable ||
      target.closest("input, textarea, select, [contenteditable='true']")
    )) {
      adminSequenceInput = "";
      return;
    }

    adminSequenceInput = `${adminSequenceInput}${event.key.toLowerCase()}`.slice(-ADMIN_SEQUENCE.length);
    if (adminSequenceInput === ADMIN_SEQUENCE) {
      event.preventDefault();
      adminSequenceInput = "";
      enterAdmin();
    }
  }

  elements.adminHomeButton.addEventListener("click", exitAdmin);
  window.addEventListener("keydown", handleAdminSequence);

  window.addEventListener("beforeunload", () => {
    if (timer !== null) window.clearInterval(timer);
    if (previewTimer !== null) window.clearInterval(previewTimer);
  });

  setup();
})();

