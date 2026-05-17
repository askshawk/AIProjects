import requests

API_KEY = "4e5484a6ed1040099322655d82e930fc"
URL = "https://newsapi.org/v2/top-headlines"

params = {
    "category": "business",
    "language": "en",
    "pageSize": 5,
    "apiKey": API_KEY
}

response = requests.get(URL, params=params)
data = response.json()

for article in data["articles"]:
    print(article["title"])
    print(article["url"])
    print("---")