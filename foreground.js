// This script gets injected into any opened page
// whose URL matches the pattern defined in the manifest
// (see "content_script" key).
// Several foreground scripts can be declared
// and injected into the same or different pages.

console.log(">>> FOREGROUND.JS RUNNING ON", window.location.href);

/**
 * Reads the Minesweeper board from the page.
 * 
 * Board coordinates are 0-based (row 0, col 0 is the top-left tile).
 * Each tile has:
 * - row: 0-based row index
 * - col: 0-based column index
 * - state: { kind: "hidden" } or { kind: "number", value: N } where N is 0-8
 * 
 * @returns {Array<Array<{row: number, col: number, state: {kind: string, value?: number}}>>} 2D array board[row][col]
 */
function readBoard() {
    const squares = document.querySelectorAll('.square');
    const boardMap = new Map(); // Use Map to handle sparse data
    
    squares.forEach(square => {
        // Parse id format: "row_col" (e.g., "6_1")
        const id = square.id;
        const [rowStr, colStr] = id.split('_');
        const row = parseInt(rowStr, 10);
        const col = parseInt(colStr, 10);
        
        // Determine state from class name
        let state;
        if (square.classList.contains('blank')) {
            state = { kind: "hidden" };
        } else {
            // Check for openN pattern (e.g., "open1", "open0", "open8")
            const classList = Array.from(square.classList);
            const openClass = classList.find(cls => cls.startsWith('open'));
            if (openClass) {
                const numberStr = openClass.replace('open', '');
                const value = parseInt(numberStr, 10);
                state = { kind: "number", value: value };
            } else {
                // Fallback: treat as hidden if no open class found
                state = { kind: "hidden" };
            }
        }
        
        // Store in map
        if (!boardMap.has(row)) {
            boardMap.set(row, new Map());
        }
        boardMap.get(row).set(col, { row, col, state });
    });
    
    // Convert Map to 2D array
    // Find max row and col to determine array size
    let maxRow = -1;
    let maxCol = -1;
    boardMap.forEach((colMap, row) => {
        if (row > maxRow) maxRow = row;
        colMap.forEach((tile, col) => {
            if (col > maxCol) maxCol = col;
        });
    });
    
    // Build 2D array (0-based indexing)
    const board = [];
    for (let r = 0; r <= maxRow; r++) {
        const row = [];
        for (let c = 0; c <= maxCol; c++) {
            if (boardMap.has(r) && boardMap.get(r).has(c)) {
                row.push(boardMap.get(r).get(c));
            } else {
                // Fill gaps with hidden tiles
                row.push({ row: r, col: c, state: { kind: "hidden" } });
            }
        }
        board.push(row);
    }
    
    // Log simple text grid
    debugPrintBoard(board);
    
    return board;
}

window.readBoard = readBoard;

/**
 * Prints a simple text representation of the board to the console.
 * Numbers represent revealed tiles, '.' represents hidden tiles.
 * 
 * @param {Array<Array<{row: number, col: number, state: {kind: string, value?: number}}>>} board
 */
function debugPrintBoard(board) {
    if (!board || board.length === 0) {
        console.log("Empty board");
        return;
    }
    
    let grid = "";
    for (let r = 0; r < board.length; r++) {
        let row = "";
        for (let c = 0; c < board[r].length; c++) {
            const tile = board[r][c];
            if (tile.state.kind === "hidden") {
                row += ".";
            } else if (tile.state.kind === "number") {
                row += tile.state.value.toString();
            } else {
                row += "?";
            }
        }
        grid += row + "\n";
    }
    console.log("Board state:\n" + grid);
}

console.log("Sweeper extension loaded. Press 'R' to read the board, 'S' to solve and highlight cells.");

window.readBoard = readBoard;

function clickCell(row, col) {
    const id = `${row}_${col}`;
    const el = document.getElementById(id);
    if (!el) return;
  
    // Left-click to open a tile
    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    el.dispatchEvent(new MouseEvent('mouseup',   { bubbles: true, button: 0 }));
  }
  
let autoSolving = false;

function logAutoSolveState() {
    console.log(`Auto-solve is now ${autoSolving ? 'ENABLED' : 'DISABLED'}. Press 'A' to toggle.`);
  }

  async function autoSolveLoop() {
    if (autoSolving) {
      console.log("Auto-solve already running.");
      return;
    }
    autoSolving = true;
    console.log("Auto-solve started. Press 'A' again to request stop.");
  
    try {
      while (autoSolving) {
        const board = readBoard();
        const { safeCells } = findMoves(board);
  
        if (!safeCells || safeCells.length === 0) {
          console.log("Auto-solve: no more guaranteed safe moves.");
          break;
        }
  
        console.log(`Auto-solve: clicking ${safeCells.length} safe cells...`);
  
        // Click all safe cells
        for (const { row, col } of safeCells) {
          clickCell(row, col);
        }
  
        // Wait a bit for the game to update before the next iteration
        await new Promise(resolve => setTimeout(resolve, 150));
      }
    } finally {
      autoSolving = false;
      console.log("Auto-solve stopped.");
    }
  }

window.addEventListener('keydown', (e) => {


    // Press 'A' to toggle auto-solve
    if (e.key === 'a' || e.key === 'A') {
        if (autoSolving) {
            console.log("Stopping auto-solve after current step...");
            autoSolving = false;
        } else {
            autoSolveLoop();
        }
    }
    // Press 'R' to read the board
    if (e.key === 'r' || e.key === 'R') {
      const board = readBoard();
      console.log('Board from keypress:', board);
    }
    
    // Press 'S' to solve and highlight cells
    if (e.key === 's' || e.key === 'S') {
      const board = readBoard();
      const { safeCells, mineCells } = findMoves(board);
      
      console.log(`Found ${safeCells.length} safe cells and ${mineCells.length} mine cells`);
      console.log('Safe cells:', safeCells);
      console.log('Mine cells:', mineCells);
      
      // Clear previous highlights
      document.querySelectorAll('.square').forEach(square => {
        square.style.outline = '';
      });
      
      // Highlight safe cells with green outline
      safeCells.forEach(({ row, col }) => {
        const element = document.getElementById(`${row}_${col}`);
        if (element) {
          element.style.outline = '2px solid lime';
        }
      });
      
      // Highlight mine cells with red outline
      mineCells.forEach(({ row, col }) => {
        const element = document.getElementById(`${row}_${col}`);
        if (element) {
          element.style.outline = '2px solid red';
        }
      });
    }
  });