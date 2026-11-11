# Hours and days in the reader's zone

**Rule** (`source/frontend/CLAUDE.md`): anything that shows people an hour or a day — the log's day headings, the habit charts' hours, calendar and runs — is worked out in the browser from `Date`'s local getters (`getHours`, `getDate`) and local constructors (`new Date(y, m, d - back)`), never from the UTC getters and never on the server.

**Why.** Every entry is stored as UTC (`OccurredAtUtc`; the API returns an ISO instant). The server has no idea where the reader is, and Container Apps runs in UTC anyway. Summing per hour on the server, or with `getUTCHours`, produces a chart that renders perfectly and is simply wrong: during the 2026-11-11 research the same 41 entries bucketed in UTC showed meals at 12 and 21, in the neighborhood's own clock at 7 and 16. The log already groups days in local time (`HistoryLog.byDay`), so the charts follow it; the habits endpoint (`GET /api/king/habits`) therefore returns instants, not buckets, and keeps the server dumb — which also means nothing about the reader (not even a time zone) travels to it.

**Rejected.** A `tz` query parameter with server-side bucketing: it needs `TimeZoneInfo` and tzdata in the image, a validator, and it tells the server something about the reader for no gain. Pre-bucketing by UTC hour and shifting in the browser: wrong across a daylight-saving change inside the window.

**Daylight saving.** Local constructors normalize `new Date(y, m, d - back)` across month ends and DST changes (a 23- or 25-hour day is still one calendar day), which is why the calendar is built that way rather than by subtracting 86,400,000 ms.
