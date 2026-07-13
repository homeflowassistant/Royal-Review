import type { Express, Request, Response } from "express";
import { getValidAccessToken, getMessagingContext, searchContacts, getContactById } from "../ghl-service.js";
import { Pool } from "pg";



export function registerWorkflowActionRoutes(app: Express): void {
  app.post("/api/workflow/send-personalized-sms", async (req: Request, res: Response) => {
    try {
      console.log("[WorkflowAction] === INCOMING REQUEST ===");
      console.log("[WorkflowAction] Full Body:", JSON.stringify(req.body, null, 2));

      const body = req.body;

      // 1. Extract locationId from query string or headers
      let locationId: string | undefined =
        typeof req.query.locationId === "string"
          ? req.query.locationId
          : req.headers["locationid"] as string | undefined;

            // 2. Extract fields from body.data (where GHL puts them)
      const data = body.data || {};
      const contactName = data.name || data.contactName || data.firstName || "";
      const contactEmail = data.email || data.Email || data.contactEmail || "";
      const contactPhone = data.phone || data.contactPhone || data.phoneNumber || "";
      const message = data.message || data.smsMessage || "";
      const contactIdFromExtras = body.extras?.contactId || "";

      console.log("[WorkflowAction] Extracted:");
      console.log("  locationId:", locationId);
      console.log("  contactName:", contactName);
      console.log("  contactEmail:", contactEmail);
      console.log("  contactPhone:", contactPhone);
      console.log("  message:", message);
      console.log("  contactId from extras:", contactIdFromExtras);

      if (!locationId) {
        return res.status(400).json({ success: false, message: "Missing locationId." });
      }

      // 3. Look up the contact - first try extras.contactId, then search
      console.log("[WorkflowAction] Looking up contact...");
      let contactId: string | undefined;
      let matchedContactName: string = "";

      // Priority 1: Use contactId from extras (most reliable)
      if (contactIdFromExtras) {
        console.log("[WorkflowAction] Using contactId from extras:", contactIdFromExtras);
        contactId = contactIdFromExtras;
        // Use the name sent from the workflow for the image (this will be {{contact.first_name}})
        matchedContactName = contactName || "Friend";
      }
      // Priority 2: Search by email
      else if (contactEmail) {
        const emailResult = await searchContacts(locationId, { query: contactEmail, pageLimit: 1 });
        const exactMatch = emailResult.contacts.find(c => c.email.toLowerCase() === contactEmail.toLowerCase());
        if (exactMatch) {
          contactId = exactMatch.id;
          matchedContactName = contactName || exactMatch.name;
        }
      }
      // Priority 3: Search by phone
      else if (contactPhone) {
        const phoneResult = await searchContacts(locationId, { query: contactPhone, pageLimit: 1 });
        const exactMatch = phoneResult.contacts.find(c => {
          const cleanPhone = (c.phone || "").replace(/[^0-9]/g, "");
          const cleanInput = contactPhone.replace(/[^0-9]/g, "");
          return cleanPhone === cleanInput;
        });
        if (exactMatch) {
          contactId = exactMatch.id;
          matchedContactName = contactName || exactMatch.name;
        }
      }
      // Priority 4: Search by name
      else if (contactName) {
        const nameResult = await searchContacts(locationId, { query: contactName, pageLimit: 1 });
        if (nameResult.contacts.length > 0) {
          contactId = nameResult.contacts[0].id;
          matchedContactName = contactName || nameResult.contacts[0].name;
        }
      }

      if (!contactId) {
        return res.status(404).json({ success: false, message: "No contact found." });
      }

      if (!contactId) {
        return res.status(404).json({ success: false, message: "No contact found." });
      }

      console.log("[WorkflowAction] Found contactId:", contactId, "Name:", matchedContactName);

      // 4. Fetch the personalized image base URL from GHL Custom Values
      // This is the exact same URL template used by the Messaging Page
      const messagingContext = await getMessagingContext(locationId);
      const baseUrl = messagingContext.personalizedImageBaseUrl;

      if (!baseUrl) {
        return res.status(404).json({ success: false, message: "No personalized image URL template found in GHL Custom Values. Please upload an image first in the Messaging Page." });
      }

      console.log("[WorkflowAction] Using base URL template:", baseUrl);

      // 5. Construct the URL using the EXACT same logic as your Messaging Page (buildPersonalizedImageUrl)
      // This ensures the image is rendered perfectly via the proven dynamicImageRender route
      const personalizationUrl = (() => {
        try {
          const url = new URL(baseUrl);
          url.searchParams.set("name", matchedContactName + "!");
          return url.toString();
        } catch {
          const separator = baseUrl.includes("?") ? "&" : "?";
          return `${baseUrl}${separator}name=${encodeURIComponent(matchedContactName + "!")}`;
        }
      })();

      console.log("[WorkflowAction] Generated personalized URL:", personalizationUrl);

      // 6. Send the SMS using the GHL Conversations API
      console.log("[WorkflowAction] Sending SMS via GHL API...");
      const accessToken = await getValidAccessToken(locationId);
      
      const ghlBody: Record<string, unknown> = {
        type: "SMS",
        contactId: contactId,
        message: message,
        attachments: [personalizationUrl]
      };
      
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
      return res.json({ success: true, message: "Personalized SMS sent successfully.", contactId });
    } catch (error) {
      console.error("[WorkflowAction] Fatal Error:", error);
      return res.status(500).json({ success: false, message: error instanceof Error ? error.message : "Internal server error" });
    }
  });
}
