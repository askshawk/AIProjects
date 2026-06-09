import os
import base64
import json
from datetime import datetime
from email.mime.text import MIMEText

import functions_framework
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from anthropic import Anthropic

# Newsletter sender email addresses
NEWSLETTER_SENDERS = {
    'The Information': 'hello@theinformation.com',
    'TechCrunch': 'newsletters@techcrunch.com',
    'DeepLearning.AI': 'thebatch@deeplearning.ai',
    'TLDR': 'dan@tldrnewsletter.com',
    'The Rundown AI - Tech News': 'crew@technews.therundown.ai',
    'The Rundown AI - Daily': 'news@daily.therundown.ai',
    'The Rundown AI - Robotics': 'hi@robotics.therundown.ai',
    'Wired': 'wired@newsletters.wired.com',
    'The Code': 'thecode@mail.joinsuperhuman.ai',
    'Superhuman AI': 'superhuman@mail.joinsuperhuman.ai',
    'The Neuron Daily': 'theneuron@newsletter.theneurondaily.com',
}

# Keywords that indicate a promotional/non-news email - skip these
PROMO_KEYWORDS = [
    'trial ends', 'trial expir', 'subscribe now', 'subscription',
    'your trial', 'don\'t lose access', '% off', 'discount',
    'special offer', 'upgrade your', 'renew your', 'billing',
    'payment', 'invoice', 'receipt', 'welcome to', 'confirm your'
]

GMAIL_USER = 'ashawkrivosh@gmail.com'
SCOPES = [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.send'
]

def authenticate_gmail():
    """Authenticate with Gmail using token stored in environment variable."""
    token_data = json.loads(os.environ.get('GMAIL_TOKEN'))
    creds = Credentials.from_authorized_user_info(token_data, SCOPES)
    if creds.expired and creds.refresh_token:
        creds.refresh(Request())
    return creds

def is_promotional(subject):
    """Check if an email is promotional and should be skipped."""
    subject_lower = subject.lower()
    return any(keyword in subject_lower for keyword in PROMO_KEYWORDS)

def get_newsletters_by_source(service, hours=24):
    """
    Fetch newsletter emails grouped by source.
    Returns a dict: {newsletter_name: [(subject, body), ...]}
    """
    found = {name: [] for name in NEWSLETTER_SENDERS}

    for name, email_addr in NEWSLETTER_SENDERS.items():
        query = f"from:{email_addr} newer_than:{hours}h"
        results = service.users().messages().list(userId='me', q=query, maxResults=5).execute()
        messages = results.get('messages', [])

        for msg in messages:
            subject, sender, body = get_email_content(service, msg['id'])

            # Skip promotional emails
            if is_promotional(subject):
                print(f"  ⏭️  Skipping promo email from {name}: {subject}")
                continue

            found[name].append((subject, body))

    return found

def get_email_content(service, message_id):
    """Extract subject, sender, and body from an email."""
    message = service.users().messages().get(userId='me', id=message_id, format='full').execute()
    headers = message['payload']['headers']
    subject = next((h['value'] for h in headers if h['name'] == 'Subject'), 'No Subject')
    sender = next((h['value'] for h in headers if h['name'] == 'From'), 'Unknown')

    body_text = ''
    payload = message['payload']
    if 'parts' in payload:
        for part in payload['parts']:
            if part['mimeType'] == 'text/plain':
                if 'data' in part['body']:
                    body_text = base64.urlsafe_b64decode(part['body']['data']).decode('utf-8')
                    break
    else:
        if 'data' in payload['body']:
            body_text = base64.urlsafe_b64decode(payload['body']['data']).decode('utf-8')

    return subject, sender, body_text

def summarize_with_claude(email_content, newsletter_name, subject):
    """Use Claude to summarize the newsletter in a clean, readable format."""
    client = Anthropic(api_key=os.environ.get('CLAUDE_KEY'))

    response = client.messages.create(
        model="claude-haiku-4-5",
        max_tokens=350,
        messages=[{
            "role": "user",
            "content": f"""Summarize this {newsletter_name} newsletter in this exact format:

• [Key story or takeaway #1 in 1-2 sentences]
• [Key story or takeaway #2 in 1-2 sentences]
• [Key story or takeaway #3 in 1-2 sentences - only if there's a third notable story]

[One brief paragraph of 2-4 sentences providing overall context or the most important insight from this edition.]

Keep it tight and scannable. No long walls of text.

Subject: {subject}

Newsletter content:
{email_content[:4000]}"""
        }]
    )
    return response.content[0].text

def send_digest_email(service, digest_content):
    """Send the digest email via Gmail."""
    message = MIMEText(digest_content)
    message['to'] = GMAIL_USER
    message['from'] = GMAIL_USER
    message['subject'] = f"📰 Newsletter Digest - {datetime.now().strftime('%B %d, %Y')}"
    raw = base64.urlsafe_b64encode(message.as_bytes()).decode()
    service.users().messages().send(userId='me', body={'raw': raw}).execute()

@functions_framework.http
def newsletter_digest(request):
    """Main Cloud Function entry point - triggered by Cloud Scheduler."""
    print("🚀 Starting Newsletter Digest Generator...")

    # Authenticate with Gmail
    creds = authenticate_gmail()
    service = build('gmail', 'v1', credentials=creds)
    print("✅ Gmail authenticated!")

    # Fetch newsletters grouped by source
    print("🔍 Fetching newsletters from the last 24 hours...")
    newsletters_by_source = get_newsletters_by_source(service, hours=24)

    # Build digest
    digest = f"📰 NEWSLETTER DIGEST\n"
    digest += f"Generated: {datetime.now().strftime('%B %d, %Y at %I:%M %p')} EST\n"
    digest += "=" * 60 + "\n\n"

    no_newsletter = []
    summaries_count = 0

    for name, emails in newsletters_by_source.items():
        if not emails:
            no_newsletter.append(name)
            continue

        # Use the most recent email from this source
        subject, body = emails[0]

        print(f"  📝 Summarizing {name}...")
        summary = summarize_with_claude(body, name, subject)
        summaries_count += 1

        digest += f"📌 {name.upper()}\n"
        digest += f"   Subject: {subject}\n\n"
        digest += f"{summary}\n\n"
        digest += "-" * 60 + "\n\n"

    # Add "no newsletter" section at the bottom
    if no_newsletter:
        digest += "📭 NO NEWSLETTER TODAY FROM:\n"
        for name in no_newsletter:
            digest += f"   • {name}\n"

    # Send email
    send_digest_email(service, digest)
    print(f"✅ Digest sent! ({summaries_count} newsletters summarized, {len(no_newsletter)} had no edition today)")

    return f"Digest sent! {summaries_count} summarized, {len(no_newsletter)} missing.", 200
