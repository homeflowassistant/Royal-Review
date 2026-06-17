import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Copy, ExternalLink, RefreshCw, ShieldCheck, Zap } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const DEFAULT_INVITE_URL = "https://zapier.com/developer/public-invite/240507/da63c72aee602b7838b5e5b8d6d72396/";
const LOCATION_STORAGE_KEY = "royal-review:last-zapier-location-id";

type ZapierConnectionResponse = {
  success: boolean;
  locationId: string;
  locationName: string;
  zapierEnabled: boolean;
  connectionKey: string | null;
  connectionKeyPreview: string;
  zapierInviteUrl: string;
  createdAt: string;
  lastUsedAt: string | null;
  message?: string;
};

async function readResponseBody(response: Response): Promise<{ json?: unknown; text: string }> {
  const text = await response.text();

  if (!text) {
    return { text: "" };
  }

  try {
    return { json: JSON.parse(text) as unknown, text };
  } catch {
    return { text };
  }
}

function getZapierCliName(): string {
  return import.meta.env.VITE_ZAPIER_APP_CLI_NAME || "";
}

function getInviteUrl(): string {
  return import.meta.env.VITE_ZAPIER_INVITE_URL || DEFAULT_INVITE_URL;
}

function buildZapCreateUrl(locationId: string): string {
  const cliName = getZapierCliName().trim();
  if (!cliName) return "";

  const url = new URL(`https://api.zapier.com/v1/embed/${encodeURIComponent(cliName)}/create`);
  url.searchParams.set("steps[0][app]", "WebhookAPI");
  url.searchParams.set("steps[0][action]", "hook");
  url.searchParams.set("steps[1][app]", cliName);
  url.searchParams.set("steps[1][action]", "upsert_contact");
  return url.toString();
}

function useLocationId() {
  return useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("locationId")?.trim() || "";
  }, []);
}

