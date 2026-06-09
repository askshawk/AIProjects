#!/usr/bin/env python
"""
News Analysis AI Agent - CLI Interface

Command-line tool to fetch news, analyze with Claude, and query the database.
"""

import argparse
import sys
import logging
from tabulate import tabulate

from src.news_fetcher import fetch_news, analyze_and_display_articles, NewsAPIError
from src.database import (
    get_all_articles, get_articles_by_relevance, get_high_significance_articles,
    search_articles, get_stats, DatabaseError, init_db
)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def format_article_table(articles):
    """Format articles for table display."""
    if not articles:
        return "No articles found."

    rows = []
    for article in articles:
        rows.append([
            article['title'][:50] + "..." if len(article['title']) > 50 else article['title'],
            article.get('geopolitical_relevance', 'N/A'),
            article.get('significance_score', 'N/A'),
            article.get('source', 'Unknown')[:20]
        ])

    return tabulate(rows, headers=['Title', 'Relevance', 'Score', 'Source'], tablefmt='grid')

def cmd_fetch(args):
    """Fetch and analyze new articles."""
    try:
        logger.info("Initializing database...")
        init_db()

        logger.info(f"Fetching news articles (category: {args.category}, language: {args.language})...")
        articles = fetch_news(category=args.category, language=args.language, page_size=args.count)

        logger.info(f"Fetched {len(articles)} articles. Analyzing with Claude...")
        analyze_and_display_articles(articles, use_claude=True, save_to_db=True)

        print("\n✅ Done! Articles saved to database.")
    except NewsAPIError as e:
        logger.error(f"NewsAPI error: {e}")
        sys.exit(1)
    except DatabaseError as e:
        logger.error(f"Database error: {e}")
        sys.exit(1)
    except Exception as e:
        logger.error(f"Unexpected error: {e}")
        sys.exit(1)

def cmd_list(args):
    """List all articles from database."""
    try:
        articles = get_all_articles(limit=args.limit)

        if not articles:
            print("No articles in database. Try: python main.py fetch")
            return

        print(f"\n📰 Latest {len(articles)} Articles:")
        print("=" * 100)
        print(format_article_table(articles))
        print(f"\nTotal: {len(articles)} articles")
    except DatabaseError as e:
        logger.error(f"Database error: {e}")
        sys.exit(1)

def cmd_high(args):
    """Show HIGH geopolitical relevance articles."""
    try:
        articles = get_articles_by_relevance("HIGH")

        if not articles:
            print("No HIGH relevance articles found.")
            return

        print(f"\n🔴 HIGH Geopolitical Relevance ({len(articles)} articles):")
        print("=" * 100)
        print(format_article_table(articles))
    except DatabaseError as e:
        logger.error(f"Database error: {e}")
        sys.exit(1)

def cmd_medium(args):
    """Show MEDIUM geopolitical relevance articles."""
    try:
        articles = get_articles_by_relevance("MEDIUM")

        if not articles:
            print("No MEDIUM relevance articles found.")
            return

        print(f"\n🟡 MEDIUM Geopolitical Relevance ({len(articles)} articles):")
        print("=" * 100)
        print(format_article_table(articles))
    except DatabaseError as e:
        logger.error(f"Database error: {e}")
        sys.exit(1)

def cmd_low(args):
    """Show LOW geopolitical relevance articles."""
    try:
        articles = get_articles_by_relevance("LOW")

        if not articles:
            print("No LOW relevance articles found.")
            return

        print(f"\n🟢 LOW Geopolitical Relevance ({len(articles)} articles):")
        print("=" * 100)
        print(format_article_table(articles))
    except DatabaseError as e:
        logger.error(f"Database error: {e}")
        sys.exit(1)

def cmd_significant(args):
    """Show high significance articles (score 7+)."""
    try:
        articles = get_high_significance_articles(min_score=args.min_score)

        if not articles:
            print(f"No articles with significance score >= {args.min_score} found.")
            return

        print(f"\n⭐ High Significance Articles (Score >= {args.min_score}) ({len(articles)} articles):")
        print("=" * 100)
        print(format_article_table(articles))
    except DatabaseError as e:
        logger.error(f"Database error: {e}")
        sys.exit(1)

