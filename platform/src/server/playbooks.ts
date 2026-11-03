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
5. Give me exactly 3 moves for this week, in the course's words (budget tier, the 3-Pack, Hook · Turn · Door, Unlocks for engagement).
6. Call list_ai_tasks. If any are waiting, offer to do them now.`,
  },
  {
    name: "write_my_3_pack",
    title: "Write my 3-Pack",
    description: "Study competitors' long-running ads, then write your Pain, Dream and Lesson ads.",
    say: `Write my 3-Pack of ads with ${env.platformName}.`,
    steps: `1. Call get_overview for my niche, offer and Skool link.
2. Call search_competitor_ads with my niche keyword. If live search is off, open the website link it returns and ask me to paste 5-10 ads I like.
3. Find the patterns in the longest-running ads (they usually make money): hooks, angles, offers, and one gap nobody uses.
4. Write my 3-Pack: a Pain ad, a Dream ad and a Lesson ad. Each has a Hook (first line, stops the thumb), a Turn (the "wait, what?" line) and a Door (one way in: my Skool link to the About page). Add a headline and a one-line creative idea. Never copy competitor wording or claims. Follow Meta ad policy: no "Are you overweight?"-style personal attributes.
5. Call save_ad_pack so the ads show in my Ad research page.`,
  },
  {
    name: "member_messages",
    title: "Member messages",
    description: "Draft welcome, convert, save and win-back DMs for the members who need one.",
    say: `Draft my member messages in ${env.platformName}.`,
    steps: `1. Call list_leads three times: stage "trial" (welcome or convert), tag "skool-cancelling" (save), stage "lost" (win back). Look at no more than 20 people in total, newest first.
2. For each, call get_lead and write one DM: 1-3 short sentences, their first name, one question, warm and human. No hype, no invented results.
3. Call save_member_message for each one so it lands on their contact.
4. Remind me to send them by hand inside Skool. Never ask for or use a Skool login.`,
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
2. Ask me what should happen, to whom and when, unless I already said. If I'm not sure, look at my numbers (cancelling, trials, churned, new leads) and suggest the one that would plug my biggest leak.
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
];

// Earlier names, so chats that saved them still work.
const ALIASES: Record<string, string> = { monday_review: "monday_check_in", engagement_drop: "plan_this_weeks_unlock" };

export const playbookByName = (name: string) => PLAYBOOKS.find((p) => p.name === (ALIASES[name] ?? name));
