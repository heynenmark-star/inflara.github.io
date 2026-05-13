alert("script.js loaded");

const connectBtn = document.getElementById("connect-wallet");
const walletText = document.getElementById("wallet-address");
const networkText = document.getElementById("wallet-network");
const statusText = document.getElementById("staking-status");

function setStatus(msg) {
  if (statusText) {
    statusText.textContent = msg;
  }
}

if (connectBtn) {
  connectBtn.addEventListener("click", async () => {
    try {
      alert("Connect clicked");

      if (!window.ethereum) {
        alert("No wallet found");
        return;
      }

      const accounts = await window.ethereum.request({
        method: "eth_requestAccounts"
      });

      const account = accounts[0];

      if (walletText) {
        walletText.textContent = account;
      }

      if (networkText) {
        networkText.textContent = "Connected";
      }

      setStatus("Wallet connected");

      alert("Connected: " + account);

    } catch (err) {
      console.error(err);
      alert("Connection failed: " + err.message);
    }
  });
}
