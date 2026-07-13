// import type { Express, Request, Response } from "express";
// import { getValidAccessToken } from "../ghl-service.js";
// import { compositeName } from "../services/imageCompositor.js";
// import { storagePut } from "../storage.js";
// import { Pool } from "pg";

// export function registerWorkflowActionRoutes(app: Express): void {
//   app.post("/api/workflow/send-personalized-sms", async (req: Request, res: Response) => {
//     const pool = new Pool({ connectionString: process.env.DATABASE_URL });
//     try {
//       const { data, extras } = req.body;
//       const locationId = extras?.locationId;
//       const contactId = extras?.contactId;
//       const contactName = data?.name || "Friend";
//       const message = data?.message || "";

//       if (!locationId || !contactId) {
//         return res.status(400).json({ success: false, message: "Missing context." });
//       }

//       // Automated Database Lookup
//       const query = "SELECT data FROM stored_files ORDER BY created_at DESC LIMIT 1";
//       const dbResult = await pool.query(query);
      
//       if (dbResult.rows.length === 0) {
//         return res.status(404).json({ success: false, message: "No base image found." });
//       }

//       const baseImageBuffer = Buffer.from(dbResult.rows[0].data, 'base64');

//       // Personalization & Storage
//       const personalizedImageBuffer = await compositeName(baseImageBuffer, contactName);
//       const uploadResult = await storagePut(`personalized/${contactId}.jpg`, personalizedImageBuffer, "image/jpeg");
      
//       let finalImageUrl = uploadResult.url;
//       if (finalImageUrl.startsWith('/')) {
//         finalImageUrl = `${process.env.BACKEND_URL}${finalImageUrl}`;
//       }

//       // GHL API Send
//       const accessToken = await getValidAccessToken(locationId);
//       await fetch(`https://services.leadconnectorhq.com/conversations/messages`, {
//         method: "POST",
//         headers: {
//           "Content-Type": "application/json",
//           Authorization: `Bearer ${accessToken}`,
//           Version: "2021-04-15",
//         },
//         body: JSON.stringify({
//           type: "SMS",
//           contactId,
//           message,
//           attachments: [finalImageUrl]
//         } ),
//       });

//       return res.json({ success: true });
//     } catch (error) {
//       return res.status(500).json({ success: false, message: "Internal error" });
//     } finally {
//       await pool.end();
//     }
//   });
// }


import type { Express, Request, Response } from "express";
import { getValidAccessToken } from "../ghl-service.js";
import { compositeName } from "../services/imageCompositor.js";
import { storagePut } from "../storage.js";
import { Pool } from "pg";

