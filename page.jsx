import React, { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ethers } from "ethers";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Coins, Gauge, Activity, Percent, CalendarDays, Wallet, Landmark } from "lucide-react";

const ADDRESSES = {
  infl: "0x393289f921bbE6A684B79B9939816AAE68AC1B60",
  treasury: "0x45Aaae335Dcc739638573aFd398077EF326591Bf",
  vault: "0x1EEC97996986B5D0196a68D341D0C2D2C6D1775B",
  engine: "0x8a00327e3631B2e63B320c1E107055fd9fd15f40",
  controller: "0x30481Cc7D7A0F437dec661e36b0a5394F74bBe62",
};

const SEPOLIA_CHAIN_ID = 11155111;
const DEFAULT_RPC = "https://ethereum-sepolia-rpc.publicnode.com";

const inflAbi = [
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
];

const vaultAbi = [
  "function totalStaked() view returns (uint256)",
  "function rewardRate() view returns (uint256)",
  "function periodFinish() view returns (uint256)",
  "function earned(address) view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
];

const engineAbi = [
  "function currentCPIBps() view returns (uint256)",
  "function getAnnualMintRateBps() view returns (uint256)",
];

const controllerAbi = [
  "function previewEpoch() view returns (uint256 cpiBps, uint256 annualRateBps, uint256 mintTotal, uint256 toStakers, uint256 toTreasury)",
  "function secondsUntilNextEpoch() view returns (uint256)",
  "function epochCount() view returns (uint256)",
];

const treasuryAbi = [
  "function inflBalance() view returns (uint256)",
];

function fmt(n, digits = 2) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: digits }).format(Number(n || 0));
}

function fmtToken(v) {
  return `${fmt(v)} INFL`;
}

