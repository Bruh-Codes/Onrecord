import os
import time
import uuid
from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.config import get_settings

_settings = get_settings()

engine = create_async_engine(_settings.database_url, pool_pre_ping=True)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    async with SessionLocal() as session:
        yield session


def uuid7() -> uuid.UUID:
    """UUIDv7: 48-bit millisecond timestamp prefix + random tail, so PK order
    matches insertion order (better index locality than random UUIDv4)."""
    ms = int(time.time() * 1000)
    ts_bytes = ms.to_bytes(6, "big")
    rand_bytes = os.urandom(10)
    b = bytearray(ts_bytes + rand_bytes)
    b[6] = (b[6] & 0x0F) | 0x70  # version 7
    b[8] = (b[8] & 0x3F) | 0x80  # variant RFC 4122
    return uuid.UUID(bytes=bytes(b))
