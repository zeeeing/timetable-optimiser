import sys, json


def main():
    try:
        payload = json.loads(sys.stdin.read() or "{}")
        mcr = payload.get("resident_mcr")
        rows = payload.get("current_year", [])
        errors = []

        if not mcr:
            errors.append("missing resident_mcr")
        seen_blocks = set()
        for r in rows:
            b = int(r.get("block", 0))
            if b < 1 or b > 12:
                errors.append(f"invalid block {b}")
            if not r.get("posting_code"):
                errors.append(f"missing posting_code for block {b}")
            if b in seen_blocks:
                errors.append(f"duplicate block {b}")
            seen_blocks.add(b)

        if errors:
            print(json.dumps({"success": False, "errors": errors}))
        else:
            print(json.dumps({"success": True, "warnings": []}))
    except Exception as e:
        sys.stderr.write(str(e))
        sys.exit(1)


if __name__ == "__main__":
    main()
