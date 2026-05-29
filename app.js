/**
 * Pintoo — 線上拼圖工具
 */

const DIFFICULTIES = [
  { name: "非常簡單", label: "3×3", rows: 3, cols: 3 },
  { name: "簡單", label: "4×4", rows: 4, cols: 4 },
  { name: "普通", label: "6×6", rows: 6, cols: 6 },
  { name: "困難", label: "8×8", rows: 8, cols: 8 },
  { name: "專家", label: "12×12", rows: 12, cols: 12 },
];

const SAMPLE_IMAGE =
  "data:image/svg+xml," +
  encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600">
    <defs>
      <linearGradient id="g1" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style="stop-color:#6c8cff"/>
        <stop offset="50%" style="stop-color:#a78bfa"/>
        <stop offset="100%" style="stop-color:#f472b6"/>
      </linearGradient>
    </defs>
    <rect width="800" height="600" fill="url(#g1)"/>
    <circle cx="200" cy="180" r="80" fill="rgba(255,255,255,0.2)"/>
    <circle cx="600" cy="400" r="120" fill="rgba(255,255,255,0.15)"/>
    <text x="400" y="310" text-anchor="middle" font-family="sans-serif" font-size="72" font-weight="bold" fill="white" opacity="0.9">Pintoo</text>
    <text x="400" y="370" text-anchor="middle" font-family="sans-serif" font-size="28" fill="white" opacity="0.7">線上拼圖</text>
  </svg>`);

const SNAP_DISTANCE = 28;
const MOBILE_BREAKPOINT = 768;
const TAB_SIZE_RATIO = 0.22;
const PIECE_PADDING_RATIO = 0.35;

/** @type {HTMLCanvasElement} */
const sourceCanvas = document.getElementById("sourceCanvas");
const sourceCtx = sourceCanvas.getContext("2d");

const els = {
  uploadScreen: document.getElementById("uploadScreen"),
  gameScreen: document.getElementById("gameScreen"),
  dropzone: document.getElementById("dropzone"),
  fileInput: document.getElementById("fileInput"),
  difficulty: document.getElementById("difficulty"),
  difficultyLabel: document.getElementById("difficultyLabel"),
  difficultyHints: document.getElementById("difficultyHints"),
  showEdges: document.getElementById("showEdges"),
  startFromSample: document.getElementById("startFromSample"),
  board: document.getElementById("board"),
  boardGrid: document.getElementById("boardGrid"),
  referenceImage: document.getElementById("referenceImage"),
  trayPieces: document.getElementById("trayPieces"),
  trayHint: document.getElementById("trayHint"),
  headerStats: document.getElementById("headerStats"),
  timerStat: document.getElementById("timerStat"),
  progressStat: document.getElementById("progressStat"),
  btnNewImage: document.getElementById("btnNewImage"),
  btnRestart: document.getElementById("btnRestart"),
  btnShuffle: document.getElementById("btnShuffle"),
  btnHint: document.getElementById("btnHint"),
  difficultyGame: document.getElementById("difficultyGame"),
  difficultyLabelGame: document.getElementById("difficultyLabelGame"),
  btnApplyDifficulty: document.getElementById("btnApplyDifficulty"),
  btnMobileSettings: document.getElementById("btnMobileSettings"),
  toolbarSettings: document.getElementById("toolbarSettings"),
  referenceSheet: document.getElementById("referenceSheet"),
  referenceSheetImage: document.getElementById("referenceSheetImage"),
  referenceSheetBackdrop: document.getElementById("referenceSheetBackdrop"),
  referenceSheetClose: document.getElementById("referenceSheetClose"),
  winModal: document.getElementById("winModal"),
  winMessage: document.getElementById("winMessage"),
  btnPlayAgain: document.getElementById("btnPlayAgain"),
  btnNewImageModal: document.getElementById("btnNewImageModal"),
  dragLayer: document.getElementById("dragLayer"),
};

let dragListenersBound = false;
let highlightThrottle = 0;

/** @type {GameState} */
let state = createInitialState();

function createInitialState() {
  return {
    image: null,
    imageSrc: null,
    rows: 6,
    cols: 6,
    pieceWidth: 0,
    pieceHeight: 0,
    tabSize: 0,
    pieceCanvasSize: 0,
    boardWidth: 0,
    boardHeight: 0,
    pieces: [],
    slots: [],
    slotMap: null,
    pieceMap: null,
    slotGeometry: null,
    highlightedSlot: null,
    placedCount: 0,
    timerInterval: null,
    startTime: null,
    elapsed: 0,
    showEdges: true,
    dragging: null,
    edgeMap: null,
  };
}

// ——— Difficulty UI ———

function getDifficultyIndex() {
  return parseInt(els.difficulty.value, 10);
}

function syncDifficultyUI(index) {
  const d = DIFFICULTIES[index];
  els.difficulty.value = String(index);
  els.difficultyGame.value = String(index);
  els.difficultyLabel.textContent = `${d.name} · ${d.label}`;
  els.difficultyLabelGame.textContent = d.label;

  els.difficultyHints.querySelectorAll("li").forEach((li) => {
    li.classList.toggle("active", li.dataset.level === String(index));
  });
}

function bindDifficultyInputs() {
  const onChange = (e) => {
    const index = parseInt(e.target.value, 10);
    syncDifficultyUI(index);
  };
  els.difficulty.addEventListener("input", onChange);
  els.difficultyGame.addEventListener("input", onChange);
  syncDifficultyUI(getDifficultyIndex());
}

// ——— Layout helpers ———

function isMobileLayout() {
  return window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`).matches;
}

