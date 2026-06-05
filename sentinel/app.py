#!/usr/bin/env python
"""
Sentinel - Personal Intelligence & Market Dashboard
AI-powered signal collection, analysis, and visualization
"""

from flask import Flask, render_template, request, jsonify
from src.database import (
    init_db, DatabaseError, signal_exists, save_signal, save_signal_analysis,
    save_market_data, get_all_signals, get_signals_by_threat_level, get_latest_briefs
)
from agents.collector import collect_all_signals, CollectorError
from agents.analyzer import analyze_signal, ClaudeAnalysisError
import logging
import os

app = Flask(__name__)
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize database on startup
try:
    init_db()
    logger.info("Database initialized")
except DatabaseError as e:
    logger.error(f"Database initialization failed: {e}")

@app.route('/')
def feed():
    """Main feed page with all signals."""
    return render_template('feed.html')

@app.route('/markets')
def markets():
    """Markets dashboard with price charts."""
    return render_template('markets.html')

@app.route('/brief')
def brief():
    """AI-generated daily intelligence brief."""
    return render_template('brief.html')

@app.route('/search')
def search():
    """Semantic search across signals."""
    return render_template('search.html')

@app.route('/entities')
def entities():
    """Entity relationship network graph."""
    return render_template('entities.html')

@app.route('/api/signals')
def api_signals():
    """Get signals with optional filtering."""
    try:
        threat_level = request.args.get('threat_level')
        limit = int(request.args.get('limit', 50))

        if threat_level:
            signals = get_signals_by_threat_level(threat_level, limit=limit)
        else:
            signals = get_all_signals(limit=limit)

        # Convert to JSON-serializable format
        result = []
        for signal in signals:
            result.append({
                'id': signal['id'],
                'title': signal['title'],
                'content': signal['content'],
                'source_type': signal['source_type'],
                'threat_level': signal['threat_level'],
                'significance_score': signal['significance_score'],
                'summary': signal['summary'],
                'fetched_at': signal['fetched_at']
            })

        return jsonify(result)
    except DatabaseError as e:
        logger.error(f"Error fetching signals: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/collect', methods=['POST'])
def api_collect():
    """Trigger signal collection and analysis."""
    try:
        news_category = request.json.get('category', 'general') if request.json else 'general'

        logger.info(f"Starting collection with category: {news_category}")

        # Step 1: Collect signals
        signals = collect_all_signals(news_category=news_category)
        logger.info(f"Collected {len(signals)} signals")

        if not signals:
            return jsonify({'error': 'No signals collected'}), 400

        # Step 2: Analyze each signal
        analyzed_count = 0
        for signal in signals:
            try:
                # Skip duplicates
                if signal.get('url') and signal_exists(signal['url']):
                    logger.info(f"Signal already exists: {signal.get('url')}")
                    continue

                # Save signal
                signal_id = save_signal(signal)
                logger.info(f"Saved signal {signal_id}: {signal['title']}")

                # Analyze signal
                analysis = analyze_signal(signal)
                logger.info(f"Analyzed signal {signal_id}")

                # Save analysis
                save_signal_analysis(signal_id, analysis)
                analyzed_count += 1

            except ClaudeAnalysisError as e:
                logger.error(f"Analysis failed for signal '{signal.get('title')}': {e}")
                continue
            except DatabaseError as e:
                logger.error(f"Database error: {e}")
                continue

        return jsonify({
            'success': True,
            'message': f'Collected and analyzed {analyzed_count} new signals',
            'count': analyzed_count
        })

    except CollectorError as e:
        logger.error(f"Collection error: {e}")
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        logger.error(f"Unexpected error: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/briefs')
def api_briefs():
    """Get latest briefs."""
    try:
        limit = int(request.args.get('limit', 5))
        briefs = get_latest_briefs(limit=limit)

        result = []
        for brief in briefs:
            result.append({
                'id': brief['id'],
                'content': brief['content'],
                'generated_at': brief['generated_at']
            })

        return jsonify(result)
    except DatabaseError as e:
        logger.error(f"Error fetching briefs: {e}")
        return jsonify({'error': str(e)}), 500

@app.errorhandler(404)
def not_found(error):
    return render_template('error.html', error='Page not found'), 404

@app.errorhandler(500)
def server_error(error):
    return render_template('error.html', error='Server error'), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)
