#!/usr/bin/env python3
"""Fill an event with made-up applications for a rehearsal. Stdlib only.

It reads the public form from the apply link and submits answers the same way the
participant screen does, so it works with whatever questions the form has (base
questions, generated retreat questions, hand-made ones, conditions included).

  python3 scripts/seed_applications.py https://scene.greengroove.app/apply/<eventId>/<formId>
  python3 scripts/seed_applications.py <link> --count 50 --dry-run

The form must be accepting applications. Names and phone numbers are invented
(phones are 010-0000-00NN). There is no API that deletes an application, so use this
only on rehearsal data that is wiped before real applications open
(docs/devops/home-server.md, section 5).
"""
import argparse
import datetime as dt
import json
import random
import re
import secrets
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

SURNAMES = "김 김 김 김 이 이 이 박 박 최 최 정 정 강 조 윤 장 임 한 오 서 신 권 황 안 송 전 홍 유 고 문 양 손 배 백 허 남 심 노 하".split()
GIVEN = (
    "민준 서준 도윤 예준 시우 하준 지호 주원 지후 준우 건우 우진 선우 현우 지훈 유준 연우 서진 은우 민재 "
    "정우 승우 지환 승현 태윤 성민 재원 동현 수호 한결 서연 서윤 지우 서현 하은 하윤 민서 지유 윤서 채원 "
    "수아 지아 지윤 은서 다은 예은 수빈 소율 예린 유진 가은 나연 하린 소연 은지 혜원 주은 세아 다인 예지"
).split()
AREAS = "강남 서초 송파 잠실 분당 판교 수지 동탄 일산 노원 마포 목동 관악 안양 부천 인천 수원 용인".split()
NOTES = [
    "잘 부탁드립니다.",
    "금요일 저녁에 퇴근하고 합류할 예정입니다.",
    "토요일 오후에 먼저 나가야 합니다.",
    "알레르기가 있어 식사 때 확인 부탁드려요.",
    "처음 참석합니다. 기대돼요!",
    "아이와 함께 갑니다.",
    "늦게 도착할 수 있어요.",
    "특별한 사항 없습니다.",
]


def main() -> int:
    parser = argparse.ArgumentParser(description="Submit made-up applications to a SCENE form.")
    parser.add_argument("link", help="apply link: https://<host>/apply/<eventId>/<formId>")
    parser.add_argument("--count", type=int, default=50)
    parser.add_argument("--api", help="API origin when it differs from the link's (e.g. http://localhost:8080)")
    parser.add_argument("--seed", type=int, default=2027, help="same seed, same people")
    parser.add_argument("--dry-run", action="store_true", help="print the applications without sending them")
    args = parser.parse_args()

    match = re.search(r"/apply/([0-9a-fA-F-]{36})/([0-9a-fA-F-]{36})", args.link)
    if not match:
        print("신청 링크 모양이 아니에요. 예: https://scene.greengroove.app/apply/<eventId>/<formId>", file=sys.stderr)
        return 2
    event_id, form_id = match.groups()
    origin = args.api or "{0.scheme}://{0.netloc}".format(urllib.parse.urlsplit(args.link))
    base = f"{origin.rstrip('/')}/api/v1/public/events/{event_id}/forms/{form_id}"

    status, form = call("GET", base)
    if status != 200:
        print(f"신청서를 읽지 못했어요: {status} {form.get('code', '')}", file=sys.stderr)
        if form.get("code") == "FORM_CLOSED":
            print("신청 받기가 꺼져 있어요. 행사를 시작하고 신청 받기를 켠 뒤 다시 실행해 주세요.", file=sys.stderr)
        return 1
    fields = sorted(form["fields"], key=lambda field: field["position"])

    rng = random.Random(args.seed)
    names = rng.sample(sorted({s + g for s in set(SURNAMES) for g in GIVEN}), args.count)
    sent = 0
    for index, name in enumerate(names, start=1):
        answers = build(fields, name, index, rng)
        if args.dry_run:
            print(json.dumps(describe(fields, answers), ensure_ascii=False))
            continue
        status, body = call("POST", base + "/applications", {"answers": answers})
        if status != 201:
            print(f"{index}번째({name}) 실패: {status} {body.get('code', '')}", file=sys.stderr)
            print(json.dumps(describe(fields, answers), ensure_ascii=False), file=sys.stderr)
            print(f"{sent}건까지 들어갔어요.", file=sys.stderr)
            return 1
        sent += 1
        print(f"{index:>3}/{args.count} {name}")
        time.sleep(0.1)
    print("보내지 않았어요 (--dry-run)." if args.dry_run else f"가짜 신청 {sent}건을 넣었어요.")
    return 0


