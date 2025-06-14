const express = require('express');
const app = express();
const PORT = 9876;

const WINDOW_SIZE = 10;
const ALLOWED_IDS = ['p', 'f', 'e', 'r'];
let windowStore = [];

const mockResponses = {
  p: [1, 3, 5, 7],
  f: [1, 1, 2, 3],
  e: [6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30],
  r: [9, 11, 13, 15],
};

// Simulates network fetch with 200ms latency
function fetchNumbers(id) {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(mockResponses[id] || []);
    }, 200);
  });
}

app.get('/numbers/:numberid', async (req, res) => {
  const id = req.params.numberid;

  if (!ALLOWED_IDS.includes(id)) {
    return res.status(400).json({ error: "Invalid number ID" });
  }

  const prevState = [...windowStore];
  let fetchedNumbers = [];

  try {
    const start = Date.now();
    fetchedNumbers = await fetchNumbers(id);
    const elapsed = Date.now() - start;

    if (elapsed > 500) {
      console.warn(`Fetch for '${id}' took ${elapsed}ms — ignoring results`);
      fetchedNumbers = [];
    }
  } catch (err) {
    console.error(`Error fetching numbers for '${id}':`, err);
    fetchedNumbers = [];
  }

  // Add unique numbers, maintain window size
  for (const num of fetchedNumbers) {
    if (!windowStore.includes(num)) {
      windowStore.push(num);
      if (windowStore.length > WINDOW_SIZE) {
        windowStore.shift();
      }
    }
  }

  const avg = windowStore.length
    ? parseFloat((windowStore.reduce((a, b) => a + b, 0) / windowStore.length).toFixed(2))
    : 0;

  const response = {
    windowPrevState: prevState,
    windowCurrState: [...windowStore],
    numbers: fetchedNumbers,
    avg
  };

  console.log(JSON.stringify(response, null, 2));
  return res.json(response);
});

app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
