#!/usr/bin/env python3
"""로컬 서버에 가짜 수련회 신청자 150명을 넣는다. local profile 전용. Stdlib only.

운영자 API로 행사·신청서·신청서 설정을 만들고, 공개 신청 경로로 한 명씩 제출한다.
서버가 모든 답을 검증하므로 DB에 직접 넣는 것보다 잘못된 행이 생기지 않는다. 스크립트도
제출 전에 showWhen을 계산해, 시나리오가 의도한 답이 하나라도 화면에서 숨겨지면 멈춘다
(서버는 숨겨진 답을 오류 없이 버리기 때문이다).

구성 (기본값):
- 150명 = 전체 참석 85 + 부분 참석 65 (도착~출발 부분 참석 50, 집회만 참석 15)
- 출생연도 1980–2000 (또래 80–99, 00), 여 78 · 남 72
- 일정 2027-01-22 (금) 저녁 ~ 01-24 (일) 점심, 집회는 금·토 저녁
- 이동: 단체 차량·집회 차량·자차(카풀 제공 포함)·합승·대중교통·이동 지원과 그 조합
  (같이 왔다가 따로 가기, 따로 왔다가 단체 차량으로 같이 가기, 당일 참석, 숙박 안 함 등)

사용:
  cd backend && docker compose up -d --wait
  ./gradlew bootRun --args='--spring.profiles.active=local'
  python3 scripts/seed_local_applicants.py            # 새 행사를 하나 만들고 150명을 넣는다

다시 실행하면 행사를 하나 더 만든다. 지우려면 backend에서 `docker compose down -v`.
"""
from __future__ import annotations

import argparse
import collections
import json
import random
import sys
import urllib.error
import urllib.request

OWNER_ID = "00000000-0000-4000-8000-000000000001"  # 로컬 시드 소유자
SPACE_ID = "00000000-0000-4000-8000-000000000010"  # 로컬 시드 공간
CSRF = "seed-local-csrf"

START, END = "2027-01-22", "2027-01-24"
SCHEDULE = [  # 금: 저녁·집회 / 토: 하루 종일 / 일: 아침·점심
    {"breakfast": False, "lunch": False, "dinner": True, "worship": True},
    {"breakfast": True, "lunch": True, "dinner": True, "worship": True},
    {"breakfast": True, "lunch": True, "dinner": False, "worship": False},
]
SETUP = {
    "gender": True,
    "middleGroup": True,
    "cell": True,
    "newcomer": True,
    "attendance": {"partial": True, "worshipOnly": True, "mode": "RANGE"},
    "schedule": SCHEDULE,
    "transport": {
        "groupBus": True,
        "worshipShuttle": True,
        "car": True,
        "publicTransit": True,
        "support": True,
        "partialByTime": True,
    },
}
SLOTS = [
    "opt_d1_dinner", "opt_d1_worship",
    "opt_d2_breakfast", "opt_d2_lunch", "opt_d2_dinner", "opt_d2_worship",
    "opt_d3_breakfast", "opt_d3_lunch",
]


# ---------------------------------------------------------------- HTTP


class Api:
    def __init__(self, base: str):
        self.base = base.rstrip("/")
        self.session: str | None = None

    def call(self, method: str, path: str, body=None, operator=True, expect=(200, 201, 204)):
        headers = {"Content-Type": "application/json", "X-XSRF-TOKEN": CSRF}
        cookies = [f"XSRF-TOKEN={CSRF}"]
        if operator and self.session:
            cookies.append(f"SCENE_SESSION={self.session}")
        headers["Cookie"] = "; ".join(cookies)
        data = None if body is None else json.dumps(body).encode()
        req = urllib.request.Request(self.base + path, data=data, method=method, headers=headers)
        try:
            with urllib.request.urlopen(req) as res:
                for name, value in res.headers.items():
                    if name.lower() == "set-cookie" and value.startswith("SCENE_SESSION="):
                        self.session = value.split(";", 1)[0].split("=", 1)[1]
                raw = res.read()
                status = res.status
        except urllib.error.HTTPError as e:
            raw, status = e.read(), e.code
        except urllib.error.URLError as e:
            sys.exit(
                f"{self.base}에 연결하지 못했다 ({e.reason}).\n"
                "backend에서 `docker compose up -d --wait` 후 "
                "`./gradlew bootRun --args='--spring.profiles.active=local'`로 서버를 먼저 띄운다.")
        if path.endswith("/auth/login") and status == 404:
            sys.exit("로그인 경로가 없다(404). 서버를 local profile로 띄웠는지 확인한다.")
        if status not in expect:
            sys.exit(f"{method} {path} -> {status}\n{raw.decode(errors='replace')}")
        return json.loads(raw) if raw else None


