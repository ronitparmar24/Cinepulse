#!/usr/bin/env python3
"""Codemod: RECV.prepare(SQL).get|all|run(ARGS)  ->  (await RECV.get|all|run(SQL, ARGS))

Text-based, with a small scanner that respects strings, template literals and comments
so parentheses inside SQL text don't confuse it. Prints sites it could not rewrite
(e.g. a prepared statement stored in a variable) for manual handling.
Usage: codemod-prepare.py FILE...
"""
import re
import sys

RECV = r"(?:this\.)?[A-Za-z_$][\w$]*(?:\(\))?"


def skip_string(s, i):
    q = s[i]
    i += 1
    while i < len(s):
        c = s[i]
        if c == '\\':
            i += 2
            continue
        if q == '`' and c == '$' and i + 1 < len(s) and s[i + 1] == '{':
            i = match_brace(s, i + 1) + 1
            continue
        if c == q:
            return i + 1
        i += 1
    return i


def match_brace(s, i):
    # s[i] == '{'
    depth = 0
    while i < len(s):
        c = s[i]
        if c in '\'"`':
            i = skip_string(s, i)
            continue
        if c == '{':
            depth += 1
        elif c == '}':
            depth -= 1
            if depth == 0:
                return i
        i += 1
    return i


def match_paren(s, i):
    """s[i] == '(' -> index of matching ')'."""
    depth = 0
    while i < len(s):
        c = s[i]
        if c in '\'"`':
            i = skip_string(s, i)
            continue
        if c == '/' and s[i + 1:i + 2] == '/':
            i = s.index('\n', i)
            continue
        if c == '/' and s[i + 1:i + 2] == '*':
            i = s.index('*/', i) + 2
            continue
        if c in '([{':
            depth += 1
        elif c in ')]}':
            depth -= 1
            if depth == 0:
                return i
        i += 1
    raise ValueError('unbalanced')


pat = re.compile(r"(" + RECV + r")\s*\.prepare\(")


def transform(src, path):
    out = []
    pos = 0
    changed = 0
    manual = []
    for m in pat.finditer(src):
        if m.start() < pos:
            continue
        recv = m.group(1)
        open_i = m.end() - 1
        close_i = match_paren(src, open_i)
        sql = src[open_i + 1:close_i]
        rest = src[close_i + 1:]
        mm = re.match(r"\s*\.(get|all|run)\(", rest)
        if not mm:
            line = src.count('\n', 0, m.start()) + 1
            manual.append(f"{path}:{line}: {src[m.start():m.start()+80].splitlines()[0]}")
            continue
        method = mm.group(1)
        args_open = close_i + 1 + mm.end() - 1
        args_close = match_paren(src, args_open)
        args = src[args_open + 1:args_close].strip()
        sql_clean = sql.strip()
        call = f"(await {recv}.{method}({sql_clean}{', ' + args if args else ''}))"
        out.append(src[pos:m.start()])
        out.append(call)
        pos = args_close + 1
        changed += 1
    out.append(src[pos:])
    return ''.join(out), changed, manual


# ── second rule: `const stmt = RECV.prepare(SQL);` then `stmt.run(...)` ────────────
stored = re.compile(r"(const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*(" + RECV + r")\s*\.prepare\(")


def transform_stored(src):
    names = []
    out, pos = [], 0
    for m in stored.finditer(src):
        open_i = m.end() - 1
        close_i = match_paren(src, open_i)
        name, recv = m.group(2), m.group(3)
        out.append(src[pos:m.start()])
        out.append(f"{m.group(1)} {name}Sql = {src[open_i + 1:close_i].strip()}")
        pos = close_i + 1
        names.append((name, recv))
    out.append(src[pos:])
    src = ''.join(out)
    for name, recv in names:
        call = re.compile(r"\b" + re.escape(name) + r"\.(get|all|run)\(")
        res, pos = [], 0
        for m in call.finditer(src):
            if m.start() < pos:
                continue
            open_i = m.end() - 1
            close_i = match_paren(src, open_i)
            args = src[open_i + 1:close_i].strip()
            res.append(src[pos:m.start()])
            res.append(f"(await {recv}.{m.group(1)}({name}Sql{', ' + args if args else ''}))")
            pos = close_i + 1
        res.append(src[pos:])
        src = ''.join(res)
    return src, len(names)


if __name__ == '__main__':
    total = 0
    all_manual = []
    for path in sys.argv[1:]:
        src = open(path).read()
        new, n, manual = transform(src, path)
        if n:
            open(path, 'w').write(new)
        total += n
        all_manual += manual
    print(f"rewrote {total} call sites")
    for m in all_manual:
        print("MANUAL", m)
