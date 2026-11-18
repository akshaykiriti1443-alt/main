import { env } from "@/lib/env";

// Playbooks: ready-made jobs the owner runs from their OWN AI app (Claude, ChatGPT, Antigravity CLI,
// VS Code…) through the MCP connector. Their AI does the thinking on their plan; our tools do the
// reading and saving. Served as MCP prompts (slash commands in many apps) and through the
// get_playbook tool for apps that only support tools. Words match the course on purpose.

export type Playbook = { name: string; title: string; description: string; say: string; steps: string };

export const PLAYBOOKS: Playbook[] = [
  {
    name: "monday_check_in",
    title: "Monday check-in",
    description: "Your weekly weigh-in: Skool level, what's missing, and this week's 3 moves.",
    say: `Run my Monday check-in in ${env.platformName}.`,
    steps: `1. Call get_overview.
2. Ask me for this week's numbers from Skool › Settings › Growth (About-page visitors, new customers, Skool Network sign-ups and the level Skool shows), unless I already gave them. Also ask my ad spend per day and posts per week.
3. Call save_growth_checkin with them.
4. In at most 6 short bullets: my level, what's missing for the next one, and whether my ads alone can close the visitor gap at about $1 per visit (the 30-day window is rolling).
5. Give me exactly 3 moves for this week, in the course's words (budget tier, keep, fix or kill with one room fixed at a time: Hook, Door or About page, fresh statics from Make my 5 statics every 1 to 3 weeks, Unlocks for engagement).
6. Call list_ai_tasks. If any are waiting, offer to do them now.`,
  },
  {
    name: "make_my_5_statics",
    title: "Make my 5 statics",
    description: "Your first ads, same day: your numbers, 5 genuinely different static ads with image prompts, the launch plan and a video script for later.",
    say: `Make my 5 statics with ${env.platformName}.`,
    steps: `1. Call get_overview for my business, niche, offer and Skool link.
2. Ask me, unless I already said: where these ads go (my website or my Skool link), my daily budget ($10 for website ads, $5 for Skool-link ads, or other), the country to target, who it's for in my own words, the result I promise, a real member result if I have one (optional), and the tone (friendly, bold or calm).
3. Optional: call search_competitor_ads with my niche. Study the longest-running ads' hooks and angles. Never copy their wording, names or claims.
4. Write 5 statics for ONE ad set. Meta's Andromeda system groups near-identical ads and treats them as one, so each static uses a different format (text_on_colour, photo_overlay, notes_app, before_after, checklist; quote_card only with a real member result) and a different persona, and every pair differs in at least two of: format, persona, angle, benefit. Angles: pain, dream, lesson; proof only with a real result.
5. Each static: on-image text (7 words or fewer), a Hook, Turn and Door (the Door is one way in: to my free checklist if these ads go to my website, or to the About page if they go to my Skool link), a headline, a call to action (Learn more is the safe default), an image prompt ready for ChatGPT, Gemini or Midjourney (portrait 4:5, 1080×1350), a one-line 9:16 Stories note and a one-line design note. Meta policy: no "Are you…?" personal attributes, no income claims, no made-up testimonials or numbers.
6. Write one 20-30 second selfie video script on the angle you think will win: Hook (0-2s), Turn and Door, each with what to say, the on-screen caption and the shot.
7. Call make_ad_studio_pack with my answers, the 5 statics and the video. It checks Meta policy and Andromeda variety, adds my numbers and the Ads Manager click-steps, and saves it to my Ad studio page.
8. Show me my numbers, the 5 statics and the launch plan's numbered steps it returns, plus any policy flags to fix. Remind me: hands off till Day 6, then Ad review, and any ad marked Kill goes off that day.`,
  },
  {
    name: "do_my_ai_tasks",
    title: "Do my AI tasks",
    description: "Finish the jobs your automations handed to your AI.",
    say: `Do my AI tasks in ${env.platformName}.`,
    steps: `1. Call list_ai_tasks.
2. Do each task using the member details it includes. Keep it short and human.
3. Call complete_ai_task with the finished text for each one. If a task is unclear or wrong, call skip_ai_task.
4. Give me a one-line summary per task.`,
  },
  {
    name: "fix_my_page",
    title: "Fix my page",
    description: "Sharpen your landing page's headline and promise, then save it as a draft.",
    say: `Fix my landing page in ${env.platformName}.`,
    steps: `1. Call list_pages and get_page for my opt-in page.
2. Check the top section like an ad: does the headline Hook (the result, in my reader's words), does the subheadline Turn (why this works when other things didn't), and is there one clear Door (one button)?
3. Rewrite only what's weak. Keep every section id and type. Simple words, short sentences, no invented testimonials or numbers.
4. Call update_page to save the draft and show me before and after. Only call publish_site if I say yes.`,
  },
  {
    name: "build_my_automation",
    title: "Build my automation",
    description: "Say what should happen and your AI builds the automation: trigger, emails and every step.",
    say: `Build me an automation in ${env.platformName}.`,
    steps: `1. Call get_overview and list_automations, so you know my numbers and what already runs.
2. Ask me what should happen, to whom and when, unless I already said. If I'm not sure, look at my numbers (new leads, hot leads, Skool link clicks, engaged members) and suggest the one that would plug my biggest leak.
3. Design it using only the triggers and steps that create_automation lists. Anything inside Skool: an ask_my_ai step drafts it and a notify_owner step tells me to send it myself.
4. Show me the plan in plain words: one line per step, every email in full. Ask "build it?".
5. When I say yes, call create_automation (switched off unless I said to switch it on) and give me the review link.`,
  },
  {
    name: "plan_this_weeks_unlock",
    title: "Plan this week's Unlock",
    description: "Create this week's Unlock: a small reward for a post or comment, plus the Skool post.",
    say: `Plan this week's Unlock in ${env.platformName}.`,
    steps: `1. Call get_overview and list_unlocks to see what I've already given away.
2. Suggest 3 small, genuinely useful rewards my members would comment for, each with an easy comment prompt (answerable in under 2 minutes, and asking them to reply to one other person).
3. When I pick one, ask me for the reward link, then call create_unlock.
4. Give me the Skool post text it returns, ready to paste and pin.`,
  },
  {
    name: "day_1_with_claude",
    title: "Day 1 with Claude",
    description: "Your AI builds Day 1 for you: your website from the premium template, your free checklist, your 3 welcome emails and your Skool About page.",
    say: `Build my website from the premium template, then write my free checklist and my 3 welcome emails in ${env.platformName}.`,
    steps: `1. Call get_overview (my business, niche, offer, Skool link), list_pages (do I already have a website?) and list_email_sequences.
2. Ask me, in one short message, only what you don't know yet: who it's for, the result they want, my checklist idea (or let you pick one), which of the two free-gift frameworks below I want (if I don't say, use the domino), my price and free trial in my own words (or none), my tone (friendly, bold or calm) and my brand colour.
3. Website. Write the opt-in page: hero (an eyebrow, a headline with the result in my reader's words, a subheadline that says why this works, 3 short bullets, button text, showForm true), benefits (3), steps (3), a text section "Hi, I'm <my first name>" (2-3 honest lines), faq (4) and a form. Write the thank-you page: a cta whose buttonUrl is {{skool_url}} (it states my price and free trial only if I gave them, and that they can cancel before it bills), then a text section linking the checklist with [Get it here]({{lead_magnet_url}}).
   - No website yet: build it from the premium template. Call create_site with template "premium" (our Glass look), a name, theme.brandColor if I gave one (leave style out unless I asked for a different look) and both pages' sections.
   - Already have one: get_page each page and save your new sections with update_page. If it isn't on the premium look yet, offer set_site_theme with style "glass"; change the look only when I say yes.
4. Free checklist. Build it on one of my two frameworks:
   - The domino (the default): solve one insanely valuable problem for my reader completely, for free. Solving it creates the next problem they'll hit; name that next problem near the end and say my paid Skool group is where it gets solved.
   - Go wide: speak to the widest group of people in my niche, help them see clearly that they have the problem (a quick self-check), give them a first small step, then offer my Skool group as the solution.
   Write the checklist itself, not a description of it: 300 to 600 words, one small action a day for 7 days, each about 10 minutes. Call set_lead_magnet with the siteId, its name and the content (it goes on /guide). If I already have one somewhere else, pass its name and url instead.
5. Welcome emails. Write 3: day 0 hands over the checklist with [its name]({{lead_magnet_url}}) and one thing to do today; day 1 the #1 mistake people make and the fix; day 3 a warm invite into my Skool group at {{skool_url}}. Start each with "Hey {{first_name}}," and sign with my first name. Call upsert_email_sequence with the sequenceId of the sequence that starts when someone becomes a lead, so new leads get one set, not two.
6. My Skool words, built as Who it's for, Pain, Path, Prize, Push. Plain text, ready to paste (Skool has no bold, so keep the structure with line breaks and emojis as bullets):
   - About page: the Prize in one line; one "Even if…" or "Without…" line; "This is for you if:" with 2-4 ✅ lines; 2-3 ❌ pain lines; "What you get:" with 3-5 🔹 lines; one push (my free trial only if I gave one, else "Tap Join.").
   - Group description, at most 150 characters, one line: "For <who>:", the path and the prize, then my free trial if I have one.
   - Cover headline: the Prize in 4 to 8 words, at most 40 characters, like "Strong in 3 sessions a week". Tell me to paste it into Cover headline in AI launch kit, where I also add my photo and make my cover.
   Nothing to save: show them to me to paste.
7. Show me: the preview link, the checklist link, the 3 email subjects, the About page, the group description and the cover headline. Ask "publish it?". Only call publish_site when I say yes; the sign-up form and the /guide page only work once the website is published.
Rules everywhere: simple words, short sentences, no invented testimonials, results, numbers, member counts, guarantees or income claims (only numbers I gave you), and a price or free trial only if I said it.`,
  },
  {
    name: "make_my_carousel",
    title: "Make my carousel",
    description: "Your first post: your ReelVault script (or a topic) as a 6-slide Instagram carousel, saved in your app ready to download.",
    say: `Turn my ReelVault script into a 6-slide carousel and save it in ${env.platformName}.`,
    steps: `1. Call get_overview for my niche and who I help.
2. Ask me to paste my ReelVault script (the one from Remake this), unless I already did. No script? Ask what the post is about in a few words.
3. Write 6 slides. Slide 1: the script's hook as big words, under 10 words, no lines. Slides 2 to 5: one idea each, a heading under 6 words plus 1 to 3 short lines (a list is one item per line). Slide 6: what to do next, like "Save this for later." and "More in my group. Link in bio." Keep my script's own words where you can. Drop camera notes, timings and labels like "Hook:".
4. Rules: simple words, short sentences, no emojis or hashtags, no invented results, numbers or testimonials.
5. Ask for my Instagram name if I want it on the slides (optional), then call save_carousel with a short title, the 6 slides and my name.
6. Give me the link it returns and say: open it, check the slides, press Download all slides. Then on Instagram: + › Post › pick all slides in order › Add music.`,
  },
];

// Earlier names, so chats that saved them still work. The 3-Pack is retired: the course makes ads
// with Make my 5 statics.
const ALIASES: Record<string, string> = { monday_review: "monday_check_in", engagement_drop: "plan_this_weeks_unlock", write_my_3_pack: "make_my_5_statics" };

export const playbookByName = (name: string) => PLAYBOOKS.find((p) => p.name === (ALIASES[name] ?? name));