# ---------------------------------------------------------------- people

SURNAMES = (
    "김" * 22 + "이" * 15 + "박" * 9 + "최" * 5 + "정" * 5 + "강" * 3 + "조" * 3 + "윤" * 3
    + "장" * 3 + "임" * 3 + "한" * 2 + "오" * 2 + "서" * 2 + "신" * 2 + "권" * 2 + "황" * 2
    + "안" * 2 + "송" * 2 + "류" + "전" + "홍" + "고" + "문" + "양" + "손" + "배" + "백" + "허"
    + "남" + "심" + "노" + "하" + "곽" + "성" + "차" + "주" + "우" + "구" + "민" + "나" + "진"
)
FEMALE = (
    "지은 수진 은지 혜진 지현 민지 수연 현정 은영 지영 서연 지혜 유진 예진 소연 하은 다은 수빈 "
    "지원 미영 선영 보람 한나 슬기 아름 지수 은비 나래 혜원 민정 수정 윤정 정은 소희 예린 가은 "
    "다혜 세영 은혜 하나 예지 지민 채원 서현 유나 혜린 주희 승연 다솜 새롬 미진 은주 소영 경은"
).split()
MALE = (
    "민수 성민 준호 현우 지훈 동현 준영 승현 재원 상훈 진우 성진 민재 태현 정훈 우진 영훈 동욱 "
    "재혁 현준 건우 승민 도윤 지환 준혁 민혁 성훈 태윤 재민 영재 상민 형준 은호 시우 주원 한결 "
    "대현 경민 정우 원석 기현 승우 용준 민호 진혁 세훈 동훈 태호 광수 종민 재석 인호 석진"
).split()
# 출생연도별 가중치. 80년대 초반은 적고 80년대 후반~90년대 중반이 많다.
YEAR_WEIGHT = {y: w for y, w in zip(range(1980, 2001), [3, 3, 4, 4, 5, 6, 7, 8, 9, 9, 9, 9, 9, 8, 8, 7, 6, 6, 5, 4, 3])}
MIDDLE_GROUPS = [  # 중그룹은 또래로 나뉜다
    (1980, 1984, "모세"),
    (1985, 1988, "다윗"),
    (1989, 1992, "요셉"),
    (1993, 1996, "느헤미야"),
    (1997, 2000, "여호수아"),
]
AREAS = [
    "강남구 역삼동", "송파구 잠실동", "서초구 반포동", "마포구 합정동", "영등포구 여의도동",
    "성동구 왕십리", "광진구 구의동", "강서구 마곡동", "관악구 봉천동", "노원구 상계동",
    "분당 정자동", "판교", "수원 영통", "일산 백석동", "부천 중동", "하남 미사",
]
CARPOOL_NOTES = [None, "양재IC 경유 가능해요.", "잠실역에서도 태울 수 있어요.", "트렁크 공간 넉넉해요.", None, "출발 시간 조정 가능해요."]


def phone(rng: random.Random, used: set) -> str:
    while True:
        p = f"010-{rng.randint(2000, 9999)}-{rng.randint(0, 9999):04d}"
        if p not in used:
            used.add(p)
            return p


def make_people(rng: random.Random, n: int, female: int):
    genders = ["F"] * female + ["M"] * (n - female)
    rng.shuffle(genders)
    years = list(YEAR_WEIGHT)
    weights = [YEAR_WEIGHT[y] for y in years]
    names, phones, people = set(), set(), []
    for g in genders:
        while True:
            name = rng.choice(SURNAMES) + rng.choice(FEMALE if g == "F" else MALE)
            if name not in names:
                names.add(name)
                break
        year = rng.choices(years, weights)[0]
        people.append({"name": name, "phone": phone(rng, phones), "gender": g, "year": year})
    return people


