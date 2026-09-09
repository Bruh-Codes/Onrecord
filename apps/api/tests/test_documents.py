import hashlib
import uuid
from decimal import Decimal
from types import SimpleNamespace

from app.api.routers.documents import _financial_statements

from tests.conftest import bearer_header


async def _create_business(client, admin_headers) -> str:
    resp = await client.post(
        "/v1/businesses",
        json={"legal_name": "Kofi's Textiles", "entity_type": "sole_prop"},
        headers=admin_headers,
    )
    return resp.json()["id"]


async def test_create_document_returns_upload_target(client):
    owner_id = uuid.uuid4()
    admin_headers = bearer_header(role="admin", user_id=owner_id)
    business_id = await _create_business(client, admin_headers)
    owner_headers = bearer_header(role="owner", user_id=owner_id, business_id=uuid.UUID(business_id))

    sha256 = hashlib.sha256(b"fake-statement").hexdigest()
    resp = await client.post(
        f"/v1/businesses/{business_id}/documents",
        json={"filename": "momo.pdf", "mime": "application/pdf", "size_bytes": 1024, "sha256": sha256},
        headers=owner_headers,
    )
    assert resp.status_code == 201
    body = resp.json()
    assert "upload_url" in body
    assert body["document_id"]


async def test_complete_document_enqueues_ingest(client, monkeypatch):
    from app.workers.tasks import s1_ingest

    owner_id = uuid.uuid4()
    admin_headers = bearer_header(role="admin", user_id=owner_id)
    business_id = await _create_business(client, admin_headers)
    owner_headers = bearer_header(role="owner", user_id=owner_id, business_id=uuid.UUID(business_id))
    create_response = await client.post(
        f"/v1/businesses/{business_id}/documents",
        json={
            "filename": "momo.pdf",
            "mime": "application/pdf",
            "size_bytes": 1024,
            "sha256": hashlib.sha256(b"queued-statement").hexdigest(),
        },
        headers=owner_headers,
    )
    document_id = create_response.json()["document_id"]
    enqueued: list[str] = []
    monkeypatch.setattr(s1_ingest, "delay", enqueued.append)

    response = await client.post(f"/v1/documents/{document_id}/complete", headers=owner_headers)

    assert response.status_code == 202
    assert response.json() == {"status": "received"}
    assert enqueued == [document_id]


async def test_duplicate_sha256_is_rejected(client):
    owner_id = uuid.uuid4()
    admin_headers = bearer_header(role="admin", user_id=owner_id)
    business_id = await _create_business(client, admin_headers)
    owner_headers = bearer_header(role="owner", user_id=owner_id, business_id=uuid.UUID(business_id))

    sha256 = hashlib.sha256(b"same-file").hexdigest()
    payload = {"filename": "a.pdf", "mime": "application/pdf", "size_bytes": 10, "sha256": sha256}

    first = await client.post(f"/v1/businesses/{business_id}/documents", json=payload, headers=owner_headers)
    assert first.status_code == 201

    second = await client.post(f"/v1/businesses/{business_id}/documents", json=payload, headers=owner_headers)
    assert second.status_code == 409
    assert second.json()["error"]["code"] == "DUPLICATE_DOCUMENT"


async def test_deleted_document_can_be_uploaded_again(client):
    owner_id = uuid.uuid4()
    admin_headers = bearer_header(role="admin", user_id=owner_id)
    business_id = await _create_business(client, admin_headers)
    owner_headers = bearer_header(role="owner", user_id=owner_id, business_id=uuid.UUID(business_id))
    payload = {
        "filename": "replacement.pdf",
        "mime": "application/pdf",
        "size_bytes": 10,
        "sha256": hashlib.sha256(b"replacement-file").hexdigest(),
    }

    first = await client.post(f"/v1/businesses/{business_id}/documents", json=payload, headers=owner_headers)
    assert first.status_code == 201

    deleted = await client.delete(f"/v1/documents/{first.json()['document_id']}", headers=owner_headers)
    assert deleted.status_code == 204

    deleted_id = first.json()["document_id"]
    listed = await client.get(f"/v1/businesses/{business_id}/documents", headers=owner_headers)
    assert listed.status_code == 200
    assert deleted_id not in {item["id"] for item in listed.json()["items"]}
    hidden = await client.get(f"/v1/documents/{deleted_id}", headers=owner_headers)
    assert hidden.status_code == 404

    replacement = await client.post(f"/v1/businesses/{business_id}/documents", json=payload, headers=owner_headers)
    assert replacement.status_code == 201


