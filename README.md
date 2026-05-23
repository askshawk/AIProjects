# News Analysis AI Agent

A Python-based tool that fetches news articles from NewsAPI and analyzes them using Claude AI to identify geopolitically significant stories, extract key entities, and provide insights.

## Project Status

This is a work-in-progress project with multiple phases:
- ✅ **Phase 1:** Code refactoring & setup (current)
- ⏳ **Phase 2:** Claude AI integration
- ⏳ **Phase 3:** Database & persistence
- ⏳ **Phase 4:** CLI interface & querying

## Phase 1: News Fetcher Setup

### What It Does

The `news_fetcher.py` module fetches top news headlines from [NewsAPI](https://newsapi.org/) with the following features:

- Fetches news articles by category, language, and page size
- Proper error handling for network issues, API errors, and invalid credentials
- Environment-based configuration (no hardcoded values)
- Logging for debugging and monitoring
- Clean, formatted output of articles with metadata

### Quick Start

#### 1. Clone or Navigate to the Repository

```bash
cd /home/user/AIProjects
```

#### 2. Install Dependencies

```bash
pip install -r requirements.txt
```

This installs:
- `requests` - for making HTTP requests to NewsAPI
- `python-dotenv` - for loading environment variables from `.env`

#### 3. Get a NewsAPI Key

If you don't have one already:
1. Go to [https://newsapi.org/](https://newsapi.org/)
2. Sign up for a free account
3. Copy your API key

#### 4. Set Up Environment Variables

The `.env` file contains your API key and configuration:

```
NEWSAPI_KEY=your_api_key_here
NEWS_CATEGORY=business
NEWS_LANGUAGE=en
PAGE_SIZE=5
```

Update `NEWSAPI_KEY` with your actual key. Other variables are optional and have defaults.

#### 5. Run the Script

```bash
python -m src.news_fetcher
```

You should see formatted output of the latest news articles.

### Configuration Options

Edit `.env` to customize:

- **NEWSAPI_KEY** - Your NewsAPI authentication key (required)
- **NEWS_CATEGORY** - News category: `business`, `technology`, `health`, `science`, `sports`, `general` (default: `business`)
- **NEWS_LANGUAGE** - Language code: `en`, `es`, `fr`, etc. (default: `en`)
- **PAGE_SIZE** - Number of articles to fetch: 1-100 (default: 5)

### Code Structure

```
AIProjects/
├── src/
│   ├── __init__.py           # Makes src a Python package
│   ├── news_fetcher.py       # NewsAPI integration
│   ├── news_analyzer.py      # (Phase 2) Claude API integration
│   └── database.py           # (Phase 3) SQLite persistence
├── main.py                   # (Phase 4) CLI entry point
├── .env                      # Configuration (not committed)
├── .gitignore               # Files to exclude from git
├── requirements.txt         # Python dependencies
└── README.md                # This file
```

### Key Concepts Learned in Phase 1

- **Environment Variables:** Why hardcoding secrets is dangerous; using `.env` for configuration
- **Error Handling:** Graceful handling of network failures, API errors, and invalid input
- **Logging:** Tracking what your program does for debugging and monitoring
- **Project Structure:** Organizing code professionally with packages and modules
- **Git Best Practices:** Using `.gitignore` to protect sensitive files

### Error Handling

The script handles common errors gracefully:

| Error | Cause | Solution |
|-------|-------|----------|
| "NEWSAPI_KEY not found" | Missing API key in `.env` | Add your key to `.env` |
| "Invalid API key" | Wrong or expired key | Verify key at newsapi.org |
| "Rate limit exceeded" | Too many requests | Wait before making more requests |
| "Connection error" | No internet or API down | Check connection and try again |
| "Request timed out" | Server too slow | Try again in a moment |

### Development Notes

This is Phase 1 of a larger project. The refactored code provides:

- ✅ Secure API key management
- ✅ Robust error handling
- ✅ Clean, reusable functions
- ✅ Logging for debugging
- ✅ Environment-based configuration

In Phase 2, we'll add Claude API integration to intelligently analyze articles. The current structure is designed to support this expansion easily.

### Running Tests (Future)

Once testing is set up:

```bash
pytest tests/
```

For now, you can manually test by running the script with different categories:

```python
from src.news_fetcher import fetch_news

# Fetch technology news instead
articles = fetch_news(category="technology", page_size=10)
```

### Next Steps (Phase 2)

Phase 2 will add Claude AI to:
- Summarize articles
- Identify geopolitically significant stories
- Extract key entities (countries, organizations, people)
- Analyze sentiment and tone

Stay tuned!

## Resources

- [NewsAPI Documentation](https://newsapi.org/docs)
- [Requests Library](https://docs.python-requests.org/)
- [Python dotenv](https://github.com/theskumar/python-dotenv)
- [Python Logging](https://docs.python.org/3/library/logging.html)

## License

Personal learning project.
