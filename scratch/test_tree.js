const fs = require('fs');

function binNumeric(field, value) {
  if (value === null || value === undefined || isNaN(value)) return 'unknown';
  if (field === 'temperature' || field === 'humidity' || field === 'soil_moisture') {
    return `${field}_${Math.round(value)}`;
  }
  if (field === 'soil_ph') {
    return `${field}_${(Math.round(value * 5) / 5).toFixed(1)}`;
  }
  if (field === 'organic_matter') {
    return `${field}_${(Math.round(value * 2) / 2).toFixed(1)}`;
  }
  if (field === 'drainage') {
    return `${field}_${Math.round(value / 5) * 5}`;
  }
  if (field === 'rainfall') {
    return `${field}_${Math.round(value / 10) * 10}`;
  }
  return String(value);
}

function vectorize(row) {
  const out = {};
  const numericFields = ['temperature', 'humidity', 'rainfall', 'soil_ph', 'soil_moisture', 'organic_matter', 'drainage'];
  for (const k of numericFields) {
    if (row[k] !== undefined) out[k] = binNumeric(k, Number(row[k]));
  }
  if (row.soil_type !== undefined) out.soil_type = String(row.soil_type);
  return out;
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

function buildTree(rows, depth, maxDepth, minSamples) {
  const labels = rows.map((r) => r.y);
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
    left:  buildTree(split.left,  depth + 1, maxDepth, minSamples),
    right: buildTree(split.right, depth + 1, maxDepth, minSamples)
  };
}

function walk(node, x) {
  if (node.type === 'leaf') return node;
  if (x[node.feature] === node.value) return walk(node.left, x);
  return walk(node.right, x);
}

function predictDistribution(tree, row) {
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

const data = JSON.parse(fs.readFileSync('data/crop_training_data.json', 'utf8'));

const shuffled = data.sort(() => Math.random() - 0.5);
const split = Math.floor(shuffled.length * 0.8);
const trainRows = shuffled.slice(0, split);
const testRows = shuffled.slice(split);

console.log('Train size:', trainRows.length);
console.log('Test size:', testRows.length);

const records = trainRows.map(r => ({ x: vectorize(r), y: r.crop }));
console.log('Vectorized sample x:', records[0].x);

console.log('Building tree with maxDepth=10, minSamples=5...');
const tree = buildTree(records, 0, 10, 5);

let correct = 0;
for (const r of testRows) {
  const leaves = predictDistribution(tree, r);
  if (!leaves.length) continue;
  leaves.sort((a, b) => b.confidence - a.confidence);
  if (leaves[0].label === r.crop) correct += 1;
}

console.log('Accuracy:', correct / testRows.length);
