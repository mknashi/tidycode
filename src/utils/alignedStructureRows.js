// An aligned outline has one visual slot per source line. Inline objects,
// implicit tables, and array wrappers can all occupy the same slot.
export function mergeAlignedStructureRows(rows, rowHeight = 0) {
  const byLine = new Map();
  for (const row of rows) {
    const label = row.closing ? row.node.closeLabel : row.node.label;
    const slot = row.node.isArrayGroup ? `group:${row.key}` : row.line;
    const existing = byLine.get(slot);
    if (existing) {
      if (label) existing.labels.push(label);
    } else {
      byLine.set(slot, { ...row, top: row.top - (row.node.isArrayGroup ? rowHeight : 0), labels: label ? [label] : [] });
    }
  }
  return [...byLine.values()]
    .sort((a, b) => a.line - b.line)
    .map(({ labels, ...row }) => ({ ...row, displayLabel: labels.join(' · ') }))
    .map((row, index, ordered) => {
      // Put the group heading in the space above its first entry when possible.
      // If that space is occupied, advance rows until the next source-line gap.
      const previous = ordered[index - 1];
      row.top = Math.max(row.top, previous ? previous.top + rowHeight : 0);
      return row;
    });
}
