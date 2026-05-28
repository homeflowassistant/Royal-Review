import type { Express, Request, Response } from "express";
import { z } from "zod";
import { ENV } from "../_core/env.js";
import { getInstallation, upsertContactWithTag } from "../ghl-service.js";
import { sdk } from "../_core/sdk.js";
import {
  createOrGetZapierConnection,
  normalizeZapierError,
  revokeZapierConnection,
  rotateZapierConnection,
  upsertZapierContact,
  validateZapierConnectionKey,
  ZapierHttpError,
} from "../services/zapier-service.js";

function getHeaderValue(req: Request, headerName: string): string {
  const value = req.headers[headerName.toLowerCase()];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function normalizeText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

const upsertSchema = z
  .object({
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    email: z.string().email().optional(),
    phone: z.string().optional(),
    source: z.string().optional(),
    tags: z.array(z.string()).optional(),
    customFields: z.array(z.object({ key: z.string(), value: z.unknown().optional() })).optional(),
  })
  .refine((value) => Boolean(value.email || value.phone), {
    message: "At least one of email or phone is required.",
    path: ["email"],
  });

type RateBucket = { count: number; resetAt: number };
const RATE_BUCKETS = new Map<string, RateBucket>();

function applyRateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const bucket = RATE_BUCKETS.get(key);

  if (!bucket || now >= bucket.resetAt) {
    RATE_BUCKETS.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (bucket.count >= limit) {
    return false;
  }

  bucket.count += 1;
  RATE_BUCKETS.set(key, bucket);
  return true;
}

function sendZapierError(res: Response, error: unknown) {
  const normalized = normalizeZapierError(error);
  res.status(normalized.statusCode).json({
    success: false,
    message: normalized.message,
  });
}

async function requireAuthenticatedUser(req: Request, res: Response): Promise<boolean> {
  try {
    const user = await sdk.authenticateRequest(req);
    res.locals.user = user;
    return true;
  } catch {
    res.status(401).json({
      success: false,
      message: "Unauthorized.",
    });
    return false;
  }
}

function getZapierConnectionKey(req: Request): string | undefined {
  const fromHeader = getHeaderValue(req, "x-zapier-connection-key");
  if (fromHeader) return fromHeader.trim();
  const fromBody = normalizeText(req.body?.connectionKey);
  return fromBody;
}

export function registerZapierRoutes(app: Express): void {
  app.get("/api/zapier/connection", async (req: Request, res: Response) => {
    if (!(await requireAuthenticatedUser(req, res))) return;

    try {
      const locationId = normalizeText(req.query.locationId);
      if (!locationId) {
        return res.status(400).json({
          success: false,
          message: "locationId is required.",
        });
      }

      const installation = await getInstallation(locationId);
      if (!installation) {
        return res.status(403).json({
          success: false,
          message: "The GHL app is not installed or active for this location.",
        });
      }

      const data = await createOrGetZapierConnection(locationId);

      return res.json({
        success: true,
        locationId,
        locationName: locationId,
        zapierEnabled: true,
        connectionKey: data.connectionKey,
        connectionKeyPreview: data.connectionKeyPreview,
        zapierInviteUrl: ENV.zapierInviteUrl,
        createdAt: data.createdAt.toISOString(),
        lastUsedAt: data.lastUsedAt ? data.lastUsedAt.toISOString() : null,
      });
    } catch (error) {
      return sendZapierError(res, error);
    }
  });

  app.post("/api/zapier/connection/rotate", async (req: Request, res: Response) => {
    if (!(await requireAuthenticatedUser(req, res))) return;

    try {
      const locationId = normalizeText(req.body?.locationId);
      if (!locationId) {
        return res.status(400).json({
          success: false,
          message: "locationId is required.",
        });
      }

      const installation = await getInstallation(locationId);
      if (!installation) {
        return res.status(403).json({
          success: false,
          message: "The GHL app is not installed or active for this location.",
        });
      }

      const rotated = await rotateZapierConnection(locationId);
      return res.json({
        success: true,
        locationId,
        connectionKey: rotated.connectionKey,
        connectionKeyPreview: rotated.connectionKeyPreview,
        message: "Zapier connection key rotated successfully. Existing Zaps using the old key will stop working.",
      });
    } catch (error) {
      return sendZapierError(res, error);
    }
  });

  app.post("/api/zapier/connection/revoke", async (req: Request, res: Response) => {
    if (!(await requireAuthenticatedUser(req, res))) return;

    try {
      const locationId = normalizeText(req.body?.locationId);
      if (!locationId) {
        return res.status(400).json({
          success: false,
          message: "locationId is required.",
        });
      }

      const installation = await getInstallation(locationId);
      if (!installation) {
        return res.status(403).json({
          success: false,
          message: "The GHL app is not installed or active for this location.",
        });
      }

      await revokeZapierConnection(locationId);
      return res.json({
        success: true,
        locationId,
        zapierEnabled: false,
        message: "Zapier access has been revoked for this location.",
      });
    } catch (error) {
      return sendZapierError(res, error);
    }
  });

  app.post("/api/zapier/auth/test", async (req: Request, res: Response) => {
    const remote = normalizeText(req.ip) ?? "unknown-ip";
    if (!applyRateLimit(`auth:${remote}`, 30, 60_000)) {
      return res.status(429).json({
        success: false,
        message: "Too many requests. Try again shortly.",
      });
    }

    const connectionKey = getZapierConnectionKey(req);
    if (!connectionKey) {
      return res.status(401).json({
        success: false,
        message: "Missing Zapier connection key.",
      });
    }

    try {
      const account = await validateZapierConnectionKey(connectionKey);

      return res.json({
        success: true,
        account: {
          locationId: account.locationId,
          locationName: account.locationName,
          companyId: account.companyId,
        },
        label: `${account.locationName} - ${account.locationId}`,
      });
    } catch (error) {
      if (error instanceof ZapierHttpError) {
        return res.status(error.statusCode).json({
          success: false,
          message: error.message,
        });
      }
      return sendZapierError(res, error);
    }
  });

  app.post("/api/zapier/contacts/upsert", async (req: Request, res: Response) => {
    const remote = normalizeText(req.ip) ?? "unknown-ip";
    if (!applyRateLimit(`upsert:${remote}`, 60, 60_000)) {
      return res.status(429).json({
        success: false,
        message: "Too many requests. Try again shortly.",
      });
    }

    const connectionKey = getZapierConnectionKey(req);
    if (!connectionKey) {
      return res.status(401).json({
        success: false,
        message: "Missing Zapier connection key.",
      });
    }

    const parsed = upsertSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: parsed.error.issues[0]?.message ?? "Invalid request payload.",
      });
    }

    try {
      const response = await upsertZapierContact(connectionKey, parsed.data);
      const contact = (response.result.contact ?? {}) as Record<string, unknown>;

      return res.json({
        success: true,
        contact: {
          id: typeof contact.id === "string" ? contact.id : "",
          locationId: response.locationId,
          firstName: typeof contact.firstName === "string" ? contact.firstName : parsed.data.firstName ?? "",
          lastName: typeof contact.lastName === "string" ? contact.lastName : parsed.data.lastName ?? "",
          email: typeof contact.email === "string" ? contact.email : parsed.data.email ?? "",
          phone: typeof contact.phone === "string" ? contact.phone : parsed.data.phone ?? "",
        },
        operation: "upserted",
        tagApplied: response.tagApplied,
      });
    } catch (error) {
      return sendZapierError(res, error);
    }
  });

  // Legacy endpoint retained for backwards compatibility with existing internal automations.
  app.post("/api/create-contact", async (req: Request, res: Response) => {
    try {
      if (!ENV.internalApiKey) {
        return res.status(500).json({ error: "INTERNAL_API_KEY is not configured" });
      }

      const apiKey = getHeaderValue(req, "x-api-key");
      if (apiKey !== ENV.internalApiKey) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const locationId = normalizeText(req.body?.locationId);
      if (!locationId) {
        return res.status(400).json({ error: "locationId is required" });
      }

      const installation = await getInstallation(locationId);
      if (!installation) {
        return res.status(404).json({ error: `No GHL token found for location ${locationId}` });
      }

      const result = await upsertContactWithTag(locationId, {
        firstName: normalizeText(req.body?.firstName),
        lastName: normalizeText(req.body?.lastName),
        name: normalizeText(req.body?.name),
        email: normalizeText(req.body?.email),
        phone: normalizeText(req.body?.phone),
        tags: ["trigger-royal-review"],
        source: "zapier",
      });

      return res.status(200).json({
        success: true,
        contactId: result.contact?.id,
        isNew: result.new,
        contact: result.contact,
      });
    } catch (error) {
      const status = error instanceof Error && /Unauthorized/i.test(error.message) ? 401 : 500;
      console.error("[Zapier] Contact creation failed:", error);
      return res.status(status).json({
        error: error instanceof Error ? error.message : "Internal server error",
      });
    }
  });
}