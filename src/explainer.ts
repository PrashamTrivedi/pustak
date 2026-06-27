// The "explainer" MCP prompt body.
//
// Mirrors the content of the "explainer" skill, adapted for an MCP prompt: the
// references to the skill's bundled example webpage (examples/bloom-filter.html
// and its screenshot) are dropped, since that file doesn't ship with the prompt —
// the proven palette/components are inlined here instead. src/mcp.ts serves this
// verbatim as the body of the `explainer` prompt.
export const EXPLAINER_PROMPT_TEXT = `# Explainer Generator

Take a concept (text the user wants explained, a topic, a paste of docs/code) and produce one self-contained interactive HTML file that teaches it — progressive sections, live demos the reader can poke, diagrams, and callouts. The artifact IS the deliverable; it is meant to be opened and read, not to feed a prompt back to the model.

Think "the explanation a great teacher would build if they could make any interactive widget" — not a slide deck, not a wall of text.

## When to use

The user wants something explained and an interactive page would land it better than prose: anything with a process, a cause-and-effect relationship, parameters that trade off, a structure, or a "watch it happen" moment. If they just want plain text, don't reach for this. (A playground lets the user configure something and copy out a prompt; an explainer teaches a concept and ends in understanding. "Help me understand X" → explainer.)

## Process

1. Pin down the one big idea. Before any HTML, write (for yourself) the single sentence the reader should walk away with. Everything serves that sentence. If the input is vague, ask 1-2 clarifying questions (audience level? the specific angle?).
2. Decompose into 3-6 sections that build on each other: the problem/motivation → the core mechanism → an interactive demo → the knobs/edge cases → recap. Concrete before abstract.
3. Pick interactions per section from the catalog below. Every meaty idea earns a visual or an interaction, not another paragraph. Reach for at least one thing the reader can manipulate.
4. Write a single HTML file — inline all CSS/JS, no external dependencies. Use the design system below so it looks good by default.
5. Verify by rendering it and looking (see Verify). A blank or broken page = not done.
6. Deliver it — save it to the user's space (Pustak's write_page tool serves it at /<username>/<path>) or hand over the file, and tell them where it lives.

## Source-grounded inputs: articles & books

The flow above assumes a concept. When the input is an article (URL or pasted text) or a book (title, or supplied excerpts/notes/highlights), switch to source-grounded mode: the deliverable teaches that source's argument, not the general topic. The most likely failure here is quietly producing a topic explainer wearing the source's title — don't.

### Articles

1. Ingest first. Given a URL, fetch it before writing anything. Given a paste, the paste is canonical. Never write from memory of the topic when a source is in hand.
2. Fidelity rules. The one big idea is the author's thesis, stated in the author's terminology, illustrated with the author's examples. General knowledge only fills gaps, and every fill is marked with a context callout (same construction as the insight/gotcha callouts, neutral tint) — never silently blended in.
3. Cite. The hero links back to the source: title, author, URL.
4. Otherwise the normal concept flow applies.

### Books — spine, slice, or both

A book doesn't fit one page. Scope it up front (ask one question unless the user already chose):

- Spine — one page: the book's central thesis plus its 5-8 load-bearing ideas and how the chapters build toward them.
- Slice — a full-depth explainer for each chosen chapter; each chapter is treated as a "concept" and gets the complete normal flow.
- Both — spine as the hub, chapter slices linked from it. The best default when the user wants the whole book seriously.

Be honest about sourcing: from a bare title you're working from training knowledge — say so, and ask whether they have notes/highlights/excerpts to ground it. If they do, that text is canonical and the article fidelity rules apply.

Output layout — one self-contained HTML file per page with relative links between them (each file still inlines all its own CSS/JS): a spine/index page plus one page per sliced chapter.

Spine page specifics: centerpiece is an annotated idea-map (inline SVG) showing how the load-bearing ideas connect and build; add a sticky TOC sidebar once past ~6 sections (the only sanctioned departure from pure single-column). When slices exist, each idea/chapter card links to its chapter page.

Interaction fits for books: timeline for narrative books; claim → evidence → counterargument toggles for argument-driven nonfiction; check-your-understanding quizzes for framework-heavy books — and apply the "operable gotcha" rule at book scale: let the reader trigger the bias/effect the chapter describes, not just read about it.

When slicing more than one chapter, write each chapter as its own full-depth explainer. They share no context, so every chapter page must carry its own scope, key ideas, source excerpts, and the shared design system (reuse one palette across all chapters so they read as one book). Finish by writing the spine/index page that links every chapter — that hub is the entry point you hand the user. Never leave orphan chapter pages.

## Interaction catalog — your toolbox

Pick what fits the concept. A strong explainer usually combines 2-4 of these.

- Progressive sections — always, the spine of the page: numbered sections, generous whitespace, a scroll progress bar.
- Live demo — when there's a thing the reader can operate to build intuition (a data structure, an algorithm, a regex): inputs/buttons mutate a single state object and re-render instantly on every change, no "Apply" button.
- Parameter sliders — when output depends on knobs that trade off (math, tuning, physics, cost curves): range inputs recompute a number/formula and a visual gauge live; surface the optimum and what's past it.
- Stepper — when a sequence or process is best understood one frame at a time (an algorithm, a request lifecycle): Prev/Next over an array of step states; highlight what changed each step.
- Before/after toggle — when comparing two states or "naive vs better": a switch that swaps the rendered view.
- Hover-to-define terms — for jargon, inline: a tooltip on hover, no clutter.
- Callout boxes — when a key insight, analogy, or gotcha deserves to break the flow: a tinted left-border card (insight / gotcha / plain).
- Annotated diagram — for spatial/structural relationships (architecture, data flow, anatomy of a thing): inline SVG, or a canvas with manual draw calls plus hover hit-testing.
- Check-your-understanding — when the concept has a common misconception worth testing: 1-2 multiple-choice questions that reveal an explanation on answer.

Don't cram all of these in. Match the concept; cut the rest.

## Pedagogy rules (this is what separates it from a pretty README)

- One big idea, stated early and plainly. Then build to it; don't bury it.
- Concrete before abstract. Show a specific worked example, then generalize — show the mechanism happening before you show the formula behind it.
- Earn every paragraph. If a point can be a diagram, a demo, or a callout, make it that. Long unbroken prose is the failure mode.
- Use an analogy for the central mechanism, in a callout.
- Name the gotcha. The thing that surprises people gets its own gotcha callout — ideally one the reader can trigger in a demo (e.g. push a slider past the optimum and watch error rise).
- Recap at the end — the one sentence again, now that they've earned it.

## Design system (reuse this — it's proven)

Dark, calm, one accent gradient. System font for UI, monospace for code/values. Build from this palette and these components: a scroll progress bar, a hero, numbered section headings, a .callout (plus .insight / .gotcha, and a neutral-tint .context variant for source-grounded pages), a .term hover tooltip, a .panel, sliders, a .gauge, and stepper styles.

    --bg:#0e1117  --bg-elev:#161b22  --border:#2a3240  --text:#e6edf3  --text-dim:#9aa7b4
    --accent:#58a6ff  --accent2:#a371f7  --good:#3fb950  --bad:#f85149  --warn:#d29922

- Single column, max-width ~760px, centered. Reading-first, not dashboard-first.
- Live preview means live: every control calls one updateAll() that re-renders. No submit buttons for state changes.
- Animate state changes (transition / keyframes) so cause → effect is visible, not instant-snap.
- Self-contained: if a CDN being down breaks it, you did it wrong.

## State pattern

    const state = { /* everything configurable */ };
    function updateAll() { renderViz(); renderReadout(); }  // every control calls this

For deterministic demos (hashing, RNG-driven visuals) write your own small pure function so output is reproducible across reloads.

## Verify (do not skip)

You must render the file and look at it before claiming it's done. Headless Chrome can screenshot a file:// path directly, no server needed:

    google-chrome --headless=new --disable-gpu --no-sandbox --hide-scrollbars \\
      --window-size=820,3200 --virtual-time-budget=2000 \\
      --screenshot=/tmp/explainer.png "file:///ABS/PATH/TO/page.html"

Then look at the screenshot. Blank/error/cramped → fix and re-render. For interactivity, drive the page in a real browser, operate the demo, confirm its logic (a query returns the right verdict, a slider recomputes the gauge), then screenshot an active state and look at it.

## Common mistakes

- Wall of text with a banner on top. If there's nothing to operate and nothing to see, it's a styled README — add a demo or cut it.
- Static "interactive" page. Controls that don't re-render live, or a demo that only shows one frozen state.
- External dependencies (Tailwind CDN, charting libs, web fonts). Inline everything; it must work offline forever.
- Burying the big idea under setup. Lead with it.
- Decoration over explanation. Animations and gradients serve comprehension; they're not the point.
- Claiming done without rendering. You didn't see it → it's not done.
- Topic explainer wearing the source's title. Given an article or book, teaching the general topic from memory instead of the author's actual argument. Fetch/use the source; mark knowledge fills with context callouts.
- Orphan chapter pages. Slices with no hub — always finish with an index/spine page that links every chapter.`
