import json, urllib.request, http.cookiejar, sys
B="http://localhost:8080"
def client():
    jar=http.cookiejar.CookieJar()
    op=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
    def call(method, path, body=None):
        data=None if body is None else json.dumps(body).encode()
        req=urllib.request.Request(B+path, data=data, method=method)
        req.add_header("Content-Type","application/json"); req.add_header("Accept","application/json")
        req.add_header("X-XSRF-TOKEN","dev-csrf"); req.add_header("Cookie","XSRF-TOKEN=dev-csrf")
        # cookiejar adds session cookies; merge manually
        cookies="; ".join(f"{c.name}={c.value}" for c in jar)
        req.add_header("Cookie","XSRF-TOKEN=dev-csrf"+("; "+cookies if cookies else ""))
        try:
            r=urllib.request.urlopen(req)
            for c in r.headers.get_all("Set-Cookie") or []:
                n,v=c.split(";")[0].split("=",1)
                jar.set_cookie(http.cookiejar.Cookie(0,n,v,None,False,"localhost",False,False,"/",True,False,None,False,None,None,{}))
            t=r.read(); return json.loads(t) if t else None
        except urllib.error.HTTPError as e:
            print(method,path,e.code,e.read()[:300]); raise
    return call
SPACE="00000000-0000-4000-8000-000000000010"
owner=client()
owner("POST","/api/v1/operator/auth/login",{"userId":"00000000-0000-4000-8000-000000000001"})
ev=owner("POST",f"/api/v1/operator/spaces/{SPACE}/events",{"name":"일정 확인 수련회","startDate":"2027-01-22","endDate":"2027-01-24","place":"양평 수양관","eventType":"RETREAT"})
E=ev["eventId"]
lc=owner("GET",f"/api/v1/operator/events/{E}/lifecycle")
owner("POST",f"/api/v1/operator/events/{E}/activate",{"expectedLifecycleVersion":lc.get("lifecycleVersion",0),"acknowledgeWarnings":True})
owner("POST",f"/api/v1/operator/events/{E}/operators",{"userId":"00000000-0000-4000-8000-000000000002","role":"MANAGER"})
form=owner("POST",f"/api/v1/operator/events/{E}/forms",{})
F=form["formId"]
owner("PATCH",f"/api/v1/operator/events/{E}/forms/{F}",{"acceptingApplications":True})
pub=owner("GET",f"/api/v1/public/events/{E}/forms/{F}")
fields={f["systemKey"] if f.get("systemKey") else f.get("presetKey") or f["fieldId"]: f["fieldId"] for f in pub["fields"]}
people=[("김조장","010-1111-0001","94"),("이조원","010-1111-0002","95")]
pids=[]
for name,phone,cohort in people:
    ans=[]
    for f in pub["fields"]:
        k=(f.get("systemKey") or "")
        if k=="NAME": ans.append({"fieldId":f["fieldId"],"text":name})
        elif k=="PHONE": ans.append({"fieldId":f["fieldId"],"text":phone})
        elif k=="COHORT": ans.append({"fieldId":f["fieldId"],"text":cohort})
    r=client()("POST",f"/api/v1/public/events/{E}/forms/{F}/applications",{"answers":ans,"pin":"730914"})
    pids.append(r["participantId"])
g=owner("POST",f"/api/v1/operator/events/{E}/groups",{"name":"1조"})
G=g["group"]["groupId"]
owner("POST",f"/api/v1/operator/events/{E}/group-assignments",{"changes":[{"participantId":p,"fromGroupId":None,"toGroupId":G} for p in pids]})
board=owner("GET",f"/api/v1/operator/events/{E}/group-board")
ver=[x for x in board["groups"] if x["groupId"]==G][0]["version"]
owner("PUT",f"/api/v1/operator/events/{E}/groups/{G}/leaders",{"participantIds":[pids[0]],"expectedVersion":ver})
board=owner("GET",f"/api/v1/operator/events/{E}/group-board")
owner("POST",f"/api/v1/operator/events/{E}/groups/publish",{"expectedBoardVersion":board["boardVersion"],"confirmUnassigned":True})
print(json.dumps({"eventId":E,"formId":F}))
