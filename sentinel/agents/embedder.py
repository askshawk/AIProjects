"""
Embedder agent: Stores signal embeddings in vector database for semantic search.
Uses ChromaDB for efficient semantic similarity queries.
"""
import logging
import os

logger = logging.getLogger(__name__)

class EmbedderError(Exception):
    pass

def init_chromadb():
    """Initialize ChromaDB client and signals collection."""
    try:
        import chromadb
        client = chromadb.Client()
        collection = client.get_or_create_collection(
            name="signals",
            metadata={"hnsw:space": "cosine"}
        )
        return client, collection
    except ImportError:
        raise EmbedderError("ChromaDB not installed. Run: pip install chromadb")
    except Exception as e:
        raise EmbedderError(f"ChromaDB initialization failed: {e}")

def embed_signal(signal_id, signal_dict):
    """
    Embed a signal (news or market) into the vector database.
    Combines title + content for rich semantic representation.
    """
    try:
        client, collection = init_chromadb()

        title = signal_dict.get('title', '')
        content = signal_dict.get('content', '')
        source_type = signal_dict.get('source_type', 'news')
        threat_level = signal_dict.get('threat_level', 'unknown')
        significance = signal_dict.get('significance_score', 0)

        # Combine text fields for embedding
        combined_text = f"{title}. {content}"

        # Add to ChromaDB collection
        collection.add(
            ids=[str(signal_id)],
            documents=[combined_text],
            metadatas=[{
                "source_type": source_type,
                "threat_level": threat_level,
                "significance": significance,
                "title": title
            }]
        )

        logger.info(f"Embedded signal {signal_id}")
        return True

    except Exception as e:
        logger.error(f"Embedding failed for signal {signal_id}: {e}")
        return False

def search_signals(query, num_results=10):
    """
    Semantic search across all signals.
    Returns signals ranked by semantic similarity to query.
    """
    try:
        client, collection = init_chromadb()

        results = collection.query(
            query_texts=[query],
            n_results=num_results
        )

        # Format results
        signals = []
        if results['ids'] and len(results['ids']) > 0:
            for i, signal_id in enumerate(results['ids'][0]):
                distance = results['distances'][0][i] if 'distances' in results else 0
                metadata = results['metadatas'][0][i] if results['metadatas'] else {}

                signals.append({
                    'id': int(signal_id),
                    'similarity': 1 - distance,  # Convert distance to similarity
                    'source_type': metadata.get('source_type', 'unknown'),
                    'threat_level': metadata.get('threat_level', 'unknown'),
                    'significance': metadata.get('significance', 0),
                    'title': metadata.get('title', '')
                })

        return signals

    except Exception as e:
        logger.error(f"Search failed: {e}")
        return []