function getSnapDistance() {
  return isMobileLayout() ? 44 : SNAP_DISTANCE;
}

function syncLayoutMode() {
  document.body.classList.toggle("mobile-layout", isMobileLayout());
}

function openReferenceSheet() {
  if (!state.imageSrc) return;
  els.referenceSheetImage.src = state.imageSrc;
  els.referenceSheet.hidden = false;
  document.body.classList.add("sheet-open");
}

function closeReferenceSheet() {
  els.referenceSheet.hidden = true;
  document.body.classList.remove("sheet-open");
}

// ——— Image loading ———

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("無法載入圖片"));
    img.src = src;
  });
}

function prepareSourceImage(img) {
  const mobile = isMobileLayout();
  let maxBoard;
  let maxHeight;

  if (mobile) {
    const pad = 20;
    maxBoard = window.innerWidth - pad * 2;
    const poolReserve = Math.min(window.innerHeight * 0.32, 240);
    const chrome = 52 + 56 + 48 + poolReserve;
    maxHeight = Math.max(180, window.innerHeight - chrome);
  } else {
    const pad = 48;
    const availW = window.innerWidth - pad * 2;
    const rightCol = Math.max(260, availW * 0.55 - 16);
    maxBoard = Math.min(640, rightCol);
    maxHeight = Math.min(520, window.innerHeight - 200);
  }

  let w = img.naturalWidth;
  let h = img.naturalHeight;
  const scale = Math.min(maxBoard / w, maxHeight / h, 1);
  w = Math.round(w * scale);
  h = Math.round(h * scale);

  sourceCanvas.width = w;
  sourceCanvas.height = h;
  sourceCtx.drawImage(img, 0, 0, w, h);

  state.image = img;
  state.imageSrc = sourceCanvas.toDataURL("image/png");
  state.boardWidth = w;
  state.boardHeight = h;
}

// ——— Jigsaw edge map ———
// horizontalEdges[row][col] = edge between piece (row,col) and (row,col+1), +1 = right has tab
// verticalEdges[row][col] = edge between piece (row,col) and (row+1,col), +1 = bottom has tab

function buildEdgeMap(rows, cols) {
  const horizontal = Array.from({ length: rows }, () =>
    Array.from({ length: cols - 1 }, () => (Math.random() > 0.5 ? 1 : -1))
  );
  const vertical = Array.from({ length: rows - 1 }, () =>
    Array.from({ length: cols }, () => (Math.random() > 0.5 ? 1 : -1))
  );
  return { horizontal, vertical };
}

function getPieceEdges(row, col, rows, cols, edgeMap) {
  const { horizontal, vertical } = edgeMap;

  let top = 0;
  let right = 0;
  let bottom = 0;
  let left = 0;

  if (row > 0) top = -vertical[row - 1][col];
  if (row < rows - 1) bottom = vertical[row][col];
  if (col > 0) left = -horizontal[row][col - 1];
  if (col < cols - 1) right = horizontal[row][col];

  return { top, right, bottom, left };
}

// ——— Jigsaw path drawing ———

