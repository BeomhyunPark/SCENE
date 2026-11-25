"""Usage: python3 -I setup.py (local server on :8080, Docker container scene-pg). Seeds a local 200-person retreat for the G3 click run: event via API, form questions and applications via SQL."""
import json, subprocess, urllib.request, uuid, random, sys
API = "http://localhost:8080"
SPACE = "00000000-0000-4000-8000-000000000010"
OWNER = "00000000-0000-4000-8000-000000000001"
CSRF = "dev-csrf"
random.seed(458)

def call(method, path, body=None, cookie=None):
    req = urllib.request.Request(API + path, method=method, data=None if body is None else json.dumps(body).encode())
    req.add_header("Content-Type", "application/json")
    req.add_header("X-XSRF-TOKEN", CSRF)
    req.add_header("Cookie", f"XSRF-TOKEN={CSRF}" + (f"; SCENE_SESSION={cookie}" if cookie else ""))
    with urllib.request.urlopen(req) as res:
        session = None
        for k, v in res.headers.items():
            if k.lower() == "set-cookie" and v.startswith("SCENE_SESSION="):
                session = v.split(";")[0].split("=", 1)[1]
        text = res.read().decode()
        return (json.loads(text) if text else None), session

def sql(text):
    subprocess.run(["docker", "exec", "-i", "scene-pg", "psql", "-q", "-v", "ON_ERROR_STOP=1", "-U", "scene", "-d", "scene"], input=text.encode(), check=True)

def q(v):
    return "NULL" if v is None else "'" + str(v).replace("'", "''") + "'"

_, cookie = call("POST", "/api/v1/operator/auth/login", {"userId": OWNER})
event, _ = call("POST", f"/api/v1/operator/spaces/{SPACE}/events", {"name": "겨울 수련회 200명 (G3 시험)"}, cookie)
event_id = event["eventId"]
out = subprocess.run(["docker", "exec", "scene-pg", "psql", "-At", "-U", "scene", "-d", "scene", "-c",
    f"SELECT id FROM forms WHERE event_id = '{event_id}' LIMIT 1"], capture_output=True, text=True, check=True).stdout.strip()
form_id = out or str(uuid.uuid4())
lines = ["BEGIN;", f"UPDATE events SET lifecycle_status = 'ACTIVE' WHERE id = '{event_id}';"]
if not out:
    lines.append(f"INSERT INTO forms (id, space_id, event_id) VALUES ('{form_id}', '{SPACE}', '{event_id}');")
lines.append(f"""UPDATE forms SET setup = '{{"generatedFor":{{"startDate":"2027-01-22","endDate":"2027-01-24"}},"attendance":{{"partial":true,"worshipOnly":true,"mode":"SLOTS"}}}}'::jsonb WHERE id = '{form_id}';""")
fields = {}
def preset(key, kind, config, system=None):
    fid = str(uuid.uuid4()); fields[key] = fid
    if system:
        lines.append(f"""INSERT INTO fields (id, space_id, event_id, form_id, kind, system_key, label, position, required)
          SELECT '{fid}', '{SPACE}', '{event_id}', '{form_id}', 'SYSTEM', '{system}', '또래', coalesce(max(position), -1) + 1, true FROM fields WHERE form_id = '{form_id}'
          WHERE NOT EXISTS (SELECT 1 FROM fields WHERE form_id = '{form_id}' AND system_key = '{system}');""".replace("FROM fields WHERE form_id = '" + form_id + "'\n          WHERE", "FROM fields WHERE form_id = '" + form_id + "' AND"))
        return
    lines.append(f"""INSERT INTO fields (id, space_id, event_id, form_id, kind, label, position, answer_type, required, config, preset_key, preset_state)
      SELECT '{fid}', '{SPACE}', '{event_id}', '{form_id}', 'CUSTOM', {q(key)}, coalesce(max(position), -1) + 1, '{kind}', false, {q(config)}::jsonb, '{key}', '{{"active": true}}'::jsonb FROM fields WHERE form_id = '{form_id}';""")
