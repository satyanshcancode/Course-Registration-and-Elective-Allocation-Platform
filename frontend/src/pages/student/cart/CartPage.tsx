import { MAX_PREFERENCES, type CartItem, type CartProblem } from '@course-reg/shared';
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Lock,
  Send,
  ShoppingCart,
  Trash2,
} from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button, LinkButton } from '../../../components/Button';
import { ConfirmDialog } from '../../../components/ConfirmDialog';
import { EmptyState } from '../../../components/EmptyState';
import { ErrorMessage } from '../../../components/ErrorMessage';
import { Icon } from '../../../components/Icon';
import { LiveSeatsIndicator } from '../../../components/LiveSeatsIndicator';
import { PageHeader } from '../../../components/PageHeader';
import { Notice } from '../../../components/Notice';
import { Skeleton } from '../../../components/Skeleton';
import { Stepper } from '../../../components/Stepper';
import { useToast } from '../../../components/Toast';
import { useBeforeUnload } from '../../../hooks/useBeforeUnload';
import { useCartOrThrow } from '../../../hooks/useCart';
import { useDocumentTitle } from '../../../hooks/useDocumentTitle';
import { useLiveSeats } from '../../../hooks/useLiveSeats';
import { describeMove, moveItem } from '../../../utils/cartActions';
import { seatsNewerThan, withLiveSeats } from '../../../utils/liveSeats';
import { CartList } from './CartList';
import styles from './CartPage.module.css';
import { generalProblems, needsReload, problemsByCode } from './cartProblems';
import { CartReceipt } from './CartReceipt';
import { CartWindowCard } from './CartWindowCard';

/** The three steps of submitting, in order. */
const CART_STEPS = ['Select', 'Review', 'Submit'] as const;
type CartStep = (typeof CART_STEPS)[number];

/** Joined codes: the identity of one ordering, cheap to compare. */
const keyOf = (codes: readonly string[]) => codes.join('|');

