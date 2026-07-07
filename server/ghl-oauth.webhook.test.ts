import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const { upsertInstallationMock } = vi.hoisted(() => ({
  upsertInstallationMock: vi.fn(),
}));

vi.mock("./ghl-service.js", () => ({
  exchangeCodeForTokens: vi.fn(),
  upsertInstallation: upsertInstallationMock,
  getInstallation: vi.fn(),
}));

import { processLocationInstall } from "./ghl-oauth.js";

const originalFetch = globalThis.fetch;

describe("processLocationInstall", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("exchanges the agency token for a location token and stores it by locationId", async () => {
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ access_token: "location_token", locationId: "loc_123" }),
    });

    await processLocationInstall("agency_token", "company_123", "loc_123");

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://services.leadconnectorhq.com/oauth/locationToken",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer agency_token",
          Version: "2021-07-28",
        }),
      })
    );

    expect(upsertInstallationMock).toHaveBeenCalledWith(
      expect.objectContaining({ access_token: "location_token" }),
      "loc_123"
    );
  });
});
