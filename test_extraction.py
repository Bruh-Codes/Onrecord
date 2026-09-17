import sys
import os
from pathlib import Path

# Add app directory to path for imports
current_dir = Path.cwd()
if (current_dir / 'apps' / 'api').exists():
    api_dir = current_dir / 'apps' / 'api'
    # Use the venv python if available
    venv_python = api_dir / '.venv' / 'Scripts' / 'python.exe'
    if venv_python.exists():
        sys.path.insert(0, str(api_dir / '.venv' / 'Lib' / 'site-packages'))
    sys.path.insert(0, str(api_dir))
elif (current_dir / 'app').exists():
    sys.path.insert(0, str(current_dir))
else:
    # Fallback
    sys.path.insert(0, str(current_dir / '..' / 'apps' / 'api'))

from app.services.document_processing import DocumentProcessor
from app.pipeline.s2_classify import classify_document
from app.pipeline.s3_extract import parse_statement
from app.pipeline.s3_financial_statement import parse_financial_statement
from app.models.enums import DocType
import tempfile

# Handle both local and Railway deployment paths
if os.path.exists('fn-data/fixtures'):
    fixtures_dir = Path('fn-data/fixtures')
elif os.path.exists('apps/fn-data/fixtures'):
    fixtures_dir = Path('apps/fn-data/fixtures')
elif os.path.exists('../fn-data/fixtures'):
    fixtures_dir = Path('../fn-data/fixtures')
elif os.path.exists('../../fn-data/fixtures'):
    fixtures_dir = Path('../../fn-data/fixtures')
else:
    raise FileNotFoundError("Could not find fn-data/fixtures directory")
# Test specific files first
test_files = [
    fixtures_dir / 'gtbank_dummy_statement.xlsx',
    fixtures_dir / 'gtbank_dummy_statement.pdf',
    fixtures_dir / 'bank-statement-template-09.pdf',
    fixtures_dir / 'first_bank_statement.jpg'
]
# Filter to only test files that exist
test_files = [f for f in test_files if f.exists()]

if test_files:
    files = test_files
    print(f'Testing specific bank statement files: {len(files)}')
else:
    # Fallback to all files if test files not found
    files = sorted(fixtures_dir.rglob('*'))
    files = [f for f in files if f.is_file()]
    print(f'Testing all fixture files: {len(files)}')
print('='*60)

for f in files:
    rel = f.relative_to(fixtures_dir)
    suffix = f.suffix.lower()
    
    # Process via DocumentProcessor (same as s1_ingest)
    processor = DocumentProcessor()
    with tempfile.TemporaryDirectory() as tmpdir:
        # Copy file to temp dir with original name
        import shutil
        tmpfile = Path(tmpdir) / f.name
        shutil.copy2(f, tmpfile)
        
        # Process
        processed = processor.process(tmpfile)
        
        # Debug: print raw text for template file
        if 'template' in str(f).lower():
            print(f"  --- RAW TEXT (first 1000 chars) ---")
            print(f"  {processed.text[:1000]}")
            print(f"  --- TABLES: {len(processed.tables)} ---")
            for i, table in enumerate(processed.tables):
                print(f"  Table {i}: {len(table.cells)} cells")
            print(f"  --- END DEBUG ---")
        
        # Classify
        result = classify_document(processed.text, f.name, has_tables=bool(processed.tables))
        
        # Try to extract
        extracted_rows = []
        extracted_fields = []
        extraction_error = None
        
        try:
            if result.supported and result.doc_type in {
                DocType.BANK_STATEMENT,
                DocType.MOMO_STATEMENT,
                DocType.MOMO_MERCHANT_STATEMENT,
            }:
                extracted_rows, extraction_error = parse_statement(processed.text, processed.tables)
            elif result.supported and result.doc_type == DocType.FINANCIAL_STATEMENT:
                extracted_fields, extraction_error = parse_financial_statement(
                    processed.text, processed.tables,
                    structure_mapper=None,
                )
            elif result.supported and result.doc_type in {
                DocType.INVOICE_ISSUED,
                DocType.INVOICE_RECEIVED,
            }:
                try:
                    from app.pipeline.s3_invoice import extract_invoice
                    invoice = extract_invoice(processed)
                    if invoice:
                        extracted_fields = invoice.fields
                    else:
                        extraction_error = "Invoice extraction returned no data"
                except Exception as e:
                    extraction_error = f"Invoice extraction error: {str(e)}"
        except Exception as e:
            extraction_error = f"Extraction error: {str(e)}"
            extracted_rows = []
            extracted_fields = []
        
        # Build summary
        print(f'\n--- {rel} ---')
        print(f'  doc_type={result.doc_type.value} confidence={result.confidence:.2f} issuer={result.issuer}')
        print(f'  period_start={result.period_start} period_end={result.period_end}')
        print(f'  supported={result.supported} classifier={result.classifier}')
        
        if extraction_error:
            print(f'  extraction_error={extraction_error}')
        else:
            if extracted_rows:
                print(f'  parsed_rows={len(extracted_rows)}')
                for r in extracted_rows[:3]:
                    print(f'    -> {r.occurred_on} {r.description[:40]} {r.direction} {r.amount_pesewas}')
            if extracted_fields:
                print(f'  financial_fields={len(extracted_fields)}')
                for fld in extracted_fields[:3]:
                    print(f'    -> {fld.label}: {fld.value_pesewas} ({fld.canonical_concept})')
            if not extracted_rows and not extracted_fields and result.supported:
                print('  (no rows/fields extracted but supported - see review path)')

print('\n' + '='*60)
print('DONE')