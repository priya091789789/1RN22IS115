const express = require('express');
const app = express();
const PORT = 3000;

app.use(express.json());

// In-memory store for mock stock data
const stockDatabase = {
  AAPL: [],
  GOOGL: [],
  TSLA: [],
  MSFT: [],
  AMZN: []
};

// Simulate incoming stock prices every 10 seconds
setInterval(() => {
  const now = new Date().toISOString();

  for (const ticker of Object.keys(stockDatabase)) {
    const arr = stockDatabase[ticker];
    const lastPrice = arr.length
      ? arr[arr.length - 1].price
      : Math.random() * 1000;

    const change = (Math.random() - 0.5) * 20;
    const price = parseFloat((lastPrice + change).toFixed(4));

    arr.push({ price, lastUpdatedAt: now });

    // Keep only last hour of data (~360 samples)
    if (arr.length > 360) arr.shift();
  }
}, 10_000);

// Helper: get data within last `m` minutes
function getStockDataInMinutes(ticker, m) {
  const arr = stockDatabase[ticker];
  if (!arr) return null;

  const cutoff = Date.now() - m * 60 * 1000;
  return arr.filter(e => new Date(e.lastUpdatedAt).getTime() >= cutoff);
}

// GET available symbols
app.get('/tickers', (req, res) => {
  res.json(Object.keys(stockDatabase));
});

// GET average price
app.get('/stocks/:ticker', (req, res) => {
  const { ticker } = req.params;
  const { minutes, aggregation } = req.query;

  const T = ticker.toUpperCase();
  const m = parseInt(minutes, 10);

  if (!stockDatabase[T]) {
    return res.status(404).json({ error: `Ticker '${T}' not found.` });
  }
  if (!minutes || isNaN(m) || m <= 0 || m > 60) {
    return res.status(400).json({ error: 'minutes is required (1–60).' });
  }
  if (aggregation !== 'average') {
    return res.status(400).json({ error: 'Only aggregation=average supported.' });
  }

  const data = getStockDataInMinutes(T, m);
  if (!data || data.length === 0) {
    return res.status(404).json({ error: `No data for '${T}' in last ${m} min.` });
  }

  const avg = data.reduce((s, e) => s + e.price, 0) / data.length;

  res.json({
    averageStockPrice: parseFloat(avg.toFixed(6)),
    priceHistory: data
  });
});

// GET correlation between two symbols
app.get('/stockcorrelation', (req, res) => {
  const { minutes, ticker } = req.query;
  if (!minutes || !ticker) {
    return res.status(400).json({ error: 'minutes and ticker[] are required.' });
  }

  const m = parseInt(minutes, 10);
  const pair = Array.isArray(ticker) ? ticker : [ticker];
  if (isNaN(m) || m <= 0 || m > 60 || pair.length !== 2) {
    return res.status(400).json({ error: 'Provide minutes(1–60) and two ticker values.' });
  }

  const [T1, T2] = pair.map(t => t.toUpperCase());
  if (!stockDatabase[T1] || !stockDatabase[T2]) {
    return res.status(404).json({ error: 'One or both tickers not found.' });
  }

  const d1 = getStockDataInMinutes(T1, m);
  const d2 = getStockDataInMinutes(T2, m);
  const map1 = new Map(d1.map(e => [e.lastUpdatedAt, e.price]));
  const map2 = new Map(d2.map(e => [e.lastUpdatedAt, e.price]));

  const common = [...map1.keys()].filter(ts => map2.has(ts));
  if (common.length < 2) {
    return res.json({
      correlation: 0,
      stocks: { [T1]: { averagePrice: 0, priceHistory: [] }, [T2]: { averagePrice: 0, priceHistory: [] } }
    });
  }

  const p1 = common.map(ts => map1.get(ts));
  const p2 = common.map(ts => map2.get(ts));

  const avg1 = p1.reduce((s, v) => s + v, 0) / p1.length;
  const avg2 = p2.reduce((s, v) => s + v, 0) / p2.length;

  const cov = p1.reduce((sum, v, i) => sum + (v - avg1) * (p2[i] - avg2), 0) / (p1.length - 1);
  const std1 = Math.sqrt(p1.reduce((s, v) => s + (v - avg1) ** 2, 0) / (p1.length - 1));
  const std2 = Math.sqrt(p2.reduce((s, v) => s + (v - avg2) ** 2, 0) / (p2.length - 1));

  const corr = cov / (std1 * std2) || 0;

  res.json({
    correlation: parseFloat(corr.toFixed(4)),
    stocks: {
      [T1]: { averagePrice: parseFloat(avg1.toFixed(6)), priceHistory: common.map(ts => ({ price: map1.get(ts), lastUpdatedAt: ts })) },
      [T2]: { averagePrice: parseFloat(avg2.toFixed(6)), priceHistory: common.map(ts => ({ price: map2.get(ts), lastUpdatedAt: ts })) }
    }
  });
});

