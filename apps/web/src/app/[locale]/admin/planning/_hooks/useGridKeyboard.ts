"use client";

import { useState, useCallback, useRef, useEffect } from "react";

type GridKeyboardOptions = {
  rowCount: number;
  colCount: number;
};

export function useGridKeyboard({ rowCount, colCount }: GridKeyboardOptions) {
  const [activeRow, setActiveRow] = useState(0);
  const [activeCol, setActiveCol] = useState(0);
  const gridRef = useRef<HTMLDivElement>(null);

  const getCellTabIndex = useCallback(
    (row: number, col: number) =>
      row === activeRow && col === activeCol ? 0 : -1,
    [activeRow, activeCol],
  );

  // Focus the active cell in the DOM
  useEffect(() => {
    if (!gridRef.current) return;
    const cell = gridRef.current.querySelector(
      `[data-row="${activeRow}"][data-col="${activeCol}"]`,
    ) as HTMLElement | null;
    cell?.focus();
  }, [activeRow, activeCol]);

  const handleGridKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      let nextRow = activeRow;
      let nextCol = activeCol;

      switch (e.key) {
        case "ArrowRight":
          nextCol = Math.min(activeCol + 1, colCount - 1);
          break;
        case "ArrowLeft":
          nextCol = Math.max(activeCol - 1, 0);
          break;
        case "ArrowDown":
          nextRow = Math.min(activeRow + 1, rowCount - 1);
          break;
        case "ArrowUp":
          nextRow = Math.max(activeRow - 1, 0);
          break;
        case "Home":
          nextCol = 0;
          break;
        case "End":
          nextCol = colCount - 1;
          break;
        default:
          return; // Don't prevent default for other keys
      }

      if (nextRow !== activeRow || nextCol !== activeCol) {
        e.preventDefault();
        setActiveRow(nextRow);
        setActiveCol(nextCol);
      }
    },
    [activeRow, activeCol, rowCount, colCount],
  );

  return {
    gridRef,
    activeRow,
    activeCol,
    getCellTabIndex,
    handleGridKeyDown,
  };
}
