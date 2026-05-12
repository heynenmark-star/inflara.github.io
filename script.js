alert("script.js loaded");

document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("connect-wallet");
  const walletText = document.getElementById("wallet-address");
  const statusText = document.getElementById("staking-status");

  if (!btn) {
    alert("Connect button not found");
    return;
  }

  btn.addEventListener("click", async () => {
    try {
      alert("Button clicked");

      if (!window.ethereum) {
        alert("No wallet found. Open Rabby or MetaMask.");
        return;
      }

      const accounts = await window.ethereum.request({
        method: "eth_requestAccounts"
      });

      const account = accounts[0];

      if (walletText) walletText.textContent = account;
      if (statusText) statusText.textContent = "Wallet connected.";

      alert("Connected: " + account);
    } catch (err) {
      console.error(err);
      alert("Connection failed: " + err.message);
    }
  });
});  controller: [
    "function previewEpoch() view returns (uint256 cpiBps, uint256 annualRateBps, uint256 mintTotal, uint256 toStakers, uint256 toTreasury)"
  ]
};

let connectedProvider;
let connectedSigner;
let connectedAddress;

// ==============================
// APP INIT
// ==============================

document.addEventListener("DOMContentLoaded", async () => {
  initFadeInObserver();
  bindStakingButtons();

  if (document.getElementById("wallet-address")) {
    await refreshStakingUi();
  }
});

// ==============================
// HELPERS
// ==============================

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function setStatus(message) {
  setText("staking-status", message);
}

function formatInfl(value) {
  return `${Number(value).toLocaleString(undefined, {
    maximumFractionDigits: 6
  })} INFL`;
}

function parseInflAmount(inputId) {
  const el = document.getElementById(inputId);
  const value = el?.value;

  if (!value || Number(value) <= 0) {
    throw new Error("Enter an amount greater than 0");
  }

  return ethers.parseUnits(value, 18);
}

function shortAddress(address) {
  if (!address) return "Not connected";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

async function getReadProvider() {
  return new ethers.JsonRpcProvider(APP_CONFIG.rpc);
}

async function getWalletProvider() {
  if (!window.ethereum) {
    throw new Error("No wallet found. Open with Rabby or MetaMask installed.");
  }

  const provider = new ethers.BrowserProvider(window.ethereum);
  return provider;
}

async function ensureSepolia() {
  if (!window.ethereum) return;

  const currentChain = await window.ethereum.request({ method: "eth_chainId" });

  if (currentChain !== APP_CONFIG.chainIdHex) {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: APP_CONFIG.chainIdHex }]
    });
  }
}

// ==============================
// WALLET / STAKING
// ==============================

function bindStakingButtons() {
  document.getElementById("connect-wallet")?.addEventListener("click", connectWallet);
  document.getElementById("refresh-staking")?.addEventListener("click", refreshStakingUi);
  document.getElementById("approve-infl")?.addEventListener("click", approveInfl);
  document.getElementById("stake-infl")?.addEventListener("click", stakeInfl);
  document.getElementById("claim-rewards")?.addEventListener("click", claimRewards);
  document.getElementById("withdraw-infl")?.addEventListener("click", withdrawInfl);
  document.getElementById("exit-staking")?.addEventListener("click", exitStaking);
}

async function connectWallet() {
  try {
    setStatus("Connecting wallet...");
    await ensureSepolia();

    connectedProvider = await getWalletProvider();
    await connectedProvider.send("eth_requestAccounts", []);

    connectedSigner = await connectedProvider.getSigner();
    connectedAddress = await connectedSigner.getAddress();

    setText("wallet-address", connectedAddress);
    setText("wallet-network", APP_CONFIG.chainName);
    setStatus("Wallet connected.");

    await refreshStakingUi();
  } catch (error) {
    console.error(error);
    setStatus(error.message || "Wallet connection failed.");
  }
}

async function getConnectedContracts() {
  if (!connectedSigner) {
    await connectWallet();
  }

  const token = new ethers.Contract(
    APP_CONFIG.contracts.infl,
    ABI.token,
    connectedSigner
  );

  const vault = new ethers.Contract(
    APP_CONFIG.contracts.stakingVault,
    ABI.stakingVault,
    connectedSigner
  );

  return { token, vault };
}

