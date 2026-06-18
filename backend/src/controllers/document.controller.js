const prisma = require("../database/prisma");

const fs = require("fs");

const pdf = require("pdf-parse");

const mammoth = require("mammoth");

// =====================================
// UPLOAD DOCUMENT
// =====================================

async function uploadDocument(req, res) {
  try {
    const file = req.file;

    if (!file) {
      return res.status(400).json({
        message: "No file uploaded",
      });
    }

    let content = "";

    // =====================================
    // PDF
    // =====================================

    if (file.mimetype === "application/pdf") {
      const buffer = fs.readFileSync(file.path);

      const data = await pdf(buffer);

      content = data.text;
    }

    // =====================================
    // DOCX
    // =====================================
    else if (
      file.mimetype ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      file.mimetype.includes("word")
    ) {
      const result = await mammoth.extractRawText({
        path: file.path,
      });

      content = result.value;
    }

    // =====================================
    // TXT
    // =====================================
    else if (file.mimetype === "text/plain") {
      content = fs.readFileSync(file.path, "utf8");
    }

    // =====================================
    // SAVE TO DATABASE
    // =====================================

    const document = await prisma.document.create({
      data: {
        name: file.originalname,
        path: file.path,
        content,
        userId: req.user.id,
      },
    });

    // =====================================
    // OPTIONAL:
    // DELETE PHYSICAL FILE AFTER EXTRACTING
    // =====================================

    try {
      fs.unlinkSync(file.path);
    } catch (err) {
      console.log("Could not delete file:", err.message);
    }

    res.status(201).json(document);
  } catch (error) {
    console.error("Document Upload Error:", error);

    res.status(500).json({
      message: "Upload failed",
      error: error.message,
    });
  }
}

// =====================================
// GET DOCUMENTS
// =====================================

async function getDocuments(req, res) {
  try {
    const documents = await prisma.document.findMany({
      where: {
        userId: req.user.id,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    res.json(documents);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Server Error",
    });
  }
}

// =====================================
// DELETE DOCUMENT
// =====================================

async function deleteDocument(req, res) {
  try {
    await prisma.document.delete({
      where: {
        id: req.params.id,
      },
    });

    res.json({
      success: true,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Delete Failed",
    });
  }
}

module.exports = {
  uploadDocument,
  getDocuments,
  deleteDocument,
};
