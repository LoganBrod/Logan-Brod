"""Run this once to inspect the HTML structure of each comp site."""
import requests
from bs4 import BeautifulSoup

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
}

query = '2025 Cooper Flagg Topps 201'
encoded = requests.utils.quote(query)

sites = {
    'SportscardsPro': f'https://www.sportscardspro.com/search-products?q={encoded}',
    'Mavin':          f'https://mavin.io/search?q={encoded}&sold=1',
    'PSA':            f'https://www.psacard.com/auctionprices/results?q={encoded}',
}

for name, url in sites.items():
    print(f'\n{"="*60}')
    print(f'{name}: {url}')
    print('='*60)
    try:
        r = requests.get(url, headers=HEADERS, timeout=15)
        soup = BeautifulSoup(r.text, 'lxml')
        # Print all unique class names that appear on elements containing $ prices
        price_elements = soup.find_all(string=lambda t: t and '$' in t)
        classes_seen = set()
        for el in price_elements[:10]:
            parent = el.parent
            for _ in range(4):
                if parent and parent.get('class'):
                    cls = ' '.join(parent.get('class', []))
                    if cls not in classes_seen:
                        classes_seen.add(cls)
                        print(f'  price parent class: {cls!r} | tag: {parent.name} | text: {parent.get_text(strip=True)[:80]}')
                parent = parent.parent if parent else None
        if not classes_seen:
            print('  No $ price elements found in HTML')
            # Print first 1500 chars of body
            body = soup.find('body')
            print('  Body preview:', (body.get_text()[:500] if body else r.text[:500]))
    except Exception as e:
        print(f'  ERROR: {e}')
