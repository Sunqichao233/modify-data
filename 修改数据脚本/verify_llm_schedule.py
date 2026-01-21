import csv
from datetime import datetime, timedelta

INPUT_FILE = "副本LLM+data基础_修改_new.csv"

def parse_dt(s: str):
    s = (s or "").strip()
    if not s:
        return None
    try:
        m = __import__("re").match(r"^(\d{4})/(\d{1,2})/(\d{1,2})\s+(\d{1,2}):(\d{2})$", s)
        if not m:
            return None
        y, mo, d, h, mi = map(int, m.groups())
        return datetime(y, mo, d, h, mi)
    except Exception:
        return None

def is_workday(dt: datetime) -> bool:
    return dt.weekday() < 5

def get_next_workday(dt: datetime) -> datetime:
    nd = dt + timedelta(days=1)
    while nd.weekday() >= 5:
        nd += timedelta(days=1)
    return nd

def main():
    with open(INPUT_FILE, "r", encoding="utf-8-sig", newline="") as f:
        reader = csv.reader(f)
        header = next(reader)
        # column indices
        try:
            user_idx = header.index("user_id")
            flag_idx = header.index("flag")
            utc_idx = header.index("new_started_at_UTC")
            next_idx = header.index("next_started_at")
            rest_idx = header.index("rest_time")
            dur_idx = header.index("course_video_length")
        except ValueError:
            print("Header columns not found; header=", header)
            return

        rows = list(reader)

    # group by user_id preserving order
    from collections import defaultdict
    groups = defaultdict(list)
    for i, r in enumerate(rows):
        groups[r[user_idx]].append(i)

    total_pairs = 0
    matches = 0
    mismatches = []

    for uid, idxs in groups.items():
        # scan consecutive non-留 rows
        prev_i = None
        for i in idxs:
            r = rows[i]
            if r[flag_idx].strip() == "留":
                continue
            if prev_i is None:
                prev_i = i
                continue
            r_prev = rows[prev_i]
            if r_prev[flag_idx].strip() == "留":
                prev_i = i
                continue

            total_pairs += 1
            prev_next = parse_dt(r_prev[next_idx])
            rest = int((r_prev[rest_idx] or "0")) if (r_prev[rest_idx] or "").isdigit() else 0
            cur_utc = parse_dt(r[utc_idx])

            if prev_next is None or cur_utc is None:
                prev_i = i
                continue

            expected = prev_next + timedelta(minutes=rest)

            # lunch window (consider end time falling in lunch)
            lunch_start = expected.replace(hour=12, minute=0, second=0, microsecond=0)
            lunch_end = expected.replace(hour=13, minute=0, second=0, microsecond=0)
            # compute end with current row's duration
            dur_s = r[dur_idx]
            def parse_dur(s: str) -> int:
                s = (s or "").strip()
                if not s:
                    return 0
                try:
                    parts = s.split(":")
                    if len(parts) == 3:
                        h, m, sec = parts
                        mm = int(m)
                    elif len(parts) == 2:
                        h = "0"; m, sec = parts
                        mm = int(m)
                    else:
                        return 0
                    return mm
                except Exception:
                    return 0
            minutes = parse_dur(dur_s)
            expected_end = expected + timedelta(minutes=minutes)
            if expected_end > lunch_start and expected_end < lunch_end:
                expected = lunch_end
            elif expected < lunch_start and expected_end > lunch_end:
                expected = lunch_end

            # after hours
            if expected.hour >= 18 or (expected.hour == 17 and expected.minute > 30):
                expected = get_next_workday(expected).replace(hour=9, minute=0)

            # weekend
            if not is_workday(expected):
                expected = get_next_workday(expected).replace(hour=9, minute=0)

            if expected == cur_utc:
                matches += 1
            else:
                exp_str = f"{expected.year}/{expected.month}/{expected.day} {expected.hour}:{expected.minute:02d}"
                mismatches.append((uid, prev_i, i, r_prev[utc_idx], r_prev[next_idx], r_prev[rest_idx], r[utc_idx], exp_str))

            prev_i = i

    print(f"检查用户连续行对: {total_pairs}")
    print(f"符合调度规则: {matches}")
    print(f"不符合: {len(mismatches)}")
    for m in mismatches[:5]:
        uid, pi, ci, prev_utc, prev_next, prev_rest, cur_utc, exp = m
        print(f"UID={uid} 行{pi}->{ci}: prevUTC={prev_utc}, prevNext={prev_next}, rest={prev_rest}, curUTC={cur_utc}, 期望={exp}")

if __name__ == "__main__":
    main()
