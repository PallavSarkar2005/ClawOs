import { useEffect, useState } from "react";

import Sidebar from "../components/Sidebar";

import {
  getDocuments,
  uploadDocument,
  deleteDocument,
} from "../api/documentApi";

function DocumentsPage() {
  const [documents, setDocuments] = useState([]);

  const [file, setFile] = useState(null);

  const loadDocuments = async () => {
    const data = await getDocuments();

    setDocuments(data);
  };

  const handleUpload = async () => {
    if (!file) return;

    await uploadDocument(file);

    setFile(null);

    loadDocuments();
  };

  const handleDelete = async (id) => {
    await deleteDocument(id);

    loadDocuments();
  };

  useEffect(() => {
    loadDocuments();
  }, []);

  return (
    <div className="flex h-screen bg-[#1B2748]">
      <Sidebar />

      <div className="flex-1 p-8">
        <h1 className="text-white text-3xl font-bold mb-6">Documents</h1>

        <div className="bg-[#24335f] p-5 rounded-xl mb-6">
          <input type="file" onChange={(e) => setFile(e.target.files[0])} />

          <button
            onClick={handleUpload}
            className="ml-4 bg-[#F15B42] text-white px-5 py-2 rounded-xl"
          >
            Upload
          </button>
        </div>

        <div className="grid gap-4">
          {documents.map((document) => (
            <div
              key={document.id}
              className="bg-[#24335f] p-5 rounded-xl flex justify-between"
            >
              <div>
                <h2 className="text-white">{document.name}</h2>
              </div>

              <button
                onClick={() => handleDelete(document.id)}
                className="bg-red-500 px-4 py-2 rounded-xl text-white"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default DocumentsPage;
