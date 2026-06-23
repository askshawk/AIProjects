# AIProjects

A collection of my AI/Python learning projects. Each project lives in its own self-contained folder with its own README, dependencies, and run instructions — open a folder to dive in.

## Projects

| Project | What it is | Run it |
|---------|-----------|--------|
| [news-analysis/](news-analysis/) | Flask + CLI tool that fetches news (NewsAPI) and analyzes it with Claude for geopolitical significance, entities, and insights. | `cd news-analysis && pip install -r requirements.txt && python app.py` |
| [sentinel/](sentinel/) | Personal intelligence & market dashboard — collects news + live market data, analyzes each signal with Claude, and visualizes it (entity graph, briefs). The more advanced evolution of news-analysis. | `cd sentinel && pip install -r requirements.txt && python app.py` |
| [newsletter-digest/](newsletter-digest/) | Automated daily digest that pulls newsletters from Gmail, summarizes them with Claude, and emails a clean digest. | `cd newsletter-digest && python main.py` (needs Gmail credentials) |
| [focus-timer/](focus-timer/) | A self-contained single-page focus/Pomodoro timer. | `open focus-timer/index.html` |
| [trade-route-tycoon/](trade-route-tycoon/) | *Aegean Trader* — a Greek/Roman ship-trading **and** city-building game (Phaser 3): a real WebGL ocean, dynamic economy, isometric cities, sieges, diplomacy & research, rival factions, save/load, and an optional Oracle (Claude) advisor. | `open trade-route-tycoon/index.html` |
| [simrefinery/](simrefinery/) | A web-based oil-refinery management sim (a replica of Maxis's lost *SimRefinery*): balance crude input, refining speed, safety, and environmental compliance against random disasters and a daily P&L. | `open simrefinery/index.html` |
| [workout-tracker/](workout-tracker/) | Tiny CLI workout logger + stats analyzer over a shared CSV. | `cd workout-tracker && python workout_tracker.py` |

## Layout & conventions

- Each project is a top-level folder; there are no loose source files at the repo root.
- Secrets (`.env`, `credentials.json`, `token.json`) and virtual environments (`.venv/`) are git-ignored and stay local — never committed.
- Most projects use Claude via the Anthropic API and expect their own `.env` (see each project's `.env.example` where present).
