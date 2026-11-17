import os
import re
import json

def redact_val(val: str) -> str:
    if not val:
        return ""
    if len(val) <= 4:
        return "***"
    return val[:2] + "*" * (len(val) - 4) + val[-2:]

files_to_check = [
    "data/credentials.json",
    ".env",
    ".env.local",
    "test_shoonya_auth.py",
    "scratch/verify_live_pyside6_shoonya.py",
    "scratch/verify_nextjs_shoonya_end_to_end.mjs",
]

inventory = []

for fpath in files_to_check:
    if not os.path.exists(fpath):
        inventory.append({"file": fpath, "exists": False})
        continue
    try:
        with open(fpath, "r", encoding="utf-8", errors="ignore") as f:
            content = f.read()
    except Exception as e:
        inventory.append({"file": fpath, "error": str(e)})
        continue

    file_info = {
        "file": fpath,
        "exists": True,
        "size_bytes": len(content.encode("utf-8")),
        "line_count": len(content.splitlines()),
        "sensitive_fields": []
    }

    if fpath.endswith(".json"):
        try:
            data = json.loads(content)
            if isinstance(data, dict):
                for k, v in data.items():
                    if isinstance(v, (str, int, float)):
                        file_info["sensitive_fields"].append({
                            "key": k,
                            "type": type(v).__name__,
                            "masked": redact_val(str(v))
                        })
                    elif isinstance(v, dict):
                        for sub_k, sub_v in v.items():
                            file_info["sensitive_fields"].append({
                                "key": f"{k}.{sub_k}",
                                "type": type(sub_v).__name__,
                                "masked": redact_val(str(sub_v))
                            })
        except Exception:
            pass
    else:
        # Check env or python files
        lines = content.splitlines()
        for idx, line in enumerate(lines):
            for kw in ["password", "secret", "token", "totp", "api_key", "vault_key", "pwd", "user_id", "vendor_code", "imei"]:
                if kw in line.lower() and ("=" in line or ":" in line):
                    # Redact assignment
                    parts = re.split(r'[:=]', line, maxsplit=1)
                    var_name = parts[0].strip()
                    var_val = parts[1].strip().strip('",\'') if len(parts) > 1 else ""
                    file_info["sensitive_fields"].append({
                        "line": idx + 1,
                        "key": var_name,
                        "masked": redact_val(var_val)
                    })
                    break

    inventory.append(file_info)

print(json.dumps(inventory, indent=2))
