const APP_CONFIG = {
  chainIdHex: "0xaa36a7",
  chainName: "Sepolia",
  explorerBase: "https://sepolia.etherscan.io/tx/",

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
    "function approve(address spender, uint256 amount) returns (bool)"
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
let txInProgress = false;

/* ---------------- INIT ---------------- */

document.addEventListener("DOMContentLoaded", async () => {
  initStarfield();
  bindButtons();

  await reconnectIfAlreadyConnected();
  await refreshStakingUi();

  setInterval(refreshStakingUi, 10000);
});

/* ---------------- HELPERS ---------------- */

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

function setTxLink(txHash) {
  const area = $("tx-link-area");
  if (!area) return;

  if (!txHash) {
    area.innerHTML = "";
    return;
  }

  area.innerHTML = `
    <a href="${APP_CONFIG.explorerBase}${txHash}" target="_blank" rel="noopener noreferrer">
      View transaction on Sepolia Etherscan
    </a>
  `;
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

function setTransactionLoading(isLoading, activeButtonId = null, label = null) {
  txInProgress = isLoading;

  const buttons = document.querySelectorAll(".tx-button");

  buttons.forEach((button) => {
    button.disabled = isLoading;

    if (isLoading) {
      button.classList.add("is-loading");
    } else {
      button.classList.remove("is-loading");
    }
  });

  if (activeButtonId && label) {
    const activeButton = $(activeButtonId);

    if (activeButton) {
      if (isLoading) {
        activeButton.dataset.originalText = activeButton.textContent;
        activeButton.textContent = label;
      } else if (activeButton.dataset.originalText) {
        activeButton.textContent = activeButton.dataset.originalText;
        delete activeButton.dataset.originalText;
      }
    }
  }

  if (!isLoading) {
    buttons.forEach((button) => {
      if (button.dataset.originalText) {
        button.textContent = button.dataset.originalText;
        delete button.dataset.originalText;
      }
    });
  }
}

/* ---------------- CONTRACTS ---------------- */

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

  $("refresh-staking")?.addEventListener("click", refreshStakingUi);
  $("approve-infl")?.addEventListener("click", approveInfl);
  $("stake-infl")?.addEventListener("click", stakeInfl);
  $("claim-rewards")?.addEventListener("click", claimRewards);
  $("withdraw-infl")?.addEventListener("click", withdrawInfl);
  $("exit-staking")?.addEventListener("click", exitStaking);
  $("max-stake")?.addEventListener("click", fillMaxStake);
  $("stake-slider")?.addEventListener("input", updateStakeFromSlider);

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
    if (txInProgress) return;

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

    setTxLink(null);
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

    setStatus("Wallet connected.");
    showToast("Wallet connected", shortAddress(userAddress), "success");

    await refreshStakingUi();
  } catch (error) {
    console.error(error);

    const message = error.reason || error.message || "Connection failed.";

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
  setText("slider-percent", "0%");

  const slider = $("stake-slider");
  if (slider) slider.value = 0;

  setTxLink(null);
  updateWalletButton();

  setStatus("Wallet disconnected.");
  showToast("Wallet disconnected", "Frontend session cleared.", "info");
}

async function reconnectIfAlreadyConnected() {
  try {
    if (manuallyDisconnected || !window.ethereum) {
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

  if (manuallyDisconnected) return;

  userAddress = accounts[0];
  provider = new ethers.BrowserProvider(window.ethereum);
  signer = await provider.getSigner();

  setText("wallet-address", userAddress);
  setText("wallet-network", APP_CONFIG.chainName);

  updateWalletButton();

  setStatus("Wallet changed.");
  showToast("Wallet changed", shortAddress(userAddress), "info");

  await refreshStakingUi();
}

/* ---------------- UI ---------------- */

async function refreshStakingUi() {
  try {
    if (!$("vault-total-staked")) return;

    const { token, vault } = await getReadContracts();

    const totalStaked = await vault.totalStaked();

    setText(
      "vault-total-staked",
      formatInfl(totalStaked)
    );

    if (!userAddress) {
      setText("wallet-address", "Not connected");
      setText("wallet-network", "—");
      setText("wallet-infl-balance", "—");
      setText("vault-user-staked", "—");
      setText("vault-earned", "—");
      updateWalletButton();
      return;
    }

    const [walletBalance, userStaked, earned] =
      await Promise.all([
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

async function fillMaxStake() {
  try {
    if (!userAddress) {
      await connectWallet();
    }

    const { token } = await getReadContracts();
    const balance = await token.balanceOf(userAddress);

    const formatted = Number(
      ethers.formatUnits(balance, 18)
    );

    setInputValue("stake-amount", formatted.toFixed(6));
    setText("slider-percent", "100%");

    const slider = $("stake-slider");
    if (slider) slider.value = 100;

    setStatus("Max stake amount filled.");
    showToast("Max selected", "100% of wallet balance filled.", "info");
  } catch (error) {
    console.error(error);

    setStatus("Could not fetch max balance.");
    showToast("Max failed", "Could not fetch wallet balance.", "error");
  }
}

async function updateStakeFromSlider(event) {
  try {
    const percent = Number(event.target.value);

    setText("slider-percent", `${percent}%`);

    if (!userAddress) return;

    const { token } = await getReadContracts();
    const balance = await token.balanceOf(userAddress);

    const balanceFloat = Number(
      ethers.formatUnits(balance, 18)
    );

    const amount = (balanceFloat * percent) / 100;

    setInputValue("stake-amount", amount.toFixed(6));
  } catch (error) {
    console.error(error);
  }
}

/* ---------------- TRANSACTION HELPER ---------------- */

async function runTransaction({
  buttonId,
  loadingLabel,
  confirmMessage,
  pendingMessage,
  successTitle,
  successMessage,
  errorTitle,
  action
}) {
  try {
    setTxLink(null);
    setTransactionLoading(true, buttonId, loadingLabel);

    setStatus(confirmMessage);
    showToast("Confirm in wallet", confirmMessage, "info");

    const tx = await action();

    setTxLink(tx.hash);
    setStatus(pendingMessage);
    showToast("Transaction submitted", "Waiting for confirmation...", "info");

    await tx.wait();

    setStatus(successMessage);
    showToast(successTitle, successMessage, "success");

    await refreshStakingUi();
  } catch (error) {
    console.error(error);

    const message =
      error.reason ||
      error.shortMessage ||
      error.message ||
      "Transaction failed.";

    setStatus(message);
    showToast(errorTitle, message, "error");
  } finally {
    setTransactionLoading(false);
  }
}

/* ---------------- TRANSACTIONS ---------------- */

async function approveInfl() {
  const amount = parseAmount("stake-amount");
  const { token } = await getWriteContracts();

  await runTransaction({
    buttonId: "approve-infl",
    loadingLabel: "Approving...",
    confirmMessage: "Confirm approval in your wallet.",
    pendingMessage: "Approval submitted. Waiting for confirmation...",
    successTitle: "Approval confirmed",
    successMessage: "INFL approval confirmed.",
    errorTitle: "Approval failed",
    action: () =>
      token.approve(
        APP_CONFIG.contracts.stakingVault,
        amount
      )
  });
}

async function stakeInfl() {
  const amount = parseAmount("stake-amount");
  const { vault } = await getWriteContracts();

  await runTransaction({
    buttonId: "stake-infl",
    loadingLabel: "Staking...",
    confirmMessage: "Confirm stake in your wallet.",
    pendingMessage: "Stake submitted. Waiting for confirmation...",
    successTitle: "Stake confirmed",
    successMessage: "INFL successfully staked.",
    errorTitle: "Stake failed",
    action: () => vault.stake(amount)
  });
}

async function claimRewards() {
  const { vault } = await getWriteContracts();

  await runTransaction({
    buttonId: "claim-rewards",
    loadingLabel: "Claiming...",
    confirmMessage: "Confirm reward claim in your wallet.",
    pendingMessage: "Claim submitted. Waiting for confirmation...",
    successTitle: "Rewards claimed",
    successMessage: "Rewards claimed successfully.",
    errorTitle: "Claim failed",
    action: () => vault.claimRewards()
  });
}

async function withdrawInfl() {
  const amount = parseAmount("withdraw-amount");
  const { vault } = await getWriteContracts();

  await runTransaction({
    buttonId: "withdraw-infl",
    loadingLabel: "Withdrawing...",
    confirmMessage: "Confirm withdrawal in your wallet.",
    pendingMessage: "Withdrawal submitted. Waiting for confirmation...",
    successTitle: "Withdraw confirmed",
    successMessage: "INFL withdrawn successfully.",
    errorTitle: "Withdraw failed",
    action: () => vault.withdraw(amount)
  });
}

async function exitStaking() {
  const { vault } = await getWriteContracts();

  await runTransaction({
    buttonId: "exit-staking",
    loadingLabel: "Exiting...",
    confirmMessage: "Confirm exit in your wallet.",
    pendingMessage: "Exit submitted. Waiting for confirmation...",
    successTitle: "Exit confirmed",
    successMessage: "Exited staking successfully.",
    errorTitle: "Exit failed",
    action: () => vault.exit()
  });
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

    stars = Array.from(
      { length: 120 },
      () => ({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        r: Math.random() * 1.5 + 0.2,
        s: Math.random() * 0.25 + 0.05,
        o: Math.random() * 0.6 + 0.25
      })
    );
  }

  function draw() {
    ctx.clearRect(
      0,
      0,
      canvas.width,
      canvas.height
    );

    for (const star of stars) {
      ctx.beginPath();

      ctx.arc(
        star.x,
        star.y,
        star.r,
        0,
        Math.PI * 2
      );

      ctx.fillStyle =
        `rgba(255,255,255,${star.o})`;

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
