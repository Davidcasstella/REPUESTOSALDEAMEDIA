#!/usr/bin/env python3
"""
PDF Catalog Parser for Auto Parts (Toyota / BDC format)

Extracts structured product data from PDF catalogs using pdfplumber.
Handles multi-line rows, column detection by X position, and price cleaning.

Usage:
    python parse_catalog_pdf.py <path_to_pdf>

Output:
    JSON array of products to stdout
"""

import sys
import json
import re
import pdfplumber


# Column boundaries based on X position (detected from real PDF inspection)
# These are generous ranges to handle slight positional variations across pages
COLUMNS = {
    'codigo':      (0, 125),
    'ref_oem':     (125, 210),
    'ref_fabrica': (210, 285),
    'descripcion': (285, 655),
    'marca':       (655, 715),
    'precio':      (715, 850),
}

# Pattern to detect the start of a new product row
# Matches codes like TOI-20-102, ISI-01-113, HYI-07-044, DAI-03-158, etc.
# Supports all brand prefixes found in BDC catalogs (2-4 uppercase letters)
NEW_ROW_PATTERN = re.compile(r'^[A-Z]{2,4}-\d{2}-\d{3,4}$', re.IGNORECASE)

# Pattern to clean price strings: "$ 105.950" → 105950
PRICE_CLEAN_PATTERN = re.compile(r'[\$\s.]')


def classify_word(x0):
    """Determine which column a word belongs to based on its x0 position."""
    for col_name, (x_min, x_max) in COLUMNS.items():
        if x_min <= x0 < x_max:
            return col_name
    return None


def group_words_by_line(words, tolerance=3):
    """
    Group words into lines based on their vertical position (top).
    Words within `tolerance` pixels vertically are considered same line.
    """
    if not words:
        return []

    # Sort by top position, then by x0
    sorted_words = sorted(words, key=lambda w: (w['top'], w['x0']))

    lines = []
    current_line = [sorted_words[0]]
    current_top = sorted_words[0]['top']

    for word in sorted_words[1:]:
        if abs(word['top'] - current_top) <= tolerance:
            current_line.append(word)
        else:
            lines.append(current_line)
            current_line = [word]
            current_top = word['top']

    if current_line:
        lines.append(current_line)

    return lines


def parse_line_to_columns(line_words):
    """
    Parse a line of words into column values by classifying each word's X position.
    Returns a dict with column names as keys and concatenated text as values.
    """
    columns = {col: [] for col in COLUMNS}

    for word in line_words:
        col = classify_word(word['x0'])
        if col:
            columns[col].append(word['text'])

    return {col: ' '.join(words).strip() for col, words in columns.items()}


def clean_price(price_str):
    """
    Convert price string to integer.
    "$ 105.950" → 105950
    "$ 1.189.900" → 1189900
    "$ 8 9.990" → 89990 (handles space-split prices)
    """
    if not price_str:
        return 0

    # Remove $, spaces, and dots (thousand separators)
    cleaned = PRICE_CLEAN_PATTERN.sub('', price_str)

    try:
        return int(cleaned)
    except ValueError:
        return 0


def is_header_line(columns):
    """Check if a line is a header row (CODIGO, REF. OEM, etc.)"""
    codigo = columns.get('codigo', '').upper()
    return 'CODIGO' in codigo or 'CÓDIGO' in codigo


def is_title_line(columns):
    """Check if a line is a page title (e.g., TOYOTA, MARZO 27)"""
    all_text = ' '.join(v for v in columns.values() if v).strip().upper()
    return all_text in ('TOYOTA', '') or 'MARZO' in all_text


