const APP_CONFIG = {
  chainIdHex: "0xaa36a7",
  chainName: "Sepolia",
  rpc: "https://eth-sepolia.g.alchemy.com/v2/SAnXKYhqMQWm0eYNvuPv_",
  contracts: {
    infl: "0x393289f921bbE6A684B79B9939816AAE68AC1B60",
    stakingVault: "0x1EEC97996986B5D0196a68D341D0C2D2C6D1775B"
  }
};

const ABI = {
  token: [
    "function balanceOf(address owner) view returns (uint256)",
    "function approve(address spender, uint256 amount) returns (bool)"
  ],
  stakingVault: [
    "function stake(uint256 amount)",
    "function withdraw(uint256 amount)",
    "function claimRewards()",
    "function exit()",
    "function balanceOf(address account) view returns (uint256)",
    "function earned(address account) view returns (uint256)",
    "function totalStaked() view returns (uint256)"
  ]
};

let provider;
let signer;
let userAddress;

document.addEventListener("DOMContentLoaded", async () => {
  initStarfield();
  bindStakingButtons();
  await reconnectIfAlreadyConnected();
  await refreshStakingUi();
});

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function setStatus(value) {
  setText("staking-status", value);
}

function shortAddress(address) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function updateWalletButton() {
  const connectBtn = document.getElementById("connect-wallet");
  if (!connectBtn) return;

  connectBtn.textContent = userAddress ? shortAddress(userAddress) : "Connect Wallet";
}

function formatInfl(raw) {
  return `${Number(ethers.formatUnits(raw, 18)).toLocaleString(undefined, {
    maximumFractionDigits: 6
  })} INFL`;
}

function parseAmount(id) {
  const value = document.getElementById(id)?.value;
  if (!value || Number(value) <= 0) {
    throw new Error("Enter an amount greater than 0");
  }
  return ethers.parseUnits(value, 18);
}

async function getReadContracts() {
  const readProvider = new ethers.JsonRpcProvider(APP_CONFIG.rpc);

  return {
    token: new ethers.Contract(APP_CONFIG.contracts.infl, ABI.token, readProvider),
    vault: new ethers.Contract(APP_CONFIG.contracts.stakingVault, ABI.stakingVault, readProvider)
  };
}

async function getWriteContracts() {
  if (!signer) await connectWallet();

  return {
    token: new ethers.Contract(APP_CONFIG.contracts.infl, ABI.token, signer),
    vault: new ethers.Contract(APP_CONFIG.contracts.stakingVault, ABI.stakingVault, signer)
  };
}

async function ensureSepolia() {
  if (!window.ethereum) throw new Error("No wallet found");

  const chainId = await window.ethereum.request({ method: "eth_chainId" });

  if (chainId !== APP_CONFIG.chainIdHex) {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: APP_CONFIG.chainIdHex }]
    });
  }
}

function bindStakingButtons() {
  document.getElementById("connect-wallet")?.addEventListener("click", handleWalletButton);
  document.getElementById("refresh-staking")?.addEventListener("click", refreshStakingUi);
  document.getElementById("approve-infl")?.addEventListener("click", approveInfl);
  document.getElementById("stake-infl")?.addEventListener("click", stakeInfl);
  document.getElementById("claim-rewards")?.addEventListener("click", claimRewards);
  document.getElementById("withdraw-infl")?.addEventListener("click", withdrawInfl);
  document.getElementById("exit-staking")?.addEventListener("click", exitStaking);

  if (window.ethereum) {
    window.ethereum.on?.("accountsChanged", handleAccountsChanged);
    window.ethereum.on?.("chainChanged", () => window.location.reload());
  }
}

async function handleWalletButton() {
  if (userAddress) {
    disconnectWallet();
  } else {
    await connectWallet();
  }
}

