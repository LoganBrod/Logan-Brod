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


def scrape_sportscardspro(query: str) -> list:
    """SportscardsPro aggregates eBay sold data — generally scraper-friendly."""
    results = []
    try:
        encoded = requests.utils.quote(query)
        url = f'https://www.sportscardspro.com/search-products?q={encoded}'
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Referer': 'https://www.sportscardspro.com/',
        }
        resp = requests.get(url, headers=headers, timeout=15)
        logger.info('SportscardsPro status: %s len: %d', resp.status_code, len(resp.text))
        soup = BeautifulSoup(resp.text, 'lxml')

        # Each product row
        rows = soup.select('tr.offer')
        logger.info('SportscardsPro rows: %d', len(rows))
        for row in rows[:20]:
            price_el = row.select_one('p.price, .price.js-price')
            title_el = row.select_one('td:first-child a, td:first-child')
            link_el  = row.select_one('a[href]')
            if not price_el:
                continue
            price_text = price_el.get_text(strip=True)
            price_num  = re.sub(r'[^\d.]', '', price_text)
            if not price_num or float(price_num) < 0.5:
                continue
            results.append({
                'source': 'SportscardsPro',
                'title': title_el.get_text(strip=True) if title_el else query,
                'price': float(price_num),
                'price_display': f'${float(price_num):,.2f}',
                'date': '',
                'condition': '',
                'link': ('https://www.sportscardspro.com' + link_el['href'] if link_el and link_el.get('href','').startswith('/') else link_el['href'] if link_el else url),
            })
    except Exception as exc:
        logger.error('scrape_sportscardspro error: %s', exc)
    return results


def scrape_psacard(query: str) -> list:
    """PSA auction price results."""
    results = []
    try:
        encoded = requests.utils.quote(query)
        url = f'https://www.psacard.com/auctionprices/results?q={encoded}'
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
        }
        resp = requests.get(url, headers=headers, timeout=15)
        logger.info('PSA status: %s len: %d', resp.status_code, len(resp.text))
        soup = BeautifulSoup(resp.text, 'lxml')

        rows = soup.select('tr.auction-row, tbody tr, .result-row')
        logger.info('PSA rows: %d', len(rows))
        for row in rows[:20]:
            cells = row.find_all('td')
            if len(cells) < 3:
                continue
            # Typical columns: card, grade, price, date, auction
            price_text = ''
            date_text  = ''
            title_text = ''
            for i, cell in enumerate(cells):
                txt = cell.get_text(strip=True)
                if re.match(r'^\$[\d,]+', txt):
                    price_text = txt
                    date_text  = cells[i+1].get_text(strip=True) if i+1 < len(cells) else ''
                    break
                if i == 0:
                    title_text = txt
            price_num = re.sub(r'[^\d.]', '', price_text)
            if not price_num or float(price_num) < 0.5:
                continue
            link_el = row.select_one('a[href]')
            results.append({
                'source': 'PSA',
                'title': title_text or query,
                'price': float(price_num),
                'price_display': price_text or f'${float(price_num):,.2f}',
                'date': date_text,
                'condition': '',
                'link': link_el['href'] if link_el else url,
            })
    except Exception as exc:
        logger.error('scrape_psacard error: %s', exc)
    return results


def scrape_mavin(query: str) -> list:
    """Mavin.io — eBay sold aggregator."""
    results = []
    try:
        encoded = requests.utils.quote(query)
        url = f'https://mavin.io/search?q={encoded}&sold=1'
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
        }
        resp = requests.get(url, headers=headers, timeout=15)
        logger.info('Mavin status: %s len: %d', resp.status_code, len(resp.text))
        soup = BeautifulSoup(resp.text, 'lxml')

        # Mavin uses a data table with class "table"
        rows = soup.select('table.table tbody tr, .item-row, [class*="result"] tr')
        logger.info('Mavin rows: %d', len(rows))
        for row in rows[:25]:
            cells = row.find_all('td')
            if not cells:
                continue
            price_el = row.select_one('[class*="price"], .price')
            title_el = row.select_one('[class*="title"], .title, td:first-child a, td:first-child')
            date_el  = row.select_one('[class*="date"], .date, td:nth-child(2)')
            link_el  = row.select_one('a[href]')

            price_text = price_el.get_text(strip=True) if price_el else (cells[-1].get_text(strip=True) if cells else '')
            price_num  = re.sub(r'[^\d.]', '', price_text)
            if not price_num or float(price_num) < 0.5:
                continue
            results.append({
                'source': 'eBay (Mavin)',
                'title': title_el.get_text(strip=True) if title_el else query,
                'price': float(price_num),
                'price_display': f'${float(price_num):,.2f}',
                'date': date_el.get_text(strip=True) if date_el else '',
                'condition': '',
                'link': link_el['href'] if link_el else url,
            })
    except Exception as exc:
        logger.error('scrape_mavin error: %s', exc)
    return results


