# 01-S1 Ingest, S2 Classify

Modules: `app/pipeline/s1_ingest.py`, `app/pipeline/s2_classify.py`

---

## Stage contract (applies to every stage)

`app/pipeline/base.py`:

```python
class Stage(ABC):
    code: str                    # "S1"
    name: str                    # "ingest"

    @abstractmethod
    def input_hash(self, session, document_id: UUID) -> str:
        """Hash of everything this stage reads. Changing it forces a re-run."""

    @abstractmethod
    def run(self, session, document_id: UUID) -> StageResult:
        """Read state from DB, do work, write result, advance status."""

class StageResult(BaseModel):
    status: Literal["ok", "needs_review", "failed"]
    advance_to: DocStatus | None
    gaps: list[GapDraft] = []
    detail: dict = {}
```

The runner writes a `stage_run` row `(document_id, stage, input_hash, status,
started_at, finished_at, error)` and skips execution if a row with the same
`(document_id, stage, input_hash)` already exists with `status='ok'`.

A stage MUST NOT accept data from the previous stage as an argument. `document_id`
is the only input.

---

## S1-Ingest

### Accepts

PDF, JPEG, PNG, HEIC, CSV, XLSX. Max 25 MB per file, 50 files per batch.

### Steps

1. **Client-side pre-upload** (`web/`): downscale images to ≤2000 px on the long
   edge before upload. Users are on metered mobile data. Preserve the original
   when connection quality allows (`navigator.connection.effectiveType` is `4g`).

2. **Virus scan.** ClamAV via `services/scan`. Infected → `status=failed`, no
   storage retention.

3. **Hash + dedupe.**
   - `sha256` of the raw bytes.
   - Existing `(business_id, sha256)` → reject with `AppError("DUPLICATE_DOCUMENT")`.
   - Existing `sha256` on a _different_ business → accept, but set
     `quality_flags.cross_business_reuse = true` and raise a `gap` of kind
     `inconsistency`, code `DOCUMENT_REUSED_ACROSS_BUSINESSES`, severity `blocker`.
     Never auto-clear this flag.

4. **PDF metadata inspection.** Read `/Producer` and `/Creator`. If a document
   classified later as `bank_statement` or `momo_statement` was produced by a word
   processor or image editor (`Microsoft Word`, `LibreOffice`, `Photoshop`,
   `Canva`), set `flags.suspect` on the document and raise
   `SUSPECT_DOCUMENT_PRODUCER`. This is a signal, not a verdict.

5. **Page split and render.**
   - PDFs: split with `pypdf`, render each page to PNG at 300 DPI equivalent.
   - Use `pdf-inspector` to classify each page as text-based or image-heavy.
     Store the per-page verdict on `document.quality_flags.pages[i].text_layer`.
     This drives S3 tier selection. A mixed document (digital pages plus a
     scanned insert) MUST route per page, not per document.
   - Images: EXIF orientation fix, deskew and perspective-correct with OpenCV
     (`cv2.minAreaRect` on the largest contour), de-glare via CLAHE on the L
     channel.
   - HEIC: convert to PNG via `pillow-heif`.

6. **Quality flags.**
   - `blurry`: variance of Laplacian < 100 on the rendered page.
   - `glare`: >2% of pixels at value 250+ in a contiguous blob.
   - `cropped`: the detected document quadrilateral touches the image border on
     ≥2 sides.
   - `partial_page`: OCR-free heuristic-detected text bounding box covers <40%
     of expected page height for a statement-like aspect ratio.

7. **Short-circuit.** If `blurry` or `cropped`, set `status=received`, do NOT
   advance to S2, and raise a `gap` of kind `missing_document`, code
   `RECAPTURE_REQUIRED`, with `target_ref = {"document_id": ...}`. Burning an
   extraction call on an unreadable page is waste.

8. **Store.** Original and page renders to object storage under
   `{business_id}/{document_id}/original.{ext}` and `.../page-{n}.png`.
   Server-side encryption required.

### Output

`document.status = 'received'`, `page_count`, `quality_flags`, `storage_key`.

### Tests

- `tests/pipeline/test_s1_dedupe.py`: same bytes twice → second rejected.
- Cross-business reuse raises a blocker gap.
- A Word-produced "bank statement" PDF sets `suspect`.
- A deliberately blurred golden image short-circuits and does not reach S2.

---

## S2-Classify

Determines `doc_type`, `issuer`, `period_start`, `period_end`.

### Two passes

**Pass 1-heuristics (free, run first).**

- Filename tokens: `statement`, `momo`, `invoice`, `receipt`, `cert`.
- Embedded PDF text layer (where present) keyword match against an issuer
  fingerprint table in `app/rules/issuers.yaml`: MTN MoMo statement headers,
  each bank's statement header strings, GRA e-VAT invoice markers
  (`digital signature`, `VSDC`, QR presence), ORC certificate titles.
- Period extraction by regex against known statement header formats.

If pass 1 yields `doc_type_confidence >= 0.90`, stop.

**Pass 2-vision classification.**
Single call with the first page render. Structured output:

```python
class ClassificationResult(BaseModel):
    doc_type: DocType
    confidence: float                 # 0..1
    issuer: Provider | None
    period_start: date | None
    period_end: date | None
    reason: str                       # one line, for the reviewer
```

The prompt MUST instruct: return `null` for any field not legible; do not infer a
period from context; do not guess an issuer from styling alone.

### Confidence handling

| `doc_type_confidence` | Action                                                                                                                                                                                         |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ≥ 0.75                | Advance to S3                                                                                                                                                                                  |
| < 0.75                | Set `status=classified`, raise `gap` code `CONFIRM_DOCUMENT_TYPE`, severity `minor`. The owner is asked "Is this a bank statement?" via the agent or the upload UI. Do not proceed on a guess. |

### GRA e-VAT detection

If a document classified as `invoice_received` or `invoice_issued` contains a QR
code (`pyzbar` decode on the page render) plus a GRA VSDC marker, set
`extraction` field `evat_verifiable = true`. This raises the verifiability pillar
in S8. MVP does not verify the QR against GRA-it records that it is verifiable.

### Output

`document.status = 'classified'`, `doc_type`, `doc_type_confidence`, `issuer`,
`period_start`, `period_end`.

### Tests

- Golden corpus: ≥95% top-1 `doc_type` accuracy across the 12 types.
- A statement whose header is cropped away returns `period_start=None` rather than
  a hallucinated date.
