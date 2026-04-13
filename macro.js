let macroChart;
let currentRegion = "ea";
let currentYears = 10;

const state = {
  ea: [],
  us: []
};

// -----------------------------
// DATA SOURCES TO CONFIGURE
// -----------------------------

// ECB data portal is the right source for euro area M1/M2/M3 and HICP.
// FRED is the right source for US M1/M2/CPI.
// You will likely want to replace these with the exact series URLs you choose.

const SOURCES = {
  ea: {
    m1: "",
    m2: "",
    m3: "",
    inflation: ""
  },
  us: {
    m1: "",
    m2: "",
    m3: null, // official US M3 discontinued
    inflation: ""
  }
};

// -----------------------------
// HELPER FUNCTIONS
// -----------------------------

function parseDate(value) {
  return new Date(value + "-01");
}

function cutoffByYears(data, years) {
  if (!years) return data;
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - years);
  return data.filter(item => item.date >= cutoff);
}

function latestValue(series) {
  if (!series || !series.length) return "—";
  return `${series[series.length - 1].value.toFixed(2)}%`;
}

function mergeSeries(labels, seriesMap) {
  return labels.map(label => {
    const row = { label };
    for (const [key, values] of Object.entries(seriesMap)) {
      const found = values.find(v => v.label === label);
      row[key] = found ? found.value : null;
    }
    return row;
  });
}

function getAllLabels(seriesList) {
  const set = new Set();
  seriesList.forEach(series => {
    series.forEach(item => set.add(item.label));
  });
  return Array.from(set).sort();
}

// -----------------------------
// FETCHERS
// -----------------------------

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch: ${url}`);
  return res.json();
}

/*
  EXPECTED NORMALISED RETURN:
  [
    { date: Date, label: "2024-01", value: 3.2 },
    ...
  ]
*/

async function fetchECBSeries(url) {
  const data = await fetchJson(url);

  // Replace this with the actual ECB response parsing once you have exact endpoint format.
  // This placeholder expects an array-like response you will adapt.
  if (!data || !Array.isArray(data.values)) return [];

  return data.values.map(row => ({
    date: parseDate(row.date),
    label: row.date,
    value: Number(row.value)
  }));
}

async function fetchFREDSeries(url) {
  const data = await fetchJson(url);

  // FRED series/observations JSON usually returns observations[]
  if (!data || !Array.isArray(data.observations)) return [];

  return data.observations
    .filter(row => row.value !== ".")
    .map(row => ({
      date: new Date(row.date),
      label: row.date.slice(0, 7),
      value: Number(row.value)
    }));
}

// -----------------------------
// LOADERS
// -----------------------------

async function loadEuroAreaData() {
  const [m1, m2, m3, inflation] = await Promise.all([
    fetchECBSeries(SOURCES.ea.m1),
    fetchECBSeries(SOURCES.ea.m2),
    fetchECBSeries(SOURCES.ea.m3),
    fetchECBSeries(SOURCES.ea.inflation)
  ]);

  state.ea = { m1, m2, m3, inflation };
}

async function loadUSData() {
  const [m1, m2, inflation] = await Promise.all([
    fetchFREDSeries(SOURCES.us.m1),
    fetchFREDSeries(SOURCES.us.m2),
    fetchFREDSeries(SOURCES.us.inflation)
  ]);

  state.us = { m1, m2, m3: [], inflation };
}

// -----------------------------
// CHART
// -----------------------------

function buildDatasets(regionData) {
  const m1 = cutoffByYears(regionData.m1, currentYears);
  const m2 = cutoffByYears(regionData.m2, currentYears);
  const m3 = cutoffByYears(regionData.m3 || [], currentYears);
  const inflation = cutoffByYears(regionData.inflation, currentYears);

  const labels = getAllLabels([m1, m2, m3, inflation]);

  const rows = mergeSeries(labels, {
    m1,
    m2,
    m3,
    inflation
  });

  return {
    labels,
    datasets: [
      {
        label: "M1",
        data: rows.map(r => r.m1),
        borderWidth: 2,
        tension: 0.25
      },
      {
        label: "M2",
        data: rows.map(r => r.m2),
        borderWidth: 2,
        tension: 0.25
      },
      {
        label: "M3",
        data: rows.map(r => r.m3),
        borderWidth: 2,
        tension: 0.25,
        hidden: currentRegion === "us"
      },
      {
        label: currentRegion === "ea" ? "HICP Inflation" : "CPI Inflation",
        data: rows.map(r => r.inflation),
        borderWidth: 2,
        tension: 0.25
      }
    ]
  };
}

function renderChart() {
  const regionData = state[currentRegion];
  const chartData = buildDatasets(regionData);

  const ctx = document.getElementById("macroChart").getContext("2d");

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
            color: "#f0ede4"
          }
        }
      },
      scales: {
        x: {
          ticks: {
            color: "#bfc7d5",
            maxTicksLimit: 10
          },
          grid: {
            color: "rgba(255,255,255,0.06)"
          }
        },
        y: {
          ticks: {
            color: "#bfc7d5",
            callback: (value) => `${value}%`
          },
          grid: {
            color: "rgba(255,255,255,0.06)"
          }
        }
      }
    }
  });

  document.getElementById("card-inflation").textContent = latestValue(regionData.inflation);
  document.getElementById("card-m1").textContent = latestValue(regionData.m1);
  document.getElementById("card-m2").textContent = latestValue(regionData.m2);
  document.getElementById("card-m3").textContent =
    currentRegion === "us" ? "Discontinued" : latestValue(regionData.m3);

  document.getElementById("macro-note").textContent =
    currentRegion === "ea"
      ? "Euro Area mode uses ECB monetary aggregates and HICP inflation."
      : "US mode uses FRED data for M1, M2 and CPI. Official US M3 is discontinued.";
}

// -----------------------------
// EVENTS
// -----------------------------

function setActiveButton(groupSelector, activeElement) {
  document.querySelectorAll(groupSelector).forEach(btn => btn.classList.remove("active"));
  activeElement.classList.add("active");
}

document.addEventListener("DOMContentLoaded", async () => {
  document.getElementById("region-ea").addEventListener("click", () => {
    currentRegion = "ea";
    setActiveButton(".macro-tab", document.getElementById("region-ea"));
    renderChart();
  });

  document.getElementById("region-us").addEventListener("click", () => {
    currentRegion = "us";
    setActiveButton(".macro-tab", document.getElementById("region-us"));
    renderChart();
  });

  document.querySelectorAll(".range-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      currentYears = Number(btn.dataset.years);
      setActiveButton(".range-btn", btn);
      renderChart();
    });
  });

  try {
    await Promise.all([loadEuroAreaData(), loadUSData()]);
    renderChart();
  } catch (err) {
    console.error(err);
    document.getElementById("macro-note").textContent =
      "Data could not be loaded yet. Check the series URLs in macro.js.";
  }
});
