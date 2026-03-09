// ===================== 数独核心算法 =====================

function isValid(board, row, col, num) {
  for (let i = 0; i < 9; i++) {
    if (board[row][i] === num) return false;
    if (board[i][col] === num) return false;
  }
  const br = Math.floor(row / 3) * 3;
  const bc = Math.floor(col / 3) * 3;
  for (let r = br; r < br + 3; r++) {
    for (let c = bc; c < bc + 3; c++) {
      if (board[r][c] === num) return false;
    }
  }
  return true;
}

function solve(board) {
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      if (board[r][c] === 0) {
        const nums = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]);
        for (const n of nums) {
          if (isValid(board, r, c, n)) {
            board[r][c] = n;
            if (solve(board)) return true;
            board[r][c] = 0;
          }
        }
        return false;
      }
    }
  }
  return true;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function generateBoard() {
  const board = Array.from({ length: 9 }, () => Array(9).fill(0));
  solve(board);
  return board;
}

function createPuzzle(solution, difficulty) {
  const removeCounts = { easy: 36, medium: 46, hard: 54 };
  const removeCount = removeCounts[difficulty] || 36;
  const puzzle = solution.map(row => [...row]);
  const positions = shuffle(
    Array.from({ length: 81 }, (_, i) => [Math.floor(i / 9), i % 9])
  );
  let removed = 0;
  for (const [r, c] of positions) {
    if (removed >= removeCount) break;
    puzzle[r][c] = 0;
    removed++;
  }
  return puzzle;
}

// ===================== 游戏状态 =====================

let solution = null;
let puzzle = null;
let playerBoard = null;
let givenCells = null;
let selectedCell = null;
let timerInterval = null;
let seconds = 0;
let difficulty = 'easy';
let gameOver = false;
let hintCount = 3;
let paused = false;

// ===================== DOM =====================

const boardEl = document.getElementById('board');
const timerEl = document.getElementById('timer');
const messageEl = document.getElementById('message');
const modalEl = document.getElementById('modal');
const modalTitle = document.getElementById('modalTitle');
const modalText = document.getElementById('modalText');
const modalBtn = document.getElementById('modalBtn');

// ===================== 初始化棋盘 =====================

function initBoard() {
  boardEl.innerHTML = '';
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.dataset.row = r;
      cell.dataset.col = c;
      cell.tabIndex = 0;
      cell.addEventListener('click', () => selectCell(r, c));
      boardEl.appendChild(cell);
    }
  }
}

function renderBoard() {
  const cells = boardEl.querySelectorAll('.cell');
  // 统计每个数字的出现次数
  const numCounts = Array(10).fill(0);
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      if (playerBoard[r][c] !== 0) numCounts[playerBoard[r][c]]++;
    }
  }

  cells.forEach(cell => {
    const r = +cell.dataset.row;
    const c = +cell.dataset.col;
    const val = playerBoard[r][c];

    cell.textContent = val || '';
    cell.className = 'cell';
    cell.dataset.row = r;
    cell.dataset.col = c;

    if (givenCells[r][c]) {
      cell.classList.add('given');
    } else if (val !== 0) {
      cell.classList.add('filled');
      // 检查是否有冲突
      if (!isValidPlacement(r, c, val)) {
        cell.classList.add('error');
      }
    }

    // 高亮
    if (selectedCell) {
      const [sr, sc] = selectedCell;
      if (r === sr && c === sc) {
        cell.classList.add('selected');
      } else if (r === sr || c === sc ||
        (Math.floor(r / 3) === Math.floor(sr / 3) && Math.floor(c / 3) === Math.floor(sc / 3))) {
        cell.classList.add('highlighted');
      }
      // 相同数字高亮
      const selectedVal = playerBoard[sr][sc];
      if (selectedVal !== 0 && val === selectedVal && !(r === sr && c === sc)) {
        cell.classList.add('same-number');
      }
    }
  });

  // 更新数字键盘（已填满9个的数字变灰）
  document.querySelectorAll('.num-btn').forEach(btn => {
    const n = +btn.dataset.num;
    if (n >= 1 && n <= 9) {
      btn.classList.toggle('completed', numCounts[n] >= 9);
    }
  });
}

function isValidPlacement(row, col, num) {
  for (let i = 0; i < 9; i++) {
    if (i !== col && playerBoard[row][i] === num) return false;
    if (i !== row && playerBoard[i][col] === num) return false;
  }
  const br = Math.floor(row / 3) * 3;
  const bc = Math.floor(col / 3) * 3;
  for (let r = br; r < br + 3; r++) {
    for (let c = bc; c < bc + 3; c++) {
      if (!(r === row && c === col) && playerBoard[r][c] === num) return false;
    }
  }
  return true;
}

