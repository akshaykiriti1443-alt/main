import { env } from "@/lib/env";
import { LegalPage } from "../LegalPage";

export const metadata = { title: "Privacy policy" };

// Template text. Have a lawyer review it for your business and countries before launch.
export default function Privacy() {
  const name = env.platformName;
  return (
    <LegalPage title="Privacy policy" updated="October 2026">
      <p>{name} gives coaches and community owners landing pages, a lead list, email follow-up, an inbox for social messages and automations. This policy explains what we collect and why.</p>
      <h2>Who is responsible</h2>
      <p>For your account data, {name} is the controller. For the leads and messages you collect with {name}, you are the controller and we process that data for you.</p>
      <h2>What we collect</h2>
      <ul>
        <li>Account data: your name, email and password (stored as a one-way hash).</li>
        <li>Business data: your pages, emails, automations and settings.</li>
        <li>Lead data you collect: names, emails, phone numbers and form answers.</li>
        <li>Messages from channels you connect: Facebook Messenger, Instagram and WhatsApp messages, and SMS.</li>
        <li>Usage data: page views, sign-ups and email sends.</li>
      </ul>
      <h2>How we use Meta data</h2>
      <p>When you connect a Facebook Page, Instagram account or WhatsApp number, we receive the messages people send to that account so you can read and answer them in your inbox. We use Page access to publish posts you schedule. We store access tokens encrypted. We never sell this data and we never use it to train AI models.</p>
      <h2>AI features</h2>
      <p>When you use AI features, we send the needed text (for example your business details or a conversation) to our AI provider, Anthropic, to generate a result. Anthropic does not use this data to train its models.</p>
      <h2>Service providers</h2>
      <p>We use hosting, database, email delivery, payment and messaging providers to run the service. They only process data to provide their service to us.</p>
      <h2>Your choices</h2>
      <p>You can export or delete your data, disconnect channels at any time in Settings, and ask us to delete your account. See our data deletion page for steps.</p>
      <h2>Contact</h2>
      <p>Email us at {env.emailFrom} with any privacy question.</p>
    </LegalPage>
  );
}
