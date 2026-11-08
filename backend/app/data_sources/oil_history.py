"""Strict EU-27 motor-fuel slice of the Oil Bulletin price-history workbook."""

from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
from io import BytesIO

from openpyxl import load_workbook

from app.data_sources.contracts import FuelPriceObservation, FuelProduct, TaxBasis
from app.data_sources.errors import SourceContractError
from app.data_sources.oil_bulletin import EU_COUNTRIES, _decimal

HISTORY_SHEETS = [
    "Prices with taxes",
    "Prices wo taxes",
    "Consumption",
    "VAT",
    "Excise duties",
    "Excise duties - components",
    "Other Indirect Taxes",
]


@dataclass(frozen=True)
class FuelHistoryBatch:
    records: tuple[FuelPriceObservation, ...]
    missing_observation_count: int


class OilHistoryAdapter:
    def __init__(self, *, since: date, before: date):
        self.since = since
        self.before = before

    def parse(self, payload):
        records = []
        missing = 0
        try:
            workbook = load_workbook(BytesIO(payload), read_only=True, data_only=True)
            if workbook.sheetnames != HISTORY_SHEETS:
                raise SourceContractError("Oil history worksheets changed")
            for sheet_name, basis, token, title in [
                ("Prices with taxes", TaxBasis.WITH_TAX, "with_tax", "inclusive of"),
                ("Prices wo taxes", TaxBasis.WITHOUT_TAX, "wo_tax", "net of"),
            ]:
                sheet = workbook[sheet_name]
                rows = iter(sheet.values)
                headers, labels, units = next(rows), next(rows), next(rows)
                if (
                    sheet.max_column != 226
                    or units[0] != "Date"
                    or headers[0] != f"Consumer prices of petroleum products {title} duties and taxes"
                ):
                    raise SourceContractError("Oil history table contract changed")
                columns = []
                for country_name, country_code in EU_COUNTRIES.items():
                    native = "GR" if country_code == "EL" else country_code
                    for suffix, product in [
                        ("euro95", FuelProduct.EURO_SUPER_95),
                        ("diesel", FuelProduct.AUTOMOTIVE_DIESEL),
                    ]:
                        key = f"{native}_price_{token}_{suffix}"
                        if headers.count(key) != 1:
                            raise SourceContractError("Oil history country/product coverage changed")
                        column = headers.index(key)
                        if (
                            units[column] != "1000 l"
                            or ("Euro-super 95" if suffix == "euro95" else "Automotive gas oil")
                            not in labels[column]
                        ):
                            raise SourceContractError("Oil history product or unit changed")
                        columns.append((column, country_name, country_code, product))
                previous = None
                for row in rows:
                    raw_date = row[0]
                    if raw_date == "Notes:":
                        break
                    if raw_date is None:
                        if any(row[column] is not None for column, *_ in columns):
                            raise SourceContractError("Oil history values lack a reference week")
                        continue
                    if not isinstance(raw_date, datetime):
                        raise SourceContractError("Oil history reference date changed")
                    week = raw_date.date()
                    if previous and week >= previous:
                        raise SourceContractError("Oil history weeks must be unique and descending")
                    previous = week
                    if not self.since <= week < self.before:
                        continue
                    for column, country_name, country_code, product in columns:
                        # Historical pre-membership/missing coordinates stay absent.
                        if row[column] is None or row[column] == ":":
                            missing += 1
                            continue
                        raw = _decimal(row[column], f"history {country_code} {week}")
                        records.append(
                            FuelPriceObservation(
                                country_code=country_code,
                                country_name=country_name,
                                reference_week=week,
                                product=product,
                                tax_basis=basis,
                                raw_value=raw,
                                price_eur_per_litre=raw / Decimal(1000),
                            )
                        )
            workbook.close()
        except SourceContractError:
            raise
        except Exception as exc:
            raise SourceContractError("Unreadable Oil Bulletin historical contract") from exc
        if not records:
            raise SourceContractError("Oil history contains no observations in requested range")
        return FuelHistoryBatch(tuple(records), missing)