async function connectWallet() {
  try {
    setStatus("Connecting wallet...");

    await ensureSepolia();

    provider = new ethers.BrowserProvider(window.ethereum);
    await provider.send("eth_requestAccounts", []);

    signer = await provider.getSigner();
    userAddress = await signer.getAddress();

    setText("wallet-address", userAddress);
    setText("wallet-network", APP_CONFIG.chainName);
    updateWalletButton();

    setStatus("Wallet connected.");

    await refreshStakingUi();
  } catch (error) {
    console.error(error);
    setStatus(error.reason || error.message || "Connection failed.");
  }
}

function disconnectWallet() {
  provider = null;
  signer = null;
  userAddress = null;

  setText("wallet-address", "Not connected");
  setText("wallet-network", "—");
  setText("wallet-infl-balance", "—");
  setText("vault-user-staked", "—");
  setText("vault-earned", "—");

  updateWalletButton();
  setStatus("Wallet disconnected.");
}

async function reconnectIfAlreadyConnected() {
  try {
    if (!window.ethereum) {
      updateWalletButton();
      return;
    }

    const accounts = await window.ethereum.request({
      method: "eth_accounts"
    });

    if (!accounts.length) {
      updateWalletButton();
      return;
    }

    await ensureSepolia();

    provider = new ethers.BrowserProvider(window.ethereum);
    signer = await provider.getSigner();
    userAddress = await signer.getAddress();

    setText("wallet-address", userAddress);
    setText("wallet-network", APP_CONFIG.chainName);
    updateWalletButton();

    setStatus("Wallet connected.");
  } catch (error) {
    console.error(error);
    updateWalletButton();
  }
}

async function handleAccountsChanged(accounts) {
  if (!accounts.length) {
    disconnectWallet();
    return;
  }

  userAddress = accounts[0];
  provider = new ethers.BrowserProvider(window.ethereum);
  signer = await provider.getSigner();

  setText("wallet-address", userAddress);
  setText("wallet-network", APP_CONFIG.chainName);
  updateWalletButton();

  setStatus("Wallet changed.");
  await refreshStakingUi();
}

async function refreshStakingUi() {
  try {
    if (!document.getElementById("vault-total-staked")) return;

    const { token, vault } = await getReadContracts();

    const totalStaked = await vault.totalStaked();
    setText("vault-total-staked", formatInfl(totalStaked));

    if (!userAddress) {
      setText("wallet-address", "Not connected");
      setText("wallet-network", "—");
      setText("wallet-infl-balance", "—");
      setText("vault-user-staked", "—");
      setText("vault-earned", "—");
      updateWalletButton();
      return;
    }

    const [walletBalance, userStaked, earned] = await Promise.all([
      token.balanceOf(userAddress),
      vault.balanceOf(userAddress),
      vault.earned(userAddress)
    ]);

    setText("wallet-infl-balance", formatInfl(walletBalance));
    setText("vault-user-staked", formatInfl(userStaked));
    setText("vault-earned", formatInfl(earned));
  } catch (error) {
    console.error(error);
    setStatus("Could not refresh staking data.");
  }
}

