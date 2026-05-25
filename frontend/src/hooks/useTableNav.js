import { useEffect, useState } from "react";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";

/**
 * Arrow-key navigation for dense tables (FoxPro feel).
 * - ↑ / ↓ : move row selection
 * - Home / End : first / last row
 * - PageUp / PageDown : ±10 rows
 * - Enter : trigger onEdit / onView with selected row
 * - Delete : trigger onDelete with selected row
 *
 * Returns:
 *   selectedIndex, setSelectedIndex, rowProps(idx) => spreadable props
 */
export function useTableNav({ rows, onEdit, onDelete, enabled = true }) {
  const [selectedIndex, setSelectedIndex] = useState(-1);

  // reset selection when rows change drastically
  useEffect(() => {
    if (selectedIndex >= (rows?.length || 0)) setSelectedIndex(-1);
  }, [rows?.length, selectedIndex]);

  useKeyboardShortcuts(enabled ? [
    { key: "ArrowDown", action: () =>
        setSelectedIndex((i) => Math.min((rows?.length || 1) - 1, i < 0 ? 0 : i + 1)),
      description: "Next row" },
    { key: "ArrowUp", action: () =>
        setSelectedIndex((i) => Math.max(0, i - 1)),
      description: "Previous row" },
    { key: "Home", action: () => setSelectedIndex(0),
      description: "First row" },
    { key: "End", action: () => setSelectedIndex((rows?.length || 1) - 1),
      description: "Last row" },
    { key: "PageDown", action: () =>
        setSelectedIndex((i) => Math.min((rows?.length || 1) - 1, (i < 0 ? 0 : i) + 10)) },
    { key: "PageUp", action: () =>
        setSelectedIndex((i) => Math.max(0, i - 10)) },
    { key: "Enter", action: () => {
        if (selectedIndex >= 0 && rows?.[selectedIndex]) onEdit?.(rows[selectedIndex]);
      }, description: "Edit selected" },
    { key: "Delete", action: () => {
        if (selectedIndex >= 0 && rows?.[selectedIndex]) onDelete?.(rows[selectedIndex]);
      }, description: "Delete selected" },
  ] : [], [rows?.length, selectedIndex, onEdit, onDelete, enabled]);

  // Auto-scroll selected row into view
  useEffect(() => {
    if (selectedIndex < 0) return;
    const tr = document.querySelector(`tr[data-row-idx="${selectedIndex}"]`);
    if (tr && typeof tr.scrollIntoView === "function") {
      tr.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [selectedIndex]);

  const rowProps = (idx) => ({
    "data-row-idx": idx,
    onClick: () => setSelectedIndex(idx),
    className: idx === selectedIndex ? "tbl-row-selected" : "",
  });

  return { selectedIndex, setSelectedIndex, rowProps };
}
