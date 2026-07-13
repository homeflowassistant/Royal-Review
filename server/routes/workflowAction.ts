import type { Express, Request, Response } from "express";
import { getValidAccessToken, searchContacts } from "../ghl-service.js";
import { compositeName } from "../services/imageCompositor.js";
import { storagePut } from "../storage.js";
import { Pool } from "pg";

export function registerWorkflowActionRoutes(app: Express): void {
  app.post("/api/workflow/send-personalized-sms", async (req: Request, res: Response) => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      console.log("[WorkflowAction] === INCOMING REQUEST ===");
      console.log("[WorkflowAction] Method:", req.method);
      console.log("[WorkflowAction] URL:", req.originalUrl);
      console.log("[WorkflowAction] Query:", JSON.stringify(req.query));
      console.log("[WorkflowAction] Full Body:", JSON.stringify(req.body, null, 2));

      const body = req.body;

      // 1. Extract locationId from query string or headers
      let locationId: string | undefined =
        typeof req.query.locationId === "string"
          ? req.query.locationId
          : typeof req.query.location_id === "string"
            ? req.query.location_id
            : undefined;

      if (!locationId) {
        const headerLocationId = req.headers["locationid"] as string | undefined;
        if (headerLocationId) {
          locationId = headerLocationId;
        }
      }

      // 2. Extract all possible contact identifiers and message
      const contactName = body.name || body.contactName || body.firstName || "";
      const contactEmail = body.email || body.contactEmail || "";
      const contactPhone = body.phone || body.contactPhone || body.phoneNumber || "";
      const message = body.message || body.smsMessage || "";

      console.log("[WorkflowAction] Extracted:");
      console.log("  locationId:", locationId);
      console.log("  contactName:", contactName);
      console.log("  contactEmail:", contactEmail);
      console.log("  contactPhone:", contactPhone);
      console.log("  message:", message);

      if (!locationId) {
        return res.status(400).json({
          success: false,
          message: "Missing locationId.",
          receivedQuery: req.query,
        });
      }

      // 3. Build search strategy: use email/phone first (exact), then name
      console.log("[WorkflowAction] Looking up contact...");

      let contactId: string | undefined;
      let matchedContactName: string = "";

      // Priority 1: Search by email (most unique)
      if (contactEmail) {
        console.log("[WorkflowAction] Searching by email:", contactEmail);
        const emailResult = await searchContacts(locationId, {
          query: contactEmail,
          pageLimit: 5,
        });
        const exactEmailMatch = emailResult.contacts.find(
          (c) => c.email.toLowerCase() === contactEmail.toLowerCase()
        );
        if (exactEmailMatch) {
          contactId = exactEmailMatch.id;
          matchedContactName = exactEmailMatch.name;
        }
      }

      // Priority 2: Search by phone (second most unique)
      if (!contactId && contactPhone) {
        console.log("[WorkflowAction] Searching by phone:", contactPhone);
        const phoneResult = await searchContacts(locationId, {
          query: contactPhone,
          pageLimit: 5,
        });
        const exactPhoneMatch = phoneResult.contacts.find(
          (c) => {
            const cleanPhone = (c.phone || "").replace(/[^0-9]/g, "");
            const cleanInput = contactPhone.replace(/[^0-9]/g, "");
            return cleanPhone === cleanInput;
          }
        );
        if (exactPhoneMatch) {
          contactId = exactPhoneMatch.id;
          matchedContactName = exactPhoneMatch.name;
        }
      }

      // Priority 3: Search by name (fallback, least unique)
      if (!contactId && contactName) {
        console.log("[WorkflowAction] Searching by name:", contactName);
        const nameResult = await searchContacts(locationId, {
          query: contactName,
          pageLimit: 5,
        });
        const exactNameMatch = nameResult.contacts.find(
          (c) => c.name.toLowerCase() === contactName.toLowerCase()
        );
        if (exactNameMatch) {
          contactId = exactNameMatch.id;
          matchedContactName = exactNameMatch.name;
        } else if (nameResult.contacts.length > 0) {
          // Partial match fallback
          contactId = nameResult.contacts[0].id;
          matchedContactName = nameResult.contacts[0].name;
        }
      }

      if (!contactId) {
        return res.status(404).json({
          success: false,
          message: `No contact found with name="${contactName}", email="${contactEmail}", phone="${contactPhone}".`,
        });
      }

      console.log("[WorkflowAction] Found contactId:", contactId, "| Name:", matchedContactName);

      // 4. Fetch base image from stored_files
      console.log("[WorkflowAction] Fetching base image from stored_files...");
      const dbQuery = "SELECT data, content_type FROM stored_files ORDER BY created_at DESC LIMIT 1";
      const dbResult = await pool.query(dbQuery);

      if (dbResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: "No base image found in the database.",
        });
      }

      console.log("[WorkflowAction] Base image found.");
      const baseImageBase64 = dbResult.rows[0].data;
      const baseImageBuffer = Buffer.from(baseImageBase64, "base64");

      // 5. Generate the personalized image using the matched contact name
      console.log("[WorkflowAction] Compositing name:", matchedContactName);
      const personalizedImageBuffer = await compositeName(baseImageBuffer, matchedContactName, {
        fontSize: 72,
        fontColor: "#111111",
        fontWeight: "bold",
        bgColor: "#ffffff",
        bgOpacity: 1,
        padding: 20,
      });
      console.log("[WorkflowAction] Personalized image size:", personalizedImageBuffer.length, "bytes");

      // 6. Upload the personalized image
      const uploadKey = `personalized/${contactId}-${Date.now()}.jpg`;
      const uploadResult = await storagePut(uploadKey, personalizedImageBuffer, "image/jpeg");
      console.log("[WorkflowAction] Upload result:", JSON.stringify(uploadResult));

      // Build absolute URL
      let finalImageUrl = uploadResult.url;
      if (finalImageUrl.startsWith("/")) {
        const backendUrl = (process.env.BACKEND_URL || "").replace(/\/+$/, "");
        finalImageUrl = `${backendUrl}${finalImageUrl}`;
      }
      console.log("[WorkflowAction] Final image URL:", finalImageUrl);

      // 7. Send SMS via GHL Conversations API
      console.log("[WorkflowAction] Sending SMS...");
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
          body: JSON.stringify(ghlBody ),
        }
      );

      if (!ghlResponse.ok) {
        const errorText = await ghlResponse.text();
        throw new Error(`GHL API error: ${ghlResponse.status} ${errorText}`);
      }

      console.log("[WorkflowAction] SMS sent successfully!");
      return res.json({
        success: true,
        message: "Personalized SMS sent successfully.",
        contactId,
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
