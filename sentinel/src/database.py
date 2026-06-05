import sqlite3
import json
import os
from datetime import datetime

DB_PATH = os.getenv('DB_PATH', 'data/sentinel.db')

class DatabaseError(Exception):
    pass

def get_connection():
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        return conn
    except sqlite3.Error as e:
        raise DatabaseError(f"Database connection failed: {e}")

def init_db():
    os.makedirs(os.path.dirname(DB_PATH) or '.', exist_ok=True)
    conn = get_connection()
    cursor = conn.cursor()

    try:
        # Signals table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS signals (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                source_type TEXT NOT NULL,
                title TEXT NOT NULL,
                content TEXT,
                url TEXT UNIQUE,
                published_at TEXT,
                fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')

        # Signal analysis table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS signal_analysis (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                signal_id INTEGER UNIQUE NOT NULL,
                threat_level TEXT,
                entities TEXT,
                domains TEXT,
                sentiment TEXT,
                significance_score INTEGER,
                summary TEXT,
                analyzed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (signal_id) REFERENCES signals(id)
            )
        ''')

        # Market data table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS market_data (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ticker TEXT NOT NULL,
                company_name TEXT,
                price REAL,
                change_pct REAL,
                volume INTEGER,
                fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')

        # Entities table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS entities (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT UNIQUE NOT NULL,
                entity_type TEXT,
                mention_count INTEGER DEFAULT 1
            )
        ''')

        # Entity-signal junction table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS entity_signals (
                entity_id INTEGER NOT NULL,
                signal_id INTEGER NOT NULL,
                PRIMARY KEY (entity_id, signal_id),
                FOREIGN KEY (entity_id) REFERENCES entities(id),
                FOREIGN KEY (signal_id) REFERENCES signals(id)
            )
        ''')

        # Briefs table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS briefs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                content TEXT NOT NULL,
                signal_ids_used TEXT,
                generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')

        conn.commit()
    except sqlite3.Error as e:
        conn.rollback()
        raise DatabaseError(f"Database initialization failed: {e}")
    finally:
        conn.close()

def signal_exists(url):
    if not url:
        return False
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute('SELECT id FROM signals WHERE url = ?', (url,))
        result = cursor.fetchone()
        conn.close()
        return result is not None
    except sqlite3.Error as e:
        raise DatabaseError(f"Error checking signal: {e}")

def save_signal(signal_dict):
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO signals (source_type, title, content, url, published_at)
            VALUES (?, ?, ?, ?, ?)
        ''', (
            signal_dict.get('source_type'),
            signal_dict.get('title'),
            signal_dict.get('content'),
            signal_dict.get('url'),
            signal_dict.get('published_at')
        ))
        conn.commit()
        signal_id = cursor.lastrowid
        conn.close()
        return signal_id
    except sqlite3.Error as e:
        raise DatabaseError(f"Error saving signal: {e}")

def save_signal_analysis(signal_id, analysis_dict):
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO signal_analysis (signal_id, threat_level, entities, domains, sentiment, significance_score, summary)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ''', (
            signal_id,
            analysis_dict.get('threat_level'),
            json.dumps(analysis_dict.get('entities', [])),
            json.dumps(analysis_dict.get('domains', [])),
            analysis_dict.get('sentiment'),
            analysis_dict.get('significance_score'),
            analysis_dict.get('summary')
        ))
        conn.commit()
        conn.close()
    except sqlite3.Error as e:
        raise DatabaseError(f"Error saving analysis: {e}")

def save_market_data(ticker, data_dict):
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO market_data (ticker, company_name, price, change_pct, volume)
            VALUES (?, ?, ?, ?, ?)
        ''', (
            ticker,
            data_dict.get('company_name'),
            data_dict.get('price'),
            data_dict.get('change_pct'),
            data_dict.get('volume')
        ))
        conn.commit()
        conn.close()
    except sqlite3.Error as e:
        raise DatabaseError(f"Error saving market data: {e}")

def get_latest_market_data(limit=10):
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute('''
            SELECT DISTINCT ON (ticker) * FROM market_data
            ORDER BY ticker, fetched_at DESC
            LIMIT ?
        ''', (limit,))
        results = cursor.fetchall()
        conn.close()
        return [dict(row) for row in results]
    except sqlite3.Error as e:
        raise DatabaseError(f"Error fetching market data: {e}")

def get_signals_by_threat_level(threat_level, limit=20):
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute('''
            SELECT s.*, sa.threat_level, sa.significance_score, sa.summary
            FROM signals s
            LEFT JOIN signal_analysis sa ON s.id = sa.signal_id
            WHERE sa.threat_level = ?
            ORDER BY s.fetched_at DESC
            LIMIT ?
        ''', (threat_level, limit))
        results = cursor.fetchall()
        conn.close()
        return [dict(row) for row in results]
    except sqlite3.Error as e:
        raise DatabaseError(f"Error fetching signals: {e}")

def get_all_signals(limit=50):
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute('''
            SELECT s.*, sa.threat_level, sa.significance_score, sa.summary
            FROM signals s
            LEFT JOIN signal_analysis sa ON s.id = sa.signal_id
            ORDER BY s.fetched_at DESC
            LIMIT ?
        ''', (limit,))
        results = cursor.fetchall()
        conn.close()
        return [dict(row) for row in results]
    except sqlite3.Error as e:
        raise DatabaseError(f"Error fetching signals: {e}")

def save_brief(content, signal_ids):
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO briefs (content, signal_ids_used)
            VALUES (?, ?)
        ''', (content, json.dumps(signal_ids)))
        conn.commit()
        brief_id = cursor.lastrowid
        conn.close()
        return brief_id
    except sqlite3.Error as e:
        raise DatabaseError(f"Error saving brief: {e}")

def get_latest_briefs(limit=5):
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM briefs ORDER BY generated_at DESC LIMIT ?', (limit,))
        results = cursor.fetchall()
        conn.close()
        return [dict(row) for row in results]
    except sqlite3.Error as e:
        raise DatabaseError(f"Error fetching briefs: {e}")
