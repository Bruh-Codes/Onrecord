"""Local-dev object storage receiver.

The S3StorageBackend presigns a PUT on the object store directly, so the API
never sees upload bytes in production. The LocalStorageBackend (used when
storage_bucket is unset) points the client at this API-internal route instead,
which persists bytes to local disk. This keeps the entire upload→S1 flow
runnable without any S3 dependency (Agent.md §4: storage behind an
interface)."""

from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Request

from app.config import Settings, get_settings

router = APIRouter(tags=["internal"])


def _storage_root(settings: Settings) -> Path:
    root = Path(settings.local_storage_dir) if settings.local_storage_dir else Path("var/storage")
    root.mkdir(parents=True, exist_ok=True)
    return root


@router.put("/internal/storage/{storage_key:path}")
async def receive_locally(
    storage_key: str,
    request: Request,
    settings: Settings = Depends(get_settings),
) -> None:
    if settings.storage_bucket:
        raise HTTPException(status_code=404, detail="Storage is externally backed; this route is disabled.")

    key = storage_key.replace("\\", "/").lstrip("/")
    target = _storage_root(settings).joinpath(key)
    if target.parent != _storage_root(settings) and not target.resolve().is_relative_to(_storage_root(settings).resolve()):
        raise HTTPException(status_code=400, detail="Invalid storage key.")

    data = await request.body()
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data)
    return None