<div align="center">

# ⬡ SAFEGUARD
### Digital Tool for Prevention of Online Harassment and Cyberbullying

[![Python](https://img.shields.io/badge/Python-3.11-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://python.org)
[![Flask](https://img.shields.io/badge/Flask-3.0.3-000000?style=for-the-badge&logo=flask&logoColor=white)](https://flask.palletsprojects.com)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?style=for-the-badge&logo=docker&logoColor=white)](https://docker.com)
[![Detoxify](https://img.shields.io/badge/Detoxify-ML%20Powered-FF6B6B?style=for-the-badge)](https://github.com/unitaryai/detoxify)
[![Chart.js](https://img.shields.io/badge/Chart.js-4.4.1-FF6384?style=for-the-badge&logo=chartdotjs&logoColor=white)](https://chartjs.org)
[![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)](LICENSE)

**A real-time web-based harassment detection system combining transformer-based ML with classical data structures.**

*Individual Work — Data Structures and Algorithms Course*  
*Technical University of Moldova, Faculty of FCIM, Department of Software Engineering*

[Features](#-features) · [Quick Start](#-quick-start) · [Architecture](#-architecture) · [API](#-api-reference) · [DSA Components](#-dsa-components) · [Contributing](#-contributing)

</div>

---

## 📖 Overview

SAFEGUARD is a web application that simulates a monitored online chat environment and analyzes every message in real time for harassment and toxic content. It combines:

- **[Detoxify](https://github.com/unitaryai/detoxify)** — a BERT-based transformer model that scores messages across 6 independent toxicity categories
- **5 classical DSA structures** — Trie, Priority Queue, Message Queue, Sliding Window, Hash Map + Word-Frequency Map — each handling a specific operational requirement
- **Chart.js** visualizations — 4 live-updating charts in the Analytics tab
- **Session persistence** — full JSON export and re-import of moderation sessions

Every message sent through the chat interface is automatically:
1. Scored by the Detoxify ML model across 6 toxicity categories
2. Scanned by a Trie for keyword highlights
3. Ranked in an alert priority queue
4. Tracked in a per-user risk profile with sliding window behavioral analysis

---

## ✨ Features

### 🔴 Real-Time Toxicity Detection
- 6 independent Detoxify scores per message: **Toxicity, Severe Toxicity, Obscene, Threat, Insult, Identity Attack**
- Animated progress bars on each message card, colored by severity
- Four severity levels with distinct visual coding: **Safe** (green) · **Medium** (amber) · **High** (orange) · **Critical** (pulsing red)

### 👤 User Risk & Reputation System
- Per-user risk profiles updated on every message
- Risk levels computed from a **120-second sliding window**: Low Risk · Medium Risk · High Risk · Critical Risk
- User Risk Table sorted by risk level in real time

### 📊 Analytics & Statistics
- **Severity Distribution** — donut chart of safe / medium / high / critical message proportions
- **Toxicity Timeline** — line chart of the last 30 messages
- **Top Toxic Users** — horizontal bar chart colored by user risk level
- **Top Toxic Words** — horizontal bar chart from the word-frequency tracker

### 💾 Session Persistence & Export
- **Export** — one click generates a complete JSON file with all messages, scores, user data, and statistics
- **Import** — load any previously exported session; all messages are restored exactly as they appeared including score bars, colors, and keyword pills
- **Before-unload protection** — browser warns before closing a session with unsaved data

### 🧠 DSA Transparency Panel
- Live panel showing all active data structures with Big-O annotations

---

## 🚀 Quick Start

### Option A — Docker (recommended, works everywhere)

**Requirements:** [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed and running.

```bash
# 1. Clone the repository
git clone https://github.com/YOUR_USERNAME/safeguard-harassment-detector.git
cd safeguard-harassment-detector

# 2. Build and start
docker compose up --build

# 3. Open in browser
open http://localhost:5001
```

> ⏳ **First run takes 3–5 minutes** — Docker downloads PyTorch (CPU-only, ~200 MB) and the Detoxify model checkpoint (~250 MB). Every subsequent start is instant thanks to the Docker volume cache.

To stop: press `Ctrl + C` in the terminal.  
To start again (no rebuild needed):
```bash
docker compose up
```

---

### Option B — Run without Docker

**Requirements:** Python 3.10 or higher.

```bash
# 1. Clone the repository
git clone https://github.com/YOUR_USERNAME/safeguard-harassment-detector.git
cd safeguard-harassment-detector

# 2. Create and activate a virtual environment (recommended)
python -m venv venv
source venv/bin/activate        # macOS / Linux
venv\Scripts\activate           # Windows

# 3. Install CPU-only PyTorch first (much smaller than the default GPU build)
pip install torch --index-url https://download.pytorch.org/whl/cpu

# 4. Install remaining dependencies
pip install -r requirements.txt

# 5. Start the server
python app.py

# 6. Open in browser
open http://localhost:5000
```

> 📦 The Detoxify model (~250 MB) is downloaded automatically on first startup and cached in `~/.cache/huggingface/`.

---

## 🗂 Project Structure

```
safeguard-harassment-detector/
│
├── app.py              # Flask server — 6 API endpoints
├── detector.py         # Core DSA engine + ToxicityAnalyzer
├── requirements.txt    # Python dependencies
│
├── static/
│   ├── index.html      # SPA layout — 3-tab left panel + chat
│   ├── style.css       # Dark cybersecurity theme (CSS variables)
│   └── app.js          # Frontend logic, Chart.js, export/import
│
├── Dockerfile          # Single-container build (CPU-only PyTorch)
├── docker-compose.yml  # Service config with model-cache volume
└── README.md
```

---

## 🏗 Architecture

```
Browser (SPA)
    │
    │  POST /api/send          GET /api/dashboard (every 3s)
    │  GET  /api/export        POST /api/import
    │  POST /api/reset
    ▼
Flask Server (app.py)
    │
    ▼
ToxicityAnalyzer (detector.py)
    │
    ├── Detoxify ML Model ──── 6 category scores [0–100]
    │
    ├── 1. Trie ─────────────── O(m) keyword extraction
    ├── 2. Priority Queue ────── max-heap alert management
    ├── 3. Message Queue ─────── FIFO circular buffer (cap 500)
    ├── 4. Hash Map ──────────── O(1) user profile lookup
    ├── 5. Sliding Window ────── 120s behavioral analysis
    └── 6. Word-Freq HashMap ─── O(1) toxic word counting
```

**Analysis pipeline per message (8 steps):**

| Step | Component | Operation | Complexity |
|------|-----------|-----------|------------|
| 1 | Detoxify | ML inference — 6 scores | O(seq_len) |
| 2 | — | Compute overall = max(scores) | O(6) |
| 3 | — | Classify severity level | O(1) |
| 4 | Trie | Keyword scan (unigrams+bigrams+trigrams) | O(n·m) |
| 5 | MessageQueue | Enqueue message record | O(1) |
| 6 | WordFreqMap | Increment keyword counts | O(k) |
| 7 | UserRiskTracker | Update HashMap + SlidingWindow | O(1) amort. |
| 8 | AlertPriorityQueue | Push if flagged | O(log n) |

---

## 🧩 DSA Components

### 1. Trie — Keyword Detection
Prefix tree for O(m) lookup of toxic keywords and multi-word phrases (supports unigrams, bigrams, trigrams). 32 phrases loaded at startup across 4 severity tiers.

### 2. Priority Queue — Alert Management
Max-heap backed by Python's `heapq`. Higher-severity alerts always surface first in the Live Alerts panel. Capped at 50 entries with automatic eviction of lowest-severity item.

### 3. Message Queue — FIFO Pipeline
`collections.deque(maxlen=500)` — O(1) enqueue/dequeue, circular buffer. Provides the full message list for the export snapshot and session replay.

### 4. Hash Map — User Risk Tracker
Python `dict` — O(1) average lookup/insert. Each user maps to a profile containing a SlidingWindow, all-time score list, warning count, and current risk level.

### 5. Sliding Window — Behavioral Analysis
Per-user `deque` of `(timestamp, score)` pairs within a 120-second rolling window. Lazy eviction on write. Drives escalating risk level computation.

### 6. Word-Frequency Hash Map
`dict[str, int]` — O(1) increment per keyword, O(n log n) for top-N retrieval. Powers the Top Toxic Words chart in the Analytics tab and is included in session exports.

---

## 🔌 API Reference

| Method | Endpoint | Body | Description |
|--------|----------|------|-------------|
| `GET` | `/` | — | Serves the frontend SPA |
| `POST` | `/api/send` | `{username, message}` | Analyze and store a message |
| `GET` | `/api/dashboard` | — | Full dashboard: stats, alerts, users, analytics |
| `GET` | `/api/export` | — | Complete session JSON for download |
| `POST` | `/api/import` | session JSON | Restore a previous session |
| `POST` | `/api/reset` | — | Clear all in-memory state |

### Example — Send a message

```bash
curl -X POST http://localhost:5001/api/send \
  -H "Content-Type: application/json" \
  -d '{"username": "Alice", "message": "Hello everyone!"}'
```

```json
{
  "message": {
    "id": 1746969600000,
    "username": "Alice",
    "text": "Hello everyone!",
    "toxicity_score": 2.1,
    "severity": "safe",
    "is_flagged": false,
    "scores": {
      "toxicity": 2.1,
      "severe_toxicity": 0.1,
      "obscene": 0.3,
      "threat": 0.1,
      "insult": 1.2,
      "identity_attack": 0.1
    },
    "keywords": [],
    "timestamp": "12:34:56"
  },
  "user": {
    "username": "Alice",
    "risk_level": "safe",
    "total_messages": 1,
    "warnings": 0,
    "avg_toxicity": 2.1
  },
  "global": {
    "total_messages": 1,
    "flagged_messages": 0,
    "flag_rate": 0.0,
    "avg_toxicity": 2.1
  }
}
```

### Example — Export session

```bash
curl http://localhost:5001/api/export -o my_session.json
```

### Example — Import session

```bash
curl -X POST http://localhost:5001/api/import \
  -H "Content-Type: application/json" \
  -d @my_session.json
```

---

## ⚙️ Configuration

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `PORT` | `5000` | Flask server port (inside container) |
| `DEBUG` | `false` | Flask debug mode |

The external port mapping is set in `docker-compose.yml` (`5001:5000`). Change the left number to use a different host port.

---

## 🔧 Troubleshooting

**Port 5001 already in use:**
```bash
# Edit docker-compose.yml, change "5001:5000" to "5002:5000"
# then:
docker compose up
```

**Permission denied on macOS:**
```bash
chmod -R 755 /path/to/safeguard-harassment-detector
docker compose up --build
```

**Model download fails (no internet in container):**  
Ensure Docker Desktop has network access enabled in Settings → Resources → Network.

**`static` folder not found during build:**  
Make sure the `static/` directory with `index.html`, `style.css`, and `app.js` is present in the same folder as the `Dockerfile`.

---

## 🤝 Contributing

Contributions are welcome! Here is how to get started:

```bash
# Fork the repo on GitHub, then:
git clone https://github.com/YOUR_USERNAME/safeguard-harassment-detector.git
cd safeguard-harassment-detector
git checkout -b feature/your-feature-name

# Make your changes, then:
git add .
git commit -m "feat: describe your change"
git push origin feature/your-feature-name
# Open a Pull Request on GitHub
```

**Ideas for contributions:**
- Add multilingual support using the Detoxify `multilingual` model
- Persist sessions to PostgreSQL instead of in-memory state
- Add WebSocket support for truly real-time multi-client chat
- Implement email/webhook alerts for critical severity events
- Add more DSA visualizations (e.g., animate the Trie traversal)

---

## 👥 Authors

| Name | Role | GitHub |
|------|------|--------|
| Bradu Stanislav | Lead Developer | [@YOUR_USERNAME](https://github.com/YOUR_USERNAME) |
| [Friend's Name] | Co-Author | [@FRIEND_USERNAME](https://github.com/FRIEND_USERNAME) |

*Individual Work — Data Structures and Algorithms*  
*Supervisor: Burlacu Natalia, PhD, Associate Professor*  
*Technical University of Moldova, 2026*

---

## 📚 References

- [Detoxify — unitaryai](https://github.com/unitaryai/detoxify)
- [Jigsaw Toxic Comment Classification Challenge](https://www.kaggle.com/c/jigsaw-toxic-comment-classification-challenge)
- [Flask Documentation](https://flask.palletsprojects.com/)
- [Chart.js Documentation](https://www.chartjs.org/docs/)
- [EU Digital Services Act](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32022R2065)

---

## 📄 License

```
MIT License — Copyright (c) 2026 Bradu Stanislav

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software to use, copy, modify, merge, publish, distribute, sublicense,
and/or sell copies of the Software, subject to the standard MIT terms.
```

---

<div align="center">

Made with ⚡ for the DSA course at **Technical University of Moldova**

</div>
