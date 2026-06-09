# Newsletter Digest

An automated daily newsletter summarizer that fetches newsletters from Gmail, summarizes them using Claude AI, and emails a clean digest every weekday at noon EST.

## What It Does

- Fetches emails from 11 tech newsletter sources in your Gmail inbox
- Skips promotional/subscription emails automatically
- Summarizes each newsletter into bullet points + a brief paragraph using Claude AI
- Notes which newsletters had no edition that day
- Emails the digest to you daily (Mon-Fri, 12 PM EST)
- Runs on Google Cloud Functions — no computer needed

## Newsletter Sources

- The Information
- TechCrunch
- DeepLearning.AI (The Batch)
- TLDR
- The Rundown AI (Tech News, Daily, Robotics)
- Wired
- The Code
- Superhuman AI
- The Neuron Daily

## Tech Stack

- **Language:** Python
- **Email API:** Gmail API (Google OAuth)
- **AI Summarization:** Anthropic Claude API
- **Cloud Hosting:** Google Cloud Functions (Gen 2)
- **Scheduling:** Google Cloud Scheduler
- **Secrets:** Google Cloud Secret Manager

## Project Structure

```
newsletter-digest/
├── main.py                  # Local script (for testing)
├── cloud_function/
│   ├── main.py              # Cloud Function entry point
│   └── requirements.txt     # Cloud dependencies
├── requirements.txt         # Local dependencies
├── .env.example             # Environment variables template
└── .gitignore               # Keeps secrets out of GitHub
```

## Setup

### 1. Clone the repo
```bash
git clone https://github.com/YOUR_USERNAME/newsletter-digest.git
cd newsletter-digest
```

### 2. Install dependencies
```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### 3. Set up credentials
- Create a Google Cloud project
- Enable the Gmail API
- Create OAuth credentials (Desktop Application)
- Download as `credentials.json`
- Copy `.env.example` to `.env` and fill in your values

### 4. Authenticate with Gmail
```bash
python main.py
```
Follow the browser prompt to authorize Gmail access.

### 5. Deploy to Google Cloud
```bash
cd cloud_function
gcloud functions deploy newsletter-digest \
  --gen2 \
  --runtime=python312 \
  --region=us-east1 \
  --source=. \
  --entry-point=newsletter_digest \
  --trigger-http \
  --memory=512MB \
  --timeout=540s \
  --set-secrets="GMAIL_TOKEN=gmail-token:latest,CLAUDE_KEY=claude-api-key:latest"
```

### 6. Set up daily schedule
```bash
gcloud scheduler jobs create http newsletter-digest-daily \
  --location=us-east1 \
  --schedule="0 12 * * 1-5" \
  --uri="YOUR_FUNCTION_URL" \
  --time-zone="America/New_York"
```

## License

MIT
