---
windows:
  weekday: ["16:00-21:30"]
  saturday: ["10:00-18:00"]
  sunday: ["12:00-20:00"]
never: ["friday 18:00-23:59"]
max_hours_per_day: 2
session_minutes: 45
buffer_minutes: 30
days_ahead: 21
---

# Study rules

The block above is what the planner reads. Times are 24-hour. You can name any
day instead of `weekday` (`monday`, `tuesday`, ...) to give it its own hours.
`never` blocks out a stretch of a day. `buffer_minutes` is the gap kept between
a study session and anything already on your calendar.

Plain-English version, for you:

- Weekdays 4:00pm to 9:30pm, Saturday 10am to 6pm, Sunday noon to 8pm
- Never on Friday after 6pm
- Max 2 hours of study per day, in 45-minute sessions
- Keep 30 minutes clear around anything already on the calendar
