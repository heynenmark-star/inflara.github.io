// ==============================
// INFLARA MACRO DASHBOARD
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
// DATA SOURCES
// ------------------------------

// ECB official data API
const ECB_BASE = "https://data-api.ecb.europa.eu/service/data";

// Euro Area monetary aggregates (annual growth rate)
// Dataset: BSI
const ECB_SERIES = {
  m1: `${ECB_BASE}/BSI/M.U2.Y.V.M10.X.I.U2.2300.Z01.A?format=jsondata`,
  m2: `${ECB_BASE}/BSI/M.U2.Y.V.M20.X.I.U2.2300.Z01.A?format=jsondata`,
  m3: `${ECB_BASE}/BSI/M.U2.Y.V.M30.X.I.U2.2300.Z01.A?format=jsondata`,

  // Try new HICP dataset first, then fallback to older ICP dataset
  inflationPrimary: `${ECB_BASE}/HICP/M.U2.N.000000.4.ANR?format=jsondata`,
  inflationFallback: `${ECB_BASE}/ICP/M.U2.N.000000.4.ANR?format=jsondata`
};

// FRED CSV download endpoints
const FRED_BASE = "https://fred.stlouisfed.org/graph/fredgraph.csv?id=";

// US series
// M1SL = M1, M2SL = M2, CPIAUCSL = CPI
const FRED_SERIES = {
  m1: `${FRED_BASE}M1SL`,
  m2: `${FRED_BASE}M2SL`,
  inflationBase: `${FRED_BASE}CPIAUCSL`
};

// ------------------------------
// HELPERS
// ------------------------------

function formatMonthLabel(dateString) {
  if (!dateString) return "";
  return dateString.slice(0, 7);
}

function parseMonthDate(label) {
  return new Date(`${label}-01T00:00:00`);
}

function latestValue(series) {
  if (!series || !series.length) return "Loading...";
  const value = series[series.length - 1].value;
  return `${value.toFixed(1)}%`;
}

function getCutoffDate(years) {
  if (!years) return null;
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - years);
  return cutoff;
}

function filterByYears(series, years) {
  if (!years) return series;
  const cutoff = getCutoffDate(years);
  return series.filter((item) => item.date >= cutoff);
}

function sortSeries(series) {
  return [...series].sort((a, b) => a.date - b.date);
}

function mergeLabels(seriesCollection) {
  const set = new Set();

  seriesCollection.forEach((series) => {
    series.forEach((row) => set.add(row.label));
  });

  return Array.from(set).sort();
}

