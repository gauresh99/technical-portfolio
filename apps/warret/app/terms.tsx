import { LegalDocument } from '../src/components/LegalDocument';

const sections = [
  {
    title: 'Using Warret',
    body: [
      'These Terms govern your access to and use of Warret. By creating an account, signing in, uploading files, joining groups, or using the app, you agree to these Terms.',
      'Warret helps you organize warranty information. It does not create, extend, validate, insure, guarantee, or replace any manufacturer, seller, insurer, statutory, or third-party warranty.',
    ],
  },
  {
    title: 'Your account',
    body: [
      'You are responsible for the accuracy of information you add, the security of your login credentials, and all activity under your account except where caused by Warret in violation of applicable law.',
      'You must use Warret only for lawful purposes and only upload documents you have the right to store, process, share, or export.',
      'We may suspend or restrict access if we reasonably believe an account is being used for abuse, fraud, security risk, unlawful activity, or violation of these Terms.',
    ],
  },
  {
    title: 'Your content',
    body: [
      'You keep ownership of product details, documents, images, notes, and other content you add to Warret. You grant Warret permission to host, store, process, display, transmit, back up, and format that content as needed to provide and improve the app.',
      'You are responsible for reviewing extracted fields, warranty dates, reminders, coverage notes, and imported data before relying on them. Automated parsing can be inaccurate or incomplete.',
      'If you share content through groups, links, exports, or device sharing tools, you are responsible for deciding who receives it and whether the content is appropriate to share.',
    ],
  },
  {
    title: 'Documents, reminders, and warranty claims',
    body: [
      'Warret may show warranty dates, reminder dates, document previews, coverage summaries, and claim steps. These are organizational tools only and may be based on user input, extracted text, mock development data, or third-party information.',
      'You should verify warranty terms directly with the seller, manufacturer, insurer, service provider, or official document before making a claim or purchase decision.',
      'Warret is not responsible for missed claims, denied repairs, expired warranties, inaccurate documents, lost manufacturer coverage, third-party policy changes, or decisions made by warranty providers.',
    ],
  },
  {
    title: 'Security and availability',
    body: [
      'We work to operate Warret with reasonable care and security practices, but no service is guaranteed to be uninterrupted, error-free, loss-free, or immune from unauthorized access.',
      'You should keep separate copies of important invoices, receipts, warranty cards, identity documents, and other records. Warret is a convenience layer, not your only recordkeeping system.',
      'We may modify, pause, limit, or discontinue features when needed for maintenance, security, legal compliance, provider changes, or product development.',
    ],
  },
  {
    title: 'Subscriptions and paid features',
    body: [
      'Some features may be offered as paid plans, trials, or add-ons. Pricing, limits, availability, storage, export features, and plan benefits may change as the product develops.',
      'Unless a separate refund policy or applicable law says otherwise, fees are charged for access to the service period purchased and may not be refundable once access is provided.',
    ],
  },
  {
    title: 'Limits of responsibility',
    body: [
      'To the fullest extent permitted by law, Warret is provided as is and as available. We disclaim implied warranties of merchantability, fitness for a particular purpose, non-infringement, and accuracy.',
      'To the fullest extent permitted by law, Warret and its team will not be liable for indirect, incidental, special, consequential, exemplary, or punitive damages, or for lost profits, lost data, lost warranties, lost opportunities, or substitute services.',
      'Where liability cannot be excluded, our total liability will be limited to the greater of the amount you paid to Warret for the service in the three months before the event giving rise to the claim or USD 50, unless applicable law requires more.',
    ],
  },
  {
    title: 'Disputes',
    body: [
      'If something goes wrong, contact us first so we can try to resolve it quickly and informally. Most issues can be fixed faster through support than through a formal dispute.',
      'Any dispute will be handled individually, not as a class or representative action, to the extent permitted by applicable law. Some jurisdictions do not allow certain dispute limitations, so parts of this section may not apply to you.',
      'These Terms are intended to be enforced to the maximum extent permitted by law. If one part is unenforceable, the remaining parts continue to apply.',
    ],
  },
  {
    title: 'Changes',
    body: [
      'We may update these Terms as Warret evolves. If a change is material, we will provide notice in the app or by another reasonable method.',
      'Your continued use of Warret after updated Terms take effect means you accept the updated Terms for future use of the service.',
    ],
  },
];

export default function TermsOfService() {
  return (
    <LegalDocument
      title="Terms of Service"
      subtitle="The rules for using Warret, written to be direct, fair, and protective of the service."
      updated="June 30, 2026"
      summary={[
        'Warret organizes warranty data; it does not guarantee warranty outcomes.',
        'You control what you upload and share, and you should keep backups of important documents.',
        'Automated dates and document parsing must be reviewed before you rely on them.',
        'Warret limits liability to the fullest extent permitted by law.',
      ]}
      sections={sections}
    />
  );
}