def call(method: str, url: str, body: dict | None = None) -> tuple[int, dict]:
    # The server checks that the CSRF cookie and header match; the client picks the value.
    token = secrets.token_hex(16)
    headers = {"Accept": "application/json", "User-Agent": "scene-seed/1"}
    data = None
    if body is not None:
        data = json.dumps(body).encode()
        headers.update({"Content-Type": "application/json", "Cookie": f"XSRF-TOKEN={token}", "X-XSRF-TOKEN": token})
    request = urllib.request.Request(url, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return response.status, json.loads(response.read() or b"{}")
    except urllib.error.HTTPError as error:
        raw = error.read()
        try:
            return error.code, json.loads(raw)
        except ValueError:
            return error.code, {"code": raw[:200].decode(errors="replace")}


def build(fields: list[dict], name: str, index: int, rng: random.Random) -> list[dict]:
    """Walks the questions in order like the server: only shown questions and options are answered."""
    kept: dict[str, dict] = {}
    items = []
    for field in fields:
        if field.get("hidden") or not holds(field.get("showWhen"), kept):
            continue
        options = [
            option
            for option in field["config"].get("options") or []
            if not option.get("hidden") and holds(option.get("showWhen"), kept)
        ]
        value = answer(field, options, name, index, rng)
        if value is None:
            continue
        kept[field["fieldId"]] = value
        items.append({"fieldId": field["fieldId"], "value": value})
    return items


def holds(condition: dict | None, kept: dict[str, dict]) -> bool:
    if not condition:
        return True
    given = kept.get(condition["fieldId"])
    if given is None:
        return False
    if "equals" in condition:
        return given.get("value") is condition["equals"]
    picked = [given["optionId"]] if "optionId" in given else given.get("optionIds", [])
    return any(option in condition["optionIds"] for option in picked)


def answer(field: dict, options: list[dict], name: str, index: int, rng: random.Random) -> dict | None:
    config = field["config"]
    kind = field["answerType"]
    system = field.get("systemKey")
    required = field["required"] or system in ("NAME", "PHONE", "COHORT")
    if not required and rng.random() < 0.3:
        return None
    if kind in ("SHORT_TEXT", "LONG_TEXT"):
        limit = config.get("maxLength") or 200
        if system == "NAME":
            text = name
        elif system == "PHONE" or config.get("format") == "PHONE":
            text = f"010-0000-{index:04d}"
        elif system == "COHORT":
            text = f"{rng.choice([*range(80, 100), *range(0, 9)]):02d}"
        elif config.get("format") == "DIGITS":
            text = str(rng.randint(1, 10 ** min(limit, 4) - 1))
        elif any(word in field["label"] for word in ("지역", "출발", "사는", "동네", "어디")):
            text = rng.choice(AREAS)
        elif "셀" in field["label"] or "조" in field["label"] or "소속" in field["label"]:
            text = f"{rng.randint(1, 8)}셀"
        else:
            text = rng.choice(NOTES)
        return {"text": text[:limit]}
    if kind in ("SINGLE_CHOICE", "DROPDOWN"):
        return {"optionId": rng.choice(options)["optionId"]} if options else None
    if kind == "MULTI_CHOICE":
        if not options:
            return None
        low = max(config.get("minSelect") or 0, 1)
        high = min(config.get("maxSelect") or len(options), len(options))
        picked = rng.sample(options, rng.randint(min(low, high), high))
        chosen = {option["optionId"] for option in picked}
        return {"optionIds": [option["optionId"] for option in options if option["optionId"] in chosen]}
    if kind == "DATE":
        moment = pick_moment(config, rng)
        return {"dateTime": moment} if config.get("includeTime") else {"date": moment}
    if kind == "DATE_RANGE":
        start, end = sorted([pick_moment(config, rng), pick_moment(config, rng)])
        return {"start": start, "end": end}
    if kind == "NUMBER":
        low = int(config["min"]) if config.get("min") is not None else 1
        high = int(config["max"]) if config.get("max") is not None else low + 3
        return {"number": rng.randint(low, min(high, low + 5))}
    if kind == "YES_NO":
        consent = config.get("style") == "CONSENT"
        return {"value": True if consent and field["required"] else rng.random() < 0.5}
    return None


def pick_moment(config: dict, rng: random.Random) -> str:
    """A date (or date and hour) inside the question's allowed range."""
    with_time = bool(config.get("includeTime"))
    low = parse(config.get("min")) or dt.datetime.combine(dt.date.today(), dt.time(9))
    high = parse(config.get("max"), end=True) or low + dt.timedelta(days=3)
    if with_time:
        hours = max(int((high - low).total_seconds() // 3600), 0)
        return (low + dt.timedelta(hours=rng.randint(0, hours))).strftime("%Y-%m-%dT%H:%M")
    return (low.date() + dt.timedelta(days=rng.randint(0, max((high.date() - low.date()).days, 0)))).isoformat()


def parse(value: str | None, end: bool = False) -> dt.datetime | None:
    if not value:
        return None
    if "T" in value:
        return dt.datetime.fromisoformat(value)
    return dt.datetime.combine(dt.date.fromisoformat(value), dt.time(23 if end else 0))


def describe(fields: list[dict], answers: list[dict]) -> dict:
    """Label → readable answer, for --dry-run and failure output."""
    by_id = {field["fieldId"]: field for field in fields}
    out = {}
    for item in answers:
        field = by_id[item["fieldId"]]
        labels = {option["optionId"]: option["label"] for option in field["config"].get("options") or []}
        value = item["value"]
        if "optionId" in value:
            shown = labels[value["optionId"]]
        elif "optionIds" in value:
            shown = [labels[option] for option in value["optionIds"]]
        else:
            shown = next(iter(value.values())) if len(value) == 1 else value
        out[field["label"]] = shown
    return out


if __name__ == "__main__":
    sys.exit(main())
