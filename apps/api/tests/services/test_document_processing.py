from pathlib import Path
from tempfile import TemporaryDirectory

from app.services.document_processing import DocumentProcessor


def test_csv_is_captured_as_a_normalized_table():
    with TemporaryDirectory() as directory:
        source = Path(directory) / "statement.csv"
        source.write_text(
            "Txn Date,Narration,Dr,Cr,Running Balance\n"
            "2026-09-01,Customer payment,,100.00,100.00\n",
            encoding="utf-8",
        )
        processed = DocumentProcessor().process(source)

    assert processed.methods == ("native:delimited",)
    assert processed.tables[0].column_count == 5
    assert processed.tables[0].cells[1].text == "Narration"
    assert "Customer payment" in processed.text


def test_xlsx_is_captured_without_a_layout_model():
    import zipfile

    with TemporaryDirectory() as directory:
        source = Path(directory) / "statement.xlsx"
        workbook = """<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Transactions" r:id="rId1"/></sheets></workbook>"""
        relationships = """<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="worksheets/sheet1.xml" Type="worksheet"/></Relationships>"""
        sheet = """<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Date</t></is></c><c r="B1" t="inlineStr"><is><t>Amount</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>2026-09-01</t></is></c><c r="B2"><v>100</v></c></row></sheetData></worksheet>"""
        with zipfile.ZipFile(source, "w") as archive:
            archive.writestr("xl/workbook.xml", workbook)
            archive.writestr("xl/_rels/workbook.xml.rels", relationships)
            archive.writestr("xl/worksheets/sheet1.xml", sheet)
        processed = DocumentProcessor().process(source)

    assert processed.methods == ("native:xlsx",)
    assert processed.structure["sheets"][0]["name"] == "Transactions"
    assert processed.tables[0].cells[-1].text == "100"


def test_xml_repeated_records_become_a_normalized_table():
    with TemporaryDirectory() as directory:
        source = Path(directory) / "export.xml"
        source.write_text(
            "<bankStatement><currency>USD</currency>"
            "<transaction><date>2026-08-01</date><description>Sale</description><credit>10</credit></transaction>"
            "<transaction><date>2026-08-02</date><description>Fee</description><debit>2</debit></transaction>"
            "</bankStatement>",
            encoding="utf-8",
        )
        processed = DocumentProcessor().process(source)

    assert processed.methods == ("native:xml",)
    assert any(cell.text == "description" for cell in processed.tables[1].cells)
    assert "2026-08-02" in processed.text
