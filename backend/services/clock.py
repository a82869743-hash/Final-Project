"""Indian Standard Time helpers.

All accident statistics (MoRTH / NCRB time-of-day and month tables) are in
local Indian time, but the backend runs on UTC servers (Render). Anything that
picks a time-of-day slot, a month or a day/night state must use IST.
"""

from datetime import datetime, timedelta, timezone

IST = timezone(timedelta(hours=5, minutes=30), name="IST")


def now_ist() -> datetime:
    return datetime.now(IST)


def to_ist(dt: datetime) -> datetime:
    """Convert an aware datetime to IST; naive datetimes are assumed to be IST already."""
    return dt.astimezone(IST) if dt.tzinfo else dt.replace(tzinfo=IST)