def scrape_ebay(query: str) -> list:
    """Direct eBay sold listings — may be blocked, Mavin is the primary source."""
    results = []
    try:
        encoded = requests.utils.quote(query)
        url = f'https://www.ebay.com/sch/i.html?_nkw={encoded}&LH_Sold=1&LH_Complete=1&_sop=13'
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Accept-Language': 'en-US,en;q=0.9',
        }
        resp = requests.get(url, headers=headers, timeout=15)
        logger.info('eBay status: %s len: %d', resp.status_code, len(resp.text))
        soup = BeautifulSoup(resp.text, 'lxml')
        items = soup.select('.s-item')
        logger.info('eBay items: %d', len(items))
        for item in items[:25]:
            title_el = item.select_one('.s-item__title')
            price_el = item.select_one('.s-item__price')
            date_el  = item.select_one('.s-item__ended-date, .POSITIVE')
            link_el  = item.select_one('a.s-item__link')
            if not title_el or not price_el:
                continue
            title = title_el.get_text(strip=True)
            if 'Shop on eBay' in title:
                continue
            price_text = price_el.get_text(strip=True).split(' to ')[0]
            price_num  = re.sub(r'[^\d.]', '', price_text)
            if not price_num:
                continue
            link = link_el.get('href', '') if link_el else ''
            results.append({
                'source': 'eBay',
                'title': title,
                'price': float(price_num),
                'price_display': f'${float(price_num):,.2f}',
                'date': date_el.get_text(strip=True) if date_el else '',
                'condition': '',
                'link': link.split('?')[0] if link else url,
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
        image = image.convert('RGB')

        # Scale up small images — Tesseract works best at 300+ DPI equivalent
        w, h = image.size
        if w < 1000:
            scale = 1000 / w
            image = image.resize((int(w * scale), int(h * scale)), Image.LANCZOS)

        # Try with default config first, then fall back to psm 6 (block of text)
        custom_config = r'--oem 3 --psm 11'
        raw_text = pytesseract.image_to_string(image, config=custom_config)
        logger.info('OCR raw text: %r', raw_text)

        if not raw_text.strip():
            # Second attempt with different page seg mode
            raw_text = pytesseract.image_to_string(image, config=r'--oem 3 --psm 6')
            logger.info('OCR retry text: %r', raw_text)

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
    all_results.extend(scrape_sportscardspro(query))

    # Sort by date desc then price desc
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

    encoded = requests.utils.quote(query)
    quick_links = [
        {'label': 'eBay Sold', 'url': f'https://www.ebay.com/sch/i.html?_nkw={encoded}&LH_Sold=1&LH_Complete=1&_sop=13'},
        {'label': '130point',  'url': f'https://www.130point.com/sales/search/?query={encoded}'},
        {'label': 'Mavin',     'url': f'https://mavin.io/search?q={encoded}&sold=1'},
        {'label': 'Goldin',    'url': f'https://goldin.co/auctions?q={encoded}&status=past'},
        {'label': 'PSA Prices','url': f'https://www.psacard.com/auctionprices/results?q={encoded}'},
        {'label': 'PWCC',      'url': f'https://www.pwccmarketplace.com/search?q={encoded}'},
    ]

    return jsonify({
        'query': query,
        'results': all_results,
        'summary': summary,
        'quick_links': quick_links,
    })


@app.route('/api/health')
def health():
    return jsonify({'status': 'ok', 'ocr_available': OCR_AVAILABLE})


@app.route('/api/debug-html')
def debug_html():
    """Fetch a comp site and return CSS classes near $ prices — for selector debugging."""
    site = request.args.get('site', 'sportscardspro')
    query = request.args.get('q', '2025 Cooper Flagg Topps 201')
    encoded = requests.utils.quote(query)
    urls = {
        'sportscardspro': f'https://www.sportscardspro.com/search-products?q={encoded}',
        'mavin':          f'https://mavin.io/search?q={encoded}&sold=1',
        'psa':            f'https://www.psacard.com/auctionprices/results?q={encoded}',
        'goldin':         f'https://goldin.co/auctions?q={encoded}&status=past',
        'pwcc':           f'https://www.pwccmarketplace.com/search?q={encoded}',
    }
    url = urls.get(site, urls['sportscardspro'])
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
    }
    try:
        resp = requests.get(url, headers=headers, timeout=15)
        soup = BeautifulSoup(resp.text, 'lxml')
        price_els = soup.find_all(string=lambda t: t and '$' in t)
        findings = []
        seen = set()
        for el in price_els[:15]:
            parent = el.parent
            for _ in range(5):
                if not parent or parent.name in ('html', 'body', '[document]'):
                    break
                key = (parent.name, tuple(sorted(parent.get('class', []))))
                if key not in seen:
                    seen.add(key)
                    findings.append({
                        'tag': parent.name,
                        'class': ' '.join(parent.get('class', [])),
                        'text': parent.get_text(strip=True)[:120],
                    })
                parent = parent.parent
        return jsonify({
            'url': url,
            'status': resp.status_code,
            'length': len(resp.text),
            'price_findings': findings,
            'body_preview': soup.get_text()[:800] if not findings else '',
        })
    except Exception as exc:
        return jsonify({'error': str(exc)})


if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
