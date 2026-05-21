const APP_CONFIG = {
  chainIdHex: "0xaa36a7",
  chainName: "Sepolia",

  rpcs: [
    {
      name: "Primary Alchemy",
      url: "https://eth-sepolia.g.alchemy.com/v2/SAnXKYhqMQWm0eYNvuPv_"
    },
    {
      name: "Backup PublicNode",
      url: "https://ethereum-sepolia-rpc.publicnode.com"
    },
    {
      name: "Backup Sepolia RPC",
      url: "https://rpc.sepolia.org"
    }
  ],

  contracts: {
    infl: "0x393289f921bbE6A684B79B9939816AAE68AC1B60",
    stakingVault: "0x1EEC97996986B5D0196a68D341D0C2D2C6D1775B"
  }
};

const ABI = {
  token: [
    "function balanceOf(address owner) view returns (uint256)",
    "function approve(address spender, uint256 amount) returns (bool)",
    "function allowance(address owner, address spender) view returns (uint256)"
  ],
  vault: [
    "function stake(uint256 amount)",
    "function withdraw(uint256 amount)",
    "function claimRewards()",
    "function exit()",
    "function balanceOf(address account) view returns (uint256)",
    "function earned(address account) view returns (uint256)",
    "function totalStaked() view returns (uint256)"
  ]
};

let provider = null;
let signer = null;
let userAddress = null;
let manuallyDisconnected = false;
let cachedReadProvider = null;
let cachedReadRpc = null;
let currentChainId = null;

document.addEventListener("DOMContentLoaded", async () => {
  initStarfield();
  bindButtons();
  renderActivity();
  setText("rpc-provider", "Checking...");

  await reconnectIfAlreadyConnected();
  await refreshStakingUi();

  setInterval(refreshStakingUi, 10000);
});

function $(id) {
  return document.getElementById(id);
}

function setText(id, value) {
  const el = $(id);
  if (el) el.textContent = value;
}

function setStatus(message) {
  setText("staking-status", message);
}

function setInputValue(id, value) {
  const input = $(id);
  if (input) input.value = value;
}

function updateLastUpdated() {
  setText("last-updated", new Date().toLocaleTimeString());
}

function getTxLink(hash) {
  return `https://sepolia.etherscan.io/tx/${hash}`;
}

