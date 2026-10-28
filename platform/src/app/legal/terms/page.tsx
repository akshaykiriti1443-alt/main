import { env } from "@/lib/env";
import { LegalPage } from "../LegalPage";

export const metadata = { title: "Terms" };

// Template text. Adjust to your offer and have it reviewed before launch.
export default function Terms() {
  return (
    <LegalPage title="Terms of service" updated="October 2026">
      <h2>Your account</h2>
      <p>Member accounts are included with an active membership in our Skool community. Access renews each month with that month's member code. When membership ends, your account stays available for a 7-day grace period. After that it pauses: your pages go offline and automations stop until access returns.</p>
      <h2>Your funnel account</h2>
      <p>Your pages, emails and automations run on {env.platformName}. They are not exportable as files. You can request a copy of the leads you collected.</p>
      <h2>Paid plans and wallet</h2>
      <p>Growth and Agency plans bill monthly. Pay-as-you-go usage (AI, emails over your allowance, SMS, WhatsApp, phone numbers) comes out of your prepaid wallet. Wallet funds are non-refundable except where the law requires.</p>
      <h2>Acceptable use</h2>
      <p>Only email and message people who gave you permission. Follow anti-spam laws and Meta, WhatsApp and carrier rules. We can suspend accounts that send spam or break these rules.</p>
      <h2>Contact</h2>
      <p>{env.emailFrom}</p>
    </LegalPage>
  );
}
