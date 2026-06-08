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
from agents.synthesizer import generate_brief, SynthesizerError
from agents.embedder import embed_signal, search_signals, EmbedderError
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
    """Trigger signal collection, analysis, embedding, and brief generation."""
    try:
        news_category = request.json.get('category', 'general') if request.json else 'general'

        logger.info(f"Starting collection with category: {news_category}")

        # Step 1: Collect signals
        signals = collect_all_signals(news_category=news_category)
        logger.info(f"Collected {len(signals)} signals")

        if not signals:
            return jsonify({'error': 'No signals collected'}), 400

        # Step 2: Analyze each signal, embed, and track for brief
        analyzed_count = 0
        analyzed_signals = []
        signal_ids_for_brief = []

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

                # Step 3: Embed signal into ChromaDB
                signal_with_analysis = {**signal, **analysis}
                try:
                    embed_signal(signal_id, signal_with_analysis)
                except EmbedderError as e:
                    logger.warning(f"Embedding failed for signal {signal_id}: {e}")

                analyzed_count += 1
                analyzed_signals.append(signal_with_analysis)
                signal_ids_for_brief.append(signal_id)

            except ClaudeAnalysisError as e:
                logger.error(f"Analysis failed for signal '{signal.get('title')}': {e}")
                continue
            except DatabaseError as e:
                logger.error(f"Database error: {e}")
                continue

        # Step 4: Generate daily brief from top signals
        try:
            if analyzed_signals:
                sorted_signals = sorted(
                    analyzed_signals,
                    key=lambda x: x.get('significance_score', 0),
                    reverse=True
                )
                brief_content = generate_brief(sorted_signals, max_signals=5)
                from src.database import save_brief
                save_brief(brief_content, signal_ids_for_brief)
                logger.info(f"Generated brief from {len(signal_ids_for_brief)} signals")
        except (SynthesizerError, DatabaseError) as e:
            logger.warning(f"Brief generation failed: {e}")

        return jsonify({
            'success': True,
            'message': f'Collected, analyzed, and embedded {analyzed_count} new signals',
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

@app.route('/api/search')
def api_search():
    """Semantic search across signals."""
    try:
        query = request.args.get('q', '')
        limit = int(request.args.get('limit', 20))

        if not query:
            return jsonify({'error': 'Query required'}), 400

        # Semantic search in ChromaDB
        search_results = search_signals(query, num_results=limit)

        if not search_results:
            return jsonify([])

        # Fetch full signal data from database
        result = []
        for search_result in search_results:
            signal_id = search_result['id']
            signal = get_all_signals(limit=1)
            for s in signal:
                if s['id'] == signal_id:
                    result.append({
                        'id': s['id'],
                        'title': s['title'],
                        'content': s['content'],
                        'source_type': s['source_type'],
                        'threat_level': s['threat_level'],
                        'significance_score': s['significance_score'],
                        'summary': s['summary'],
                        'fetched_at': s['fetched_at'],
                        'similarity': search_result['similarity']
                    })

        return jsonify(result)

    except Exception as e:
        logger.error(f"Search error: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/market-data')
def api_market_data():
    """Get current market data for tracked tickers."""
    try:
        from src.market import fetch_market_data

        tickers = ['SPY', 'QQQ', 'BTC-USD', 'XLV', 'XLK', 'XLF', 'XLE']
        market_data = fetch_market_data(tickers)

        return jsonify(market_data)
    except Exception as e:
        # Degrade gracefully: return an empty list so the page shows a
        # friendly "no data" message instead of a hard error.
        logger.error(f"Market data error: {e}")
        return jsonify([])

@app.errorhandler(404)
def not_found(error):
    return render_template('error.html', error='Page not found'), 404

@app.errorhandler(500)
def server_error(error):
    return render_template('error.html', error='Server error'), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)
