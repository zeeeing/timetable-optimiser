const express = require("express");
const cors = require("cors");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const { parse } = require("csv-parse/sync");
const { spawn } = require("child_process");
const monthLabels = require("../shared/monthLabels.json");

const app = express();
PORT = process.env.PORT || 3001;
const { version, name } = require("./package.json");

// middleware
app.use(cors());
app.use(express.json());
const upload = multer({ storage: multer.memoryStorage() });

// in-memory store (per-process) for latest dataset and response
app.locals.store = {
  latestInputs: null, // dataset uploaded via /api/upload-csv
  latestApiResponse: null, // most recent optimiser/postprocess result
};

// routes
app.post(
  "/api/upload-csv",
  upload.fields([
    { name: "residents", maxCount: 1 },
    { name: "resident_history", maxCount: 1 },
    { name: "resident_preferences", maxCount: 1 },
    { name: "postings", maxCount: 1 },
    { name: "weightages", maxCount: 1 },
  ]),
  async (req, res) => {
    if (!req.files || Object.keys(req.files).length === 0) {
      // client did not upload any files
      return res
        .status(400)
        .json({ success: false, error: "No files were uploaded" });
    }

    try {
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

      const postingsCsv = req.files.postings[0].buffer.toString("utf-8");
      const postings = parse(postingsCsv, {
        columns: true,
        skip_empty_lines: true,
      });

      // get weightages from request body
      const weightages = JSON.parse(req.body.weightages);

      // format parsed files
      const residentsFormatted = residents.map((r) => ({
        mcr: r.mcr,
        name: r.name,
        resident_year: parseInt(r.resident_year),
      }));

      const residentHistoryFormatted = residentHistory.map((h) => ({
        mcr: h.mcr,
        year: parseInt(h.year),
        block: parseInt(h.block),
        posting_code: h.posting_code,
      }));

      const residentPreferencesFormatted = residentPreferences.map((p) => ({
        mcr: p.mcr,
        preference_rank: parseInt(p.preference_rank),
        posting_code: p.posting_code,
      }));

      const postingsFormatted = postings.map((q) => ({
        posting_code: q.posting_code,
        posting_name: q.posting_name,
        posting_type: q.posting_type,
        max_residents: parseInt(q.max_residents),
        required_block_duration: parseInt(q.required_block_duration),
      }));

      const inputData = {
        residents: residentsFormatted,
        resident_history: residentHistoryFormatted,
        resident_preferences: residentPreferencesFormatted,
        postings: postingsFormatted,
        weightages: weightages,
      };

      // cache the latest uploaded inputs for subsequent operations
      app.locals.store.latestInputs = JSON.parse(JSON.stringify(inputData));

      // create temp JSON file with input data
      const inputPath = path.join(__dirname, "input.json");
      fs.writeFileSync(inputPath, JSON.stringify(inputData));

      // spawn python process
      // array argument contains the path to the Python script and the input file
      const process = spawn("python3", [
        path.join(__dirname, "main.py"),
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

    // spawn python process
    const process = spawn("python3", [path.join(__dirname, "validate.py")]);

    // handle output and errors
    let output = "";
    let errOutput = "";

    process.stdout.on("data", (data) => (output += data.toString()));
    process.stderr.on("data", (err) => {
      errOutput += err.toString();
      console.log("[PYTHON LOG]\\n", err.toString());
    });

    // error handling
    process.on("error", (err) => {
      console.error("Failed to start validate.py", err);
    });

    // this time we write to stdin and read from there
    process.stdin.write(
      JSON.stringify({ resident_mcr: residentMcr, current_year: currentYear })
    );
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
    const base =
      app.locals.store.latestApiResponse || app.locals.store.latestInputs;

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
    const newEntries = currentYear.map((r) => ({
      mcr: residentMcr,
      year: year,
      block: parseInt(r.block),
      posting_code: r.posting_code,
      is_current_year: true,
    }));

    // update existing resident's history
    const updatedPayload = {
      residents,
      resident_history: [...filteredHistory, ...newEntries],
      resident_preferences: base.resident_preferences || [],
      postings: base.postings || [],
      weightages: base.weightages || {},
    };

    // create temp JSON file (similar to /api/upload-csv)
    const inputPath = path.join(__dirname, "postprocess_input.json");
    fs.writeFileSync(inputPath, JSON.stringify(updatedPayload));

    const process = spawn("python3", [
      path.join(__dirname, "postprocess.py"),
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
        historyByMcr[h.mcr][h.block] = h.posting_code;
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