def cmd_search(args):
    """Search articles by keyword."""
    try:
        articles = search_articles(args.keyword)

        if not articles:
            print(f"No articles found matching '{args.keyword}'.")
            return

        print(f"\n🔍 Search Results for '{args.keyword}' ({len(articles)} articles):")
        print("=" * 100)
        print(format_article_table(articles))
    except DatabaseError as e:
        logger.error(f"Database error: {e}")
        sys.exit(1)

def cmd_stats(args):
    """Display database statistics."""
    try:
        stats = get_stats()

        print("\n📊 DATABASE STATISTICS")
        print("=" * 50)
        print(f"Total articles: {stats['total_articles']}")
        print(f"Analyzed articles: {stats['analyzed_articles']}")
        print(f"Average significance score: {stats['avg_significance_score']}/10")

        if stats['relevance_breakdown']:
            print(f"\nGeopolitical Relevance Breakdown:")
            for relevance, count in sorted(stats['relevance_breakdown'].items()):
                emoji = "🔴" if relevance == "HIGH" else "🟡" if relevance == "MEDIUM" else "🟢"
                print(f"  {emoji} {relevance}: {count} articles")
        else:
            print("\nNo analyzed articles yet. Try: python main.py fetch")
    except DatabaseError as e:
        logger.error(f"Database error: {e}")
        sys.exit(1)

def main():
    parser = argparse.ArgumentParser(
        description="News Analysis AI Agent - Fetch, analyze, and query geopolitical news",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python main.py fetch                    # Fetch and analyze new articles
  python main.py fetch --count 10         # Fetch 10 articles instead of default
  python main.py fetch --category technology  # Fetch from different category
  python main.py list                     # Show all articles in database
  python main.py high                     # Show HIGH relevance articles
  python main.py medium                   # Show MEDIUM relevance articles
  python main.py significant --min 8      # Show articles with score >= 8
  python main.py search "China"           # Search for keyword
  python main.py stats                    # Show database statistics

Categories: business, technology, health, science, sports, general
        """
    )

    subparsers = parser.add_subparsers(dest='command', help='Command to run')

    # fetch command
    fetch_parser = subparsers.add_parser('fetch', help='Fetch and analyze new articles')
    fetch_parser.add_argument('--count', type=int, default=5, help='Number of articles to fetch (default: 5)')
    fetch_parser.add_argument('--category', default='business', help='News category (default: business)')
    fetch_parser.add_argument('--language', default='en', help='Language code (default: en)')
    fetch_parser.set_defaults(func=cmd_fetch)

    # list command
    list_parser = subparsers.add_parser('list', help='List all articles from database')
    list_parser.add_argument('--limit', type=int, default=50, help='Maximum articles to show (default: 50)')
    list_parser.set_defaults(func=cmd_list)

    # high command
    high_parser = subparsers.add_parser('high', help='Show HIGH geopolitical relevance articles')
    high_parser.set_defaults(func=cmd_high)

    # medium command
    medium_parser = subparsers.add_parser('medium', help='Show MEDIUM geopolitical relevance articles')
    medium_parser.set_defaults(func=cmd_medium)

    # low command
    low_parser = subparsers.add_parser('low', help='Show LOW geopolitical relevance articles')
    low_parser.set_defaults(func=cmd_low)

    # significant command
    sig_parser = subparsers.add_parser('significant', help='Show high significance articles')
    sig_parser.add_argument('--min', type=int, default=7, dest='min_score', help='Minimum significance score (default: 7)')
    sig_parser.set_defaults(func=cmd_significant)

    # search command
    search_parser = subparsers.add_parser('search', help='Search articles by keyword')
    search_parser.add_argument('keyword', help='Keyword to search for')
    search_parser.set_defaults(func=cmd_search)

    # stats command
    stats_parser = subparsers.add_parser('stats', help='Show database statistics')
    stats_parser.set_defaults(func=cmd_stats)

    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        sys.exit(0)

    args.func(args)

if __name__ == '__main__':
    main()
