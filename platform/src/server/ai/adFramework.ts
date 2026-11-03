// The ad framework the course teaches, used word for word by every ad tool in the app, so the
// course and the software reinforce each other.
//   Hook · Turn · Door — every ad is a tiny house: the Hook stops the thumb (first line / first
//   2 seconds), the Turn is the "wait, what?" line, the Door is one way in (your Skool link).
//   The 3-Pack — launch three angles at once: Pain, Dream, Lesson. Proof unlocks after a member win.

export const AD_ANGLES = ["pain", "dream", "lesson", "proof"] as const;
export type AdAngle = (typeof AD_ANGLES)[number];

export const ANGLE_LABEL: Record<AdAngle, string> = { pain: "Pain ad", dream: "Dream ad", lesson: "Lesson ad", proof: "Proof ad" };
export const ANGLE_HINT: Record<AdAngle, string> = {
  pain: "Their problem, in their words.",
  dream: "The after, made vivid.",
  lesson: "Teach one bite from your classroom. The rest is inside.",
  proof: "A real member win. Unlocks after your first one.",
};

export const AD_FRAMEWORK_RULES = `Ad structure (the course's framework, use these exact words):
- Write the 3-Pack: one Pain ad (their problem in their words), one Dream ad (the after, made vivid) and one Lesson ad (teach one useful bite from the classroom, then "the rest is inside"). Only write a Proof ad if real member results are given.
- Every ad has three parts. Hook: the first line (or first 2 seconds of video) that stops the thumb. Turn: the "wait, what?" line that flips how they see the problem. Door: one clear way in, to the Skool About page. One door only, no "follow me" or "DM me".
- Ads send people to the Skool About page (the owner's Skool link), not to a social profile.`;

export function adText(a: { hook?: string; turn?: string; door?: string; primaryText?: string }): string {
  return a.primaryText ?? [a.hook, a.turn, a.door].filter(Boolean).join("\n\n");
}
