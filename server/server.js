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
    { name: "posting_quotas", maxCount: 1 },
  ]),
  async (req, res) => {
    if (!req.files || Object.keys(req.files).length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "No files uploaded" });
    }

    try {
      // parse csv files

      // 1. residents
      const residentsCsv = req.files.residents[0].buffer.toString("utf-8");
      const residents = parse(residentsCsv, {
        columns: true,
        skip_empty_lines: true,
      });

      console.log("\n=== PARSED RESIDENTS ===");
      console.log(JSON.stringify(residents, null, 2));

      // 2. resident history
      const historyCsv = req.files.resident_history[0].buffer.toString("utf-8");
      const residentHistories = parse(historyCsv, {
        columns: true,
        skip_empty_lines: true,
      });

      console.log("\n=== PARSED RESIDENT HISTORIES ===");
      console.log(JSON.stringify(residentHistories, null, 2));

      // 3. resident preferences
      const preferencesCsv =
        req.files.resident_preferences[0].buffer.toString("utf-8");
      const residentPreferences = parse(preferencesCsv, {
        columns: true,
        skip_empty_lines: true,
      });

      console.log("\n=== PARSED RESIDENT PREFERENCES ===");
      console.log(JSON.stringify(residentPreferences, null, 2));

      // 4. posting quotas
      const quotasCsv = req.files.posting_quotas[0].buffer.toString("utf-8");
      const postingQuotas = parse(quotasCsv, {
        columns: true,
        skip_empty_lines: true,
      });

      console.log("\n=== PARSED POSTING QUOTAS ===");
      console.log(JSON.stringify(postingQuotas, null, 2));

      // prep input data
      const residentHistoriesFormatted = residents.map((resident) => {
        const entries = residentHistories
          .filter((h) => h.mcr === resident.mcr)
          .map((h) => {
            const blocks = [];
            // extract block postings (block_1 to block_12)
            for (let i = 1; i <= 12; i++) {
              const blockKey = `block_${i}`;
              if (h[blockKey]) {
                blocks.push({
                  block: i,
                  posting: h[blockKey],
                });
              }
            }

            return {
              resident_year: parseInt(h.resident_year),
              blocks: blocks,
            };
          });

        return {
          mcr: resident.mcr,
          name: resident.name,
          resident_year: parseInt(resident.resident_year),
          past_history: entries,
        };
      });

      const residentPreferencesFormatted = residentPreferences.map((r) => {
        return {
          mcr: r.mcr,
          p1: r.preference_1 || null,
          p2: r.preference_2 || null,
          p3: r.preference_3 || null,
          p4: r.preference_4 || null,
          p5: r.preference_5 || null,
        };
      });

      const postingQuotasFormatted = postingQuotas.map((q) => ({
        posting_code: q.posting_code,
        posting_type: q.posting_type || "NA", // core or elective
        max_residents: parseInt(q.max_residents),
        required_block_duration: parseInt(q.required_block_duration) || 3,
      }));

      const inputData = {
        residents: residentHistoriesFormatted,
        preferences: residentPreferencesFormatted,
        posting_quotas: postingQuotasFormatted,
      }; // !! please see sample input json file for expected format

      console.log("\n=== FINAL INPUT DATA ===");
      console.log(JSON.stringify(inputData, null, 2));

      // create temp JSON file with input data
      const inputPath = path.join(__dirname, "input.json");
      fs.writeFileSync(inputPath, JSON.stringify(inputData));

      // spawn python process
      // input array contains the path to the Python script and the input file
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
