"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Bell,
  BrainCircuit,
  Database,
  KeyRound,
  Link2,
  Save,
  ShieldCheck,
  Trash2,
  Unlink,
  Wallet,
} from "lucide-react";

import { useWorkspaceSession } from "@/components/auth/workspace-session-provider";
import { AppShell } from "@/components/dashboard/app-shell";
import { SectionCard, inputClassName } from "@/components/dashboard/page-ui";
import { Button } from "@/components/ui/button";
import { getApiErrorMessage } from "@/lib/client/api";
import type { AgentSpendSummary } from "@/types/agent";

type SafeCredential = {
  id: string;
  provider: string;
  model: string;
  secretHint: string;
  status: "unverified" | "valid" | "invalid";
  version: number;
  lastVerifiedAt: string | null;
  lastErrorCode: string | null;
  updatedAt: string;
};

function Toggle({
  checked,
  onChange,
  label,
  detail,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  detail: string;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 border-b border-line py-3 last:border-0">
      <span>
        <span className="block text-sm font-semibold">{label}</span>
        <span className="mt-1 block text-xs text-muted">{detail}</span>
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="size-5 accent-blue"
      />
    </label>
  );
}

export function SettingsPage({ summary }: { summary: AgentSpendSummary }) {
  const { mode, authenticated, session, apiFetch, linkIdentity, unlinkIdentity } =
    useWorkspaceSession();
  const usingPersistentWorkspace = mode === "persistent" && authenticated;
  const canWrite = !usingPersistentWorkspace || (session !== null && session.role !== "viewer");
  const [message, setMessage] = useState("Demo preferences are stored in this browser only.");
  const [notifications, setNotifications] = useState({
    highRisk: true,
    budget: true,
    task: false,
    daily: true,
  });
  const [security, setSecurity] = useState({ signatures: true, allowlist: true, testnet: false });
  const [credential, setCredential] = useState<SafeCredential | null>(null);
  const [loadedWorkspaceId, setLoadedWorkspaceId] = useState<string | null>(null);
  const [secret, setSecret] = useState("");
  const [model, setModel] = useState("gpt-5.5");
  const [savingCredential, setSavingCredential] = useState(false);
  const [identityBusy, setIdentityBusy] = useState<string | null>(null);

  async function removeIdentity(identity: NonNullable<typeof session>["identities"][number]) {
    setIdentityBusy(identity.subject);
    try {
      await unlinkIdentity(identity);
      setMessage("Sign-in identity unlinked and the workspace session refreshed.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to unlink identity");
    } finally {
      setIdentityBusy(null);
    }
  }

  const loadCredential = useCallback(
    async (workspaceId: string, signal?: AbortSignal) => {
      const response = await apiFetch("/api/ai/credentials", { signal });
      if (!response.ok) {
        throw new Error(await getApiErrorMessage(response, "Unable to load AI credentials"));
      }
      const payload = (await response.json()) as { credentials: SafeCredential[] };
      signal?.throwIfAborted();
      const openAi = payload.credentials.find((item) => item.provider === "openai") ?? null;
      setCredential(openAi);
      if (openAi) setModel(openAi.model);
      setLoadedWorkspaceId(workspaceId);
      setMessage(
        openAi
          ? "The stored OpenAI key is encrypted and can only be replaced or removed."
          : "No OpenAI key is configured. Local deterministic reports remain available.",
      );
    },
    [apiFetch],
  );

  useEffect(() => {
    if (!usingPersistentWorkspace || !session) return;
    const controller = new AbortController();
    void Promise.resolve()
      .then(() => loadCredential(session.workspaceId, controller.signal))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setCredential(null);
        setLoadedWorkspaceId(session.workspaceId);
        setMessage(error instanceof Error ? error.message : "Unable to load AI credentials");
      });
    return () => controller.abort();
  }, [loadCredential, session, usingPersistentWorkspace]);

  function saveDemoPreferences() {
    localStorage.setItem("agent-cfo-settings", JSON.stringify({ notifications, security }));
    setMessage("Demo preferences saved in this browser.");
  }

  function exportDemoData() {
    const payload = JSON.stringify({ profile: summary.profile, notifications, security }, null, 2);
    const url = URL.createObjectURL(new Blob([payload], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "agent-cfo-demo-settings.json";
    link.click();
    URL.revokeObjectURL(url);
    setMessage("Demo settings export downloaded.");
  }

  async function storeCredential() {
    if (!session || !canWrite || secret.trim().length < 20) {
      setMessage("Enter a complete OpenAI API key before saving.");
      return;
    }
    setSavingCredential(true);
    try {
      const response = await apiFetch("/api/ai/credentials/openai", {
        method: "PUT",
        headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({ secret, model, expectedVersion: credential?.version ?? 0 }),
      });
      if (!response.ok) {
        setMessage(await getApiErrorMessage(response, "Unable to store OpenAI credential"));
        return;
      }
      setSecret("");
      await loadCredential(session.workspaceId);
      setMessage("OpenAI credential encrypted and stored. It will be verified on first use.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to store OpenAI credential");
    } finally {
      setSavingCredential(false);
    }
  }

  async function removeCredential() {
    if (!session || !credential || !canWrite) return;
    setSavingCredential(true);
    try {
      const response = await apiFetch(
        `/api/ai/credentials/openai?expectedVersion=${credential.version}`,
        { method: "DELETE", headers: { "Idempotency-Key": crypto.randomUUID() } },
      );
      if (!response.ok) {
        setMessage(await getApiErrorMessage(response, "Unable to remove OpenAI credential"));
        return;
      }
      setCredential(null);
      setSecret("");
      setModel("gpt-5.5");
      setMessage("OpenAI credential removed. Local deterministic reports remain available.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to remove OpenAI credential");
    } finally {
      setSavingCredential(false);
    }
  }

  return (
    <AppShell
      title="Settings"
      description={
        usingPersistentWorkspace
          ? "Manage encrypted workspace integrations and security boundaries"
          : "Explore local demo preferences and data controls"
      }
      owner={summary.profile.owner}
      actions={
        !usingPersistentWorkspace ? (
          <Button onClick={saveDemoPreferences}>
            <Save className="size-4" /> Save demo preferences
          </Button>
        ) : undefined
      }
    >
      <p className="rounded-lg border border-blue/20 bg-blue/5 px-4 py-3 text-sm font-medium text-blue">
        {message}
      </p>

      {usingPersistentWorkspace ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <SectionCard
            title="Sign-in identities"
            description="Link Google and Ethereum wallets to the same internal Agent CFO user."
            action={<Link2 className="size-5 text-blue" />}
          >
            <div className="grid gap-2">
              {session?.identities.map((identity) => (
                <div
                  key={`${identity.type}:${identity.subject}`}
                  className="flex items-center justify-between gap-3 rounded-lg border border-line bg-white p-3"
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold capitalize">{identity.type}</span>
                    <span className="block truncate text-xs text-muted">
                      {identity.address ?? identity.subject}
                    </span>
                  </span>
                  <Button
                    variant="ghost"
                    disabled={session.identities.length <= 1 || identityBusy !== null}
                    onClick={() => void removeIdentity(identity)}
                    aria-label={`Unlink ${identity.type} identity`}
                  >
                    <Unlink className="size-4" /> Unlink
                  </Button>
                </div>
              ))}
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  variant="ghost"
                  disabled={session?.identities.some((identity) => identity.type === "google")}
                  onClick={() => linkIdentity("google")}
                >
                  <Link2 className="size-4" /> Link Google
                </Button>
                <Button variant="ghost" onClick={() => linkIdentity("wallet")}>
                  <Wallet className="size-4" /> Link wallet
                </Button>
              </div>
              <p className="text-xs text-muted">
                At least one sign-in identity must remain linked. Monitored wallets are managed
                separately.
              </p>
            </div>
          </SectionCard>
          <SectionCard
            title="OpenAI reports"
            description="Bring your own key for structured CFO reports. The secret is encrypted at rest and never displayed again."
            action={<BrainCircuit className="size-5 text-violet" />}
          >
            {loadedWorkspaceId !== session?.workspaceId ? (
              <p className="text-sm text-muted">Loading workspace credential…</p>
            ) : (
              <>
                <div className="mb-4 rounded-lg border border-line bg-subtle p-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-semibold">OpenAI API key</span>
                    <span className="rounded-full bg-surface px-2 py-1 text-xs font-semibold uppercase text-muted">
                      {credential?.status ?? "not configured"}
                    </span>
                  </div>
                  <p className="mt-2 font-mono text-xs text-muted">
                    {credential?.secretHint ?? "No stored key"}
                  </p>
                  {credential?.lastVerifiedAt && (
                    <p className="mt-2 text-xs text-muted">
                      Last verified {new Date(credential.lastVerifiedAt).toLocaleString()}
                    </p>
                  )}
                </div>
                <label className="block text-xs font-semibold text-muted">
                  Model
                  <input
                    className={`${inputClassName} mt-2 w-full`}
                    value={model}
                    disabled={!canWrite || savingCredential}
                    onChange={(event) => setModel(event.target.value)}
                    autoComplete="off"
                  />
                </label>
                <label className="mt-4 block text-xs font-semibold text-muted">
                  {credential ? "Replacement API key" : "API key"}
                  <input
                    className={`${inputClassName} mt-2 w-full font-mono`}
                    type="password"
                    value={secret}
                    disabled={!canWrite || savingCredential}
                    onChange={(event) => setSecret(event.target.value)}
                    placeholder={credential ? "Enter a new key to rotate" : "sk-…"}
                    autoComplete="new-password"
                    spellCheck={false}
                  />
                </label>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    onClick={() => void storeCredential()}
                    disabled={!canWrite || savingCredential || secret.trim().length < 20}
                  >
                    <KeyRound className="size-4" /> {credential ? "Rotate key" : "Store key"}
                  </Button>
                  {credential && (
                    <Button
                      variant="ghost"
                      onClick={() => void removeCredential()}
                      disabled={!canWrite || savingCredential}
                    >
                      <Trash2 className="size-4" /> Remove
                    </Button>
                  )}
                </div>
                {!canWrite && (
                  <p className="mt-3 text-xs text-muted">Viewer access is read-only.</p>
                )}
              </>
            )}
          </SectionCard>
          <SectionCard
            title="Security boundaries"
            description="What this workspace can and cannot currently control."
            action={<ShieldCheck className="size-5 text-green" />}
          >
            <dl className="space-y-4 text-sm">
              <div>
                <dt className="font-semibold">Credential storage</dt>
                <dd className="mt-1 text-muted">
                  AES-256-GCM with workspace-bound authentication and key rotation support.
                </dd>
              </div>
              <div>
                <dt className="font-semibold">Report processing</dt>
                <dd className="mt-1 text-muted">
                  Only aggregated workspace facts are sent, with provider-side response storage
                  disabled.
                </dd>
              </div>
              <div>
                <dt className="font-semibold">Payment authority</dt>
                <dd className="mt-1 text-muted">
                  Provider reviews and reports do not authorize, sign, or block onchain payments.
                </dd>
              </div>
            </dl>
          </SectionCard>
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          <SectionCard
            title="Demo notifications"
            description="Browser-only preferences; no messages are sent."
            action={<Bell className="size-5 text-blue" />}
          >
            <Toggle
              checked={notifications.highRisk}
              onChange={(value) => setNotifications((current) => ({ ...current, highRisk: value }))}
              label="High-risk anomalies"
              detail="Preview an immediate-alert preference."
            />
            <Toggle
              checked={notifications.budget}
              onChange={(value) => setNotifications((current) => ({ ...current, budget: value }))}
              label="Budget thresholds"
              detail="Preview 80% and 100% thresholds."
            />
            <Toggle
              checked={notifications.task}
              onChange={(value) => setNotifications((current) => ({ ...current, task: value }))}
              label="Task completion"
              detail="Preview a task-summary preference."
            />
            <Toggle
              checked={notifications.daily}
              onChange={(value) => setNotifications((current) => ({ ...current, daily: value }))}
              label="Daily CFO digest"
              detail="Preview a daily digest preference."
            />
          </SectionCard>
          <SectionCard
            title="Demo security policy"
            description="Local simulation only; these switches do not control x402 or onchain authorization."
            action={<ShieldCheck className="size-5 text-green" />}
          >
            <Toggle
              checked={security.signatures}
              onChange={(value) => setSecurity((current) => ({ ...current, signatures: value }))}
              label="Verify Arc signatures"
              detail="Preview a signature-verification policy."
            />
            <Toggle
              checked={security.allowlist}
              onChange={(value) => setSecurity((current) => ({ ...current, allowlist: value }))}
              label="Provider allowlist"
              detail="Preview a provider-review policy."
            />
            <Toggle
              checked={security.testnet}
              onChange={(value) => setSecurity((current) => ({ ...current, testnet: value }))}
              label="Accept testnet telemetry"
              detail="Preview inclusion of Arc Testnet events."
            />
          </SectionCard>
          <SectionCard
            title="Demo data"
            description="Export or reset only the browser-local demo preferences."
            action={<Database className="size-5 text-orange" />}
          >
            <div className="flex flex-wrap gap-2">
              <Button variant="ghost" onClick={exportDemoData}>
                Export demo settings
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  localStorage.removeItem("agent-cfo-settings");
                  setNotifications({ highRisk: true, budget: true, task: false, daily: true });
                  setSecurity({ signatures: true, allowlist: true, testnet: false });
                  setMessage("Demo preferences restored to defaults.");
                }}
              >
                Reset demo preferences
              </Button>
            </div>
          </SectionCard>
        </div>
      )}
    </AppShell>
  );
}
