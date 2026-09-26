import { FlaskConical } from 'lucide-react';
import { Icon } from '../../components/Icon';
import styles from './DemoAccountHints.module.css';

interface DemoAccount {
  label: string;
  email: string;
  password: string;
  situation: string;
}

/**
 * The seed's accounts, kept in step with
 * backend/src/database/seeds/demoAccounts.ts. Published credentials for a
 * seeded database — never reused anywhere real.
 */
const ACCOUNTS: readonly DemoAccount[] = [
  {
    label: 'Administrator',
    email: 'admin@university.edu',
    password: 'Admin@123',
    situation: 'The registrar: windows, allocation, students and the catalogue',
  },
  {
    label: 'Student',
    email: 'aarav.sharma@university.edu',
    password: 'Student@123',
    situation: 'Eligible for Artificial Intelligence, no submission yet',
  },
  {
    label: 'Student',
    email: 'rohan.verma@university.edu',
    password: 'Student@123',
    situation: 'Final year, graduating this term: the highest priority',
  },
];

/**
 * Demo credentials on the sign-in page.
 *
 * Rendered ONLY where the caller has checked `import.meta.env.DEV`: in a
 * production build the branch is the literal `false`, so this component and its
 * credentials are dropped by the bundler rather than shipped and hidden. A real
 * deployment starts with an empty database and its first administrator from
 * `npm run admin:create`, so there is nothing here it could even be true about.
 */
export function DemoAccountHints() {
  return (
    <section className={styles.hints} aria-labelledby="demo-accounts">
      <h2 id="demo-accounts" className={styles.title}>
        <Icon icon={FlaskConical} />
        Demo accounts
      </h2>
      <p className={styles.note}>
        Development build only, for the seeded database. Run{' '}
        <code className={styles.code}>npm run demo:reset -- --stage=open</code> to load it.
      </p>
      <ul className={styles.list}>
        {ACCOUNTS.map((account) => (
          <li key={account.email} className={styles.item}>
            <p className={styles.label}>{account.label}</p>
            <p className={styles.credentials}>
              <code className={styles.code}>{account.email}</code>
              <span aria-hidden="true"> · </span>
              <code className={styles.code}>{account.password}</code>
            </p>
            <p className={styles.situation}>{account.situation}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
