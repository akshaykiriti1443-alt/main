import { env } from "@/lib/env";
import { LegalPage } from "../LegalPage";

export const metadata = { title: "Data deletion" };

export default function DataDeletion() {
  return (
    <LegalPage title="Delete your data" updated="October 2026">
      <h2>Remove a connected Facebook, Instagram or WhatsApp account</h2>
      <ol>
        <li>Open Settings in your {env.platformName} account.</li>
        <li>Under Inbox channels, click Disconnect next to the account. We delete its access token right away.</li>
        <li>You can also remove the app in Facebook: Settings &amp; privacy › Settings › Business integrations › Remove.</li>
      </ol>
      <h2>Delete your whole account and data</h2>
      <p>Email {env.emailFrom} from the email on your account with the subject "Delete my data". We delete your account, pages, leads, messages and tokens within 30 days and confirm by email.</p>
      <h2>If you are a lead or customer of one of our users</h2>
      <p>Contact the business that collected your details. You can also email us and we will pass your request to them.</p>
    </LegalPage>
  );
}