async def test_replace_document_reuses_its_file_hash(client):
    owner_id = uuid.uuid4()
    admin_headers = bearer_header(role="admin", user_id=owner_id)
    business_id = await _create_business(client, admin_headers)
    owner_headers = bearer_header(role="owner", user_id=owner_id, business_id=uuid.UUID(business_id))
    payload = {
        "filename": "replacement.pdf",
        "mime": "application/pdf",
        "size_bytes": 10,
        "sha256": hashlib.sha256(b"same-file-replacement").hexdigest(),
    }

    first = await client.post(f"/v1/businesses/{business_id}/documents", json=payload, headers=owner_headers)
    assert first.status_code == 201

    replacement = await client.post(
        f"/v1/businesses/{business_id}/documents",
        json={**payload, "replace_document_id": first.json()["document_id"]},
        headers=owner_headers,
    )
    assert replacement.status_code == 201


async def test_file_too_large_is_rejected(client):
    owner_id = uuid.uuid4()
    admin_headers = bearer_header(role="admin", user_id=owner_id)
    business_id = await _create_business(client, admin_headers)
    owner_headers = bearer_header(role="owner", user_id=owner_id, business_id=uuid.UUID(business_id))

    resp = await client.post(
        f"/v1/businesses/{business_id}/documents",
        json={
            "filename": "huge.pdf",
            "mime": "application/pdf",
            "size_bytes": 999_999_999,
            "sha256": hashlib.sha256(b"huge").hexdigest(),
        },
        headers=owner_headers,
    )
    assert resp.status_code == 413
    assert resp.json()["error"]["code"] == "FILE_TOO_LARGE"


async def test_list_documents_is_paginated(client):
    owner_id = uuid.uuid4()
    admin_headers = bearer_header(role="admin", user_id=owner_id)
    business_id = await _create_business(client, admin_headers)
    owner_headers = bearer_header(role="owner", user_id=owner_id, business_id=uuid.UUID(business_id))

    for i in range(3):
        await client.post(
            f"/v1/businesses/{business_id}/documents",
            json={
                "filename": f"doc{i}.pdf",
                "mime": "application/pdf",
                "size_bytes": 10,
                "sha256": hashlib.sha256(f"doc{i}".encode()).hexdigest(),
            },
            headers=owner_headers,
        )

    resp = await client.get(f"/v1/businesses/{business_id}/documents?page=1&page_size=2", headers=owner_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 3
    assert len(body["items"]) == 2
    assert body["page"] == 1
    assert body["page_size"] == 2


def test_document_detail_groups_dynamic_statement_values():
    document = SimpleNamespace(quality_flags={"financial_statements": [{
        "statement_index": 0,
        "statement_type": "income_statement",
        "periods": ["2025"],
        "currency": "GHS",
        "scale": 1,
        "validation_issues": [],
    }]})
    extraction_id = uuid.uuid4()
    rows = [SimpleNamespace(
        id=extraction_id,
        field_path="financial_statements[0].line_items[0].values[0]",
        value_json={
            "label": "Unusual but printed item",
            "section": "Other income",
            "depth": 1,
            "is_total": False,
            "period": "2025",
            "value_pesewas": 12_345,
            "raw_value": "123.45",
            "kind": "extracted",
            "canonical_concept": None,
            "mapping_confidence": None,
            "mapping_method": None,
        },
        page=3,
        bbox={"l": 1, "t": 2, "r": 3, "b": 4},
        confidence=Decimal("0.85"),
    )]

    statements = _financial_statements(document, rows)

    assert statements[0].values[0].label == "Unusual but printed item"
    assert statements[0].values[0].value_pesewas == 12_345
    assert statements[0].values[0].extraction_id == extraction_id
