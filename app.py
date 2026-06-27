import os
import re
import json
import time
import logging
from io import BytesIO

from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import requests
from bs4 import BeautifulSoup

# Try to import OCR libraries - gracefully degrade if not available
try:
    import pytesseract
    from PIL import Image
    # On Windows, Tesseract is typically installed here
    if os.name == 'nt':
        pytesseract.pytesseract.tesseract_cmd = r'C:\Program Files\Tesseract-OCR\tesseract.exe'
    OCR_AVAILABLE = True
except ImportError:
    OCR_AVAILABLE = False

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__, static_folder='static')
CORS(app)

HEADERS = {
    'User-Agent': (
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
        'AppleWebKit/537.36 (KHTML, like Gecko) '
        'Chrome/124.0.0.0 Safari/537.36'
    ),
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
}

# ---------------------------------------------------------------------------
# OCR helpers
# ---------------------------------------------------------------------------

CARD_BRANDS = [
    'Topps', 'Panini', 'Upper Deck', 'Bowman', 'Donruss', 'Fleer',
    'Score', 'Leaf', 'Stadium Club', 'Select', 'Prizm', 'Mosaic',
    'Optic', 'Chronicles', 'Contenders', 'National Treasures',
    'Immaculate', 'Absolute', 'Certified', 'Classics', 'Revolution',
    'Illusions', 'Gold Standard', 'Majestic', 'Obsidian', 'Status',
    'SP Authentic', 'Exquisite', 'SPx', 'Victory', 'Ultra',
]

GRADE_PATTERN = re.compile(
    r'\b(PSA|BGS|SGC|CGC|HGA|CSG|ISA)\s*(\d+(?:\.\d+)?)\b',
    re.IGNORECASE,
)
YEAR_PATTERN = re.compile(r'\b(19[7-9]\d|20[0-2]\d)\b')
CARD_NUM_PATTERN = re.compile(r'#\s*(\w+\d+\w*|\d+)')


def parse_card_text(text: str) -> dict:
    """Extract structured card info from raw OCR text."""
    result = {
        'player': '',
        'year': '',
        'set': '',
        'number': '',
        'variation': '',
        'grade': '',
        'grade_value': '',
        'raw_text': text,
    }

    # Grade
    grade_match = GRADE_PATTERN.search(text)
    if grade_match:
        result['grade'] = grade_match.group(1).upper()
        result['grade_value'] = grade_match.group(2)

    # Year
    year_match = YEAR_PATTERN.search(text)
    if year_match:
        result['year'] = year_match.group(1)

    # Card number
    num_match = CARD_NUM_PATTERN.search(text)
    if num_match:
        result['number'] = num_match.group(1)

    # Brand/set
    text_lower = text.lower()
    for brand in CARD_BRANDS:
        if brand.lower() in text_lower:
            result['set'] = brand
            break

    SKIP_WORDS = {
        'rookie', 'rated rookie', 'press proof', 'rated', 'photo',
        'checklist', 'insert', 'base', 'card', 'football', 'basketball',
        'baseball', 'hockey', 'trading', 'collectible', 'official',
        'licensed', 'nfl', 'nba', 'mlb', 'nhl', 'rc',
    }

    def _is_skip_line(line):
        if re.match(r'^[\d\s#\-\/]+$', line):
            return True
        if GRADE_PATTERN.search(line):
            return True
        if YEAR_PATTERN.match(line.strip()):
            return True
        low = line.lower()
        if any(brand.lower() in low for brand in CARD_BRANDS):
            return True
        if any(w in low for w in SKIP_WORDS):
            return True
        return False

    lines = [l.strip() for l in text.split('\n') if l.strip()]

    # Prefer ALL-CAPS lines that look like a player name (e.g. "CALEB WILLIAMS")
    for line in lines:
        if _is_skip_line(line):
            continue
        words = line.split()
        if (2 <= len(words) <= 4
                and all(re.match(r'^[A-Z][A-Z\'\-\.]+$', w) for w in words)
                and len(line) < 40):
            result['player'] = line.title()
            break

    # Fallback: first plausible mixed-case name line
    if not result['player']:
        for line in lines:
            if _is_skip_line(line):
                continue
            if re.search(r'[A-Za-z]', line) and len(line) < 40:
                result['player'] = line
                break

    return result


