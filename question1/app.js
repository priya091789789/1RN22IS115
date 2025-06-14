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
    r: [9, 11, 13, 15]
};

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
    const startTime = Date.now();
    let fetchedNumbers = [];

    try {
        fetchedNumbers = await fetchNumbers(id);
        const duration = Date.now() - startTime;
        if (duration > 500) {
            fetchedNumbers = [];
        }
    } catch {
        fetchedNumbers = [];
    }

    for (let num of fetchedNumbers) {
        if (!windowStore.includes(num)) {
            if (windowStore.length >= WINDOW_SIZE) {
                windowStore.shift();
            }
            windowStore.push(num);
        }
    }

    const avg = windowStore.length
        ? parseFloat((windowStore.reduce((a, b) => a + b, 0) / windowStore.length).toFixed(2))
        : 0;

    res.json({
        windowPrevState: prevState,
        windowCurrState: [...windowStore],
        numbers: fetchedNumbers,
        avg
    });
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
