const {
  documentService,
} = require("../memory");
const uploadDocumentMw = require("../middleware/upload-document.middleware");

async function uploadDocument(req, res) {
  try {
    const result = await documentService.upload(req.user.id, req.file, {
      projectId: req.body.projectId,
      workspaceId: req.body.workspaceId,
    });
    try {
      const { fireByType } = require("../workflows/triggers/manager");
      await fireByType(
        req.user.id,
        "document_uploaded",
        { projectId: req.body.projectId },
        {
          inputs: {
            documentId: result.document?.id,
            name: result.document?.name,
            projectId: req.body.projectId,
          },
        },
      );
    } catch {
      /* optional */
    }
    res.status(201).json(result.document);
  } catch (error) {
    console.error("Document Upload Error:", error);
    res.status(error.status || 500).json({
      message: error.message || "Upload failed",
    });
  }
}

async function getDocuments(req, res) {
  try {
    const result = await documentService.list(req.user.id, {
      q: req.query.q,
      status: req.query.status,
      skip: req.query.skip,
      take: req.query.take || 100,
    });
    res.json(result.items);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error" });
  }
}

async function deleteDocument(req, res) {
  try {
    const doc = await documentService.remove(req.user.id, req.params.id);
    if (!doc) return res.status(404).json({ message: "Document not found" });
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Delete Failed" });
  }
}

module.exports = {
  uploadDocument,
  getDocuments,
  deleteDocument,
  uploadDocumentMw,
};
