# Smart ChatGPT interface conventions

This file describes the existing product UI, not a new brand or a replacement for routing policy. Product names are **Smart ChatGPT** / **ChatGPT 智慧選模型**. TypeSafe AI Jev is the routing provider, not the umbrella brand. Follow explicit user requirements before a design skill's preferred aesthetics.

## Surface and intent

The popup, settings page and inline routing notice are **Operate** surfaces: users configure access or confirm routing status, then return to their draft. Preserve the compact neutral visual world, violet primary action, shared brand typography and host-aware notice. Do not add marketing imagery, remotely loaded fonts, animation libraries or decorative entrance effects.

## Source of truth

- `src/brand.css`: shared brand tokens, a copy of `Codex/brand-guidelines/brand.css` v0.2.0. Change the canonical copy there, then copy it here; never edit this copy.
- `src/index.css`: product overrides on top of the brand tokens, Radix status scales and page sizing.
- `src/App.tsx` and `src/components/ui/`: settings layout and controls (shadcn/ui).
- `public/content.css`: embedded notice, with ChatGPT theme-variable overrides.
- `src/lib/i18n.ts`: browser-language translations and factual copy.
- `src/lib/settings.ts`: settings actions; preserve service permissions and privacy boundaries.
- `src/content/router.ts`: recommendation-only state and draft/IME handling.

Shared brand pack for this maintainer lives outside this repository at `C:/Users/Wade_TPE/Documents/Codex/brand-guidelines`. Other checkouts must use the code and this file unless a corresponding brand pack is explicitly supplied. Do not make that absolute path a runtime dependency.

## Visual rules

- Toolbar popup: intrinsic 360px width and 20px padding, fixed by `data-view="popup"` on `popup.html`'s `<html>`, so it applies before any script runs. Never cap native popup width with `100vw`: Chrome derives the viewport from the content, creating a circular shrink loop. The full settings page keeps its responsive 360px viewport cap, up to 440px with 26px padding on wide screens.
- Light/dark settings follow the system. Embedded notice follows the host's effective theme.
- Settings palette: shared brand tokens v0.2.0 (Linear-style neutral grays, one violet accent). The accent is an interim cross-product value, not a finalized Sai identity or logo asset. Product names remain unchanged.
- Primary accent: `#6e56cf` (Radix violet9). Hover mixes it with 12% black in both themes to keep white button text above 4.5:1. The S mark uses the shared `brand-mark` utility: a matte accent tile, a product placeholder.
- Canvas, surface and text come from the brand tokens. Passive borders are the brand hairline; form controls override `--input` with Radix mauve9 for a 3:1 boundary.
- Success/error messages use green/red steps 3/7/12, with step 12 text chosen for stronger contrast on the tinted background. Color always accompanies text.
- Focus rings and selected indicators use `--ring`: the accent in light mode, a lighter violet (`#baa7ff`) in dark mode, to keep contrast against dark surfaces.
- `src/index.css` imports `./brand.css` and the Radix `green`/`amber`/`red` scales; Vite bundles them and the Inter font files; no CDN. They are loaded only by the settings pages, never injected into ChatGPT. Keep `public/RADIX-LICENSE.txt` in the shipped extension.
- Product overrides stay limited to `--input`, `--raised` and `--primary-hover`. To change a shared color, edit `brand.css` in the shared pack, then copy it to every product.
- Inter Variable (bundled), weights 400–600, no 700: 14px base, 17px product heading, 13px field labels, 12px help and status text.
- Controls are 36px high (buttons and text inputs), small buttons 32px, same as the other brand products. Secondary buttons use the hairline border, not `--input`. Collapsible sections use a lucide chevron instead of the native marker.
- Related controls use 8–12px gaps; distinct sections use 16–20px separation.
- Hosted service is the fresh-install default. No connection-mode cards. Personal API key is an explicit checkbox inside advanced settings; existing personal settings are preserved.
- Draft analysis runs by default once access is configured; no separate consent checkbox. Preserve the visible disclosure of text transmission. Member sign-in stays visibly unavailable until implemented; internal test credentials never masquerade as production login.
- Primary save action dominates. Diagnostics export is a compact secondary action, not a second primary CTA.
- Embedded notice stays 200px maximum, right-aligned with the composer. Status text wraps; probability values never shrink. Truncated model names expose the full name through their title.

## Interaction rules

- Disable only the pending action, expose `aria-busy`, prevent duplicate invocation, and re-enable after either success or failure. Busy feedback must not imply success.
- Keep native keyboard navigation and clear focus rings. Associate field help with its input.
- Frequent routing updates have no entrance animation and never request focus. Use a polite, atomic status region, not an assertive alert.
- Pointer press feedback may be subtle; keyboard and reduced-motion actions remain immediate.
- Green means recommendation completed, amber means low confidence, red means analysis failure. It never implies the ChatGPT model was switched. Always pair color with text.
- Do not change selection policy, model catalog, billing flows, consent defaults or diagnostic payloads as a UI refinement.
- Preserve user's manual model choice, draft, caret and IME composition. Never focus or click model controls, synthesize keys or send a draft. Deliberate sends never wait for a recommendation.

## Verification

Run `npm test` and `npm run check`. Preview settings with fake storage and keys, not live credentials; verify default hosted/advanced personal modes, success/error/busy states, keyboard operation, all supported locales, light/dark themes and long labels. Test the notice's long failure message, two/three choices, full model-name tooltip, focus ring and host theme. A mocked preview verifies presentation and settings interaction, not live ChatGPT DOM compatibility or API correctness.
