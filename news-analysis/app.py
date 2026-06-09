#!/usr/bin/env python
"""
News Analysis AI Agent - Web Dashboard
Flask web application for viewing and managing articles.
"""

from flask import Flask, render_template, request, jsonify, send_file
from src.database import (
    get_all_articles, get_articles_by_relevance, search_articles,
    get_stats, get_high_significance_articles, init_db, DatabaseError
)
from src.news_fetcher import fetch_news, analyze_and_display_articles, NewsAPIError
import json
import csv
import io
import logging

app = Flask(__name__)
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize database on startup
try:
    init_db()
except DatabaseError as e:
    logger.error(f"Database initialization failed: {e}")

@app.route('/')
def dashboard():
    """Home page with statistics and charts."""
    try:
        stats = get_stats()
        return render_template('dashboard.html', stats=stats)
    except DatabaseError as e:
        logger.error(f"Error loading dashboard: {e}")
        return render_template('error.html', error=str(e)), 500

@app.route('/articles')
def articles():
    """Articles page with filtering."""
    return render_template('articles.html')

@app.route('/fetch')
def fetch_page():
    """Fetch articles page."""
    return render_template('fetch.html')

@app.route('/focus')
def focus():
    """Focus/Pomodoro timer page."""
    return render_template('focus.html')

@app.route('/api/articles')
def api_articles():
    """API endpoint to get articles with filtering."""
    try:
        relevance = request.args.get('relevance', '').upper()
        search_term = request.args.get('search', '')
        sort_by = request.args.get('sort', 'fetched')
        limit = int(request.args.get('limit', 50))

        if search_term:
            articles = search_articles(search_term)
        elif relevance:
            articles = get_articles_by_relevance(relevance)
        else:
            articles = get_all_articles(limit=limit)

        # Sort articles
        if sort_by == 'significance':
            articles = sorted(articles, key=lambda x: x.get('significance_score', 0), reverse=True)
        elif sort_by == 'fetched':
            articles = sorted(articles, key=lambda x: x.get('fetched_at', ''), reverse=True)

        # Convert to JSON-serializable format
        result = []
        for article in articles:
            result.append({
                'id': article.get('id'),
                'title': article.get('title'),
                'source': article.get('source'),
                'url': article.get('url'),
                'geopolitical_relevance': article.get('geopolitical_relevance'),
                'significance_score': article.get('significance_score'),
                'summary': article.get('summary'),
                'fetched_at': article.get('fetched_at')
            })

        return jsonify(result)
    except DatabaseError as e:
        logger.error(f"Error fetching articles: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/stats')
def api_stats():
    """API endpoint for statistics."""
    try:
        stats = get_stats()
        return jsonify(stats)
    except DatabaseError as e:
        logger.error(f"Error fetching stats: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/fetch', methods=['POST'])
def api_fetch():
    """API endpoint to fetch and analyze new articles."""
    try:
        data = request.json
        category = data.get('category', 'business')
        language = data.get('language', 'en')
        count = int(data.get('count', 5))

        logger.info(f"Fetching {count} articles from category: {category}")
        articles = fetch_news(category=category, language=language, page_size=count)

        # Analyze and save articles
        analyze_and_display_articles(articles, use_claude=True, save_to_db=True)

        return jsonify({
            'success': True,
            'message': f'Successfully fetched and analyzed {len(articles)} articles',
            'count': len(articles)
        })
    except NewsAPIError as e:
        logger.error(f"NewsAPI error: {e}")
        return jsonify({'error': str(e)}), 400
    except DatabaseError as e:
        logger.error(f"Database error: {e}")
        return jsonify({'error': str(e)}), 500
    except Exception as e:
        logger.error(f"Unexpected error: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/export')
def api_export():
    """API endpoint to export articles as CSV."""
    try:
        relevance = request.args.get('relevance', '').upper()

        if relevance:
            articles = get_articles_by_relevance(relevance)
        else:
            articles = get_all_articles(limit=1000)

        # Create CSV in memory
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(['Title', 'Source', 'URL', 'Geopolitical Relevance', 'Significance Score', 'Summary', 'Fetched Date'])

        for article in articles:
            writer.writerow([
                article.get('title', ''),
                article.get('source', ''),
                article.get('url', ''),
                article.get('geopolitical_relevance', ''),
                article.get('significance_score', ''),
                article.get('summary', '')[:100],  # Truncate summary
                article.get('fetched_at', '')
            ])

        # Convert to bytes and send
        output.seek(0)
        return send_file(
            io.BytesIO(output.getvalue().encode()),
            mimetype='text/csv',
            as_attachment=True,
            download_name='articles.csv'
        )
    except DatabaseError as e:
        logger.error(f"Error exporting articles: {e}")
        return jsonify({'error': str(e)}), 500

@app.errorhandler(404)
def not_found(error):
    return render_template('error.html', error='Page not found'), 404

@app.errorhandler(500)
def server_error(error):
    return render_template('error.html', error='Server error'), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)
