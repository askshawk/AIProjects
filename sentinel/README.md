# Sentinel — Personal Intelligence & Market Dashboard

A sophisticated AI-powered signal collection, analysis, and visualization platform. Sentinel combines real-time news and market data, analyzes them with Claude AI, and surfaces actionable intelligence through an interactive dashboard.

## Features

- **Signal Collection**: Fetches signals from multiple sources (news + live market data)
- **AI Analysis**: Uses Claude to analyze each signal for threat level, entities, domains, sentiment, and significance
- **Vector Search**: Semantic search across all signals via ChromaDB embeddings
- **Market Dashboard**: Live ticker prices, percent change, and a sector heatmap with Chart.js trends
- **Intelligence Brief**: AI-generated daily synthesis of key signals, with a browsable archive
- **Entity Network**: Interactive D3.js force-directed graph of entities that co-appear across signals

## Tech Stack

- **Backend**: Python 3.8+ | Flask
- **Database**: SQLite + ChromaDB (vector embeddings)
- **AI**: Claude Sonnet 4.6 (Anthropic SDK)
- **Data**: NewsAPI, yfinance
- **Visualization**: Chart.js, D3.js
- **Deployment**: Render.com

## Getting Started

### Prerequisites

- Python 3.8+
- NewsAPI key (free at https://newsapi.org)
- Claude API key (from https://console.anthropic.com)

### Installation

1. Clone the repo:
```bash
git clone https://github.com/yourusername/sentinel.git
cd sentinel
```

2. Create virtual environment:
```bash
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
```

3. Install dependencies:
```bash
pip install -r requirements.txt
```

4. Set up environment variables:
```bash
cp .env.example .env
# Edit .env with your API keys
```

5. Run the app:
```bash
python app.py
```

6. Visit `http://localhost:5000`

## Usage

1. **Collect Signals**: Click "⚡ Collect New Signals" button on the feed
2. **View Feed**: Browse analyzed signals with threat levels and scores
3. **Filter**: Use threat level buttons to filter (Critical → Low)
4. **Markets**: View live market data (Phase 4)
5. **Brief**: Read AI-generated daily intelligence brief (Phase 4)
6. **Search**: Semantic search across all signals (Phase 3)
7. **Entities**: Explore entity relationship network (Phase 5)

## Project Phases

### Phase 1 ✅ Foundation
- Flask app skeleton, SQLite schema
- News + market data collection
- Claude signal analysis
- Feed UI with threat filters

### Phase 2 ✅ Agents
- Multi-step agent chain (collector → analyzer → embedder → synthesizer)
- Threat/risk/sentiment analysis
- Daily brief generation

### Phase 3 ✅ Semantic Search
- ChromaDB vector storage
- Meaning-based search across signals

### Phase 4 ✅ Market & Brief Pages
- Chart.js price visualization + sector heatmap
- Brief history and archive

### Phase 5 ✅ Entity Network
- D3.js force-directed graph
- Entity co-occurrence tracking

### Deployment ⬜ Optional
- Render.com (Procfile included)

## API Endpoints

### GET `/api/signals?threat_level=high&limit=50`
Returns list of signals with optional threat level filter.

### POST `/api/collect`
Triggers signal collection and analysis.
```json
{
  "category": "general"
}
```

### GET `/api/briefs?limit=5`
Returns latest intelligence briefs.

### GET `/api/search?q=supply+chain+risks&limit=20`
Semantic vector search across all signals (ChromaDB).

### GET `/api/market-data`
Current price, percent change, and volume for tracked tickers.

### GET `/api/entities`
Entity co-occurrence graph (nodes + links) for the network visualization.

## Architecture

```
User → Flask Routes → Signal Collection (News + Market)
                   ↓
                 Claude AI Analysis
                   ↓
           SQLite Storage + ChromaDB Embeddings
                   ↓
            Dashboard Visualization
```

## Learning Goals

This project demonstrates:
- **Multi-step AI agents** with Claude
- **Vector embeddings & semantic search** with ChromaDB
- **Data visualization** with Chart.js + D3.js
- **Full-stack web development** (Flask + JavaScript)
- **Production deployment** (Render.com)

## License

MIT