function drawJigsawEdge(ctx, x1, y1, x2, y2, type) {
  if (type === 0) {
    ctx.lineTo(x2, y2);
    return;
  }

  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  const nx = -dy / len;
  const ny = dx / len;
  const sign = type > 0 ? 1 : -1;
  const tabDepth = len * TAB_SIZE_RATIO * sign;

  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;
  const neck = len * 0.12;

  const p1x = midX - (dx / len) * neck;
  const p1y = midY - (dy / len) * neck;
  const p2x = midX + (dx / len) * neck;
  const p2y = midY + (dy / len) * neck;

  ctx.lineTo(p1x, p1y);
  ctx.bezierCurveTo(
    p1x + nx * tabDepth * 0.5,
    p1y + ny * tabDepth * 0.5,
    midX + nx * tabDepth,
    midY + ny * tabDepth,
    p2x,
    p2y
  );
  ctx.lineTo(x2, y2);
}

function buildPiecePath(ctx, w, h, edges, padding) {
  const x0 = padding;
  const y0 = padding;
  const x1 = padding + w;
  const y1 = padding + h;

  ctx.beginPath();
  ctx.moveTo(x0, y0);
  drawJigsawEdge(ctx, x0, y0, x1, y0, edges.top);
  drawJigsawEdge(ctx, x1, y0, x1, y1, edges.right);
  drawJigsawEdge(ctx, x1, y1, x0, y1, edges.bottom);
  drawJigsawEdge(ctx, x0, y1, x0, y0, edges.left);
  ctx.closePath();
}

function createPieceCanvas(row, col, pieceW, pieceH, edges, showBorder) {
  const tabSize = Math.min(pieceW, pieceH) * TAB_SIZE_RATIO;
  const padding = tabSize * PIECE_PADDING_RATIO;
  const canvasW = Math.ceil(pieceW + padding * 2);
  const canvasH = Math.ceil(pieceH + padding * 2);

  const canvas = document.createElement("canvas");
  canvas.width = canvasW;
  canvas.height = canvasH;
  const ctx = canvas.getContext("2d");

  buildPiecePath(ctx, pieceW, pieceH, edges, padding);
  ctx.save();
  ctx.clip();

  const sx = col * pieceW;
  const sy = row * pieceH;
  ctx.drawImage(
    sourceCanvas,
    sx,
    sy,
    pieceW,
    pieceH,
    padding,
    padding,
    pieceW,
    pieceH
  );
  ctx.restore();

  if (showBorder) {
    buildPiecePath(ctx, pieceW, pieceH, edges, padding);
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    buildPiecePath(ctx, pieceW, pieceH, edges, padding);
    ctx.strokeStyle = "rgba(0,0,0,0.25)";
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  const img = document.createElement("img");
  img.src = canvas.toDataURL("image/png");
  img.width = canvasW;
  img.height = canvasH;
  img.draggable = false;
  img.alt = "";
  img.decoding = "async";

  return { img, width: canvasW, height: canvasH, padding };
}

// ——— Game setup ———

function clearPlayfield() {
  if (state.dragging) {
    endDragVisuals(state.dragging.el);
    state.dragging = null;
  }
  document.body.classList.remove("is-dragging");

  els.board.querySelectorAll(".piece").forEach((el) => el.remove());
  els.trayPieces.innerHTML = "";
  els.dragLayer.innerHTML = "";
  clearSlotHighlights();
}

function setupGame() {
  clearPlayfield();

  const index = getDifficultyIndex();
  const { rows, cols } = DIFFICULTIES[index];
  state.rows = rows;
  state.cols = cols;
  state.showEdges = els.showEdges.checked;
  state.placedCount = 0;
  state.pieces = [];
  state.slots = [];
  state.slotMap = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => null)
  );
  state.pieceMap = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => null)
  );
  state.slotGeometry = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => null)
  );
  state.highlightedSlot = null;
  state.edgeMap = buildEdgeMap(rows, cols);

  state.pieceWidth = Math.floor(state.boardWidth / cols);
  state.pieceHeight = Math.floor(state.boardHeight / rows);
  state.tabSize = Math.min(state.pieceWidth, state.pieceHeight) * TAB_SIZE_RATIO;

  els.board.style.width = `${state.boardWidth}px`;
  els.board.style.height = `${state.boardHeight}px`;
  els.boardGrid.style.gridTemplateColumns = `repeat(${cols}, ${state.pieceWidth}px)`;
  els.boardGrid.style.gridTemplateRows = `repeat(${rows}, ${state.pieceHeight}px)`;
  els.boardGrid.style.width = `${state.boardWidth}px`;
  els.boardGrid.style.height = `${state.boardHeight}px`;
  els.boardGrid.innerHTML = "";

  els.referenceImage.src = state.imageSrc;

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const slot = document.createElement("div");
      slot.className = "slot";
      slot.dataset.row = String(row);
      slot.dataset.col = String(col);
      els.boardGrid.appendChild(slot);

      const edges = getPieceEdges(row, col, rows, cols, state.edgeMap);
      const { img, width, height, padding } = createPieceCanvas(
        row,
        col,
        state.pieceWidth,
        state.pieceHeight,
        edges,
        state.showEdges
      );

      const pieceEl = document.createElement("div");
      pieceEl.className = "piece";
      pieceEl.dataset.row = String(row);
      pieceEl.dataset.col = String(col);
      pieceEl.appendChild(img);
      pieceEl.style.width = `${width}px`;
      pieceEl.style.height = `${height}px`;

      const piece = {
        row,
        col,
        element: pieceEl,
        img,
        width,
        height,
        padding,
        placed: false,
        slotEl: slot,
      };

      state.pieces.push(piece);
      state.pieceMap[row][col] = piece;
      const slotObj = { row, col, element: slot, piece: null };
      state.slots.push(slotObj);
      state.slotMap[row][col] = slotObj;

      enableDrag(piece);
    }
  }

  showGameScreen();
  startTimer();
  updateProgress();
  requestAnimationFrame(() => {
    updateSlotGeometry();
    requestAnimationFrame(() => shuffleTrayPieces());
  });
}