def parse_pdf(pdf_path, page_start=None, page_end=None):
    """
    Main parsing function. Extracts all products from the PDF catalog.
    Supports optional page range for batch processing.
    Returns a list of product dictionaries.
    """
    products = []
    current_product = None

    with pdfplumber.open(pdf_path) as pdf:
        total_pages = len(pdf.pages)

        start = page_start if page_start is not None else 0
        end = min(page_end + 1, total_pages) if page_end is not None else total_pages

        for page_num in range(start, end):
            page = pdf.pages[page_num]
            words = page.extract_words()
            if not words:
                continue

            lines = group_words_by_line(words)

            for line_words in lines:
                columns = parse_line_to_columns(line_words)

                # Skip headers and title lines
                if is_header_line(columns) or is_title_line(columns):
                    continue

                codigo = columns.get('codigo', '').strip()

                # Check if this line starts a new product row
                if NEW_ROW_PATTERN.match(codigo):
                    # Save the previous product if it exists
                    if current_product and current_product['codigo']:
                        products.append(finalize_product(current_product))

                    # Start a new product
                    current_product = {
                        'codigo': codigo,
                        'ref_oem': columns.get('ref_oem', '').strip(),
                        'ref_fabrica': columns.get('ref_fabrica', '').strip() or None,
                        'descripcion': columns.get('descripcion', '').strip(),
                        'marca': columns.get('marca', '').strip(),
                        'precio_raw': columns.get('precio', '').strip(),
                    }
                elif current_product:
                    # Continuation line — append to current product's description
                    desc_part = columns.get('descripcion', '').strip()
                    if desc_part:
                        current_product['descripcion'] += ' ' + desc_part

                    # Sometimes ref_oem or ref_fabrica spill to continuation lines
                    ref_oem_part = columns.get('ref_oem', '').strip()
                    if ref_oem_part and not current_product['ref_oem']:
                        current_product['ref_oem'] = ref_oem_part

                    ref_fab_part = columns.get('ref_fabrica', '').strip()
                    if ref_fab_part and not current_product['ref_fabrica']:
                        current_product['ref_fabrica'] = ref_fab_part

                    # Sometimes marca appears on continuation line
                    marca_part = columns.get('marca', '').strip()
                    if marca_part and not current_product['marca']:
                        current_product['marca'] = marca_part

                    # Price on continuation line (when description wraps)
                    price_part = columns.get('precio', '').strip()
                    if price_part and not current_product['precio_raw']:
                        current_product['precio_raw'] = price_part

            # Progress to stderr for real-time tracking
            print(f"PROGRESS:{page_num - start + 1}/{end - start}", file=sys.stderr, flush=True)

        # Don't forget the last product
        if current_product and current_product['codigo']:
            products.append(finalize_product(current_product))

    return products


def finalize_product(product):
    """Clean and finalize a product record."""
    # Clean marca: remove any $ signs or price fragments that bled into marca column
    raw_marca = (product.get('marca') or '').strip()
    cleaned_marca = raw_marca.replace('$', '').strip()
    # Remove trailing price-like fragments from marca (e.g., "GSP $" → "GSP")
    cleaned_marca = re.sub(r'\s*\$\s*$', '', cleaned_marca).strip()
    
    # Clean description: remove marca if it accidentally appears at the end
    raw_desc = ' '.join(product.get('descripcion', '').split())
    if cleaned_marca and raw_desc.endswith(cleaned_marca):
        raw_desc = raw_desc[:-len(cleaned_marca)].strip()
    
    return {
        'codigo': product['codigo'].strip(),
        'ref_oem': (product.get('ref_oem') or '').strip() or None,
        'ref_fabrica': product.get('ref_fabrica'),
        'descripcion': raw_desc,
        'marca': cleaned_marca or None,
        'precio_base': clean_price(product.get('precio_raw', '')),
    }


def get_page_count(pdf_path):
    """Return the total number of pages without parsing content."""
    with pdfplumber.open(pdf_path) as pdf:
        return len(pdf.pages)


def main():
    if len(sys.argv) < 2:
        print(json.dumps({'error': 'Usage: python parse_catalog_pdf.py <pdf_path> [--page-range START END] [--page-count]'}))
        sys.exit(1)

    pdf_path = sys.argv[1]

    # --page-count mode: just return the number of pages
    if '--page-count' in sys.argv:
        try:
            count = get_page_count(pdf_path)
            print(json.dumps({'pageCount': count}))
        except Exception as e:
            print(json.dumps({'error': str(e)}))
            sys.exit(1)
        return

    # Parse --page-range arguments
    page_start = None
    page_end = None
    if '--page-range' in sys.argv:
        idx = sys.argv.index('--page-range')
        if idx + 2 < len(sys.argv):
            page_start = int(sys.argv[idx + 1])
            page_end = int(sys.argv[idx + 2])

    try:
        products = parse_pdf(pdf_path, page_start, page_end)
        print(json.dumps(products, ensure_ascii=False))
    except Exception as e:
        print(json.dumps({'error': str(e)}))
        sys.exit(1)


if __name__ == '__main__':
    main()