# ---------------------------------------------------------------- scenarios
# 한 시나리오 = 참석 방식, (부분 참석이면) 도착·출발 칸, (집회만이면) 집회, 가는 길·오는 길,
# 집회 차량 회차. "car"·"ride"면 오는 길은 묻지 않는다(같은 차로 돌아간다).


def S(count, att, label, tin, tout=None, arr=None, dep=None, worship=None, sin=None, sout=None,
      offer=None, notes=None):
    return {"count": count, "att": att, "label": label, "in": tin, "out": tout, "arr": arr,
            "dep": dep, "worship": worship, "sin": sin, "sout": sout, "offer": offer,
            "notes": notes or []}


SCENARIOS = [
    # ---- 전체 참석 85
    S(52, "full", "전체 · 단체 차량 왕복", "group", "group"),
    S(6, "full", "전체 · 자차, 카풀 제공", "car", offer=True),
    S(4, "full", "전체 · 자차, 카풀 없음", "car", offer=False),
    S(9, "full", "전체 · 자차 합승", "ride"),
    S(4, "full", "전체 · 단체 차량으로 와서 대중교통으로 따로 귀가", "group", "public"),
    S(4, "full", "전체 · 대중교통으로 따로 와서 단체 차량으로 귀가", "public", "group"),
    S(3, "full", "전체 · 대중교통 왕복", "public", "public"),
    S(2, "full", "전체 · 이동 지원 왕복", "support", "support"),
    S(1, "full", "전체 · 단체 차량으로 와서 이동 지원으로 귀가", "group", "support"),
    # ---- 부분 참석(도착~출발) 50
    S(4, "partial", "같이 왔다가 토 집회 후 집회 차량으로 먼저 귀가", "group", "shuttle",
      "opt_d1_dinner", "opt_d2_worship", sout=["opt_d2"], notes=["일요일 오전에 교회 봉사가 있어요."]),
    S(4, "partial", "같이 왔다가 토 점심 후 대중교통으로 귀가", "group", "public",
      "opt_d1_dinner", "opt_d2_lunch", notes=["토요일 오후 근무가 있어요.", None]),
    S(3, "partial", "금요일만 · 같이 왔다가 금 집회 후 집회 차량으로 귀가(숙박 안 함)", "group", "shuttle",
      "opt_d1_dinner", "opt_d1_worship", sout=["opt_d1"], notes=["토요일 출근이라 금요일만 참석해요."]),
    S(3, "partial", "같이 왔다가 일 아침 후 대중교통으로 귀가", "group", "public",
      "opt_d1_dinner", "opt_d3_breakfast", notes=["주일 예배 반주가 있어서 일찍 나가요.", None]),
    S(4, "partial", "토 아침에 대중교통으로 따로 와서 단체 차량으로 같이 귀가", "public", "group",
      "opt_d2_breakfast", "opt_d3_lunch", notes=["금요일 야근이 있어요.", None]),
    S(4, "partial", "퇴근 후 금 집회 차량으로 합류, 단체 차량으로 같이 귀가", "shuttle", "group",
      "opt_d1_worship", "opt_d3_lunch", sin=["opt_d1"], notes=["퇴근하고 바로 갈게요.", None]),
    S(3, "partial", "토 집회 차량으로 합류, 단체 차량으로 같이 귀가", "shuttle", "group",
      "opt_d2_worship", "opt_d3_lunch", sin=["opt_d2"]),
    S(3, "partial", "토요일 당일치기 · 자차(숙박 안 함)", "car", None,
      "opt_d2_breakfast", "opt_d2_dinner", offer=False, notes=["토요일 낮에만 있어요."]),
    S(3, "partial", "토요일 당일 · 대중교통으로 와서 집회 차량으로 귀가(숙박 안 함)", "public", "shuttle",
      "opt_d2_lunch", "opt_d2_worship", sout=["opt_d2"]),
    S(2, "partial", "금 집회부터 일 아침까지 · 자차, 카풀 제공", "car", None,
      "opt_d1_worship", "opt_d3_breakfast", offer=True),
    S(3, "partial", "토 아침부터 끝까지 · 자차 합승", "ride", None, "opt_d2_breakfast", "opt_d3_lunch"),
    S(2, "partial", "처음부터 끝까지 있지만 숙박은 안 함 · 자차로 출퇴근", "car", None,
      "opt_d1_dinner", "opt_d3_lunch", offer=False,
      notes=["근처에 살아서 숙박은 안 하고 밤에는 집에서 자고 다시 와요."]),
    S(2, "partial", "중간에 나갔다가 다시 옴 · 단체 차량 왕복", "group", "group",
      "opt_d1_dinner", "opt_d3_lunch",
      notes=["토요일 점심 먹고 결혼식에 다녀와서 저녁 집회 전에 돌아와요.",
             "토요일 오후에 잠깐 병원에 다녀올게요."]),
    S(2, "partial", "토 아침부터 끝까지 · 이동 지원 왕복", "support", "support",
      "opt_d2_breakfast", "opt_d3_lunch"),
    S(2, "partial", "토 저녁에 대중교통으로 합류, 단체 차량으로 같이 귀가", "public", "group",
      "opt_d2_dinner", "opt_d3_lunch"),
    S(1, "partial", "일요일 아침에만 합류 · 자차(숙박 안 함)", "car", None,
      "opt_d3_breakfast", "opt_d3_lunch", offer=False, notes=["일요일 아침에 합류할게요."]),
    S(3, "partial", "금 집회 차량으로 와서 토 집회 차량으로 귀가", "shuttle", "shuttle",
      "opt_d1_worship", "opt_d2_worship", sin=["opt_d1"], sout=["opt_d2"]),
    S(1, "partial", "같이 왔다가 토 저녁 후 · 자차 합승", "ride", None, "opt_d1_dinner", "opt_d2_dinner"),
    S(1, "partial", "토 아침에 이동 지원으로 와서 토 집회 차량으로 귀가(숙박 안 함)", "support", "shuttle",
      "opt_d2_breakfast", "opt_d2_worship", sout=["opt_d2"]),
    # ---- 집회만 참석 15
    S(4, "worship", "집회만 · 금·토 집회, 집회 차량 왕복", "shuttle", "shuttle",
      worship=["opt_d1_worship", "opt_d2_worship"], sin=["opt_d1", "opt_d2"], sout=["opt_d1", "opt_d2"]),
    S(2, "worship", "집회만 · 금 집회, 집회 차량 왕복", "shuttle", "shuttle",
      worship=["opt_d1_worship"], sin=["opt_d1"], sout=["opt_d1"]),
    S(3, "worship", "집회만 · 토 집회, 집회 차량 왕복", "shuttle", "shuttle",
      worship=["opt_d2_worship"], sin=["opt_d2"], sout=["opt_d2"]),
    S(1, "worship", "집회만 · 금·토 집회, 자차, 카풀 제공", "car", worship=["opt_d1_worship", "opt_d2_worship"], offer=True),
    S(1, "worship", "집회만 · 금·토 집회, 자차", "car", worship=["opt_d1_worship", "opt_d2_worship"], offer=False),
    S(1, "worship", "집회만 · 토 집회, 자차 합승", "ride", worship=["opt_d2_worship"]),
    S(1, "worship", "집회만 · 토 집회, 대중교통으로 와서 집회 차량으로 귀가", "public", "shuttle",
      worship=["opt_d2_worship"], sout=["opt_d2"]),
    S(1, "worship", "집회만 · 금 집회, 집회 차량으로 와서 대중교통으로 귀가", "shuttle", "public",
      worship=["opt_d1_worship"], sin=["opt_d1"]),
    S(1, "worship", "집회만 · 금·토 집회, 이동 지원 왕복", "support", "support",
      worship=["opt_d1_worship", "opt_d2_worship"]),
]


