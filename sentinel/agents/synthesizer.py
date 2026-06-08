"""
Synthesizer agent: Takes top signals and generates daily intelligence briefs.
"""
import json
import os
from anthropic import Anthropic

class SynthesizerError(Exception):
    pass

def get_claude_client():
    api_key = os.getenv('CLAUDE_API_KEY')
    if not api_key:
        raise SynthesizerError("CLAUDE_API_KEY not set in environment")
    os.environ['ANTHROPIC_API_KEY'] = api_key
    return Anthropic()

def generate_brief(signals, max_signals=10):
    """
    Generate an AI-synthesized daily intelligence brief from top signals.
    Takes the most significant signals and creates a markdown brief.
    """
    if not signals:
        raise SynthesizerError("No signals provided for brief generation")

    client = get_claude_client()

    # Prepare signal summaries
    signal_summaries = []
    for i, signal in enumerate(signals[:max_signals], 1):
        summary = f"""
Signal {i}:
- Title: {signal.get('title', 'N/A')}
- Threat Level: {signal.get('threat_level', 'unknown')}
- Significance: {signal.get('significance_score', 0)}/10
- Summary: {signal.get('summary', 'No summary')}
- Source: {signal.get('source_type', 'unknown')}
"""
        signal_summaries.append(summary)

    signals_text = "\n".join(signal_summaries)

    system_prompt = """You are a senior intelligence analyst and strategic briefing specialist.
Your task is to synthesize multiple signals into a compelling, actionable daily intelligence brief.

Create a professional intelligence brief that:
1. Opens with a 2-3 sentence executive summary of the day's most critical developments
2. Groups signals by domain/theme (geopolitics, cyber, finance, etc.)
3. Highlights any emerging patterns or second-order effects
4. Identifies key stakeholders and potential cascading impacts
5. Concludes with forward-looking risk assessment

Format as clean markdown with headers, bullet points, and emphasis where appropriate.
Assume the reader is a busy executive who needs insights, not just facts."""

    user_message = f"""Generate today's intelligence brief from these signals:

{signals_text}

Create a professional, concise brief (400-600 words) that synthesizes these signals into actionable intelligence."""

    try:
        response = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=1000,
            system=system_prompt,
            messages=[
                {"role": "user", "content": user_message}
            ]
        )

        brief_content = response.content[0].text
        return brief_content

    except Exception as e:
        raise SynthesizerError(f"Brief generation failed: {e}")
