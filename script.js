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


