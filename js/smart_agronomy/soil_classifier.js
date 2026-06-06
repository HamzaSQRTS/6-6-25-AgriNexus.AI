// soil_classifier.js — classify soil into 1 of 7 types from physical inputs.
//
// We compare the user input against each soil profile's "centroid" (range)
// and produce a fit score for each type. The classifier returns:
//   { type, confidence, properties, bestCrops, fertilizer, irrigation,
//     scores, compositionRadar }
//
// The radar values are normalised 0-100 across the union of all 7 soil
// profiles so the chart is visually comparable.

let _profiles = null;

/** Lazy-load soil profile data (cached on first use). */
async function loadProfiles() {
  if (_profiles) return _profiles;
  try {
    const res = await fetch('data/soil_profiles.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    _profiles = await res.json();
  } catch (e) {
    console.error('[soil_classifier] failed to load soil_profiles.json', e);
    _profiles = {};
  }
  return _profiles;
}

/** Soft membership: 1.0 if value is inside [lo,hi], Gaussian-falloff outside. */
function membership(value, lo, hi) {
  if (value === null || value === undefined || isNaN(value)) return 0.5;
  if (value >= lo && value <= hi) return 1.0;
  const distance = value < lo ? lo - value : value - hi;
  const span = Math.max(hi - lo, 1);
  return Math.exp(-Math.pow(distance / span, 2));
}

/** Classify a soil sample.
 *  input: { ph, moisture, organicMatter, drainage, region }
 *  region: optional, used as a soft prior (e.g. arid regions lean sandy/saline).
 */
export async function classifySoil(input) {
  const profiles = await loadProfiles();
  const order = ['clay','sandy','loamy','silty','peaty','chalky','saline'];
  const scores = {};

  // Region-based prior — small boost to the soil type the region is known for.
  const regionPriors = {
    tropical:    { clay: 0.10, loamy: 0.05, silty: 0.05 },
    subtropical: { loamy: 0.08, clay: 0.04, silty: 0.04 },
    arid:        { sandy: 0.20, saline: 0.10, loamy: 0.02 },
    temperate:   { loamy: 0.12, clay: 0.03 },
    continental: { loamy: 0.06, sandy: 0.04, silty: 0.04 },
    mediterranean: { chalky: 0.18, loamy: 0.05 }
  };
  const prior = regionPriors[input.region] || {};

  for (const key of order) {
    const p = profiles[key];
    if (!p) { scores[key] = 0; continue; }
    const s =
      membership(input.ph,             p.ph[0],             p.ph[1])             * 0.25 +
      membership(input.moisture,       p.moisture[0],       p.moisture[1])       * 0.25 +
      membership(input.organicMatter,  p.organic_matter[0], p.organic_matter[1]) * 0.25 +
      membership(input.drainage,       p.drainage[0],       p.drainage[1])       * 0.25;
    scores[key] = s + (prior[key] || 0);
  }

  // Pick the top soil type; renormalise to 0..1 confidence.
  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const total  = sorted.reduce((acc, [, v]) => acc + v, 0) || 1;
  const [topKey, topScore] = sorted[0];
  const confidence = Number((topScore / total).toFixed(3));
  const profile = profiles[topKey];

  // Build the radar (normalised 0-100 over the union of profile ranges).
  const dims = ['ph', 'moisture', 'organic_matter', 'drainage'];
  const radar = { labels: ['pH', 'Moisture', 'Organic Matter', 'Drainage'], values: [] };
  for (const d of dims) {
    let globalMin = Infinity, globalMax = -Infinity;
    for (const k of order) {
      const r = profiles[k][d];
      if (r[0] < globalMin) globalMin = r[0];
      if (r[1] > globalMax) globalMax = r[1];
    }
    const span = (globalMax - globalMin) || 1;
    const v = input[d === 'organic_matter' ? 'organicMatter' : d];
    radar.values.push(Math.round(((v - globalMin) / span) * 100));
  }

  return {
    type: topKey,
    label: profile?.label || topKey,
    confidence,
    properties: profile?.properties || {},
    bestCrops: profile?.best_crops || [],
    fertilizer: profile?.fertilizer || {},
    irrigation: profile?.irrigation || {},
    composition: profile?.composition || {},
    scores,
    compositionRadar: radar
  };
}

export const __test = { membership };
