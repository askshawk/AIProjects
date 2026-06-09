import sqlite3
import json
import logging
from datetime import datetime
from pathlib import Path

logger = logging.getLogger(__name__)

DB_PATH = Path(__file__).parent.parent / "data" / "news.db"

class DatabaseError(Exception):
    pass

def init_db():
    """Create database and tables if they don't exist."""
    DB_PATH.parent.mkdir(exist_ok=True)

    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()

        # Articles table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS articles (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                url TEXT UNIQUE NOT NULL,
                title TEXT NOT NULL,
                source TEXT NOT NULL,
                description TEXT,
                content TEXT,
                published_date TEXT,
                fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')

        # Analysis table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS analysis (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                article_id INTEGER NOT NULL UNIQUE,
                summary TEXT,
                geopolitical_relevance TEXT,
                relevance_reason TEXT,
                key_entities TEXT,
                related_domains TEXT,
                sentiment TEXT,
                significance_score INTEGER,
                insights TEXT,
                analyzed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (article_id) REFERENCES articles(id)
            )
        ''')

        conn.commit()
        logger.info(f"Database initialized at {DB_PATH}")
        return conn
    except sqlite3.Error as e:
        raise DatabaseError(f"Failed to initialize database: {e}")

def get_connection():
    """Get database connection."""
    if not DB_PATH.exists():
        return init_db()
    return sqlite3.connect(DB_PATH)

def article_exists(url):
    """Check if article already exists in database."""
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute('SELECT id FROM articles WHERE url = ?', (url,))
        result = cursor.fetchone()
        conn.close()
        return result is not None
    except sqlite3.Error as e:
        raise DatabaseError(f"Error checking article existence: {e}")

def save_article(article_dict):
    """Save article to database. Returns article_id."""
    try:
        conn = get_connection()
        cursor = conn.cursor()

        cursor.execute('''
            INSERT INTO articles (url, title, source, description, content, published_date)
            VALUES (?, ?, ?, ?, ?, ?)
        ''', (
            article_dict.get('url'),
            article_dict.get('title'),
            article_dict.get('source', {}).get('name', 'Unknown'),
            article_dict.get('description'),
            article_dict.get('content'),
            article_dict.get('publishedAt')
        ))

        article_id = cursor.lastrowid
        conn.commit()
        conn.close()

        logger.info(f"Saved article {article_id}: {article_dict.get('title', 'Unknown')[:50]}")
        return article_id
    except sqlite3.IntegrityError:
        logger.warning(f"Article already exists: {article_dict.get('url')}")
        return get_article_id_by_url(article_dict.get('url'))
    except sqlite3.Error as e:
        raise DatabaseError(f"Error saving article: {e}")

def get_article_id_by_url(url):
    """Get article ID by URL."""
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute('SELECT id FROM articles WHERE url = ?', (url,))
        result = cursor.fetchone()
        conn.close()
        return result[0] if result else None
    except sqlite3.Error as e:
        raise DatabaseError(f"Error getting article ID: {e}")

def save_analysis(article_id, analysis_dict):
    """Save analysis to database."""
    try:
        conn = get_connection()
        cursor = conn.cursor()

        cursor.execute('''
            INSERT OR REPLACE INTO analysis
            (article_id, summary, geopolitical_relevance, relevance_reason,
             key_entities, related_domains, sentiment, significance_score, insights)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            article_id,
            analysis_dict.get('summary'),
            analysis_dict.get('geopolitical_relevance'),
            analysis_dict.get('relevance_reason'),
            json.dumps(analysis_dict.get('key_entities', [])),
            json.dumps(analysis_dict.get('related_domains', [])),
            analysis_dict.get('sentiment'),
            analysis_dict.get('significance_score'),
            analysis_dict.get('insights')
        ))

        conn.commit()
        conn.close()
        logger.info(f"Saved analysis for article {article_id}")
    except sqlite3.Error as e:
        raise DatabaseError(f"Error saving analysis: {e}")

