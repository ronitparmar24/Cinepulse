#!/usr/bin/env python3
"""Raise every font size below 12px to 12px (readability floor), in CSS and inline React styles.
Usage: python3 scripts/type-floor.py  — idempotent; prints how many values changed."""
import re, glob
FLOOR = 12.0

def css(s):
    n = 0
    def f(m):
        nonlocal n
        v = float(m.group(2))
        if v < FLOOR:
            n += 1
            return f"{m.group(1)}{FLOOR:g}px"
        return m.group(0)
    return re.sub(r"(font-size:\s*)([0-9.]+)px", f, s), n

def tsx(s):
    n = 0
    def num(m):
        nonlocal n
        v = float(m.group(2))
        if v < FLOOR:
            n += 1
            return f"{m.group(1)}{FLOOR:g}"
        return m.group(0)
    def strpx(m):
        nonlocal n
        v = float(m.group(3))
        if v < FLOOR:
            n += 1
            return f"{m.group(1)}{m.group(2)}{FLOOR:g}px{m.group(2)}"
        return m.group(0)
    s = re.sub(r"(fontSize:\s*)([0-9.]+)(?![0-9.]*\s*[*/+-])(?=\s*[,}\n])", num, s)
    s = re.sub(r"(fontSize:\s*)(['\"])([0-9.]+)px\2", strpx, s)
    s = re.sub(r"(fontSize=)(['\"{])([0-9.]+)(?=['\"}])", lambda m: (m.group(0) if float(m.group(3)) >= FLOOR else f"{m.group(1)}{m.group(2)}{FLOOR:g}"), s)
    return s, n

total = 0
for p in ['app/globals.css']:
    s = open(p).read(); s2, n = css(s)
    if n: open(p, 'w').write(s2)
    print(p, n); total += n
for p in glob.glob('components/**/*.tsx', recursive=True) + glob.glob('app/**/*.tsx', recursive=True):
    s = open(p).read(); s2, n = tsx(s)
    if n: open(p, 'w').write(s2); total += n
print('total values raised:', total)
