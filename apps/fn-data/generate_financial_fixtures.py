"""Generate synthetic, intentionally varied financial-statement fixtures.

Run with the bundled Codex Python runtime or any Python 3.11+ environment:
    python generate_financial_fixtures.py

Dependencies: reportlab, openpyxl, Pillow, pillow-heif.
The files are synthetic and contain no real account or customer data.
"""

from __future__ import annotations

import csv
import json
import random
import shutil
import subprocess
from datetime import date, timedelta
from pathlib import Path
from typing import Any
from xml.etree.ElementTree import Element, SubElement, ElementTree

from PIL import Image, ImageDraw, ImageFont
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter, landscape
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, PageBreak


ROOT = Path(__file__).resolve().parent
SEED = 20260915
TODAY = date(2026, 8, 31)
OUT = ROOT / "fixtures"
random.seed(SEED)


def money(value: float) -> float:
    return round(value, 2)


def amount() -> float:
    return money(random.uniform(18, 18500))


def date_text(day: date, fmt: str = "%Y-%m-%d") -> str:
    return day.strftime(fmt)


def ensure_clean_output() -> None:
    if OUT.exists():
        shutil.rmtree(OUT)
    for folder in ("xml", "pdf", "heic", "csv", "xlsx"):
        (OUT / folder).mkdir(parents=True, exist_ok=True)


def write_xml(path: Path, root_name: str, payload: dict[str, Any]) -> None:
    root = Element(root_name)

    def add(parent: Element, key: str, value: Any) -> None:
        if isinstance(value, dict):
            node = SubElement(parent, key)
            for child_key, child_value in value.items():
                add(node, child_key, child_value)
        elif isinstance(value, list):
            for item in value:
                add(parent, key[:-1] if key.endswith("s") else "item", item)
        else:
            SubElement(parent, key).text = str(value)

    for key, value in payload.items():
        add(root, key, value)
    ElementTree(root).write(path, encoding="utf-8", xml_declaration=True)


def transaction_rows(count: int = 18) -> list[dict[str, Any]]:
    merchants = ["Northstar Office", "Harbor Market", "Cloudline Hosting", "Metro Fuel", "Pine & Co.", "Lumen Telecom", "Oak Street Cafe"]
    rows = []
    for index in range(count):
        day = TODAY - timedelta(days=index * 3 + random.randint(0, 2))
        debit = money(random.uniform(22, 1450)) if random.random() < 0.68 else 0
        credit = money(random.uniform(350, 9200)) if not debit else 0
        rows.append({
            "date": date_text(day),
            "description": random.choice(merchants),
            "reference": f"TXN-{random.randint(100000, 999999)}",
            "debit": debit,
            "credit": credit,
            "balance": money(24800 + sum(r["credit"] - r["debit"] for r in rows) + credit - debit),
        })
    return rows


