"""Explicit, idempotent fictional fixtures in owner-isolated demo businesses."""
import json
from datetime import date
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert

from app.db import uuid7
from app.models.access import BusinessAccess
from app.models.agriculture import CycleStage, Enterprise, FarmEntry, FarmKind, FarmType, ProductionCycle
from app.models.business import Business
from app.models.enums import EntityType, Role
from app.services.farm_records import now


def pesewas(value: str) -> int:
    whole, fraction = value.split(".")
    if len(fraction) != 2 or not whole.isdigit() or not fraction.isdigit():
        raise ValueError("Fixture money must contain exactly two decimal places.")
    return int(whole) * 100 + int(fraction)


async def seed_demo(session, user_id):
    fixture = json.loads((Path(__file__).parents[1] / "fixtures" / "farmers.json").read_text())
    businesses = []
    for sample in fixture["businesses"]:
        key = f"{user_id}:{sample['external_id']}"
        await session.execute(insert(Business).values(
            id=uuid7(), legal_name=sample["name"], entity_type=EntityType.SOLE_PROP, region=sample["region"],
            is_demo=True, demo_seed_key=key,
        ).on_conflict_do_nothing(index_elements=[Business.demo_seed_key]))
        business = await session.scalar(select(Business).where(Business.demo_seed_key == key))
        await session.execute(insert(BusinessAccess).values(
            id=uuid7(), business_id=business.id, user_id=user_id, role=Role.OWNER,
        ).on_conflict_do_nothing(index_elements=[BusinessAccess.business_id, BusinessAccess.user_id]))
        for farm in sample["enterprises"]:
            metadata = {}
            cycle_data = farm["production_cycle"]
            if cycle_data.get("area_acres"):
                metadata = {"area": cycle_data["area_acres"], "area_unit": "acres"}
            await session.execute(insert(Enterprise).values(
                id=uuid7(), business_id=business.id, external_key=farm["external_id"], name=farm["name"],
                type=FarmType(farm["type"]), subtype=farm["subtype"], region=sample["region"], metadata_json=metadata,
            ).on_conflict_do_nothing(constraint="uq_enterprise_seed"))
            enterprise = await session.scalar(select(Enterprise).where(Enterprise.business_id == business.id, Enterprise.external_key == farm["external_id"]))
            await session.execute(insert(ProductionCycle).values(
                id=uuid7(), business_id=business.id, enterprise_id=enterprise.id,
                external_key=cycle_data["external_id"], name=cycle_data["name"],
                start_date=date.fromisoformat(cycle_data["start_date"]),
                end_date=date.fromisoformat(cycle_data["end_date"]) if cycle_data["end_date"] else None,
                stage=CycleStage.COMPLETED if cycle_data["end_date"] else CycleStage.ACTIVE,
                metadata_json={k: cycle_data[k] for k in ("batch_size", "pond_count") if k in cycle_data},
            ).on_conflict_do_nothing(constraint="uq_cycle_seed"))
            cycle = await session.scalar(select(ProductionCycle).where(ProductionCycle.business_id == business.id, ProductionCycle.external_key == cycle_data["external_id"]))
            for index, transaction in enumerate(farm["transactions"]):
                await add_entry(session, user_id, business.id, transaction, f"{farm['external_id']}:{index}", enterprise.id, cycle.id)
        for index, transaction in enumerate(sample.get("shared_overhead", [])):
            await add_entry(session, user_id, business.id, transaction, f"shared:{index}")
        businesses.append(business)
    return businesses


async def add_entry(session, user_id, business_id, transaction, key, enterprise_id=None, cycle_id=None):
    # The fixture supplies no receipt bytes. A marker cannot become an attachment.
    await session.execute(insert(FarmEntry).values(
        id=uuid7(), business_id=business_id, enterprise_id=enterprise_id, cycle_id=cycle_id,
        shared_overhead=enterprise_id is None, kind=FarmKind(transaction["kind"]),
        occurred_on=date.fromisoformat(transaction["date"]), amount_pesewas=pesewas(transaction["amount_ghs"]),
        category=transaction["category"], description=transaction["description"],
        created_by=user_id, updated_at=now(), external_key=key,
    ).on_conflict_do_nothing(constraint="uq_entry_seed"))
