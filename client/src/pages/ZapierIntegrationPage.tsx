import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Copy, ExternalLink, Link2, RefreshCw, ShieldCheck, Zap } from "lucide-react";
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
  const [copiedLocation, setCopiedLocation] = useState(false);
  const [zapCreateUrl, setZapCreateUrl] = useState("");
  const [connection, setConnection] = useState<ZapierConnectionResponse | null>(null);
  const [visibleConnectionKey, setVisibleConnectionKey] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [isRotating, setIsRotating] = useState(false);
  const [isRevoking, setIsRevoking] = useState(false);

  useEffect(() => {
    if (locationId) {
      window.localStorage.setItem(LOCATION_STORAGE_KEY, locationId);
      setZapCreateUrl(buildZapCreateUrl(locationId));
    }
  }, [locationId]);

  const loadConnection = async () => {
    if (!locationId) return;
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

  const handleCopyLocationId = async () => {
    if (!locationId) return;

    try {
      await navigator.clipboard.writeText(locationId);
      setCopiedLocation(true);
      toast.success("Location ID copied.");
      window.setTimeout(() => setCopiedLocation(false), 1800);
    } catch {
      toast.error("Unable to copy Location ID.");
    }
  };

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
    }
  };

  const handleRevoke = async () => {
    if (!locationId) return;

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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 text-slate-900">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl items-center px-4 py-10 sm:px-6 lg:px-8">
        <div className="grid w-full gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <section className="space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 shadow-sm">
              <Zap className="h-3.5 w-3.5 text-amber-500" />
              Home Flow Zapier Integration
            </div>

            <div className="space-y-3">
              <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
                Connect your GHL location to Zapier.
              </h1>
              <p className="max-w-2xl text-base leading-7 text-slate-600">
                Generate a per-location Zapier connection key, connect your private Zapier app, and route contact upserts through this backend using your existing GHL OAuth installation.
              </p>
              {connection?.locationName ? (
                <p className="text-sm text-slate-500">
                  Location: <span className="font-medium text-slate-700">{connection.locationName}</span>
                </p>
              ) : null}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Card className="border-slate-200 bg-white/90 shadow-sm">
                <CardHeader className="space-y-2 pb-3">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Link2 className="h-4 w-4 text-blue-600" />
                    Your Location ID
                  </CardTitle>
                  <CardDescription>Use this ID inside the Zapier action configuration.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Input readOnly value={locationId || "Missing locationId"} className="font-mono text-sm" />
                  <Button type="button" variant="outline" onClick={handleCopyLocationId} className="w-full gap-2" disabled={!locationId}>
                    {copiedLocation ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    {copiedLocation ? "Copied" : "Copy Location ID"}
                  </Button>
                </CardContent>
              </Card>

              <Card className="border-slate-200 bg-white/90 shadow-sm">
                <CardHeader className="space-y-2 pb-3">
                  <CardTitle className="text-lg">Zapier Connection</CardTitle>
                  <CardDescription>Per-location backend key. Zapier never receives your GHL OAuth tokens.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <Badge variant={connection?.zapierEnabled ? "default" : "outline"}>
                      {connection?.zapierEnabled ? "Enabled" : "Disabled"}
                    </Badge>
                    <Badge variant="secondary">Private app invite</Badge>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-medium text-slate-600">Connection Key</label>
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
                    <Button type="button" variant="destructive" className="gap-2" onClick={handleRevoke} disabled={isRevoking || !locationId}>
                      <AlertTriangle className="h-4 w-4" />
                      {isRevoking ? "Revoking..." : "Revoke Access"}
                    </Button>
                  </div>

                  <p className="text-xs text-slate-500">
                    Existing Zaps stop working immediately after key rotation or revoke.
                  </p>
                </CardContent>
              </Card>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Button type="button" onClick={handleIntegrate} className="gap-2 bg-slate-900 text-white hover:bg-slate-800" disabled={!locationId}>
                <ExternalLink className="h-4 w-4" />
                Integrate with Zapier
              </Button>
              <Button type="button" variant="outline" onClick={handleCreateZap} className="gap-2" disabled={!locationId || !zapCreateUrl}>
                <Zap className="h-4 w-4" />
                Create Your Zap
              </Button>
              <Button type="button" variant="outline" className="gap-2" disabled={isLoading || !locationId} onClick={() => void loadConnection()}>
                <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>

            <p className="text-sm text-slate-500">
              The invite button opens Zapier in a new tab. Use the generated connection key when Zapier asks to connect your account.
            </p>
          </section>

          <Card className="border-slate-200 bg-slate-950 text-slate-50 shadow-xl">
            <CardHeader className="space-y-2 pb-4">
              <CardTitle className="text-xl text-white">How it works</CardTitle>
              <CardDescription className="text-slate-300">A simple 3-step flow for clients inside GHL.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm leading-6 text-slate-300">
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <p className="font-medium text-white">1. Accept the private app invite</p>
                <p>Zapier grants access to your private app without any public listing requirements.</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <p className="font-medium text-white">2. Generate and copy your connection key</p>
                <p>Use this key when Zapier asks for account credentials for this private app.</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <p className="font-medium text-white">3. Use Create/Update Contact action</p>
                <p>Zapier calls this backend, which resolves location from the key and upserts contacts through stored GHL OAuth tokens.</p>
              </div>
              <div className="rounded-xl border border-amber-400/20 bg-amber-400/10 p-4 text-amber-100">
                <p className="font-medium text-white">Location ID already saved</p>
                <p>{locationId || "Add ?locationId=... to this page URL inside GHL to enable the integration flow."}</p>
              </div>
              <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-emerald-100">
                <p className="font-medium text-white flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> Security Model</p>
                <p>Zapier authenticates only with your generated connection key. GHL tokens stay server-side.</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
