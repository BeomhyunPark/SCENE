import json, sys, subprocess, urllib.request, http.cookiejar, uuid
BASE = "http://localhost:8080"
EVENT = "00000000-0000-4000-8000-000000000020"
OWNER = "00000000-0000-4000-8000-000000000001"
jar = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar), urllib.request.ProxyHandler({}))

def call(method, path, body=None, headers=None, expect=None):
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

start, end = sys.argv[1], sys.argv[2]
subprocess.run(["docker", "exec", "scene-local-postgres-1", "psql", "-U", "scene", "-d", "scene", "-c",
    f"UPDATE events SET start_date='{start}', end_date='{end}' WHERE id='{EVENT}'"], check=True, capture_output=True)
call("POST", "/api/v1/operator/auth/login", {"userId": OWNER})
ev = f"/api/v1/operator/events/{EVENT}"
form = call("POST", ev + "/forms", {})
fid = form["formId"]
sched = [{"breakfast": False, "lunch": False, "dinner": True, "worship": True},
         {"breakfast": True, "lunch": True, "dinner": True, "worship": True},
         {"breakfast": True, "lunch": True, "dinner": False, "worship": False}]
setup = {"gender": True, "middleGroup": False, "cell": False,
         "attendance": {"partial": True, "worshipOnly": True, "mode": "RANGE"}, "schedule": sched,
         "transport": {"groupBus": False, "worshipShuttle": False, "car": False, "publicTransit": False, "support": False}}
call("PUT", f"{ev}/forms/{fid}/setup", setup)
detail = call("GET", ev)
call("POST", ev + "/activate", {"expectedLifecycleVersion": detail["lifecycleVersion"]})
call("PATCH", f"{ev}/forms/{fid}", {"acceptingApplications": True})
fields = call("GET", f"{ev}/forms/{fid}")["fields"]
ids = {}
for f in fields:
    key = f.get("presetKey") or f.get("systemKey")
    if key: ids[key] = f["fieldId"]
call("POST", ev + "/schedule/items", {"day": 2, "startTime": "07:30", "title": "아침 식사", "category": "MEAL",
     "audience": [{"type": "ALL"}], "slotId": "opt_d2_breakfast"})

def submit(name, n, extra):
    answers = [{"fieldId": ids["NAME"], "text": name}, {"fieldId": ids["PHONE"], "text": f"010-7777-{n:04d}"},
               {"fieldId": ids["COHORT"], "text": "94"}, {"fieldId": ids["GENDER"], "value": {"optionId": "opt_female"}}]
    if "CONSENT" in ids: answers.append({"fieldId": ids["CONSENT"], "value": {"value": True}})
    for k, v in extra.items(): answers.append({"fieldId": ids[k], "value": v})
    req = urllib.request.Request(f"{BASE}/api/v1/public/events/{EVENT}/forms/{fid}/applications",
        data=json.dumps({"pin": "730914", "answers": answers}).encode(), method="POST")
    req.add_header("Content-Type", "application/json"); req.add_header("Cookie", "XSRF-TOKEN=t"); req.add_header("X-XSRF-TOKEN", "t")
    with urllib.request.build_opener(urllib.request.ProxyHandler({})).open(req) as r:
        return json.loads(r.read().decode())["participantId"]

people = {}
full = {"ATTENDANCE": {"optionId": "opt_full"}}
def partial(a, d):
    return {"ATTENDANCE": {"optionId": "opt_partial"}, "ARRIVAL_SLOT": {"optionId": a}, "DEPARTURE_SLOT": {"optionId": d}}
for i in range(1, 6):
    people[f"전체{i}"] = submit(f"전체{i}", i, full)
people["오늘점심"] = submit("오늘점심", 20, partial("opt_d2_lunch", "opt_d3_lunch"))
people["오늘저녁"] = submit("오늘저녁", 21, partial("opt_d2_dinner", "opt_d3_lunch"))
people["오늘아침"] = submit("오늘아침", 22, partial("opt_d2_breakfast", "opt_d3_lunch"))
people["첫날만"] = submit("첫날만", 23, partial("opt_d1_dinner", "opt_d1_worship"))
people["모름"] = submit("모름", 24, partial("opt_d1_dinner", "opt_d3_lunch"))
# 떠나는 칸 답을 지워 참석 칸을 모르게 한다 (MealCountHttpIT와 같은 방법).
subprocess.run(["docker", "exec", "scene-local-postgres-1", "psql", "-U", "scene", "-d", "scene", "-c",
    "DELETE FROM answers a USING applications p, participants q WHERE a.application_id = p.id AND p.participant_id = q.id "
    f"AND q.name = '모름' AND p.event_id = '{EVENT}' AND a.field_id = '{ids['DEPARTURE_SLOT']}'"], check=True, capture_output=True)
for name in ["전체1", "전체2", "전체3"]:
    call("POST", ev + "/check-ins", {"mode": "MANUAL", "participantId": people[name]}, {"Idempotency-Key": str(uuid.uuid4())})
json.dump(people, open(sys.argv[3], "w"), ensure_ascii=False)
print("seeded", len(people), "form", fid)
