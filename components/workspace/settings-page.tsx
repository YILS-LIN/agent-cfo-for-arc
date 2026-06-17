"use client";

import { useState } from "react";
import { Bell, Database, KeyRound, Save, ShieldCheck, Webhook } from "lucide-react";

import { AppShell } from "@/components/dashboard/app-shell";
import { SectionCard, inputClassName } from "@/components/dashboard/page-ui";
import { Button } from "@/components/ui/button";
import type { AgentSpendSummary } from "@/types/agent";

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
  const [saved, setSaved] = useState("Settings are synchronized with this browser.");
  const [notifications, setNotifications] = useState({
    highRisk: true,
    budget: true,
    task: false,
    daily: true,
  });
  const [security, setSecurity] = useState({ signatures: true, allowlist: true, testnet: false });
  const [webhook, setWebhook] = useState("https://agent.example.com/hooks/cfo");
  const [apiKeyVisible, setApiKeyVisible] = useState(false);

  function save() {
    localStorage.setItem(
      "agent-cfo-settings",
      JSON.stringify({ notifications, security, webhook }),
    );
    setSaved(
      `Saved at ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.`,
    );
  }

  function exportData() {
    const payload = JSON.stringify(
      { profile: summary.profile, notifications, security, webhook },
      null,
      2,
    );
    const url = URL.createObjectURL(new Blob([payload], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "agent-cfo-settings.json";
    link.click();
    URL.revokeObjectURL(url);
    setSaved("Settings export downloaded.");
  }

  function resetDemoData() {
    localStorage.removeItem("agent-cfo-settings");
    setNotifications({ highRisk: true, budget: true, task: false, daily: true });
    setSecurity({ signatures: true, allowlist: true, testnet: false });
    setWebhook("https://agent.example.com/hooks/cfo");
    setSaved("Demo settings restored to defaults.");
  }

  return (
    <AppShell
      title="Settings"
      description="Configure alerts, security, integrations, and data controls"
      owner={summary.profile.owner}
      actions={
        <Button onClick={save}>
          <Save className="size-4" /> Save changes
        </Button>
      }
    >
      <p className="rounded-lg border border-green/20 bg-green/5 px-4 py-3 text-sm font-medium text-green">
        {saved}
      </p>
      <div className="grid gap-4 xl:grid-cols-2">
        <SectionCard
          title="Notifications"
          description="Choose which events should interrupt the operator."
          action={<Bell className="size-5 text-blue" />}
        >
          <Toggle
            checked={notifications.highRisk}
            onChange={(value) => setNotifications((current) => ({ ...current, highRisk: value }))}
            label="High-risk anomalies"
            detail="Immediate alert when a critical rule fires."
          />
          <Toggle
            checked={notifications.budget}
            onChange={(value) => setNotifications((current) => ({ ...current, budget: value }))}
            label="Budget thresholds"
            detail="Notify at 80% and 100% utilization."
          />
          <Toggle
            checked={notifications.task}
            onChange={(value) => setNotifications((current) => ({ ...current, task: value }))}
            label="Task completion"
            detail="Send a summary after every autonomous task."
          />
          <Toggle
            checked={notifications.daily}
            onChange={(value) => setNotifications((current) => ({ ...current, daily: value }))}
            label="Daily CFO digest"
            detail="Aggregate spend, risks, and recommended actions."
          />
        </SectionCard>
        <SectionCard
          title="Payment security"
          description="Controls applied before x402 authorization."
          action={<ShieldCheck className="size-5 text-green" />}
        >
          <Toggle
            checked={security.signatures}
            onChange={(value) => setSecurity((current) => ({ ...current, signatures: value }))}
            label="Verify Arc signatures"
            detail="Reject unverified settlement events."
          />
          <Toggle
            checked={security.allowlist}
            onChange={(value) => setSecurity((current) => ({ ...current, allowlist: value }))}
            label="Provider allowlist"
            detail="Require explicit provider approval."
          />
          <Toggle
            checked={security.testnet}
            onChange={(value) => setSecurity((current) => ({ ...current, testnet: value }))}
            label="Accept testnet telemetry"
            detail="Include Arc Testnet in dashboard totals."
          />
        </SectionCard>
        <SectionCard
          title="Webhook integration"
          description="Receive signed CFO events in your agent runtime."
          action={<Webhook className="size-5 text-violet" />}
        >
          <label className="block text-xs font-semibold text-muted">
            Endpoint URL
            <input
              className={`${inputClassName} mt-2 w-full`}
              value={webhook}
              onChange={(event) => setWebhook(event.target.value)}
            />
          </label>
          <label className="mt-4 block text-xs font-semibold text-muted">
            Signing secret
            <div className="mt-2 flex gap-2">
              <input
                className={`${inputClassName} min-w-0 flex-1 font-mono`}
                readOnly
                value={apiKeyVisible ? "whsec_arc_9f2b3c72a86f" : "••••••••••••••••••••"}
              />
              <Button variant="ghost" onClick={() => setApiKeyVisible((value) => !value)}>
                <KeyRound className="size-4" /> {apiKeyVisible ? "Hide" : "Reveal"}
              </Button>
            </div>
          </label>
          <Button
            className="mt-4"
            variant="soft"
            onClick={() => setSaved("Test event delivered successfully.")}
          >
            Send test event
          </Button>
        </SectionCard>
        <SectionCard
          title="Data retention"
          description="Local demo controls mirror the production policy surface."
          action={<Database className="size-5 text-orange" />}
        >
          <label className="block text-xs font-semibold text-muted">
            Retain payment events
            <select className={`${inputClassName} mt-2 w-full`} defaultValue="90">
              <option value="30">30 days</option>
              <option value="90">90 days</option>
              <option value="365">1 year</option>
            </select>
          </label>
          <label className="mt-4 block text-xs font-semibold text-muted">
            Report timezone
            <select className={`${inputClassName} mt-2 w-full`} defaultValue="Asia/Shanghai">
              <option>Asia/Shanghai</option>
              <option>UTC</option>
              <option>America/Los_Angeles</option>
            </select>
          </label>
          <div className="mt-4 flex gap-2">
            <Button variant="ghost" onClick={exportData}>
              Export data
            </Button>
            <Button variant="ghost" onClick={resetDemoData}>
              Reset demo data
            </Button>
          </div>
        </SectionCard>
      </div>
    </AppShell>
  );
}