function mapSeriesToLabels(labels, series) {
  const map = new Map(series.map((row) => [row.label, row.value]));
  return labels.map((label) => (map.has(label) ? map.get(label) : null));
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function setActive(groupSelector, activeElement) {
  document.querySelectorAll(groupSelector).forEach((el) => {
    el.classList.remove("active");
  });
  activeElement.classList.add("active");
}

// ------------------------------
// FETCH HELPERS
// ------------------------------

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

async function fetchText(url) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${response.statusText}`);
  }

  return response.text();
}

// ------------------------------
// ECB PARSING
// ------------------------------

function parseECBSeries(json) {
  const dataset = json?.dataSets?.[0];
  const structure = json?.structure;

  if (!dataset || !structure) {
    return [];
  }

  const seriesKeys = Object.keys(dataset.series || {});
  if (!seriesKeys.length) {
    return [];
  }

  const firstSeries = dataset.series[seriesKeys[0]];
  const observations = firstSeries?.observations || {};

  const observationDimension = structure?.dimensions?.observation?.[0]?.values || [];

  const parsed = Object.entries(observations)
    .map(([index, valueArray]) => {
      const observationMeta = observationDimension[Number(index)];
      const rawDate = observationMeta?.id || observationMeta?.name;

      if (!rawDate || !valueArray || valueArray[0] === null || valueArray[0] === undefined) {
        return null;
      }

      const value = Number(valueArray[0]);
      if (Number.isNaN(value)) {
        return null;
      }

      const label = formatMonthLabel(rawDate);

      return {
        label,
        date: parseMonthDate(label),
        value
      };
    })
    .filter(Boolean);

  return sortSeries(parsed);
}

async function loadEuroAreaData() {
  const [m1Json, m2Json, m3Json] = await Promise.all([
    fetchJson(ECB_SERIES.m1),
    fetchJson(ECB_SERIES.m2),
    fetchJson(ECB_SERIES.m3)
  ]);

  let inflationJson;
  try {
    inflationJson = await fetchJson(ECB_SERIES.inflationPrimary);
  } catch (error) {
    inflationJson = await fetchJson(ECB_SERIES.inflationFallback);
  }

  macroState.ea.m1 = parseECBSeries(m1Json);
  macroState.ea.m2 = parseECBSeries(m2Json);
  macroState.ea.m3 = parseECBSeries(m3Json);
  macroState.ea.inflation = parseECBSeries(inflationJson);
}

// ------------------------------
// FRED PARSING
// ------------------------------

function parseFredCsv(csvText) {
  const lines = csvText.trim().split("\n");
  if (lines.length < 2) return [];

  const rows = [];

  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line) continue;

    const parts = line.split(",");
    if (parts.length < 2) continue;

    const rawDate = parts[0];
    const rawValue = parts[1];

    if (!rawDate || rawValue === ".") continue;

    const value = Number(rawValue);
    if (Number.isNaN(value)) continue;

    const label = formatMonthLabel(rawDate);

    rows.push({
      label,
      date: parseMonthDate(label),
      value
    });
  }

  return sortSeries(rows);
}

function toYearOverYearPercent(series) {
  const output = [];

  for (let i = 12; i < series.length; i += 1) {
    const current = series[i];
    const previous = series[i - 12];

    if (!previous || previous.value === 0) continue;

    const yoy = ((current.value / previous.value) - 1) * 100;

    if (Number.isNaN(yoy) || !Number.isFinite(yoy)) continue;

    output.push({
      label: current.label,
      date: current.date,
      value: yoy
    });
  }

  return output;
}

async function loadUSData() {
  const [m1Csv, m2Csv, inflationCsv] = await Promise.all([
    fetchText(FRED_SERIES.m1),
    fetchText(FRED_SERIES.m2),
    fetchText(FRED_SERIES.inflationBase)
  ]);

  const m1Levels = parseFredCsv(m1Csv);
  const m2Levels = parseFredCsv(m2Csv);
  const inflationLevels = parseFredCsv(inflationCsv);

  macroState.us.m1 = toYearOverYearPercent(m1Levels);
  macroState.us.m2 = toYearOverYearPercent(m2Levels);
  macroState.us.m3 = []; // official US M3 discontinued
  macroState.us.inflation = toYearOverYearPercent(inflationLevels);
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
        tension: 0.25
      },
      {
        label: "M1",
        data: mapSeriesToLabels(labels, m1),
        borderColor: "#7cb4ff",
        backgroundColor: "rgba(124, 180, 255, 0.15)",
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.25
      },
      {
        label: "M2",
        data: mapSeriesToLabels(labels, m2),
        borderColor: "#8df0d2",
        backgroundColor: "rgba(141, 240, 210, 0.15)",
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.25
      },
      {
        label: "M3",
        data: mapSeriesToLabels(labels, m3),
        borderColor: "#d4af37",
        backgroundColor: "rgba(212, 175, 55, 0.15)",
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.25,
        hidden: currentRegion === "us"
      }
    ]
  };
}

// ------------------------------
// CHART RENDER
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
              if (value === null || value === undefined) return `${context.dataset.label}: —`;
              return `${context.dataset.label}: ${Number(value).toFixed(1)}%`;
            }
          }
        }
      },
      scales: {
        x: {
          ticks: {
            color: "#9aa0a6",
            maxTicksLimit: 12
          },
          grid: {
            color: "rgba(255,255,255,0.06)"
          }
        },
        y: {
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
      "US mode shows M1, M2 and CPI year-over-year change. Official US M3 is discontinued."
    );
  } else {
    setText("card-m3", latestValue(regionData.m3));
    setText(
      "macro-note",
      "Euro Area mode shows ECB monetary aggregates and euro area inflation as annual growth rates."
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

async function initMacroPage() {
  const chartCanvas = document.getElementById("macroChart");
  if (!chartCanvas) return;

  bindMacroEvents();

  setText("macro-note", "Loading macro data...");

  try {
    await Promise.all([
      loadEuroAreaData(),
      loadUSData()
    ]);

    renderMacroDashboard();
  } catch (error) {
    console.error("Macro dashboard load error:", error);
    setText("macro-note", "Could not load macro data. Check the browser console for details.");
    setText("card-inflation", "Error");
    setText("card-m1", "Error");
    setText("card-m2", "Error");
    setText("card-m3", "Error");
  }
}

document.addEventListener("DOMContentLoaded", initMacroPage);
