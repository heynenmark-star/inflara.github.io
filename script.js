const APP_CONFIG = {
  chainIdHex: "0xaa36a7",
  chainName: "Ethereum Sepolia",

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
let readProvider = null;

const NETWORK_NAMES = {
  "0x1": "Ethereum Mainnet",
  "0xaa36a7": "Ethereum Sepolia",
  "0xa4b1": "Arbitrum One",
  "0x2105": "Base",
  "0x89": "Polygon"
};

document.addEventListener("DOMContentLoaded", () => {
  initStarfield();
  bindButtons();
  updateEnvironmentBadge();
  updateWalletButton();
  updateNetworkDisplay();
  refreshStakingUi();

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

function shortAddress(address) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function getWalletProvider() {
  if (!window.ethereum) return null;

  if (Array.isArray(window.ethereum.providers)) {
    const rabby = window.ethereum.providers.find((p) => p.isRabby);
    const metamask = window.ethereum.providers.find((p) => p.isMetaMask);

    return rabby || metamask || window.ethereum.providers[0];
  }

  return window.ethereum;
}

function getWalletName() {
  const eth = getWalletProvider();

  if (!eth) return "No wallet";
  if (eth.isRabby) return "Rabby";
  if (eth.isMetaMask) return "MetaMask";

  return "Browser Wallet";
}

function updateWalletButton() {
  const btn = $("connect-wallet");
  if (!btn) return;

  btn.textContent = userAddress
    ? `Disconnect ${shortAddress(userAddress)}`
    : "Connect Wallet";
}

function updateEnvironmentBadge() {
  const badge = $("environment-badge");
  if (!badge) return;

  badge.textContent = "TESTNET MODE";
  badge.classList.remove("mainnet-mode");
  badge.classList.add("testnet-mode");
}

function bindButtons() {
  const connectBtn = $("connect-wallet");

  if (connectBtn) {
    connectBtn.onclick = async () => {
      if (userAddress) {
        disconnectWallet();
      } else {
        await connectWallet();
      }
    };
  }

  $("refresh-staking")?.addEventListener("click", refreshStakingUi);
  $("approve-infl")?.addEventListener("click", approveInfl);
  $("stake-infl")?.addEventListener("click", stakeInfl);
  $("claim-rewards")?.addEventListener("click", claimRewards);
  $("withdraw-infl")?.addEventListener("click", withdrawInfl);
  $("exit-staking")?.addEventListener("click", exitStaking);
  $("max-stake")?.addEventListener("click", fillMaxStake);
  $("stake-amount")?.addEventListener("input", updateApprovalStatus);

  const slider = $("stake-slider");

  if (slider) {
    slider.addEventListener("input", updateStakeFromSlider);
  }

  const eth = getWalletProvider();

  if (eth) {
    eth.on?.("accountsChanged", async (accounts) => {
      if (!accounts.length) {
        disconnectWallet();
        return;
      }

      userAddress = accounts[0];
      setText("wallet-address", userAddress);
      updateWalletButton();
      await refreshStakingUi();
    });

    eth.on?.("chainChanged", async () => {
      await updateNetworkDisplay();
      await refreshStakingUi();
    });
  }
}

async function connectWallet() {
  try {
    const eth = getWalletProvider();

    if (!eth) {
      throw new Error("No wallet found. Open Rabby or MetaMask.");
    }

    setStatus("Connecting wallet...");

    const accounts = await eth.request({
      method: "eth_requestAccounts"
    });

    if (!accounts || !accounts.length) {
      throw new Error("No wallet account selected.");
    }

    await ensureSepolia();

    provider = new ethers.BrowserProvider(eth);
    signer = await provider.getSigner();
    userAddress = await signer.getAddress();

    setText("wallet-address", userAddress);
    setText("wallet-provider", getWalletName());

    await updateNetworkDisplay();

    updateWalletButton();
    setStatus("Wallet connected.");

    await refreshStakingUi();
  } catch (error) {
    console.error(error);
    setStatus(error.shortMessage || error.message || "Wallet connection failed.");
  }
}

function disconnectWallet() {
  provider = null;
  signer = null;
  userAddress = null;

  setText("wallet-address", "Not connected");
  setText("wallet-provider", "—");
  setText("wallet-infl-balance", "—");
  setText("vault-user-staked", "—");
  setText("vault-earned", "—");

  updateWalletButton();
  setStatus("Wallet disconnected.");
}

async function ensureSepolia() {
  const eth = getWalletProvider();

  if (!eth) {
    throw new Error("No wallet found.");
  }

  const chainId = await eth.request({
    method: "eth_chainId"
  });

  if (chainId === APP_CONFIG.chainIdHex) return;

  try {
    await eth.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: APP_CONFIG.chainIdHex }]
    });
  } catch (error) {
    if (error.code === 4902) {
      await eth.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: APP_CONFIG.chainIdHex,
            chainName: APP_CONFIG.chainName,
            nativeCurrency: {
              name: "Sepolia ETH",
              symbol: "ETH",
              decimals: 18
            },
            rpcUrls: APP_CONFIG.rpcs.map((rpc) => rpc.url),
            blockExplorerUrls: ["https://sepolia.etherscan.io"]
          }
        ]
      });
    } else {
      throw error;
    }
  }
}

