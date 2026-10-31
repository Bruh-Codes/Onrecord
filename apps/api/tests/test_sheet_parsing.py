"""Reading bookkeeping spreadsheets: amounts, dates, column guesses and row identity."""
from datetime import date

from app.models.enums import CategorySource, Direction
from app.services.sheet_sync import categories
from app.services.sheet_sync.detect import mapping_problems, propose_mapping
from app.services.sheet_sync.parsing import (
    parse_amount,
    parse_date,
    parse_row,
    parse_rows,
)

TODAY = date(2026, 10, 31)


def test_amounts_are_read_into_signed_pesewas():
    assert parse_amount(1200) == 120000
    assert parse_amount(12.5) == 1250
    assert parse_amount(0.1 + 0.2) == 30
    assert parse_amount("GH₵ 1,200.00") == 120000
    assert parse_amount("GHS1,250.5") == 125050
    assert parse_amount("(50.00)") == -5000
    assert parse_amount("-75") == -7500
    assert parse_amount("200 cedis") == 20000
    assert parse_amount("abc") is None
    assert parse_amount("") is None
    assert parse_amount(True) is None


def test_dates_in_the_ways_people_type_them():
    assert parse_date(46296, today=TODAY) == date(2026, 10, 1)  # Sheets serial number
    assert parse_date("03/10/2026", today=TODAY) == date(2026, 10, 3)
    assert parse_date("03/10/2026", date_order="mdy", today=TODAY) == date(2026, 3, 10)
    assert parse_date("3rd Oct 2026", today=TODAY) == date(2026, 10, 3)
    assert parse_date("2026-10-03", today=TODAY) == date(2026, 10, 3)
    assert parse_date("3-Oct-26", today=TODAY) == date(2026, 10, 3)
    assert parse_date("3 Oct", today=TODAY) == date(2026, 10, 3)
    assert parse_date("28 Dec", today=date(2027, 1, 5)) == date(2026, 12, 28)
    assert parse_date("hello", today=TODAY) is None
    assert parse_date(250, today=TODAY) is None


MAPPING_SPLIT = {"header_row": 1, "columns": {"date": 0, "description": 1, "money_in": 2, "money_out": 3}, "date_order": "dmy"}


def test_rows_with_money_in_and_out_columns():
    sale = parse_row(["01/10/2026", "Sold 3 bags rice", "1,500", ""], 2, MAPPING_SPLIT, today=TODAY)
    assert sale.record["direction"] == "in" and sale.record["amount_pesewas"] == 150000
    assert sale.record["occurred_on"] == "2026-10-01" and not sale.issues
    cost = parse_row(["02/10/2026", "Transport", "", 40], 3, MAPPING_SPLIT, today=TODAY)
    assert cost.record["direction"] == "out" and cost.record["amount_pesewas"] == 4000
    both = parse_row(["02/10/2026", "Odd", 10, 20], 4, MAPPING_SPLIT, today=TODAY)
    assert both.record is None and both.issues
    no_date = parse_row(["sometime", "Rent", "", 500], 5, MAPPING_SPLIT, today=TODAY)
    assert no_date.record is None and "date" in no_date.issues[0]


def test_blank_and_total_rows_are_skipped():
    rows = [
        ["Date", "Details", "In", "Out"],
        ["01/10/2026", "Sales", 100, ""],
        ["", "", "", ""],
        ["", "Total", 100, 0],
        ["31/10/2026", "TOTAL", 100, ""],
    ]
    parsed = parse_rows(rows, MAPPING_SPLIT, today=TODAY)
    assert [row.row_number for row in parsed] == [2]


def test_one_amount_column_with_a_type_column_or_a_sign():
    mapping = {"header_row": 1, "columns": {"date": 0, "amount": 1, "direction": 2}}
    assert parse_row(["01/10/2026", 50, "Expense"], 2, mapping, today=TODAY).record["direction"] == "out"
    assert parse_row(["01/10/2026", 50, "Income"], 2, mapping, today=TODAY).record["direction"] == "in"
    assert parse_row(["01/10/2026", -50, ""], 2, mapping, today=TODAY).record["direction"] == "out"
    unclear = parse_row(["01/10/2026", 50, ""], 2, mapping, today=TODAY)
    assert unclear.record is None and "money in or money out" in unclear.issues[0]
    all_sales = {**mapping, "columns": {"date": 0, "amount": 1}, "default_direction": "in"}
    assert parse_row(["01/10/2026", 50], 2, all_sales, today=TODAY).record["direction"] == "in"


def test_fingerprint_ignores_position_but_not_content():
    a = parse_row(["01/10/2026", "Sales", 100, ""], 2, MAPPING_SPLIT, today=TODAY)
    moved = parse_row(["01/10/2026", "Sales ", 100, ""], 9, MAPPING_SPLIT, today=TODAY)
    changed = parse_row(["01/10/2026", "Sales", 120, ""], 2, MAPPING_SPLIT, today=TODAY)
    assert a.fingerprint == moved.fingerprint != changed.fingerprint


def test_column_guess_finds_the_header_under_a_title():
    rows = [
        ["Ama's Provisions cash book 2026"],
        [],
        ["Date", "Details", "Money In (GHS)", "Money Out (GHS)", "Category", "Customer"],
        ["01/10/2026", "Rice", 300, "", "Sales of goods", "Kofi"],
    ]
    mapping = propose_mapping(rows, today=TODAY)
    assert mapping["header_row"] == 3
    assert mapping["columns"]["date"] == 0
    assert mapping["columns"]["description"] == 1
    assert mapping["columns"]["money_in"] == 2
    assert mapping["columns"]["money_out"] == 3
    assert mapping["columns"]["category"] == 4
    assert mapping["columns"]["counterparty"] == 5
    assert mapping_problems(mapping, 6) == []


def test_column_guess_with_amount_and_type():
    rows = [["Date", "Item", "Amount", "Type"], ["01/10/2026", "Rice", 300, "Income"]]
    mapping = propose_mapping(rows, today=TODAY)
    assert mapping["columns"]["amount"] == 2 and mapping["columns"]["direction"] == 3
    assert mapping["columns"]["description"] == 1


def test_column_guess_from_data_when_there_is_no_header():
    rows = [["01/10/2026", "Rice", 300], ["02/10/2026", "Beans", 120], ["03/10/2026", "Gari", 80]]
    mapping = propose_mapping(rows, today=TODAY)
    assert mapping["header_row"] == 0
    assert mapping["columns"]["date"] == 0 and mapping["columns"]["amount"] == 2


def test_mapping_problems_are_plain_words():
    assert "date" in mapping_problems({"columns": {"amount": 1}}, 3)[0]
    assert any("amount" in problem for problem in mapping_problems({"columns": {"date": 0}}, 3))
    assert any("two things" in p for p in mapping_problems({"columns": {"date": 0, "amount": 0}}, 3))


def test_categories_from_the_sheet_or_keywords():
    owner = categories.resolve(Direction.OUT, "rent", None)
    assert (owner.label, owner.category_l1, owner.source) == ("Rent", "opex", CategorySource.OWNER_STATED)
    rule = categories.resolve(Direction.OUT, None, "Trotro fare to Kumasi")
    assert (rule.label, rule.category_l1, rule.source) == ("Transport", "opex", CategorySource.RULE)
    sale = categories.resolve(Direction.IN, None, "Sold 2 bags of rice")
    assert sale.category_l1 == "revenue"
    unknown = categories.resolve(Direction.OUT, None, "Kwame")
    assert unknown.category_l1 == "unknown" and unknown.label is None