async function approveInfl() {
  try {
    const amount = parseAmount("stake-amount");
    const { token } = await getWriteContracts();

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
    const amount = parseAmount("stake-amount");
    const { vault } = await getWriteContracts();

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
    const { vault } = await getWriteContracts();

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
    const amount = parseAmount("withdraw-amount");
    const { vault } = await getWriteContracts();

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
    const { vault } = await getWriteContracts();

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

function initStarfield() {
  const canvas = document.getElementById("starfield");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  let stars = [];

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    stars = Array.from({ length: 120 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      r: Math.random() * 1.5 + 0.2,
      s: Math.random() * 0.25 + 0.05,
      o: Math.random() * 0.6 + 0.25
    }));
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (const star of stars) {
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,255,${star.o})`;
      ctx.fill();

      star.y -= star.s;
      if (star.y < 0) {
        star.y = canvas.height;
        star.x = Math.random() * canvas.width;
      }
    }

    requestAnimationFrame(draw);
  }

  resize();
  window.addEventListener("resize", resize);
  draw();
}function shortAddress(address) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function updateWalletButton() {
  const connectBtn = document.getElementById("connect-wallet");
  if (!connectBtn) return;

  connectBtn.textContent = userAddress ? shortAddress(userAddress) : "Connect Wallet";
}

function formatInfl(raw) {
  return `${Number(ethers.formatUnits(raw, 18)).toLocaleString(undefined, {
    maximumFractionDigits: 6
  })} INFL`;
}

function parseAmount(id) {
  const value = document.getElementById(id)?.value;
  if (!value || Number(value) <= 0) {
    throw new Error("Enter an amount greater than 0");
  }
  return ethers.parseUnits(value, 18);
}

async function getReadContracts() {
  const readProvider = new ethers.JsonRpcProvider(APP_CONFIG.rpc);

  return {
    token: new ethers.Contract(APP_CONFIG.contracts.infl, ABI.token, readProvider),
    vault: new ethers.Contract(APP_CONFIG.contracts.stakingVault, ABI.stakingVault, readProvider)
  };
}

async function getWriteContracts() {
  if (!signer) await connectWallet();

  return {
    token: new ethers.Contract(APP_CONFIG.contracts.infl, ABI.token, signer),
    vault: new ethers.Contract(APP_CONFIG.contracts.stakingVault, ABI.stakingVault, signer)
  };
}

async function ensureSepolia() {
  if (!window.ethereum) throw new Error("No wallet found");

  const chainId = await window.ethereum.request({ method: "eth_chainId" });

  if (chainId !== APP_CONFIG.chainIdHex) {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: APP_CONFIG.chainIdHex }]
    });
  }
}

function bindStakingButtons() {
  document.getElementById("connect-wallet")?.addEventListener("click", handleWalletButton);
  document.getElementById("refresh-staking")?.addEventListener("click", refreshStakingUi);
  document.getElementById("approve-infl")?.addEventListener("click", approveInfl);
  document.getElementById("stake-infl")?.addEventListener("click", stakeInfl);
  document.getElementById("claim-rewards")?.addEventListener("click", claimRewards);
  document.getElementById("withdraw-infl")?.addEventListener("click", withdrawInfl);
  document.getElementById("exit-staking")?.addEventListener("click", exitStaking);

  if (window.ethereum) {
    window.ethereum.on?.("accountsChanged", handleAccountsChanged);
    window.ethereum.on?.("chainChanged", () => window.location.reload());
  }
}

async function handleWalletButton() {
  if (userAddress) {
    disconnectWallet();
  } else {
    await connectWallet();
  }
}

async function connectWallet() {
  try {
    setStatus("Connecting wallet...");

    await ensureSepolia();

    provider = new ethers.BrowserProvider(window.ethereum);
    await provider.send("eth_requestAccounts", []);

    signer = await provider.getSigner();
    userAddress = await signer.getAddress();

    setText("wallet-address", userAddress);
    setText("wallet-network", APP_CONFIG.chainName);
    updateWalletButton();

    setStatus("Wallet connected.");

    await refreshStakingUi();
  } catch (error) {
    console.error(error);
    setStatus(error.reason || error.message || "Connection failed.");
  }
}

function disconnectWallet() {
  provider = null;
  signer = null;
  userAddress = null;

  setText("wallet-address", "Not connected");
  setText("wallet-network", "—");
  setText("wallet-infl-balance", "—");
  setText("vault-user-staked", "—");
  setText("vault-earned", "—");

  updateWalletButton();
  setStatus("Wallet disconnected.");
}

async function reconnectIfAlreadyConnected() {
  try {
    if (!window.ethereum) {
      updateWalletButton();
      return;
    }

    const accounts = await window.ethereum.request({
      method: "eth_accounts"
    });

    if (!accounts.length) {
      updateWalletButton();
      return;
    }

    await ensureSepolia();

    provider = new ethers.BrowserProvider(window.ethereum);
    signer = await provider.getSigner();
    userAddress = await signer.getAddress();

    setText("wallet-address", userAddress);
    setText("wallet-network", APP_CONFIG.chainName);
    updateWalletButton();

    setStatus("Wallet connected.");
  } catch (error) {
    console.error(error);
    updateWalletButton();
  }
}

async function handleAccountsChanged(accounts) {
  if (!accounts.length) {
    disconnectWallet();
    return;
  }

  userAddress = accounts[0];
  provider = new ethers.BrowserProvider(window.ethereum);
  signer = await provider.getSigner();

  setText("wallet-address", userAddress);
  setText("wallet-network", APP_CONFIG.chainName);
  updateWalletButton();

  setStatus("Wallet changed.");
  await refreshStakingUi();
}

async function refreshStakingUi() {
  try {
    if (!document.getElementById("vault-total-staked")) return;

    const { token, vault } = await getReadContracts();

    const totalStaked = await vault.totalStaked();
    setText("vault-total-staked", formatInfl(totalStaked));

    if (!userAddress) {
      setText("wallet-address", "Not connected");
      setText("wallet-network", "—");
      setText("wallet-infl-balance", "—");
      setText("vault-user-staked", "—");
      setText("vault-earned", "—");
      updateWalletButton();
      return;
    }

    const [walletBalance, userStaked, earned] = await Promise.all([
      token.balanceOf(userAddress),
      vault.balanceOf(userAddress),
      vault.earned(userAddress)
    ]);

    setText("wallet-infl-balance", formatInfl(walletBalance));
    setText("vault-user-staked", formatInfl(userStaked));
    setText("vault-earned", formatInfl(earned));
  } catch (error) {
    console.error(error);
    setStatus("Could not refresh staking data.");
  }
}

async function approveInfl() {
  try {
    const amount = parseAmount("stake-amount");
    const { token } = await getWriteContracts();

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
    const amount = parseAmount("stake-amount");
    const { vault } = await getWriteContracts();

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
    const { vault } = await getWriteContracts();

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
    const amount = parseAmount("withdraw-amount");
    const { vault } = await getWriteContracts();

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
    const { vault } = await getWriteContracts();

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

function initStarfield() {
  const canvas = document.getElementById("starfield");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  let stars = [];

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    stars = Array.from({ length: 120 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      r: Math.random() * 1.5 + 0.2,
      s: Math.random() * 0.25 + 0.05,
      o: Math.random() * 0.6 + 0.25
    }));
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (const star of stars) {
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,255,${star.o})`;
      ctx.fill();

      star.y -= star.s;
      if (star.y < 0) {
        star.y = canvas.height;
        star.x = Math.random() * canvas.width;
      }
    }

    requestAnimationFrame(draw);
  }

  resize();
  window.addEventListener("resize", resize);
  draw();
}
function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function setStatus(value) {
  setText("staking-status", value);
}

