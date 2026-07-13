#!/usr/bin/env python3
"""
Generic PDF Catalog Parser — Table Detection

Extracts structured product data from PDF catalogs by detecting tables
automatically using pdfplumber's table detection. Works with any tabular
layout, not just BDC/Toyota fixed-column formats.

Usage:
    python parse_catalog_generic.py <path_to_pdf>
    python parse_catalog_generic.py <path_to_pdf> --page-range 0 49
    python parse_catalog_generic.py <path_to_pdf> --page-count

Output:
    JSON array of products to stdout
"""

import sys
import json
import re
import pdfplumber


# Column name mapping — maps common header variations to standard field names
HEADER_MAP = {
    'codigo':       ['codigo', 'código', 'cod', 'cod.', 'code', 'ref', 'referencia', 'nro', 'numero', 'número', 'item'],
    'ref_oem':      ['ref. oem', 'ref oem', 'oem', 'ref original', 'referencia oem', 'original'],
    'ref_fabrica':  ['ref. fabrica', 'ref fabrica', 'ref. fábrica', 'fabrica', 'fábrica', 'manufacturer', 'ref fab'],
    'descripcion':  ['descripcion', 'descripción', 'description', 'desc', 'detalle', 'producto', 'nombre', 'articulo', 'artículo'],
    'marca':        ['marca', 'brand', 'fabricante', 'mca'],
    'precio':       ['precio', 'price', 'valor', 'pvp', 'p. venta', 'precio venta', 'venta', 'costo', '$'],
}

# Price cleaning pattern
PRICE_CLEAN = re.compile(r'[$\s.]')


def map_header(raw_header):
    """Map a raw column header string to a standard field name."""
    if not raw_header:
        return None
    clean = raw_header.strip().lower()
    for field, aliases in HEADER_MAP.items():
        for alias in aliases:
            if alias in clean:
                return field
    return None


def clean_price(price_str):
    """Convert price string to integer. '$ 105.950' → 105950"""
    if not price_str:
        return 0
    cleaned = PRICE_CLEAN.sub('', str(price_str))
    try:
        return int(cleaned)
    except ValueError:
        return 0


def detect_header_row(table):
    """
    Try to detect which row is the header row.
    Returns (header_row_index, column_mapping) or (None, None).
    """
    for i, row in enumerate(table[:5]):  # Check first 5 rows
        if not row:
            continue
        mapped = {}
        for j, cell in enumerate(row):
            field = map_header(cell)
            if field:
                mapped[field] = j

        # Need at least 'codigo' or 'descripcion' to consider it a header
        if 'codigo' in mapped or 'descripcion' in mapped:
            return i, mapped

    return None, None


def extract_products_from_table(table, column_mapping, header_row_idx):
    """Extract product rows from a table using the detected column mapping."""
    products = []
    data_rows = table[header_row_idx + 1:]

    for row in data_rows:
        if not row or all(cell is None or str(cell).strip() == '' for cell in row):
            continue

        product = {}

        for field, col_idx in column_mapping.items():
            if col_idx < len(row):
                val = row[col_idx]
                product[field] = str(val).strip() if val else ''

        # Must have at least a code or description
        if not product.get('codigo') and not product.get('descripcion'):
            continue

        # Finalize
        products.append({
            'codigo': (product.get('codigo') or '').strip().upper(),
            'ref_oem': product.get('ref_oem', '').strip() or None,
            'ref_fabrica': product.get('ref_fabrica', '').strip() or None,
            'descripcion': ' '.join((product.get('descripcion') or '').split()),
            'marca': (product.get('marca') or '').strip() or None,
            'precio_base': clean_price(product.get('precio', '')),
        })

    return products


def parse_pdf(pdf_path, page_start=None, page_end=None):
    """
    Main parsing function. Extracts products by detecting tables.
    Returns a list of product dictionaries.
    """
    products = []

    with pdfplumber.open(pdf_path) as pdf:
        total_pages = len(pdf.pages)

        start = page_start if page_start is not None else 0
        end = min(page_end + 1, total_pages) if page_end is not None else total_pages

        for page_num in range(start, end):
            page = pdf.pages[page_num]

            # Try to extract tables from the page
            tables = page.extract_tables()

            if not tables:
                continue

            for table in tables:
                if not table or len(table) < 2:
                    continue

                header_idx, col_map = detect_header_row(table)

                if header_idx is not None and col_map:
                    page_products = extract_products_from_table(table, col_map, header_idx)
                    products.extend(page_products)

            # Progress to stderr
            print(f"PROGRESS:{page_num - start + 1}/{end - start}", file=sys.stderr, flush=True)

    return products


def get_page_count(pdf_path):
    """Return the total number of pages without parsing."""
    with pdfplumber.open(pdf_path) as pdf:
        return len(pdf.pages)


def main():
    if len(sys.argv) < 2:
        print(json.dumps({'error': 'Usage: python parse_catalog_generic.py <pdf_path> [--page-range START END] [--page-count]'}))
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
