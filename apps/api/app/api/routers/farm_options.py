from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import Claims, require_role, verify_token
from app.config import Settings, get_settings
from app.db import get_session
from app.errors import not_found
from app.schemas.business import BusinessDetail
from app.services.audit import write_audit_event
from app.services.farm_demo import seed_demo
from app.services.farm_taxonomy import OVERHEAD_CATEGORIES, TEMPLATES

router = APIRouter(prefix="/v1/agriculture", tags=["agriculture"])


def demo_enabled(settings):
    return settings.demo_mode_enabled and settings.environment in {"development", "test"}


@router.get("/options")
async def options(claims: Claims = Depends(verify_token), settings: Settings = Depends(get_settings)):
    return {"templates": TEMPLATES, "overhead_categories": OVERHEAD_CATEGORIES, "demo_enabled": demo_enabled(settings)}


@router.post("/demo")
async def demo(
    claims: Claims = Depends(require_role("owner")), session: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_settings),
):
    if not demo_enabled(settings):
        raise not_found("DEMO_DISABLED", "Demo fixtures are available only in explicitly enabled development/test environments.")
    businesses = await seed_demo(session, claims.user_id)
    await write_audit_event(session, business_id=None, actor=claims.user_id, action="farm.demo.import", target="demo-fixtures")
    await session.commit()
    return {"items": [BusinessDetail.from_model(row) for row in businesses], "fictional": True}
