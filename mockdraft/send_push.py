"""Send phone alerts (Firebase Cloud Messaging) for new rows in news.csv.

Runs in GitHub Actions (.github/workflows/push-alerts.yml) whenever news.csv changes on main.
Each fan's app follows a topic for every player on their My Team ("p-<slug>"), so an alert about
David Montgomery only goes to fans who have him. Everyone with alerts on also follows "all".

    python3 send_push.py --before <old commit>           # new news rows since that commit
    python3 send_push.py --all "Title" "Message" [url]   # one alert to everyone with alerts on
    add --dry-run to print instead of sending

Needs the FIREBASE_SERVICE_ACCOUNT secret (the service account JSON from Firebase). Without it,
it prints what it would send and stops, so nothing breaks before Firebase is set up.
"""
import csv
import datetime
import io
import json
import os
import re
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
MAX_ALERTS = 8            # never more than this many in one run
FRESH_DAYS = 3            # only news from the last few days
SKIP_KINDS = {"result"}   # final scores aren't alerts

TITLE = {
    "injury": "{p}: injury update",
    "return": "{p} is back",
    "trade": "{p} traded",
    "qb": "New QB news: {p}",
    "news": "{p} news",
}


def slug(name):
    return re.sub(r"[^a-z0-9]+", "-", name.lower().replace("'", "").replace(".", "")).strip("-")


def rows_at(commit):
    try:
        text = subprocess.run(["git", "show", f"{commit}:mockdraft/news.csv"], cwd=HERE, capture_output=True, text=True, check=True).stdout
    except subprocess.CalledProcessError:
        return []
    return list(csv.DictReader(io.StringIO(text)))


def new_rows(before):
    with open(os.path.join(HERE, "news.csv"), newline="", encoding="utf-8") as f:
        now = list(csv.DictReader(f))
    seen = {(r["date"], r["player"], r["text"]) for r in rows_at(before)}
    since = (datetime.date.today() - datetime.timedelta(days=FRESH_DAYS)).isoformat()
    out = [r for r in now if (r["date"], r["player"], r["text"]) not in seen
           and r["kind"] not in SKIP_KINDS and r["date"] >= since and r["player"].strip()]
    return out[:MAX_ALERTS]


def message(row):
    p = row["player"].strip()
    title = TITLE.get(row["kind"], "{p} news").format(p=p)
    return {"topic": f"p-{slug(p)}", "title": title, "body": row["text"].strip(), "url": f"fantasy/{slug(p)}.html"}


def sender():
    raw = os.environ.get("FIREBASE_SERVICE_ACCOUNT", "").strip()
    if not raw:
        return None
    from google.oauth2 import service_account          # pip install google-auth requests
    from google.auth.transport.requests import AuthorizedSession
    info = json.loads(raw)
    creds = service_account.Credentials.from_service_account_info(info, scopes=["https://www.googleapis.com/auth/firebase.messaging"])
    session = AuthorizedSession(creds)
    url = f"https://fcm.googleapis.com/v1/projects/{info['project_id']}/messages:send"

    def send(m):
        body = {"message": {
            "topic": m["topic"],
            "notification": {"title": m["title"], "body": m["body"]},
            "data": {"url": m["url"]},
            "apns": {"payload": {"aps": {"sound": "default"}}},
        }}
        r = session.post(url, json=body, timeout=20)
        print(("sent" if r.ok else f"FAILED {r.status_code} {r.text[:200]}"), m["topic"], "·", m["title"])
        return r.ok
    return send


def main():
    args = sys.argv[1:]
    dry = "--dry-run" in args
    args = [a for a in args if a != "--dry-run"]
    if args[:1] == ["--all"]:
        if len(args) < 3:
            sys.exit('usage: send_push.py --all "Title" "Message" [url]')
        msgs = [{"topic": "all", "title": args[1], "body": args[2], "url": args[3] if len(args) > 3 else "my-team.html"}]
    elif args[:1] == ["--before"] and len(args) > 1:
        msgs = [message(r) for r in new_rows(args[1])]
    else:
        sys.exit(__doc__)
    if not msgs:
        print("No new alerts.")
        return
    send = None if dry else sender()
    if not send:
        print("Not sending (dry run or no FIREBASE_SERVICE_ACCOUNT). Would send:")
        for m in msgs:
            print(" ", m["topic"], "·", m["title"], "·", m["body"])
        return
    ok = sum(send(m) for m in msgs)
    if ok < len(msgs):
        sys.exit(f"{len(msgs) - ok} alert(s) failed")


if __name__ == "__main__":
    main()
