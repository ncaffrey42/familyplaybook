#!/usr/bin/env python3
"""Generate a schema snapshot (tables, constraints, indexes, functions,
triggers, RLS policies) for the public schema of the linked Supabase project,
via the Management API. Not a byte-perfect pg_dump, but a faithful,
reviewable source-of-truth snapshot."""
import json, subprocess, urllib.request, urllib.parse, sys

REF = "ifdncylgiqhhcwovpdyf"
tok = __import__("os").environ["SUPA_TOK"]
                     

def q(sql):
    r = subprocess.run(
        ["curl", "-s", f"https://api.supabase.com/v1/projects/{REF}/database/query",
         "-H", f"Authorization: Bearer {tok}", "-H", "Content-Type: application/json",
         "--data", json.dumps({"query": sql})],
        capture_output=True, text=True)
    return json.loads(r.stdout)

out = []
out.append("-- Family Playbook: public schema snapshot (generated from the live database)")
out.append("-- Source of truth for a NEW environment: apply this file first, then mark")
out.append("-- all migrations up to and including 20240109 as applied")
out.append("-- (supabase migration repair --status applied <versions>).")
out.append("-- Regenerate with scripts/generate-schema-snapshot (see repo docs).")
out.append("")

# ── Tables ────────────────────────────────────────────────────────────────
tables = [r["tablename"] for r in q(
    "select tablename from pg_tables where schemaname='public' order by tablename")]

for t in tables:
    cols = q(f"""
      select a.attname as name,
             format_type(a.atttypid, a.atttypmod) as type,
             a.attnotnull as notnull,
             pg_get_expr(d.adbin, d.adrelid) as dflt
        from pg_attribute a
        left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
       where a.attrelid = 'public.{t}'::regclass
         and a.attnum > 0 and not a.attisdropped
       order by a.attnum""")
    lines = []
    for c in cols:
        line = f"  {c['name']} {c['type']}"
        if c["dflt"]: line += f" DEFAULT {c['dflt']}"
        if c["notnull"]: line += " NOT NULL"
        lines.append(line)
    cons = q(f"""
      select conname, pg_get_constraintdef(oid) as def
        from pg_constraint
       where conrelid = 'public.{t}'::regclass
       order by contype desc, conname""")
    for c in cons:
        lines.append(f"  CONSTRAINT {c['conname']} {c['def']}")
    out.append(f"CREATE TABLE IF NOT EXISTS public.{t} (")
    out.append(",\n".join(lines))
    out.append(");")
    rls = q(f"select relrowsecurity from pg_class where oid='public.{t}'::regclass")
    if rls and rls[0]["relrowsecurity"]:
        out.append(f"ALTER TABLE public.{t} ENABLE ROW LEVEL SECURITY;")
    out.append("")

# ── Indexes (non-constraint) ──────────────────────────────────────────────
out.append("-- ── Indexes ──────────────────────────────────────────────────")
for r in q("""
    select indexdef from pg_indexes i
     where schemaname='public'
       and not exists (select 1 from pg_constraint c where c.conname = i.indexname)
     order by tablename, indexname"""):
    out.append(r["indexdef"].replace("CREATE INDEX", "CREATE INDEX IF NOT EXISTS", 1)
                            .replace("CREATE UNIQUE INDEX", "CREATE UNIQUE INDEX IF NOT EXISTS", 1) + ";")
out.append("")

# ── Functions (excluding extension members) ───────────────────────────────
out.append("-- ── Functions ────────────────────────────────────────────────")
for r in q("""
    select pg_get_functiondef(p.oid) as def
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname='public'
       and p.prokind = 'f'
       and not exists (select 1 from pg_depend d
                        where d.objid = p.oid and d.deptype = 'e')
     order by p.proname"""):
    out.append(r["def"].rstrip() + ";")
    out.append("")

# ── Triggers ──────────────────────────────────────────────────────────────
out.append("-- ── Triggers ─────────────────────────────────────────────────")
for r in q("""
    select pg_get_triggerdef(t.oid) as def
      from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname='public' and not t.tgisinternal
     order by c.relname, t.tgname"""):
    out.append(r["def"] + ";")
out.append("")

# ── RLS policies ──────────────────────────────────────────────────────────
out.append("-- ── RLS policies ─────────────────────────────────────────────")
for r in q("""
    select tablename, policyname, cmd, permissive, roles, qual, with_check
      from pg_policies where schemaname='public'
     order by tablename, policyname"""):
    stmt = f'CREATE POLICY "{r["policyname"]}" ON public.{r["tablename"]}'
    if r["permissive"] == "RESTRICTIVE":
        stmt += " AS RESTRICTIVE"
    stmt += f" FOR {r['cmd']}"
    roles = r["roles"]
    if isinstance(roles, str):
        roles = roles.strip("{}").split(",")
    if roles and roles != ["public"]:
        stmt += f" TO {', '.join(roles)}"
    if r["qual"]:
        stmt += f" USING ({r['qual']})"
    if r["with_check"]:
        stmt += f" WITH CHECK ({r['with_check']})"
    out.append(stmt + ";")
out.append("")

path = sys.argv[1] if len(sys.argv) > 1 else "supabase/schema.sql"
open(path, "w").write("\n".join(out) + "\n")
print(f"wrote {path}: {len(tables)} tables, {sum(1 for l in out if l.startswith('CREATE POLICY'))} policies")
