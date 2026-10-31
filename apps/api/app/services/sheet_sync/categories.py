"""Sort a sheet row into the same categories as records typed into OnRecord.

The owner's own category column wins when it names one of OnRecord's labels.
Otherwise plain keyword rules decide. Anything still unclear is left as
"unknown" so the existing AI pass in recompute and the classification review
queue handle it, exactly like statement rows (labels only, never amounts: INV-3).
"""

import re
from dataclasses import dataclass

from app.models.enums import CategorySource, Direction
from app.services.hand_entries import categories_for

AUTO_CONFIDENCE = 0.7


@dataclass(frozen=True)
class Category:
    label: str | None
    category_l1: str
    confidence: float
    source: CategorySource | None


# (pattern, label for money in, label for money out). None means "not for this direction".
_RULES: tuple[tuple[str, str | None, str | None], ...] = (
    (r"\bloan|\bborrow", "Loan received", "Loan repayment"),
    (r"\b(capital|owner|drawings?|personal|my own)\b", "Money you put in", "Money you took out"),
    (r"\b(tax|taxes|levy|levies|permit|licen[cs]e|gra|assembly|ecg prepaid tax)\b", None, "Taxes, levies and permits"),
    (r"\b(rent|rental|lease)\b", None, "Rent"),
    (r"\b(salary|salaries|wage|wages|labour|labor|worker|workers|staff|casual|apprentice)\b", None, "Wages and labour"),
    (r"\b(transport|fare|trotro|taxi|uber|bolt|delivery|okada|lorry|freight|shipping)\b", None, "Transport"),
    (r"\b(fuel|petrol|diesel|gas|ecg|electricity|power|light bill|water|gwcl)\b", None, "Fuel, water and power"),
    (r"\b(airtime|data|internet|phone|credit card top ?up|wifi|bundle)\b", None, "Phone and internet"),
    (r"\b(repair|repairs|maintenance|equipment|machine|tools?|spare parts?)\b", None, "Equipment and repairs"),
    (r"\b(packaging|packing|bags?|boxes|containers?|labels?)\b", None, "Packaging"),
    (r"\b(seeds?|seedlings?|fertili[sz]er|chemicals?|feed|agro|weedicide|pesticide)\b", None, "Farm inputs (seeds, fertiliser, feed)"),
    (r"\b(materials?|supplies|ingredients?|raw)\b", None, "Materials and supplies"),
    (r"\b(stock|restock|goods|purchase|purchases|bought|buying|inventory|wholesale)\b", None, "Stock or goods to resell"),
    (r"\b(service|services|fee|fees|repair job|labour charge|consult|haircut|styling|tailoring|sewing)\b", "Payment for a service", None),
    (r"\b(harvest|produce|crop|maize|tomato(es)?|cassava|yam|eggs?|birds?|poultry|fish|pig|goat|cattle)\b", "Farm produce or animal sales", None),
    (r"\b(sale|sales|sold|selling|customer|income|revenue)\b", "Sales of goods", None),
)


def _label_lookup(direction: Direction) -> dict[str, str]:
    return {label.lower(): label for label in categories_for(direction)}


def resolve(direction: Direction, category_text: str | None, description: str | None) -> Category:
    labels = categories_for(direction)
    if category_text:
        exact = _label_lookup(direction).get(" ".join(category_text.lower().split()))
        if exact:
            return Category(exact, labels[exact], 1.0, CategorySource.OWNER_STATED)
    for text, confidence in ((category_text, 0.9), (description, 0.75)):
        label = _rule_label(direction, text)
        if label:
            return Category(label, labels[label], confidence, CategorySource.RULE)
    return Category(None, "unknown", 0.0, None)


def _rule_label(direction: Direction, text: str | None) -> str | None:
    if not text:
        return None
    lowered = text.lower()
    for pattern, money_in, money_out in _RULES:
        label = money_in if direction == Direction.IN else money_out
        if label and re.search(pattern, lowered):
            return label
    return None
