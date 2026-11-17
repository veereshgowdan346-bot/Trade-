import subprocess
import re
import os

# Get all git tracked files
res = subprocess.run(["git", "ls-files"], capture_output=True, text=True, check=True)
tracked_files = [f.strip() for f in res.stdout.splitlines() if f.strip()]

# Regex patterns for detecting potential secrets
SECRET_PATTERNS = [
    (r'(?i)(api[_-]?key|apikey|secret|token|password|passwd|auth[_-]?token)\s*[:=]\s*["\']([^"\']{8,})["\']', "Potential credential assignment"),
    (r'(?i)(bearer\s+[a-zA-Z0-9_\-\.]{16,})', "Bearer token"),
    (r'-----BEGIN (?:RSA|OPENSSH|DSA|EC|PGP) PRIVATE KEY-----', "Private key header"),
    (r'(?i)FN2447' + r'56', "Known leaked broker User ID"),
    (r'(?i)7em759a2468d601cf', "Known leaked API secret prefix"),
    (r'R4I473[a-zA-Z0-9]{10,}', "Known leaked TOTP prefix"),
]

findings = []

for filepath in tracked_files:
    if not os.path.exists(filepath):
        continue
    # Skip node_modules, .next, binary files, lockfiles, images, etc.
    if filepath.startswith("node_modules/") or filepath.startswith(".next/"):
        continue
    if any(filepath.endswith(ext) for ext in [".png", ".jpg", ".gz", ".tar", ".ico", ".woff", ".woff2", ".pyc", ".pack", ".idx"]):
        continue
    
    try:
        with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
            lines = f.readlines()
    except Exception as e:
        continue

    for line_num, line in enumerate(lines, 1):
        for pattern, desc in SECRET_PATTERNS:
            match = re.search(pattern, line)
            if match:
                # Mask secret
                val = match.group(0)
                if len(val) > 8:
                    masked = val[:4] + "***" + val[-4:]
                else:
                    masked = "***"
                findings.append({
                    "file": filepath,
                    "line": line_num,
                    "desc": desc,
                    "snippet_masked": masked
                })

print(f"Scanned {len(tracked_files)} tracked files.")
print(f"Total findings: {len(findings)}")
for item in findings:
    print(f"  {item['file']}:{item['line']} [{item['desc']}] -> {item['snippet_masked']}")
