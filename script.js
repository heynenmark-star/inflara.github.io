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

const ENVIRONMENT_CONFIG = {
  mode: "testnet"
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
let walletType = "Unknown";

const NETWORK_NAMES = {
  "0x1": "Ethereum Mainnet",
  "0xaa36a7": "Ethereum Sepolia",
  "0xa4b1": "Arbitrum One",
  "0x2105": "Base",
  "0x89": "Polygon",
  "0x13881": "Polygon Mumbai"
};

document.addEventListener("DOMContentLoaded", async () => {
  initStarfield();
  bindButtons();
  renderActivity();
  updateEnvironmentBadge();

  setText("rpc-provider", "Checking...");

  await updateNetworkDisplay();
  await reconnectIfAlreadyConnected();
  await refreshStakingUi();

  setInterval(refreshStakingUi, 10000);
});

function $(id) {
  return document.getElementById(id);
}

function setText(id, value) {
  const el = $(id);

  if (el) {
    el.textContent = value;
  }
}

function setStatus(message) {
  setText("staking-status", message);
}

function detectWalletType() {
  if (window.ethereum?.isRabby) {
    return "Rabby";
  }

  if (window.ethereum?.isMetaMask) {
    return "MetaMask";
  }

  if (window.ethereum) {
    return "Browser Wallet";
  }

  return "No wallet";
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

function bindButtons() {
  bindWalletButton();

  if (window.ethereum) {
    window.ethereum.on?.(
      "accountsChanged",
      handleAccountsChanged
    );

    window.ethereum.on?.(
      "chainChanged",
      async () => {
        await updateNetworkDisplay();
      }
    );
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

async function ensureSepolia() {
  if (!window.ethereum) {
    throw new Error("No wallet found");
  }

  const chainId =
    await window.ethereum.request({
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

async function updateNetworkDisplay() {
  try {
    if (!window.ethereum) {
      setText("wallet-network", "No wallet");
      return;
    }

    const chainId =
      await window.ethereum.request({
        method: "eth_chainId"
      });

    currentChainId = chainId;

    const networkName =
      NETWORK_NAMES[chainId] ||
      `Unknown Network (${chainId})`;

    setText("wallet-network", networkName);

  } catch (error) {
    console.error(error);

    setText("wallet-network", "Unknown Network");
  }
}

async function connectWallet() {
  try {
    manuallyDisconnected = false;

    if (!window.ethereum) {
      throw new Error("No wallet detected");
    }

    walletType = detectWalletType();

    setStatus("Connecting wallet...");

    await ensureSepolia();

    provider =
      new ethers.BrowserProvider(
        window.ethereum
      );

    await provider.send(
      "eth_requestAccounts",
      []
    );

    signer = await provider.getSigner();

    userAddress =
      await signer.getAddress();

    setText(
      "wallet-address",
      userAddress
    );

    setText(
      "wallet-provider",
      walletType
    );

    await updateNetworkDisplay();

    updateWalletButton();

    renderActivity();

    setStatus("Wallet connected.");

    await refreshStakingUi();

  } catch (error) {
    console.error(error);

    const message =
      error.reason ||
      error.message ||
      "Connection failed.";

    setStatus(message);
  }
}

function disconnectWallet() {
  manuallyDisconnected = true;

  provider = null;
  signer = null;
  userAddress = null;

  setText("wallet-address", "Not connected");
  setText("wallet-provider", "—");
  setText("wallet-network", "—");

  updateWalletButton();

  setStatus("Wallet disconnected.");
}

async function reconnectIfAlreadyConnected() {
  try {
    if (
      manuallyDisconnected ||
      !window.ethereum
    ) {
      updateWalletButton();
      return;
    }

    const accounts =
      await window.ethereum.request({
        method: "eth_accounts"
      });

    if (!accounts.length) {
      updateWalletButton();
      return;
    }

    walletType = detectWalletType();

    provider =
      new ethers.BrowserProvider(
        window.ethereum
      );

    signer = await provider.getSigner();

    userAddress =
      await signer.getAddress();

    setText(
      "wallet-address",
      userAddress
    );

    setText(
      "wallet-provider",
      walletType
    );

    await updateNetworkDisplay();

    updateWalletButton();

    setStatus("Wallet connected.");

  } catch (error) {
    console.error(error);
  }
}

async function handleAccountsChanged(accounts) {
  if (!accounts.length) {
    disconnectWallet();
    return;
  }

  userAddress = accounts[0];

  provider =
    new ethers.BrowserProvider(
      window.ethereum
    );

  signer = await provider.getSigner();

  walletType = detectWalletType();

  setText(
    "wallet-address",
    userAddress
  );

  setText(
    "wallet-provider",
    walletType
  );

  await updateNetworkDisplay();

  updateWalletButton();

  setStatus("Wallet changed.");

  await refreshStakingUi();
}

async function refreshStakingUi() {
  if (!userAddress) return;

  try {
    const readProvider =
      new ethers.JsonRpcProvider(
        APP_CONFIG.rpcs[0].url
      );

    const token = new ethers.Contract(
      APP_CONFIG.contracts.infl,
      ABI.token,
      readProvider
    );

    const vault = new ethers.Contract(
      APP_CONFIG.contracts.stakingVault,
      ABI.vault,
      readProvider
    );

    const [
      walletBalance,
      userStaked,
      earned,
      totalStaked
    ] = await Promise.all([
      token.balanceOf(userAddress),
      vault.balanceOf(userAddress),
      vault.earned(userAddress),
      vault.totalStaked()
    ]);

    setText(
      "wallet-infl-balance",
      `${Number(
        ethers.formatUnits(walletBalance, 18)
      ).toFixed(4)} INFL`
    );

    setText(
      "vault-user-staked",
      `${Number(
        ethers.formatUnits(userStaked, 18)
      ).toFixed(4)} INFL`
    );

    setText(
      "vault-earned",
      `${Number(
        ethers.formatUnits(earned, 18)
      ).toFixed(4)} INFL`
    );

    setText(
      "vault-total-staked",
      `${Number(
        ethers.formatUnits(totalStaked, 18)
      ).toFixed(4)} INFL`
    );

  } catch (error) {
    console.error(error);

    setStatus(
      "Could not refresh staking data."
    );
  }
}

function renderActivity() {
  return;
}

function updateEnvironmentBadge() {
  const badge = $("environment-badge");

  if (!badge) return;

  badge.textContent = "TESTNET MODE";
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

    stars =
      Array.from(
        { length: 120 },
        () => ({
          x:
            Math.random() *
            canvas.width,

          y:
            Math.random() *
            canvas.height,

          r:
            Math.random() * 1.5 + 0.2,

          s:
            Math.random() * 0.25 + 0.05,

          o:
            Math.random() * 0.6 + 0.25
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

        star.x =
          Math.random() *
          canvas.width;
      }
    }

    requestAnimationFrame(draw);
  }

  resize();

  window.addEventListener(
    "resize",
    resize
  );

  draw();
}