def expand(rng: random.Random):
    out = []
    for s in SCENARIOS:
        for i in range(s["count"]):
            one = dict(s)
            one["note"] = s["notes"][i % len(s["notes"])] if s["notes"] else None
            out.append(one)
    rng.shuffle(out)
    return out


def assign_groups(rng: random.Random, people):
    """중그룹은 출생연도로, 셀은 중그룹 안에서 5–7명씩. 셀 이름은 셀 리더 이름이다.
    새가족은 셀이 아직 없고, 일부는 중그룹도 비워 둔다."""
    for p in people:
        p["middle"] = next(name for lo, hi, name in MIDDLE_GROUPS if lo <= p["year"] <= hi)
    by_group = collections.defaultdict(list)
    for p in people:
        if not p["newcomer"]:
            by_group[p["middle"]].append(p)
    for members in by_group.values():
        rng.shuffle(members)
        i = 0
        while i < len(members):
            size = rng.randint(5, 7)
            cell = members[i:i + size]
            if len(members) - (i + size) < 3:  # 너무 작은 셀을 남기지 않는다
                cell = members[i:]
            leader = min(cell, key=lambda m: m["year"])  # 또래 중 가장 선배가 리더
            for m in cell:
                m["cell"] = f"{leader['name']}셀"
            i += len(cell)
    for p in people:
        if p["newcomer"]:
            p["cell"] = None
            if rng.random() < 0.5:
                p["middle"] = None
    # 기존 멤버 몇 명은 선택 질문을 비워 둔다(현실적인 빈칸).
    for p in rng.sample([p for p in people if not p["newcomer"]], 4):
        p["middle"] = p["cell"] = None