def generate_xml() -> list[dict[str, Any]]:
    files = []
    rows = transaction_rows()

    payload = {
        "institution": "Northstar Community Bank",
        "accountNumberMasked": "****4821",
        "statementPeriod": {"from": "2026-08-01", "to": "2026-08-31"},
        "currency": "USD",
        "openingBalance": "24800.00",
        "closingBalance": "31244.18",
        "transactions": rows,
    }
    path = OUT / "xml" / "01_northstar_bank_statement.xml"
    write_xml(path, "bankStatement", payload)
    files.append((path, "Northstar bank XML export with nested transactions"))

    payouts = [{"payoutId": f"po_{random.randint(100000, 999999)}", "arrivalDate": date_text(TODAY - timedelta(days=i * 7)), "gross": money(2200 + i * 815.5), "fees": money(65 + i * 12.4), "net": money(2135 + i * 803.1), "status": "paid"} for i in range(6)]
    path = OUT / "xml" / "02_payflow_payout_report.xml"
    write_xml(path, "payoutReport", {"platform": "PayFlow", "merchantId": "acct_demo_8742", "reportCurrency": "USD", "payouts": payouts})
    files.append((path, "PayFlow payout XML with fee and net fields"))

    accounts = [("1000", "Cash - Operating", 31244.18), ("1100", "Accounts Receivable", 18750.00), ("2000", "Accounts Payable", -9340.00), ("4000", "Subscription Revenue", -64200.00), ("5000", "Cost of Services", 21450.00)]
    path = OUT / "xml" / "03_ledger_trial_balance.xml"
    write_xml(path, "trialBalance", {"company": "Cedar Analytics LLC", "period": "2026-08", "accounts": [{"code": a, "name": b, "debit": max(c, 0), "credit": abs(min(c, 0))} for a, b, c in accounts], "totalDebits": "71444.18", "totalCredits": "71444.18"})
    files.append((path, "Cedar Analytics general-ledger trial balance"))

    activity = [{"postedAt": "2026-08-03T14:18:00Z", "type": "sale", "invoice": "INV-1048", "customer": "Bluebird Foods", "gross": "1840.00", "processingFee": "53.36", "net": "1786.64"}, {"postedAt": "2026-08-08T09:22:00Z", "type": "refund", "invoice": "INV-1029", "customer": "Kiteworks", "gross": "-290.00", "processingFee": "0.00", "net": "-290.00"}]
    path = OUT / "xml" / "04_checkout_activity.xml"
    write_xml(path, "checkoutActivity", {"exportedAt": "2026-09-01T08:00:00Z", "merchant": "Sparrow Goods", "activity": activity, "summary": {"sales": "1840.00", "refunds": "-290.00", "fees": "53.36", "net": "1496.64"}})
    files.append((path, "Checkout activity XML with sales and refunds"))
    return files


