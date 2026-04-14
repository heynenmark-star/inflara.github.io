// ==============================
// GLOBAL CONFIG
// ==============================

const APP_CONFIG = {
  rpc: "https://eth-sepolia.g.alchemy.com/v2/SAnXKYhqMQWm0eYNvuPv_",
  contracts: {
    infl: "0x393289f921bbE6A684B79B9939816AAE68AC1B60",
    engine: "0x8a00327e3631B2e63B320c1E107055fd9fd15f40",
    controller: "0x30481Cc7D7A0F437dec661e36b0a5394F74bBe62"
  }
};

const ABI = {
  token: [
    "function totalSupply() view returns (uint256)"
  ],
  engine: [
    "function currentCPIBps() view returns (uint256)"
  ],
  controller: [
    "function previewEpoch() view returns (uint256 cpiBps, uint256 annualRateBps, uint256 mintTotal, uint256 toStakers, uint256 toTreasury)"
  ]
};

// ==============================
// APP INIT
// ==============================

document.addEventListener("DOMContentLoaded", () => {
  initFadeInObserver();
  initStarfield();
  initDashboard();
});

// ==============================
// FADE-IN OBSERVER
// ==============================

function initFadeInObserver() {
  const elements = document.querySelectorAll(".fade-in");
  if (!elements.length) return;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("visible");
        observer.unobserve(entry.target);
      });
    },
    { threshold: 0.15 }
  );

  elements.forEach((element) => observer.observe(element));
}

// ==============================
// STARFIELD BACKGROUND
// ==============================

let starfieldCanvas = null;
let starfieldContext = null;
let stars = [];
let starAnimationStarted = false;

const STAR_COUNT = 100;

function initStarfield() {
  starfieldCanvas = document.getElementById("starfield");
  if (!starfieldCanvas) return;

  starfieldContext = starfieldCanvas.getContext("2d");
  if (!starfieldContext) return;

  resizeStarfield();
  createStars();

  if (!starAnimationStarted) {
    starAnimationStarted = true;
    requestAnimationFrame(drawStars);
  }

  window.addEventListener("resize", handleStarfieldResize);
}

function handleStarfieldResize() {
  resizeStarfield();
  createStars();
}

function resizeStarfield() {
  if (!starfieldCanvas) return;
  starfieldCanvas.width = window.innerWidth;
  starfieldCanvas.height = window.innerHeight;
}

function createStars() {
  if (!starfieldCanvas) return;

  stars = [];
  for (let i = 0; i < STAR_COUNT; i += 1) {
    stars.push({
      x: Math.random() * starfieldCanvas.width,
      y: Math.random() * starfieldCanvas.height,
      radius: Math.random() * 1.5,
      speed: 0.05 + Math.random() * 0.10,
      opacity: 0.25 + Math.random() * 0.50
    });
  }
}

function drawStars() {
  if (!starfieldCanvas || !starfieldContext) return;

  starfieldContext.clearRect(0, 0, starfieldCanvas.width, starfieldCanvas.height);

  for (const star of stars) {
    starfieldContext.beginPath();
    starfieldContext.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
    starfieldContext.fillStyle = `rgba(255, 255, 255, ${star.opacity})`;
    starfieldContext.fill();

    star.y -= star.speed;

    if (star.y < 0) {
      star.y = starfieldCanvas.height;
      star.x = Math.random() * starfieldCanvas.width;
    }
  }

  requestAnimationFrame(drawStars);
}

// ==============================
// INFLARA DASHBOARD
// ==============================

async function initDashboard() {
  const supplyEl = document.getElementById("supply");
  const cpiEl = document.getElementById("cpi");
  const emissionsEl = document.getElementById("emissions");

  const hasDashboard =
    supplyEl !== null || cpiEl !== null || emissionsEl !== null;

  if (!hasDashboard) return;

  await loadDashboard();

  const refreshButton = document.querySelector("[data-refresh-dashboard]");
  if (refreshButton) {
    refreshButton.addEventListener("click", loadDashboard);
  }
}
async function loadProtocolBalances() {
  const provider = new ethers.JsonRpcProvider(LIVE_CONFIG.rpc);

  const abi = [
    "function balanceOf(address) view returns (uint256)"
  ];

  const token = new ethers.Contract(LIVE_CONFIG.infl, abi, provider);

  const vault = await token.balanceOf(LIVE_CONFIG.stakingVault);
  const treasury = await token.balanceOf(LIVE_CONFIG.treasury);
  const safe = await token.balanceOf(LIVE_CONFIG.protocolSafe);

  document.getElementById("vault-balance").textContent =
    ethers.formatUnits(vault, 18) + " INFL";

  document.getElementById("treasury-balance").textContent =
    ethers.formatUnits(treasury, 18) + " INFL";

  document.getElementById("safe-balance").textContent =
    ethers.formatUnits(safe, 18) + " INFL";
}
async function loadDashboard() {
  const supplyEl = document.getElementById("supply");
  const cpiEl = document.getElementById("cpi");
  const emissionsEl = document.getElementById("emissions");

  try {
    if (typeof ethers === "undefined") {
      throw new Error("ethers library not loaded");
    }

    setDashboardLoadingState();

    const provider = new ethers.JsonRpcProvider(APP_CONFIG.rpc);

    const token = new ethers.Contract(
      APP_CONFIG.contracts.infl,
      ABI.token,
      provider
    );

    const engine = new ethers.Contract(
      APP_CONFIG.contracts.engine,
      ABI.engine,
      provider
    );

    const controller = new ethers.Contract(
      APP_CONFIG.contracts.controller,
      ABI.controller,
      provider
    );

    const [supply, cpi, preview] = await Promise.all([
      token.totalSupply(),
      engine.currentCPIBps(),
      controller.previewEpoch()
    ]);

    const formattedSupply =
      Number(ethers.formatUnits(supply, 18)).toLocaleString() + " INFL";

    const formattedCpi =
      (Number(cpi) / 100).toFixed(2) + "%";

    const mintTotal = preview.mintTotal ?? preview[2];
    const formattedEmissions =
      Number(ethers.formatUnits(mintTotal, 18)).toLocaleString() + " INFL";

    if (supplyEl) supplyEl.textContent = formattedSupply;
    if (cpiEl) cpiEl.textContent = formattedCpi;
    if (emissionsEl) emissionsEl.textContent = formattedEmissions;
  } catch (error) {
    console.error("Dashboard load error:", error);

    if (supplyEl) supplyEl.textContent = "Error loading";
    if (cpiEl) cpiEl.textContent = "Error loading";
    if (emissionsEl) emissionsEl.textContent = "Error loading";
  }
}

function setDashboardLoadingState() {
  const supplyEl = document.getElementById("supply");
  const cpiEl = document.getElementById("cpi");
  const emissionsEl = document.getElementById("emissions");

  if (supplyEl) supplyEl.textContent = "Loading...";
  if (cpiEl) cpiEl.textContent = "Loading...";
  if (emissionsEl) emissionsEl.textContent = "Loading...";
}
