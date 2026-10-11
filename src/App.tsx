import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { t } from "@/lib/i18n";
import {
  createActionRunner, diagnosticsStatus, exportDiagnostics, loadSettings, login, openSkool, saveSettings,
  setDiagnosticsEnabled, type SettingsForm, type Status
} from "@/lib/settings";

// Settings page and toolbar popup (same UI; popup.html only fixes the width). See DESIGN.md.
const note = "mt-[11px] flex gap-2 text-xs leading-[1.45] text-muted-foreground [overflow-wrap:anywhere]";
const section = "mt-[18px] border-t border-border pt-3.5";
const summary = "flex list-none items-center gap-1.5 text-[13px] font-semibold [[open]>&]:mb-3 [&::-webkit-details-marker]:hidden";
const Chevron = () => <ChevronRight className="size-3.5 flex-none text-muted-foreground motion-safe:transition-transform [[open]>summary>&]:rotate-90" aria-hidden="true" />;
const toggle = "flex min-h-8 cursor-pointer items-center gap-2 text-xs";

function Note({ id, children }: { id?: string; children: ReactNode }) {
  return <p className={note} id={id}>{children}</p>;
}

export function App() {
  const [form, setForm] = useState<SettingsForm>({ usePersonalKey: false, typeSafeKey: "", activationCode: "", workerUrl: "" });
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [diagnosticsOn, setDiagnosticsOn] = useState(true);
  const [diagnostics, setDiagnostics] = useState<{ text: string; connected: boolean } | null>(null);
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());
  const run = useMemo(() => createActionRunner(setBusy, setStatus), []);
  const update = (changes: Partial<SettingsForm>) => setForm(current => ({ ...current, ...changes }));
  const refreshDiagnostics = () => diagnosticsStatus().then(setDiagnostics);
  const fail = (error: Error) => setStatus({ message: error.message, kind: "error" });
  const busyProps = (id: string) => ({ disabled: busy.has(id), "aria-busy": busy.has(id) || undefined });

  useEffect(() => {
    loadSettings().then(({ diagnosticsEnabled, ...values }) => {
      setForm(values);
      setAdvancedOpen(values.usePersonalKey);
      setDiagnosticsOn(diagnosticsEnabled);
    }).catch(fail);
    refreshDiagnostics();
  }, []);

  return (
    <main className="p-5 min-[600px]:p-[26px]">
      <header className="flex items-center gap-[11px]">
        <span className="grid size-[38px] flex-none place-items-center rounded-xl brand-mark text-xl font-semibold" aria-hidden="true">S</span>
        <div className="min-w-0 flex-1 [overflow-wrap:anywhere]">
          <h1 className="m-0 text-[17px] leading-tight font-semibold tracking-[-.02em]">{t("productName")}</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">{t("popupSubtitle")}</p>
        </div>
        <span className="flex-none rounded-full border border-border bg-raised px-[7px] py-1 text-[11px] whitespace-nowrap text-muted-foreground">{t("textOnly")}</span>
      </header>
      <p className="mt-[15px] mb-[19px] text-[13px] text-muted-foreground">{t("optionsIntro")}</p>

      <section id="subscriptionFields" aria-labelledby="hostedHeading" hidden={form.usePersonalKey}>
        <h2 className="mb-2 text-[13px] font-semibold" id="hostedHeading">{t("hostedTitle")}</h2>
        <Note>{t("hostedHelp")}</Note>
        <div className="mt-3.5 grid gap-2">
          <Button type="button" {...busyProps("login")} onClick={() => run("login", login)}>{t("memberLogin")}</Button>
          <Button type="button" variant="secondary" {...busyProps("subscribe")} onClick={() => run("subscribe", () => openSkool())}>{t("skoolSubscription")}</Button>
        </div>
        <Note>{t("subscriptionNote")}</Note>
        <details className={section}>
          <summary className={summary}><Chevron />{t("internalTesting")}</summary>
          <Label htmlFor="activationCode">{t("activationCode")}</Label>
          <Input id="activationCode" type="password" autoComplete="off" spellCheck={false} aria-describedby="testAccessNote"
            value={form.activationCode} onChange={event => update({ activationCode: event.target.value })} />
          <Note id="testAccessNote">{t("testAccessNote")}</Note>
        </details>
      </section>

      <details className={section} id="advanced" open={advancedOpen} onToggle={event => setAdvancedOpen(event.currentTarget.open)}>
        <summary className={summary}><Chevron />{t("advancedSettings")}</summary>
        <label className={toggle}>
          <input id="usePersonalKey" type="checkbox" className="size-4 flex-none" checked={form.usePersonalKey}
            onChange={event => { update({ usePersonalKey: event.target.checked }); setStatus(null); }} />
          <span>{t("usePersonalKey")}</span>
        </label>
        <section className="mt-[17px]" id="personalFields" hidden={!form.usePersonalKey}>
          <Label htmlFor="typeSafeKey">TypeSafe API key</Label>
          <Input id="typeSafeKey" type="password" autoComplete="off" spellCheck={false} placeholder="TypeSafe API key" aria-describedby="personalNote"
            value={form.typeSafeKey} onChange={event => update({ typeSafeKey: event.target.value })} />
          <Note id="personalNote">
            <span className="grid size-4 flex-none place-items-center rounded-full border border-border text-[11px] font-semibold" aria-hidden="true">i</span>
            <span>{t("personalNote")}</span>
          </Note>
        </section>
      </details>

      <Note id="consentNote">{t("consentNote")}</Note>
      <footer className="mt-[19px] border-t border-border pt-4">
        <Button type="button" className="w-full" id="save" {...busyProps("save")}
          onClick={() => run("save", async () => { await saveSettings(form); setStatus({ message: t("saved"), kind: "success" }); })}>
          {t("save")}
        </Button>
        {/* Always mounted so screen readers already watch the live region when text arrives. */}
        <Alert id="status" role="status" aria-atomic="true" hidden={!status} variant={status?.kind} className="mt-[11px]">{status?.message}</Alert>
      </footer>

      <details className="mt-5 border-t border-border pt-4">
        <summary className={summary} id="diagnosticsHeading"><Chevron />{t("diagnosticsTitle")}</summary>
        <label className={toggle}>
          <input id="diagnosticsEnabled" type="checkbox" className="size-4 flex-none" aria-describedby="diagnosticsNote" checked={diagnosticsOn}
            onChange={event => {
              const enabled = event.target.checked;
              setDiagnosticsOn(enabled);
              setDiagnosticsEnabled(enabled).then(refreshDiagnostics).catch(fail);
            }} />
          <span>{t("diagnosticsEnabled")}</span>
        </label>
        <Note id="diagnosticsNote">{t("diagnosticsNote")}</Note>
        {diagnostics && (
          <p className={`${note} mt-3 mb-2 items-baseline`} id="diagnosticsStatus" role="status" data-connected={diagnostics.connected}>
            <span className={`size-[7px] flex-none rounded-full ${diagnostics.connected ? "bg-(--green-11)" : "bg-(--amber-11)"}`} aria-hidden="true" />
            {diagnostics.text}
          </p>
        )}
        <Button type="button" variant="secondary" size="sm" id="exportDiagnostics" {...busyProps("export")}
          onClick={() => run("export", exportDiagnostics)}>{t("exportDiagnostics")}</Button>
      </details>
    </main>
  );
}
