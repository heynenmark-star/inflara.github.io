// ==============================
// GLOBAL CONFIG
// ==============================

const APP_CONFIG = {
  rpc: "https://eth-sepolia.g.alchemy.com/v2/SAnXKYhqMQWm0eYNvuPv_",
  contracts: {
    infl: "0x393289f921bbE6A684B79B9939816AAE68AC1B60",
    engine: "0x7E267b43b11e312A4685Bb48Ab2B10c43dA1Ef1E",
    controller: "0x1EEC97996986B5D0196a68D341D0C2D2C6D1775B"
  },
  addresses: {
    treasurySafe: "0x7E267b43b11e312A4685Bb48Ab2B10c43dA1Ef1E",
    stakingVault: "0x0000000000000000000000000000000000000000"
  }
};

const ABI = {
  token: [
    "function totalSupply() view returns (uint256)",
    "function balanceOf(address owner) view returns (uint256)",
    "function decimals() view returns (uint8)"
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

document.addEventListener("DOMContentLoaded", async () => {
  initFadeInObserver();
  initStarfield();
  await initDashboard();
});

// ==============================
// HELPERS
// ==============================

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function formatInfl(value) {
  return `${Number(value).toLocaleString(undefined, {
    maximumFractionDigits: 2
  })} INFL`;
}

function formatEth(value) {
  return `${Number(value).toLocaleString(undefined, {
    maximumFractionDigits: 4
  })} ETH`;
}

function formatPercentFromBps(bps) {
  return `${(Number(bps) / 100).toFixed(2)}%`;
}

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
// DASHBOARD
// ==============================

async function initDashboard() {
  const refreshButton = document.querySelector("[data-refresh-dashboard]");
  if (refreshButton) {
    refreshButton.addEventListener("click", loadDashboard);
  }

  await loadDashboard();
}

function setDashboardLoadingState() {
  const loadingIds = [
    "supply",
    "cpi",
    "emissions",

    "live-total-supply",
    "live-circulating-supply",
    "live-cpi",
    "live-epoch-emissions",
    "live-staking-vault",
    "live-staked-supply",
    "live-treasury-infl",
    "live-treasury-eth",

    "panel-total-supply",
    "panel-circulating-supply",
    "panel-cpi",
    "panel-emissions",
    "panel-staking-vault",
    "panel-treasury-infl",

    "flow-cpi",
    "flow-output",
    "flow-distribution"
  ];

  loadingIds.forEach((id) => setText(id, "Loading..."));
}

function setDashboardErrorState() {
  const errorIds = [
    "supply",
    "cpi",
    "emissions",

    "live-total-supply",
    "live-circulating-supply",
    "live-cpi",
    "live-epoch-emissions",
    "live-staking-vault",
    "live-staked-supply",
    "live-treasury-infl",
    "live-treasury-eth",

    "panel-total-supply",
    "panel-circulating-supply",
    "panel-cpi",
    "panel-emissions",
    "panel-staking-vault",
    "panel-treasury-infl",

    "flow-cpi",
    "flow-output",
    "flow-distribution"
  ];

  errorIds.forEach((id) => setText(id, "Error loading"));
}

async function loadDashboard() {
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

    const [
      rawSupply,
      rawCpi,
      preview,
      decimals,
      rawTreasuryInfl,
      rawTreasuryEth
    ] = await Promise.all([
      token.totalSupply(),
      engine.currentCPIBps(),
      controller.previewEpoch(),
      token.decimals(),
      token.balanceOf(APP_CONFIG.addresses.treasurySafe),
      provider.getBalance(APP_CONFIG.addresses.treasurySafe)
    ]);

    const totalSupply = Number(ethers.formatUnits(rawSupply, decimals));
    const cpiText = formatPercentFromBps(rawCpi);

    const mintTotal = preview.mintTotal ?? preview[2];
    const toStakers = preview.toStakers ?? preview[3];
    const toTreasury = preview.toTreasury ?? preview[4];

    const epochEmissions = Number(ethers.formatUnits(mintTotal, decimals));
    const treasuryInfl = Number(ethers.formatUnits(rawTreasuryInfl, decimals));
    const treasuryEth = Number(ethers.formatEther(rawTreasuryEth));

    // Placeholder until vault / vesting are wired properly
    const stakingVault = 0;
    const totalStaked = Number(ethers.formatUnits(toStakers, decimals));
    const circulatingSupply = totalSupply - treasuryInfl - stakingVault;

    const totalSupplyText = formatInfl(totalSupply);
    const circulatingSupplyText = formatInfl(circulatingSupply);
    const epochEmissionsText = formatInfl(epochEmissions);
    const stakingVaultText = formatInfl(stakingVault);
    const totalStakedText = formatInfl(totalStaked);
    const treasuryInflText = formatInfl(treasuryInfl);
    const treasuryEthText = formatEth(treasuryEth);
    const toTreasuryText = formatInfl(Number(ethers.formatUnits(toTreasury, decimals)));

    // Home page preview
    setText("supply", circulatingSupplyText);
    setText("cpi", cpiText);
    setText("emissions", epochEmissionsText);

    // Live data page cards
    setText("live-total-supply", totalSupplyText);
    setText("live-circulating-supply", circulatingSupplyText);
    setText("live-cpi", cpiText);
    setText("live-epoch-emissions", epochEmissionsText);
    setText("live-staking-vault", stakingVaultText);
    setText("live-staked-supply", totalStakedText);
    setText("live-treasury-infl", treasuryInflText);
    setText("live-treasury-eth", treasuryEthText);

    // Dashboard panel
    setText("panel-total-supply", totalSupplyText);
    setText("panel-circulating-supply", circulatingSupplyText);
    setText("panel-cpi", cpiText);
    setText("panel-emissions", epochEmissionsText);
    setText("panel-staking-vault", stakingVaultText);
    setText("panel-treasury-infl", treasuryInflText);

    // Flow section
    setText("flow-cpi", cpiText);
    setText("flow-output", epochEmissionsText);
    setText("flow-distribution", `Stakers: ${totalStakedText} / Treasury: ${toTreasuryText}`);
  } catch (error) {
    console.error("Dashboard load error:", error);
    setDashboardErrorState();
  }
}// FADE-IN OBSERVER
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
loadProtocolBalances();
function setDashboardLoadingState() {
  const supplyEl = document.getElementById("supply");
  const cpiEl = document.getElementById("cpi");
  const emissionsEl = document.getElementById("emissions");

  if (supplyEl) supplyEl.textContent = "Loading...";
  if (cpiEl) cpiEl.textContent = "Loading...";
  if (emissionsEl) emissionsEl.textContent = "Loading...";
}
