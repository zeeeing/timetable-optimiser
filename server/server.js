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
app.post("/api/upload-csv", upload.single("csvFile"), async (req, res) => {
  if (!req.file)
    return res
      .status(400)
      .json({ success: false, message: "No file uploaded" });

  try {
    const csvData = req.file.buffer.toString("utf-8");
    const records = parse(csvData, {
      columns: true,
      skip_empty_lines: true,
    });

    // convert records to the expected format
    const residents = records.map((r) => ({
      id: r.id,
      name: r.name,
      p1: r.p1,
      p2: r.p2,
      p3: r.p3,
      seniority: parseInt(r.seniority || 0),
    }));

    // EXECUTE posting allocator service

    // create temp JSON file with resident data
    const inputPath = path.join(__dirname, "input.json");
    fs.writeFileSync(inputPath, JSON.stringify({ residents }));

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
        res.status(500).json({
          success: false,
          message: "Invalid response from script",
        });
      }
    });
  } catch (e) {
    res.status(500).json({ success: false, message: "Failed to process file" });
  }
});

app.post("/api/download-csv", (req, res) => {
  try {
    const assigned = req.body.assigned;

    // if assigned is not provided or not an array, return error
    if (!assigned || !Array.isArray(assigned)) {
      return res.status(400).json({
        success: false,
        message: "Missing or invalid 'assigned' residents in request body",
      });
    }

    // generate CSV content
    const header = "id,name,p1,p2,p3,seniority,assignedPosting\n";
    const rows = assigned
      .map(
        (r) =>
          `${r.id},${r.name},${r.p1},${r.p2},${r.p3},${r.seniority},${
            r.assignedPosting || ""
          }`
      )
      .join("\n"); // ensure each row ends with a newline

    const csvContent = header + rows; // combine

    // set headers to trigger file download response
    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="assigned_postings.csv"'
    );
    res.send(csvContent); // send CSV content as response
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

app.listen(PORT, () => console.log("Server on port 3001"));
