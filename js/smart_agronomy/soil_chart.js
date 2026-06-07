// soil_chart.js — radar chart for the detected soil composition.

let _radarChart = null;

/** Render or update the soil radar. */
export function renderSoilRadar(canvas, radar) {
  if (!canvas) return;
  if (_radarChart) {
    _radarChart.destroy();
    _radarChart = null;
  }
  if (!radar || !radar.labels) return;

  _radarChart = new Chart(canvas.getContext('2d'), {
    type: 'radar',
    data: {
      labels: radar.labels,
      datasets: [{
        label: 'Soil profile (normalised 0-100)',
        data: radar.values,
        backgroundColor: 'rgba(20, 184, 166, 0.18)',
        borderColor: '#14b8a6',
        pointBackgroundColor: '#14b8a6',
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        r: {
          angleLines: { color: 'rgba(255,255,255,0.08)' },
          grid:       { color: 'rgba(255,255,255,0.08)' },
          pointLabels:{ color: '#a1a1aa', font: { size: 11 } },
          ticks:      { color: '#71717a', backdropColor: 'transparent', stepSize: 25 },
          suggestedMin: 0,
          suggestedMax: 100
        }
      },
      plugins: { legend: { display: false } }
    }
  });
}

/** Render or update the crop-confidence bar chart (horizontal bars). */
export function renderCropBars(canvas, top3) {
  if (!canvas) return;
  if (canvas.__chart) {
    canvas.__chart.destroy();
    canvas.__chart = null;
  }
  if (!top3 || !top3.length) return;
  const ctx = canvas.getContext('2d');
  canvas.__chart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: top3.map((c) => c.crop),
      datasets: [{
        label: 'Confidence',
        data: top3.map((c) => Math.round(c.confidence * 100)),
        backgroundColor: ['#10b981', '#14b8a6', '#3b82f6'],
        borderRadius: 6
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { beginAtZero: true, max: 100, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#a1a1aa', callback: (v) => v + '%' } },
        y: { grid: { display: false }, ticks: { color: '#f4f4f5', font: { weight: 600 } } }
      },
      plugins: { legend: { display: false } }
    }
  });
}

export const __test = { renderSoilRadar, renderCropBars };