async function refreshStakingUi() {
  try {
    const provider = await getReadProvider();

    const token = new ethers.Contract(
      APP_CONFIG.contracts.infl,
      ABI.token,
      provider
    );

    const vault = new ethers.Contract(
      APP_CONFIG.contracts.stakingVault,
      ABI.stakingVault,
      provider
    );

    const user = connectedAddress;

    if (!user) {
      setText("wallet-address", "Not connected");
      setText("wallet-network", "Sepolia");
      setText("wallet-infl-balance", "—");
      setText("vault-user-staked", "—");
      setText("vault-earned", "—");
      const totalStaked = await vault.totalStaked();
      setText("vault-total-staked", formatInfl(ethers.formatUnits(totalStaked, 18)));
      return;
    }

    const [walletBal, staked, earned, totalStaked] = await Promise.all([
      token.balanceOf(user),
      vault.balanceOf(user),
      vault.earned(user),
      vault.totalStaked()
    ]);

    setText("wallet-address", connectedAddress);
    setText("wallet-network", APP_CONFIG.chainName);
    setText("wallet-infl-balance", formatInfl(ethers.formatUnits(walletBal, 18)));
    setText("vault-user-staked", formatInfl(ethers.formatUnits(staked, 18)));
    setText("vault-earned", formatInfl(ethers.formatUnits(earned, 18)));
    setText("vault-total-staked", formatInfl(ethers.formatUnits(totalStaked, 18)));
  } catch (error) {
    console.error(error);
    setStatus("Could not refresh staking data.");
  }
}

async function approveInfl() {
  try {
    const amount = parseInflAmount("stake-amount");
    const { token } = await getConnectedContracts();

    setStatus("Approving INFL...");
    const tx = await token.approve(APP_CONFIG.contracts.stakingVault, amount);
    await tx.wait();

    setStatus("Approval confirmed.");
    await refreshStakingUi();
  } catch (error) {
    console.error(error);
    setStatus(error.reason || error.message || "Approval failed.");
  }
}

async function stakeInfl() {
  try {
    const amount = parseInflAmount("stake-amount");
    const { vault } = await getConnectedContracts();

    setStatus("Staking INFL...");
    const tx = await vault.stake(amount);
    await tx.wait();

    setStatus("Stake confirmed.");
    await refreshStakingUi();
  } catch (error) {
    console.error(error);
    setStatus(error.reason || error.message || "Stake failed.");
  }
}

async function claimRewards() {
  try {
    const { vault } = await getConnectedContracts();

    setStatus("Claiming rewards...");
    const tx = await vault.claimRewards();
    await tx.wait();

    setStatus("Rewards claimed.");
    await refreshStakingUi();
  } catch (error) {
    console.error(error);
    setStatus(error.reason || error.message || "Claim failed.");
  }
}

async function withdrawInfl() {
  try {
    const amount = parseInflAmount("withdraw-amount");
    const { vault } = await getConnectedContracts();

    setStatus("Withdrawing INFL...");
    const tx = await vault.withdraw(amount);
    await tx.wait();

    setStatus("Withdraw confirmed.");
    await refreshStakingUi();
  } catch (error) {
    console.error(error);
    setStatus(error.reason || error.message || "Withdraw failed.");
  }
}