def get_article_with_analysis(article_id):
    """Get article and its analysis."""
    try:
        conn = get_connection()
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        cursor.execute('''
            SELECT a.*, an.summary, an.geopolitical_relevance, an.relevance_reason,
                   an.key_entities, an.related_domains, an.sentiment,
                   an.significance_score, an.insights, an.analyzed_at
            FROM articles a
            LEFT JOIN analysis an ON a.id = an.article_id
            WHERE a.id = ?
        ''', (article_id,))

        result = cursor.fetchone()
        conn.close()

        if result:
            row_dict = dict(result)
            # Parse JSON fields
            if row_dict.get('key_entities'):
                row_dict['key_entities'] = json.loads(row_dict['key_entities'])
            if row_dict.get('related_domains'):
                row_dict['related_domains'] = json.loads(row_dict['related_domains'])
            return row_dict
        return None
    except sqlite3.Error as e:
        raise DatabaseError(f"Error retrieving article: {e}")

def get_articles_by_relevance(relevance_level):
    """Get articles by geopolitical relevance level (HIGH, MEDIUM, LOW)."""
    try:
        conn = get_connection()
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        cursor.execute('''
            SELECT a.*, an.geopolitical_relevance, an.significance_score, an.summary
            FROM articles a
            LEFT JOIN analysis an ON a.id = an.article_id
            WHERE an.geopolitical_relevance = ?
            ORDER BY a.fetched_at DESC
        ''', (relevance_level.upper(),))

        results = cursor.fetchall()
        conn.close()
        return [dict(row) for row in results]
    except sqlite3.Error as e:
        raise DatabaseError(f"Error querying articles: {e}")

def get_high_significance_articles(min_score=7):
    """Get articles with high significance score."""
    try:
        conn = get_connection()
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        cursor.execute('''
            SELECT a.*, an.significance_score, an.summary, an.geopolitical_relevance
            FROM articles a
            LEFT JOIN analysis an ON a.id = an.article_id
            WHERE an.significance_score >= ?
            ORDER BY an.significance_score DESC, a.fetched_at DESC
        ''', (min_score,))

        results = cursor.fetchall()
        conn.close()
        return [dict(row) for row in results]
    except sqlite3.Error as e:
        raise DatabaseError(f"Error querying articles: {e}")

def search_articles(keyword):
    """Search articles by title or summary."""
    try:
        conn = get_connection()
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        search_term = f"%{keyword}%"
        cursor.execute('''
            SELECT a.*, an.summary, an.geopolitical_relevance, an.significance_score
            FROM articles a
            LEFT JOIN analysis an ON a.id = an.article_id
            WHERE a.title LIKE ? OR a.description LIKE ? OR an.summary LIKE ?
            ORDER BY a.fetched_at DESC
        ''', (search_term, search_term, search_term))

        results = cursor.fetchall()
        conn.close()
        return [dict(row) for row in results]
    except sqlite3.Error as e:
        raise DatabaseError(f"Error searching articles: {e}")

def get_all_articles(limit=50):
    """Get all articles with analysis, most recent first."""
    try:
        conn = get_connection()
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        cursor.execute('''
            SELECT a.*, an.summary, an.geopolitical_relevance, an.significance_score
            FROM articles a
            LEFT JOIN analysis an ON a.id = an.article_id
            ORDER BY a.fetched_at DESC
            LIMIT ?
        ''', (limit,))

        results = cursor.fetchall()
        conn.close()
        return [dict(row) for row in results]
    except sqlite3.Error as e:
        raise DatabaseError(f"Error retrieving articles: {e}")

def get_stats():
    """Get database statistics."""
    try:
        conn = get_connection()
        cursor = conn.cursor()

        cursor.execute('SELECT COUNT(*) FROM articles')
        total_articles = cursor.fetchone()[0]

        cursor.execute('SELECT COUNT(*) FROM analysis')
        analyzed_articles = cursor.fetchone()[0]

        cursor.execute('''
            SELECT geopolitical_relevance, COUNT(*)
            FROM analysis
            WHERE geopolitical_relevance IS NOT NULL
            GROUP BY geopolitical_relevance
        ''')
        relevance_counts = dict(cursor.fetchall())

        cursor.execute('''
            SELECT AVG(significance_score)
            FROM analysis
            WHERE significance_score IS NOT NULL
        ''')
        avg_significance = cursor.fetchone()[0]

        conn.close()

        return {
            'total_articles': total_articles,
            'analyzed_articles': analyzed_articles,
            'relevance_breakdown': relevance_counts,
            'avg_significance_score': round(avg_significance, 2) if avg_significance else 0
        }
    except sqlite3.Error as e:
        raise DatabaseError(f"Error getting stats: {e}")

if __name__ == "__main__":
    init_db()
    print("Database initialized successfully!")