function updateSlotGeometry() {
  if (!state.slotMap) return;

  const boardRect = els.board.getBoundingClientRect();
  state.slotGeometry = Array.from({ length: state.rows }, () =>
    Array.from({ length: state.cols }, () => null)
  );

  for (let row = 0; row < state.rows; row++) {
    for (let col = 0; col < state.cols; col++) {
      const slot = state.slotMap[row][col];
      const piece = state.pieceMap[row][col];
      if (!slot || !piece) continue;

      const slotRect = slot.element.getBoundingClientRect();
      state.slotGeometry[row][col] = {
        cx: slotRect.left + slotRect.width / 2,
        cy: slotRect.top + slotRect.height / 2,
        threshold:
          getSnapDistance() + Math.min(slotRect.width, slotRect.height) * 0.4,
        boardLeft: slotRect.left - boardRect.left - piece.padding,
        boardTop: slotRect.top - boardRect.top - piece.padding,
      };
    }
  }

  clearSlotHighlights();
}

function getPoolBounds() {
  const pool = els.trayPieces;
  return {
    width: pool.clientWidth,
    height: pool.clientHeight,
  };
}

function positionPieceInPool(piece, x, y) {
  const { width: poolW, height: poolH } = getPoolBounds();
  const maxX = Math.max(0, poolW - piece.width);
  const maxY = Math.max(0, poolH - piece.height);
  const clampedX = Math.min(Math.max(0, x), maxX);
  const clampedY = Math.min(Math.max(0, y), maxY);
  piece.element.style.position = "absolute";
  piece.element.style.left = `${clampedX}px`;
  piece.element.style.top = `${clampedY}px`;
  piece.element.style.transform = "none";
}

function scatterPieceInPool(piece, index = 0, total = 1) {
  const { width: poolW, height: poolH } = getPoolBounds();
  if (poolW < 40 || poolH < 40) {
    requestAnimationFrame(() => scatterPieceInPool(piece, index, total));
    return;
  }

  if (isMobileLayout()) {
    const gap = 10;
    const startX = 12;
    const x = startX + index * (piece.width + gap);
    const y = Math.max(8, (poolH - piece.height) / 2);
    const contentWidth = x + piece.width + 12;
    els.trayPieces.style.minWidth = `${Math.max(poolW, contentWidth)}px`;
    positionPieceInPool(piece, x, y);
    return;
  }

  const cols = Math.max(1, Math.floor(poolW / (piece.width + 8)));
  const col = index % cols;
  const row = Math.floor(index / cols);
  const cellW = poolW / cols;
  const cellH = Math.max(piece.height + 8, poolH / Math.ceil(total / cols));

  const x = col * cellW + (cellW - piece.width) / 2 + (Math.random() - 0.5) * 12;
  const y = row * cellH + (cellH - piece.height) / 2 + (Math.random() - 0.5) * 12;
  positionPieceInPool(piece, x, y);
}

