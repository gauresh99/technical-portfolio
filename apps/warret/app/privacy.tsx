import { LegalDocument } from '../src/components/LegalDocument';

const sections = [
  {
    title: 'What Warret is',
    body: [
      'Warret is a warranty and product document vault. You can save product details, warranty dates, receipts, invoices, manuals, images, reminders, groups, and related notes so they are easier to find later.',
      'Warret is not an insurer, warranty provider, repair provider, legal adviser, or manufacturer representative. Warranty coverage, repair decisions, document validity, claim outcomes, and expiry calculations may depend on third parties and the documents you provide.',
    ],
  },
  {
    title: 'Information we collect',
    body: [
      'We collect account information such as your name, email address, authentication provider, profile details, settings, and support preferences.',
      'We collect product information you add, including product names, brands, categories, purchase dates, warranty dates, serial numbers, sellers, reminders, notes, groups, and uploaded files such as receipts or warranty documents.',
      'When you use scan, import, or smart parsing features, we may process document text, metadata, image content, and extracted fields to organize your warranty information. You should avoid uploading documents that are unrelated to products or warranties.',
      'We may collect basic technical information such as device type, app version, error logs, security events, and usage signals needed to operate, secure, improve, and troubleshoot Warret.',
    ],
  },
  {
    title: 'How we use information',
    body: [
      'We use information to provide the app, save and sync your warranty vault, show reminders, render documents, manage groups, support account recovery, protect accounts, prevent abuse, improve reliability, and respond to user requests.',
      'We may use de-identified, aggregated, or privacy-preserving analytics to understand feature performance and improve parsing accuracy. We do not use your private documents to advertise third-party products to you.',
      'We may use your email for account verification, security notices, password reset messages, product updates, service notices, and support communications.',
    ],
  },
  {
    title: 'Storage and security',
    body: [
      'Uploaded warranty documents are stored in private cloud storage connected to your account. Product and group data are stored in our database with access controls intended to limit access to authorized users.',
      'We use reasonable administrative, technical, and organizational safeguards, including authentication, private storage buckets, row-level access policies, and limited-access design. No app, network, or storage system can be guaranteed to be perfectly secure.',
      'You are responsible for using a strong password, protecting your device, keeping your email account secure, reviewing shared group access, and only uploading documents you have the right to store.',
    ],
  },
  {
    title: 'Sharing and groups',
    body: [
      'If you join or create a group, certain product details, files, names, roles, activity events, and access choices may be visible to other group members according to the permissions you or the group host choose.',
      'When you share a product, document, export, or link, the recipient may be able to view, download, save, forward, or import the shared information. You should share only with people you trust.',
      'We may share information with service providers that help us operate Warret, such as authentication, storage, database, hosting, analytics, email, and support providers. They are permitted to process information only for service-related purposes.',
    ],
  },
  {
    title: 'Your choices',
    body: [
      'You can edit many profile and product details in the app. You can delete products, documents, groups, and account information where the app provides controls or by contacting support.',
      'You can change notification preferences, reminder settings, appearance settings, connected import sources, and export choices in Settings.',
      'Some records may be retained for a limited time if needed for security, backups, abuse prevention, legal compliance, dispute resolution, or legitimate business operations.',
    ],
  },
  {
    title: 'Legal rights',
    body: [
      'Depending on where you live, you may have rights to access, correct, delete, export, restrict, or object to certain processing of personal information. We will respond to eligible requests as required by applicable law.',
      'Warret does not sell your personal information. If our practices change in a way that requires additional consent or notice, we will update this policy and provide required controls.',
      'To make a privacy request, contact support from the app or email support@warret.app. We may need to verify your identity before acting on a request.',
    ],
  },
  {
    title: 'Changes',
    body: [
      'We may update this Privacy Policy as Warret evolves. The latest version will be posted in the app with the effective date. Material changes will be handled as required by law.',
      'Continuing to use Warret after an update means the updated policy applies to future use of the app.',
    ],
  },
];

export default function PrivacyPolicy() {
  return (
    <LegalDocument
      title="Privacy Policy"
      subtitle="A clear view of what Warret collects, why it is used, and how your vault is protected."
      updated="June 30, 2026"
      summary={[
        'Your warranty documents are private by default and tied to your account.',
        'We use your data to run the vault, reminders, groups, imports, support, and security.',
        'We do not sell your personal information.',
        'No system is perfectly secure, so Warret uses reasonable safeguards without promising absolute protection.',
      ]}
      sections={sections}
    />
  );
}
