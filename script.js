// ==============================
// FADE-IN OBSERVER
// ==============================
document.addEventListener("DOMContentLoaded", () => {
  const elements = document.querySelectorAll(".fade-in");

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15 }
  );

  elements.forEach((el) => observer.observe(el));

  // Load dashboard when page is ready
  loadDashboard();
});

// ==============================
// STARFIELD BACKGROUND
// ==============================
const canvas = document.getElementById("starfield");
const ctx = canvas ? canvas.getContext("2d") : null;

let stars = [];
const STAR_COUNT = 100;

function resizeCanvas() {
  if (!canvas) return;
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}

window.addEventListener("resize", resizeCanvas);
resizeCanvas();

function createStars() {
  if (!canvas) return;
  stars = [];
  for (let i = 0; i < STAR_COUNT; i++) {
    stars.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      radius: Math.random() * 1.5,
      speed: 0.05 + Math.random() * 0.1,
      opacity: 0.3 + Math.random() * 0.4,
    });
  }
}

function drawStars() {
  if (!canvas || !ctx) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  stars.forEach((star) => {
    ctx.beginPath();
    ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, 255, 255, ${star.opacity})`;
    ctx.fill();

    star.y -= star.speed;

    if (star.y < 0) {
      star.y = canvas.height;
      star.x = Math.random() * canvas.width;
    }
  });

  requestAnimationFrame(drawStars);
}

createStars();
drawStars();

// ==============================
// INFLARA DASHBOARD
// ==============================

// Replace this with your FULL Sepolia Alchemy URL if needed
const RPC = "https://eth-sepolia.g.alchemy.com/v2/SAnXKYhqMQWm0eYNvuPv_";

const INFL = "0x393289f921bbE6A684B79B9939816AAE68AC1B60";
const ENGINE = "0x8a00327e3631B2e63B320c1E107055fd9fd15f40";
const CONTROLLER = "0x30481Cc7D7A0F437dec661e36b0a5394F74bBe62";

const tokenABI = [
  "function totalSupply() view returns (uint256)"
];

const engineABI = [
  "function currentCPIBps() view returns (uint256)"
];

const controllerABI = [
  "function previewEpoch() view returns (uint256 cpiBps, uint256 annualRateBps, uint256 mintTotal, uint256 toStakers, uint256 toTreasury)"
];

async function loadDashboard() {
  try {
    if (typeof ethers === "undefined") {
      throw new Error("ethers library not loaded");
    }

    const provider = new ethers.JsonRpcProvider(RPC);

    const token = new ethers.Contract(INFL, tokenABI, provider);
    const engine = new ethers.Contract(ENGINE, engineABI, provider);
    const controller = new ethers.Contract(CONTROLLER, controllerABI, provider);

    const supply = await token.totalSupply();
    const cpi = await engine.currentCPIBps();
    const preview = await controller.previewEpoch();

    const formattedSupply = Number(ethers.formatUnits(supply, 18)).toLocaleString();
    const formattedCpi = (Number(cpi) / 100).toFixed(2) + "%";
    const formattedEmissions = Number(
      ethers.formatUnits(preview.mintTotal ?? preview[2], 18)
    ).toLocaleString();

    const supplyEl = document.getElementById("supply");
    const cpiEl = document.getElementById("cpi");
    const emissionsEl = document.getElementById("emissions");

    if (supplyEl) supplyEl.innerText = formattedSupply + " INFL";
    if (cpiEl) cpiEl.innerText = formattedCpi;
    if (emissionsEl) emissionsEl.innerText = formattedEmissions + " INFL";
  } catch (error) {
    console.error("Dashboard load error:", error);

    const supplyEl = document.getElementById("supply");
    const cpiEl = document.getElementById("cpi");
    const emissionsEl = document.getElementById("emissions");

    if (supplyEl) supplyEl.innerText = "Error loading";
    if (cpiEl) cpiEl.innerText = "Error loading";
    if (emissionsEl) emissionsEl.innerText = "Error loading";
  }
}
