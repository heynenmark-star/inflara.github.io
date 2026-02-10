document.addEventListener("DOMContentLoaded", () => {
  const elements = document.querySelectorAll(".fade-in");

  const observer = new IntersectionObserver(
    entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
        }
      });
    },
    {
      threshold: 0.15
    }
  );

  elements.forEach(el => observer.observe(el));
});

async function fetchPrices() {
  try {
    const btcRes = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd"
    );
    const btcData = await btcRes.json();
    document.getElementById("btc-price").textContent =
      "$" + btcData.bitcoin.usd.toLocaleString();

    const metalsRes = await fetch("https://api.metals.live/v1/spot");
    const metalsData = await metalsRes.json();

    const gold = metalsData.find(m => m[0] === "gold");
    const silver = metalsData.find(m => m[0] === "silver");

    if (gold) {
      document.getElementById("gold-price").textContent =
        "$" + gold[1].toFixed(2) + " / oz";
    }

    if (silver) {
      document.getElementById("silver-price").textContent =
        "$" + silver[1].toFixed(2) + " / oz";
    }
  } catch (err) {
    console.warn("Price fetch failed:", err);
  }
}

fetchPrices();