function formatInfl(raw) {
  return `${Number(ethers.formatUnits(raw, 18)).toLocaleString(undefined, {
    maximumFractionDigits: 6
  })} INFL`;
}

function parseAmount(id) {
  const value = document.getElementById(id)?.value;
  if (!value || Number(value) <= 0) {
    throw new Error("Enter an amount greater than 0");
  }
  return ethers.parseUnits(value, 18);
}

async function getReadContracts() {
  const readProvider = new ethers.JsonRpcProvider(APP_CONFIG.rpc);

  return {
    token: new ethers.Contract(APP_CONFIG.contracts.infl, ABI.token, readProvider),
    vault: new ethers.Contract(APP_CONFIG.contracts.stakingVault, ABI.stakingVault, readProvider)
  };
}

async function getWriteContracts() {
  if (!signer) await connectWallet();

  return {
    token: new ethers.Contract(APP_CONFIG.contracts.infl, ABI.token, signer),
    vault: new ethers.Contract(APP_CONFIG.contracts.stakingVault, ABI.stakingVault, signer)
  };
}

async function ensureSepolia() {
  if (!window.ethereum) throw new Error("No wallet found");

  const chainId = await window.ethereum.request({ method: "eth_chainId" });

  if (chainId !== APP_CONFIG.chainIdHex) {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: APP_CONFIG.chainIdHex }]
    });
  }
}

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

    provider = new ethers.BrowserProvider(window.ethereum);
    await provider.send("eth_requestAccounts", []);

    signer = await provider.getSigner();
    userAddress = await signer.getAddress();

    setText("wallet-address", userAddress);
    setText("wallet-network", APP_CONFIG.chainName);

    const connectBtn = document.getElementById("connect-wallet");

    connectBtn.textContent =
      userAddress.slice(0, 6) + "..." + userAddress.slice(-4);

    connectBtn.onclick = disconnectWallet;

    setStatus("Wallet connected.");

    await refreshStakingUi();

  } catch (error) {
    console.error(error);
    setStatus(error.message || "Connection failed.");
  }
}
function disconnectWallet() {
  provider = null;
  signer = null;
  userAddress = null;

  setText("wallet-address", "Not connected");
  setText("wallet-network", "—");
  setText("wallet-infl-balance", "—");
  setText("vault-user-staked", "—");
  setText("vault-earned", "—");

  const connectBtn = document.getElementById("connect-wallet");

  connectBtn.textContent = "Connect Wallet";
  connectBtn.onclick = connectWallet;

  setStatus("Wallet disconnected.");
}

