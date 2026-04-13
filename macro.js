// ==============================
// INFLARA MACRO DASHBOARD
// STABLE DEMO VERSION
// ==============================

let macroChart = null;
let currentRegion = "ea";
let currentYears = 5;

const macroState = {
  ea: {
    inflation: [],
    m1: [],
    m2: [],
    m3: []
  },
  us: {
    inflation: [],
    m1: [],
    m2: [],
    m3: []
  }
};

// ------------------------------
// HELPERS
// ------------------------------

function formatMonthLabel(date) {
  return date.toISOString().slice(0, 7);
}

function parseMonthDate(label) {
  return new Date(`${label}-01T00:00:00`);
}

function latestValue(series) {
  if (!series || !series.length) return "No data";
  return `${series[series.length - 1].value.toFixed(1)}%`;
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function setActive(selector, activeEl) {
  document.querySelectorAll(selector).forEach((el) => {
    el.classList.remove("active");
  });

  if (activeEl) activeEl.classList.add("active");
}

function getCutoffDate(years) {
  if (!years) return null;
  const date = new Date();
  date.setFullYear(date.getFullYear() - years);
  return date;
}

function filterByYears(series, years) {
  if (!years) return series;
  const cutoff = getCutoffDate(years);
  return series.filter((row) => row.date >= cutoff);
}

function mergeLabels(seriesCollection) {
  const labels = new Set();

  seriesCollection.forEach((series) => {
    series.forEach((row) => labels.add(row.label));
  });

  return Array.from(labels).sort();
}

function mapSeriesToLabels(labels, series) {
  const map = new Map(series.map((row) => [row.label, row.value]));
  return labels.map((label) => map.get(label) ?? null);
}

// ------------------------------
// DEMO DATA GENERATION
// ------------------------------

function generateSmoothSeries(base, drift, volatility, min, max, months) {
  const data = [];
  let value = base;

  for (let i = months; i >= 0; i--) {
    const date = new Date();
    date.setMonth(date.getMonth() - i);

    const noise = (Math.random() - 0.5) * volatility;
    value += drift + noise;

    if (value < min) value = min;
    if (value > max) value = max;

    data.push({
      label: formatMonthLabel(date),
      date: new Date(date),
      value: Number(value.toFixed(2))
    });
  }

  return data;
}

function loadDemoData() {
  const months = 240;

  macroState.ea = {
    inflation: generateSmoothSeries(2.3, 0.003, 0.10, 0.5, 6.0, months),
    m1: generateSmoothSeries(6.0, -0.002, 0.14, 2.0, 9.0, months),
    m2: generateSmoothSeries(5.0, -0.001, 0.12, 2.0, 8.0, months),
    m3: generateSmoothSeries(4.2, 0.000, 0.10, 1.5, 7.0, months)
  };

  macroState.us = {
    inflation: generateSmoothSeries(2.8, 0.002, 0.12, 0.8, 7.0, months),
    m1: generateSmoothSeries(7.2, -0.003, 0.16, 2.0, 10.0, months),
    m2: generateSmoothSeries(5.8, -0.002, 0.13, 2.0, 8.5, months),
    m3: []
  };
}

// ------------------------------
// CHART DATA
// ------------------------------

function getCurrentRegionData() {
  return macroState[currentRegion];
}

function buildChartData() {
  const regionData = getCurrentRegionData();

  const inflation = filterByYears(regionData.inflation, currentYears);
  const m1 = filterByYears(regionData.m1, currentYears);
  const m2 = filterByYears(regionData.m2, currentYears);
  const m3 = filterByYears(regionData.m3, currentYears);

  const labels = mergeLabels([inflation, m1, m2, m3]);

  return {
    labels,
    datasets: [
      {
        label: currentRegion === "ea" ? "HICP Inflation" : "CPI Inflation",
        data: mapSeriesToLabels(labels, inflation),
        borderColor: "#f3e7b3",
        backgroundColor: "rgba(243, 231, 179, 0.15)",
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.3
      },
      {
        label: "M1",
        data: mapSeriesToLabels(labels, m1),
        borderColor: "#7cb4ff",
        backgroundColor: "rgba(124, 180, 255, 0.15)",
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.3
      },
      {
        label: "M2",
        data: mapSeriesToLabels(labels, m2),
        borderColor: "#8df0d2",
        backgroundColor: "rgba(141, 240, 210, 0.15)",
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.3
      },
      {
        label: "M3",
        data: mapSeriesToLabels(labels, m3),
        borderColor: "#d4af37",
        backgroundColor: "rgba(212, 175, 55, 0.15)",
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.3,
        hidden: currentRegion === "us"
      }
    ]
  };
}

// ------------------------------
// RENDER
// ------------------------------

function renderMacroChart() {
  const canvas = document.getElementById("macroChart");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  const chartData = buildChartData();

  if (macroChart) {
    macroChart.destroy();
  }

  macroChart = new Chart(ctx, {
    type: "line",
    data: chartData,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: "index",
        intersect: false
      },
      plugins: {
        legend: {
          labels: {
            color: "#e6e8eb",
            usePointStyle: true,
            pointStyle: "line"
          }
        },
        tooltip: {
          callbacks: {
            label(context) {
              const value = context.raw;
              if (value === null || value === undefined) {
                return `${context.dataset.label}: —`;
              }
              return `${context.dataset.label}: ${Number(value).toFixed(1)}%`;
            }
          }
        }
      },
      scales: {
        x: {
          ticks: {
            color: "#9aa0a6",
            maxTicksLimit: 10
          },
          grid: {
            color: "rgba(255,255,255,0.06)"
          }
        },
        y: {
          min: 0,
          max: 10,
          ticks: {
            color: "#9aa0a6",
            callback(value) {
              return `${value}%`;
            }
          },
          grid: {
            color: "rgba(255,255,255,0.06)"
          }
        }
      }
    }
  });
}