async function updateNetworkDisplay() {
  try {
    const eth = getWalletProvider();

    if (!eth) {
      setText("wallet-network", "No wallet");
      setText("wallet-provider", "No wallet");
      return;
    }

    const chainId = await eth.request({
      method: "eth_chainId"
    });

    setText(
      "wallet-network",
      NETWORK_NAMES[chainId] || `Unknown Network (${chainId})`
    );

    setText("wallet-provider", getWalletName());
  } catch (error) {
    console.error(error);
    setText("wallet-network", "Unknown");
  }
}

function getReadProvider() {
  if (!readProvider) {
    readProvider = new ethers.JsonRpcProvider(APP_CONFIG.rpcs[0].url);
  }

  return readProvider;
}

function getReadContracts() {
  const rpc = getReadProvider();

  return {
    token: new ethers.Contract(APP_CONFIG.contracts.infl, ABI.token, rpc),
    vault: new ethers.Contract(APP_CONFIG.contracts.stakingVault, ABI.vault, rpc)
  };
}

async function getWriteContracts() {
  if (!signer) {
    await connectWallet();
  }

  return {
    token: new ethers.Contract(APP_CONFIG.contracts.infl, ABI.token, signer),
    vault: new ethers.Contract(APP_CONFIG.contracts.stakingVault, ABI.vault, signer)
  };
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
    throw new Error("Enter an amount greater than 0.");
  }

  return ethers.parseUnits(value, 18);
}

