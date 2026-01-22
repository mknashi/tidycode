// Improved line-based diff utility using Myers diff algorithm
export const generateDiff = (original, fixed, options = {}) => {
  const { ignoreBlankLines = false } = options;

  let originalLines = original.split('\n');
  let fixedLines = fixed.split('\n');

  // Helper to check if a line is blank
  const isBlank = (line) => line !== undefined && line.trim() === '';

  // If ignoring blank lines, filter them out before diff
  let origLineMapping = [];
  let fixedLineMapping = [];

  if (ignoreBlankLines) {
    let filteredOrig = [];
    let filteredFixed = [];

    originalLines.forEach((line, idx) => {
      if (!isBlank(line)) {
        filteredOrig.push(line);
        origLineMapping.push(idx);
      }
    });

    fixedLines.forEach((line, idx) => {
      if (!isBlank(line)) {
        filteredFixed.push(line);
        fixedLineMapping.push(idx);
      }
    });

    originalLines = filteredOrig;
    fixedLines = filteredFixed;
  }

  // Compute diff using Myers algorithm
  const ses = computeSES(originalLines, fixedLines);

  // Post-process to detect modifications (consecutive remove + add)
  const diff = [];
  let lineNum = 1;
  let i = 0;

  while (i < ses.length) {
    const item = ses[i];

    if (item.type === 'common') {
      diff.push({
        type: 'unchanged',
        lineNum: lineNum++,
        original: item.value,
        fixed: item.value
      });
      i++;
    } else if (item.type === 'removed' && i + 1 < ses.length && ses[i + 1].type === 'added') {
      // Check if this is a modification (removed followed by added)
      const removedItem = item;
      const addedItem = ses[i + 1];

      // Consider it a modification if the lines are similar
      if (areSimilar(removedItem.value, addedItem.value)) {
        diff.push({
          type: 'modified',
          lineNum: lineNum++,
          original: removedItem.value,
          fixed: addedItem.value
        });
        i += 2; // Skip both the removed and added
      } else {
        // They're too different, treat as separate remove + add
        diff.push({
          type: 'removed',
          lineNum: lineNum++,
          original: removedItem.value,
          fixed: null
        });
        i++;
      }
    } else if (item.type === 'removed') {
      diff.push({
        type: 'removed',
        lineNum: lineNum++,
        original: item.value,
        fixed: null
      });
      i++;
    } else if (item.type === 'added') {
      diff.push({
        type: 'added',
        lineNum: lineNum++,
        original: null,
        fixed: item.value
      });
      i++;
    }
  }

  return diff;
};

// Check if two lines are similar enough to be considered a modification
function areSimilar(line1, line2) {
  // Calculate simple similarity based on common characters
  const len1 = line1.length;
  const len2 = line2.length;
  const maxLen = Math.max(len1, len2);

  if (maxLen === 0) return true;

  // Count matching characters at the start
  let matching = 0;
  const minLen = Math.min(len1, len2);

  for (let i = 0; i < minLen; i++) {
    if (line1[i] === line2[i]) {
      matching++;
    }
  }

  // Consider similar if at least 60% of characters match
  const similarity = matching / maxLen;
  return similarity >= 0.6;
};

// Compute Shortest Edit Script using Myers diff algorithm
function computeSES(a, b) {
  const n = a.length;
  const m = b.length;
  const max = n + m;
  const v = {};
  const trace = [];

  v[1] = 0;

  for (let d = 0; d <= max; d++) {
    trace.push({ ...v });

    for (let k = -d; k <= d; k += 2) {
      let x;
      if (k === -d || (k !== d && v[k - 1] < v[k + 1])) {
        x = v[k + 1];
      } else {
        x = v[k - 1] + 1;
      }

      let y = x - k;

      while (x < n && y < m && a[x] === b[y]) {
        x++;
        y++;
      }

      v[k] = x;

      if (x >= n && y >= m) {
        return backtrack(a, b, trace, d);
      }
    }
  }

  return backtrack(a, b, trace, max);
}

// Backtrack to build the diff
function backtrack(a, b, trace, d) {
  const ses = [];
  let x = a.length;
  let y = b.length;

  for (let i = d; i >= 0; i--) {
    const v = trace[i];
    const k = x - y;

    let prevK;
    if (k === -i || (k !== i && v[k - 1] < v[k + 1])) {
      prevK = k + 1;
    } else {
      prevK = k - 1;
    }

    const prevX = v[prevK];
    const prevY = prevX - prevK;

    while (x > prevX && y > prevY) {
      ses.unshift({ type: 'common', value: a[x - 1] });
      x--;
      y--;
    }

    if (i > 0) {
      if (x > prevX) {
        ses.unshift({ type: 'removed', value: a[x - 1] });
        x--;
      } else if (y > prevY) {
        ses.unshift({ type: 'added', value: b[y - 1] });
        y--;
      }
    }
  }

  return ses;
}

// Calculate diff statistics
export const getDiffStats = (diff) => {
  const stats = {
    added: 0,
    removed: 0,
    modified: 0,
    unchanged: 0
  };

  diff.forEach(line => {
    stats[line.type]++;
  });

  return stats;
};

// Get character-level diff for a line (simple word highlighting)
export const getInlineDiff = (original, fixed) => {
  if (!original || !fixed) return null;

  const origWords = original.split(/(\s+)/);
  const fixedWords = fixed.split(/(\s+)/);

  const origDiff = [];
  const fixedDiff = [];

  const maxWords = Math.max(origWords.length, fixedWords.length);

  for (let i = 0; i < maxWords; i++) {
    const origWord = origWords[i];
    const fixedWord = fixedWords[i];

    if (origWord !== fixedWord) {
      if (origWord !== undefined) {
        origDiff.push({ text: origWord, changed: true });
      }
      if (fixedWord !== undefined) {
        fixedDiff.push({ text: fixedWord, changed: true });
      }
    } else {
      origDiff.push({ text: origWord, changed: false });
      fixedDiff.push({ text: fixedWord, changed: false });
    }
  }

  return { original: origDiff, fixed: fixedDiff };
};
