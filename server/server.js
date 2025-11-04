const express = require("express");
const cors = require("cors");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const { parse } = require("csv-parse/sync");
const { spawn } = require("child_process");
const { monthLabels } = require("./constants");

const app = express();
PORT = process.env.PORT || 3001;
const { version, name } = require("./package.json");

// middleware
app.use(cors());
app.use(express.json());
const upload = multer({ storage: multer.memoryStorage() });

const parseBooleanFlag = (value) => {
  if (typeof value === "boolean") {
    return value;
  }
  if (value === null || value === undefined) {
    return false;
  }
  const str = String(value).trim().toLowerCase();
  if (!str) {
    return false;
  }
  if (["1", "true", "yes", "y"].includes(str)) {
    return true;
  }
  if (["0", "false", "no", "n"].includes(str)) {
    return false;
  }
  const num = Number(str);
  return Number.isFinite(num) ? num !== 0 : false;
};

// in-memory store (per-process) for latest dataset and response
app.locals.store = {
  latestInputs: null, // dataset uploaded via /api/solve
  latestApiResponse: null, // most recent optimiser/postprocess result
};

// routes
app.post(
  "/api/solve",
  upload.fields([
    { name: "residents", maxCount: 1 },
    { name: "resident_history", maxCount: 1 },
    { name: "resident_preferences", maxCount: 1 },
    { name: "resident_sr_preferences", maxCount: 1 },
    { name: "postings", maxCount: 1 },
    { name: "weightages", maxCount: 1 },
    { name: "resident_leaves", maxCount: 1 },
    { name: "pinned_mcrs", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const pinnedMcrs = (() => {
        try {
          const raw = req.body.pinned_mcrs;
          if (!raw) return [];
          const arr = typeof raw === "string" ? JSON.parse(raw) : raw;
          return Array.isArray(arr) ? arr : [];
        } catch (_) {
          return [];
        }
      })();

      const latest = req.app.locals.store.latestApiResponse;
      const base = req.app.locals.store.latestInputs;

      // re-generate timetable; pinned residents provided, latest data available
      if (Array.isArray(pinnedMcrs) && pinnedMcrs.length > 0 && latest) {
        const pinnedSet = new Set(pinnedMcrs.filter(Boolean));

        // exclude current year from history
        const resident_history = (latest.resident_history || []).filter(
          (h) => !h.is_current_year
        );

        // build pinned assignments from last run's current year for pinned residents
        const pinned_assignments = {};
        for (const h of latest.resident_history || []) {
          if (h.is_current_year && pinnedSet.has(h.mcr)) {
            const monthBlock = parseInt(
              String(h.month_block ?? h.block ?? "").trim(),
              10
            );
            if (!Number.isFinite(monthBlock)) continue;
            (pinned_assignments[h.mcr] ??= []).push({
              month_block: monthBlock,
              posting_code: h.posting_code,
            });
          }
        }

        const weightages = (() => {
          try {
            const w = req.body.weightages
              ? JSON.parse(req.body.weightages)
              : latest.weightages || (base && base.weightages) || {};
            return { ...w };
          } catch (_) {
            const w = latest.weightages || (base && base.weightages) || {};
            return { ...w };
          }
        })();

        const inputData = {
          residents: latest.residents || (base && base.residents) || [],
          resident_history,
          resident_preferences:
            latest.resident_preferences ||
            (base && base.resident_preferences) ||
            [],
          resident_sr_preferences:
            latest.resident_sr_preferences ||
            (base && base.resident_sr_preferences) ||
            [],
          postings: latest.postings || (base && base.postings) || [],
          weightages,
          resident_leaves:
            latest.resident_leaves || (base && base.resident_leaves) || [],
          pinned_assignments,
        };

        const inputPath = path.join(__dirname, "input_rerun.json");
        fs.writeFileSync(inputPath, JSON.stringify(inputData));

        const process = spawn("python3", [
          path.join(__dirname, "services", "posting_allocator.py"),
          inputPath,
        ]);

        let output = "";
        let errOutput = "";
        process.stdout.on("data", (d) => (output += d.toString()));
        process.stderr.on("data", (err) => {
          errOutput += err.toString();
          console.log("[PYTHON LOG]\n", err.toString());
        });
        process.on("close", (code) => {
          try {
            fs.unlinkSync(inputPath);
          } catch (_) {}

          try {
            const result = JSON.parse(output || "{}");
            if (result && result.success) {
              req.app.locals.store.latestApiResponse = result;
              return res.json(result);
            }
            console.error("Optimiser run failed", {
              code,
              stderr: errOutput,
            });
            return res.status(500).json({
              success: false,
              error: result?.error || "Optimiser run failed",
            });
          } catch (err) {
            console.error("Failed to parse optimiser output", err);
            return res.status(500).json({
              success: false,
              error: "Failed to parse optimiser output",
            });
          }
        });
        return;
      }

      // generate timetable; initial upload of CSVs
      // parse csv files
      const residentsCsv = req.files.residents[0].buffer.toString("utf-8");
      const residents = parse(residentsCsv, {
        columns: true,
        skip_empty_lines: true,
      });

      const historyCsv = req.files.resident_history[0].buffer.toString("utf-8");
      const residentHistory = parse(historyCsv, {
        columns: true,
        skip_empty_lines: true,
      });

      const preferencesCsv =
        req.files.resident_preferences[0].buffer.toString("utf-8");
      const residentPreferences = parse(preferencesCsv, {
        columns: true,
        skip_empty_lines: true,
      });

      const srPreferences = (() => {
        try {
          const f = req.files.resident_sr_preferences?.[0];
          if (!f) return [];
          const csv = f.buffer.toString("utf-8");
          return parse(csv, { columns: true, skip_empty_lines: true });
        } catch (_) {
          return [];
        }
      })();

      const postingsCsv = req.files.postings[0].buffer.toString("utf-8");
      const postings = parse(postingsCsv, {
        columns: true,
        skip_empty_lines: true,
      });

      const residentLeaves = (() => {
        try {
          const f = req.files.resident_leaves?.[0];
          if (!f) return [];
          const csv = f.buffer.toString("utf-8");
          return parse(csv, { columns: true, skip_empty_lines: true });
        } catch (_) {
          return [];
        }
      })();

      const weightages = JSON.parse(req.body.weightages);

      // format parsed files
      const residentsFormatted = residents.map((r) => {
        const careerBlocksRaw =
          r.career_blocks_completed ?? r.careerBlocksCompleted;
        const careerBlocks = parseInt(String(careerBlocksRaw ?? "").trim(), 10);
        const residentYearParsed = parseInt(
          String(r.resident_year ?? "").trim(),
          10
        );
        const residentYear = Number.isFinite(residentYearParsed)
          ? residentYearParsed
          : 0;
        return {
          mcr: String(r.mcr).trim(),
          name: String(r.name).trim(),
          resident_year: residentYear,
          career_blocks_completed: Number.isFinite(careerBlocks)
            ? careerBlocks
            : null,
        };
      });

      const residentHistoryFormatted = residentHistory
        .map((h) => {
          const monthBlock = parseInt(
            String(h.month_block ?? h.block ?? "").trim(),
            10
          );
          if (!Number.isFinite(monthBlock)) return null;

          const careerBlock = parseInt(String(h.career_block ?? "").trim(), 10);
          const year = parseInt(String(h.year ?? "").trim(), 10);
          if (!Number.isFinite(year)) return null;
          const isCurrentYear = parseBooleanFlag(
            h.is_current_year ?? h.isCurrentYear ?? 0
          );
          const isLeave = parseBooleanFlag(h.is_leave ?? h.isLeave ?? 0);

          return {
            mcr: String(h.mcr).trim(),
            year,
            month_block: monthBlock,
            career_block: Number.isFinite(careerBlock) ? careerBlock : null,
            posting_code: String(h.posting_code ?? "").trim(),
            is_current_year: isCurrentYear,
            is_leave: isLeave,
            leave_type: String(h.leave_type ?? "").trim(),
          };
        })
        .filter(Boolean);

      const residentPreferencesFormatted = residentPreferences.map((p) => ({
        mcr: p.mcr,
        preference_rank: parseInt(p.preference_rank),
        posting_code: p.posting_code,
      }));

      const residentSrPreferencesFormatted = srPreferences.map((p) => ({
        mcr: p.mcr,
        preference_rank: parseInt(p.preference_rank),
        base_posting: p.base_posting,
      }));

      const postingsFormatted = postings.map((q) => ({
        posting_code: q.posting_code,
        posting_name: q.posting_name,
        posting_type: q.posting_type,
        max_residents: parseInt(q.max_residents),
        required_block_duration: parseInt(q.required_block_duration),
      }));

      const residentLeavesFormatted = residentLeaves
        .map((a) => {
          const monthBlock = parseInt(
            String(a.month_block ?? a.block ?? "").trim(),
            10
          );
          if (!Number.isFinite(monthBlock)) return null;
          return {
            mcr: String(a.mcr).trim(),
            month_block: monthBlock,
            leave_type: String(a.leave_type ?? "").trim(),
            posting_code: String(a.posting_code ?? "").trim(),
          };
        })
        .filter(Boolean);

      const inputData = {
        residents: residentsFormatted,
        resident_history: residentHistoryFormatted,
        resident_preferences: residentPreferencesFormatted,
        resident_sr_preferences: residentSrPreferencesFormatted,
        postings: postingsFormatted,
        weightages: weightages,
        resident_leaves: residentLeavesFormatted,
      };

      // cache the latest uploaded inputs for subsequent operations
      app.locals.store.latestInputs = JSON.parse(JSON.stringify(inputData));

      // create temp JSON file with input data
      const inputPath = path.join(__dirname, "input.json");
      fs.writeFileSync(inputPath, JSON.stringify(inputData));

      // spawn python process
      // array argument contains the path to the Python script and the input file
      const process = spawn("python3", [
        path.join(__dirname, "services", "posting_allocator.py"),
        inputPath,
      ]);

      // handle output and errors
      let output = "";
      let errOutput = "";

      process.stdout.on("data", (data) => {
        output += data.toString();
      });
      process.stderr.on("data", (err) => {
        // log python logs for debugging (not exactly 'error' logs)
        errOutput += err.toString();
        console.log("[PYTHON LOG]\n", err.toString());
      });

      process.on("close", (code) => {
        try {
          fs.unlinkSync(inputPath);
        } catch (_) {}

        try {
          const result = JSON.parse(output || "{}");
          if (result && result.success) {
            // cache full API output for subsequent operations
            app.locals.store.latestApiResponse = result;
            return res.json(result);
          }
          // optimiser completed but reported failure
          console.error("[UPLOAD] Optimiser run failed", {
            code,
            stderr: errOutput,
          });
          return res.status(500).json({
            success: false,
            error: result?.error || "Optimiser run failed",
          });
        } catch (err) {
          // could not parse output as JSON
          console.error("[UPLOAD] Failed to parse optimiser output", err);
          return res.status(500).json({
            success: false,
            error: "Failed to parse optimiser output",
          });
        }
      });
    } catch (e) {
      // csv parsing/formatting failed
      console.error("Error processing files: ", e);
      res
        .status(500)
        .json({ success: false, error: "Failed to process files" });
    }
  }
);

app.post("/api/validate", async (req, res) => {
  try {
    const payload = req.body || {};
    const residentMcr = payload.resident_mcr;
    const currentYear = Array.isArray(payload.current_year)
      ? payload.current_year
      : [];

    if (!residentMcr) {
      return res
        .status(400)
        .json({ success: false, error: "missing resident_mcr" });
    }

    // prepare dataToValidate with latest dataset for validation
    const base =
      req.app.locals.store.latestApiResponse ||
      req.app.locals.store.latestInputs;
    const normalisedCurrentYear = currentYear
      .map((entry) => {
        const monthBlock = parseInt(
          String(entry?.month_block ?? entry?.block ?? "").trim(),
          10
        );
        if (!Number.isFinite(monthBlock)) return null;
        const postingCode = String(entry?.posting_code ?? "").trim();
        if (!postingCode) return null;
        return {
          month_block: monthBlock,
          posting_code: postingCode,
        };
      })
      .filter(Boolean);

    const dataToValidate = {
      resident_mcr: residentMcr,
      current_year: normalisedCurrentYear,
      residents: base?.residents || [],
      resident_history: base?.resident_history || [],
      postings: base?.postings || [],
    };

    // spawn python process
    const process = spawn("python3", [
      path.join(__dirname, "services", "validate.py"),
    ]);

    // handle output and errors
    let output = "";
    let errOutput = "";

    process.stdout.on("data", (data) => (output += data.toString()));
    process.stderr.on("data", (err) => {
      errOutput += err.toString();
      console.log("[PYTHON LOG]\n", err.toString());
    });

    // error handling
    process.on("error", (err) => {
      console.error("Failed to start validate.py", err);
    });

    // this time we write to stdin and read from there
    process.stdin.write(JSON.stringify(dataToValidate));
    process.stdin.end();

    process.on("close", () => {
      try {
        const parsed = JSON.parse(output || "{}");
        return res.json(parsed);
      } catch (err) {
        return res.status(500).json({
          success: false,
          errors: [
            "Internal server error during validation",
            output || errOutput || err.message || "",
          ].filter(Boolean),
        });
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, errors: ["Server error"] });
  }
});

app.post("/api/save", async (req, res) => {
  try {
    const payload = req.body || {};
    const residentMcr = payload.resident_mcr;
    const currentYear = Array.isArray(payload.current_year)
      ? payload.current_year
      : [];

    if (!residentMcr) {
      return res
        .status(400)
        .json({ success: false, errors: ["missing resident_mcr"] });
    }

    // access latest data from in-memory store
    const store = req.app.locals.store || {};
    const latestInputs = store.latestInputs || {};
    const base = store.latestApiResponse || latestInputs;

    if (!base) {
      return res.status(400).json({
        success: false,
        error: "No dataset loaded. Upload CSV and run optimiser first.",
      });
    }

    // convert base data to JSON format
    const residents = Array.isArray(base.residents)
      ? JSON.parse(JSON.stringify(base.residents))
      : [];
    const resident_history = Array.isArray(base.resident_history)
      ? JSON.parse(JSON.stringify(base.resident_history))
      : [];

    // filter out existing entries for this resident in the current year
    const filteredHistory = resident_history.filter(
      (h) => !(h.mcr === residentMcr && h.is_current_year)
    );
    const resident = residents.find((r) => r.mcr === residentMcr);
    const year = resident ? resident.resident_year : undefined;

    // generate new entries for the current year
    const newEntries = currentYear
      .map((r) => {
        const monthBlock = parseInt(
          String(r.month_block ?? r.block ?? "").trim(),
          10
        );
        if (!Number.isFinite(monthBlock)) return null;
        const careerBlock = parseInt(String(r.career_block ?? "").trim(), 10);
        const postingCode = String(r.posting_code ?? "").trim();
        if (!postingCode) return null;
        return {
          mcr: residentMcr,
          year: year,
          month_block: monthBlock,
          career_block: Number.isFinite(careerBlock) ? careerBlock : null,
          posting_code: postingCode,
          is_current_year: true,
          is_leave: false,
          leave_type: "",
        };
      })
      .filter(Boolean);

    // update existing resident's history
    const weightages = JSON.parse(
      JSON.stringify(base?.weightages ?? latestInputs?.weightages ?? {})
    );

    const updatedPayload = {
      residents,
      resident_history: [...filteredHistory, ...newEntries],
      resident_preferences: base.resident_preferences || [],
      resident_sr_preferences: base.resident_sr_preferences || [],
      postings: base.postings || [],
      weightages,
      resident_leaves: base.resident_leaves || [],
    };

    // create temp JSON file (similar to /api/solve)
    const inputPath = path.join(__dirname, "postprocess_input.json");
    fs.writeFileSync(inputPath, JSON.stringify(updatedPayload));

    const process = spawn("python3", [
      path.join(__dirname, "services", "postprocess.py"),
      inputPath,
    ]);

    // handle output and errors
    let output = "";
    let errOutput = "";

    process.stdout.on("data", (data) => {
      output += data.toString();
    });
    process.stderr.on("data", (err) => {
      // log python logs for debugging (not exactly 'error' logs)
      errOutput += err.toString();
      console.log("[PYTHON LOG]\n", err.toString());
    });

    process.on("close", (code) => {
      try {
        fs.unlinkSync(inputPath);
      } catch (_) {}

      try {
        const result = JSON.parse(output || "{}");
        if (result && result.success) {
          // cache full API output for subsequent operations
          app.locals.store.latestApiResponse = result;
          return res.json(result);
        }
        console.error("[SAVE] Postprocess failed", { code, stderr: errOutput });
        return res.status(500).json({
          success: false,
          error: result?.error || "Postprocess failed",
        });
      } catch (e) {
        console.error("[SAVE] Failed to parse postprocess output", e);
        return res.status(500).json({
          success: false,
          error: "Failed to parse postprocess output",
        });
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: "Server error" });
  }
});

app.post("/api/download-csv", (req, res) => {
  try {
    // destructure api response
    const { success, residents, resident_history, optimisation_scores } =
      req.body;

    // validate data
    if (
      !success ||
      !Array.isArray(residents) ||
      !Array.isArray(resident_history) ||
      !optimisation_scores
    ) {
      return res.status(400).json({
        success: false,
        error: "Invalid API response shape",
      });
    }

    // build map of mcr → { block: posting_code }
    const historyByMcr = {};
    resident_history
      .filter((h) => h.is_current_year) // filter by current year
      .forEach((h) => {
        if (!historyByMcr[h.mcr]) historyByMcr[h.mcr] = {};
        const monthBlock = parseInt(
          String(h.month_block ?? h.block ?? "").trim(),
          10
        );
        if (Number.isFinite(monthBlock)) {
          historyByMcr[h.mcr][monthBlock] = h.posting_code;
        }
      });

    // build csv header
    const headerCols = [
      "mcr",
      "name",
      "resident_year",
      "optimisation_score",
      // posting_code_block_1 … posting_code_block_12
      ...monthLabels,
      "ccr_posting_code",
    ];
    const header = headerCols.join(",") + "\n";

    // build csv rows
    const rows = residents.map((r, idx) => {
      const mcr = r.mcr;
      const name = r.name;
      const year = r.resident_year;
      const score = optimisation_scores[idx] ?? "";

      // pull their current-year block assignments 1..12
      const byBlock = historyByMcr[mcr] || {};
      const blockCodes = Array.from(
        { length: 12 },
        (_, i) => byBlock[i + 1] || ""
      );

      // their CCR status posting code (if any)
      const ccr = r.ccr_status?.posting_code || "";

      // assemble all columns
      const cols = [mcr, name, year, score, ...blockCodes, ccr];

      // CSV-escape any quotes
      const escaped = cols.map((v) => {
        const s = String(v).replace(/"/g, '""');
        return `"${s}"`;
      });

      return escaped.join(",");
    });

    // send csv
    const csvContent = header + rows.join("\n");
    // set headers to trigger file download response
    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="final_timetable.csv"'
    );
    res.send(csvContent); // send CSV content as response
  } catch (err) {
    // unexpected server error while generating the CSV
    console.error(err);
    res.status(500).json({ success: false, error: "Server error" });
  }
});

app.get("/api/health", (req, res) => {
  try {
    const { latestInputs, latestApiResponse } = app.locals.store || {};
    const hasInputs = !!latestInputs;
    const hasApiResponse = !!latestApiResponse;
    res.json({
      success: true,
      service: name || "server",
      version: version || "0.0.0",
      status: "ok",
      pid: process.pid,
      uptime_s: Math.round(process.uptime()),
      has_inputs: hasInputs,
      has_api_response: hasApiResponse,
      port: PORT,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ success: false, status: "degraded" });
  }
});

app.listen(PORT, () => console.log("Server on port", PORT));
