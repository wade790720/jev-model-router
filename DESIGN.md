# Smart ChatGPT interface conventions

This file describes the existing product UI, not a new brand or a replacement for routing policy. Product names are **Smart ChatGPT** / **ChatGPT 智慧選模型**. TypeSafe AI Jev is the routing provider, not the umbrella brand. Follow explicit user requirements before a design skill's preferred aesthetics.

## Surface and intent

The popup, settings page and inline routing notice are **Operate** surfaces: users configure access or confirm routing status, then return to their draft. Preserve the compact neutral visual world, purple primary action, system typography and host-aware notice. Do not add marketing imagery, downloaded fonts, animation libraries or decorative entrance effects.

## Source of truth

- `extension/options.html`: settings tokens, layouts and controls.
- `extension/content.css`: embedded notice, with ChatGPT theme-variable overrides.
- `extension/i18n.js`: browser-language translations and factual copy.
- `extension/options.js`: settings actions; preserve service permissions and privacy boundaries.
- `extension/content.js`: recommendation-only state and draft/IME handling.

Shared brand pack for this maintainer lives outside this repository at `C:/Users/Wade_TPE/Documents/Codex/brand-guidelines`. Other checkouts must use the code and this file unless a corresponding brand pack is explicitly supplied. Do not make that absolute path a runtime dependency.

## Visual rules

- Toolbar popup: intrinsic 360px width and 20px padding, explicitly selected by `options.html?view=popup` through `options-view.js` before styles load. Never cap native popup width with `100vw`: Chrome derives the viewport from the content, creating a circular shrink loop. The full settings page keeps its responsive 360px viewport cap, up to 440px with 26px padding on wide screens.
- Light/dark settings follow the system. Embedded notice follows the host's effective theme.
- Settings palette: Sai/佐為-inspired restrained wisteria, ink and ivory, implemented using Radix Colors `violet`, `mauve`, and `sand`. This is the requested product color direction, not a finalized cross-product Sai identity or character/logo asset. Product names and typography remain unchanged.
- Primary accent: Radix `violet9` (`#6e56cf`); light hover uses `violet10`, while dark hover uses violet9 mixed with 12% black to keep white button text above 4.5:1. Selected backgrounds and text use violet steps 3/11/12. The S mark remains a product placeholder, now matte instead of glowing.
- Light canvas/surface: sand2/sand1. Dark canvas/surface: mauve1/mauve2. Primary/muted text: mauve12/mauve11. Passive borders: mauve6; interactive borders: mauve9, for clearer control boundaries.
- Success/error messages use green/red steps 3/7/12, with step 12 text chosen for stronger contrast on the tinted background. Color always accompanies text.
- Selected control indicators use violet9 in light mode and violet11 in dark mode, rather than the same accent in both themes, to preserve contrast against the selected surface.
- `extension/vendor/radix-colors.css` is a generated, namespaced light/dark hex palette from the installed package. It is loaded only by `options.html`; no CDN, framework or runtime npm import is needed. `npm run colors:sync` refreshes it after dependency changes; `npm run colors:check` checks version/data/license drift. Keep `RADIX-LICENSE.txt` in the shipped extension.
- Shared brand guidelines outside this repo still describe the previous baseline; this is a product-specific override. Do not silently recolor other products or the shared pack.
- System font: 14px base, 17px product heading, 13px field labels, 12px help and status text.
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
