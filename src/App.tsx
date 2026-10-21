import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Check, ExternalLink } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ReportProblem } from "@/components/ReportProblem";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { t } from "@/lib/i18n";
import {
  CLUB_URL, createActionRunner, KEYS_URL, loadSettings, onSettingsChange, PRICING_URL, verifyAndSaveKey, type Settings, type Status
} from "@/lib/settings";

// Settings page and toolbar popup (same UI; popup.html only fixes the width). See DESIGN.md.
// Free with the user's own TypeSafe key. Until the key is saved and one suggestion has appeared,
// the page is a three-step onboarding (same Step style as brand-digest-extension's Welcome).
const note = "mt-[11px] flex gap-2 text-xs leading-[1.45] text-muted-foreground [overflow-wrap:anywhere]";
type StepState = "done" | "now" | "later";
const stepState = (done: boolean, ready: boolean): StepState => (done ? "done" : ready ? "now" : "later");

/** One onboarding step: a check when done, expanded while current, faded until reached. */
function Step({ n, title, state, children }: { n: number; title: string; state: StepState; children?: ReactNode }) {
  return (
    <li className={`flex gap-3 ${state === "later" ? "opacity-50" : ""}`} aria-current={state === "now" ? "step" : undefined}>
      <span className={`flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
        state === "done" ? "bg-primary text-primary-foreground" : "border-2 border-primary text-primary-text"}`}>
        {state === "done" ? <Check className="size-4" aria-label="✓" /> : n}
      </span>
      <div className="min-w-0 flex-1 space-y-2 pt-0.5">
        <p className="text-[13px] font-semibold">{title}</p>
        {state === "now" && children}
      </div>
    </li>
  );
}

/** Key field with "Verify and save": a test request to TypeSafe runs before the key is stored. */
function KeyForm({ initial }: { initial: string }) {
  const [key, setKey] = useState(initial);
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());
  const run = useMemo(() => createActionRunner(setBusy, setStatus), []);
  const save = () => run("save", async () => { await verifyAndSaveKey(key); setStatus({ message: t("saved"), kind: "success" }); });
  return (
    <div>
      <Label htmlFor="typeSafeKey">{t("keyLabel")}</Label>
      <Input id="typeSafeKey" type="password" autoComplete="off" spellCheck={false} placeholder="TypeSafe API key"
        aria-describedby="keyNote consentNote" value={key} onChange={event => setKey(event.target.value)}
        onKeyDown={event => { if (event.key === "Enter") save(); }} />
      <p className={note} id="keyNote">{t("keyNote")}</p>
      <Button type="button" className="mt-3 w-full" id="save" disabled={busy.has("save")} aria-busy={busy.has("save") || undefined} onClick={save}>
        {t("verifySave")}
      </Button>
      {/* Always mounted so screen readers already watch the live region when text arrives. */}
      <Alert id="status" role="status" aria-atomic="true" hidden={!status} variant={status?.kind} className="mt-[11px]">{status?.message}</Alert>
    </div>
  );
}

function ExternalButton({ href, children, variant = "outline" }: { href: string; children: ReactNode; variant?: "outline" | "ghost" }) {
  return (
    <Button variant={variant} size="sm" asChild>
      <a href={href} target="_blank" rel="noreferrer">{children} <ExternalLink /></a>
    </Button>
  );
}

// `initial` lets tests render a given state; the extension reads it from storage.
export function App({ initial }: { initial?: Settings }) {
  const [settings, setSettings] = useState<Settings | undefined>(initial);

  useEffect(() => {
    const load = () => loadSettings().then(setSettings).catch(() => setSettings({ typeSafeKey: "", tried: false }));
    load();
    return onSettingsChange(load);
  }, []);

  const hasKey = Boolean(settings?.typeSafeKey);
  const onboarding = settings && !(hasKey && settings.tried);
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

      {onboarding && (
        <section className="mt-[18px] border-t border-border pt-4" id="onboarding" aria-labelledby="welcomeTitle">
          <h2 className="text-[13px] font-semibold" id="welcomeTitle">{t("welcomeTitle")}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{t("welcomeLead")}</p>
          <ol className="mt-4 space-y-5">
            <Step n={1} title={t("s1Title")} state={stepState(hasKey, true)}>
              <p className="text-xs text-muted-foreground">
                {t("s1Open")}{" "}
                <a className="inline-flex items-center gap-1 text-primary-text underline underline-offset-4" href={KEYS_URL} target="_blank" rel="noreferrer">
                  console.typesafe.ai/keys <ExternalLink className="size-3" aria-hidden="true" />
                </a>
              </p>
              <p className="text-xs text-muted-foreground">{t("s1Create")}</p>
              <p className="text-xs text-muted-foreground" id="pricing">
                {t("s1Pricing")}{" "}
                <a className="inline-flex items-center gap-1 text-primary-text underline underline-offset-4" href={PRICING_URL} target="_blank" rel="noreferrer">
                  typesafe.ai <ExternalLink className="size-3" aria-hidden="true" />
                </a>
              </p>
            </Step>
            <Step n={2} title={t("s2Title")} state={stepState(hasKey, true)}>
              <KeyForm initial="" />
            </Step>
            <Step n={3} title={t("s3Title")} state={stepState(settings.tried, hasKey)}>
              <p className="text-xs text-muted-foreground">{t("s3Desc")}</p>
              <ExternalButton href="https://chatgpt.com/">{t("s3Open")}</ExternalButton>
            </Step>
          </ol>
        </section>
      )}

      {/* Rarely needed after onboarding: the key (to change it) and error reporting, collapsed. */}
      {settings && (
        <details className="group mt-[18px] border-t border-border pt-3.5" id="advanced">
          <summary className="text-[13px] font-semibold group-open:mb-3">{t("advancedSettings")}</summary>
          {!onboarding && <KeyForm initial={settings.typeSafeKey} />}
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
            <ReportProblem size="sm" />
          </div>
        </details>
      )}

      {/* Low-key pointer to the free lessons; never competes with the main action. */}
      <footer className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border pt-3 text-xs text-muted-foreground" id="club">
        <p className="min-w-0 flex-1">{t("clubText")}</p>
        <ExternalButton href={CLUB_URL} variant="ghost">{t("clubButton")}</ExternalButton>
      </footer>
    </main>
  );
}
