import {
  Activity,
  Archive,
  Cookie,
  Database,
  Eye,
  FileText,
  Info,
  ListChecks,
  Mail,
  Scale,
  Target,
  UserRound,
  type LucideIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { Card } from '../components/Card';
import { Icon } from '../components/Icon';
import { PageHeader } from '../components/PageHeader';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import styles from './PolicyPage.module.css';

export interface PolicyPageProps {
  kind: 'privacy' | 'terms';
}

/**
 * Privacy and Terms, in plain English.
 *
 * Both are a **template**: they describe honestly what this software does with
 * a student's data, which is the part an engineer can state. Who the data
 * controller is, how long the university keeps records and which law applies
 * are the university's to fill in, and the page says so rather than inventing
 * an answer that would read as legal advice.
 *
 * One component for both because they share a shape; the content is the only
 * difference, and keeping it here means the wording lives in one file.
 */
export function PolicyPage({ kind }: PolicyPageProps) {
  const isPrivacy = kind === 'privacy';
  useDocumentTitle(isPrivacy ? 'Privacy' : 'Terms of use');

  return (
    <div className={styles.page}>
      <PageHeader
        title={isPrivacy ? 'Privacy' : 'Terms of use'}
        description={
          isPrivacy
            ? 'What this service stores about you, why it stores it, and who can see it.'
            : 'What you can expect from course registration, and what it expects of you.'
        }
        sticky={false}
      />

      <div className={styles.body}>
        <p className={styles.template}>
          <Icon icon={Info} className={styles.templateIcon} />
          <span>
            <strong>This is a template.</strong> It describes what the software actually does.
            Before anyone relies on it, the university must add its own data controller, how long it
            keeps registration records, which law applies and how to raise a complaint.
          </span>
        </p>

        {isPrivacy ? <PrivacyContent /> : <TermsContent />}
      </div>
    </div>
  );
}

function PrivacyContent() {
  return (
    <>
      <PolicySection title="What is stored" icon={Database}>
        <p>
          Your account holds your name, university e-mail address and roll number, and a one-way
          hash of your password. The password itself is never stored and cannot be recovered from
          the hash.
        </p>
        <p>
          Your academic record holds your programme, semester, credits completed, expected
          graduation term and the courses you have passed. The registrar maintains it. You cannot
          edit it yourself, because it is what decides whether you are eligible for a course and
          where you sit in the allocation.
        </p>
        <p>
          Your registration activity holds the courses you ranked and in what order, when you
          submitted, the seat or waitlist place you were given, the reasoning behind it, and every
          later change you made during add/drop.
        </p>
      </PolicySection>

      <PolicySection title="Why it is stored" icon={Target}>
        <p>
          To decide, and to be able to explain, who gets a seat. An allocation run stores the exact
          input it used so the result can be re-checked later. That is what makes it possible to
          answer &ldquo;why did I not get in?&rdquo; with a real reason rather than an apology.
        </p>
      </PolicySection>

      <PolicySection title="Who can see it" icon={Eye}>
        <p>
          You can see all of your own record and your own results. Other students cannot see any
          part of it. Results pages are built from your own rows only, and never name another
          student.
        </p>
        <p>
          Registrar staff can see every student&rsquo;s record, because maintaining it is their job.
          Their actions are written to an audit log: who did what, when, and what the value was
          before and after.
        </p>
      </PolicySection>

      <PolicySection title="How long it is kept" icon={Archive}>
        <p>
          Nothing is deleted. An account is deactivated rather than removed and a course is retired
          rather than deleted, because submissions, enrolments and past allocation results all refer
          to them, and deleting one would make a past run impossible to verify.
        </p>
        <p>
          The university should state here how long it retains registration records, and what
          happens to them when a student graduates or leaves.
        </p>
      </PolicySection>

      <PolicySection title="E-mail" icon={Mail}>
        <p>
          The service sends you e-mail for two reasons only: to invite you to set up your account,
          and to let you reset a forgotten password. Those links work once and expire. There is no
          marketing e-mail.
        </p>
      </PolicySection>

      <PolicySection title="Cookies" icon={Cookie}>
        <p>
          One cookie, which keeps you signed in for eight hours. It cannot be read by JavaScript and
          is not sent to any other site. There is no analytics, advertising or third-party tracking
          of any kind.
        </p>
      </PolicySection>
    </>
  );
}

function TermsContent() {
  return (
    <>
      <PolicySection title="Your account" icon={UserRound}>
        <p>
          The registrar creates your account; you cannot register yourself. Your sign-in is yours
          alone. Do not share your password, and tell the registrar if you think someone else has
          used your account.
        </p>
      </PolicySection>

      <PolicySection title="How a seat is decided" icon={Scale}>
        <p>
          Submitting early gives you no advantage. Every submitted cart is collected first, and
          seats are decided afterwards, once, for everyone at the same time.
        </p>
        <p>
          The rules are fixed before registration opens. The method, the weights, the priority
          points, the tie-break seed and the set of offered courses are frozen the moment the window
          opens and cannot be changed afterwards.
        </p>
        <p>
          You will be told the reasoning behind your own result: your score, how it was made up, and
          what the last seat went for.
        </p>
      </PolicySection>

      <PolicySection title="What is expected of you" icon={ListChecks}>
        <p>
          Rank only courses you intend to take. Automated or repeated submissions are rate limited,
          and attempting to work around that is a misuse of the service. If your academic record is
          wrong, ask the registrar to correct it rather than working around it.
        </p>
      </PolicySection>

      <PolicySection title="Availability" icon={Activity}>
        <p>
          The service is provided as it is, for the registration period the university runs it for.
          Seat counts shown while a window is open are live but can change between the moment you
          read them and the moment you submit, which is why a submission is never a reservation.
        </p>
      </PolicySection>

      <PolicySection title="Changes" icon={FileText}>
        <p>
          The university should state here how it will tell students about changes to these terms,
          and who to contact with a question or a complaint about a registration decision.
        </p>
      </PolicySection>
    </>
  );
}

/** One topic of a policy, in the same card the rest of the product uses. */
function PolicySection({
  title,
  icon,
  children,
}: {
  title: string;
  icon: LucideIcon;
  children: ReactNode;
}) {
  return (
    <Card title={title} titleIcon={icon} headingLevel={2}>
      <div className={styles.prose}>{children}</div>
    </Card>
  );
}