function shuffleTrayPieces() {
  const unplaced = state.pieces.filter((p) => !p.placed);
  els.trayPieces.style.minWidth = "";

  unplaced.forEach((piece, i) => {
    piece.element.classList.remove("placed");
    els.trayPieces.appendChild(piece.element);
    scatterPieceInPool(piece, i, unplaced.length);
  });

  els.trayHint.textContent =
    unplaced.length > 0
      ? isMobileLayout()
        ? `還有 ${unplaced.length} 片 · 左右滑動選片，拖到上方拼圖板`
        : `還有 ${unplaced.length} 片 · 拖曳到上方拼圖板`
      : "";
}

// ——— Drag & drop ———

function bindDragListeners() {
  if (dragListenersBound) return;
  dragListenersBound = true;

  document.addEventListener("pointermove", onGlobalPointerMove, { passive: true });
  document.addEventListener("pointerup", onGlobalPointerUp);
  document.addEventListener("pointercancel", onGlobalPointerUp);
}

function enableDrag(piece) {
  piece.element.addEventListener("pointerdown", (e) => startDrag(piece, e));
}

function startDrag(piece, e) {
  if (piece.placed || state.dragging) return;
  e.preventDefault();

  const el = piece.element;
  el.setPointerCapture(e.pointerId);
  document.body.classList.add("is-dragging");

  const rect = el.getBoundingClientRect();
  el.classList.add("dragging");
  el.style.position = "fixed";
  el.style.left = "0";
  el.style.top = "0";
  el.style.margin = "0";

  const offsetX = e.clientX - rect.left;
  const offsetY = e.clientY - rect.top;
  const x = e.clientX - offsetX;
  const y = e.clientY - offsetY;

  state.dragging = {
    piece,
    el,
    offsetX,
    offsetY,
    halfW: piece.width * 0.5,
    halfH: piece.height * 0.5,
    pointerId: e.pointerId,
    x,
    y,
  };

  els.dragLayer.appendChild(el);
  applyDragTransform(x, y);
  maybeHighlightWhileDrag(e.clientX, e.clientY, true);
}

function applyDragTransform(x, y) {
  const drag = state.dragging;
  if (!drag) return;
  drag.x = x;
  drag.y = y;
  drag.el.style.transform = `translate3d(${x}px,${y}px,0)`;
}

function onGlobalPointerMove(e) {
  const drag = state.dragging;
  if (!drag || e.pointerId !== drag.pointerId) return;

  const events = e.getCoalescedEvents?.() ?? [e];
  const last = events[events.length - 1];
  const x = last.clientX - drag.offsetX;
  const y = last.clientY - drag.offsetY;

  applyDragTransform(x, y);
  maybeHighlightWhileDrag(last.clientX, last.clientY);
}

function onGlobalPointerUp(e) {
  const drag = state.dragging;
  if (!drag || e.pointerId !== drag.pointerId) return;

  const { piece, el } = drag;
  el.releasePointerCapture(e.pointerId);
  endDragVisuals(el);

  clearSlotHighlights();

  const placed = trySnapPiece(piece, e.clientX, e.clientY);
  if (!placed) {
    returnPieceToPool(piece, e.clientX, e.clientY);
  }

  state.dragging = null;
}

function endDragVisuals(el) {
  el.classList.remove("dragging");
  document.body.classList.remove("is-dragging");
}

function maybeHighlightWhileDrag(clientX, clientY, force = false) {
  const now = performance.now();
  if (!force && now - highlightThrottle < 100) return;
  highlightThrottle = now;
  highlightNearestSlot(state.dragging.piece, clientX, clientY);
}

function getBoardSlotPosition(row, col) {
  const geo = state.slotGeometry?.[row]?.[col];
  if (geo) {
    return { left: geo.boardLeft, top: geo.boardTop };
  }

  const slot = state.slotMap?.[row]?.[col];
  const piece = state.pieceMap?.[row]?.[col];
  const boardRect = els.board.getBoundingClientRect();
  const slotRect = slot.element.getBoundingClientRect();
  return {
    left: slotRect.left - boardRect.left - piece.padding,
    top: slotRect.top - boardRect.top - piece.padding,
  };
}