def pdf_table(title: str, subtitle: str, columns: list[str], data: list[list[Any]], filename: str, landscape_page: bool = False, sections: list[tuple[str, list[list[Any]]]] | None = None) -> Path:
    path = OUT / "pdf" / filename
    doc = SimpleDocTemplate(str(path), pagesize=landscape(letter) if landscape_page else letter, rightMargin=36, leftMargin=36, topMargin=34, bottomMargin=34)
    styles = getSampleStyleSheet()
    story = [Paragraph(title, styles["Title"]), Paragraph(subtitle, styles["Normal"]), Spacer(1, 14)]
    if sections:
        for heading, section_rows in sections:
            story.extend([Paragraph(heading, styles["Heading2"]), Table(section_rows, repeatRows=1, hAlign="LEFT", style=TableStyle([("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#20354a")), ("TEXTCOLOR", (0, 0), (-1, 0), colors.white), ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#b8c4ce")), ("ALIGN", (1, 1), (-1, -1), "RIGHT"), ("FONTSIZE", (0, 0), (-1, -1), 8), ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f2f5f7")])])), Spacer(1, 12)])
    else:
        table = Table([columns] + data, repeatRows=1, hAlign="LEFT")
        table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#20354a")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#b8c4ce")),
            ("ALIGN", (1, 1), (-1, -1), "RIGHT"),
            ("FONTSIZE", (0, 0), (-1, -1), 8),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f2f5f7")]),
        ]))
        story.append(table)
    story.append(Spacer(1, 16))
    story.append(Paragraph("SYNTHETIC TEST DATA - generated fixture; not a real financial record", styles["Normal"]))
    doc.build(story)
    return path


def generate_pdf() -> list[dict[str, Any]]:
    files = []
    rows = [[r["date"], r["description"], r["reference"], f"${r['debit']:,.2f}", f"${r['credit']:,.2f}", f"${r['balance']:,.2f}"] for r in transaction_rows(20)]
    path = pdf_table("Northstar Community Bank", "Business checking statement | Aug 1-31, 2026 | Account ending 4821", ["Posted", "Description", "Reference", "Debit", "Credit", "Balance"], rows, "01_northstar_checking.pdf", True)
    files.append((path, "Landscape bank statement with running balances"))

    sections = [("Revenue", [["Product sales", "$84,200.00"], ["Service revenue", "$31,500.00"], ["Total revenue", "$115,700.00"]]), ("Expenses", [["Payroll", "$42,600.00"], ["Software", "$7,840.00"], ["Marketing", "$9,300.00"], ["Total expenses", "$73,180.00"]]), ("Net income", [["Net income", "$42,520.00"]])]
    path = pdf_table("Cedar Analytics LLC", "Statement of operations | Month ended August 31, 2026", [], [], "02_cedar_income_statement.pdf", sections=sections)
    files.append((path, "Income statement with grouped sections"))

    holdings = [["2026-08-01", "Vanguard Total Stock", "VTI", "120", "$31,860.00", "$265.50"], ["2026-08-01", "US Treasury Note", "UST5", "40", "$39,840.00", "$996.00"], ["2026-08-31", "Cash sweep", "CASH", "1", "$8,450.00", "$8,450.00"]]
    path = pdf_table("Harbor Brokerage", "Monthly account statement | Account ending 0917 | USD", ["As of", "Description", "Symbol", "Units", "Market value", "Price"], holdings, "03_harbor_brokerage.pdf", True)
    files.append((path, "Brokerage statement with holdings and market values"))

    payroll = [["2026-08-07", "Payroll batch 184", "48", "$38,420.00", "$29,785.00", "$8,635.00"], ["2026-08-21", "Payroll batch 185", "48", "$38,420.00", "$29,785.00", "$8,635.00"]]
    path = pdf_table("Pine & Co. Payroll Clearing", "Employer payroll funding report | August 2026", ["Pay date", "Batch", "Employees", "Gross", "Net pay", "Taxes / deductions"], payroll, "04_pine_payroll_report.pdf")
    files.append((path, "Payroll funding report with employee and tax totals"))
    return files


def generate_csv() -> list[dict[str, Any]]:
    files = []
    specs = [
        ("01_bank_transactions.csv", ["transaction_date", "posted_date", "memo", "type", "amount", "running_balance"], [[r["date"], r["date"], r["description"], "DEBIT" if r["debit"] else "CREDIT", f"{-r['debit'] if r['debit'] else r['credit']:.2f}", f"{r['balance']:.2f}"] for r in transaction_rows(24)], "Bank transaction export with posted dates and signed amounts"),
        ("02_card_activity.csv", ["id", "merchant_name", "merchant_category", "authorized_at", "settled_at", "currency", "amount", "status"], [[f"ch_{10000+i}", m, c, "2026-08-%02dT10:30:00-04:00" % (i + 1), "2026-08-%02d" % (i + 2), "USD", f"{a:.2f}", "settled"] for i, (m, c, a) in enumerate([("Cloudline Hosting", "Software", 240.00), ("Metro Fuel", "Automotive", 86.42), ("Oak Street Cafe", "Meals", 42.75), ("Northstar Office", "Office supplies", 318.09)])], "Card processor export with ISO timestamps and categories"),
        ("03_invoice_aging.csv", ["customer_id", "customer_name", "invoice_number", "invoice_date", "due_date", "current", "days_1_30", "days_31_60", "days_61_90", "over_90", "total_due"], [["CUS-100", "Bluebird Foods", "INV-1048", "2026-08-03", "2026-09-02", "1840.00", "0.00", "0.00", "0.00", "0.00", "1840.00"], ["CUS-104", "Kiteworks", "INV-1029", "2026-06-11", "2026-07-11", "0.00", "0.00", "290.00", "0.00", "0.00", "290.00"], ["CUS-109", "Fable Retail", "INV-0991", "2026-03-16", "2026-04-15", "0.00", "0.00", "0.00", "0.00", "1250.00", "1250.00"]], "Accounts-receivable aging with bucketed balances"),
        ("04_cash_flow.csv", ["period", "operating_inflows", "operating_outflows", "investing", "financing", "net_change", "ending_cash"], [["2026-06", "64200.00", "-51800.00", "-6200.00", "0.00", "6200.00", "24900.00"], ["2026-07", "71800.00", "-54900.00", "-1800.00", "0.00", "15100.00", "40000.00"], ["2026-08", "72900.00", "-61000.00", "-7500.00", "0.00", "4400.00", "44400.00"]], "Monthly cash-flow export with signed activity columns"),
    ]
    for filename, headers, data, description in specs:
        path = OUT / "csv" / filename
        with path.open("w", newline="", encoding="utf-8") as handle:
            writer = csv.writer(handle)
            writer.writerow(headers)
            writer.writerows(data)
        files.append((path, description))
    return files


def style_sheet(ws: Any, title: str) -> None:
    ws.freeze_panes = "A3"
    ws["A1"] = title
    ws["A1"].font = Font(bold=True, size=14, color="FFFFFF")
    ws["A1"].fill = PatternFill("solid", fgColor="20354A")
    ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=max(ws.max_column, 4))
    for cell in ws[2]:
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill("solid", fgColor="52758F")
        cell.alignment = Alignment(horizontal="center")
    for column_index, column in enumerate(ws.iter_cols(), start=1):
        width = min(28, max(12, max(len(str(cell.value or "")) for cell in column) + 2))
        ws.column_dimensions[ws.cell(row=2, column=column_index).column_letter].width = width


