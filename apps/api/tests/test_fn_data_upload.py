import hashlib
import mimetypes
from pathlib import Path
import uuid

import pytest

# Reuse the helper to create a business from existing tests
from .test_documents import _create_business, bearer_header

# Mapping of file extensions to MIME types (fallback to mimetypes if unknown)
EXTENSION_MIME = {
    ".pdf": "application/pdf",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".heic": "image/heic",
    ".webp": "image/webp",
    ".csv": "text/csv",
    ".tsv": "text/tab-separated-values",
    ".txt": "text/plain",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".xls": "application/vnd.ms-excel",
    ".xlsm": "application/vnd.ms-excel",
    ".ods": "application/vnd.oasis.opendocument.spreadsheet",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xml": "application/xml",
}


@pytest.mark.asyncio
async def test_fn_data_upload_and_extraction(client, monkeypatch):
    """Upload every fixture in the fn-data directory, run extraction, and verify.

    The test ensures that:
    * Upload URLs work for all supported fixture types.
    * The background ingestion task can be executed synchronously.
    * After ingestion the document status is ``EXTRACTED``.
    * No extraction error is recorded in quality flags.
    * For financial‑statement‑type files the API returns at least one
      ``financial_statement`` entry.
    """

    # Create a business (admin + owner headers) – same pattern used in other tests.
    admin_owner_id = uuid.uuid4()
    admin_headers = bearer_header(role="admin", user_id=admin_owner_id)
    business_id = await _create_business(client, admin_headers)
    owner_headers = bearer_header(role="owner", user_id=admin_owner_id, business_id=uuid.UUID(business_id))

    # Resolve the fixtures directory relative to the repository root.
    repo_root = Path(__file__).resolve().parents[2]
    fixtures_dir = repo_root / "fn-data" / "fixtures"
    assert fixtures_dir.is_dir(), f"Fixtures directory not found: {fixtures_dir}"

    # Patch the Celery task so it runs synchronously.
    from app.workers.tasks import s1_ingest
    monkeypatch.setattr(s1_ingest, "delay", lambda doc_id: s1_ingest.run(doc_id))

    # Iterate over all files in the fixtures hierarchy.
    for file_path in fixtures_dir.rglob("*.*"):
        if file_path.is_dir():
            continue
        data = file_path.read_bytes()
        sha256 = hashlib.sha256(data).hexdigest()
        size = len(data)
        ext = file_path.suffix.lower()
        mime = EXTENSION_MIME.get(ext) or mimetypes.guess_type(str(file_path))[0]
        assert mime, f"Unable to determine MIME type for {file_path}"

        # Create the document record and obtain an upload URL.
        create_resp = await client.post(
            f"/v1/businesses/{business_id}/documents",
            json={
                "filename": file_path.name,
                "mime": mime,
                "size_bytes": size,
                "sha256": sha256,
            },
            headers=owner_headers,
        )
        assert create_resp.status_code == 201, f"Failed to create document for {file_path}: {create_resp.text}"
        payload = create_resp.json()
        document_id = payload["document_id"]
        upload_url = payload["upload_url"]

        # Perform the actual upload via the presigned URL.
        upload_resp = await client.put(
            upload_url,
            content=data,
            headers={"Content-Type": mime},
        )
        assert upload_resp.status_code in (200, 201, 204), f"Upload failed for {file_path}: {upload_resp.text}"

        # Signal that the upload is complete – this enqueues the ingestion task.
        complete_resp = await client.post(
            f"/v1/documents/{document_id}/complete",
            headers=owner_headers,
        )
        assert complete_resp.status_code == 202, f"Complete failed for {file_path}: {complete_resp.text}"

        # Retrieve the document details after ingestion.
        detail_resp = await client.get(
            f"/v1/documents/{document_id}",
            headers=owner_headers,
        )
        assert detail_resp.status_code == 200, f"Detail fetch failed for {file_path}: {detail_resp.text}"
        doc = detail_resp.json()

        # Basic sanity checks – the document should be marked extracted.
        assert doc["status"] == "extracted", f"Document not extracted for {file_path}: {doc["status"]}"
        # No extraction error should be present in quality flags.
        assert "extraction_error" not in (doc.get("quality_flags") or {}), f"Extraction error reported for {file_path}"

        # For files that are likely financial statements, verify that a statement is present.
        if ext in {".xlsx", ".xml"}:
            # ``financial_statements`` is a list; it should contain at least one entry.
            assert isinstance(doc.get("financial_statements"), list), "financial_statements missing"
            assert len(doc["financial_statements"]) > 0, f"No financial statements extracted for {file_path}"

        # For image‑based receipts or invoices we expect an ``invoice`` field.
        if ext in {".pdf", ".jpg", ".jpeg", ".png", ".heic", ".webp"}:
            # The API may return an ``invoice`` object or an empty list of statements.
            # At minimum the ``doc_type`` should be identified.
            assert doc.get("doc_type") is not None, f"Document type not identified for {file_path}"

    # If we reach this point all fixtures have been uploaded and processed without errors.
    # The test will succeed, providing evidence for the goal.

