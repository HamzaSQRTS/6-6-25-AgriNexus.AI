// decision_tree.js — small generic decision tree (Gini, depth-limited)
// Used by the Smart Agronomy crop recommender. Designed to be small and
// human-readable so it can be serialised to / from JSON in localStorage.
//
// Features are passed as a plain object: { temperature, humidity, rainfall,
// soil_ph, soil_type, region }. Numeric fields are auto-binned; categorical
// fields are one-hot encoded before splitting.

const NUMERIC_BINS = {
  temperature:   [10, 18, 24, 30],          // 5 bins: <-10, 10-18, 18-24, 24-30, >30
  humidity:      [40, 55, 70, 85],          // 5 bins
  rainfall:      [50, 100, 180],            // 4 bins: <50, 50-100, 100-180, >180
  soil_ph:       [5.5, 6.5, 7.5],           // 4 bins
  soil_moisture: [25, 40, 60],              // 4 bins
  organic_matter:[1.5, 3.0, 5.0],           // 4 bins
  drainage:      [30, 50, 70]               // 4 bins
};

const CATEGORICAL_KEYS = ['soil_type', 'region'];

/** Bin a numeric value into a discrete string label. */
function binNumeric(field, value) {
  if (value === null || value === undefined || isNaN(value)) return 'unknown';
  const edges = NUMERIC_BINS[field];
  if (!edges) return String(value);
  let label = `lt${edges[0]}`;
  for (let i = 0; i < edges.length; i++) {
    if (value < edges[i]) { label = `lt${edges[i]}`; break; }
    label = `ge${edges[i]}`;
  }
  return label;
}

/** Convert a raw feature row to the discrete-row form the tree works on. */
function vectorize(row) {
  const out = {};
  for (const k of Object.keys(NUMERIC_BINS)) {
    if (row[k] !== undefined) out[k] = binNumeric(k, Number(row[k]));
  }
  for (const k of CATEGORICAL_KEYS) {
    if (row[k] !== undefined) out[k] = String(row[k]);
  }
  return out;
}

/** Gini impurity of a list of labels. */
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

/** Pick the best split (feature + value) for a set of discrete rows. */
function bestSplit(rows) {
  if (rows.length < 2) return null;
  const features = Object.keys(rows[0].x);
  let best = { gain: 0 };

  for (const f of features) {
    // gather unique values
    const seen = new Set();
    for (const r of rows) seen.add(r.x[f]);
    const values = Array.from(seen);

    for (const v of values) {
      const left = [], right = [];
      for (const r of rows) (r.x[f] === v ? left : right).push(r);
      if (!left.length || !right.length) continue;
      const parentGini = gini(rows.map((r) => r.y));
      const childGini = (left.length * gini(left.map((r) => r.y)) +
                         right.length * gini(right.map((r) => r.y))) / rows.length;
      const gain = parentGini - childGini;
      if (gain > best.gain) {
        best = { gain, feature: f, value: v, left, right };
      }
    }
  }
  return best.gain > 0 ? best : null;
}

/** Recursively build the tree. */
function buildTree(rows, depth, maxDepth, minSamples) {
  const labels = rows.map((r) => r.y);
  if (depth >= maxDepth || rows.length < minSamples || gini(labels) === 0) {
    // leaf: pick majority label + count
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
    left:  buildTree(split.left,  depth + 1, maxDepth, minSamples),
    right: buildTree(split.right, depth + 1, maxDepth, minSamples)
  };
}

/** Walk the tree for a single vectorised feature row → leaf. */
function walk(node, x) {
  if (node.type === 'leaf') return node;
  if (x[node.feature] === node.value) return walk(node.left, x);
  return walk(node.right, x);
}

/** Train a tree from a list of {x, y} records. */
export function trainFromRecords(records, { maxDepth = 8, minSamples = 4 } = {}) {
  return buildTree(records, 0, maxDepth, minSamples);
}

/** Train directly from a flat list of {features, label} rows. */
export function train(rows, options) {
  const records = rows.map((r) => ({ x: vectorize(r), y: r.crop || r.label }));
  return trainFromRecords(records, options);
}

/** Predict the leaf distribution for a single feature row. */
export function predict(tree, row) {
  const x = vectorize(row);
  return walk(tree, x);
}

/** Walk every reachable leaf, returning the (label, count, confidence) tuples
 *  weighted by how often the prediction would land there. Useful for "top 3"
 *  with confidence %, since a single deterministic leaf hides information. */
export function predictDistribution(tree, row) {
  const x = vectorize(row);
  const leaves = [];
  const visit = (node, weight) => {
    if (node.type === 'leaf') {
      if (node.label) leaves.push({ label: node.label, confidence: node.confidence, weight });
      return;
    }
    if (x[node.feature] === node.value) visit(node.left,  weight);
    else                                visit(node.right, weight);
  };
  visit(tree, 1);
  return leaves;
}

/** Serialize the tree to a plain JSON object. */
export function toJSON(tree) {
  return JSON.stringify(tree);
}

/** Deserialize a JSON string back into a tree. */
export function fromJSON(str) {
  return JSON.parse(str);
}

export const __test = { binNumeric, vectorize, gini, bestSplit, buildTree };