def generate_xlsx() -> list[dict[str, Any]]:
    files = []
    specs = [
        ("01_cedar_profit_and_loss.xlsx", "Profit and Loss", ["Account", "Jan-26", "Feb-26", "Mar-26", "Apr-26", "May-26", "Jun-26", "Jul-26", "Aug-26"], [["Subscription revenue", 72000, 74500, 76800, 78100, 80300, 82500, 84200, 85700], ["Professional services", 21400, 19900, 24500, 22100, 27800, 30100, 31500, 29000], ["Payroll", -38200, -38200, -39700, -39700, -41200, -42600, -42600, -42600], ["Software", -6800, -6800, -7100, -7100, -7400, -7840, -7840, -7840], ["Net income", 48400, 49400, 54400, 53500, 59400, 62160, 65260, 64260]]),
        ("02_harbor_balance_sheet.xlsx", "Balance Sheet", ["Account", "Debit", "Credit", "As of"], [["Cash and cash equivalents", 44400, 0, "2026-08-31"], ["Accounts receivable", 18750, 0, "2026-08-31"], ["Equipment", 28900, 0, "2026-08-31"], ["Accounts payable", 0, 9340, "2026-08-31"], ["Owner equity", 0, 58710, "2026-08-31"]]),
        ("03_budget_vs_actual.xlsx", "Budget vs Actual", ["Cost center", "Budget", "Actual", "Variance", "Variance %", "Owner"], [["People", 42000, 42600, -600, -0.0143, "M. Chen"], ["Technology", 8500, 7840, 660, 0.0776, "R. Singh"], ["Marketing", 12000, 9300, 2700, 0.225, "A. Rivera"], ["Travel", 4500, 5100, -600, -0.1333, "J. Kim"]]),
        ("04_transaction_register.xlsx", "Transaction Register", ["Posted", "Vendor / Customer", "Class", "Account", "Reference", "Amount", "Reconciled"], [[r["date"], r["description"], random.choice(["Operating", "Revenue", "Payroll"]), random.choice(["1000 Cash", "4000 Revenue", "5200 Expense"]), r["reference"], money(r["credit"] - r["debit"]), random.choice(["Yes", "Yes", "No"])] for r in transaction_rows(16)]),
    ]
    for filename, title, headers, data in specs:
        wb = Workbook()
        ws = wb.active
        ws.title = title[:31]
        ws.append([title])
        ws.append(headers)
        for row in data:
            ws.append(row)
        style_sheet(ws, f"{title} | SYNTHETIC TEST DATA")
        for row in ws.iter_rows(min_row=3):
            for cell in row:
                if isinstance(cell.value, (int, float)) and cell.column > 1:
                    cell.number_format = '#,##0.00;[Red]-#,##0.00'
        if title == "Budget vs Actual":
            for cell in ws["E"][2:]:
                cell.number_format = "0.0%"
        path = OUT / "xlsx" / filename
        wb.save(path)
        files.append((path, f"{title} workbook with a distinct financial layout"))
    return files


def get_font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for candidate in ("C:/Windows/Fonts/arial.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"):
        if Path(candidate).exists():
            return ImageFont.truetype(candidate, size)
    return ImageFont.load_default()