function highlightNearestSlot(piece, clientX, clientY) {
  const drag = state.dragging;
  if (!drag) return;

  const slot = state.slotMap?.[piece.row]?.[piece.col];
  if (!slot || slot.piece) {
    clearSlotHighlights();
    return;
  }

  const geo = state.slotGeometry?.[piece.row]?.[piece.col];
  if (!geo) return;

  const pieceCenterX = clientX - drag.offsetX + drag.halfW;
  const pieceCenterY = clientY - drag.offsetY + drag.halfH;
  const dx = pieceCenterX - geo.cx;
  const dy = pieceCenterY - geo.cy;
  const shouldHighlight = dx * dx + dy * dy < geo.threshold * geo.threshold;

  if (!shouldHighlight) {
    clearSlotHighlights();
    return;
  }

  if (state.highlightedSlot !== slot) {
    clearSlotHighlights();
    state.highlightedSlot = slot;
    state.highlightedSlot.element.classList.add("highlight");
  }
}

function clearSlotHighlights() {
  if (state.highlightedSlot) {
    state.highlightedSlot.element.classList.remove("highlight");
    state.highlightedSlot = null;
  }
}

function findSnapTarget(piece, clientX, clientY) {
  const drag = state.dragging;
  if (!drag) return null;

  const slot = state.slotMap?.[piece.row]?.[piece.col];
  if (!slot || slot.piece) return null;

  const geo = state.slotGeometry?.[piece.row]?.[piece.col];
  if (!geo) return null;

  const pieceCenterX = clientX - drag.offsetX + drag.halfW;
  const pieceCenterY = clientY - drag.offsetY + drag.halfH;
  const dx = pieceCenterX - geo.cx;
  const dy = pieceCenterY - geo.cy;

  return dx * dx + dy * dy < geo.threshold * geo.threshold ? slot : null;
}

function trySnapPiece(piece, clientX, clientY) {
  const target = findSnapTarget(piece, clientX, clientY);
  if (!target) return false;

  placePiece(piece, target);
  return true;
}

function placePiece(piece, slot) {
  piece.placed = true;
  slot.piece = piece;
  slot.element.classList.add("filled");
  piece.element.classList.add("placed");
  piece.slotEl = slot.element;

  const pos = getBoardSlotPosition(piece.row, piece.col);
  els.board.appendChild(piece.element);
  piece.element.style.position = "absolute";
  piece.element.style.left = `${pos.left}px`;
  piece.element.style.top = `${pos.top}px`;
  piece.element.style.transform = "none";

  state.placedCount++;
  updateProgress();

  if (state.placedCount === state.pieces.length) {
    onWin();
  }
}

function returnPieceToPool(piece, clientX, clientY) {
  els.trayPieces.appendChild(piece.element);
  const poolRect = els.trayPieces.getBoundingClientRect();

  const inPool =
    clientX >= poolRect.left &&
    clientX <= poolRect.right &&
    clientY >= poolRect.top &&
    clientY <= poolRect.bottom;

  if (inPool && state.dragging) {
    const x = clientX - poolRect.left - state.dragging.offsetX;
    const y = clientY - poolRect.top - state.dragging.offsetY;
    positionPieceInPool(piece, x, y);
  } else {
    const unplaced = state.pieces.filter((p) => !p.placed);
    const index = unplaced.findIndex((p) => p === piece);
    scatterPieceInPool(piece, Math.max(0, index), unplaced.length);
  }
}

// ——— Timer & progress ———

function startTimer() {
  stopTimer();
  state.startTime = Date.now();
  state.elapsed = 0;
  els.timerStat.textContent = "00:00";
  state.timerInterval = setInterval(() => {
    state.elapsed = Math.floor((Date.now() - state.startTime) / 1000);
    els.timerStat.textContent = formatTime(state.elapsed);
  }, 1000);
}

