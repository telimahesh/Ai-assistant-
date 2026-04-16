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
        model: "gemini-2.0-flash",
        contents: prompt,
      });

      res.json({ text: response.text });
    } catch (error: any) {
      console.error("Gemini API Error:", error);
      let errorMsg = error.message;
      
      // Handle known error patterns
      if (errorMsg.includes("leaked")) {
        errorMsg = "CRITICAL SECURITY ERROR: This API Key has been leaked and disabled by Google. You MUST generate a NEW API Key at https://aistudio.google.com/app/apikey and update it in the Admin Panel.";
      } else if (errorMsg.includes("429") || errorMsg.includes("quota")) {
        errorMsg = "QUOTA EXCEEDED: The system's current Gemini API Key has hit its limit or has no quota. Please wait, check your billing status at ai.google.dev, or log in as Admin to configure a Paid API key.";
      } else if (errorMsg.includes("403") || errorMsg.includes("permission")) {
        errorMsg = "PERMISSION DENIED: The current API key does not have permission to access this model. Please check your API key settings.";
      } else {
        // Try to parse if it's a JSON stringified error from the SDK
        try {
          const parsed = JSON.parse(errorMsg);
          if (parsed.error?.message) errorMsg = parsed.error.message;
        } catch (e) {
          // Not JSON, keep original message
        }
      }
      
      res.status(500).json({ error: errorMsg });
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