preset("GENDER", "SINGLE_CHOICE", json.dumps({"options": [{"optionId": "opt_male", "label": "남", "hidden": False}, {"optionId": "opt_female", "label": "여", "hidden": False}]}))
preset("ATTENDANCE", "SINGLE_CHOICE", json.dumps({"options": [{"optionId": "opt_full", "label": "전체"}, {"optionId": "opt_partial", "label": "부분"}, {"optionId": "opt_worship", "label": "집회만"}]}))
preset("LODGING", "MULTI_CHOICE", json.dumps({"options": [{"optionId": "opt_n1", "label": "첫째 밤"}, {"optionId": "opt_n2", "label": "둘째 밤"}], "minSelect": 0, "maxSelect": None}))
preset("NO_LODGING", "MULTI_CHOICE", json.dumps({"options": [{"optionId": "opt_no_lodging", "label": "숙박 안 함"}], "minSelect": 0, "maxSelect": None}))
sql("\n".join(lines) + "\nCOMMIT;")
cohort_field = subprocess.run(["docker", "exec", "scene-pg", "psql", "-At", "-U", "scene", "-d", "scene", "-c",
    f"SELECT id FROM fields WHERE form_id = '{form_id}' AND system_key = 'COHORT' LIMIT 1"], capture_output=True, text=True, check=True).stdout.strip()
if not cohort_field:
    cohort_field = str(uuid.uuid4())
    sql(f"""INSERT INTO fields (id, space_id, event_id, form_id, kind, system_key, label, position, required)
      SELECT '{cohort_field}', '{SPACE}', '{event_id}', '{form_id}', 'SYSTEM', 'COHORT', '또래', coalesce(max(position), -1) + 1, true FROM fields WHERE form_id = '{form_id}';
      UPDATE fields SET answer_type = 'SHORT_TEXT', config = '{{"maxLength": 20, "format": null}}'::jsonb WHERE id = '{cohort_field}';""")
family = list("김이박최정강조윤장임한오서신권")
given = ["하늘", "서준", "민지", "지우", "예린", "도윤", "수아", "하람", "시우", "가은", "주원", "유나", "건우", "채원", "은호", "다인"]
rows = ["BEGIN;"]
people = []
for i in range(200):
    pid, aid = str(uuid.uuid4()), str(uuid.uuid4())
    name = family[i % len(family)] + given[(i * 7 + i // len(family)) % len(given)]
    phone = f"0109{i:07d}"
    rows.append(f"""INSERT INTO participants (id, space_id, event_id, name, phone, phone_hash, phone_last4, created_at, updated_at)
      VALUES ('{pid}', '{SPACE}', '{event_id}', {q(name)}, '{phone}', '{"h" * 64}', '{phone[-4:]}', now(), now());""")
    rows.append(f"""INSERT INTO applications (id, space_id, event_id, form_id, status, submitted_at, participant_id)
      VALUES ('{aid}', '{SPACE}', '{event_id}', '{form_id}', 'SUBMITTED', now(), '{pid}');""")
    def ans(fid, value):
        rows.append(f"""INSERT INTO answers (id, space_id, event_id, application_id, field_id, value) VALUES ('{uuid.uuid4()}', '{SPACE}', '{event_id}', '{aid}', '{fid}', {q(json.dumps(value))}::jsonb);""")
    ans(cohort_field, {"text": f"{90 + i % 10:02d}"})
    if i % 23 != 22:
        ans(fields["GENDER"], {"optionId": "opt_male" if i % 2 == 0 else "opt_female"})
    roll = i % 20
    if roll == 19:
        ans(fields["ATTENDANCE"], {"optionId": "opt_worship"})
    elif roll == 18:
        ans(fields["ATTENDANCE"], {"optionId": "opt_partial"})
        ans(fields["LODGING"], {"optionIds": ["opt_n1"]})
    elif roll == 17 and i % 3 == 0:
        ans(fields["ATTENDANCE"], {"optionId": "opt_full"})
        ans(fields["NO_LODGING"], {"optionIds": ["opt_no_lodging"]})
    else:
        ans(fields["ATTENDANCE"], {"optionId": "opt_full"})
    people.append({"participantId": pid, "applicationId": aid, "name": name, "gender": "M" if i % 2 == 0 else "F"})
rows.append("COMMIT;")
sql("\n".join(rows))
json.dump({"eventId": event_id, "formId": form_id, "fields": fields, "people": people}, open("seed200.json", "w"), ensure_ascii=False, indent=1)
print(event_id)

# 20 groups of 10 (each group is one gender: every 20th person), published, for 조 단위 일괄 배정.
ids = [p["participantId"] for p in people]
for g in range(20):
    group, _ = call("POST", f"/api/v1/operator/events/{event_id}/groups", {"name": f"{g + 1}조"}, cookie)
    call("POST", f"/api/v1/operator/events/{event_id}/group-assignments",
         {"changes": [{"participantId": i, "fromGroupId": None, "toGroupId": group["group"]["groupId"]} for i in ids[g::20]]}, cookie)
board, _ = call("GET", f"/api/v1/operator/events/{event_id}/group-board", None, cookie)
call("POST", f"/api/v1/operator/events/{event_id}/groups/publish", {"expectedBoardVersion": board["boardVersion"], "confirmUnassigned": True}, cookie)
