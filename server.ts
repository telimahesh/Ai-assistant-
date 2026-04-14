import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
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
      const apiKey = providedKey || process.env.GEMINI_API_KEY;
      
      if (!apiKey || apiKey === "undefined" || apiKey.length < 10) {
        return res.status(400).json({ 
          error: "Gemini API Key is missing or invalid. Please set the 'Global Gemini API Key' in the Zoya Admin Panel (Config tab) to enable system-wide free access." 
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
