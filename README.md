# Power BI CoE — Certification Plan

An interactive, role-based guide to the Microsoft and GitHub certifications that the Power BI Center of Excellence recommends. It reflects how the Power BI developer role is changing: semantic models in Git, enterprise analytics in Fabric, and GitHub Copilot in daily work.

| Track | Path |
| --- | --- |
| Data & Analytics | DP-900 (optional) → **PL-300 (mandatory)** → DP-600 (recommended) → DP-700 (optional) |
| AI-assisted development | AI-901 (optional) · GH-900 (recommended) → GH-300 (recommended) → GH-600 *or* GH-700 (optional) |
| Adjacent & explore next | AB-730, DP-800, DP-750, AI-103 |

**Personas:** *Power BI Developer* and *Analytics / Fabric Engineer*, each with a numbered route and optional add-ons.

Source reference: [Microsoft Certifications Poster](assets/Certification-Poster.pdf) (Aug 2026), plus the official study guides on Microsoft Learn (last verified 31 Oct 2026).

## What's in the app

- **Path map:** certifications by track and level, with arrows showing the suggested order. Pick a persona to highlight and number its route.
- **Details drawer:** why each certification matters to us, skills measured with weights, validity, effort, and links to the exam page, study guide, practice assessment and learning paths. You can share a direct link with `#cert-PL-300`.
- **Roadmap:** the selected persona's route as a timeline.
- **My progress:** a personal checklist with progress rings and a "next step" suggestion. It's stored only in the viewer's browser (`localStorage`), so nothing is sent or shared.
- **Resources:** official references, plus placeholder CoE items to fill in later.

## Run it locally

The page loads its data with `fetch`, so serve the folder rather than opening `index.html` directly from disk:

```bash
python -m http.server 8123
```

Then open <http://localhost:8123>. `npx serve .` works too.

## Update the content

There's no build step. All content lives in two JSON files:

- [`data/certifications.json`](data/certifications.json): tracks, levels, priorities, personas (`route` gives the order, `optional` lists add-ons) and certifications. Each certification has `track`, `level`, `priority`, `status` (`live` / `new` / `beta`), `recommendedBefore` (drawn as arrows), `whyForUs`, `skills`, `validity`, `effort`, and its links.
- [`data/resources.json`](data/resources.json): resource groups. An item with an empty `url` shows as a placeholder.

Change `meta.lastVerified` whenever you re-check the data. If a persona or arrow points to a code that doesn't exist, the app logs a warning in the browser console.

## Hosting options

Any static host works:

- **GitHub Pages:** push the repo and enable Pages on the `main` branch.
- **Azure Static Web Apps:** point it at the repository root, with no build command.
- **SharePoint / Teams:** link to the hosted URL from a Teams tab or a SharePoint page.

## Suggested next steps

- **Study groups:** run a cohort per certification (for example, a PL-300 group each quarter), and use the roadmap as the syllabus.
- **Recognition:** a "certified wall" or badges in Teams. This needs a shared tracker, which would be an upgrade from today's per-browser checklist.
- **Vouchers and challenges:** watch Microsoft Learn Cloud Skills Challenges and beta-exam discounts. Associate certifications renew yearly with a free assessment, and GitHub certifications last two years.
- **Quarterly data review:** exams change often (AB-730 changed on 20 Oct 2026, and GH-700 is still in beta). The Microsoft Learn MCP server makes refreshing `certifications.json` quick.
- **Fill in the CoE resources:** development standards (Git, `.pbip`, naming), a Copilot prompt and instruction-file library, and the voucher process.