// GET full correlation matrix
app.get('/correlationmatrix', (req, res) => {
  const { minutes } = req.query;
  const m = parseInt(minutes, 10);

  if (isNaN(m) || m <= 0 || m > 60) {
    return res.status(400).json({ error: 'minutes must be 1–60.' });
  }

  const tickers = Object.keys(stockDatabase);
  const matrix = {};
  const averages = {};
  const sds = {};

  for (const T of tickers) {
    const data = getStockDataInMinutes(T, m) || [];
    const prices = data.map(e => e.price);
    if (prices.length < 2) {
      averages[T] = 0;
      sds[T] = 0;
    } else {
      const avg = prices.reduce((s, v) => s + v, 0) / prices.length;
      const variance = prices.reduce((s, v) => s + (v - avg) ** 2, 0) / (prices.length - 1);
      averages[T] = parseFloat(avg.toFixed(6));
      sds[T] = parseFloat(Math.sqrt(variance).toFixed(6));
    }
  }

  for (const T1 of tickers) {
    matrix[T1] = {};
    for (const T2 of tickers) {
      if (T1 === T2) {
        matrix[T1][T2] = 1.0;
      } else {
        // reuse single correlation logic
        const corrRes = (() => {
          const common = (() => {
            const d1 = getStockDataInMinutes(T1, m) || [];
            const d2 = getStockDataInMinutes(T2, m) || [];
            const m1 = new Map(d1.map(e => [e.lastUpdatedAt, e.price]));
            const m2 = new Map(d2.map(e => [e.lastUpdatedAt, e.price]));
            return [...m1.keys()].filter(ts => m2.has(ts));
          })();
          if (common.length < 2) return 0;

          const p1 = common.map(ts => {
            const d1 = getStockDataInMinutes(T1, m) || [];
            return new Map(d1.map(e => [e.lastUpdatedAt, e.price])).get(ts);
          });
          const p2 = common.map(ts => {
            const d2 = getStockDataInMinutes(T2, m) || [];
            return new Map(d2.map(e => [e.lastUpdatedAt, e.price])).get(ts);
          });
          const avg1 = p1.reduce((s, v) => s + v, 0) / p1.length;
          const avg2 = p2.reduce((s, v) => s + v, 0) / p2.length;
          const cov = p1.reduce((sum, v, i) => sum + (v - avg1) * (p2[i] - avg2), 0) / (p1.length - 1);
          const std1 = Math.sqrt(p1.reduce((s, v) => s + (v - avg1) ** 2, 0) / (p1.length - 1));
          const std2 = Math.sqrt(p2.reduce((s, v) => s + (v - avg2) ** 2, 0) / (p2.length - 1));
          return cov / (std1 * std2) || 0;
        })();

        matrix[T1][T2] = parseFloat(corrRes.toFixed(4));
      }
    }
  }

  res.json({ matrix, averages, standardDeviations: sds });
});

app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
