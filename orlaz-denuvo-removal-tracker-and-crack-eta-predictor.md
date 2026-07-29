# orlaz — Denuvo-removal tracker + a Crack ETA Predictor (the genuinely differentiated feature)

Two features. Both must follow this project's core discipline established all session: real, computed, transparent, re-checkable statistics only — never an LLM guessing/vibes-based prediction presented as fact. Both should show their work (what real data fed the number), same spirit as the group reliability score's "2 of 54 releases needed a fix" transparency.

---

## Part 1 — Denuvo-removal tracker

Builds directly on the historical-DRM (`former_tags`) work already shipped. Publishers routinely remove Denuvo months after launch once the critical early-sales window has passed — this is now real, trackable data in orlaz's own catalog (every confirmed removal case has a game, a launch date, and a removal point).

1. **Compute each publisher's real Denuvo-removal pattern** from the actual confirmed removal cases already in D1 (007 First Light, NieR:Automata, SUPER ROBOT WARS Y, plus whatever the catalog-wide sweep found) — median days-from-launch-to-removal per publisher, where enough data exists. Be honest about sample size: a publisher with only 1 confirmed removal doesn't get a confident median, same "not enough data" discipline as the group reliability score.
2. **Surface this on currently-Denuvo'd games**: if a game still has Denuvo and its publisher has a real historical removal pattern, show something like "Ubisoft has historically removed Denuvo a median of X days post-launch; this game is at day Y" — a real, grounded, honest data point, not a promise or guarantee.
3. **A dedicated tracker page/section** listing currently-Denuvo'd games sorted by "closest to their publisher's typical removal window" — genuinely useful, differentiated content nobody else provides.

## Part 2 — Crack ETA Predictor (the flagship differentiator)

For games that are either uncracked or only hypervisor-cracked (traditional/permanent crack not yet achieved), compute a real, transparent estimate of when a traditional crack is likely, using actual historical signals already in this catalog:

- **This publisher's median time-to-traditional-crack** for their past Denuvo titles (real data, same discipline as Part 1 — no confident number without enough samples).
- **This specific DRM/Denuvo version's track record**, if that granularity is available or derivable.
- **Which groups are realistically likely to attempt it**, using the existing group reliability/speed data (a group with a fast historical turnaround on similar titles factors differently than one that doesn't typically compete on big AAA Denuvo titles).
- Combine into a real, honestly-caveated estimate — e.g. "Historically, traditional cracks for this publisher's Denuvo titles land in 14-45 days (median 21, 6 samples). No confident estimate" if data is too thin, rather than inventing false precision.

**Show the reasoning, not just a number** — a small breakdown (like the group reliability tooltip) explaining what real data produced the estimate, so it reads as a computed statistic, not an AI guess. This is explicitly the standout, hardest-to-copy feature — no other crack-tracking site does actual grounded predictive modeling with shown methodology, they just report current status.

---

## What NOT to do

Never have an LLM generate or adjust these numbers based on general knowledge — both features must be pure statistics computed from orlaz's own real stored data. Never show a confident-sounding number without adequate sample size — say "not enough data yet" instead, same discipline as the group reliability score. Don't guarantee or promise outcomes in the copy/wording — frame everything as historical pattern, not prediction-as-fact.
