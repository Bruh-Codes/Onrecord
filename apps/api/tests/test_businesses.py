import uuid

from tests.conftest import bearer_header


async def test_create_and_get_business(client):
    owner_id = uuid.uuid4()
    headers = bearer_header(role="admin", user_id=owner_id)

    create_resp = await client.post(
        "/v1/businesses",
        json={"legal_name": "Adom Provisions Ltd", "entity_type": "ltd", "premises_status": "rented"},
        headers=headers,
    )
    assert create_resp.status_code == 201
    body = create_resp.json()
    assert body["legal_name"] == "Adom Provisions Ltd"
    assert body["premises_status"] == {"value": "rented", "kind": "declared"}

    business_id = body["id"]
    owner_headers = bearer_header(role="owner", user_id=owner_id, business_id=uuid.UUID(business_id))
    get_resp = await client.get(f"/v1/businesses/{business_id}", headers=owner_headers)
    assert get_resp.status_code == 200
    assert get_resp.json()["id"] == business_id


async def test_owner_cannot_access_other_business(client):
    admin_headers = bearer_header(role="admin", user_id=uuid.uuid4())
    create_resp = await client.post(
        "/v1/businesses",
        json={"legal_name": "Other Business", "entity_type": "sole_prop"},
        headers=admin_headers,
    )
    business_id = create_resp.json()["id"]

    owner_headers = bearer_header(role="owner", user_id=uuid.uuid4(), business_id=uuid.uuid4())
    resp = await client.get(f"/v1/businesses/{business_id}", headers=owner_headers)
    assert resp.status_code == 403
    assert resp.json()["error"]["code"] == "FORBIDDEN"


async def test_get_missing_business_returns_404(client):
    headers = bearer_header(role="admin", user_id=uuid.uuid4())
    resp = await client.get(f"/v1/businesses/{uuid.uuid4()}", headers=headers)
    assert resp.status_code == 404
    assert resp.json()["error"]["code"] == "BUSINESS_NOT_FOUND"


async def test_request_without_token_is_unauthorized(client):
    resp = await client.get(f"/v1/businesses/{uuid.uuid4()}")
    assert resp.status_code == 401
