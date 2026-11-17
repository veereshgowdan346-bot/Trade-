import os
import re

SECRET_PATTERNS = [
    (re.compile(r'(?i)(api[_-]?key|apikey|secret|token|password|passwd|auth[_-]?token)\s*[:=]\s*["\']([^"\']{10,})["\']'), 'Credential assignment'),
    (re.compile(r'-----BEGIN (?:RSA|OPENSSH|DSA|EC|PGP) PRIVATE KEY-----'), 'Private key header'),
    (re.compile(r'(?i)FN244756'), 'Leaked client ID'),
    (re.compile(r'7em759a2468d601cf'), 'Leaked API secret'),
    (re.compile(r'R4I473'), 'Leaked TOTP seed')
]

hits = []
for root, dirs, files in os.walk('.'):
    if any(p in root for p in ['.git', 'node_modules', '.next', 'data/omnitrade-pg', 'dist_test_cjs', '.claude-flow']):
        continue
    for f in files:
        if f.endswith(('.ts', '.tsx', '.py', '.js', '.mjs', '.json', '.sql')):
            fpath = os.path.join(root, f)
            # Skip this script and scanner itself
            if 'scan_source_files.py' in fpath or 'scan_repo_secrets.py' in fpath or 'native_history_rewrite.py' in fpath:
                continue
            with open(fpath, 'r', encoding='utf-8', errors='ignore') as fp:
                for idx, line in enumerate(fp):
                    for pat, desc in SECRET_PATTERNS:
                        m = pat.search(line)
                        if m:
                            val = m.group(0)
                            # Allow explicit test fixture values
                            if any(k in line.lower() for k in ['test', 'mock', 'dummy', 'example', 'placeholder']):
                                continue
                            hits.append((fpath, idx + 1, desc))

print(f"Total potential hard-coded secrets found in active source code: {len(hits)}")
for h in hits:
    print(f"  {h[0]}:{h[1]} [{h[2]}]")
