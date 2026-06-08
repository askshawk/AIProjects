import json
import re
import os
from anthropic import Anthropic

class ClaudeAnalysisError(Exception):
    pass

def get_claude_client():
    api_key = os.getenv('CLAUDE_API_KEY')
    if not api_key:
        raise ClaudeAnalysisError("CLAUDE_API_KEY not set in environment")
    os.environ['ANTHROPIC_API_KEY'] = api_key
    return Anthropic()

def analyze_signal(signal_dict):
    """
    Analyze a signal (news or market event) for threat level, entities, domains, sentiment, and significance.
    Returns a dict with analysis results.
    """
    client = get_claude_client()

    title = signal_dict.get('title', '')
    content = signal_dict.get('content', '')
    source_type = signal_dict.get('source_type', 'news')

    system_prompt = """You are an intelligence analyst specializing in risk assessment, market analysis, and geopolitical intelligence.

Analyze the provided signal and respond with a JSON object containing:
- threat_level: "low", "medium", "high", or "critical"
- entities: list of countries, companies, people, or organizations mentioned
- domains: list of relevant domains from: ["geopolitics", "defense", "cyber", "finance", "supply_chain", "energy", "technology", "trade", "diplomacy", "crisis_management"]
- sentiment: "negative", "neutral", or "positive"
- significance_score: integer 1-10 (10 is most significant for risk/intelligence)
- summary: 1-2 sentence summary of the signal's importance

For market signals, focus on systemic risk, sector implications, and potential second-order effects.
For news signals, focus on geopolitical implications, business continuity risks, and related stakeholders."""

    user_message = f"""Signal: {title}

Content: {content}

Source Type: {source_type}"""

    try:
        response = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=500,
            system=system_prompt,
            messages=[
                {"role": "user", "content": user_message}
            ]
        )

        response_text = response.content[0].text
        analysis = _extract_json_from_text(response_text)

        return analysis
    except Exception as e:
        raise ClaudeAnalysisError(f"Claude analysis failed: {e}")

def _extract_json_from_text(text):
    """Extract JSON from response, handling markdown code blocks."""
    try:
        # Try to find JSON block
        json_match = re.search(r'```json\n?(.*?)\n?```', text, re.DOTALL)
        if json_match:
            json_str = json_match.group(1)
        else:
            json_str = text

        return json.loads(json_str)
    except json.JSONDecodeError as e:
        raise ClaudeAnalysisError(f"Failed to parse Claude response as JSON: {e}\nResponse: {text}")