function showToast(title, message, type = "info") {
  const root = $("toast-root");
  if (!root) return;

  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <div class="toast-title">${title}</div>
    <div class="toast-message">${message}</div>
  `;

  root.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(8px)";
  }, 4200);

  setTimeout(() => toast.remove(), 4800);
}

function setButtonLoading(buttonId, loadingText) {
  const button = $(buttonId);
  if (!button) return null;

  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = loadingText;

  return () => {
    button.disabled = false;
    button.textContent = originalText;
  };
}

function shortAddress(address) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function updateWalletButton() {
  const btn = $("connect-wallet");
  if (!btn) return;

  btn.textContent = userAddress
    ? `Disconnect ${shortAddress(userAddress)}`
    : "Connect Wallet";
}

function formatInfl(raw) {
  const value = Number(ethers.formatUnits(raw, 18));

  return `${value.toLocaleString(undefined, {
    maximumFractionDigits: 6
  })} INFL`;
}

function formatAmountText(raw) {
  return formatInfl(raw);
}

function parseAmount(inputId) {
  const value = $(inputId)?.value;

  if (!value || Number(value) <= 0) {
    throw new Error("Enter an amount greater than 0");
  }

  return ethers.parseUnits(value, 18);
}

function clearApprovalBox() {
  setText("approved-amount", "0 INFL");
  setText("approval-status-text", "Approval required");
}

function clearRewardMetrics() {
  setText("estimated-apr", "12.00%");
  setText("daily-reward-estimate", "0.00 INFL");
  setText("reward-status-text", "Waiting for stake");
}

function updateClaimButtonGlow(earned) {
  const claimButton = $("claim-rewards");
  if (!claimButton) return;

  if (earned > 0n) {
    claimButton.classList.add("claim-ready");
  } else {
    claimButton.classList.remove("claim-ready");
  }
}

function updateRewardMetrics(userStaked, earned) {
  const apr = 12;

  const staked = Number(ethers.formatUnits(userStaked, 18));
  const earnedValue = Number(ethers.formatUnits(earned, 18));
  const dailyEstimate = (staked * apr) / 100 / 365;

  setText("estimated-apr", `${apr.toFixed(2)}%`);

  setText(
    "daily-reward-estimate",
    `${dailyEstimate.toLocaleString(undefined, {
      maximumFractionDigits: 6
    })} INFL`
  );

  if (staked <= 0) {
    setText("reward-status-text", "Waiting for stake");
  } else if (earnedValue > 0) {
    setText("reward-status-text", "Rewards available");
  } else {
    setText("reward-status-text", "Accumulating rewards");
  }
}

/* ---------------- RECENT ACTIVITY ---------------- */

function getActivityStorageKey() {
  return userAddress
    ? `inflara_activity_${userAddress.toLowerCase()}`
    : "inflara_activity_guest";
}

function loadActivity() {
  try {
    const raw = localStorage.getItem(getActivityStorageKey());
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveActivity(items) {
  localStorage.setItem(
    getActivityStorageKey(),
    JSON.stringify(items.slice(0, 6))
  );
}

function addActivity(type, amount, hash) {
  const items = loadActivity();

  items.unshift({
    type,
    amount,
    hash,
    time: new Date().toISOString()
  });

  saveActivity(items);
  renderActivity();
}

function formatActivityTime(iso) {
  return new Date(iso).toLocaleTimeString();
}

function renderActivity() {
  const list = $("activity-list");
  if (!list) return;

  const items = loadActivity();

  if (!items.length) {
    list.innerHTML = `
      <div class="activity-empty">
        No staking transactions yet.
      </div>
    `;
    return;
  }

  list.innerHTML = items
    .map(
      (item) => `
        <div class="activity-card">
          <div class="activity-top">
            <span class="activity-type">${item.type}</span>
            <span class="activity-time">${formatActivityTime(item.time)}</span>
          </div>

          <div class="activity-amount">
            ${item.amount}
          </div>

          <div class="activity-link">
            <a href="${getTxLink(item.hash)}" target="_blank" rel="noopener noreferrer">
              View on Etherscan
            </a>
          </div>
        </div>
      `
    )
    .join("");
}

/* ---------------- RPC FALLBACK ---------------- */

async function getReadProvider() {
  if (cachedReadProvider) return cachedReadProvider;

  setText("rpc-provider", "Checking...");

  for (const rpc of APP_CONFIG.rpcs) {
    try {
      const testProvider = new ethers.JsonRpcProvider(rpc.url);
      await testProvider.getBlockNumber();

      cachedReadProvider = testProvider;
      cachedReadRpc = rpc;

      setText("rpc-provider", rpc.name);

      if (rpc.url !== APP_CONFIG.rpcs[0].url) {
        showToast("RPC fallback active", `Using ${rpc.name}.`, "info");
      }

      return cachedReadProvider;
    } catch (error) {
      console.warn("RPC failed:", rpc.name, error);
    }
  }

  setText("rpc-provider", "All RPCs failed");
  throw new Error("All RPC providers failed.");
}

function resetReadProvider() {
  cachedReadProvider = null;
  cachedReadRpc = null;
  setText("rpc-provider", "Checking...");
}

async function getReadContracts() {
  const readProvider = await getReadProvider();

  return {
    token: new ethers.Contract(
      APP_CONFIG.contracts.infl,
      ABI.token,
      readProvider
    ),
    vault: new ethers.Contract(
      APP_CONFIG.contracts.stakingVault,
      ABI.vault,
      readProvider
    )
  };
}

async function getWriteContracts() {
  if (!signer || !userAddress) {
    await connectWallet();
  }

  return {
    token: new ethers.Contract(
      APP_CONFIG.contracts.infl,
      ABI.token,
      signer
    ),
    vault: new ethers.Contract(
      APP_CONFIG.contracts.stakingVault,
      ABI.vault,
      signer
    )
  };
}

/* ---------------- WALLET ---------------- */

async function ensureSepolia() {
  if (!window.ethereum) {
    throw new Error("No wallet found");
  }

  const chainId = await window.ethereum.request({
    method: "eth_chainId"
  });

  if (chainId === APP_CONFIG.chainIdHex) return;

  await window.ethereum.request({
    method: "wallet_switchEthereumChain",
    params: [{ chainId: APP_CONFIG.chainIdHex }]
  });
}

function bindButtons() {
  bindWalletButton();

  $("refresh-staking")?.addEventListener("click", async () => {
    resetReadProvider();
    await refreshStakingUi();
  });

  $("approve-infl")?.addEventListener("click", approveInfl);
  $("stake-infl")?.addEventListener("click", stakeInfl);
  $("claim-rewards")?.addEventListener("click", claimRewards);
  $("withdraw-infl")?.addEventListener("click", withdrawInfl);
  $("exit-staking")?.addEventListener("click", exitStaking);
  $("max-stake")?.addEventListener("click", fillMaxStake);
  $("stake-slider")?.addEventListener("input", updateStakeFromSlider);
  $("stake-amount")?.addEventListener("input", updateStakeButtonFromAllowance);

  updateStakeButtonDisabled(true);
  clearApprovalBox();
  clearRewardMetrics();
  updateClaimButtonGlow(0n);

  if (window.ethereum) {
    window.ethereum.on?.("accountsChanged", handleAccountsChanged);
    window.ethereum.on?.("chainChanged", () => window.location.reload());
  }
}

function bindWalletButton() {
  const oldBtn = $("connect-wallet");
  if (!oldBtn) return;

  const newBtn = oldBtn.cloneNode(true);
  oldBtn.parentNode.replaceChild(newBtn, oldBtn);

  newBtn.addEventListener("click", async () => {
    if (userAddress) {
      disconnectWallet();
    } else {
      await connectWallet();
    }
  });
}

async function connectWallet() {
  try {
    manuallyDisconnected = false;

    setStatus("Connecting wallet...");
    showToast("Wallet", "Connecting wallet...", "info");

    await ensureSepolia();

    provider = new ethers.BrowserProvider(window.ethereum);
    await provider.send("eth_requestAccounts", []);

    signer = await provider.getSigner();
    userAddress = await signer.getAddress();

    setText("wallet-address", userAddress);
    setText("wallet-network", APP_CONFIG.chainName);

    updateWalletButton();
    renderActivity();

    setStatus("Wallet connected.");
    showToast("Wallet connected", shortAddress(userAddress), "success");

    await refreshStakingUi();
  } catch (error) {
    console.error(error);

    const message =
      error.reason ||
      error.message ||
      "Connection failed.";

    setStatus(message);
    showToast("Connection failed", message, "error");
  }
}

function disconnectWallet() {
  manuallyDisconnected = true;

  provider = null;
  signer = null;
  userAddress = null;

  setText("wallet-address", "Not connected");
  setText("wallet-network", "—");
  setText("wallet-infl-balance", "—");
  setText("vault-user-staked", "—");
  setText("vault-earned", "—");
  setText("last-updated", "—");

  updateStakeButtonDisabled(true);
  clearApprovalBox();
  clearRewardMetrics();
  updateClaimButtonGlow(0n);
  updateWalletButton();
  renderActivity();

  setStatus("Wallet disconnected.");
  showToast("Wallet disconnected", "Frontend session cleared.", "info");
}

async function reconnectIfAlreadyConnected() {
  try {
    if (manuallyDisconnected || !window.ethereum) {
      updateWalletButton();
      updateStakeButtonDisabled(true);
      clearApprovalBox();
      clearRewardMetrics();
      updateClaimButtonGlow(0n);
      renderActivity();
      return;
    }

    const accounts = await window.ethereum.request({
      method: "eth_accounts"
    });

    if (!accounts.length) {
      updateWalletButton();
      updateStakeButtonDisabled(true);
      clearApprovalBox();
      clearRewardMetrics();
      updateClaimButtonGlow(0n);
      renderActivity();
      return;
    }

    await ensureSepolia();

    provider = new ethers.BrowserProvider(window.ethereum);
    signer = await provider.getSigner();
    userAddress = await signer.getAddress();

    setText("wallet-address", userAddress);
    setText("wallet-network", APP_CONFIG.chainName);

    updateWalletButton();
    renderActivity();

    setStatus("Wallet connected.");
  } catch (error) {
    console.error(error);

    updateWalletButton();
    updateStakeButtonDisabled(true);
    clearApprovalBox();
    clearRewardMetrics();
    updateClaimButtonGlow(0n);
    renderActivity();
  }
}

async function handleAccountsChanged(accounts) {
  if (!accounts.length) {
    disconnectWallet();
    return;
  }

  if (manuallyDisconnected) return;

  userAddress = accounts[0];

  provider = new ethers.BrowserProvider(window.ethereum);
  signer = await provider.getSigner();

  setText("wallet-address", userAddress);
  setText("wallet-network", APP_CONFIG.chainName);

  updateWalletButton();
  renderActivity();

  setStatus("Wallet changed.");
  showToast("Wallet changed", shortAddress(userAddress), "info");

  await refreshStakingUi();
}

/* ---------------- UI ---------------- */

function updateStakeButtonDisabled(disabled) {
  const stakeButton = $("stake-infl");
  if (stakeButton) stakeButton.disabled = disabled;
}

async function updateStakeButtonFromAllowance() {
  try {
    if (!userAddress) {
      updateStakeButtonDisabled(true);
      clearApprovalBox();
      return;
    }

    const value = $("stake-amount")?.value;
    const { token } = await getReadContracts();

    const allowance = await token.allowance(
      userAddress,
      APP_CONFIG.contracts.stakingVault
    );

    setText("approved-amount", formatInfl(allowance));

    if (!value || Number(value) <= 0) {
      updateStakeButtonDisabled(true);

      setText(
        "approval-status-text",
        allowance > 0n ? "Enter amount to stake" : "Approval required"
      );

      return;
    }

    const amount = ethers.parseUnits(value, 18);
    const hasEnoughAllowance = allowance >= amount;

    updateStakeButtonDisabled(!hasEnoughAllowance);

    setText(
      "approval-status-text",
      hasEnoughAllowance ? "Ready to stake" : "Approval required"
    );

    setStatus(
      hasEnoughAllowance
        ? "Approved amount available. Ready to stake."
        : "Approve INFL before staking."
    );
  } catch (error) {
    console.error(error);

    resetReadProvider();
    updateStakeButtonDisabled(true);
    setText("approval-status-text", "Approval check failed");
  }
}

async function refreshStakingUi() {
  try {
    if (!$("vault-total-staked")) return;

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
      updateStakeButtonDisabled(true);
      clearApprovalBox();
      clearRewardMetrics();
      updateClaimButtonGlow(0n);

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

    updateClaimButtonGlow(earned);
    updateRewardMetrics(userStaked, earned);
    updateLastUpdated();

    await updateStakeButtonFromAllowance();
  } catch (error) {
    console.error(error);

    resetReadProvider();
    setStatus("Could not refresh staking data.");
  }
}

/* ---------------- TRANSACTIONS ---------------- */

async function fillMaxStake() {
  try {
    if (!userAddress) await connectWallet();

    const { token } = await getReadContracts();
    const balance = await token.balanceOf(userAddress);

    const formatted = Number(ethers.formatUnits(balance, 18));

    setInputValue("stake-amount", formatted.toFixed(6));

    $("stake-slider").value = 100;
    setText("slider-percent", "100%");

    setStatus("Max stake amount filled.");
    showToast("Max selected", "100% of wallet balance filled.", "info");

    await updateStakeButtonFromAllowance();
  } catch (error) {
    console.error(error);

    resetReadProvider();
    setStatus("Could not fetch max balance.");
    showToast("Max failed", "Could not fetch wallet balance.", "error");
  }
}

async function updateStakeFromSlider(event) {
  try {
    if (!userAddress) {
      updateStakeButtonDisabled(true);
      clearApprovalBox();
      return;
    }

    const percent = Number(event.target.value);

    setText("slider-percent", `${percent}%`);

    const { token } = await getReadContracts();
    const balance = await token.balanceOf(userAddress);
    const balanceFloat = Number(ethers.formatUnits(balance, 18));
    const amount = (balanceFloat * percent) / 100;

    setInputValue("stake-amount", amount.toFixed(6));

    await updateStakeButtonFromAllowance();
  } catch (error) {
    console.error(error);
    resetReadProvider();
  }
}

async function approveInfl() {
  const resetButton = setButtonLoading("approve-infl", "Approving...");
  let amount = 0n;

  try {
    amount = parseAmount("stake-amount");

    const { token } = await getWriteContracts();

    setStatus("Waiting for wallet confirmation...");
    showToast("Confirm approval", "Approve the transaction in your wallet.", "info");

    const tx = await token.approve(
      APP_CONFIG.contracts.stakingVault,
      amount
    );

    setStatus("Waiting for blockchain confirmation...");
    showToast("Approval submitted", "Waiting for blockchain confirmation.", "info");

    await tx.wait();

    setStatus("Approval confirmed.");

    showToast(
      "Approval confirmed",
      `INFL approval was successful. ${getTxLink(tx.hash)}`,
      "success"
    );

    addActivity("Approve", formatAmountText(amount), tx.hash);
    window.open(getTxLink(tx.hash), "_blank");

    await refreshStakingUi();
  } catch (error) {
    console.error(error);

    const message =
      error.reason ||
      error.shortMessage ||
      error.message ||
      "Approval failed.";

    setStatus(message);
    showToast("Approval failed", message, "error");
  } finally {
    if (resetButton) resetButton();
    await updateStakeButtonFromAllowance();
  }
}

async function stakeInfl() {
  const resetButton = setButtonLoading("stake-infl", "Staking...");
  let amount = 0n;

  try {
    await updateStakeButtonFromAllowance();

    const stakeButton = $("stake-infl");
    if (stakeButton?.disabled) {
      throw new Error("Approve INFL before staking.");
    }

    amount = parseAmount("stake-amount");

    const { vault } = await getWriteContracts();

    setStatus("Waiting for wallet confirmation...");
    showToast("Confirm stake", "Approve the staking transaction in your wallet.", "info");

    const tx = await vault.stake(amount);

    setStatus("Waiting for blockchain confirmation...");
    showToast("Stake submitted", "Waiting for blockchain confirmation.", "info");

    await tx.wait();

    setStatus("Stake confirmed.");

    showToast(
      "Stake confirmed",
      `INFL successfully staked. ${getTxLink(tx.hash)}`,
      "success"
    );

    addActivity("Stake", formatAmountText(amount), tx.hash);
    window.open(getTxLink(tx.hash), "_blank");

    await refreshStakingUi();
  } catch (error) {
    console.error(error);

    const message =
      error.reason ||
      error.shortMessage ||
      error.message ||
      "Stake failed.";

    setStatus(message);
    showToast("Stake failed", message, "error");
  } finally {
    if (resetButton) resetButton();
    await updateStakeButtonFromAllowance();
  }
}

async function claimRewards() {
  const resetButton = setButtonLoading("claim-rewards", "Claiming...");
  let earnedBeforeClaim = 0n;

  try {
    const { vault } = await getWriteContracts();

    if (userAddress) {
      earnedBeforeClaim = await vault.earned(userAddress);
    }

    setStatus("Waiting for wallet confirmation...");
    showToast("Confirm claim", "Approve the claim transaction in your wallet.", "info");

    const tx = await vault.claimRewards();

    setStatus("Waiting for blockchain confirmation...");
    showToast("Claim submitted", "Waiting for blockchain confirmation.", "info");

    await tx.wait();

    setStatus("Rewards claimed.");

    showToast(
      "Rewards claimed",
      `Your staking rewards were claimed. ${getTxLink(tx.hash)}`,
      "success"
    );

    addActivity("Claim Rewards", formatAmountText(earnedBeforeClaim), tx.hash);
    window.open(getTxLink(tx.hash), "_blank");

    await refreshStakingUi();
  } catch (error) {
    console.error(error);

    const message =
      error.reason ||
      error.shortMessage ||
      error.message ||
      "Claim failed.";

    setStatus(message);
    showToast("Claim failed", message, "error");
  } finally {
    if (resetButton) resetButton();
  }
}

async function withdrawInfl() {
  const resetButton = setButtonLoading("withdraw-infl", "Withdrawing...");
  let amount = 0n;

  try {
    amount = parseAmount("withdraw-amount");

    const { vault } = await getWriteContracts();

    setStatus("Waiting for wallet confirmation...");
    showToast("Confirm withdrawal", "Approve the withdrawal in your wallet.", "info");

    const tx = await vault.withdraw(amount);

    setStatus("Waiting for blockchain confirmation...");
    showToast("Withdrawal submitted", "Waiting for blockchain confirmation.", "info");

    await tx.wait();

    setStatus("Withdraw confirmed.");

    showToast(
      "Withdraw confirmed",
      `INFL withdrawn successfully. ${getTxLink(tx.hash)}`,
      "success"
    );

    addActivity("Withdraw", formatAmountText(amount), tx.hash);
    window.open(getTxLink(tx.hash), "_blank");

    await refreshStakingUi();
  } catch (error) {
    console.error(error);

    const message =
      error.reason ||
      error.shortMessage ||
      error.message ||
      "Withdraw failed.";

    setStatus(message);
    showToast("Withdraw failed", message, "error");
  } finally {
    if (resetButton) resetButton();
  }
}

async function exitStaking() {
  const confirmed = window.confirm(
    "Are you sure you want to exit all staking?\n\nThis will withdraw your full staked balance and claim available rewards."
  );

  if (!confirmed) {
    setStatus("Exit cancelled.");
    showToast("Exit cancelled", "No transaction was sent.", "info");
    return;
  }

  const resetButton = setButtonLoading("exit-staking", "Exiting...");
  let stakedBeforeExit = 0n;

  try {
    const { vault } = await getWriteContracts();

    if (userAddress) {
      stakedBeforeExit = await vault.balanceOf(userAddress);
    }

    setStatus("Waiting for wallet confirmation...");
    showToast("Confirm exit", "Approve exit all in your wallet.", "info");

    const tx = await vault.exit();

    setStatus("Waiting for blockchain confirmation...");
    showToast("Exit submitted", "Waiting for blockchain confirmation.", "info");

    await tx.wait();

    setStatus("Exit confirmed.");

    showToast(
      "Exit confirmed",
      `You exited staking successfully. ${getTxLink(tx.hash)}`,
      "success"
    );

    addActivity("Exit All", formatAmountText(stakedBeforeExit), tx.hash);
    window.open(getTxLink(tx.hash), "_blank");

    await refreshStakingUi();
  } catch (error) {
    console.error(error);

    const message =
      error.reason ||
      error.shortMessage ||
      error.message ||
      "Exit failed.";

    setStatus(message);
    showToast("Exit failed", message, "error");
  } finally {
    if (resetButton) resetButton();
  }
}

/* ---------------- STARFIELD ---------------- */

function initStarfield() {
  const canvas = $("starfield");
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