# ---------------------------------------------------------------------------
# Scraping helpers
# ---------------------------------------------------------------------------

def fetch_url(url: str, timeout: int = 10) -> str | None:
    try:
        resp = requests.get(url, headers=HEADERS, timeout=timeout)
        resp.raise_for_status()
        return resp.text
    except Exception as exc:
        logger.warning('fetch_url %s failed: %s', url, exc)
        return None


def build_query(card: dict) -> str:
    parts = []
    if card.get('year'):
        parts.append(card['year'])
    if card.get('player'):
        parts.append(card['player'])
    if card.get('set'):
        parts.append(card['set'])
    if card.get('number'):
        parts.append(f"#{card['number']}")
    if card.get('variation'):
        parts.append(card['variation'])
    if card.get('grade') and card.get('grade_value'):
        parts.append(f"{card['grade']} {card['grade_value']}")
    return ' '.join(parts) if parts else 'sports card'


def scrape_ebay(query: str) -> list:
    results = []
    try:
        url = (
            'https://www.ebay.com/sch/i.html'
            f'?_nkw={requests.utils.quote(query)}'
            '&LH_Sold=1&LH_Complete=1&_sop=13&LH_ItemCondition=4'
        )
        html = fetch_url(url)
        if not html:
            return results
        soup = BeautifulSoup(html, 'lxml')
        items = soup.select('.s-item')
        for item in items[:20]:
            title_el = item.select_one('.s-item__title')
            price_el = item.select_one('.s-item__price')
            date_el = item.select_one('.s-item__ended-date, .POSITIVE')
            link_el = item.select_one('a.s-item__link')

            if not title_el or not price_el:
                continue
            title = title_el.get_text(strip=True)
            if 'Shop on eBay' in title:
                continue

            price_text = price_el.get_text(strip=True)
            # Handle price ranges — take first value
            price_text = price_text.split(' to ')[0]
            price_num = re.sub(r'[^\d.]', '', price_text)
            if not price_num:
                continue

            date_text = date_el.get_text(strip=True) if date_el else ''
            link = link_el['href'] if link_el else ''

            results.append({
                'source': 'eBay',
                'title': title,
                'price': float(price_num),
                'price_display': price_text,
                'date': date_text,
                'condition': '',
                'link': link.split('?')[0] if link else '',
            })
    except Exception as exc:
        logger.error('scrape_ebay error: %s', exc)
    return results


def scrape_130point(query: str) -> list:
    results = []
    try:
        url = f'https://www.130point.com/sales/search/?query={requests.utils.quote(query)}'
        html = fetch_url(url)
        if not html:
            return results
        soup = BeautifulSoup(html, 'lxml')
        # 130point uses a table or card layout
        rows = soup.select('table tr, .sale-item, .result-row')
        for row in rows[:20]:
            cells = row.find_all('td')
            if len(cells) < 3:
                # Try card/div layout
                price_el = row.select_one('.price, .sale-price, [class*="price"]')
                title_el = row.select_one('.title, .card-title, [class*="title"]')
                date_el = row.select_one('.date, [class*="date"]')
                link_el = row.select_one('a')
                if not price_el:
                    continue
                price_text = price_el.get_text(strip=True)
                price_num = re.sub(r'[^\d.]', '', price_text)
                if not price_num:
                    continue
                results.append({
                    'source': '130point',
                    'title': title_el.get_text(strip=True) if title_el else query,
                    'price': float(price_num),
                    'price_display': price_text,
                    'date': date_el.get_text(strip=True) if date_el else '',
                    'condition': '',
                    'link': link_el['href'] if link_el and link_el.get('href') else url,
                })
            else:
                # Table layout
                try:
                    price_text = cells[2].get_text(strip=True)
                    price_num = re.sub(r'[^\d.]', '', price_text)
                    if not price_num:
                        continue
                    link_el = cells[0].find('a')
                    results.append({
                        'source': '130point',
                        'title': cells[0].get_text(strip=True),
                        'price': float(price_num),
                        'price_display': price_text,
                        'date': cells[1].get_text(strip=True) if len(cells) > 1 else '',
                        'condition': cells[3].get_text(strip=True) if len(cells) > 3 else '',
                        'link': link_el['href'] if link_el else url,
                    })
                except (ValueError, IndexError):
                    continue
    except Exception as exc:
        logger.error('scrape_130point error: %s', exc)
    return results