// ===================== 交互 =====================

function selectCell(r, c) {
  if (gameOver || paused) return;
  selectedCell = [r, c];
  renderBoard();
}

function placeNumber(num) {
  if (!selectedCell || gameOver || paused) return;
  const [r, c] = selectedCell;
  if (givenCells[r][c]) return;

  playerBoard[r][c] = num;
  renderBoard();
  saveGame();

  // 检查是否完成
  if (num !== 0 && isBoardFull()) {
    if (checkWin()) {
      gameOver = true;
      stopTimer();
      const diffName = { easy: '简单', medium: '中等', hard: '困难' }[difficulty];
      const isNew = saveBestTime(difficulty, seconds);
      renderBestTimes(isNew ? difficulty : null);
      const extra = isNew ? '\n新纪录！' : '';
      showModal('恭喜通关！', `用时 ${timerEl.textContent}，难度：${diffName}${extra}`);
    }
  }
}

function isBoardFull() {
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      if (playerBoard[r][c] === 0) return false;
    }
  }
  return true;
}

function checkWin() {
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      if (playerBoard[r][c] !== solution[r][c]) return false;
    }
  }
  return true;
}

// ===================== 计时器 =====================

function startTimer() {
  stopTimer();
  seconds = 0;
  updateTimerDisplay();
  timerInterval = setInterval(() => {
    seconds++;
    updateTimerDisplay();
  }, 1000);
}

function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

function updateTimerDisplay() {
  const m = String(Math.floor(seconds / 60)).padStart(2, '0');
  const s = String(seconds % 60).padStart(2, '0');
  timerEl.textContent = `${m}:${s}`;
}

// ===================== 最佳记录 =====================

function formatTime(s) {
  const m = String(Math.floor(s / 60)).padStart(2, '0');
  const sec = String(s % 60).padStart(2, '0');
  return `${m}:${sec}`;
}

function getBestTimes() {
  try {
    return JSON.parse(localStorage.getItem('sudoku-best')) || {};
  } catch { return {}; }
}

function saveBestTime(diff, secs) {
  const best = getBestTimes();
  const isNew = !(diff in best) || secs < best[diff];
  if (isNew) {
    best[diff] = secs;
    localStorage.setItem('sudoku-best', JSON.stringify(best));
  }
  return isNew;
}

function renderBestTimes(newRecordDiff) {
  const best = getBestTimes();
  ['easy', 'medium', 'hard'].forEach(d => {
    const el = document.getElementById('best-' + d);
    el.textContent = (d in best) ? formatTime(best[d]) : '--:--';
    el.classList.remove('new-record');
    if (d === newRecordDiff) {
      el.classList.add('new-record');
    }
  });
}

// ===================== 弹窗 =====================

function showModal(title, text) {
  modalTitle.textContent = title;
  modalText.textContent = text;
  modalEl.hidden = false;
}

modalBtn.addEventListener('click', () => {
  modalEl.hidden = true;
});

modalEl.addEventListener('click', (e) => {
  if (e.target === modalEl) modalEl.hidden = true;
});

// ===================== 暂停 =====================

document.getElementById('pause').addEventListener('click', () => {
  if (gameOver) return;
  paused = !paused;
  const btn = document.getElementById('pause');
  btn.textContent = paused ? '继续' : '暂停';
  boardEl.classList.toggle('paused', paused);
  if (paused) {
    stopTimer();
  } else {
    timerInterval = setInterval(() => { seconds++; updateTimerDisplay(); }, 1000);
  }
});

// ===================== 存档 =====================

function saveGame() {
  const data = {
    solution, puzzle, playerBoard, givenCells,
    seconds, difficulty, gameOver, hintCount
  };
  localStorage.setItem('sudoku-save', JSON.stringify(data));
}

function loadGame() {
  const raw = localStorage.getItem('sudoku-save');
  if (!raw) return false;
  try {
    const data = JSON.parse(raw);
    solution = data.solution;
    puzzle = data.puzzle;
    playerBoard = data.playerBoard;
    givenCells = data.givenCells;
    seconds = data.seconds;
    difficulty = data.difficulty;
    gameOver = data.gameOver;
    hintCount = data.hintCount;
    return true;
  } catch { return false; }
}

// ===================== 操作按钮 =====================

