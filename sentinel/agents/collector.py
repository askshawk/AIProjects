import os
import requests
import logging
from datetime import datetime

logger = logging.getLogger(__name__)

class CollectorError(Exception):
    pass

def fetch_news(category='general', language='en', page_size=5):
    """Fetch news from NewsAPI."""
    api_key = os.getenv('NEWSAPI_KEY')
    if not api_key:
        raise CollectorError("NEWSAPI_KEY not set in environment")

    url = 'https://newsapi.org/v2/top-headlines'
    params = {
        'apiKey': api_key,
        'category': category,
        'language': language,
        'pageSize': page_size,
        'sortBy': 'publishedAt'
    }

    try:
        response = requests.get(url, params=params, timeout=10)
        response.raise_for_status()
        data = response.json()

        if data['status'] != 'ok':
            raise CollectorError(f"NewsAPI error: {data.get('message', 'Unknown error')}")

        articles = []
        for article in data.get('articles', []):
            articles.append({
                'url': article.get('url'),
                'title': article.get('title'),
                'content': article.get('description'),
                'source_type': 'news',
                'published_at': article.get('publishedAt'),
                'source': article.get('source', {}).get('name')
            })

        return articles
    except requests.RequestException as e:
        raise CollectorError(f"NewsAPI request failed: {e}")

def fetch_market_signals(tickers=None):
    """Fetch market data and convert to signals."""
    from src.market import fetch_market_data, MarketDataError

    if tickers is None:
        tickers = ['SPY', 'QQQ', 'BTC-USD', 'XLV', 'XLK', 'XLF', 'XLE']

    try:
        market_data = fetch_market_data(tickers)
        signals = []

        for data in market_data:
            # Only create signal if there's significant movement
            if abs(data['change_pct']) > 2:
                direction = "📈 up" if data['change_pct'] > 0 else "📉 down"
                signal = {
                    'title': f"{data['ticker']} {direction} {abs(data['change_pct']):.2f}%",
                    'content': f"Market signal: {data['company_name']} trading at ${data['price']} ({data['change_pct']:+.2f}%). Volume: {data['volume']:,}",
                    'source_type': 'market',
                    'published_at': datetime.now().isoformat(),
                    'url': f"market://{data['ticker']}"
                }
                signals.append(signal)

        return signals
    except Exception as e:
        logger.error(f"Market signal fetch failed: {e}")
        return []

def collect_all_signals(news_category='general', fetch_market=True):
    """Collect all signals (news + market)."""
    signals = []

    # Fetch news
    try:
        news_signals = fetch_news(category=news_category, page_size=5)
        signals.extend(news_signals)
        logger.info(f"Collected {len(news_signals)} news signals")
    except CollectorError as e:
        logger.error(f"News collection failed: {e}")

    # Fetch market
    if fetch_market:
        market_signals = fetch_market_signals()
        signals.extend(market_signals)
        logger.info(f"Collected {len(market_signals)} market signals")

    return signals
