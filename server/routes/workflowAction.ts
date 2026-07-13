import type { Express, Request, Response } from "express";
import { getValidAccessToken } from "../ghl-service.js";
import { compositeName } from "../services/imageCompositor.js";
import { storagePut } from "../storage.js";
import { Pool } from "pg";

export function registerWorkflowActionRoutes(app: Express): void {
  app.post("/api/workflow/send-personalized-sms", async (req: Request, res: Response) => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      const { data, extras } = req.body;
      const locationId = extras?.locationId;
      const contactId = extras?.contactId;
      const contactName = data?.name || "Friend";
      const message = data?.message || "";

      if (!locationId || !contactId) {
        return res.status(400).json({ success: false, message: "Missing context." });
      }

      // Automated Database Lookup
      const query = "SELECT data FROM stored_files ORDER BY created_at DESC LIMIT 1";
      const dbResult = await pool.query(query);
      
      if (dbResult.rows.length === 0) {
        return res.status(404).json({ success: false, message: "No base image found." });
      }

      const baseImageBuffer = Buffer.from(dbResult.rows[0].data, 'base64');

      // Personalization & Storage
      const personalizedImageBuffer = await compositeName(baseImageBuffer, contactName);
      const uploadResult = await storagePut(`personalized/${contactId}.jpg`, personalizedImageBuffer, "image/jpeg");
      
      let finalImageUrl = uploadResult.url;
      if (finalImageUrl.startsWith('/')) {
        finalImageUrl = `${process.env.BACKEND_URL}${finalImageUrl}`;
      }

      // GHL API Send
      const accessToken = await getValidAccessToken(locationId);
      await fetch(`https://services.leadconnectorhq.com/conversations/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
          Version: "2021-04-15",
        },
        body: JSON.stringify({
          type: "SMS",
          contactId,
          message,
          attachments: [finalImageUrl]
        } ),
      });

      return res.json({ success: true });
    } catch (error) {
      return res.status(500).json({ success: false, message: "Internal error" });
    } finally {
      await pool.end();
    }
  });
}