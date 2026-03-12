// Fade-in observer
document.addEventListener("DOMContentLoaded", () => {
  const elements = document.querySelectorAll(".fade-in");

  const observer = new IntersectionObserver(
    entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15 }
  );

  elements.forEach(el => observer.observe(el));
});

// ----- STARFIELD BACKGROUND -----

const canvas = document.getElementById("starfield");
const ctx = canvas.getContext("2d");

let stars = [];
const STAR_COUNT = 100; // Keep low for subtlety

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}

window.addEventListener("resize", resizeCanvas);
resizeCanvas();

function createStars() {
  stars = [];
  for (let i = 0; i < STAR_COUNT; i++) {
    stars.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      radius: Math.random() * 1.5,
      speed: 0.05 + Math.random() * 0.1,
      opacity: 0.3 + Math.random() * 0.4
    });
  }
}
const RPC = "https://eth-sepolia.g.alchemy.com/v2/SAnXKYhqMQWm0eYNvuPv_";
const INFL = "0x393289f921bbE6A684B79B9939816AAE68AC1B60";
const CONTROLLER = "0x30481Cc7D7A0F437dec661e36b0a5394F74bBe62";

const tokenABI = [
 "function totalSupply() view returns (uint256)"
];

const controllerABI = [
 "function currentCPIBps() view returns (uint256)"
];

async function loadDashboard() {

const provider = new ethers.JsonRpcProvider(RPC);

const token = new ethers.Contract(INFL, tokenABI, provider);
const controller = new ethers.Contract(CONTROLLER, controllerABI, provider);

const supply = await token.totalSupply();
const cpi = await controller.currentCPIBps();

document.getElementById("supply").innerText =
Number(ethers.formatUnits(supply,18)).toLocaleString();

document.getElementById("cpi").innerText =
(cpi/100).toFixed(2) + "%";

document.getElementById("emissions").innerText =
"Dynamic (CPI based)";

}
function drawStars() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  stars.forEach(star => {
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