function renderMacroCards() {
  const regionData = getCurrentRegionData();

  setText("card-inflation", latestValue(regionData.inflation));
  setText("card-m1", latestValue(regionData.m1));
  setText("card-m2", latestValue(regionData.m2));

  if (currentRegion === "us") {
    setText("card-m3", "Discontinued");
    setText(
      "macro-note",
      "US mode shows demo inflation, M1 and M2 trend data. Official US M3 is discontinued."
    );
  } else {
    setText("card-m3", latestValue(regionData.m3));
    setText(
      "macro-note",
      "Euro Area mode shows demo inflation and monetary aggregate trend data."
    );
  }
}

function renderMacroDashboard() {
  renderMacroChart();
  renderMacroCards();
}

// ------------------------------
// EVENTS
// ------------------------------

function bindMacroEvents() {
  const euroButton = document.getElementById("region-ea");
  const usButton = document.getElementById("region-us");

  if (euroButton) {
    euroButton.addEventListener("click", () => {
      currentRegion = "ea";
      setActive(".macro-tab", euroButton);
      renderMacroDashboard();
    });
  }

  if (usButton) {
    usButton.addEventListener("click", () => {
      currentRegion = "us";
      setActive(".macro-tab", usButton);
      renderMacroDashboard();
    });
  }

  document.querySelectorAll(".range-btn").forEach((button) => {
    button.addEventListener("click", () => {
      currentYears = Number(button.dataset.years);
      setActive(".range-btn", button);
      renderMacroDashboard();
    });
  });
}

// ------------------------------
// INIT
// ------------------------------

function initMacroPage() {
  const canvas = document.getElementById("macroChart");
  if (!canvas) return;

  loadDemoData();
  bindMacroEvents();
  renderMacroDashboard();
}

document.addEventListener("DOMContentLoaded", initMacroPage);
