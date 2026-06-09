import os
import base64
from datetime import datetime
from dotenv import load_dotenv
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from anthropic import Anthropic

# Load environment variables from .env
load_dotenv()

CLAUDE_API_KEY = os.getenv('CLAUDE_API_KEY')
GMAIL_USER = os.getenv('GMAIL_USER')

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

# Gmail permissions we need
SCOPES = [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.send'
]

def authenticate_gmail():
    """
    Authenticate with Gmail API.
    
    First time you run this: Opens your browser to ask for permission.
    After that: Uses saved token automatically (stored in token.json).
    """
    creds = None
    
    # Check if we've already authenticated before
    if os.path.exists('token.json'):
        creds = Credentials.from_authorized_user_file('token.json', SCOPES)
    
    # If no valid credentials, get new ones
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            # This opens your browser to ask for permission
            flow = InstalledAppFlow.from_client_secrets_file('credentials.json', SCOPES)
            creds = flow.run_local_server(port=8080, open_browser=True)
        
        # Save the token for next time (so we don't have to authenticate again)
        with open('token.json', 'w') as token:
            token.write(creds.to_json())
    
    return creds

def get_newsletters(service, hours=720):
    """
    Fetch newsletter emails from the past N hours.

    This searches Gmail for emails from our newsletter senders.
    """
    # Build search query: "from:(email1 OR email2 OR email3...)"
    email_list = ' OR '.join(NEWSLETTER_SENDERS.values())
    query = f"from:({email_list}) newer_than:{hours}h"

    # Search Gmail
    results = service.users().messages().list(userId='me', q=query, maxResults=100).execute()
    messages = results.get('messages', [])

    return messages

def get_email_content(service, message_id):
    """
    Extract subject, sender, and body text from an email.
    """
    message = service.users().messages().get(userId='me', id=message_id, format='full').execute()
    
    # Extract headers
    headers = message['payload']['headers']
    subject = next((h['value'] for h in headers if h['name'] == 'Subject'), 'No Subject')
    sender = next((h['value'] for h in headers if h['name'] == 'From'), 'Unknown')
    
    # Extract body text (handles both simple and multipart emails)
    body_text = ''
    payload = message['payload']
    
    if 'parts' in payload:
        # Multipart email - find the text/plain part
        for part in payload['parts']:
            if part['mimeType'] == 'text/plain':
                if 'data' in part['body']:
                    body_text = base64.urlsafe_b64decode(part['body']['data']).decode('utf-8')
                    break
    else:
        # Simple email
        if 'data' in payload['body']:
            body_text = base64.urlsafe_b64decode(payload['body']['data']).decode('utf-8')
    
    return subject, sender, body_text

def summarize_with_claude(email_content, newsletter_name):
    """
    Use Claude API to summarize the email.
    Returns a 2-3 paragraph summary.
    """
    client = Anthropic(api_key=CLAUDE_API_KEY)
    
    response = client.messages.create(
        model="claude-opus-4-1",
        max_tokens=400,
        messages=[
            {
                "role": "user",
                "content": f"""Please summarize this {newsletter_name} newsletter.

Write a 2-3 paragraph summary covering the main stories and key points. Keep it concise but thorough.

Newsletter content:
{email_content[:5000]}"""
            }
        ]
    )

    return response.content[0].text

def send_digest_email(service, digest_content, recipient_email):
    """
    Send the digest via Gmail.
    """
    import base64
    from email.mime.text import MIMEText

    # Create email message
    message = MIMEText(digest_content)
    message['to'] = recipient_email
    message['from'] = GMAIL_USER
    message['subject'] = f"📰 Newsletter Digest - {datetime.now().strftime('%B %d, %Y')}"

    # Encode the message
    raw_message = base64.urlsafe_b64encode(message.as_bytes()).decode()

    # Send via Gmail API
    try:
        service.users().messages().send(userId='me', body={'raw': raw_message}).execute()
        print(f"\n✅ Digest emailed to {recipient_email}")
    except Exception as e:
        print(f"\n❌ Failed to send email: {e}")

def main():
    print("\n🚀 Starting Newsletter Digest Generator...\n")
    
    # Step 1: Authenticate with Gmail
    print("📧 Authenticating with Gmail...")
    creds = authenticate_gmail()
    service = build('gmail', 'v1', credentials=creds)
    print("✅ Gmail authenticated!\n")
    
    # Step 2: Fetch newsletters
    print(f"🔍 Looking for newsletters from the last 24 hours...\n")
    messages = get_newsletters(service, hours=24)

    if not messages:
        print("❌ No newsletters found in the last 24 hours.")
        return
        debug_messages = debug_results.get('messages', [])

        if debug_messages:
            print(f"Found {len(debug_messages)} total emails from last 7 days:\n")
            for msg in debug_messages[:10]:  # Show first 10
                msg_id = msg['id']
                subject, sender, _ = get_email_content(service, msg_id)
                print(f"  From: {sender}")
                print(f"  Subject: {subject}\n")
        else:
            print("No emails found at all in the last 7 days.")
        return
    
    print(f"📨 Found {len(messages)} newsletters. Summarizing...\n")
    
    # Step 3: Create digest
    digest = f"📰 NEWSLETTER DIGEST\n"
    digest += f"Generated: {datetime.now().strftime('%B %d, %Y at %I:%M %p')}\n"
    digest += "=" * 60 + "\n\n"
    
    for idx, message in enumerate(messages, 1):
        message_id = message['id']
        subject, sender, body = get_email_content(service, message_id)
        
        # Find which newsletter this is
        newsletter_name = 'Unknown'
        for name, email_addr in NEWSLETTER_SENDERS.items():
            if email_addr.lower() in sender.lower():
                newsletter_name = name
                break
        
        print(f"  [{idx}/{len(messages)}] Summarizing {newsletter_name}...")
        
        # Summarize with Claude
        summary = summarize_with_claude(body, newsletter_name)
        
        # Add to digest
        digest += f"📌 {newsletter_name.upper()}\n"
        digest += f"   Subject: {subject}\n\n"
        digest += f"{summary}\n\n"
        digest += "-" * 60 + "\n\n"
    
    # Step 4: Display the digest
    print("\n" + "=" * 60)
    print("✨ DIGEST READY ✨")
    print("=" * 60)
    print(digest)
    
    # Save to file
    with open('digest.txt', 'w') as f:
        f.write(digest)
    print("\n💾 Digest saved to: digest.txt")

    # Step 5: Send via email
    send_digest_email(service, digest, GMAIL_USER)

if __name__ == "__main__":
    main()