// crop_recommender.js — train, cache, and predict with a small decision tree
// for crop recommendations. The model is "pre-trained" on a baked-in dataset
// (data/crop_training_data.json) and cached in localStorage. A "Train Model"
// button retrains with new data and refreshes the cache.

import { train, predictDistribution, toJSON, fromJSON } from './decision_tree.js';

const MODEL_KEY = 'agrinexus_ml_model_v2';
const META_KEY  = 'agrinexus_ml_model_meta_v2';
const EXTRA_DATA_KEY = 'agrinexus_ml_extra_data_v2';

let cachedTree = null;
let cachedMeta = null;          // { accuracy, trainedAt, rowCount }
let extraData = [];             // user-added training rows, persisted separately

/** Load any persisted model / extra data from localStorage. Safe to call repeatedly. */
function loadFromStorage() {
  try {
    const raw = localStorage.getItem(MODEL_KEY);
    if (raw) cachedTree = fromJSON(raw);
    const meta = localStorage.getItem(META_KEY);
    if (meta) cachedMeta = JSON.parse(meta);
    const extra = localStorage.getItem(EXTRA_DATA_KEY);
    if (extra) extraData = JSON.parse(extra);
  } catch (e) {
    console.warn('[crop_recommender] failed to load cached model', e);
    cachedTree = null;
    cachedMeta = null;
    extraData = [];
  }
}

/** Hold-out accuracy: shuffle, train on 80%, score on 20%. */
export function evaluateAccuracy(dataset) {
  if (!dataset.length) return 0;
  const shuffled = dataset.slice().sort(() => Math.random() - 0.5);
  const split = Math.max(1, Math.floor(shuffled.length * 0.8));
  const trainRows = shuffled.slice(0, split);
  const testRows  = shuffled.slice(split);
  const t = train(trainRows);
  let correct = 0;
  for (const r of testRows) {
    const leaves = predictDistribution(t, r);
    if (!leaves.length) continue;
    leaves.sort((a, b) => b.confidence - a.confidence);
    if (leaves[0].label === r.crop) correct += 1;
  }
  return testRows.length ? correct / testRows.length : 0;
}

/** (Re)train and cache the model. Returns the new metadata. */
export function trainAndCache(dataset) {
  const all = dataset.concat(extraData);
  if (!all.length) {
    throw new Error('No training data available.');
  }
  const tree = train(all);
  const accuracy = evaluateAccuracy(all);
  cachedTree = tree;
  cachedMeta = {
    accuracy: Number(accuracy.toFixed(3)),
    trainedAt: new Date().toISOString(),
    rowCount: all.length
  };
  try {
    localStorage.setItem(MODEL_KEY, toJSON(tree));
    localStorage.setItem(META_KEY, JSON.stringify(cachedMeta));
  } catch (e) {
    console.warn('[crop_recommender] failed to persist model', e);
  }
  return cachedMeta;
}

/** Add a new training row to the user-data store and retrain. */
export function addTrainingRow(row) {
  if (!row || !row.crop) throw new Error('Training row must include a `crop` field.');
  extraData.push(row);
  try {
    localStorage.setItem(EXTRA_DATA_KEY, JSON.stringify(extraData));
  } catch (e) { console.warn('[crop_recommender] failed to persist extra data', e); }
  return trainAndCache(_lastDataset || []);
}

/** Top-3 crop predictions with confidence %. */
export function predictTop3(features) {
  if (!cachedTree) throw new Error('Model is not trained yet.');
  const leaves = predictDistribution(cachedTree, features);
  if (!leaves.length) return [];
  // Aggregate by label (the tree can have multiple leaves matching the same
  // input if it was built with a low min-samples-split; the total weight sums
  // to <=1, but we renormalise to a confidence % over the candidates that
  // appear).
  const agg = {};
  for (const l of leaves) {
    agg[l.label] = (agg[l.label] || 0) + l.confidence * l.weight;
  }
  const entries = Object.entries(agg)
    .map(([crop, score]) => ({ crop, confidence: Number(score.toFixed(3)) }))
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 3);
  // Normalise to 0..1 within top-3 (so the bars sum to ~100% on the card).
  const total = entries.reduce((s, e) => s + e.confidence, 0) || 1;
  return entries.map((e) => ({ ...e, confidence: Number((e.confidence / total).toFixed(3)) }));
}

/** Currently cached model metadata (accuracy, training time). */
export function getModelMeta() {
  return cachedMeta;
}

/** Forget cached model (mainly for debugging / settings reset). */
export function clearModel() {
  cachedTree = null;
  cachedMeta = null;
  try {
    localStorage.removeItem(MODEL_KEY);
    localStorage.removeItem(META_KEY);
    localStorage.removeItem(EXTRA_DATA_KEY);
  } catch (e) { /* ignore */ }
}

// internal — keep a reference to the most recently used dataset so addTrainingRow
// can re-evaluate accuracy on the *full* dataset (base + extra).
let _lastDataset = null;

/** Initialise: load cached model if any, otherwise train on the given base dataset. */
export function init(baseDataset) {
  loadFromStorage();
  _lastDataset = baseDataset;
  if (!cachedTree) {
    try {
      trainAndCache(baseDataset);
    } catch (e) {
      console.warn('[crop_recommender] init training failed', e);
    }
  }
  return cachedMeta;
}

/** Get the user-added training rows (read-only). */
export function getUserTrainingRows() {
  return extraData.slice();
}

export const __test = { evaluateAccuracy };
