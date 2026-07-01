---
description: Make an AI response shorter and simpler
argument-hint: [text to shorten]
---

Rewrite the provided text so it is shorter, simpler, and easier to skim.

If text is provided after `/short`, shorten that text. If no text is provided, shorten the previous assistant response.

Rules:
- Use plain English.
- Keep only the important points.
- Prefer one short paragraph or 3-5 bullets.
- Remove extra explanation, hedging, and process details.
- Preserve commands, file paths, warnings, and concrete next steps when they matter.
- Do not add new facts.

Text to shorten:

$ARGUMENTS
