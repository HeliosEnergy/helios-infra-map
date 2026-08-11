#!/usr/bin/env python3
"""Convert the AI Data Center Map workbook into production GeoJSON.

This script intentionally uses only Python's standard library so the import can
run in a fresh checkout without adding an Excel parsing dependency to the app.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlparse
from zipfile import ZipFile
import xml.etree.ElementTree as ET


SPREADSHEET_NS = {
    "a": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
}
RELATIONSHIP_NS = {"pr": "http://schemas.openxmlformats.org/package/2006/relationships"}

DEFAULT_INPUT = Path("data/aidatacentermap-data.xlsx")
DEFAULT_OUTPUT = Path("data/ai-data-centers.geojson")
DEFAULT_REPORT = Path("data/ai-data-centers-import-report.json")


def text_of(element: ET.Element | None) -> str:
    return "".join(element.itertext()) if element is not None else ""


def column_index(cell_ref: str) -> int:
    letters = "".join(char for char in cell_ref if char.isalpha())
    index = 0
    for char in letters:
        index = index * 26 + ord(char.upper()) - 64
    return index - 1


def clean_string(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    if not text or text.lower() in {"nan", "none", "null"}:
        return None
    return text


def clean_number(value: Any) -> float | None:
    text = clean_string(value)
    if not text:
        return None
    normalized = text.replace(",", "").replace("$", "").strip()
    try:
        return float(normalized)
    except ValueError:
        return None


def clean_int(value: Any) -> int | None:
    number = clean_number(value)
    if number is None:
        return None
    if number.is_integer():
        return int(number)
    return None


def excel_serial_to_datetime(value: float) -> datetime:
    # Excel's serial date system starts at 1899-12-30 for modern workbooks.
    return datetime(1899, 12, 30, tzinfo=timezone.utc) + timedelta(days=value)


def normalize_date(value: Any) -> str | None:
    text = clean_string(value)
    if not text:
        return None

    serial = clean_number(text)
    if serial is not None and serial > 1000:
        return excel_serial_to_datetime(serial).date().isoformat()

    if re.fullmatch(r"\d{4}", text):
        return f"{text}-01-01"

    try:
        return datetime.fromisoformat(text.replace("Z", "+00:00")).date().isoformat()
    except ValueError:
        return text


def normalize_datetime(value: Any) -> str | None:
    text = clean_string(value)
    if not text:
        return None

    serial = clean_number(text)
    if serial is not None and serial > 1000:
        return excel_serial_to_datetime(serial).isoformat().replace("+00:00", "Z")

    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
        return parsed.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
    except ValueError:
        return text


def normalize_year(*values: Any) -> int | None:
    for value in values:
        text = clean_string(value)
        if not text:
            continue

        exact_year = re.fullmatch(r"\d{4}", text)
        if exact_year:
            return int(text)

        serial = clean_number(text)
        if serial is not None and serial > 1000:
            return excel_serial_to_datetime(serial).year

        year_match = re.search(r"(19|20)\d{2}", text)
        if year_match:
            return int(year_match.group(0))

    return None


def normalize_status(value: Any) -> str:
    raw = (clean_string(value) or "").lower()
    if raw in {"operational", "operating", "active"}:
        return "Operational"
    if raw in {"construction", "under construction"}:
        return "Under construction"
    if raw in {"planned", "landbank"}:
        return "Planned"
    if raw == "proposed":
        return "Proposed"
    if raw in {"cancelled", "canceled", "decommissioned", "in_doubt"}:
        return "Cancelled"
    return "Unknown"


def is_valid_url(value: str) -> bool:
    parsed = urlparse(value)
    return parsed.scheme in {"http", "https"} and bool(parsed.netloc)


def split_lines(value: Any) -> list[str]:
    text = clean_string(value)
    if not text:
        return []
    return [item.strip() for item in re.split(r"[\r\n]+", text) if item.strip()]


def normalize_sources(urls_value: Any, labels_value: Any) -> list[dict[str, str]]:
    urls = [item for item in split_lines(urls_value) if is_valid_url(item)]
    labels = split_lines(labels_value)
    sources = []
    for index, url in enumerate(urls):
        source = {"url": url}
        if index < len(labels):
            source["label"] = labels[index]
        elif len(labels) == 1:
            source["label"] = labels[0]
        sources.append(source)
    return sources


def stable_id(row: dict[str, Any]) -> str:
    stable_parts = [
        clean_string(row.get("name")) or "",
        clean_string(row.get("developer")) or "",
        clean_string(row.get("state")) or "",
        clean_string(row.get("county")) or "",
        clean_string(row.get("longitude")) or "",
        clean_string(row.get("latitude")) or "",
    ]
    digest = hashlib.sha1("|".join(stable_parts).encode("utf-8")).hexdigest()[:16]
    slug_source = clean_string(row.get("name")) or "ai-data-center"
    slug = re.sub(r"[^a-z0-9]+", "-", slug_source.lower()).strip("-")[:48]
    return f"ai-dc-{slug or 'facility'}-{digest}"


def read_workbook_sheet(path: Path, sheet_name: str) -> list[dict[str, Any]]:
    with ZipFile(path) as archive:
        names = archive.namelist()
        shared_strings = []
        if "xl/sharedStrings.xml" in names:
            shared_root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
            shared_strings = [text_of(item) for item in shared_root.findall("a:si", SPREADSHEET_NS)]

        workbook = ET.fromstring(archive.read("xl/workbook.xml"))
        relationships = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
        relationship_map = {
            item.attrib["Id"]: item.attrib["Target"]
            for item in relationships.findall("pr:Relationship", RELATIONSHIP_NS)
        }

        worksheet_path = None
        for sheet in workbook.findall("a:sheets/a:sheet", SPREADSHEET_NS):
            if sheet.attrib.get("name") != sheet_name:
                continue
            relationship_id = sheet.attrib[
                "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"
            ]
            target = relationship_map[relationship_id]
            worksheet_path = target if target.startswith("xl/") else f"xl/{target.lstrip('/')}"
            break

        if worksheet_path is None:
            raise ValueError(f"Could not find workbook sheet: {sheet_name}")

        def cell_value(cell: ET.Element) -> str | None:
            cell_type = cell.attrib.get("t")
            value = cell.find("a:v", SPREADSHEET_NS)
            if cell_type == "s" and value is not None:
                return shared_strings[int(value.text or "0")]
            if cell_type == "inlineStr":
                return text_of(cell.find("a:is", SPREADSHEET_NS))
            return value.text if value is not None else None

        worksheet = ET.fromstring(archive.read(worksheet_path))
        rows: list[list[str | None]] = []
        for row_element in worksheet.findall("a:sheetData/a:row", SPREADSHEET_NS):
            row: list[str | None] = []
            for cell in row_element.findall("a:c", SPREADSHEET_NS):
                index = column_index(cell.attrib.get("r", "A1"))
                while len(row) <= index:
                    row.append(None)
                row[index] = cell_value(cell)
            rows.append(row)

    if not rows:
        return []

    headers = rows[0]
    records = []
    for row in rows[1:]:
        record = {}
        for index, header in enumerate(headers):
            if header:
                record[header] = row[index] if index < len(row) else None
        records.append(record)
    return records


def to_feature(row: dict[str, Any]) -> tuple[dict[str, Any] | None, dict[str, Any] | None]:
    longitude = clean_number(row.get("longitude"))
    latitude = clean_number(row.get("latitude"))
    if longitude is None or latitude is None or not (-180 <= longitude <= 180) or not (-90 <= latitude <= 90):
        return None, {
            "originalId": clean_string(row.get("id")),
            "name": clean_string(row.get("name")),
            "longitude": row.get("longitude"),
            "latitude": row.get("latitude"),
            "reason": "missing_or_invalid_coordinates",
        }

    raw_status = clean_string(row.get("status"))
    operating_date = normalize_date(row.get("operating_date"))
    operating_year = normalize_year(row.get("operating_year_raw"), operating_date)
    sources = normalize_sources(row.get("source_urls"), row.get("citation_sources"))
    feature_id = stable_id(row)

    properties = {
        "id": feature_id,
        "originalId": clean_string(row.get("id")),
        "name": clean_string(row.get("name")) or "Unnamed AI Data Center",
        "developer": clean_string(row.get("developer")),
        "operator": None,
        "status": normalize_status(raw_status),
        "rawStatus": raw_status,
        "dataCenterType": clean_string(row.get("company_type")),
        "stages": split_lines(row.get("stages")),
        "address": clean_string(row.get("address")),
        "city": clean_string(row.get("city")),
        "county": clean_string(row.get("county")),
        "state": clean_string(row.get("state")),
        "country": "US",
        "powerMw": clean_number(row.get("power_mw")),
        "squareFeet": clean_number(row.get("site_size_sqft")),
        "siteSizeRaw": clean_string(row.get("site_size_raw")),
        "sizeUnits": clean_string(row.get("size_units")),
        "acreage": clean_number(row.get("acres")),
        "capitalExpenditure": clean_number(row.get("capex_raw")),
        "capitalExpenditureRaw": clean_string(row.get("capex_raw")),
        "operatingDate": operating_date,
        "operatingYear": operating_year,
        "estimatedDailyElectricityUse": clean_number(row.get("estimated_power_kwh_day")),
        "estimatedDailyWaterUse": clean_number(row.get("estimated_water_gal_day")),
        "estimatedHomesEquivalent": clean_number(row.get("estimated_homes_equivalent")),
        "citationCount": clean_int(row.get("citation_count")) or len(sources),
        "sources": sources,
        "sourceEndpoint": clean_string(row.get("source_endpoint")),
        "retrievedAtUtc": normalize_datetime(row.get("retrieved_at_utc")),
        "sourceType": "ai-data-center-workbook",
    }

    return {
        "type": "Feature",
        "id": feature_id,
        "geometry": {"type": "Point", "coordinates": [longitude, latitude]},
        "properties": properties,
    }, None


def build_geojson(records: list[dict[str, Any]], source_path: Path) -> tuple[dict[str, Any], dict[str, Any]]:
    features = []
    invalid_rows = []
    status_counts: dict[str, int] = {}

    for row in records:
        feature, invalid = to_feature(row)
        if invalid is not None:
            invalid_rows.append(invalid)
            continue
        assert feature is not None
        features.append(feature)
        status = feature["properties"]["status"]
        status_counts[status] = status_counts.get(status, 0) + 1

    metadata = {
        "sourceWorkbook": str(source_path),
        "sourceSheet": "Data Centers",
        "sourceType": "ai-data-center-workbook",
        "generatedAtUtc": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "recordCount": len(records),
        "featureCount": len(features),
        "invalidCoordinateCount": len(invalid_rows),
        "statusCounts": status_counts,
    }

    geojson = {
        "type": "FeatureCollection",
        "metadata": metadata,
        "features": features,
    }
    report = {
        **metadata,
        "invalidRows": invalid_rows,
    }
    return geojson, report


def main() -> None:
    parser = argparse.ArgumentParser(description="Convert AI data center workbook records to GeoJSON.")
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT)
    parser.add_argument("--pretty", action="store_true", help="Pretty-print generated JSON files.")
    args = parser.parse_args()

    if not args.input.exists():
        raise FileNotFoundError(f"Workbook not found: {args.input}")

    records = read_workbook_sheet(args.input, "Data Centers")
    geojson, report = build_geojson(records, args.input)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.report.parent.mkdir(parents=True, exist_ok=True)
    indent = 2 if args.pretty else None
    args.output.write_text(json.dumps(geojson, indent=indent, separators=(",", ":") if not args.pretty else None), encoding="utf-8")
    args.report.write_text(json.dumps(report, indent=2), encoding="utf-8")

    print(f"Wrote {args.output}")
    print(f"Wrote {args.report}")
    print(f"Input rows: {report['recordCount']}")
    print(f"GeoJSON features: {report['featureCount']}")
    print(f"Invalid coordinate rows: {report['invalidCoordinateCount']}")


if __name__ == "__main__":
    main()
