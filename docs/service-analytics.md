# Service analytics definitions

Reports are calculated in UTC from immutable request creation history. **Created** counts requests created in the selected interval; **resolved** counts requests whose current status category is `DONE`; **backlog** is created minus resolved. Optional `from` and `to` filters are inclusive of `from` and exclusive of `to`, using ISO timestamps. Groups smaller than five requests are suppressed to protect customer and agent privacy. Late events are included according to their persisted event timestamp, so rerunning the same interval is reproducible.
