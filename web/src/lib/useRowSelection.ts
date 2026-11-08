/**
 * Shared row-selection logic for category tables.
 *
 * Features:
 *   • Click a checkbox → toggle that row; records it as the anchor.
 *   • Shift+click a checkbox → add every row between the anchor and the
 *     clicked row to the current selection (never deselects — users can
 *     uncheck individual rows afterwards).
 *   • Dropping rows (import, delete, consolidate) automatically prunes
 *     stale ids from the selection.
 */
import { useCallback, useEffect, useState } from 'react';

export function useRowSelection<T extends { id: string }>(elements: T[]) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [anchor, setAnchor] = useState<number | null>(null);

  // Keep selection in sync with live ids.
  useEffect(() => {
    const live = new Set(elements.map((e) => e.id));
    setSelected((prev) => {
      let changed = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (live.has(id)) next.add(id);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [elements]);

  const toggleRow = useCallback(
    (idx: number, shiftKey: boolean) => {
      const el = elements[idx];
      if (!el) return;
      if (shiftKey && anchor !== null && anchor !== idx) {
        const [lo, hi] = anchor < idx ? [anchor, idx] : [idx, anchor];
        setSelected((prev) => {
          const next = new Set(prev);
          for (let i = lo; i <= hi; i++) next.add(elements[i].id);
          return next;
        });
        // Anchor stays put so successive shift+clicks all pivot on the same row.
      } else {
        setSelected((prev) => {
          const next = new Set(prev);
          if (next.has(el.id)) next.delete(el.id);
          else next.add(el.id);
          return next;
        });
        setAnchor(idx);
      }
    },
    [elements, anchor],
  );

  const toggleAll = useCallback(
    (checked: boolean) => {
      setSelected(checked ? new Set(elements.map((e) => e.id)) : new Set());
      setAnchor(null);
    },
    [elements],
  );

  const clearSelection = useCallback(() => {
    setSelected(new Set());
    setAnchor(null);
  }, []);

  const allChecked = elements.length > 0 && selected.size === elements.length;
  const someChecked = selected.size > 0 && !allChecked;

  return {
    selected,
    setSelected,
    toggleRow,
    toggleAll,
    clearSelection,
    allChecked,
    someChecked,
  };
}

/** Read `shiftKey` off a React ChangeEvent's underlying mouse event. */
export function eventShiftKey(e: React.ChangeEvent<HTMLInputElement>): boolean {
  const native = e.nativeEvent as unknown as { shiftKey?: boolean };
  return !!native.shiftKey;
}
