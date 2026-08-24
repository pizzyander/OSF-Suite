import { useEffect, useState } from "react";
import LegalLayout from "../components/LegalLayout";
import { api } from "../api";

export default function TermsOfUse() {
  const [meta, setMeta] = useState(null);

  useEffect(() => {
    api.getLegalMeta().then(setMeta).catch(() => {});
    api.logLegalView("terms").catch(() => {});
  }, []);

  const c = meta?.contact;
  const email = c?.email || "akinfeadesanmit@gmail.com";
  const name = c?.name || "Akinfe Adesanmi";
  const phone = c?.phone || "08120697429";
  const website = c?.website || "https://www.hygini.app";

  return (
    <LegalLayout
      title="Terms of Use"
      updated={meta?.terms?.updated_at || "September 5, 2026"}
      effective={meta?.terms?.effective_at || "September 5, 2026"}
      otherDocHref="/privacy"
      otherDocLabel="View Privacy Policy"
    >
      <p>
        These Terms of Use (&ldquo;Terms&rdquo;) are a legal agreement between you (an individual, or the company
        you represent, &ldquo;Customer,&rdquo; &ldquo;you,&rdquo; or &ldquo;your&rdquo;) and OSF-Suite
        (&ldquo;OSF-Suite,&rdquo; &ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;) governing your access to
        and use of our website (www.hygini.app) and our AI-powered sales coaching and revenue intelligence
        platform (the &ldquo;Service&rdquo;).
      </p>

      <div className="osf-legal-notice">
        <strong>Note:</strong> This is a starting draft written for OSF-Suite&rsquo;s product and business model.
        Have Nigerian counsel review it — particularly the liability, warranty, and consent-related sections —
        before treating it as final.
      </div>

      <p>
        <strong>
          By creating an account or using the Service, you agree to these Terms. If you do not agree, do not use
          the Service.
        </strong>
      </p>

      <h2>1. What OSF-Suite does</h2>
      <p>
        OSF-Suite provides AI-powered live call transcription, in-call coaching nudges, and post-call coaching
        reports for sales teams, grounded in materials (pricing sheets, pitch decks, product docs) that you
        upload. The Service is provided &ldquo;as is&rdquo; on a subscription basis as described in Section 5.
      </p>

      <h2>2. Eligibility and accounts</h2>
      <ul>
        <li>You must be at least 18 years old and able to form a binding contract to use the Service.</li>
        <li>
          You are responsible for the accuracy of the information you provide when creating an account, and for
          keeping your login credentials confidential.
        </li>
        <li>
          You are responsible for all activity that occurs under your account, including actions taken by team
          members you invite.
        </li>
        <li>
          Team/admin accounts: the account administrator who sets up a Customer&rsquo;s organization is
          responsible for managing user access and ensuring each invited team member agrees to these Terms.
        </li>
      </ul>

      <h2>3. Your responsibility for call recording and consent</h2>
      <p>
        <strong>This is the most important section of these Terms.</strong> OSF-Suite is a tool. Whether and how
        you use it to record a live conversation is entirely your decision and your legal responsibility.
      </p>
      <p>
        By recording, uploading, or processing any call through the Service, you represent and warrant that:
      </p>
      <ol>
        <li>
          You have obtained all consents required by law from every participant on the call before recording
          begins, including compliance with &ldquo;two-party&rdquo; or &ldquo;all-party&rdquo; consent
          requirements in jurisdictions that require it.
        </li>
        <li>
          You will provide clear, adequate notice to call participants that the call is being recorded and
          analyzed using AI.
        </li>
        <li>
          You have the right to upload any pricing materials, pitch decks, or product documentation you provide
          to OSF-Suite, and doing so does not violate any third party&rsquo;s rights.
        </li>
        <li>
          You will not use the Service to record calls involving categories of information you are not legally
          permitted to record or store (e.g., certain healthcare, financial, or regulated communications),
          unless you have independently confirmed you may lawfully do so.
        </li>
      </ol>
      <p>
        <strong>
          OSF-Suite is not responsible for your compliance with call-recording, wiretap, or data protection laws.
        </strong>{" "}
        If a third party brings a claim against OSF-Suite arising from your failure to obtain proper consent, you
        agree to indemnify us under Section 10.
      </p>

      <h2>4. Acceptable use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>Use the Service to record or process calls without required consent (Section 3)</li>
        <li>
          Reverse-engineer, decompile, or attempt to extract the underlying models or source code of the Service
        </li>
        <li>Use the Service to build a competing product</li>
        <li>
          Upload malicious code, or attempt to gain unauthorized access to other Customers&rsquo; data or our
          systems
        </li>
        <li>
          Use the Service in violation of any applicable law, including data protection, consumer protection, or
          export control laws
        </li>
        <li>Resell or white-label the Service without our prior written agreement</li>
      </ul>
      <p>We may suspend or terminate accounts that violate this section, with or without notice depending on severity.</p>

      <h2>5. Subscriptions, billing, and cancellation</h2>
      <ul>
        <li>
          <strong>Plans:</strong> OSF-Suite is offered on the plans and pricing published at www.hygini.app,
          which may include a free trial period. Your card is saved but not charged until the trial ends, if
          applicable.
        </li>
        <li>
          <strong>Billing:</strong> Paid plans are billed in advance on a recurring basis (biweekly, monthly, or
          annual, depending on the plan you select) and automatically renew unless canceled before the next
          billing date.
        </li>
        <li>
          <strong>Cancellation:</strong> You may cancel at any time from your account settings or by emailing us.
          Cancellation stops future billing; it does not retroactively refund amounts already charged.
        </li>
        <li>
          <strong>No refunds:</strong> All fees are non-refundable, including partial billing periods. If you
          cancel mid-cycle, you retain access to the Service through the end of the period you already paid for,
          and will not be billed again.
        </li>
        <li>
          <strong>Price changes:</strong> We may change pricing for future billing cycles with reasonable advance
          notice. Continued use after a price change takes effect constitutes acceptance of the new price.
        </li>
        <li>
          <strong>Team plans:</strong> Team plans billed per seat require the minimum seat count published at the
          time of purchase; removing seats below that minimum may require moving to a different plan.
        </li>
      </ul>

      <h2>6. Ownership and license</h2>
      <ul>
        <li>
          <strong>Your content:</strong> You (or your organization) retain ownership of the call recordings,
          transcripts, uploaded materials, and any data you put into the Service (&ldquo;Customer
          Content&rdquo;). You grant OSF-Suite a limited license to process, store, and analyze Customer Content
          solely to provide and improve the Service to you, as described in our Privacy Policy.
        </li>
        <li>
          <strong>Our platform:</strong> OSF-Suite retains all rights, title, and interest in the Service itself
          — the software, models, design, and underlying technology. Nothing in these Terms transfers ownership
          of our platform to you.
        </li>
        <li>
          <strong>Derived insights:</strong> Coaching reports, deal health scores, and other outputs generated by
          the Service from your Customer Content belong to you, subject to the underlying rights of any
          third-party AI providers used to generate them (see our Privacy Policy for subprocessor details).
        </li>
        <li>
          <strong>Feedback:</strong> If you send us suggestions or feedback about the Service, you agree we may
          use it without any obligation to you.
        </li>
      </ul>

      <h2>7. AI-generated content — accuracy disclaimer</h2>
      <p>
        OSF-Suite uses AI, including third-party AI models, to transcribe calls and generate coaching insights,
        scores, and suggested scripts. <strong>AI output can be inaccurate, incomplete, or wrong.</strong> Deal
        health scores, objection-handling grades, and suggested responses are decision-support tools, not
        guarantees of outcome. You are responsible for using your own judgment before relying on AI-generated
        coaching in real sales conversations or business decisions.
      </p>

      <h2>8. Third-party services</h2>
      <p>
        The Service may integrate with third-party tools (e.g., video conferencing platforms, CRMs, AI
        providers). We are not responsible for the availability, accuracy, or practices of third-party services,
        and your use of them is governed by their own terms.
      </p>

      <h2>9. Disclaimers</h2>
      <p>
        To the maximum extent permitted by law, the Service is provided <strong>&ldquo;as is&rdquo; and
        &ldquo;as available,&rdquo;</strong> without warranties of any kind, whether express, implied, or
        statutory, including implied warranties of merchantability, fitness for a particular purpose, and
        non-infringement. We do not warrant that the Service will be uninterrupted, error-free, or that AI
        outputs will be accurate.
      </p>

      <h2>10. Limitation of liability and indemnification</h2>
      <ul>
        <li>
          <strong>Limitation of liability:</strong> To the maximum extent permitted by law, OSF-Suite will not be
          liable for any indirect, incidental, special, consequential, or punitive damages, or for lost profits
          or revenue, arising from your use of the Service. Our total liability for any claim arising from these
          Terms or the Service will not exceed the amount you paid us in the 3 months preceding the claim.
        </li>
        <li>
          <strong>Indemnification:</strong> You agree to indemnify and hold OSF-Suite harmless from any claims,
          damages, or expenses (including legal fees) arising from: (a) your failure to obtain required consent
          to record a call (Section 3); (b) your violation of these Terms; or (c) your violation of any law or
          third-party right in connection with your use of the Service.
        </li>
      </ul>

      <h2>11. Termination</h2>
      <ul>
        <li>You may terminate your account at any time as described in Section 5.</li>
        <li>
          We may suspend or terminate your access if you materially breach these Terms, including the consent
          obligations in Section 3, non-payment, or misuse of the Service.
        </li>
        <li>
          Upon termination, your right to use the Service ends immediately. Data retention after termination is
          governed by our Privacy Policy.
        </li>
      </ul>

      <h2>12. Changes to these Terms</h2>
      <p>
        We may update these Terms from time to time. If changes are material, we will notify account
        administrators by email or in-app notice before they take effect. Continued use of the Service after
        changes take effect constitutes acceptance of the updated Terms.
      </p>

      <h2>13. Governing law and disputes</h2>
      <p>
        These Terms are governed by the laws of the Federal Republic of Nigeria, without regard to conflict-of-law
        principles. Any disputes arising from these Terms or the Service will be subject to the exclusive
        jurisdiction of the courts of Lagos State, Nigeria, unless otherwise required by mandatory local law
        applicable to a specific Customer.
      </p>

      <h2>14. Contact us</h2>
      <p>
        <strong>OSF-Suite</strong>
        <br />
        {name}
        <br />
        Email: <a href={`mailto:${email}`}>{email}</a>
        <br />
        Phone: {phone}
        <br />
        Website: <a href={website}>{website.replace("https://", "")}</a>
      </p>
    </LegalLayout>
  );
}