# ---------------------------------------------------------------- answers


def visible(cond, answers) -> bool:
    if cond is None:
        return True
    if "anyOf" in cond:
        return any(visible(c, answers) for c in cond["anyOf"])
    got = answers.get(cond["fieldId"])  # 보이는 답만 들어 있다
    if got is None:
        return False
    if "equals" in cond:
        return got.get("value") is cond["equals"]
    ids = set(cond["optionIds"])
    if "optionId" in got:
        return got["optionId"] in ids
    return bool(ids & set(got.get("optionIds", [])))


def build_answers(form, person, sc, rng: random.Random):
    by_key = {}
    for f in form["fields"]:
        by_key[f["systemKey"] or f["presetKey"] or f["fieldId"]] = f
    att = {"full": "opt_full", "partial": "opt_partial", "worship": "opt_worship"}[sc["att"]]
    want = {
        "NAME": {"text": person["name"]},
        "PHONE": {"text": person["phone"]},
        "COHORT": {"text": f"{person['year'] % 100:02d}"},
        "GENDER": {"optionId": "opt_female" if person["gender"] == "F" else "opt_male"},
        "NEWCOMER": {"value": person["newcomer"]},
        "ATTENDANCE": {"optionId": att},
        "TRANSPORT_IN": {"optionId": "opt_" + sc["in"]},
        "CONSENT": {"value": True},
    }
    if person["middle"]:
        want["MIDDLE_GROUP"] = {"text": person["middle"]}
    if person["cell"]:
        want["CELL"] = {"text": person["cell"]}
    if sc["att"] == "partial":
        want["ARRIVAL_SLOT"] = {"optionId": sc["arr"]}
        want["DEPARTURE_SLOT"] = {"optionId": sc["dep"]}
        if sc["note"]:
            want["PARTIAL_NOTE"] = {"text": sc["note"]}
    if sc["att"] == "worship":
        want["MEALS"] = {"optionIds": sc["worship"]}
    if sc["sin"]:
        want["SHUTTLE_IN"] = {"optionIds": sc["sin"]}
    if sc["in"] == "car":
        want["CARPOOL_OFFER"] = {"value": bool(sc["offer"])}
        if sc["offer"]:
            want["CARPOOL_SEATS"] = {"number": rng.randint(1, 4)}
            want["CARPOOL_AREA"] = {"text": rng.choice(AREAS) + " 출발"}
            note = rng.choice(CARPOOL_NOTES)
            if note:
                want["CARPOOL_NOTE"] = {"text": note}
    if sc["in"] == "support":
        want["MOBILITY_IN"] = {"text": rng.choice(AREAS)}
    if sc["out"]:
        want["TRANSPORT_OUT"] = {"optionId": "opt_" + sc["out"]}
    if sc["sout"]:
        want["SHUTTLE_OUT"] = {"optionIds": sc["sout"]}
    if sc["out"] == "support":
        want["MOBILITY_OUT"] = {"text": rng.choice(AREAS)}

    unknown = set(want) - set(by_key)
    if unknown:
        sys.exit(f"신청서에 없는 질문: {unknown}")

    # position 순서로 보이는지 계산한다. 의도한 답이 숨겨지거나, 보이는 필수 질문이 비면 멈춘다.
    shown, out = {}, []
    for f in sorted(form["fields"], key=lambda f: f["position"]):
        key = f["systemKey"] or f["presetKey"] or f["fieldId"]
        on = visible(f["showWhen"], shown)
        if key not in want:
            if on and f["required"]:
                sys.exit(f"{person['name']} [{sc['label']}]: 보이는 필수 질문 {key}에 답이 없다")
            continue
        if not on:
            sys.exit(f"{person['name']} [{sc['label']}]: {key} 질문이 숨겨진다")
        value = want[key]
        options = {o["optionId"]: o for o in f["config"].get("options", [])}
        picked = [value["optionId"]] if "optionId" in value else value.get("optionIds", [])
        for oid in picked:
            if oid not in options or not visible(options[oid].get("showWhen"), shown):
                sys.exit(f"{person['name']} [{sc['label']}]: {key}의 보기 {oid}가 숨겨진다")
        shown[f["fieldId"]] = value
        out.append({"fieldId": f["fieldId"], "value": value})
    return out


