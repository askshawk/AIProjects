import yfinance as yf
import logging

logger = logging.getLogger(__name__)

DEFAULT_WATCHLIST = ['SPY', 'QQQ', 'BTC-USD', 'XLV', 'XLK', 'XLF', 'XLE']

# Static names so we never depend on the slow/flaky yfinance .info call
TICKER_NAMES = {
    'SPY': 'S&P 500 ETF',
    'QQQ': 'Nasdaq 100 ETF',
    'BTC-USD': 'Bitcoin',
    'XLV': 'Health Care Sector',
    'XLK': 'Technology Sector',
    'XLF': 'Financials Sector',
    'XLE': 'Energy Sector',
}

class MarketDataError(Exception):
    pass

def fetch_market_data(tickers=None):
    if tickers is None:
        tickers = DEFAULT_WATCHLIST

    results = []
    for ticker in tickers:
        try:
            data = yf.Ticker(ticker)
            # 5 days gives us enough bars to compute a real day-over-day change
            hist = data.history(period='5d')

            if hist.empty:
                logger.warning(f"No data for {ticker}")
                continue

            latest = hist.iloc[-1]
            # Use the previous trading day's close for the % change
            prev_close = hist.iloc[-2]['Close'] if len(hist) > 1 else latest['Open']
            change_pct = ((latest['Close'] - prev_close) / prev_close * 100) if prev_close else 0

            result = {
                'ticker': ticker,
                'company_name': TICKER_NAMES.get(ticker, ticker),
                'price': round(float(latest['Close']), 2),
                'change_pct': round(float(change_pct), 2),
                'volume': int(latest['Volume']) if 'Volume' in latest and latest['Volume'] == latest['Volume'] else 0
            }
            results.append(result)
        except Exception as e:
            logger.error(f"Error fetching data for {ticker}: {e}")
            continue

    if not results:
        raise MarketDataError("Failed to fetch market data for any ticker")

    return results