export default function ZapierIntegrationPage() {
  const locationId = useLocationId();
  const [copiedKey, setCopiedKey] = useState(false);
  const [zapCreateUrl, setZapCreateUrl] = useState("");
  const [connection, setConnection] = useState<ZapierConnectionResponse | null>(null);
  const [visibleConnectionKey, setVisibleConnectionKey] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [isRotating, setIsRotating] = useState(false);
  const [isRevoking, setIsRevoking] = useState(false);
  const [showRotateConfirm, setShowRotateConfirm] = useState(false);
  const [rotateConfirmed, setRotateConfirmed] = useState(false);

  useEffect(() => {
    if (locationId) {
      window.localStorage.setItem(LOCATION_STORAGE_KEY, locationId);
      setZapCreateUrl(buildZapCreateUrl(locationId));
    }
  }, [locationId]);

  const loadConnection = async () => {
    if (!locationId) {
      toast.error("Missing locationId in the page URL.");
      return;
    }
    setIsLoading(true);
    try {
      const response = await fetch(`/api/zapier/connection?locationId=${encodeURIComponent(locationId)}`, {
        method: "GET",
        credentials: "include",
      });
      const body = await readResponseBody(response);
      const data = (body.json ?? {}) as ZapierConnectionResponse & { message?: string };
      if (!response.ok || !data.success) {
        throw new Error(data.message || body.text || "Failed to load Zapier connection.");
      }
      setConnection(data);
      setVisibleConnectionKey(data.connectionKey || "");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load Zapier connection.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadConnection();
  }, [locationId]);

  const inviteUrl = useMemo(() => {
    const baseInvite = connection?.zapierInviteUrl || getInviteUrl();
    if (!zapCreateUrl) return baseInvite;
    return `${baseInvite}?next=${encodeURIComponent(zapCreateUrl)}`;
  }, [connection?.zapierInviteUrl, zapCreateUrl]);

  const handleCopyConnectionKey = async () => {
    if (!visibleConnectionKey) {
      toast.error("No raw connection key is available. Rotate the key to generate a new one.");
      return;
    }

    try {
      await navigator.clipboard.writeText(visibleConnectionKey);
      setCopiedKey(true);
      toast.success("Zapier connection key copied.");
      window.setTimeout(() => setCopiedKey(false), 1800);
    } catch {
      toast.error("Unable to copy Zapier connection key.");
    }
  };

  const handleIntegrate = () => {
    window.open(inviteUrl, "_blank", "noopener,noreferrer");
  };

  const handleCreateZap = () => {
    if (!zapCreateUrl) {
      toast.error("Set VITE_ZAPIER_APP_CLI_NAME before opening the Zap editor.");
      return;
    }

    window.open(zapCreateUrl, "_blank", "noopener,noreferrer");
  };

  const handleRotateKey = async () => {
    if (!locationId) {
      toast.error("Missing locationId in the page URL.");
      return;
    }
    // Show confirmation modal first
    setShowRotateConfirm(true);
  };

  const performRotateKey = async () => {
    if (!locationId) return;
    setIsRotating(true);
    try {
      const response = await fetch("/api/zapier/connection/rotate", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locationId }),
      });

      const body = await readResponseBody(response);
      const data = (body.json ?? {}) as {
        success: boolean;
        connectionKey?: string;
        connectionKeyPreview?: string;
        message?: string;
      };

      if (!response.ok || !data.success || !data.connectionKey) {
        throw new Error(data.message || body.text || "Failed to rotate Zapier key.");
      }

      setVisibleConnectionKey(data.connectionKey);
      setConnection((prev) =>
        prev
          ? {
              ...prev,
              connectionKey: data.connectionKey || null,
              connectionKeyPreview: data.connectionKeyPreview || prev.connectionKeyPreview,
              zapierEnabled: true,
            }
          : prev
      );

      toast.success(data.message || "Zapier key rotated successfully.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to rotate key.");
    } finally {
      setIsRotating(false);
      setShowRotateConfirm(false);
      setRotateConfirmed(false);
    }
  };

  const handleRevoke = async () => {
    if (!locationId) {
      toast.error("Missing locationId in the page URL.");
      return;
    }

    setIsRevoking(true);
    try {
      const response = await fetch("/api/zapier/connection/revoke", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locationId }),
      });
      const body = await readResponseBody(response);
      const data = (body.json ?? {}) as { success: boolean; message?: string; zapierEnabled?: boolean };
      if (!response.ok || !data.success) {
        throw new Error(data.message || body.text || "Failed to revoke Zapier access.");
      }

      setVisibleConnectionKey("");
      setConnection((prev) =>
        prev
          ? {
              ...prev,
              zapierEnabled: false,
              connectionKey: null,
            }
          : prev
      );

      toast.success(data.message || "Zapier access revoked.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to revoke Zapier access.");
    } finally {
      setIsRevoking(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur-sm">
        <div className="mx-auto flex h-14 w-full max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-primary" />
            <span className="text-sm font-medium">Zapier Integration</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
            {connection?.zapierEnabled ? "Connected" : "Not connected"}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="grid gap-8 lg:grid-cols-[1.08fr_0.92fr]">
          <section className="space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full border bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
              <Zap className="h-3.5 w-3.5 text-primary" />
              Royal Review Zapier Integration
            </div>

            <div className="space-y-3">
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                Connect your account to Zapier.
              </h1>
              <p className="max-w-2xl text-sm leading-7 text-muted-foreground sm:text-base">
                Generate a secure connection key, open the private Zapier app, and keep contact upserts flowing through your account connection.
              </p>
              {connection?.locationName ? (
                <p className="text-sm text-muted-foreground">
                  Location: <span className="font-medium text-foreground">{connection.locationName}</span>
                </p>
              ) : null}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Card className="border-border/60 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">Connection key</CardTitle>
                  <CardDescription>
                    Copy the raw key or rotate it only when you need a fresh credential.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground">Raw key</label>
                    <Input
                      readOnly
                      value={visibleConnectionKey || connection?.connectionKeyPreview || "No active key"}
                      className="font-mono text-xs"
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" className="gap-2" onClick={handleCopyConnectionKey}>
                      {copiedKey ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      {copiedKey ? "Copied" : "Copy Key"}
                    </Button>
                    <Button type="button" variant="outline" className="gap-2" onClick={handleRotateKey} disabled={isRotating || !locationId}>
                      <RefreshCw className={`h-4 w-4 ${isRotating ? "animate-spin" : ""}`} />
                      {isRotating ? "Rotating..." : "Rotate Key"}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    The key is stored securely in hashed form for validation, and the raw value is kept so you can copy it later.
                  </p>
                </CardContent>
              </Card>

              <Card className="border-border/60 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">Zapier access</CardTitle>
                  <CardDescription>
                    Open the invite flow or jump straight into the Zap builder.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <Badge variant={connection?.zapierEnabled ? "default" : "outline"}>
                      {connection?.zapierEnabled ? "Enabled" : "Disabled"}
                    </Badge>
                    <Badge variant="secondary">Private app invite</Badge>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button type="button" onClick={handleIntegrate} className="gap-2" disabled={!locationId}>
                      <ExternalLink className="h-4 w-4" />
                      Open Zapier Invite
                    </Button>
                    <Button type="button" variant="outline" onClick={handleCreateZap} className="gap-2" disabled={!locationId || !zapCreateUrl}>
                      <Zap className="h-4 w-4" />
                      Create Zap
                    </Button>
                    <Button type="button" variant="outline" className="gap-2" disabled={isLoading || !locationId} onClick={() => void loadConnection()}>
                      <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
                      Refresh
                    </Button>
                  </div>

                  <Button type="button" variant="destructive" className="gap-2" onClick={handleRevoke} disabled={isRevoking || !locationId}>
                    <AlertTriangle className="h-4 w-4" />
                    {isRevoking ? "Revoking..." : "Revoke Access"}
                  </Button>
                </CardContent>
              </Card>
            </div>
          </section>

          <Card className="border-border/60 shadow-sm">
            <CardHeader className="pb-4">
              <CardTitle className="text-xl">How it works</CardTitle>
              <CardDescription>Use this short flow to connect Zapier without exposing any account credentials.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm leading-6 text-muted-foreground">
              <div className="rounded-lg border bg-muted/40 p-4">
                <p className="font-medium text-foreground">1. Open the Zapier invite, accept the invitation, and then start creating the Zap.</p>
                <p>Use the private invite link to open the app inside Zapier.</p>
              </div>
              <div className="rounded-lg border bg-muted/40 p-4">
                <p className="font-medium text-foreground">2. In Zapier, select the Royal Review app in the Action step.</p>
                <p>Choose the app action you want to use for the Zap.</p>
              </div>
              <div className="rounded-lg border bg-muted/40 p-4">
                <p className="font-medium text-foreground">3. Connect your account by adding the connection key.</p>
                <p>Zapier uses this connection key to access your account.</p>
              </div>
              <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-4">
                <p className="flex items-center gap-2 font-medium text-foreground">
                  <ShieldCheck className="h-4 w-4 text-blue-600" />
                  Security model
                </p>
                <p>Account credentials stay server-side. The key is hashed for validation, while the raw key is retained for user copying.</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>

      {showRotateConfirm ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-lg">
            <h3 className="mb-2 text-lg font-semibold">Rotate Zapier Connection Key</h3>
            <p className="mb-4 text-sm text-slate-600">
              Rotating the connection key will immediately invalidate any existing Zaps that use the previous key. You will need to update any Zap that relied on the old key.
            </p>

            <div className="mb-4 flex items-start gap-3">
              <input
                id="rotate-confirm"
                type="checkbox"
                checked={rotateConfirmed}
                onChange={(e) => setRotateConfirmed(e.target.checked)}
                className="mt-1 h-4 w-4"
              />
              <label htmlFor="rotate-confirm" className="text-sm text-slate-700">
                I understand that rotating the key will invalidate existing Zaps and I want to proceed.
              </label>
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => { setShowRotateConfirm(false); setRotateConfirmed(false); }}>
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => void performRotateKey()}
                disabled={!rotateConfirmed || isRotating}
              >
                {isRotating ? "Rotating..." : "Confirm and Rotate"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
