# orlaz — FAQ presentation + question quality + aura tag check

Confirmed live on Watch Dogs 2: the FAQ tab is one flat wall of text — six Q&A pairs stacked in a single card with no visual separation, and every question is a generic bio fact already shown elsewhere on the same page (developer/publisher/genre/release date are all already in the header metadata row). Three things to fix.

## 1. Presentation — give each Q&A pair real visual separation

Right now FaqSection renders all Q&A pairs as plain stacked text inside one panel. Rebuild it as a proper list of distinct rows or an accordion — this app already depends on Radix (@radix-ui/react-select, @radix-ui/react-dialog), so @radix-ui/react-accordion fits the existing pattern rather than introducing a new UI paradigm. Each question should be its own clickable row that expands to reveal the answer (collapsed by default, or first one open), with a visible divider/border between rows and real padding — not the current continuous paragraph-style dump. Match existing GlassPanel/spacing conventions rather than inventing new visual language.

## 2. Question quality — stop restating the page header

Every question currently generated (who developed it, who published it, what genre, when released, what DRM) duplicates information already visible in GameDetail.tsx's header metadata row and tag pills two seconds above the FAQ tab. That's not useful, it's filler — worse, it reads as padding specifically because the same facts are already on screen.

Find the Groq prompt in worker/routes/faq.ts and rework what it's asked to generate. Keep the same strictly-grounded, never-fabricate discipline (only use facts actually passed into the prompt), but steer it toward questions that are actually specific to what a crack-tracking site's audience wants to know, using data this app already has and the header doesn't show:

- How many groups/methods have cracked this game, and what's the practical difference between them (e.g. "Is the hypervisor crack or the traditional crack more reliable for this game?" if both exist)
- Whether the crack has kept up with the game's own updates (tie to the real Current/Outdated/Unverified status data already computed for this game — e.g. "Is the tracked crack still working after the game's latest update?")
- Whether a repack exists and what that actually means for the user, if isRepack data is present
- Anything genuinely derived from this game's specific release history, not generic facts equally true of any game with a Wikipedia page

Explicitly instruct the prompt to avoid questions whose answer duplicates the developer/publisher/genre/release-date/DRM-type fields already visible in the page header — that's the actual complaint, not the topic being wrong, the topic being redundant with what's already on screen.

## 3. Verify the aura tag is actually showing here

Last round's aaebe39 added an AiTag component with the aura treatment to AiSummary, GameFact, and FaqSection. In the screenshot, the "AI" badge next to the FAQ heading reads as a flat grey pill, not visibly showing the conic-gradient aura ring the other two are supposed to have. Confirm FaqSection is actually using the shared AiTag component (not a leftover plain Pill that didn't get swapped), and that the aura is actually rendering there, not just present in code but invisible for some CSS reason (z-index, size, opacity) specific to this component's layout.

## What NOT to touch

Don't touch AiSummary/GameFact's own aura tags if section 3 confirms they're fine — only fix what's actually broken. Don't change the underlying Groq client/grounding rules in worker/shared/groq.ts, only the FAQ-specific prompt content in worker/routes/faq.ts.