function stopTimer() {
  if (state.timerInterval) {
    clearInterval(state.timerInterval);
    state.timerInterval = null;
  }
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function updateProgress() {
  els.progressStat.textContent = `${state.placedCount} / ${state.pieces.length}`;
  const remaining = state.pieces.length - state.placedCount;
  els.trayHint.textContent =
    remaining > 0
      ? isMobileLayout()
        ? `還有 ${remaining} 片 · 左右滑動選片，拖到拼圖板`
        : `還有 ${remaining} 片 · 拖曳到上方拼圖板`
      : "";
}

// ——— Win & navigation ———

function onWin() {
  stopTimer();
  const d = DIFFICULTIES[getDifficultyIndex()];
  els.winMessage.textContent = `完成 ${d.label} 拼圖！用時 ${formatTime(state.elapsed)}`;
  els.winModal.showModal();
}

function showGameScreen() {
  els.uploadScreen.hidden = true;
  els.gameScreen.hidden = false;
  els.headerStats.hidden = false;
}

function showUploadScreen() {
  stopTimer();
  els.winModal.close();
  closeReferenceSheet();
  closeMobileSettings();
  clearPlayfield();
  els.gameScreen.hidden = true;
  els.uploadScreen.hidden = false;
  els.headerStats.hidden = true;
  state = createInitialState();
}

async function startWithImage(src) {
  try {
    const img = await loadImage(src);
    prepareSourceImage(img);
    setupGame();
  } catch {
    alert("無法載入圖片，請換一張試試。");
  }
}

function handleFile(file) {
  if (!file || !file.type.startsWith("image/")) {
    alert("請選擇圖片檔案（JPG、PNG、WebP、GIF）");
    return;
  }
  const reader = new FileReader();
  reader.onload = (e) => startWithImage(e.target.result);
  reader.readAsDataURL(file);
}

function closeMobileSettings() {
  els.toolbarSettings?.classList.remove("is-open");
  els.btnMobileSettings?.setAttribute("aria-expanded", "false");
}

function toggleMobileSettings() {
  const open = els.toolbarSettings.classList.toggle("is-open");
  els.btnMobileSettings.setAttribute("aria-expanded", String(open));
}

// ——— Event bindings ———

function bindEvents() {
  bindDifficultyInputs();

  els.dropzone.addEventListener("click", () => els.fileInput.click());
  els.dropzone.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      els.fileInput.click();
    }
  });

  els.fileInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) handleFile(file);
    e.target.value = "";
  });

  ["dragenter", "dragover"].forEach((evt) => {
    els.dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      els.dropzone.classList.add("drag-over");
    });
  });

  ["dragleave", "drop"].forEach((evt) => {
    els.dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      els.dropzone.classList.remove("drag-over");
    });
  });

  els.dropzone.addEventListener("drop", (e) => {
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  });

  els.startFromSample.addEventListener("click", () => startWithImage(SAMPLE_IMAGE));

  els.btnNewImage.addEventListener("click", showUploadScreen);
  els.btnNewImageModal.addEventListener("click", showUploadScreen);

  els.btnRestart.addEventListener("click", () => {
    if (!state.imageSrc) return;
    setupGame();
  });

  els.btnShuffle.addEventListener("click", () => {
    shuffleTrayPieces();
  });

  els.btnHint.addEventListener("click", () => {
    if (isMobileLayout()) {
      openReferenceSheet();
    }
  });

  let hintVisible = false;
  els.btnHint.addEventListener("pointerdown", () => {
    if (isMobileLayout()) return;
    hintVisible = true;
    els.referenceImage.closest(".reference-panel")?.classList.add("hint-flash");
  });
  const hideHint = () => {
    if (hintVisible) {
      hintVisible = false;
      els.referenceImage.closest(".reference-panel")?.classList.remove("hint-flash");
    }
  };
  els.btnHint.addEventListener("pointerup", hideHint);
  els.btnHint.addEventListener("pointerleave", hideHint);

  els.btnMobileSettings?.addEventListener("click", toggleMobileSettings);

  els.referenceSheetClose?.addEventListener("click", closeReferenceSheet);
  els.referenceSheetBackdrop?.addEventListener("click", closeReferenceSheet);

  els.btnApplyDifficulty.addEventListener("click", () => {
    if (!state.imageSrc) return;
    syncDifficultyUI(getDifficultyIndex());
    closeMobileSettings();
    setupGame();
  });

  els.btnPlayAgain.addEventListener("click", () => {
    els.winModal.close();
    setupGame();
  });

  let resizeTimer;
  window.addEventListener("resize", () => {
    syncLayoutMode();
    if (state.image && !els.gameScreen.hidden) {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        const img = state.image;
        prepareSourceImage(img);
        setupGame();
      }, 300);
    }
  });

  syncLayoutMode();
  if (isMobileLayout()) {
    els.difficulty.value = "1";
    els.difficultyGame.value = "1";
    syncDifficultyUI(1);
  }
}

bindDragListeners();
bindEvents();
