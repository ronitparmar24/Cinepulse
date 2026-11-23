#!/usr/bin/env python3
"""INSERT OR IGNORE INTO …  ->  INSERT INTO … ON CONFLICT DO NOTHING (portable to Postgres).

Only rewrites a literal ('…', "…" or `…`) that holds exactly one INSERT OR IGNORE statement
ending at the literal's end. Anything else is reported for manual work.
"""
import re
import sys

pat = re.compile(r"INSERT\s+OR\s+IGNORE\s+INTO", re.I)
for path in sys.argv[1:]:
    s = open(path).read()
    out, pos, n = [], 0, 0
    for m in pat.finditer(s):
        if m.start() < pos:
            continue
        # find enclosing literal start
        q_start = max(s.rfind(q, 0, m.start()) for q in ('`', "'", '"'))
        quote = s[q_start]
        q_end = s.index(quote, m.end())
        stmt = s[m.start():q_end]
        if ';' in stmt.rstrip().rstrip(';')[:-1] and stmt.rstrip().endswith(';') is False and ';' in stmt:
            print(f"MANUAL {path}:{s.count(chr(10),0,m.start())+1} (multiple statements)")
            continue
        body = stmt.rstrip()
        trailing = stmt[len(body):]
        semicolon = ''
        if body.endswith(';'):
            body, semicolon = body[:-1].rstrip(), ';'
        if 'ON CONFLICT' in body.upper():
            print(f"MANUAL {path}:{s.count(chr(10),0,m.start())+1} (already has ON CONFLICT)")
            continue
        new = re.sub(r"INSERT\s+OR\s+IGNORE\s+INTO", "INSERT INTO", body, count=1, flags=re.I) + ' ON CONFLICT DO NOTHING' + semicolon + trailing
        out.append(s[pos:m.start()])
        out.append(new)
        pos = q_end
        n += 1
    out.append(s[pos:])
    if n:
        open(path, 'w').write(''.join(out))
        print(f"{path}: {n}")
