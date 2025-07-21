const express = require("express");
const cors = require("cors");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const { parse } = require("csv-parse/sync");
const { spawn } = require("child_process");

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
      };

      // create temp JSON file with input data
      const inputPath = path.join(__dirname, "input.json");
      fs.writeFileSync(inputPath, JSON.stringify(inputData));

      // spawn python process
      // array argument contains the path to the Python script and the input file
      const process = spawn("python3", [
        path.join(__dirname, "posting_allocator.py"),
        inputPath,
      ]);

      // handle output and errors
      let output = "";

      process.stdout.on("data", (data) => {
        output += data.toString();
      });
      process.stderr.on("data", (err) => {
        // log python logs for debugging (not exactly 'error' logs)
        console.log("[PYTHON LOG]", err.toString());
      });

      process.on("close", () => {
        fs.unlinkSync(inputPath); // deletes temporary input file

        try {
          const result = JSON.parse(output);
          if (result.success === false) {
            // python script reported an error
            res.status(400).json(result);
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
    // extract only necessary data from request body
    const { residents, resident_history, postings } = req.body;

    // if required data is not provided, return error
    if (
      !residents ||
      !Array.isArray(residents) ||
      !resident_history ||
      !Array.isArray(resident_history) ||
      !postings ||
      !Array.isArray(postings)
    ) {
      // request body is missing required data / data not in expected format
      return res.status(400).json({
        success: false,
        message: "Missing or invalid data in request body",
      });
    }

    // create posting code to posting name lookup map
    const postingMap = {};
    postings.forEach((p) => {
      postingMap[p.posting_code] = p.posting_name;
    });

    // filter for current year postings only
    const currentYearAssignments = resident_history.filter(
      (h) => h.is_current_year === true
    );

    // generate CSV content
    const header =
      "mcr,name,resident_year,year,block,posting_code,posting_name\n";
    const rows = currentYearAssignments
      .map((entry) => {
        const resident = residents.find((r) => r.mcr === entry.mcr);
        const postingName =
          postingMap[entry.posting_code] || entry.posting_code;

        return `${entry.mcr},${resident?.name || ""},${
          resident?.resident_year || ""
        },${entry.year},${entry.block},${entry.posting_code},${postingName}`;
      })
      .sort((a, b) => {
        // sort by MCR, then by year, then by block
        const aParts = a.split(",");
        const bParts = b.split(",");
        if (aParts[0] !== bParts[0]) return aParts[0].localeCompare(bParts[0]);
        if (aParts[3] !== bParts[3])
          return parseInt(aParts[3]) - parseInt(bParts[3]);
        return parseInt(aParts[4]) - parseInt(bParts[4]);
      })
      .join("\n");

    const csvContent = header + rows;

    // set headers to trigger file download response
    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="optimised_timetable.csv"'
    );
    res.send(csvContent); // send CSV content as response
  } catch (err) {
    // unexpected server error while generating the CSV
    console.error(err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

app.listen(PORT, () => console.log("Server on port 3001"));
