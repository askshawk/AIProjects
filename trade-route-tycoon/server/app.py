"""
Trade Route Tycoon — Harbormaster server
-----------------------------------------
A tiny Flask app that does two things:

  1. Serves the game's static files (so the browser and this API share an
     origin — no CORS headaches).
  2. Exposes POST /api/harbormaster, which takes the current game state and
     asks Claude for a short, strategic trading tip.

The game is fully playable WITHOUT this server (just open ../index.html).
Run this only when you want the AI advisor. One API key, no other accounts.

Run it:
    cd trade-route-tycoon/server
    pip install -r requirements.txt
    cp .env.example .env        # then paste your key into .env
    python app.py
    # open http://localhost:5000
"""

import os
from pathlib import Path

import anthropic
from dotenv import load_dotenv
from flask import Flask, jsonify, request, send_from_directory

load_dotenv()

# The game lives one directory up from this server file.
GAME_DIR = Path(__file__).resolve().parent.parent

# Default to the most capable model. It's a quick advisor, so we keep the
# response short and skip extended thinking for speed. Swap to a cheaper model
# (e.g. "claude-haiku-4-5") here if you'd rather optimize for cost.
MODEL = "claude-opus-4-8"

app = Flask(__name__, static_folder=str(GAME_DIR), static_url_path="")
client = anthropic.Anthropic()  # reads ANTHROPIC_API_KEY from the environment


@app.route("/")
def index():
    return send_from_directory(GAME_DIR, "index.html")


@app.route("/api/harbormaster", methods=["POST"])
def harbormaster():
    """Take a snapshot of the game and return one strategic trading tip."""
    state = request.get_json(force=True)

    system = (
        "You are the Oracle of Delphi advising a merchant in a classical "
        "Greek/Roman trading game set in the Aegean. Given the player's "
        "drachmae, cargo, and the live buy/sell prices at each city-state "
        "(Athenai, Sparta, Korinthos, Rhodos, Syrakousai, Alexandreia), name "
        "their single most profitable next voyage: which good to buy at which "
        "city and where to sell it. Speak as a mystical oracle but stay "
        "concrete — 2 to 3 sentences. Respond with only the prophecy, no preamble."
    )

    try:
        message = client.messages.create(
            model=MODEL,
            max_tokens=400,
            system=system,
            # A quick tip doesn't need extended reasoning; keep it fast + terse.
            output_config={"effort": "low"},
            messages=[
                {
                    "role": "user",
                    "content": f"Current game state (JSON):\n{state}",
                }
            ],
        )
        advice = next(
            (b.text for b in message.content if b.type == "text"), ""
        ).strip()
        return jsonify({"advice": advice})
    except anthropic.AuthenticationError:
        return jsonify({"error": "Invalid or missing ANTHROPIC_API_KEY"}), 401
    except anthropic.APIError as e:
        return jsonify({"error": f"Claude API error: {e}"}), 502


if __name__ == "__main__":
    app.run(port=5000, debug=True)