# ---------------------------------------------------------------- main


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--base", default="http://localhost:8080")
    ap.add_argument("--name", default="[가짜 데이터] 2027 겨울 수련회")
    ap.add_argument("--seed", type=int, default=2027)
    args = ap.parse_args()
    rng = random.Random(args.seed)

    scenarios = expand(rng)
    total = len(scenarios)
    by_att = collections.Counter(s["att"] for s in scenarios)
    assert total == 150 and by_att["full"] == 85 and by_att["partial"] + by_att["worship"] == 65, by_att

    people = make_people(rng, total, female=78)
    # 새가족 12명. 카풀을 제공하는 사람은 새가족에서 뺀다.
    candidates = [i for i, s in enumerate(scenarios) if not s["offer"]]
    newcomers = set(rng.sample(candidates, 12))
    for i, p in enumerate(people):
        p["newcomer"] = i in newcomers
    assign_groups(rng, people)

    api = Api(args.base)
    api.call("POST", "/api/v1/operator/auth/login", {"userId": OWNER_ID})
    event = api.call("POST", f"/api/v1/operator/spaces/{SPACE_ID}/events", {
        "name": args.name, "startDate": START, "endDate": END,
        "place": "양평 수양관", "eventType": "RETREAT"})
    eid = event["eventId"]
    form = api.call("POST", f"/api/v1/operator/events/{eid}/forms", {})
    fid = form["formId"]
    api.call("PUT", f"/api/v1/operator/events/{eid}/forms/{fid}/setup", SETUP)
    api.call("POST", f"/api/v1/operator/events/{eid}/activate",
             {"expectedLifecycleVersion": event["lifecycleVersion"]})
    api.call("PATCH", f"/api/v1/operator/events/{eid}/forms/{fid}", {"acceptingApplications": True})
    public = api.call("GET", f"/api/v1/public/events/{eid}/forms/{fid}", operator=False)

    for person, sc in zip(people, scenarios):
        answers = build_answers(public, person, sc, rng)
        api.call("POST", f"/api/v1/public/events/{eid}/forms/{fid}/applications",
                 {"answers": answers}, operator=False, expect=(201,))
    print(f"행사 {eid} / 신청서 {fid}: {total}명 제출")

    # 서버 집계로 다시 확인한다.
    s = api.call("GET", f"/api/v1/operator/events/{eid}/applications/summary")
    a = s["attendance"]
    print(f"집계: 전체 {s['total']} · 전체참석 {a['full']} · 부분 {a['partial']} · 집회만 {a['worshipOnly']}")
    print("성별:", {o["label"]: o["count"] for o in s["gender"]["options"]})
    print("또래:", " ".join(f"{c['cohort']}:{c['count']}" for c in s["cohorts"]["items"]))
    print("숙박:", {n["label"]: n["count"] for n in s["lodging"]["nights"]})
    for way in ("in", "out"):
        print(f"이동 {way}:", {o["label"]: o["count"] for o in s["transport"][way]["options"] if o["count"]},
              "· 답 없음", s["transport"][way]["noAnswer"])
    print(f"카풀 제공 {s['carpool']['offerCount']}명 · 좌석 {s['carpool']['seatTotal']}")
    expected = (85, by_att["partial"], by_att["worship"])
    if (a["full"], a["partial"], a["worshipOnly"]) != expected or s["total"] != total:
        sys.exit(f"집계가 기대와 다르다: {expected}")
    print("\n시나리오별 인원:")
    for label, n in collections.Counter(sc["label"] for sc in scenarios).items():
        print(f"  {n:>3}  {label}")


if __name__ == "__main__":
    main()
