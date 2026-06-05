import yfinance as yf
import logging

logger = logging.getLogger(__name__)

DEFAULT_WATCHLIST = ['SPY', 'QQQ', 'BTC-USD', 'XLV', 'XLK', 'XLF', 'XLE']

class MarketDataError(Exception):
    pass

def fetch_market_data(tickers=None):
    if tickers is None:
        tickers = DEFAULT_WATCHLIST

    results = []
    for ticker in tickers:
        try:
            data = yf.Ticker(ticker)
            hist = data.history(period='1d')

            if hist.empty:
                logger.warning(f"No data for {ticker}")
                continue

            latest = hist.iloc[-1]
            prev_close = hist.iloc[-2]['Close'] if len(hist) > 1 else latest['Close']
            change_pct = ((latest['Close'] - prev_close) / prev_close * 100) if prev_close != 0 else 0

            result = {
                'ticker': ticker,
                'company_name': data.info.get('longName', ticker),
                'price': round(latest['Close'], 2),
                'change_pct': round(change_pct, 2),
                'volume': int(latest['Volume']) if 'Volume' in latest else 0
            }
            results.append(result)
        except Exception as e:
            logger.error(f"Error fetching data for {ticker}: {e}")
            continue

    if not results:
        raise MarketDataError(f"Failed to fetch market data for any ticker")

    return results
