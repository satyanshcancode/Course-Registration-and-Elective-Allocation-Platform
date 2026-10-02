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
        kicker="Allocademy"
        description={
          isPrivacy
            ? 'What this service stores about you, why it stores it, and who can see it.'
            : 'What you can expect from course registration, and what it expects of you.'
        }
        sticky={false}
      />

      <div className={styles.body}>
        <p className={styles.template}>
          <strong>This is a template.</strong> It describes what the software actually does. Before
          anyone relies on it, the university must add its own data controller, how long it keeps
          registration records, which law applies and how to raise a complaint.
        </p>

        {isPrivacy ? <PrivacyContent /> : <TermsContent />}
      </div>
    </div>
  );
}

function PrivacyContent() {
  return (
    <>
      <section aria-labelledby="what">
        <h2 id="what">What is stored</h2>
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
      </section>

      <section aria-labelledby="why">
        <h2 id="why">Why it is stored</h2>
        <p>
          To decide, and to be able to explain, who gets a seat. An allocation run stores the exact
          input it used so the result can be re-checked later. That is what makes it possible to
          answer &ldquo;why did I not get in?&rdquo; with a real reason rather than an apology.
        </p>
      </section>

      <section aria-labelledby="who">
        <h2 id="who">Who can see it</h2>
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
      </section>

      <section aria-labelledby="kept">
        <h2 id="kept">How long it is kept</h2>
        <p>
          Nothing is deleted. An account is deactivated rather than removed and a course is retired
          rather than deleted, because submissions, enrolments and past allocation results all refer
          to them, and deleting one would make a past run impossible to verify.
        </p>
        <p>
          The university should state here how long it retains registration records, and what
          happens to them when a student graduates or leaves.
        </p>
      </section>

      <section aria-labelledby="email">
        <h2 id="email">E-mail</h2>
        <p>
          The service sends you e-mail for two reasons only: to invite you to set up your account,
          and to let you reset a forgotten password. Those links work once and expire. There is no
          marketing e-mail.
        </p>
      </section>

      <section aria-labelledby="cookies">
        <h2 id="cookies">Cookies</h2>
        <p>
          One cookie, which keeps you signed in for eight hours. It cannot be read by JavaScript and
          is not sent to any other site. There is no analytics, advertising or third-party tracking
          of any kind.
        </p>
      </section>
    </>
  );
}

function TermsContent() {
  return (
    <>
      <section aria-labelledby="account">
        <h2 id="account">Your account</h2>
        <p>
          The registrar creates your account; you cannot register yourself. Your sign-in is yours
          alone. Do not share your password, and tell the registrar if you think someone else has
          used your account.
        </p>
      </section>

      <section aria-labelledby="fair">
        <h2 id="fair">How a seat is decided</h2>
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
      </section>

      <section aria-labelledby="expect">
        <h2 id="expect">What is expected of you</h2>
        <p>
          Rank only courses you intend to take. Automated or repeated submissions are rate limited,
          and attempting to work around that is a misuse of the service. If your academic record is
          wrong, ask the registrar to correct it rather than working around it.
        </p>
      </section>

      <section aria-labelledby="availability">
        <h2 id="availability">Availability</h2>
        <p>
          The service is provided as it is, for the registration period the university runs it for.
          Seat counts shown while a window is open are live but can change between the moment you
          read them and the moment you submit, which is why a submission is never a reservation.
        </p>
      </section>

      <section aria-labelledby="changes">
        <h2 id="changes">Changes</h2>
        <p>
          The university should state here how it will tell students about changes to these terms,
          and who to contact with a question or a complaint about a registration decision.
        </p>
      </section>
    </>
  );
}
