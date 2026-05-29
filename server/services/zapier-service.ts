import { and, desc, eq } from "drizzle-orm";
import { createHmac, randomBytes } from "crypto";
import { getDb } from "../db.js";
import { ENV } from "../_core/env.js";
import { ghlInstallations, zapierConnections } from "../../drizzle/schema.js";
import { getValidAccessToken, upsertContactWithTag } from "../ghl-service.js";

const INTERNAL_TRIGGER_TAG = "trigger-royal-review";

type ZapierContactPayload = {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  source?: string;
  tags?: string[];
  customFields?: Array<{ key: string; value?: unknown }>;
};

export class ZapierHttpError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = "ZapierHttpError";
    this.statusCode = statusCode;
  }
}

function requireDb() {
  return getDb().then((db) => {
    if (!db) {
      throw new ZapierHttpError(500, "Database is not available.");
    }
    return db;
  });
}

function normalizeText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeEmail(email?: string): string | undefined {
  const value = normalizeText(email);
  return value ? value.toLowerCase() : undefined;
}

function normalizePhone(phone?: string): string | undefined {
  const value = normalizeText(phone);
  if (!value) return undefined;
  return value.replace(/[\s\-()]/g, "");
}

export function generateZapierConnectionKey(): string {
  const prefix = ENV.zapierKeyPrefix || "zap_live_";
  const token = randomBytes(24).toString("base64url");
  return `${prefix}${token}`;
}

export function hashZapierConnectionKey(rawKey: string): string {
  const secret = ENV.cookieSecret || "zapier-default-secret";
  return createHmac("sha256", secret).update(rawKey).digest("hex");
}

function makePreview(rawKey: string): string {
  const suffix = rawKey.slice(-4);
  return `...${suffix}`;
}

export async function getLocationName(locationId: string): Promise<string> {
  const db = await requireDb();
  const rows = await db
    .select({ locationId: ghlInstallations.locationId })
    .from(ghlInstallations)
    .where(eq(ghlInstallations.locationId, locationId))
    .limit(1);

  if (!rows.length) return locationId;
  return locationId;
}

export async function createOrGetZapierConnection(locationId: string): Promise<{
  locationId: string;
  created: boolean;
  connectionKey: string | null;
  connectionKeyPreview: string;
  createdAt: Date;
  lastUsedAt: Date | null;
}> {
  const db = await requireDb();

  // Use a transaction to avoid races where multiple active keys might be created
  const result = await db.transaction(async (tx) => {
    const existing = await tx
      .select()
      .from(zapierConnections)
      .where(and(eq(zapierConnections.locationId, locationId), eq(zapierConnections.active, true)))
      .orderBy(desc(zapierConnections.createdAt))
      .limit(1);

    if (existing.length > 0) {
      const row = existing[0];
      return {
        locationId,
        created: false,
        connectionKey: row.connectionKeyRaw || null, // Return stored raw key if available
        connectionKeyPreview: row.connectionKeyPreview,
        createdAt: row.createdAt,
        lastUsedAt: row.lastUsedAt ?? null,
      };
    }

    const rawKey = generateZapierConnectionKey();
    const hash = hashZapierConnectionKey(rawKey);
    const preview = makePreview(rawKey);
    const now = new Date();

    await tx.insert(zapierConnections).values({
      locationId,
      connectionKeyHash: hash,
      connectionKeyPreview: preview,
      connectionKeyRaw: rawKey,
      active: true,
      createdAt: now,
    });

    console.info("[Zapier] connection key generated", { locationId });

    return {
      locationId,
      created: true,
      connectionKey: rawKey,
      connectionKeyPreview: preview,
      createdAt: now,
      lastUsedAt: null,
    };
  });

  return result;
}

