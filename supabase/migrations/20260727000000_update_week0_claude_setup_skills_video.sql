-- One-time content sync for the DEPLOYED database.
-- The course1 seed (20260715040000) uses INSERT ... ON CONFLICT (cell_id) DO NOTHING,
-- so it cannot update the already-seeded Week 0 "Claude Set-up" row on an existing DB.
-- This migration force-updates that row directly:
--   - body_md: adds the "6. Skills" section (kept in sync with
--     supabase/seed-data/course1-content.json as of 2026-07-27).
--   - video_url: Week 0 lesson video (stored as a clean watch URL; the app extracts the
--     YouTube id from it, so tracking query params are intentionally dropped).
-- DATA-04 caveat: an UPDATE-by-cell_id overwrites any CMS edits made to this cell.
-- Runs after the seed on a fresh `supabase db reset`, so fresh and existing DBs converge.

update public.modules
   set body_md = $md$Welcome! This short guide gets you started with Claude at Nava: logging in, installing the desktop app, finding your way around, choosing starter settings, the basics of writing a prompt, and adding Skills.

**Total time: about 15 minutes.** We are not going in depth on any of these topics — just getting everyone started. If you are already comfortable with everything on the agenda below, feel free to skip this activity entirely, or jump straight to the section(s) that are relevant to you.

**Agenda**

1. Logging in
2. Downloading Claude to your desktop
3. A tour of the key areas in the tool
4. Recommended starter settings (including custom instructions)
5. Prompting basics
6. Installing and using Skills

## 1. Logging in

- Go to [claude.ai](https://claude.ai) and choose **Continue with Google**.
- Sign in with your Nava Google account (your `@navapbc.com` address). Claude access at Nava runs through your work account, so there is no separate password to manage.
- If sign-in fails or you don't seem to have access, ask in the AI Slack channels (see the end of this guide). Don't create a personal account with your work email.

## 2. Downloading Claude to your desktop

The browser version works fine, but the desktop app is worth installing:

- It keeps Claude one keyboard shortcut away instead of buried in your tabs.
- Some features (like working with local files in Cowork) work best from the desktop app.
- Download it from [claude.ai/download](https://claude.ai/download), install, and sign in with the same Google account.

## 3. Key areas in the tool

Claude is more than the chat box. A quick map of the spaces you'll see:

- **Chat** — the default space. Ask questions, draft and revise text, paste in material to work over. This is where you'll spend most of your time at first, and it's where the course activities happen.
- **Projects** — a saved workspace that keeps instructions and reference files attached, so every chat you start inside it already has your context. Useful once you have a recurring task.
- **Cowork** — a side-by-side working mode where Claude can operate on your actual files and carry out multi-step tasks, rather than just talking about them.
- **Code** — Claude Code, a tool for engineers that works inside a codebase from the terminal. If you don't write code, you can ignore this one.
- **Design** — a space for generating and iterating on visual artifacts and mockups. Worth a look if your work involves interfaces or presentations.

You don't need to learn these now — just know they exist. The course starts in **Chat**.

## 4. Recommended starter settings

Open **Settings → Profile** and take two minutes here — it pays off on every future chat.

The most useful setting is your **personal instructions**: standing guidance Claude applies to all of your conversations. Things to consider including:

- **Who you are** — your role and the kind of work you do, so answers land in your context.
- **How you like answers** — length, tone, format. If you prefer plain language and short answers, say so once, here, instead of in every chat.
- **What to avoid** — anything Claude keeps doing that you don't want.

A starter template you can paste in and edit:

> I work at Nava PBC, a public benefit corporation that helps government agencies deliver simple, effective, accessible services.
> My role: [your role and the kind of project you support].
> When you answer:
> - Default to plain language and keep answers short unless I ask for more detail.
> - When I ask for a document, give me a draft I can edit — flag anything you were unsure about.
> - If my request is ambiguous, ask me a clarifying question instead of guessing.

## 5. Prompting basics

A **prompt** is simply what you send Claude: the request plus everything you include with it. You don't need special syntax — clear beats clever. The parts that matter:

- **The task** — what you actually want. "Summarize this for a project update" beats "thoughts on this?"
- **Context** — the background Claude needs: who it's for, what it's about, any material to work from. Paste in the relevant text rather than assuming Claude knows it.
- **Constraints** — length, format, tone, audience. "Five bullets, plain language, for a non-technical stakeholder" changes the answer completely.
- **What good looks like** — an example, or a sentence about what you'd consider a great answer.

You'll practice all of this during the course — no need to master it today.

## 6. Skills

A **skill** is a reusable set of instructions — sometimes bundled with templates or reference files — that teaches Claude how to do a specific task the way you (or your team) want it done. Instead of re-explaining "here's how we format a project update at Nava" every time, you set the skill up once and Claude follows it automatically whenever it's relevant.

Nava has a shared library of skills at [hub.navapbc.com](https://hub.navapbc.com) — practical skills that Nava people have built for real Nava work. Sign in with your Nava Google account to browse them.

**Turn skills on (one-time)**

- Open **Settings → Capabilities** and make sure **Code execution and file creation** is on — skills rely on it.
- Then open **Customize → Skills**. Claude ships with a few built-in skills (like creating Word, Excel, and PowerPoint files); toggle on any that look useful.

**Install a skill from the Nava hub**

1. Go to [hub.navapbc.com](https://hub.navapbc.com), sign in, and find a skill that fits your work.
2. **Download** it — it comes as a `.zip` file.
3. Back in claude.ai, open **Customize → Skills**, click the **+** button, choose **Create skill**, then **Upload a skill**.
4. Upload the `.zip`. The skill appears in your list — toggle it **on**.

**Using a skill**

You don't need to do anything special. Once a skill is on, Claude uses it automatically when your request matches — ask for a formatted deck, for example, and a slides skill kicks in. You can also type `/` in the message box to see your skills and pick one directly.

**Making and sharing your own**

Notice yourself explaining the same process to Claude again and again? That's a skill waiting to happen. Under the hood a skill is just a folder with a plain-text instructions file (`SKILL.md`) describing the task. Once you have one that works, you can publish it to [hub.navapbc.com](https://hub.navapbc.com) so the rest of Nava can use it too — the hub and the AI Slack channels have the details on how to contribute.

## Where to go with questions

You're set up! When questions come up (they will):

- **AI Slack channels** — ask anything, no question too basic. Post what you tried, what you expected, and what you got.
- **AI Office Hours** — drop in live with a question, a task you're stuck on, or a result you don't understand.
- **Other internal resources** — Nava's AI Tool Policy has the basic guidance on what's safe to put into AI tools, and your cohort channel (once your course starts) is the best first stop for course questions.$md$,
       video_url = 'https://www.youtube.com/watch?v=0vZ_UVLhSQQ'
 where cell_id = 'c1-w0-claude-setup';
