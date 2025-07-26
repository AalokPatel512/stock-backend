const express = require("express");
const puppeteer = require("puppeteer-core");
const cors = require("cors");

const app = express();
app.use(cors());

const PORT = process.env.PORT || 5000;

app.get("/api/option-chain/:symbol", async (req, res) => {
  const symbol = req.params.symbol.toUpperCase();

  try {
    const browser = await puppeteer.launch({
      headless: "new",
      executablePath: "/usr/bin/google-chrome", // system-installed chrome on Render
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();

    await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64)");
    await page.goto(`https://www.nseindia.com/option-chain`, {
      waitUntil: "networkidle2"
    });

    const dataUrl = `https://www.nseindia.com/api/option-chain-equities?symbol=${symbol}`;
    await page.setExtraHTTPHeaders({
      referer: "https://www.nseindia.com/option-chain"
    });

    const response = await page.goto(dataUrl);
    const body = await response.text();

    await browser.close();

    const data = JSON.parse(body);

    const underlyingValue = data.records.underlyingValue;
    const optionData = data.filtered.data;
    const labels = optionData.map(row => row.strikePrice);
    const callOi = optionData.map(row => row.CE?.openInterest || 0);
    const putOi = optionData.map(row => row.PE?.openInterest || 0);
    const callChngOi = optionData.map(row => row.CE?.changeinOpenInterest || 0);
    const putChngOi = optionData.map(row => row.PE?.changeinOpenInterest || 0);

    const painMap = {};
    optionData.forEach(row => {
      const strike = row.strikePrice;
      const ceOi = row.CE?.openInterest || 0;
      const peOi = row.PE?.openInterest || 0;
      const pain = ceOi * Math.max(0, strike - underlyingValue) + peOi * Math.max(0, underlyingValue - strike);
      painMap[strike] = pain;
    });
    const maxPain = Object.keys(painMap).reduce((a, b) => painMap[a] < painMap[b] ? a : b);

    res.json({
      underlyingValue,
      lotSize: data.filtered.data[0]?.marketLot || 0,
      maxPain,
      chartData: {
        labels,
        callOi,
        putOi,
        callChngOi,
        putChngOi
      }
    });
  } catch (err) {
    res.status(500).json({ error: "Puppeteer fetch failed: " + err.message });
  }
});

app.get("/", (req, res) => {
  res.send("✅ Backend is running.");
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
