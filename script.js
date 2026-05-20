const APP_CONFIG = {
  chainIdHex: "0xaa36a7",
  chainName: "Sepolia",

  rpc:
    "https://eth-sepolia.g.alchemy.com/v2/SAnXKYhqMQWm0eYNvuPv_",

  contracts: {
    infl:
      "0x393289f921bbE6A684B79B9939816AAE68AC1B60",

    stakingVault:
      "0x1EEC97996986B5D0196a68D341D0C2D2C6D1775B"
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

document.addEventListener("DOMContentLoaded", async () => {
  initStarfield();
  bindButtons();

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

  setTimeout(() => {
    toast.remove();
  }, 4800);
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

  const staked =
    Number(
      ethers.formatUnits(
        userStaked,
        18
      )
    );

  const earnedValue =
    Number(
      ethers.formatUnits(
        earned,
        18
      )
    );

  const estimatedDaily =
    (staked * apr) / 100 / 365;

  setText(
    "estimated-apr",
    `${apr.toFixed(2)}%`
  );

  setText(
    "daily-reward-estimate",
    `${estimatedDaily.toFixed(4)} INFL`
  );

  if (staked <= 0) {
    setText(
      "reward-status-text",
      "Waiting for stake"
    );
  } else if (earnedValue > 0) {
    setText(
      "reward-status-text",
      "Rewards available"
    );
  } else {
    setText(
      "reward-status-text",
      "Accumulating rewards"
    );
  }
}

function getReadProvider() {
  return new ethers.JsonRpcProvider(APP_CONFIG.rpc);
}

async function getReadContracts() {
  const readProvider = getReadProvider();

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

async function ensureSepolia() {
  if (!window.ethereum) {
    throw new Error("No wallet found");
  }

  const chainId = await window.ethereum.request({
    method: "eth_chainId"
  });

  if (chainId === APP_CONFIG.chainIdHex) {
    return;
  }

  await window.ethereum.request({
    method: "wallet_switchEthereumChain",
    params: [
      {
        chainId: APP_CONFIG.chainIdHex
      }
    ]
  });
}

function bindButtons() {
  bindWalletButton();

  $("refresh-staking")?.addEventListener("click", refreshStakingUi);
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

  oldBtn.parentNode.replaceChild(
    newBtn,
    oldBtn
  );

  newBtn.addEventListener(
    "click",
    async () => {
      if (userAddress) {
        disconnectWallet();
      } else {
        await connectWallet();
      }
    }
  );
}

async function connectWallet() {
  try {
    manuallyDisconnected = false;

    setStatus("Connecting wallet...");
    showToast("Wallet", "Connecting wallet...", "info");

    await ensureSepolia();

    provider = new ethers.BrowserProvider(window.ethereum);

    await provider.send(
      "eth_requestAccounts",
      []
    );

    signer = await provider.getSigner();
    userAddress = await signer.getAddress();

    setText("wallet-address", userAddress);
    setText("wallet-network", APP_CONFIG.chainName);

    updateWalletButton();

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

  updateStakeButtonDisabled(true);
  clearApprovalBox();
  updateClaimButtonGlow(0n);
  updateWalletButton();

  setStatus("Wallet disconnected.");
  showToast("Wallet disconnected", "Frontend session cleared.", "info");
}

function updateStakeButtonDisabled(disabled) {
  const stakeButton = $("stake-infl");

  if (stakeButton) {
    stakeButton.disabled = disabled;
  }
}