def scrape_goldin(query: str) -> list:
    results = []
    try:
        url = f'https://goldin.co/auctions?q={requests.utils.quote(query)}&status=past'
        html = fetch_url(url, timeout=12)
        if not html:
            return results
        soup = BeautifulSoup(html, 'lxml')
        items = soup.select('.auction-card, .lot-card, [class*="AuctionCard"], [class*="lot-item"]')
        for item in items[:20]:
            title_el = item.select_one('[class*="title"], h2, h3, .card-title')
            price_el = item.select_one('[class*="price"], [class*="hammer"], [class*="bid"]')
            date_el = item.select_one('[class*="date"], [class*="end"]')
            link_el = item.select_one('a')

            if not price_el:
                continue
            price_text = price_el.get_text(strip=True)
            price_num = re.sub(r'[^\d.]', '', price_text.replace(',', ''))
            if not price_num:
                continue

            href = ''
            if link_el and link_el.get('href'):
                href = link_el['href']
                if href.startswith('/'):
                    href = 'https://goldin.co' + href

            results.append({
                'source': 'Goldin',
                'title': title_el.get_text(strip=True) if title_el else query,
                'price': float(price_num),
                'price_display': price_text,
                'date': date_el.get_text(strip=True) if date_el else '',
                'condition': '',
                'link': href,
            })
    except Exception as exc:
        logger.error('scrape_goldin error: %s', exc)
    return results


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.route('/')
def index():
    return send_from_directory('static', 'index.html')


@app.route('/static/<path:filename>')
def static_files(filename):
    return send_from_directory('static', filename)


@app.route('/api/ocr', methods=['POST'])
def ocr_endpoint():
    if 'image' not in request.files:
        return jsonify({'error': 'No image uploaded'}), 400

    file = request.files['image']
    if not file.filename:
        return jsonify({'error': 'Empty filename'}), 400

    img_bytes = file.read()

    if not OCR_AVAILABLE:
        return jsonify({
            'error': 'OCR not available on this server',
            'player': '',
            'year': '',
            'set': '',
            'number': '',
            'variation': '',
            'grade': '',
            'grade_value': '',
            'raw_text': '',
        })

    try:
        image = Image.open(BytesIO(img_bytes))
        # Enhance for OCR
        image = image.convert('RGB')
        raw_text = pytesseract.image_to_string(image)
        card_info = parse_card_text(raw_text)
        return jsonify(card_info)
    except Exception as exc:
        logger.error('OCR error: %s', exc)
        return jsonify({
            'error': str(exc),
            'player': '',
            'year': '',
            'set': '',
            'number': '',
            'variation': '',
            'grade': '',
            'grade_value': '',
            'raw_text': '',
        })


@app.route('/api/comps', methods=['POST'])
def comps_endpoint():
    data = request.get_json(force=True)
    query = data.get('query') or build_query(data)

    if not query or query == 'sports card':
        return jsonify({'error': 'No card details provided', 'results': []}), 400

    all_results = []

    # Run scrapers — each failure is handled internally
    all_results.extend(scrape_ebay(query))
    all_results.extend(scrape_130point(query))
    all_results.extend(scrape_goldin(query))

    # Sort by price desc (proxy for recency when dates aren't parseable)
    all_results.sort(key=lambda x: x.get('price', 0), reverse=True)

    # Summary stats
    prices = [r['price'] for r in all_results if r.get('price')]
    summary = {}
    if prices:
        summary = {
            'count': len(prices),
            'avg': round(sum(prices) / len(prices), 2),
            'high': max(prices),
            'low': min(prices),
        }

    return jsonify({
        'query': query,
        'results': all_results,
        'summary': summary,
    })


@app.route('/api/health')
def health():
    return jsonify({'status': 'ok', 'ocr_available': OCR_AVAILABLE})


if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
