# G5 (#460) 실제 클릭 준비: 로컬 서버(local 프로필)에 행사·신청서·신청 6명·방·배정·공개를 HTTP API로 만든다.
# 사용: python3 seed.py people.json
import json, sys, subprocess, urllib.request, http.cookiejar
BASE = "http://localhost:8080"
EVENT = "00000000-0000-4000-8000-000000000020"
OWNER = "00000000-0000-4000-8000-000000000001"
jar = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar), urllib.request.ProxyHandler({}))

def call(method, path, body=None, headers=None):
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(BASE + path, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    req.add_header("Cookie", "; ".join([f"{c.name}={c.value}" for c in jar] + ["XSRF-TOKEN=t"]))
    req.add_header("X-XSRF-TOKEN", "t")
    for k, v in (headers or {}).items():
        req.add_header(k, v)
    try:
        with opener.open(req) as r:
            text = r.read().decode()
            return json.loads(text) if text else None
    except urllib.error.HTTPError as e:
        print(method, path, e.code, e.read().decode()[:400]); sys.exit(1)

subprocess.run(["docker", "exec", "scene-local-postgres-1", "psql", "-U", "scene", "-d", "scene", "-c",
    f"UPDATE events SET start_date='2027-01-22', end_date='2027-01-24' WHERE id='{EVENT}'"], check=True, capture_output=True)
call("POST", "/api/v1/operator/auth/login", {"userId": OWNER})
ev = f"/api/v1/operator/events/{EVENT}"
fid = call("POST", ev + "/forms", {})["formId"]
sched = [{"breakfast": False, "lunch": False, "dinner": True, "worship": True},
         {"breakfast": True, "lunch": True, "dinner": True, "worship": True},
         {"breakfast": True, "lunch": True, "dinner": False, "worship": False}]
call("PUT", f"{ev}/forms/{fid}/setup", {"gender": True, "middleGroup": False, "cell": False,
     "attendance": {"partial": True, "worshipOnly": True, "mode": "RANGE"}, "schedule": sched,
     "transport": {"groupBus": False, "worshipShuttle": False, "car": False, "publicTransit": False, "support": False}})
detail = call("GET", ev)
call("POST", ev + "/activate", {"expectedLifecycleVersion": detail["lifecycleVersion"]})
call("PATCH", f"{ev}/forms/{fid}", {"acceptingApplications": True})
ids = {}
for f in call("GET", f"{ev}/forms/{fid}")["fields"]:
    key = f.get("presetKey") or f.get("systemKey")
    if key: ids[key] = f["fieldId"]

def submit(name, n, cohort, attendance):
    answers = [{"fieldId": ids["NAME"], "text": name}, {"fieldId": ids["PHONE"], "text": f"010-4600-{n:04d}"},
               {"fieldId": ids["COHORT"], "text": cohort}, {"fieldId": ids["GENDER"], "value": {"optionId": "opt_female"}},
               {"fieldId": ids["ATTENDANCE"], "value": {"optionId": attendance}}]
    if "CONSENT" in ids: answers.append({"fieldId": ids["CONSENT"], "value": {"value": True}})
    if attendance == "opt_worship":  # 집회만: 참석할 집회 (필수)
        answers.append({"fieldId": ids["MEALS"], "value": {"optionIds": ["opt_d1_worship"]}})
    req = urllib.request.Request(f"{BASE}/api/v1/public/events/{EVENT}/forms/{fid}/applications",
        data=json.dumps({"pin": "730914", "answers": answers}).encode(), method="POST")
    req.add_header("Content-Type", "application/json"); req.add_header("Cookie", "XSRF-TOKEN=t"); req.add_header("X-XSRF-TOKEN", "t")
    with urllib.request.build_opener(urllib.request.ProxyHandler({})).open(req) as r:
        return json.loads(r.read().decode())["participantId"]

people = {
    "김하늘": submit("김하늘", 1, "94", "opt_full"),
    "이수아": submit("이수아", 2, "95", "opt_full"),
    "박서준": submit("박서준", 3, "96", "opt_full"),
    "최예린": submit("최예린", 4, "97", "opt_full"),
    "정집회": submit("정집회", 5, "98", "opt_worship"),
    "한늦게": submit("한늦게", 6, "99", "opt_full"),
}

def room(name, note):
    return call("POST", ev + "/rooms", {"name": name, "locationNote": note, "capacity": 4, "genderOptionId": None})["room"]["roomId"]

r301 = room("301호", "본관 3층 왼쪽")
r302 = room("302호", "본관 3층 오른쪽")
def change(p, frm, to):
    return {"participantId": people[p], "fromRoomId": frm, "toRoomId": to}
call("POST", ev + "/room-assignments", {"changes": [change("김하늘", None, r301), change("이수아", None, r301),
     change("박서준", None, r302), change("최예린", None, r302)]})
version = call("GET", ev + "/room-board")["boardVersion"]
published = call("POST", ev + "/rooms/publish", {"expectedBoardVersion": version, "confirmUnassigned": True,
     "confirmNotLodging": True, "notify": False})
# 공개 뒤 작업본만 고친다: 최예린을 301호로, 한늦게를 302호로. 표·명단은 공개본(최예린 302호, 한늦게 미배정)이어야 한다.
call("POST", ev + "/room-assignments", {"changes": [change("최예린", r302, r301), change("한늦게", None, r302)]})
json.dump({"people": people, "rooms": {"301호": r301, "302호": r302}, "publish": published["result"]},
          open(sys.argv[1], "w"), ensure_ascii=False)
print("seeded", len(people), "publish", published["result"])