async function exitStaking() {
  try {
    const { vault } = await getConnectedContracts();

    setStatus("Exiting staking...");
    const tx = await vault.exit();
    await tx.wait();

    setStatus("Exit confirmed.");
    await refreshStakingUi();
  } catch (error) {
    console.error(error);
    setStatus(error.reason || error.message || "Exit failed.");
  }
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
}document.addEventListener("DOMContentLoaded", async () => {
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

  window.addEventListener("resize", () => {
    resizeStarfield();
    createStars();
  });
}

function resizeStarfield() {
  if (!starfieldCanvas) return;
  starfieldCanvas.width = window.innerWidth;
  starfieldCanvas.height = window.innerHeight;
}

function createStars() {
  if (!starfieldCanvas) return;

  const count = Math.max(80, Math.floor(window.innerWidth / 12));
  stars = [];

  for (let i = 0; i < count; i++) {
    stars.push({
      x: Math.random() * starfieldCanvas.width,
      y: Math.random() * starfieldCanvas.height,
      radius: Math.random() * 1.6 + 0.2,
      speed: Math.random() * 0.25 + 0.05,
      opacity: Math.random() * 0.6 + 0.2
    });
  }
}

function drawStars() {
  if (!starfieldCanvas || !starfieldContext) return;

  starfieldContext.clearRect(0, 0, starfieldCanvas.width, starfieldCanvas.height);

  for (const star of stars) {
    starfieldContext.beginPath();
    starfieldContext.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
    starfieldContext.fillStyle = `rgba(255,255,255,${star.opacity})`;
    starfieldContext.fill();

    star.y += star.speed;

    if (star.y > starfieldCanvas.height) {
      star.y = -5;
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

function setLoadingState() {
  [
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
  ].forEach((id) => setText(id, "Loading..."));
}

function setFallbackState() {
  const totalSupplyText = "100,530,627 INFL";
  const circulatingText = "100,250,000 INFL";
  const cpiText = "2.50%";
  const emissionsText = "250,000 INFL";
  const stakingVaultText = "0 INFL";
  const totalStakedText = "0 INFL";
  const treasuryInflText = "30,000 INFL";
  const treasuryEthText = "0.0319 ETH";

  setText("supply", circulatingText);
  setText("cpi", cpiText);
  setText("emissions", emissionsText);

  setText("live-total-supply", totalSupplyText);
  setText("live-circulating-supply", circulatingText);
  setText("live-cpi", cpiText);
  setText("live-epoch-emissions", emissionsText);
  setText("live-staking-vault", stakingVaultText);
  setText("live-staked-supply", totalStakedText);
  setText("live-treasury-infl", treasuryInflText);
  setText("live-treasury-eth", treasuryEthText);

  setText("panel-total-supply", totalSupplyText);
  setText("panel-circulating-supply", circulatingText);
  setText("panel-cpi", cpiText);
  setText("panel-emissions", emissionsText);
  setText("panel-staking-vault", stakingVaultText);
  setText("panel-treasury-infl", treasuryInflText);

  setText("flow-cpi", cpiText);
  setText("flow-output", emissionsText);
  setText("flow-distribution", "Stakers / Treasury");
}

async function loadDashboard() {
  try {
    setLoadingState();

    if (typeof ethers === "undefined") {
      throw new Error("ethers not loaded");
    }

    if (
      !APP_CONFIG.contracts.infl ||
      APP_CONFIG.contracts.infl.includes("REPLACE_THIS")
    ) {
      throw new Error("Token address not set");
    }

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

    setText("supply", circulatingSupplyText);
    setText("cpi", cpiText);
    setText("emissions", epochEmissionsText);

    setText("live-total-supply", totalSupplyText);
    setText("live-circulating-supply", circulatingSupplyText);
    setText("live-cpi", cpiText);
    setText("live-epoch-emissions", epochEmissionsText);
    setText("live-staking-vault", stakingVaultText);
    setText("live-staked-supply", totalStakedText);
    setText("live-treasury-infl", treasuryInflText);
    setText("live-treasury-eth", treasuryEthText);

    setText("panel-total-supply", totalSupplyText);
    setText("panel-circulating-supply", circulatingSupplyText);
    setText("panel-cpi", cpiText);
    setText("panel-emissions", epochEmissionsText);
    setText("panel-staking-vault", stakingVaultText);
    setText("panel-treasury-infl", treasuryInflText);

    setText("flow-cpi", cpiText);
    setText("flow-output", epochEmissionsText);
    setText("flow-distribution", `Stakers: ${totalStakedText} / Treasury: ${toTreasuryText}`);
  } catch (error) {
    console.error("Dashboard load error:", error);
    setFallbackState();
  }
}  initFadeInObserver();
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