document.getElementById('newGame').addEventListener('click', () => {
  localStorage.removeItem('sudoku-save');
  startGame();
});

document.getElementById('check').addEventListener('click', () => {
  if (gameOver || paused) return;
  let errors = 0;
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      if (playerBoard[r][c] !== 0 && playerBoard[r][c] !== solution[r][c]) {
        errors++;
      }
    }
  }
  if (errors === 0) {
    messageEl.textContent = '目前没有错误，继续加油！';
  } else {
    messageEl.textContent = `发现 ${errors} 个错误`;
  }
  setTimeout(() => { messageEl.textContent = ''; }, 3000);
});

document.getElementById('hint').addEventListener('click', () => {
  if (gameOver || paused) return;
  if (hintCount <= 0) {
    messageEl.textContent = '提示次数已用完';
    setTimeout(() => { messageEl.textContent = ''; }, 2000);
    return;
  }

  // 找一个空格填入正确答案
  const emptyCells = [];
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      if (playerBoard[r][c] === 0) emptyCells.push([r, c]);
    }
  }
  if (emptyCells.length === 0) return;

  const [r, c] = emptyCells[Math.floor(Math.random() * emptyCells.length)];
  playerBoard[r][c] = solution[r][c];
  givenCells[r][c] = true;
  hintCount--;

  selectedCell = [r, c];
  renderBoard();
  saveGame();

  // 闪烁动画
  const idx = r * 9 + c;
  const cell = boardEl.children[idx];
  cell.classList.add('hint-cell');
  setTimeout(() => cell.classList.remove('hint-cell'), 600);

  messageEl.textContent = `剩余提示：${hintCount} 次`;
  setTimeout(() => { messageEl.textContent = ''; }, 2000);

  if (isBoardFull() && checkWin()) {
    gameOver = true;
    stopTimer();
    const diffName = { easy: '简单', medium: '中等', hard: '困难' }[difficulty];
    const isNew = saveBestTime(difficulty, seconds);
    renderBestTimes(isNew ? difficulty : null);
    const extra = isNew ? '\n新纪录！' : '';
    showModal('恭喜通关！', `用时 ${timerEl.textContent}，难度：${diffName}${extra}`);
  }
});

// ===================== 难度选择 =====================

document.querySelectorAll('.diff-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.diff-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    difficulty = btn.dataset.diff;
    startGame();
  });
});

// ===================== 数字键盘 =====================

document.querySelectorAll('.num-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    placeNumber(+btn.dataset.num);
  });
});

// ===================== 键盘支持 =====================

document.addEventListener('keydown', (e) => {
  if (gameOver) return;

  if (e.key >= '1' && e.key <= '9') {
    placeNumber(+e.key);
    return;
  }
  if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') {
    placeNumber(0);
    return;
  }

  if (!selectedCell) return;
  let [r, c] = selectedCell;

  if (e.key === 'ArrowUp' && r > 0) r--;
  else if (e.key === 'ArrowDown' && r < 8) r++;
  else if (e.key === 'ArrowLeft' && c > 0) c--;
  else if (e.key === 'ArrowRight' && c < 8) c++;
  else return;

  e.preventDefault();
  selectCell(r, c);
});

// ===================== 开始游戏 =====================

function startGame() {
  solution = generateBoard();
  puzzle = createPuzzle(solution, difficulty);
  playerBoard = puzzle.map(row => [...row]);
  givenCells = puzzle.map(row => row.map(v => v !== 0));
  selectedCell = null;
  gameOver = false;
  hintCount = 3;
  paused = false;
  document.getElementById('pause').textContent = '暂停';
  boardEl.classList.remove('paused');
  messageEl.textContent = '';
  modalEl.hidden = true;
  // 同步难度按钮
  document.querySelectorAll('.diff-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.diff === difficulty);
  });
  initBoard();
  renderBoard();
  renderBestTimes();
  startTimer();
  saveGame();
}

function resumeGame() {
  selectedCell = null;
  paused = false;
  document.getElementById('pause').textContent = '暂停';
  boardEl.classList.remove('paused');
  messageEl.textContent = '';
  modalEl.hidden = true;
  document.querySelectorAll('.diff-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.diff === difficulty);
  });
  initBoard();
  renderBoard();
  renderBestTimes();
  updateTimerDisplay();
  if (!gameOver) {
    stopTimer();
    timerInterval = setInterval(() => { seconds++; updateTimerDisplay(); }, 1000);
  }
}

// 启动：优先恢复存档
if (loadGame()) {
  resumeGame();
} else {
  startGame();
}
