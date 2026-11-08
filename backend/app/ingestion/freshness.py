"""Conservative observation freshness; successful fetching alone is not freshness."""

from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo


def source_today():
    return datetime.now(ZoneInfo("Europe/Brussels")).date()


def easter(year):
    a = year % 19
    b, c = divmod(year, 100)
    d, e = divmod(b, 4)
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i, k = divmod(c, 4)
    offset = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * offset) // 451
    month, day = divmod(h + offset - 7 * m + 114, 31)
    return date(year, month, day + 1)


def ecb_publication_day(day):
    holidays = {(1, 1), (5, 1), (12, 25), (12, 26)}
    return (
        day.weekday() < 5
        and (day.month, day.day) not in holidays
        and day not in {easter(day.year) - timedelta(days=2), easter(day.year) + timedelta(days=1)}
    )


def freshness(source, latest, today):
    if latest is None:
        return "stale"
    if source == "ecb_exr":
        # Previous completed TARGET publication day avoids assumptions about today's release time.
        due = today - timedelta(days=1)
        while not ecb_publication_day(due):
            due -= timedelta(days=1)
        return "current" if latest >= due else "stale"
    limit = 14 if source == "ec_weekly_oil_bulletin" else 65
    return "current" if (today - latest).days <= limit else "stale"
