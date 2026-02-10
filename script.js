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

// -------- PRICE FETCHING --------

async function fetchBitcoin() {
  try {
    const res = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd"
    );
    const data = await res.json();
    document.getElementById("btc-price").textContent =
      "$" + data.bitcoin.usd.toLocaleString();
  } catch {
    document.getElementById("btc-price").textContent = "Unavailable";
  }
}

async function fetchMetals() {
  try {
    const goldRes = await fetch("https://api.gold-api.com/price/XAU");
    const goldData = await goldRes.json();
    document.getElementById("gold-price").textContent =
      "$" + goldData.price.toFixed(2) + " / oz";

    const silverRes = await fetch("https://api.gold-api.com/price/XAG");
    const silverData = await silverRes.json();
    document.getElementById("silver-price").textContent =
      "$" + silverData.price.toFixed(2) + " / oz";
  } catch {
    document.getElementById("gold-price").textContent = "Unavailable";
    document.getElementById("silver-price").textContent = "Unavailable";
  }
}

// Initial load
fetchBitcoin();
fetchMetals();

// Refresh every 10 minutes
setInterval(() => {
  fetchBitcoin();
  fetchMetals();
}, 600000);