async function refreshStakingUi() {
  try {
    if (typeof ethers === "undefined") {
      setStatus("Ethers is not loaded. Check staking.html script tags.");
      return;
    }

    const { token, vault } = getReadContracts();

    const totalStaked = await vault.totalStaked();

    setText("vault-total-staked", formatInfl(totalStaked));

    if (!userAddress) {
      setText("wallet-address", "Not connected");
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
    setText("last-updated", new Date().toLocaleTimeString());

    await updateApprovalStatus();
  } catch (error) {
    console.error(error);
    setStatus("Could not refresh staking data.");
  }
}

async function updateApprovalStatus() {
  try {
    const stakeButton = $("stake-infl");

    if (!userAddress) {
      if (stakeButton) stakeButton.disabled = true;
      setText("approved-amount", "0 INFL");
      setText("approval-status-text", "Connect wallet first");
      return;
    }

    const amountText = $("stake-amount")?.value;

    const { token } = getReadContracts();

    const allowance = await token.allowance(
      userAddress,
      APP_CONFIG.contracts.stakingVault
    );

    setText("approved-amount", formatInfl(allowance));

    if (!amountText || Number(amountText) <= 0) {
      if (stakeButton) stakeButton.disabled = true;
      setText("approval-status-text", "Enter amount");
      return;
    }

    const amount = ethers.parseUnits(amountText, 18);

    if (allowance >= amount) {
      if (stakeButton) stakeButton.disabled = false;
      setText("approval-status-text", "Ready to stake");
    } else {
      if (stakeButton) stakeButton.disabled = true;
      setText("approval-status-text", "Approval required");
    }
  } catch (error) {
    console.error(error);
    setText("approval-status-text", "Approval check failed");
  }
}

async function fillMaxStake() {
  try {
    if (!userAddress) {
      await connectWallet();
    }

    const { token } = getReadContracts();
    const balance = await token.balanceOf(userAddress);

    const value = Number(ethers.formatUnits(balance, 18));

    const input = $("stake-amount");
    if (input) input.value = value.toFixed(6);

    setText("slider-percent", "100%");

    const slider = $("stake-slider");
    if (slider) slider.value = 100;

    await updateApprovalStatus();
  } catch (error) {
    console.error(error);
    setStatus("Could not fill max stake.");
  }
}

async function updateStakeFromSlider(event) {
  try {
    if (!userAddress) {
      setStatus("Connect wallet first.");
      return;
    }

    const percent = Number(event.target.value);
    setText("slider-percent", `${percent}%`);

    const { token } = getReadContracts();
    const balance = await token.balanceOf(userAddress);

    const balanceValue = Number(ethers.formatUnits(balance, 18));
    const stakeValue = (balanceValue * percent) / 100;

    const input = $("stake-amount");
    if (input) input.value = stakeValue.toFixed(6);

    await updateApprovalStatus();
  } catch (error) {
    console.error(error);
  }
}

async function approveInfl() {
  try {
    const amount = parseAmount("stake-amount");
    const { token } = await getWriteContracts();

    setStatus("Confirm approval in wallet...");

    const tx = await token.approve(
      APP_CONFIG.contracts.stakingVault,
      amount
    );

    setStatus("Waiting for approval confirmation...");

    await tx.wait();

    setStatus("Approval confirmed.");
    await refreshStakingUi();
  } catch (error) {
    console.error(error);
    setStatus(error.shortMessage || error.message || "Approval failed.");
  }
}

async function stakeInfl() {
  try {
    const amount = parseAmount("stake-amount");
    const { vault } = await getWriteContracts();

    setStatus("Confirm stake in wallet...");

    const tx = await vault.stake(amount);

    setStatus("Waiting for stake confirmation...");

    await tx.wait();

    setStatus("Stake confirmed.");
    await refreshStakingUi();
  } catch (error) {
    console.error(error);
    setStatus(error.shortMessage || error.message || "Stake failed.");
  }
}

async function claimRewards() {
  try {
    const { vault } = await getWriteContracts();

    setStatus("Confirm claim in wallet...");

    const tx = await vault.claimRewards();

    setStatus("Waiting for claim confirmation...");

    await tx.wait();

    setStatus("Rewards claimed.");
    await refreshStakingUi();
  } catch (error) {
    console.error(error);
    setStatus(error.shortMessage || error.message || "Claim failed.");
  }
}

async function withdrawInfl() {
  try {
    const amount = parseAmount("withdraw-amount");
    const { vault } = await getWriteContracts();

    setStatus("Confirm withdrawal in wallet...");

    const tx = await vault.withdraw(amount);

    setStatus("Waiting for withdrawal confirmation...");

    await tx.wait();

    setStatus("Withdrawal confirmed.");
    await refreshStakingUi();
  } catch (error) {
    console.error(error);
    setStatus(error.shortMessage || error.message || "Withdrawal failed.");
  }
}

async function exitStaking() {
  const confirmed = window.confirm(
    "Exit all staking? This withdraws your stake and claims rewards."
  );

  if (!confirmed) {
    setStatus("Exit cancelled.");
    return;
  }

  try {
    const { vault } = await getWriteContracts();

    setStatus("Confirm exit in wallet...");

    const tx = await vault.exit();

    setStatus("Waiting for exit confirmation...");

    await tx.wait();

    setStatus("Exit confirmed.");
    await refreshStakingUi();
  } catch (error) {
    console.error(error);
    setStatus(error.shortMessage || error.message || "Exit failed.");
  }
}

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
