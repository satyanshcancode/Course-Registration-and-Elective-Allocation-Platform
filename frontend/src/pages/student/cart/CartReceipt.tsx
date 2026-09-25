import type { PreferenceCart } from '@course-reg/shared';
import { CircleCheck } from 'lucide-react';
import { LinkButton } from '../../../components/Button';
import { CourseCode } from '../../../components/CourseCode';
import { Icon } from '../../../components/Icon';
import { formatDateTime } from '../../../utils/formatDate';
import styles from './CartPage.module.css';

export interface CartReceiptProps {
  /** A cart whose status is SUBMITTED, so it carries the receipt fields. */
  cart: PreferenceCart;
}

/**
 * What a student sees once their preferences are in: the reference, when the
 * server recorded them, their place in the arrival order, and the list exactly
 * as it was submitted. Nothing here is editable — the submission is immutable,
 * in the database as well as on screen.
 */
export function CartReceipt({ cart }: CartReceiptProps) {
  return (
    <article className={styles.receipt} aria-labelledby="receipt-heading">
      <p className={styles.receiptMark}>
        <Icon icon={CircleCheck} />
        <span>Submitted</span>
      </p>
      <h2 id="receipt-heading" className={styles.receiptTitle}>
        Your preferences are recorded
      </h2>
      <p className={styles.receiptLead}>
        Allocation runs once registration closes. You’ll get a notification with your result, and
        nothing more is needed from you now.
      </p>

      <dl className={styles.receiptFacts}>
        <div>
          <dt>Reference</dt>
          <dd className={styles.reference}>{cart.reference}</dd>
        </div>
        <div>
          <dt>Submitted</dt>
          <dd>{cart.submittedAt ? formatDateTime(cart.submittedAt) : '—'}</dd>
        </div>
        <div>
          <dt>Arrival number</dt>
          <dd>{cart.sequence ?? '—'}</dd>
        </div>
        <div>
          <dt>Total credits</dt>
          <dd>{cart.totalCredits}</dd>
        </div>
      </dl>

      <h3 className={styles.receiptSubheading}>Your ranked choices</h3>
      <ol className={styles.receiptList}>
        {cart.items.map((item) => (
          <li key={item.code}>
            <CourseCode code={item.code} size="sm" />
            <span className={styles.receiptName}>{item.name}</span>
            <span className={styles.receiptCredits}>{item.credits} credits</span>
          </li>
        ))}
      </ol>

      <div className={styles.receiptActions}>
        <LinkButton to="/student/results" variant="primary">
          View results
        </LinkButton>
        <LinkButton to="/student/courses" variant="secondary">
          Back to the catalogue
        </LinkButton>
      </div>
    </article>
  );
}
