import os
import json
import logging
from dotenv import load_dotenv
from anthropic import Anthropic

load_dotenv()

logger = logging.getLogger(__name__)

class ClaudeAnalysisError(Exception):
    pass

def get_claude_client():
    api_key = os.getenv("CLAUDE_API_KEY")
    if not api_key:
        raise ClaudeAnalysisError("CLAUDE_API_KEY not found in environment variables. Check your .env file.")
    return Anthropic(api_key=api_key)

def analyze_article(article):
    """
    Send an article to Claude for intelligent analysis.
    Returns structured analysis with summary, geopolitical relevance, entities, and sentiment.
    """
    title = article.get("title", "Unknown")
    description = article.get("description", "")
    content = article.get("content", "")
    source = article.get("source", {}).get("name", "Unknown")

    # Combine available text for analysis
    article_text = f"Title: {title}\n"
    if description:
        article_text += f"Description: {description}\n"
    if content:
        article_text += f"Content: {content}\n"

    system_prompt = """You are a geopolitical and OSINT analyst specializing in news analysis.
Your job is to analyze news articles and extract actionable insights.

For each article, provide analysis in the following JSON format:
{
  "summary": "A concise 1-2 sentence summary of the article",
  "geopolitical_relevance": "low|medium|high",
  "relevance_reason": "Brief explanation of why this is geopolitically relevant",
  "key_entities": ["country/org/person 1", "country/org/person 2"],
  "related_domains": ["defense", "trade", "diplomacy", "technology", "energy"],
  "sentiment": "negative|neutral|positive",
  "significance_score": 1-10,
  "insights": "2-3 sentences of deeper analysis or implications"
}

Be concise and analytical. Focus on geopolitical, security, and international relations implications."""

    user_message = f"""Analyze this news article for geopolitical significance:

{article_text}

Provide your analysis as JSON."""

    try:
        logger.info(f"Analyzing article: {title[:50]}...")
        client = get_claude_client()

        message = client.messages.create(
            model="claude-opus-4-1",
            max_tokens=500,
            system=system_prompt,
            messages=[
                {"role": "user", "content": user_message}
            ]
        )

        response_text = message.content[0].text

        # Parse JSON response
        try:
            analysis = json.loads(response_text)
        except json.JSONDecodeError:
            # If response isn't pure JSON, try to extract it
            logger.warning(f"Response wasn't pure JSON, attempting to parse: {response_text[:100]}")
            analysis = _extract_json_from_text(response_text)

        return analysis

    except Exception as e:
        raise ClaudeAnalysisError(f"Failed to analyze article '{title}': {e}")

def _extract_json_from_text(text):
    """Attempt to extract JSON from Claude's response if it's wrapped in markdown or text."""
    # Try to find JSON block in markdown
    if "```json" in text:
        start = text.find("```json") + 7
        end = text.find("```", start)
        if end > start:
            text = text[start:end].strip()
    elif "```" in text:
        start = text.find("```") + 3
        end = text.find("```", start)
        if end > start:
            text = text[start:end].strip()

    return json.loads(text)

def format_analysis(article, analysis):
    """Format analysis for display."""
    title = article.get("title", "Unknown")
    url = article.get("url", "")
    source = article.get("source", {}).get("name", "Unknown")

    output = f"\n{'='*70}\n"
    output += f"📰 {title}\n"
    output += f"Source: {source}\n"
    output += f"URL: {url}\n"
    output += f"{'='*70}\n"

    output += f"\n📝 Summary:\n{analysis.get('summary', 'N/A')}\n"

    relevance = analysis.get('geopolitical_relevance', 'unknown').upper()
    relevance_emoji = "🔴" if relevance == "HIGH" else "🟡" if relevance == "MEDIUM" else "🟢"
    output += f"\n{relevance_emoji} Geopolitical Relevance: {relevance}\n"
    output += f"   Why: {analysis.get('relevance_reason', 'N/A')}\n"

    sentiment = analysis.get('sentiment', 'unknown').upper()
    sentiment_emoji = "📉" if sentiment == "NEGATIVE" else "📈" if sentiment == "POSITIVE" else "➡️"
    output += f"\n{sentiment_emoji} Sentiment: {sentiment}\n"

    output += f"\n👥 Key Entities:\n"
    for entity in analysis.get('key_entities', []):
        output += f"   • {entity}\n"

    output += f"\n🎯 Related Domains:\n"
    for domain in analysis.get('related_domains', []):
        output += f"   • {domain}\n"

    score = analysis.get('significance_score', 0)
    output += f"\n⭐ Significance Score: {score}/10\n"

    output += f"\n💡 Insights:\n{analysis.get('insights', 'N/A')}\n"

    return output

if __name__ == "__main__":
    # Simple test
    test_article = {
        "title": "Russia and NATO tensions escalate",
        "description": "Recent military exercises spark concerns",
        "url": "https://example.com",
        "source": {"name": "Example News"}
    }

    try:
        analysis = analyze_article(test_article)
        print(format_analysis(test_article, analysis))
    except ClaudeAnalysisError as e:
        logger.error(f"Analysis error: {e}")