export async function rotateZapierConnection(locationId: string): Promise<{
  locationId: string;
  connectionKey: string;
  connectionKeyPreview: string;
}> {
  const db = await requireDb();
  const now = new Date();

  // Perform rotate inside a transaction to ensure only one active key exists per location
  const result = await db.transaction(async (tx) => {
    await tx
      .update(zapierConnections)
      .set({ active: false, rotatedAt: now })
      .where(and(eq(zapierConnections.locationId, locationId), eq(zapierConnections.active, true)));

    const rawKey = generateZapierConnectionKey();
    const hash = hashZapierConnectionKey(rawKey);
    const preview = makePreview(rawKey);

    await tx.insert(zapierConnections).values({
      locationId,
      connectionKeyHash: hash,
      connectionKeyPreview: preview,
      connectionKeyRaw: rawKey,
      active: true,
      createdAt: now,
    });

    console.info("[Zapier] connection key rotated", { locationId });

    return {
      locationId,
      connectionKey: rawKey,
      connectionKeyPreview: preview,
    };
  });

  return result;
}

export async function revokeZapierConnection(locationId: string): Promise<void> {
  const db = await requireDb();
  const now = new Date();

  await db
    .update(zapierConnections)
    .set({ active: false, revokedAt: now })
    .where(and(eq(zapierConnections.locationId, locationId), eq(zapierConnections.active, true)));

  console.info("[Zapier] connection key revoked", { locationId });
}

export async function validateZapierConnectionKey(rawKey: string): Promise<{
  connectionId: number;
  locationId: string;
  locationName: string;
  companyId: string | null;
}> {
  const db = await requireDb();
  const hash = hashZapierConnectionKey(rawKey);

  const rows = await db
    .select()
    .from(zapierConnections)
    .where(and(eq(zapierConnections.connectionKeyHash, hash), eq(zapierConnections.active, true)))
    .limit(1);

  if (!rows.length) {
    throw new ZapierHttpError(401, "Invalid or revoked Zapier connection key.");
  }

  const conn = rows[0];

  const installation = await db
    .select()
    .from(ghlInstallations)
    .where(eq(ghlInstallations.locationId, conn.locationId))
    .limit(1);

  if (!installation.length) {
    throw new ZapierHttpError(403, "The GHL app is not installed or active for this location.");
  }

  try {
    await getValidAccessToken(conn.locationId);
  } catch {
    throw new ZapierHttpError(401, "GHL connection expired. Please reinstall or reconnect the app.");
  }

  await db
    .update(zapierConnections)
    .set({ lastUsedAt: new Date() })
    .where(eq(zapierConnections.id, conn.id));

  const locationName = await getLocationName(conn.locationId);

  return {
    connectionId: conn.id,
    locationId: conn.locationId,
    locationName,
    companyId: installation[0].companyId ?? null,
  };
}

export async function upsertZapierContact(rawKey: string, payload: ZapierContactPayload) {
  const resolved = await validateZapierConnectionKey(rawKey);

  const email = normalizeEmail(payload.email);
  const phone = normalizePhone(payload.phone);
  if (!email && !phone) {
    throw new ZapierHttpError(400, "At least one of email or phone is required.");
  }

  const tags = new Set<string>([INTERNAL_TRIGGER_TAG]);
  (payload.tags ?? []).forEach((tag) => {
    const normalizedTag = normalizeText(tag);
    if (normalizedTag) tags.add(normalizedTag);
  });

  const source = normalizeText(payload.source) ?? "Zapier";

  try {
    // Intentionally reuses the existing GHL upsert + token refresh path.
    const result = await upsertContactWithTag(resolved.locationId, {
      firstName: normalizeText(payload.firstName),
      lastName: normalizeText(payload.lastName),
      email,
      phone,
      source,
      tags: Array.from(tags),
    });

    console.info("[Zapier] contact upserted", {
      locationId: resolved.locationId,
      contactId: result.contact?.id,
    });

    return {
      locationId: resolved.locationId,
      locationName: resolved.locationName,
      result,
      tagApplied: true,
    };
  } catch (error) {
    throw normalizeZapierError(error);
  }
}

export function normalizeZapierError(error: unknown): ZapierHttpError {
  if (error instanceof ZapierHttpError) return error;

  const message = error instanceof Error ? error.message : "Unexpected error.";
  if (/at least one of email or phone/i.test(message)) {
    return new ZapierHttpError(400, "At least one of email or phone is required.");
  }
  if (/unauthorized|forbidden|token/i.test(message)) {
    return new ZapierHttpError(401, "GHL connection expired. Please reinstall or reconnect the app.");
  }

  return new ZapierHttpError(500, "Unable to process Zapier request right now.");
}
