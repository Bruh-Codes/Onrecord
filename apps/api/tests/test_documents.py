import hashlib
import uuid

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
