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
      return res
        .status(400)
        .json({ success: false, message: "No files uploaded" });
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
      process.stdout.on("data", (data) => (output += data.toString()));
      process.stderr.on("data", (err) =>
        console.error("Posting allocation error: ", err.toString())
      );
      process.on("close", () => {
        fs.unlinkSync(inputPath); // deletes temporary input file
        try {
          const result = JSON.parse(output);
          res.json(result); // send response back to client
        } catch (err) {
          // catch error relating to posting allocator script response
          res.status(500).json({
            success: false,
            message: "Invalid response from script",
          });
        }
      });
    } catch (e) {
      // catch error relating to file parsing or processing
      console.error("Error processing files: ", e);
      res
        .status(500)
        .json({ success: false, message: "Failed to process files" });
    }
  }
);

// TO BE REFACTORED AND UPDATED
app.post("/api/download-csv", (req, res) => {
  try {
    const timetable = req.body.timetable;

    // if timetable is not provided or not an array, return error
    if (!timetable || !Array.isArray(timetable)) {
      return res.status(400).json({
        success: false,
        message: "Missing or invalid 'timetable' data in request body",
      });
    }

    // generate CSV content for 12 block posting
    const header =
      "mcr,resident_year," +
      Array.from({ length: 12 }, (_, i) => `block_${i + 1}`).join(",") +
      "\n";
    const rows = timetable
      .map((r) => {
        const blocks = Array(12).fill("");
        r.assigned_postings.forEach((posting) => {
          for (
            let i = posting.start_block - 1;
            i < posting.start_block - 1 + posting.duration_blocks;
            i++
          ) {
            blocks[i] = posting.posting_code;
          }
        });
        return `${r.mcr},${r.resident_year},${blocks.join(",")}`;
      })
      .join("\n");

    const csvContent = header + rows;

    // set headers to trigger file download response
    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="final_timetable.csv"'
    );
    res.send(csvContent); // send CSV content as response
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

app.listen(PORT, () => console.log("Server on port 3001"));
