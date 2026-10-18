# AI Fluency: Project Plan

A study app for learning AI terms and concepts well enough to explain them to customers. Built for daily use in Safari on iPhone and Mac, and as a portfolio piece.

**Status:** built. Every feature in sections 4 to 7 is in the app, with 150 draft cards waiting on review in [`content/REVIEW.md`](content/REVIEW.md). See [README.md](README.md) for what's there and [DEPLOY.md](DEPLOY.md) to put it online. Decisions made while building are in the README's Decisions section.

---

## 1. Why this exists

Most study apps teach what a term *means*. This one also teaches how to *say it to a customer*: in plain English, without hedging, and with an answer ready for the follow-up question. That's the skill an Account Manager or CSM (or later an AE) actually needs in a sales conversation about AI.

It sits next to the courses I'm already taking (Microsoft Learn, Anthropic Academy, deeplearning.ai). It doesn't replace them. The courses teach the material and this app makes it stick.

## 2. Decisions made

| Decision | Choice | Why |
|---|---|---|
| Devices | iPhone + Mac, Safari | Short sessions on the phone, longer ones on the laptop |
| Install | Progressive Web App (PWA) | "Add to Home Screen" in Safari makes it feel like a native app and lets it work offline. No App Store needed |
| Users | Just me, code public on GitHub | One passcode login so nobody else can run up the Claude bill |
| v1 scope | Glossary, flashcards, and one game | Usable within a weekend. Live AI features come in v2 |
| Content focus | General AI fundamentals, and AI in SaaS sales/CS | Core literacy plus how buyers actually evaluate AI products |
| Not Anki or Quizlet | Games and interactive modes are core, not extras | Flipping cards alone gets boring and doesn't build the skill of talking about AI |

## 3. Stack

The same stack as `iron-atlas/`, so the setup and deploy steps are already familiar.

- **Next.js + TypeScript + Tailwind**: the app itself
- **Neon (Postgres) + Drizzle**: stores progress so the phone and laptop stay in sync
- **Vercel**: hosting (free hobby tier)
- **Claude API** (from v2): grading answers, playing customer roles, pulling terms out of notes
- **Voyage embeddings + pgvector** (v3): semantic search over my own glossary and notes
- Reuse Iron Atlas patterns: the coach cost cap and the PGlite local dev database

## 4. How learning works (the part under the games)

The games sit on top of a real learning engine, so playing actually counts as studying.

- **Spaced repetition.** Each term has a mastery score. Terms you miss come back sooner and terms you know come back later. Every game feeds into the same schedule, so a game round counts as a review.
- **Three layers per term**:
  1. *Plain English*: one or two sentences a smart non-engineer gets on the first read
  2. *Under the hood*: a slightly more technical version
  3. *Customer line*: how to say it on a call, plus the likely follow-up question and a good answer
- **Production over recognition.** Picking the right answer from a list is easy. Explaining it in your own words is what proves you know it. The modes move from recognizing to producing as mastery goes up.

## 5. Game and interactive modes

Ordered by when they ship. The v1 games use pre-written content, so they cost nothing to run. The v2+ modes use Claude.

### v1 (no AI calls)

- **Jargon Buster (speed round).** A customer sentence full of jargon appears ("We're looking at RAG over our vector store to cut hallucinations"). You get 60 seconds to match each buzzword to its plain-English meaning. Combos and a personal best score.
- **Deal Desk (scripted).** A short simulated customer call. The buyer asks questions ("Does your AI train on our data?") and you pick the best of three responses. Good answers move a **deal health meter** up; vague or wrong ones move it down. Close the deal to win. Each call is themed (security review, ROI pushback, "is this just ChatGPT?").
- **Myth or Fact.** Swipe left or right on statements like "Bigger context windows mean the model remembers past conversations." Each answer shows a one-line explanation.

### v2 (Claude-powered)

- **Explain It Back.** You type or dictate a term in your own words. Claude scores accuracy, clarity, and jargon level, then shows a better version.
- **Deal Desk (live).** The same game with no script. Claude plays a persona (skeptical CISO, CFO watching the budget, excited but nontechnical VP) and pushes back on what you actually say. You get a scorecard at the end.
- **Notes to cards.** Paste course notes and Claude pulls out new terms as draft cards tagged by course. You approve each one before it goes in.

### v3

- **Boss battles.** A tough exec persona at the end of each topic unit, unlocked once enough of that unit is mastered.
- **Ask my glossary.** A tutor that answers from my own saved cards and notes (embeddings + semantic search).

## 6. Progress and rewards

Uses a sales theme, because it's fun and fits the job.

- **XP** from every review and game round. Harder modes earn more.
- **Weekly quota.** A weekly XP target. Hitting it counts as making quota, and the dashboard shows attainment %.
- **Rank ladder.** BDR, then AM, then Senior AM, then Enterprise AE, then VP of Sales. Rank goes up with *mastered terms*, not raw XP, so you can't grind easy games to rank up.
- **Streaks** with one free "PTO day" a week so one missed day doesn't kill the streak.
- **Dashboard.** Mastery by topic (heatmap), weakest terms, quota attainment over time.

**Guardrail:** games tend to reward speed over understanding. To keep that in check, rank depends on mastery, and every term has to pass one "produce" mode (Explain It Back once v2 ships) before it counts as mastered.

## 7. Starter content

About 150 terms in two tracks for v1.

- **Fundamentals:** model, training vs inference, parameters, tokens, context window, prompt, temperature, hallucination, embeddings, vector database, RAG, fine-tuning, agents, tool use, MCP, multimodal, evals, guardrails, and so on.
- **AI in SaaS sales/CS:** data residency, "do you train on our data", SOC 2 and AI, pricing per seat vs per token, AI ROI framing, human in the loop, copilot vs agent, build vs buy, AI governance, model risk, pilot to production.

**Accuracy rule:** content is checked against primary sources (Anthropic, Microsoft Learn, and deeplearning.ai docs) and each card links its source. I review every batch before it ships. Learning a wrong definition is worse than not learning it, especially in front of a customer.

Content lives in versioned JSON files in the repo (`content/terms/*.json`), so it's easy to review in a PR and edit by hand.

## 8. Build order

1. **Content first.** Write and review the first 50 terms (both tracks). Every game needs this anyway.
2. **App shell.** Next.js PWA, passcode login, database schema, offline caching.
3. **Flashcards + spaced repetition.** The daily review queue.
4. **Jargon Buster and Myth or Fact.** The quickest games to build.
5. **Deal Desk (scripted).** Write 5 scripted calls.
6. **XP, quota, ranks, dashboard.**
7. **Deploy to Vercel** and add it to the iPhone home screen.

(The original plan was to use v1 for two weeks before building v2. That changed: every version was built up front, with fixes to follow from real use.)

## 9. Open questions

- ~~Voice input for Explain It Back~~ Decided: use the iPhone keyboard's built-in dictation. No extra API, no extra cost.
- Add Microsoft AI-900 exam tags later? It would line up with the Microsoft Learn courses and is a cheap resume line.
- Name: "AI Fluency" is a working title.
