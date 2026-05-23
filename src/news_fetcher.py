import os
import requests
from dotenv import load_dotenv
import logging
from src.news_analyzer import analyze_article, format_analysis, ClaudeAnalysisError
from src.database import init_db, article_exists, save_article, save_analysis, DatabaseError

load_dotenv()

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class NewsAPIError(Exception):
    pass

def fetch_news(category=None, language=None, page_size=None):
    api_key = os.getenv("NEWSAPI_KEY")
    if not api_key:
        raise NewsAPIError("NEWSAPI_KEY not found in environment variables. Check your .env file.")

    category = category or os.getenv("NEWS_CATEGORY", "business")
    language = language or os.getenv("NEWS_LANGUAGE", "en")
    page_size = page_size or int(os.getenv("PAGE_SIZE", 5))

    url = "https://newsapi.org/v2/top-headlines"
    params = {
        "category": category,
        "language": language,
        "pageSize": page_size,
        "apiKey": api_key
    }

    try:
        logger.info(f"Fetching news: category={category}, language={language}, page_size={page_size}")
        response = requests.get(url, params=params, timeout=10)
        response.raise_for_status()

        data = response.json()

        if "articles" not in data:
            raise NewsAPIError(f"Unexpected API response: {data}")

        logger.info(f"Successfully fetched {len(data['articles'])} articles")
        return data["articles"]

    except requests.exceptions.Timeout:
        raise NewsAPIError("Request timed out. The API server is not responding.")
    except requests.exceptions.ConnectionError:
        raise NewsAPIError("Connection error. Check your internet connection.")
    except requests.exceptions.HTTPError as e:
        if response.status_code == 401:
            raise NewsAPIError("Invalid API key. Check your NEWSAPI_KEY in .env")
        elif response.status_code == 429:
            raise NewsAPIError("Rate limit exceeded. Please wait before making another request.")
        else:
            raise NewsAPIError(f"HTTP error {response.status_code}: {e}")
    except requests.exceptions.RequestException as e:
        raise NewsAPIError(f"Request failed: {e}")

def analyze_and_display_articles(articles, use_claude=True, save_to_db=True):
    if not articles:
        print("No articles found.")
        return

    if save_to_db:
        try:
            init_db()
        except DatabaseError as e:
            logger.error(f"Database initialization failed: {e}")
            save_to_db = False

    skipped_count = 0
    for i, article in enumerate(articles, 1):
        print(f"\n{'#'*70}")
        print(f"Article {i} of {len(articles)}")
        print(f"{'#'*70}")

        if save_to_db and article_exists(article.get('url')):
            print(f"[{i}] {article['title']} (already in database)")
            skipped_count += 1
            continue

        if use_claude:
            try:
                analysis = analyze_article(article)
                print(format_analysis(article, analysis))

                if save_to_db:
                    try:
                        article_id = save_article(article)
                        save_analysis(article_id, analysis)
                        print(f"\n✅ Saved to database (ID: {article_id})")
                    except DatabaseError as e:
                        logger.error(f"Failed to save to database: {e}")
            except ClaudeAnalysisError as e:
                logger.error(f"Failed to analyze article {i}: {e}")
                print(f"\n[{i}] {article['title']}")
                print(f"    URL: {article['url']}")
                print(f"    Source: {article['source']['name']}")
                print(f"    Published: {article['publishedAt']}")
                print("    " + "-" * 60)
        else:
            print(f"\n[{i}] {article['title']}")
            print(f"    URL: {article['url']}")
            print(f"    Source: {article['source']['name']}")
            print(f"    Published: {article['publishedAt']}")
            print("    " + "-" * 60)

            if save_to_db:
                try:
                    save_article(article)
                except DatabaseError as e:
                    logger.error(f"Failed to save article: {e}")

    if skipped_count > 0:
        print(f"\n⏭️  Skipped {skipped_count} article(s) already in database")

def print_articles(articles):
    """Deprecated: use analyze_and_display_articles instead."""
    analyze_and_display_articles(articles, use_claude=False)

if __name__ == "__main__":
    try:
        articles = fetch_news()
        print("\n🤖 Fetching Claude AI analysis for each article...\n")
        analyze_and_display_articles(articles, use_claude=True)
    except NewsAPIError as e:
        logger.error(f"Error: {e}")
    except Exception as e:
        logger.error(f"Unexpected error: {e}")
