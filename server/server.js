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
    { name: "preferences", maxCount: 1 },
    { name: "resident_posting_data", maxCount: 1 },
    { name: "posting_quotas", maxCount: 1 },
  ]),
  async (req, res) => {
    if (!req.files || Object.keys(req.files).length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "No files uploaded" });
    }

    try {
      // parse
      const preferencesData = req.files.preferences[0].buffer.toString("utf-8");
      const preferences = parse(preferencesData, {
        columns: true,
        skip_empty_lines: true,
      });

      const residentData =
        req.files.resident_posting_data[0].buffer.toString("utf-8");
      const residentPostingData = parse(residentData, {
        columns: true,
        skip_empty_lines: true,
      });

      const quotasData = req.files.posting_quotas[0].buffer.toString("utf-8");
      const postingQuotas = parse(quotasData, {
        columns: true,
        skip_empty_lines: true,
      });

      // convert data to the expected format
      const preferencesFormatted = preferences.map((p) => ({
        id: p.id,
        name: p.name,
        year: parseInt(p.year),
        p1: p.p1,
        p2: p.p2,
        p3: p.p3,
        p4: p.p4,
        p5: p.p5,
      }));

      const residentPostingFormatted = residentPostingData.map((r) => ({
        id: r.id,
        name: r.name,
        year: parseInt(r.year),
        posting: r.posting,
        start_block: parseInt(r.start_block),
        block_duration: parseInt(r.block_duration),
        type: r.type,
      }));

      const quotasFormatted = postingQuotas.map((q) => ({
        course_name: q.course_name,
        max_residents: parseInt(q.max_residents),
        required_block_duration: parseInt(q.required_block_duration),
      }));

      // create input data structure
      const inputData = {
        preferences: preferencesFormatted,
        resident_posting_data: residentPostingFormatted,
        posting_quotas: quotasFormatted,
      };

      // EXECUTE posting allocator service

      // create temp JSON file with data
      const inputPath = path.join(__dirname, "input.json");
      fs.writeFileSync(inputPath, JSON.stringify(inputData));

      // spawn python process
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
          // catch error relating to posting allocator
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

    // generate CSV content
    const header =
      "id,name,year,p1,p2,p3,p4,p5,assigned_posting,start_block,block_duration\n";
    const rows = timetable
      .map(
        (r) =>
          `${r.id},${r.name},${r.year},${r.p1},${r.p2},${r.p3},${r.p4},${
            r.p5
          },${r.assigned_posting || ""},${r.start_block || ""},${
            r.block_duration || ""
          }`
      )
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
