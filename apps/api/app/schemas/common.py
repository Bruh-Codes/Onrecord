from typing import Generic, Literal, TypeVar

from pydantic import BaseModel

T = TypeVar("T")


class Declared(BaseModel, Generic[T]):
    """Wraps a business attribute the owner stated rather than one read from a
    document-every response containing a figure carries its kind (specs/09-api.md §5)."""

    value: T
    kind: Literal["declared"] = "declared"


class Page(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    page_size: int
