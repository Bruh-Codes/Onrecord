from app.pipeline.s3_invoice import _validated_invoice


def _field(value: str, source_ref: str = "text:1") -> dict:
    return {"value": value, "raw_value": value, "source_label": "model label", "source_ref": source_ref, "page": 1, "confidence": 0.95}


def test_model_invoice_payload_maps_canonical_fields_and_extra_fields() -> None:
    payload = {
        "fields": {
            "supplier": _field("Cloudflare, Inc."),
            "invoice_number": _field("CF-1007"),
            "invoice_date": _field("01 Sep 2026"),
            "due_date": _field("15 Sep 2026"),
            "currency": _field("USD"),
            "subtotal": _field("100.00"),
            "tax": _field("18.00"),
            "total": _field("118.00"),
            "payment_status": _field("unpaid"),
        },
        "line_items": [],
        "extra_fields": [{"label": "purchase_order", "value": "PO-9", "source_ref": "text:2", "page": 1}],
    }
    parsed = _validated_invoice(payload)
    assert parsed.get("supplier").value == "Cloudflare, Inc."
    assert parsed.get("total").value["amount_pesewas"] == 11800
    assert parsed.extra_fields["purchase_order"] == "PO-9"
    assert parsed.validation_issues == []


def test_model_invoice_payload_allows_missing_optional_fields() -> None:
    payload = {"fields": {"supplier": _field("Example Ltd")}, "line_items": [], "extra_fields": {}}
    parsed = _validated_invoice(payload)
    assert parsed.get("total") is None
    assert parsed.validation_issues == []
