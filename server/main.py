import sys, os, json, traceback
from posting_allocator import allocate_timetable


def main():
    if len(sys.argv) != 2:
        print(
            json.dumps(
                {
                    "success": False,
                    "error": f"Usage: python posting_allocator.py <input_json_file>",
                }
            )
        )
        sys.exit(1)
    try:
        with open(sys.argv[1], "r") as f:
            input_data = json.load(f)
        result = allocate_timetable(
            residents=input_data["residents"],
            resident_history=input_data["resident_history"],
            resident_preferences=input_data["resident_preferences"],
            postings=input_data["postings"],
            weightages=input_data["weightages"],
        )
        # needs to be printed to stdout for server.js to read
        print(json.dumps(result, indent=2))
    except FileNotFoundError:
        print(
            json.dumps(
                {"success": False, "error": f"Input file '{sys.argv[1]}' not found"}
            )
        )
        sys.exit(1)
    except json.JSONDecodeError:
        print(
            json.dumps(
                {
                    "success": False,
                    "error": f"Invalid JSON in input file '{sys.argv[1]}'",
                }
            )
        )
        sys.exit(1)
    except KeyError as e:
        print(
            json.dumps(
                {
                    "success": False,
                    "error": f"Missing required field in input data: {e}",
                }
            )
        )
        sys.exit(1)
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))
        sys.exit(1)


if __name__ == "__main__":
    main()


# import json, sys, traceback, os

# REQUIRED_RESIDENT_FIELDS = ["mcr", "resident_year", "some_other_field"]

# # 1. Load the JSON file
# with open(sys.argv[1], "r") as f:
#     input_data = json.load(f)

# # 2. Validate every resident record
# for idx, record in enumerate(input_data["residents"], start=1):
#     try:
#         # Attempt to read mandatory fields
#         mcr  = record["mcr"]
#         year = record["resident_year"]
#         # … anything else you need …
#     except KeyError as e:
#         missing = e.args[0]
#         error_payload = {
#             "success": False,
#             "error":      f"Resident #{idx} is missing field '{missing}'",
#             "record_id":  record.get("mcr", "<unknown>"),
#             "got_keys":   list(record.keys()),
#             "need_keys":  REQUIRED_RESIDENT_FIELDS,
#         }
#         # (Optional) full traceback if you’re debugging
#         if os.getenv("DEBUG"):
#             error_payload["traceback"] = traceback.format_exc()

#         print(json.dumps(error_payload, indent=2))
#         sys.exit(1)

# # 3. If all good, hand off to your solver
# result = allocate_timetable(
#     residents            = input_data["residents"],
#     resident_history     = input_data["resident_history"],
#     resident_preferences = input_data["resident_preferences"],
#     postings             = input_data["postings"],
#     weightages           = input_data["weightages"],
# )

# print(json.dumps(result, indent=2))