export function CartPage() {
  useDocumentTitle('My cart');
  const cart = useCartOrThrow();
  const toast = useToast();
  const live = useLiveSeats({ enabled: cart.cart !== null });

  // The working order, remembered against the saved cart it came from, so a
  // cart the server has since replaced simply stops being current — no effect
  // has to reach in and reset it.
  const [draft, setDraft] = useState<{ base: string; codes: string[] } | null>(null);
  const [problems, setProblems] = useState<readonly CartProblem[]>([]);
  const [announcement, setAnnouncement] = useState('');
  const [reviewing, setReviewing] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitKey, setSubmitKey] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const listRef = useRef<HTMLTableSectionElement>(null);
  const focusCode = useRef<string | null>(null);

  const saved = cart.cart;
  const savedKey = keyOf(cart.codes);
  const current = draft?.base === savedKey ? draft.codes : cart.codes;
  const dirty = draft?.base === savedKey && keyOf(draft.codes) !== savedKey;
  const currentKey = keyOf(current);

  useBeforeUnload(dirty);

  // Keep the keyboard where the student left it: after a move, focus the same
  // course's Priority select, which is where they just were.
  useEffect(() => {
    const code = focusCode.current;
    focusCode.current = null;
    if (!code) {
      return;
    }
    const row = listRef.current?.querySelector<HTMLElement>(`[data-code="${CSS.escape(code)}"]`);
    row?.querySelector<HTMLSelectElement>('select')?.focus();
  }, [currentKey]);

  if (cart.state.status === 'error') {
    return (
      <CartFrame step="Select">
        <ErrorMessage
          title="Your cart couldn’t be loaded"
          message={cart.state.message}
          onRetry={cart.reload}
        />
      </CartFrame>
    );
  }

  if (!saved) {
    return (
      <CartFrame step="Select">
        <div className={styles.skeleton} aria-hidden="true">
          <Skeleton height="4rem" />
          <Skeleton height="4rem" />
          <Skeleton height="4rem" />
        </div>
      </CartFrame>
    );
  }

  if (saved.status === 'SUBMITTED') {
    return (
      <CartFrame step="Submit">
        <CartReceipt cart={saved} />
      </CartFrame>
    );
  }

  const byCode = new Map(saved.items.map((item) => [item.code, item]));
  const seats = seatsNewerThan(live.snapshot, live.seats, saved.serverTime);
  const items: CartItem[] = current.flatMap((code) => {
    const item = byCode.get(code);
    return item ? [withLiveSeats(item, seats)] : [];
  });
  const totalCredits = items.reduce((total, item) => total + item.credits, 0);
  const nameOf = (code: string) => byCode.get(code)?.name ?? code;

  const setOrder = (codes: string[]) => {
    setDraft({ base: savedKey, codes });
  };

  const reorder = (from: number, to: number) => {
    const code = current[from];
    if (code === undefined || from < 0 || to < 0 || to >= current.length || from === to) {
      return;
    }
    setOrder(moveItem(current, from, to));
    focusCode.current = code;
    setAnnouncement(describeMove(nameOf(code), to + 1, current.length));
  };

  const removeLocally = (code: string) => {
    setOrder(current.filter((item) => item !== code));
    setAnnouncement(`${nameOf(code)} removed. ${current.length - 1} left in your cart.`);
  };

  const clearAll = () => {
    setOrder([]);
    setAnnouncement('Every course removed from your cart.');
  };

  const applyRefusal = (result: { message: string; problems: CartProblem[] }) => {
    setProblems(result.problems);
    if (needsReload(result.problems)) {
      cart.reload();
      setDraft(null);
    }
    setReviewing(false);
    toast.show({ tone: 'warning', title: 'Not saved', message: result.message });
  };

  const saveDraft = (then?: () => void) => {
    void cart.save(current).then((result) => {
      if (result.ok) {
        setProblems([]);
        setDraft(null);
        if (then) {
          then();
        } else {
          toast.show({ tone: 'success', title: 'Draft saved' });
        }
      } else {
        applyRefusal(result);
      }
    });
  };

  /** Moving on saves first: Review must show what the server actually holds. */
  const goToReview = () => {
    if (dirty) {
      saveDraft(() => {
        setReviewing(true);
      });
      return;
    }
    setReviewing(true);
  };

  const openConfirm = () => {
    // Generated ONCE, when the dialog opens, and reused for every retry: the
    // server replays the first result rather than submitting twice.
    setSubmitKey(crypto.randomUUID());
    setSubmitError(null);
    setConfirmOpen(true);
  };

  const closeConfirm = () => {
    setConfirmOpen(false);
    setSubmitKey(null);
    setSubmitError(null);
  };

  const confirmSubmit = async () => {
    if (!submitKey) {
      return;
    }
    const result = await cart.submit(current, submitKey);
    if (result.ok) {
      setConfirmOpen(false);
      setSubmitKey(null);
      setProblems([]);
      setDraft(null);
      toast.show({
        tone: 'success',
        title: 'Preferences submitted',
        message: `Reference ${result.receipt.reference}.`,
      });
      return;
    }
    if (result.httpStatus === null) {
      // The answer never arrived. The same key is still armed, so pressing
      // the button again cannot create a second submission.
      setSubmitError(
        'We couldn’t confirm your submission. Retrying is safe: it won’t create a duplicate.',
      );
      return;
    }
    setConfirmOpen(false);
    setSubmitKey(null);
    applyRefusal(result);
  };

  const byProblemCode = problemsByCode(problems);
  const overall = generalProblems(problems);
  const empty = items.length === 0;
  // An empty cart has nothing to review, so it stays on the first step.
  const step: CartStep = reviewing && !empty ? 'Review' : 'Select';

  return (
    <CartFrame step={step}>
      <section
        className={styles.layout}
        aria-labelledby="cart-heading"
        aria-busy={cart.saving || undefined}
      >
        <div className={styles.main}>
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <h2 id="cart-heading" className={styles.heading}>
                <Icon icon={CalendarDays} size={20} className={styles.headingIcon} />
                {step === 'Review' ? 'Review your choices' : `Selected courses (${items.length})`}
              </h2>
              <LiveSeatsIndicator updatedAt={live.updatedAt} failing={live.failing} />
              {step === 'Select' && !empty && saved.editable && (
                <button type="button" className={styles.clearAll} onClick={clearAll}>
                  <Icon icon={Trash2} />
                  Clear all
                </button>
              )}
              {step === 'Review' && (
                <p className={styles.count}>
                  {items.length} of {MAX_PREFERENCES} · {totalCredits} credits
                </p>
              )}
            </div>

            {/* Announcements only; the list itself is not a live region. */}
            <p className={styles.announcer} aria-live="polite">
              {announcement}
            </p>

            {empty ? (
              <EmptyState
                title="Your cart is empty"
                icon={ShoppingCart}
                headingLevel={3}
                action={<LinkButton to="/student/courses">Browse the catalogue</LinkButton>}
              >
                <p>
                  Add up to {MAX_PREFERENCES} courses from the catalogue, put them in the order you
                  want them, and submit once.
                </p>
              </EmptyState>
            ) : (
              <CartList
                items={items}
                editable={saved.editable && step === 'Select'}
                problems={byProblemCode}
                onReorder={reorder}
                onRemove={removeLocally}
                listRef={listRef}
              />
            )}
          </div>

          {overall.length > 0 && (
            <ul className={styles.overall}>
              {overall.map((problem) => (
                <li key={problem.type}>{describeOverall(problem)}</li>
              ))}
            </ul>
          )}

          {!empty && step === 'Select' && (
            <Notice>
              Set each course’s Priority, or drag a row, to change the order. Higher priorities are
              considered first during allocation.
            </Notice>
          )}

          {!empty && step === 'Review' && (
            <Notice icon={Lock}>
              This is the order allocation will use. Submitting is final: your list can’t be changed
              afterwards.
            </Notice>
          )}

          <div className={styles.footer}>
            {step === 'Select' ? (
              <>
                <Button
                  variant="secondary"
                  onClick={() => {
                    saveDraft();
                  }}
                  loading={cart.saving}
                  disabled={!dirty}
                >
                  Save draft
                </Button>
                <Button
                  variant="primary"
                  size="lg"
                  iconEnd={ArrowRight}
                  onClick={goToReview}
                  loading={cart.saving}
                  disabled={empty || !saved.submittable}
                >
                  Continue to review
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="secondary"
                  iconStart={ArrowLeft}
                  onClick={() => {
                    setReviewing(false);
                  }}
                >
                  Back to selection
                </Button>
                <Button
                  variant="primary"
                  iconStart={Send}
                  onClick={openConfirm}
                  disabled={empty || dirty || !saved.submittable}
                >
                  Submit preferences
                </Button>
              </>
            )}
          </div>

          {!saved.submittable && saved.submitBlockedReason && (
            <p className={styles.hint}>
              <Icon icon={Lock} /> {saved.submitBlockedReason}
            </p>
          )}
        </div>

        <aside className={styles.side} aria-label="Submitting">
          <CartWindowCard />
          <div className={styles.panel}>
            <h2 className={styles.panelHeading}>Before you submit</h2>
            <dl className={styles.totals}>
              <div>
                <dt>Courses ranked</dt>
                <dd>
                  {items.length} of {MAX_PREFERENCES}
                </dd>
              </div>
              <div>
                <dt>Total credits</dt>
                <dd>{totalCredits}</dd>
              </div>
            </dl>
            <p className={styles.note} data-dirty={dirty ? 'true' : undefined}>
              {dirty ? 'You have unsaved changes.' : 'Everything is saved.'}
            </p>
          </div>
        </aside>
      </section>

      <ConfirmDialog
        open={confirmOpen}
        title="Submit your preferences?"
        message={
          <>
            <p>
              Your {items.length} {items.length === 1 ? 'choice' : 'choices'} are recorded in this
              order and can’t be changed afterwards. Allocation runs once registration closes.
            </p>
            <ol className={styles.confirmList}>
              {items.map((item, index) => (
                <li key={item.code}>
                  {index + 1}. {item.code} {item.name}
                </li>
              ))}
            </ol>
            {submitError && <p className={styles.retryNote}>{submitError}</p>}
          </>
        }
        confirmLabel={submitError ? 'Try again' : 'Submit preferences'}
        onConfirm={confirmSubmit}
        onCancel={closeConfirm}
      />
    </CartFrame>
  );
}

/** The page header and stepper, shared by every state of this page. */
function CartFrame({ children, step }: { children: ReactNode; step: CartStep }) {
  return (
    <>
      <PageHeader
        title="My cart"
        description="Review your choices, set your preferences and submit before the registration window closes."
        actions={<Stepper steps={CART_STEPS} current={step} label="Submitting" />}
      />
      <div className={styles.body}>{children}</div>
    </>
  );
}

/** Problems about the cart as a whole rather than one course. */
function describeOverall(problem: CartProblem): string {
  switch (problem.type) {
    case 'TOO_MANY':
      return `You can rank at most ${problem.max} courses.`;
    case 'WINDOW_NOT_OPEN':
      return problem.reason;
    case 'ALREADY_SUBMITTED':
      return 'Your preferences are already submitted.';
    case 'CART_CHANGED':
      return 'Your cart changed since this page loaded. It has been reloaded. Please check it and submit again.';
    default:
      return 'Your cart was refused.';
  }
}
