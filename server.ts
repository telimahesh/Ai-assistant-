import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  app.post("/api/world-update", async (req, res) => {
    try {
      const { apiKey: providedKey } = req.body;
      let apiKey = providedKey || process.env.GEMINI_API_KEY;
      
      // If still no key, try to fetch from Firestore REST API
      if (!apiKey || apiKey === "undefined" || apiKey.length < 10) {
        try {
          const config = JSON.parse(await fs.promises.readFile(path.join(process.cwd(), "firebase-applet-config.json"), "utf8"));
          const projectId = config.projectId;
          const firestoreRes = await fetch(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/config/global`);
          if (firestoreRes.ok) {
            const firestoreData = await firestoreRes.json();
            const dbKey = firestoreData?.fields?.geminiApiKey?.stringValue;
            if (dbKey && dbKey.length > 10) {
              apiKey = dbKey;
              console.log("Using Gemini API Key from Firestore.");
            }
          }
        } catch (dbError) {
          console.error("Failed to fetch key from Firestore:", dbError);
        }
      }

      if (!apiKey || apiKey === "undefined" || apiKey.length < 10) {
        return res.status(400).json({ 
          error: "Configuration Required: Please log in as Admin (ID: 587311, Pass: admin123) and set the 'Global Gemini API Key' in the Config tab." 
        });
      }

      const ai = new GoogleGenAI({ apiKey });
      const prompt = "Give me a brief summary of what is happening in the world today. Focus on major global events, technology, and science. Keep it concise.";
      
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
      });

      res.json({ text: response.text });
    } catch (error: any) {
      console.error("Gemini API Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