export function registerWorkflowActionRoutes(app: Express): void {
  app.post("/api/workflow/send-personalized-sms", async (req: Request, res: Response) => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      // === DEBUG LOGGING: Log everything GHL sends ===
      console.log("[WorkflowAction] === INCOMING REQUEST ===");
      console.log("[WorkflowAction] Method:", req.method);
      console.log("[WorkflowAction] URL:", req.originalUrl);
      console.log("[WorkflowAction] Headers:", JSON.stringify(req.headers, null, 2));
      console.log("[WorkflowAction] Body keys:", Object.keys(req.body || {}));
      console.log("[WorkflowAction] Full Body:", JSON.stringify(req.body, null, 2));

      const body = req.body;

      // GHL sends payload in this shape:
      // { data: { name: "...", message: "..." }, extras: { locationId: "...", contactId: "..." } }
      // But we need to handle all possible structures

      let locationId: string | undefined;
      let contactId: string | undefined;
      let contactName: string;
      let message: string;

      // Try the standard GHL structure first
      if (body.extras && typeof body.extras === "object") {
        locationId = body.extras.locationId;
        contactId = body.extras.contactId;
      }

      // Fallback: GHL sometimes sends locationId at the top level
      if (!locationId) {
        locationId = body.locationId || body.location_id;
      }
      if (!contactId) {
        contactId = body.contactId || body.contact_id;
      }

      // Extract data fields
      if (body.data && typeof body.data === "object") {
        contactName = body.data.name || body.data.contactName || body.data.firstName || "Friend";
        message = body.data.message || body.data.smsMessage || "";
      } else {
        // Fallback: top-level fields
        contactName = body.name || body.contactName || body.firstName || "Friend";
        message = body.message || body.smsMessage || "";
      }

      console.log("[WorkflowAction] Extracted values:");
      console.log("  locationId:", locationId);
      console.log("  contactId:", contactId);
      console.log("  contactName:", contactName);
      console.log("  message:", message);

      if (!locationId || !contactId) {
        console.error("[WorkflowAction] Missing locationId or contactId");
        return res.status(400).json({
          success: false,
          message: "Missing locationId or contactId. Full payload logged on backend.",
          receivedPayload: {
            topKeys: Object.keys(body),
            locationId,
            contactId,
            dataKeys: body.data ? Object.keys(body.data) : null,
          },
        });
      }

      // 2. Automatically get the base image from the database
      console.log("[WorkflowAction] Fetching base image from stored_files...");
      const query = "SELECT data, content_type FROM stored_files ORDER BY created_at DESC LIMIT 1";
      const dbResult = await pool.query(query);

      if (dbResult.rows.length === 0) {
        console.error("[WorkflowAction] No image found in stored_files");
        return res.status(404).json({
          success: false,
          message: "No base image found in the database. Please upload an image in the app first.",
        });
      }

      console.log("[WorkflowAction] Base image found. Content-Type:", dbResult.rows[0].content_type);
      const baseImageBase64 = dbResult.rows[0].data;
      const baseImageBuffer = Buffer.from(baseImageBase64, "base64");

      // 3. Generate the personalized image
      console.log("[WorkflowAction] Compositing name:", contactName);
      const personalizedImageBuffer = await compositeName(baseImageBuffer, contactName, {
        fontSize: 72,
        fontColor: "#111111",
        fontWeight: "bold",
        bgColor: "#ffffff",
        bgOpacity: 1,
        padding: 20,
      });
      console.log("[WorkflowAction] Personalized image buffer size:", personalizedImageBuffer.length, "bytes");

      // 4. Upload the personalized image to storage
      const uploadKey = `personalized/${contactId}-${Date.now()}.jpg`;
      console.log("[WorkflowAction] Uploading to storage with key:", uploadKey);
      const uploadResult = await storagePut(uploadKey, personalizedImageBuffer, "image/jpeg");
      console.log("[WorkflowAction] Upload result:", JSON.stringify(uploadResult));

      // Construct the absolute URL for GHL
      let finalImageUrl = uploadResult.url;
      if (finalImageUrl.startsWith("/")) {
        const backendUrl = (process.env.BACKEND_URL || "").replace(/\/+$/, "");
        finalImageUrl = `${backendUrl}${finalImageUrl}`;
      }
      console.log("[WorkflowAction] Final image URL:", finalImageUrl);

      // 5. Send the SMS using the GHL Conversations API
      console.log("[WorkflowAction] Sending SMS via GHL API...");
      const accessToken = await getValidAccessToken(locationId);
      const ghlBody: Record<string, unknown> = {
        type: "SMS",
        contactId: contactId,
        message: message,
        attachments: [finalImageUrl],
      };
      console.log("[WorkflowAction] GHL payload:", JSON.stringify(ghlBody));

      const ghlResponse = await fetch(
        `https://services.leadconnectorhq.com/conversations/messages`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            Authorization: `Bearer ${accessToken}`,
            Version: "2021-04-15",
          },
          body: JSON.stringify(ghlBody),
        }
      );

      if (!ghlResponse.ok) {
        const errorText = await ghlResponse.text();
        throw new Error(`GHL API error: ${ghlResponse.status} ${errorText}`);
      }

      console.log("[WorkflowAction] SMS sent successfully!");
      return res.json({
        success: true,
        message: "Personalized SMS sent successfully via backend workflow action.",
      });
    } catch (error) {
      console.error("[WorkflowAction] Fatal Error:", error);
      return res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : "Internal server error",
      });
    } finally {
      await pool.end();
    }
  });
}
