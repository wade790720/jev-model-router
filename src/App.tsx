import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ReportProblem } from "@/components/ReportProblem";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { t } from "@/lib/i18n";
import { createActionRunner, loadSettings, saveSettings, type SettingsForm, type Status } from "@/lib/settings";

// Settings page and toolbar popup (same UI; popup.html only fixes the width). See DESIGN.md.
// The member's own TypeSafe key is the only setting; Skool membership is checked by MembershipGate.
const note = "mt-[11px] flex gap-2 text-xs leading-[1.45] text-muted-foreground [overflow-wrap:anywhere]";

function Note({ id, children }: { id?: string; children: ReactNode }) {
  return <p className={note} id={id}>{children}</p>;
}

export function App() {
  const [form, setForm] = useState<SettingsForm>({ typeSafeKey: "" });
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());
  const run = useMemo(() => createActionRunner(setBusy, setStatus), []);

  useEffect(() => {
    loadSettings().then(setForm).catch((error: Error) => setStatus({ message: error.message, kind: "error" }));
  }, []);

  return (
    <main className="p-5 min-[600px]:p-[26px]">
      <header className="flex items-center gap-[11px]">
        {/* alt is empty: the product name sits right next to the icon. */}
        <img src="/icons/icon-48.png" alt="" className="size-8 flex-none rounded-md" />
        <div className="min-w-0 flex-1 [overflow-wrap:anywhere]">
          <h1 className="m-0 text-[17px] leading-tight font-semibold tracking-[-.02em]">{t("productName")}</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">{t("popupSubtitle")}</p>
        </div>
      </header>
      {/* What the tool does and where the text goes: always visible, never collapsed. */}
      <div className="mt-[15px] space-y-1.5 text-[13px] text-muted-foreground">
        <p className="whitespace-pre-line">{t("optionsIntro")}</p>
        <p id="consentNote">{t("consentNote")}</p>
      </div>

      {/* The own key, saving it and error reporting are rarely needed: collapsed below the divider. */}
      <details className="group mt-[18px] border-t border-border pt-3.5" id="advanced">
        <summary className="text-[13px] font-semibold group-open:mb-3">{t("advancedSettings")}</summary>
        <Label htmlFor="typeSafeKey">{t("usePersonalKey")}</Label>
        <Input id="typeSafeKey" type="password" autoComplete="off" spellCheck={false} placeholder="TypeSafe API key" aria-describedby="personalNote consentNote"
          value={form.typeSafeKey} onChange={event => setForm({ typeSafeKey: event.target.value })} />
        <Note id="personalNote">
          <span className="grid size-4 flex-none place-items-center rounded-full border border-border text-[11px] font-semibold" aria-hidden="true">i</span>
          <span>{t("personalNote")}</span>
        </Note>
        <Button type="button" className="mt-4 w-full" id="save" disabled={busy.has("save")} aria-busy={busy.has("save") || undefined}
          onClick={() => run("save", async () => { await saveSettings(form); setStatus({ message: t("saved"), kind: "success" }); })}>
          {t("save")}
        </Button>
        {/* Always mounted so screen readers already watch the live region when text arrives. */}
        <Alert id="status" role="status" aria-atomic="true" hidden={!status} variant={status?.kind} className="mt-[11px]">{status?.message}</Alert>
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
          <ReportProblem size="sm" />
        </div>
      </details>
    </main>
  );
}
