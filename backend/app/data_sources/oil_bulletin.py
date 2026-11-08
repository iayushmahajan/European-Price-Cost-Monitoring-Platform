"""Parser for the European Commission Weekly Oil Bulletin XLSX contract."""

from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from io import BytesIO

from openpyxl import load_workbook
from openpyxl.utils.exceptions import InvalidFileException

from app.data_sources._download import download_bytes
from app.data_sources.contracts import (
    FuelPriceBatch,
    FuelPriceObservation,
    FuelProduct,
    TaxBasis,
)
from app.data_sources.errors import SourceContractError

OIL_BULLETIN_PAGE_URL = "https://energy.ec.europa.eu/data-and-analysis/weekly-oil-bulletin_en"
VERIFIED_WITH_TAX_SAMPLE_URL = (
    "https://energy.ec.europa.eu/document/download/"
    "264c2d0f-f161-4ea3-a777-78faae59bea0_en?"
    "filename=Weekly+Oil+Bulletin+Weekly+prices+with+Taxes+-+2026-09-21.xlsx"
)
VERIFIED_WITHOUT_TAX_SAMPLE_URL = (
    "https://energy.ec.europa.eu/document/download/"
    "78311f92-68f8-4b82-b5cf-1293beeaae77_en?"
    "filename=Weekly+Oil+Bulletin+Weekly+prices+without+taxes+-+2024-02-19.xlsx"
)

EU_COUNTRIES = {
    "Austria": "AT", "Belgium": "BE", "Bulgaria": "BG", "Croatia": "HR",
    "Cyprus": "CY", "Czechia": "CZ", "Denmark": "DK", "Estonia": "EE",
    "Finland": "FI", "France": "FR", "Germany": "DE", "Greece": "EL",
    "Hungary": "HU", "Ireland": "IE", "Italy": "IT", "Latvia": "LV",
    "Lithuania": "LT", "Luxembourg": "LU", "Malta": "MT", "Netherlands": "NL",
    "Poland": "PL", "Portugal": "PT", "Romania": "RO", "Slovakia": "SK",
    "Slovenia": "SI", "Spain": "ES", "Sweden": "SE",
}


def _decimal(value: object, field: str) -> Decimal:
    if value is None or isinstance(value, bool):
        raise SourceContractError(f"Oil Bulletin {field} is missing or non-numeric")
    try:
        result = Decimal(str(value))
    except (InvalidOperation, ValueError) as exc:
        raise SourceContractError(f"Oil Bulletin {field} is not a valid decimal") from exc
    if not result.is_finite() or result <= 0:
        raise SourceContractError(f"Oil Bulletin {field} must be a finite positive value")
    return result


class WeeklyOilBulletinAdapter:
    """Fetch and strictly parse the current EU-country fuel-price workbook."""

    def __init__(
        self,
        *,
        tax_basis: TaxBasis = TaxBasis.WITH_TAX,
        source_url: str | None = None,
        publication_date: date | None = None,
    ) -> None:
        self.tax_basis = tax_basis
        self.source_url = source_url or (
            VERIFIED_WITH_TAX_SAMPLE_URL
            if tax_basis == TaxBasis.WITH_TAX
            else VERIFIED_WITHOUT_TAX_SAMPLE_URL
        )
        self.publication_date = publication_date

    def fetch(self) -> bytes:
        return download_bytes(self.source_url, max_bytes=10_000_000)

    def parse(self, payload: bytes) -> FuelPriceBatch:
        try:
            workbook = load_workbook(BytesIO(payload), read_only=True, data_only=True)
        except (InvalidFileException, OSError, ValueError) as exc:
            raise SourceContractError("Oil Bulletin is not a readable XLSX workbook") from exc
        if workbook.sheetnames != ["Sheet1"]:
            raise SourceContractError("Oil Bulletin worksheet structure changed")
        sheet = workbook["Sheet1"]
        if sheet.max_row != 31 or sheet.max_column != 7:
            raise SourceContractError("Oil Bulletin table dimensions changed")

        headers = [sheet.cell(1, column).value for column in range(1, 8)]
        if headers[0] != "in EUR":
            raise SourceContractError("Oil Bulletin currency header is not EUR")
        if "Euro-super 95" not in str(headers[1]):
            raise SourceContractError("Oil Bulletin petrol column changed")
        if "Automotive gas oil" not in str(headers[2]):
            raise SourceContractError("Oil Bulletin diesel column changed")
        if sheet.cell(2, 2).value != "1000 l" or sheet.cell(2, 3).value != "1000 l":
            raise SourceContractError("Oil Bulletin fuel unit changed from 1000 litres")

        raw_reference = sheet.cell(2, 1).value
        if isinstance(raw_reference, datetime):
            reference_week = raw_reference.date()
        elif isinstance(raw_reference, date):
            reference_week = raw_reference
        else:
            raise SourceContractError("Oil Bulletin reference week is missing or invalid")
        if self.publication_date and self.publication_date < reference_week:
            raise SourceContractError("Oil Bulletin publication date precedes its reference week")

        expected_names = tuple(EU_COUNTRIES)
        actual_names = tuple(sheet.cell(row, 1).value for row in range(3, 30))
        if actual_names != expected_names:
            raise SourceContractError("Oil Bulletin EU-country rows changed or contain duplicates")
        if "EUR27_2020" not in str(sheet.cell(30, 1).value):
            raise SourceContractError("Oil Bulletin EU aggregate footer changed")

        records: list[FuelPriceObservation] = []
        columns = (
            (2, FuelProduct.EURO_SUPER_95),
            (3, FuelProduct.AUTOMOTIVE_DIESEL),
        )
        for row, country_name in enumerate(expected_names, start=3):
            for column, product in columns:
                raw_value = _decimal(
                    sheet.cell(row, column).value,
                    f"{country_name} {product.value}",
                )
                records.append(FuelPriceObservation(
                    country_code=EU_COUNTRIES[country_name],
                    country_name=country_name,
                    reference_week=reference_week,
                    publication_date=self.publication_date,
                    product=product,
                    tax_basis=self.tax_basis,
                    raw_value=raw_value,
                    price_eur_per_litre=raw_value / Decimal(1000),
                ))
        return FuelPriceBatch(
            source_url=self.source_url,
            reference_week=reference_week,
            publication_date=self.publication_date,
            tax_basis=self.tax_basis,
            records=tuple(records),
        )
