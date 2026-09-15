# Synthetic financial fixtures

Run `python generate_financial_fixtures.py` to regenerate 20 deterministic, synthetic statements. The fixtures intentionally vary by platform-like schema, field names, nesting, ordering, visual layout, date formats, and sign conventions. They contain no real financial data. See `manifest.json` for the file inventory.

The generator needs `reportlab`, `openpyxl`, `Pillow`, and `pillow-heif`. If `pillow-heif` is unavailable, it still creates OCR-friendly `.heic`-named image fixtures using JPEG fallback bytes and records that limitation in the manifest. Install `pillow-heif` when true HEIC container validation is required.
