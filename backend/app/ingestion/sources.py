"""Official source discovery and bounded, filtered acquisition plans."""

import hashlib
import json
import re
from dataclasses import asdict, dataclass
from datetime import date, datetime, timedelta, timezone
from html.parser import HTMLParser
from urllib.parse import urljoin, urlparse

from app.data_sources._download import download_bytes
from app.data_sources.contracts import TaxBasis
from app.data_sources.ecb import DEFAULT_CURRENCIES, EcbExchangeRateAdapter
from app.data_sources.errors import SourceContractError
from app.data_sources.hicp import HICP_CATEGORIES, HICP_GEOS, HICP_UNITS, EurostatHicpAdapter
from app.data_sources.oil_bulletin import OIL_BULLETIN_PAGE_URL, WeeklyOilBulletinAdapter
from app.data_sources.oil_history import OilHistoryAdapter

SOURCES = ("ec_weekly_oil_bulletin", "eurostat_prc_hicp_minr", "ecb_exr")


@dataclass(frozen=True)
class Acquired:
    url: str
    payload: bytes
    extension: str
    batch: object | None
    retrieved_at: datetime
    publication_date: date | None = None


class OilPage(HTMLParser):
    """Read the EC file components; fail closed on ambiguity or missing metadata."""

    def __init__(self):
        super().__init__()
        self.article = None
        self.links = []
        self.history = []

    def handle_starttag(self, tag, attrs):
        attributes = dict(attrs)
        if tag == "article":
            self.article = {"text": [], "urls": []}
        if self.article is not None and tag == "a" and "href" in attributes:
            self.article["urls"].append(attributes["href"])

    def handle_data(self, data):
        if self.article is not None:
            self.article["text"].append(data)

    def handle_endtag(self, tag):
        if tag == "article" and self.article is not None:
            text = " ".join(self.article["text"])
            basis = None
            if re.search(r"Prices without taxes latest prices", text, re.I):
                basis = TaxBasis.WITHOUT_TAX
            elif re.search(r"Prices with taxes latest prices", text, re.I):
                basis = TaxBasis.WITH_TAX
            if basis:
                match = re.search(r"\b(\d{1,2} [A-Za-z]+ \d{4})\b", text)
                urls = self.article["urls"]
                if not match or len(urls) != 1:
                    raise SourceContractError("Oil publication component changed")
                published = datetime.strptime(match[1], "%d %B %Y").date()
                url = urljoin(OIL_BULLETIN_PAGE_URL, urls[0])
                validate_oil_url(url)
                self.links.append((basis, url, published))
            if re.search(r"Price developments 2005 onwards", text, re.I):
                match = re.search(r"\b(\d{1,2} [A-Za-z]+ \d{4})\b", text)
                if not match or len(self.article["urls"]) != 1:
                    raise SourceContractError("Oil history publication component changed")
                url = urljoin(OIL_BULLETIN_PAGE_URL, self.article["urls"][0])
                validate_oil_url(url)
                self.history.append((url, datetime.strptime(match[1], "%d %B %Y").date()))
            self.article = None


def validate_oil_url(url):
    parsed = urlparse(url)
    if (
        parsed.scheme != "https"
        or parsed.netloc != "energy.ec.europa.eu"
        or not parsed.path.startswith("/document/download/")
        or ".xlsx" not in parsed.query.lower()
    ):
        raise SourceContractError("Oil workbook link is not an approved official XLSX URL")


def discover_oil(payload: bytes):
    parser = OilPage()
    parser.feed(payload.decode("utf-8"))
    if sorted(b.value for b, _, _ in parser.links) != ["with_tax", "without_tax"]:
        raise SourceContractError("Oil page must provide exactly one workbook per tax basis")
    return parser.links


@dataclass(frozen=True)
class SourceConfig:
    geographies: tuple[str, ...] = HICP_GEOS
    categories: tuple[str, ...] = HICP_CATEGORIES
    units: tuple[str, ...] = HICP_UNITS
    currencies: tuple[str, ...] = DEFAULT_CURRENCIES
    # Re-fetch overlapping history so incremental imports detect revisions.
    overlap_days: int = 400

    @property
    def signature(self):
        return hashlib.sha256(json.dumps(asdict(self), sort_keys=True).encode()).hexdigest()

    def __post_init__(self):
        EurostatHicpAdapter(geographies=self.geographies, categories=self.categories, units=self.units)
        if not set(self.currencies) <= set(DEFAULT_CURRENCIES):
            raise ValueError("Currency selection must use the seeded approved catalogue")
        EcbExchangeRateAdapter(currencies=self.currencies)
        if self.overlap_days < 7:
            raise ValueError("Revision overlap must be at least seven days")


def acquire(source, *, mode, since, today, config, fetch=download_bytes, oil_history=()):
    def response(url, extension, adapter=None, published=None):
        payload = fetch(url, max_bytes=25_000_000, timeout=60)
        retrieved = datetime.now(timezone.utc)
        batch = adapter.parse(payload) if adapter else None
        return Acquired(url, payload, extension, batch, retrieved, published)

    if source == SOURCES[0]:
        page = response(OIL_BULLETIN_PAGE_URL, "html")
        yield page
        links = list(discover_oil(page.payload))
        for entry in oil_history:
            validate_oil_url(entry["url"])
            links.append(
                (
                    TaxBasis(entry["tax_basis"]),
                    entry["url"],
                    date.fromisoformat(entry["publication_date"]) if entry.get("publication_date") else None,
                )
            )
        weeks = []
        for basis, url, published in links:
            item = response(
                url,
                "xlsx",
                WeeklyOilBulletinAdapter(source_url=url, tax_basis=basis, publication_date=published),
                published,
            )
            weeks.append(item.batch.reference_week)
            yield item
        if weeks[0] != weeks[1]:
            raise SourceContractError("Current with/without tax reference weeks disagree")
        parser = OilPage()
        parser.feed(page.payload.decode("utf-8"))
        if len(parser.history) != 1:
            raise SourceContractError("Oil page must provide exactly one official history workbook")
        url, published = parser.history[0]
        start = since or (
            date(2005, 1, 1) if mode == "backfill" else today - timedelta(days=config.overlap_days)
        )
        if start < weeks[0]:
            yield response(url, "xlsx", OilHistoryAdapter(since=start, before=weeks[0]), published)
    elif source == SOURCES[1]:
        start = since or (
            date(1996, 1, 1) if mode == "backfill" else today - timedelta(days=config.overlap_days)
        )
        # One geography per request bounds historical response size and retry cost.
        for geo in config.geographies:
            adapter = EurostatHicpAdapter(
                geographies=(geo,),
                categories=config.categories,
                units=config.units,
                since_period=start.strftime("%Y-%m"),
            )
            yield response(adapter.source_url, "json", adapter)
    elif source == SOURCES[2]:
        start = since or (
            date(1999, 1, 4) if mode == "backfill" else today - timedelta(days=config.overlap_days)
        )
        for currency in config.currencies:
            adapter = EcbExchangeRateAdapter(currencies=(currency,), start_date=start, end_date=today)
            yield response(adapter.source_url, "csv", adapter)
    else:
        raise ValueError("Unknown source")