def generate_heic() -> list[dict[str, Any]]:
    heif_available = True
    try:
        import pillow_heif
        pillow_heif.register_heif_opener()
    except ImportError:
        # Keep the generator runnable in offline environments. The fallback
        # keeps the requested .heic filenames and OCR-visible content, but
        # writes JPEG bytes; install pillow-heif for true HEIC encoding.
        heif_available = False

    files = []
    specs = [
        ("01_mobile_bank_capture.heic", "Northstar Bank", ["BUSINESS CHECKING", "Aug 31, 2026", "Available balance", "$31,244.18", "Deposits", "+$9,420.00", "Card purchases", "-$2,975.82"]),
        ("02_receipt_batch_capture.heic", "Harbor Card", ["CARD ACTIVITY", "Statement ending 08/31/26", "Previous balance", "$4,128.40", "Payments", "-$4,128.40", "New purchases", "+$2,874.23"]),
        ("03_brokerage_snapshot.heic", "Harbor Brokerage", ["PORTFOLIO SNAPSHOT", "As of Aug 31, 2026", "Market value", "$80,150.00", "Day change", "+$642.10", "Unrealized gain", "+$8,442.15"]),
        ("04_payroll_remittance.heic", "Pine & Co.", ["PAYROLL REMITTANCE", "Pay date Aug 21, 2026", "Gross wages", "$38,420.00", "Employee net pay", "$29,785.00", "Taxes withheld", "$8,635.00"]),
    ]
    for filename, brand, lines in specs:
        image = Image.new("RGB", (1400, 1000), "#f4f6f8")
        draw = ImageDraw.Draw(image)
        draw.rounded_rectangle((70, 60, 1330, 940), radius=32, fill="white", outline="#d4dde5", width=4)
        draw.rectangle((70, 60, 1330, 190), fill="#20354a")
        draw.text((115, 96), brand, fill="white", font=get_font(42))
        draw.text((115, 230), lines[0], fill="#20354a", font=get_font(34))
        draw.text((115, 285), lines[1], fill="#65727e", font=get_font(24))
        y = 390
        for label, value in zip(lines[2::2], lines[3::2]):
            draw.text((115, y), label, fill="#65727e", font=get_font(25))
            draw.text((980, y), value, fill="#17202a", font=get_font(31), anchor="ra")
            draw.line((115, y + 58, 1285, y + 58), fill="#e1e6eb", width=2)
            y += 125
        draw.text((115, 865), "SYNTHETIC TEST DATA", fill="#9a5b25", font=get_font(22))
        path = OUT / "heic" / filename
        if heif_available:
            image.save(path, format="HEIF", quality=88)
        else:
            image.save(path, format="JPEG", quality=90)
        files.append((path, f"Mobile-style image capture of a {brand} statement"))
    return files


def main() -> None:
    ensure_clean_output()
    all_files = generate_xml() + generate_pdf() + generate_csv() + generate_xlsx() + generate_heic()
    manifest = {
        "generated_at": "2026-09-15",
        "seed": SEED,
        "synthetic": True,
        "purpose": "Parser and financial-data detection test fixtures",
        "file_count": len(all_files),
        "formats": {ext: sum(1 for path, _ in all_files if path.suffix.lower() == ext) for ext in (".xml", ".pdf", ".heic", ".csv", ".xlsx")},
        "heic_codec_note": "True HEIC when pillow-heif is installed; otherwise .heic files contain OCR-friendly JPEG fallback bytes so generation still completes offline.",
        "files": [{"path": str(path.relative_to(ROOT)), "format": path.suffix[1:].upper(), "shape": description} for path, description in all_files],
    }
    (ROOT / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    (ROOT / "README.md").write_text("# Synthetic financial fixtures\n\nRun `python generate_financial_fixtures.py` to regenerate 20 deterministic, synthetic statements. The fixtures intentionally vary by platform-like schema, field names, nesting, ordering, visual layout, date formats, and sign conventions. They contain no real financial data. See `manifest.json` for the file inventory.\n", encoding="utf-8")
    print(f"Generated {len(all_files)} files in {OUT}")


if __name__ == "__main__":
    main()
