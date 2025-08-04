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

// middleware
app.use(cors());
app.use(express.json());
const upload = multer({ storage: multer.memoryStorage() });

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
        .json({ success: false, message: "No files were uploaded" });
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

      process.on("close", () => {
        fs.unlinkSync(inputPath); // deletes temporary input file

        try {
          const result = JSON.parse(output);
          if (result.success === false) {
            // python script reported an error
            res.status(400).json(result);
            console.log("[PYTHON LOG]", result.error);
          } else {
            res.json(result);
          }
        } catch (err) {
          // could not parse output as JSON
          res.status(500).json({
            success: false,
            message: "Internal server error: " + (output || err.message),
          });
        }
      });
    } catch (e) {
      // csv parsing/formatting failed
      console.error("Error processing files: ", e);
      res
        .status(500)
        .json({ success: false, message: "Failed to process files" });
    }
  }
);

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
        message: "Invalid API response shape",
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
    res.status(500).json({ success: false, message: "Server error" });
  }
});

app.listen(PORT, () => console.log("Server on port 3001"));