async function reconnectIfAlreadyConnected() {
  try {
    if (!window.ethereum) return;

    const accounts = await window.ethereum.request({
      method: "eth_accounts"
    });

    if (!accounts.length) return;

    await ensureSepolia();

    provider = new ethers.BrowserProvider(window.ethereum);
    signer = await provider.getSigner();
    userAddress = await signer.getAddress();

    setText("wallet-address", userAddress);
    setText("wallet-network", APP_CONFIG.chainName);
    setStatus("Wallet connected.");
  } catch (error) {
    console.error(error);
  }
}

async function refreshStakingUi() {
  try {
    if (!document.getElementById("vault-total-staked")) return;

    const { token, vault } = await getReadContracts();

    const totalStaked = await vault.totalStaked();
    setText("vault-total-staked", formatInfl(totalStaked));

    if (!userAddress) {
      setText("wallet-address", "Not connected");
      setText("wallet-network", "—");
      setText("wallet-infl-balance", "—");
      setText("vault-user-staked", "—");
      setText("vault-earned", "—");
      return;
    }

    const [walletBalance, userStaked, earned] = await Promise.all([
      token.balanceOf(userAddress),
      vault.balanceOf(userAddress),
      vault.earned(userAddress)
    ]);

    setText("wallet-infl-balance", formatInfl(walletBalance));
    setText("vault-user-staked", formatInfl(userStaked));
    setText("vault-earned", formatInfl(earned));
  } catch (error) {
    console.error(error);
    setStatus("Could not refresh staking data.");
  }
}

async function approveInfl() {
  try {
    const amount = parseAmount("stake-amount");
    const { token } = await getWriteContracts();

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
    const amount = parseAmount("stake-amount");
    const { vault } = await getWriteContracts();

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
    const { vault } = await getWriteContracts();

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
    const amount = parseAmount("withdraw-amount");
    const { vault } = await getWriteContracts();

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
    const { vault } = await getWriteContracts();

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

function initStarfield() {
  const canvas = document.getElementById("starfield");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  let stars = [];

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    stars = Array.from({ length: 120 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      r: Math.random() * 1.5 + 0.2,
      s: Math.random() * 0.25 + 0.05,
      o: Math.random() * 0.6 + 0.25
    }));
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (const star of stars) {
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,255,${star.o})`;
      ctx.fill();

      star.y -= star.s;
      if (star.y < 0) {
        star.y = canvas.height;
        star.x = Math.random() * canvas.width;
      }
    }

    requestAnimationFrame(draw);
  }

  resize();
  window.addEventListener("resize", resize);
  draw();
}

