"""Emit idempotent SQL seeding bible_books and a plan. Usage: plan_to_sql.py plan/plan.json > out.sql"""
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from books import BOOKS
plan = json.load(open(sys.argv[1]))
q = lambda s: "'" + str(s).replace("'", "''") + "'"
print("begin;")
print("insert into public.bible_books (id, code, name, testament) values " +
      ",".join(f"({i+1},{q(c)},{q(n)},{q(t)})" for i, (c, n, t) in enumerate(BOOKS)) + " on conflict (id) do nothing;")
meta = {"segments": plan["segments"], "word_estimate_basis": plan["word_estimate_basis"]}
print(f"insert into public.reading_plans (id,title,start_date,end_date,version,meta) values ({q(plan['id'])},{q(plan['title'])},"
      f"{q(plan['start_date'])},{q(plan['end_date'])},{plan['version']},{q(json.dumps(meta))}::jsonb) "
      "on conflict (id) do update set title=excluded.title, meta=excluded.meta, version=excluded.version;")
print(f"delete from public.plan_assignments where plan_id = {q(plan['id'])};")
rows = [f"({q(plan['id'])},{d['day']},{p['order']},{p['start_id']},{p['end_id']},{q(p['label'])})"
        for d in plan["days"] for p in d["passages"]]
print("insert into public.plan_assignments (plan_id,day,passage_order,start_id,end_id,label) values " + ",\n".join(rows) + ";")
print("commit;")