function shorten(addr) {
  if (!addr) return "Not connected";
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function cpiBand(cpiPct) {
  if (cpiPct < 1) return "< 1%";
  if (cpiPct < 3) return "1% – 3%";
  if (cpiPct < 6) return "3% – 6%";
  if (cpiPct < 10) return "6% – 10%";
  if (cpiPct <= 15) return "10% – 15%";
  return "> 15%";
}

export default function InflaraDashboard() {
  const [rpcUrl, setRpcUrl] = useState(DEFAULT_RPC);
  const [walletAddress, setWalletAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState({
    totalSupply: 0,
    currentCpiBps: 0,
    annualRateBps: 0,
    mintTotal: 0,
    toStakers: 0,
    toTreasury: 0,
    secondsUntilNextEpoch: 0,
    epochCount: 0,
    totalStaked: 0,
    rewardRatePerSecond: 0,
    rewardPool: 0,
    treasuryBalance: 0,
    walletInfl: 0,
    walletStaked: 0,
    walletEarned: 0,
  });

  const readDashboard = async (provider, account = "") => {
    const infl = new ethers.Contract(ADDRESSES.infl, inflAbi, provider);
    const vault = new ethers.Contract(ADDRESSES.vault, vaultAbi, provider);
    const engine = new ethers.Contract(ADDRESSES.engine, engineAbi, provider);
    const controller = new ethers.Contract(ADDRESSES.controller, controllerAbi, provider);
    const treasury = new ethers.Contract(ADDRESSES.treasury, treasuryAbi, provider);

    const [
      totalSupplyRaw,
      currentCpiBpsRaw,
      annualRateBpsRaw,
      previewRaw,
      secondsUntilNextEpochRaw,
      epochCountRaw,
      totalStakedRaw,
      rewardRateRaw,
      periodFinishRaw,
      treasuryBalanceRaw,
      vaultInflRaw,
    ] = await Promise.all([
      infl.totalSupply(),
      engine.currentCPIBps(),
      engine.getAnnualMintRateBps(),
      controller.previewEpoch(),
      controller.secondsUntilNextEpoch(),
      controller.epochCount(),
      vault.totalStaked(),
      vault.rewardRate(),
      vault.periodFinish(),
      treasury.inflBalance(),
      infl.balanceOf(ADDRESSES.vault),
    ]);

    let walletInflRaw = 0n;
    let walletStakedRaw = 0n;
    let walletEarnedRaw = 0n;

    if (account) {
      [walletInflRaw, walletStakedRaw, walletEarnedRaw] = await Promise.all([
        infl.balanceOf(account),
        vault.balanceOf(account),
        vault.earned(account),
      ]);
    }

    const rewardPoolRaw = vaultInflRaw > totalStakedRaw ? vaultInflRaw - totalStakedRaw : 0n;

    setData({
      totalSupply: Number(ethers.formatUnits(totalSupplyRaw, 18)),
      currentCpiBps: Number(currentCpiBpsRaw),
      annualRateBps: Number(annualRateBpsRaw),
      mintTotal: Number(ethers.formatUnits(previewRaw.mintTotal ?? previewRaw[2], 18)),
      toStakers: Number(ethers.formatUnits(previewRaw.toStakers ?? previewRaw[3], 18)),
      toTreasury: Number(ethers.formatUnits(previewRaw.toTreasury ?? previewRaw[4], 18)),
      secondsUntilNextEpoch: Number(secondsUntilNextEpochRaw),
      epochCount: Number(epochCountRaw),
      totalStaked: Number(ethers.formatUnits(totalStakedRaw, 18)),
      rewardRatePerSecond: Number(ethers.formatUnits(rewardRateRaw, 18)),
      periodFinish: Number(periodFinishRaw),
      rewardPool: Number(ethers.formatUnits(rewardPoolRaw, 18)),
      treasuryBalance: Number(ethers.formatUnits(treasuryBalanceRaw, 18)),
      walletInfl: Number(ethers.formatUnits(walletInflRaw, 18)),
      walletStaked: Number(ethers.formatUnits(walletStakedRaw, 18)),
      walletEarned: Number(ethers.formatUnits(walletEarnedRaw, 18)),
    });
  };

  const loadReadOnly = async () => {
    setLoading(true);
    setError("");
    try {
      const provider = new ethers.JsonRpcProvider(rpcUrl);
      await readDashboard(provider, walletAddress);
    } catch (e) {
      setError(e?.message || "Failed to load Sepolia data");
    } finally {
      setLoading(false);
    }
  };

  const connectWallet = async () => {
    if (!window.ethereum) {
      setError("MetaMask not detected in browser.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const network = await provider.getNetwork();
      if (Number(network.chainId) !== SEPOLIA_CHAIN_ID) {
        await window.ethereum.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: "0xaa36a7" }],
        });
      }
      const signer = await provider.getSigner();
      const account = await signer.getAddress();
      setWalletAddress(account);
      await readDashboard(provider, account);
    } catch (e) {
      setError(e?.shortMessage || e?.message || "Wallet connection failed");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReadOnly();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cpiPct = useMemo(() => data.currentCpiBps / 100, [data.currentCpiBps]);
  const stakingRatio = useMemo(() => {
    if (!data.totalSupply) return 0;
    return (data.totalStaked / data.totalSupply) * 100;
  }, [data.totalSupply, data.totalStaked]);
  const impliedApr = useMemo(() => {
    if (!data.totalStaked) return 0;
    return ((data.toStakers * 12) / data.totalStaked) * 100;
  }, [data.toStakers, data.totalStaked]);
  const nextEpochHours = useMemo(() => data.secondsUntilNextEpoch / 3600, [data.secondsUntilNextEpoch]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 p-6 md:p-10">
      <div className="max-w-7xl mx-auto space-y-8">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="space-y-3">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-4xl md:text-5xl font-semibold tracking-tight">Inflara Sepolia Dashboard</h1>
              <p className="text-slate-600 mt-2 max-w-3xl">
                Live protocol view for the current Sepolia release candidate: supply, CPI, epoch emissions, staking metrics, and treasury balance.
              </p>
            </div>
            <Badge className="rounded-full px-4 py-2 text-sm">Sepolia RC</Badge>
          </div>
        </motion.div>

        <Card className="rounded-2xl shadow-sm border-slate-200">
          <CardHeader>
            <CardTitle className="text-xl">Connection</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto_auto] gap-4 items-end">
              <div className="space-y-2">
                <label className="text-sm text-slate-600">Sepolia RPC URL</label>
                <Input value={rpcUrl} onChange={(e) => setRpcUrl(e.target.value)} />
              </div>
              <Button className="rounded-2xl" onClick={loadReadOnly} disabled={loading}>
                Refresh Read-Only
              </Button>
              <Button variant="outline" className="rounded-2xl" onClick={connectWallet} disabled={loading}>
                Connect MetaMask
              </Button>
            </div>
            <div className="text-sm text-slate-600">Connected wallet: <strong>{shorten(walletAddress)}</strong></div>
            {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl p-3">{error}</div>}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
          <MetricCard icon={<Coins className="w-5 h-5" />} title="Circulating Supply" value={fmtToken(data.totalSupply)} subtitle="Current total supply on Sepolia" />
          <MetricCard icon={<Gauge className="w-5 h-5" />} title="Current CPI" value={`${fmt(cpiPct)}%`} subtitle={`Band: ${cpiBand(cpiPct)}`} />
          <MetricCard icon={<Activity className="w-5 h-5" />} title="Epoch Emissions" value={fmtToken(data.mintTotal)} subtitle="Preview of next monthly mint" />
          <MetricCard icon={<Percent className="w-5 h-5" />} title="Staking APR" value={`${fmt(impliedApr)}%`} subtitle="Implied by current epoch preview" />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
          <Card className="rounded-2xl shadow-sm border-slate-200 xl:col-span-2">
            <CardHeader>
              <CardTitle className="text-xl">Protocol Emission State</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <SubMetric label="Annual Mint Rate" value={`${fmt(data.annualRateBps / 100)}%`} />
                <SubMetric label="To Stakers (90%)" value={fmtToken(data.toStakers)} />
                <SubMetric label="To Treasury (10%)" value={fmtToken(data.toTreasury)} />
              </div>
              <div className="space-y-3">
                <div className="flex justify-between text-sm text-slate-600">
                  <span>Staking participation</span>
                  <span>{fmt(stakingRatio)}%</span>
                </div>
                <Progress value={Math.min(stakingRatio, 100)} className="h-3" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <SubMetric label="Epoch Count" value={fmt(data.epochCount, 0)} />
                <SubMetric label="Next Epoch In" value={`${fmt(nextEpochHours)} hrs`} />
                <SubMetric label="Reward Rate / Sec" value={fmtToken(data.rewardRatePerSecond)} />
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl shadow-sm border-slate-200">
            <CardHeader>
              <CardTitle className="text-xl">Treasury & Vault</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="p-4 rounded-2xl bg-slate-100">
                <div className="text-sm text-slate-500">Treasury Balance</div>
                <div className="text-2xl font-semibold mt-1">{fmtToken(data.treasuryBalance)}</div>
              </div>
              <div className="p-4 rounded-2xl bg-slate-100">
                <div className="text-sm text-slate-500">Total Staked</div>
                <div className="text-2xl font-semibold mt-1">{fmtToken(data.totalStaked)}</div>
              </div>
              <div className="p-4 rounded-2xl bg-slate-100">
                <div className="text-sm text-slate-500">Reward Pool</div>
                <div className="text-2xl font-semibold mt-1">{fmtToken(data.rewardPool)}</div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <Card className="rounded-2xl shadow-sm border-slate-200 lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-xl flex items-center gap-2">
                <CalendarDays className="w-5 h-5" />
                CPI Band Rules
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {[
                  ["< 1%", "5% annual mint"],
                  ["1% – 3%", "3% annual mint"],
                  ["3% – 6%", "2% annual mint"],
                  ["6% – 10%", "1% annual mint"],
                  ["10% – 15%", "0% mint"],
                  ["> 15%", "0% mint / burn later"],
                ].map(([band, rule]) => {
                  const active = band === cpiBand(cpiPct);
                  return (
                    <div key={band} className={`rounded-2xl border p-4 ${active ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white"}`}>
                      <div className="flex items-center justify-between gap-3">
                        <div className="font-medium">{band}</div>
                        {active && <Badge className="rounded-full bg-white text-slate-900 hover:bg-white">Active</Badge>}
                      </div>
                      <div className={`mt-3 text-sm ${active ? "text-slate-200" : "text-slate-600"}`}>{rule}</div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl shadow-sm border-slate-200">
            <CardHeader>
              <CardTitle className="text-xl">My Wallet</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <WalletSummary icon={<Wallet className="w-5 h-5" />} label="Wallet INFL" value={fmtToken(data.walletInfl)} />
              <WalletSummary icon={<Landmark className="w-5 h-5" />} label="Wallet Staked" value={fmtToken(data.walletStaked)} />
              <WalletSummary icon={<Percent className="w-5 h-5" />} label="Wallet Earned" value={fmtToken(data.walletEarned)} />
              <div className="text-xs text-slate-500 leading-relaxed">
                Wallet-specific values populate when MetaMask is connected on Sepolia.
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="rounded-2xl shadow-sm border-slate-200">
          <CardHeader>
            <CardTitle className="text-xl">Contract Addresses</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4 text-sm">
            {Object.entries(ADDRESSES).map(([key, value]) => (
              <div key={key} className="rounded-2xl bg-slate-100 p-4 break-all">
                <div className="uppercase text-xs tracking-wide text-slate-500 mb-2">{key}</div>
                <div className="font-medium">{value}</div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function MetricCard({ icon, title, value, subtitle }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <Card className="rounded-2xl shadow-sm border-slate-200 h-full">
        <CardContent className="p-6 space-y-3">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-sm font-medium">{title}</span>
            {icon}
          </div>
          <div className="text-3xl font-semibold tracking-tight">{value}</div>
          <div className="text-sm text-slate-500">{subtitle}</div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

function SubMetric({ label, value }) {
  return (
    <div className="rounded-2xl bg-slate-100 p-4">
      <div className="text-sm text-slate-500">{label}</div>
      <div className="text-xl font-semibold mt-1">{value}</div>
    </div>
  );
}

function WalletSummary({ icon, label, value }) {
  return (
    <div className="rounded-2xl bg-slate-100 p-4 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <div className="text-slate-500">{icon}</div>
        <div>
          <div className="text-sm text-slate-500">{label}</div>
          <div className="font-semibold">{value}</div>
        </div>
      </div>
    </div>
  );
}
