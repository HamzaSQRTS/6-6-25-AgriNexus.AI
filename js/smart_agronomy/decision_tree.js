// decision_tree.js — small high-fidelity decision tree supporting numeric threshold splits.
// Designed to run fast in the browser and yield high classification accuracy.

function getThresholds(values) {
  const sorted = Array.from(values).sort((a, b) => a - b);
  if (sorted.length <= 15) return sorted;
  const thresholds = [];
  for (let i = 1; i <= 15; i++) {
    const idx = Math.floor((sorted.length - 1) * (i / 16));
    thresholds.push(sorted[idx]);
  }
  return Array.from(new Set(thresholds));
}

function gini(labels) {
  if (!labels.length) return 0;
  const counts = {};
  for (const l of labels) counts[l] = (counts[l] || 0) + 1;
  let sum = 0;
  for (const c of Object.values(counts)) {
    const p = c / labels.length;
    sum += p * p;
  }
  return 1 - sum;
}

function bestSplit(rows) {
  if (rows.length < 2) return null;
  const features = Object.keys(rows[0].x);
  let best = { gain: 0 };

  for (const f of features) {
    const isNumeric = typeof rows[0].x[f] === 'number';
    const seen = new Set();
    for (const r of rows) seen.add(r.x[f]);
    const values = Array.from(seen);

    if (isNumeric) {
      const thresholds = getThresholds(values);
      for (const t of thresholds) {
        const left = [], right = [];
        for (const r of rows) (r.x[f] <= t ? left : right).push(r);
        if (!left.length || !right.length) continue;
        const parentGini = gini(rows.map(r => r.y));
        const childGini = (left.length * gini(left.map(r => r.y)) +
                           right.length * gini(right.map(r => r.y))) / rows.length;
        const gain = parentGini - childGini;
        if (gain > best.gain) {
          best = { gain, feature: f, value: t, op: '<=', left, right };
        }
      }
    } else {
      for (const v of values) {
        const left = [], right = [];
        for (const r of rows) (r.x[f] === v ? left : right).push(r);
        if (!left.length || !right.length) continue;
        const parentGini = gini(rows.map(r => r.y));
        const childGini = (left.length * gini(left.map(r => r.y)) +
                           right.length * gini(right.map(r => r.y))) / rows.length;
        const gain = parentGini - childGini;
        if (gain > best.gain) {
          best = { gain, feature: f, value: v, op: '===', left, right };
        }
      }
    }
  }
  return best.gain > 0 ? best : null;
}

function buildTree(rows, depth, maxDepth, minSamples) {
  const labels = rows.map(r => r.y);
  if (depth >= maxDepth || rows.length < minSamples || gini(labels) === 0) {
    const counts = {};
    for (const l of labels) counts[l] = (counts[l] || 0) + 1;
    let topLabel = null, topCount = -1;
    for (const [l, c] of Object.entries(counts)) if (c > topCount) { topLabel = l; topCount = c; }
    return { type: 'leaf', label: topLabel, count: rows.length, confidence: rows.length ? topCount / rows.length : 0 };
  }
  const split = bestSplit(rows);
  if (!split) {
    const counts = {};
    for (const l of labels) counts[l] = (counts[l] || 0) + 1;
    let topLabel = null, topCount = -1;
    for (const [l, c] of Object.entries(counts)) if (c > topCount) { topLabel = l; topCount = c; }
    return { type: 'leaf', label: topLabel, count: rows.length, confidence: rows.length ? topCount / rows.length : 0 };
  }
  return {
    type: 'split',
    feature: split.feature,
    value: split.value,
    op: split.op,
    left:  buildTree(split.left,  depth + 1, maxDepth, minSamples),
    right: buildTree(split.right, depth + 1, maxDepth, minSamples)
  };
}

export function train(rows, options = {}) {
  const maxDepth = options.maxDepth || 8;
  const minSamples = options.minSamples || 10;
  
  const records = rows.map(r => ({
    x: {
      temperature: r.temperature,
      humidity: r.humidity,
      soil_moisture: r.soil_moisture,
      soil_type: r.soil_type
    },
    y: r.crop || r.label
  }));
  
  return buildTree(records, 0, maxDepth, minSamples);
}

export function predictDistribution(tree, row) {
  const leaves = [];
  const visit = (node, weight) => {
    if (node.type === 'leaf') {
      if (node.label) leaves.push({ label: node.label, confidence: node.confidence, weight });
      return;
    }
    const val = row[node.feature];
    const goesLeft = node.op === '<=' ? (val <= node.value) : (val === node.value);
    if (goesLeft) visit(node.left,  weight);
    else          visit(node.right, weight);
  };
  visit(tree, 1);
  return leaves;
}

export function toJSON(tree) {
  return JSON.stringify(tree);
}

export function fromJSON(str) {
  return JSON.parse(str);
}

export const __test = { gini, bestSplit, buildTree };
