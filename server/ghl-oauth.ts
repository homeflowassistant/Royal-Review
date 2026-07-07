/**
 * GHL OAuth Callback Route
 *
 * Handles the OAuth redirect from GoHighLevel after a sub-account installs the app.
 * Exchanges the authorization code for tokens and stores them in the database.
 *
 * Route: GET /api/ghl/oauth/callback?code=...
 */

import type { Express, Request, Response } from "express";
import {
  exchangeCodeForTokens,
  getInstallation,
  removeInstallation,
  upsertInstallation,
} from "./ghl-service.js";

export async function processLocationInstall(
  agencyToken: string,
  companyId: string,
  locationId: string
): Promise<void> {
  const response = await fetch("https://services.leadconnectorhq.com/oauth/location-token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Bearer ${agencyToken}`,
      Version: "2021-07-28",
    },
    body: new URLSearchParams({ companyId, locationId }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`GHL location-token exchange failed: ${response.status} ${errorBody}`);
  }

  const locationTokenResponse = (await response.json()) as { access_token?: string };
  if (!locationTokenResponse.access_token) {
    throw new Error("GHL location-token exchange returned no access token");
  }

  await upsertInstallation(locationTokenResponse as Parameters<typeof upsertInstallation>[0], locationId);
  console.log(`[GHL Webhook] Location token stored for locationId: ${locationId}`);
}

export function registerGHLOAuthRoutes(app: Express): void {
  /**
   * OAuth callback endpoint.
   * GHL redirects here after the user authorizes the app.
   * The `code` query parameter contains the authorization code.
   */
  app.get("/api/ghl/oauth/callback", async (req: Request, res: Response) => {
    const code = req.query.code as string | undefined;

    if (!code) {
      res.status(400).send(`
        <html>
          <body style="font-family: sans-serif; text-align: center; padding: 60px;">
            <h2 style="color: #dc2626;">Installation Failed</h2>
            <p>No authorization code received from GoHighLevel.</p>
            <p>Please try installing the app again from the GHL Marketplace.</p>
          </body>
        </html>
      `);
      return;
    }

    try {
      // Build the redirect URI (must match what's registered in GHL app settings)
      const protocol = req.headers["x-forwarded-proto"] || req.protocol;
      const host = req.headers["x-forwarded-host"] || req.headers.host;
      const redirectUri = `${protocol}://${host}/api/ghl/oauth/callback`;

      // Exchange authorization code for tokens
      const tokenResponse = await exchangeCodeForTokens(code, redirectUri);

      const companyId = tokenResponse.companyId;
      if (!companyId) {
        throw new Error("No companyId returned from GHL token exchange");
      }

      await upsertInstallation(tokenResponse, companyId);

      console.log(`[GHL OAuth] Agency token stored for companyId: ${companyId}`);

      // Show success page
      res.send(`
        <html>
          <body style="font-family: sans-serif; text-align: center; padding: 60px;">
            <div style="max-width: 400px; margin: 0 auto;">
              <div style="width: 64px; height: 64px; background: #16a34a; border-radius: 50%; margin: 0 auto 20px; display: flex; align-items: center; justify-content: center;">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
              </div>
              <h2 style="color: #16a34a; margin-bottom: 8px;">App Installed Successfully!</h2>
              <p style="color: #6b7280;">Royal Review Add Contacts has been connected to your GoHighLevel account.</p>
              <p style="color: #6b7280; font-size: 14px;">You can now close this window and access the app from your GHL sidebar.</p>
            </div>
          </body>
        </html>
      `);
    } catch (error) {
      console.error("[GHL OAuth] Callback error:", error);
      res.status(500).send(`
        <html>
          <body style="font-family: sans-serif; text-align: center; padding: 60px;">
            <h2 style="color: #dc2626;">Installation Failed</h2>
            <p>There was an error connecting to GoHighLevel.</p>
            <p style="color: #6b7280; font-size: 14px;">${error instanceof Error ? error.message : "Unknown error"}</p>
            <p>Please try installing the app again.</p>
          </body>
        </html>
      `);
    }
  });

  /**
   * Webhook endpoint for GHL app install events.
   * GHL sends a POST when the app is installed/uninstalled.
   */
  app.post("/api/ghl/webhook", async (req: Request, res: Response) => {
    try {
      const payload = req.body;
      console.log("[GHL Webhook] Received:", JSON.stringify(payload));

      if (payload.type === "INSTALL" && payload.locationId) {
        const { locationId, companyId } = payload as {
          locationId?: string;
          companyId?: string;
        };

        if (!companyId || !locationId) {
          console.error("[GHL Webhook] Missing companyId or locationId for install event");
          return res.status(400).json({ error: "Missing companyId or locationId" });
        }

        const agencyInstallation = await getInstallation(companyId);

        if (!agencyInstallation) {
          console.warn(`[GHL Webhook] Agency token not ready for ${companyId}, retrying in 3s...`);
          setTimeout(async () => {
            const retry = await getInstallation(companyId);
            if (retry) {
              await processLocationInstall(retry.accessToken, companyId, locationId);
            } else {
              console.error(`[GHL Webhook] Agency token still not found for ${companyId} after retry`);
            }
          }, 3000);
          return res.json({ success: true });
        }

        await processLocationInstall(agencyInstallation.accessToken, companyId, locationId);
      } else if (payload.type === "UNINSTALL" && payload.locationId) {
        await removeInstallation(payload.locationId);
        console.log(`[GHL Webhook] App uninstalled for location: ${payload.locationId}`);
      }

      res.json({ success: true });
    } catch (error) {
      console.error("[GHL Webhook] Error:", error);
      res.status(500).json({ error: "Webhook processing failed" });
    }
  });
}
