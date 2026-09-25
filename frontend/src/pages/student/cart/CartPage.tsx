import { MAX_PREFERENCES, type CartItem, type CartProblem } from '@course-reg/shared';
import { CircleCheck, Lock, Send, ShoppingCart } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button, LinkButton } from '../../../components/Button';
import { ConfirmDialog } from '../../../components/ConfirmDialog';
import { EmptyState } from '../../../components/EmptyState';
import { ErrorMessage } from '../../../components/ErrorMessage';
import { Icon } from '../../../components/Icon';
import { LiveSeatsIndicator } from '../../../components/LiveSeatsIndicator';
import { PageHeader } from '../../../components/PageHeader';
import { RegistrationStatusBanner } from '../../../components/RegistrationStatusBanner';
import { Skeleton } from '../../../components/Skeleton';
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
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitKey, setSubmitKey] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const focusCode = useRef<string | null>(null);

  const saved = cart.cart;
  const savedKey = keyOf(cart.codes);
  const current = draft?.base === savedKey ? draft.codes : cart.codes;
  const dirty = draft?.base === savedKey && keyOf(draft.codes) !== savedKey;
  const currentKey = keyOf(current);

  useBeforeUnload(dirty);

  // Keep the keyboard where the student left it: after a move, focus the same
  // item's first usable button (the one they pressed may now be disabled).
  useEffect(() => {
    const code = focusCode.current;
    focusCode.current = null;
    if (!code) {
      return;
    }
    const item = listRef.current?.querySelector<HTMLElement>(`[data-code="${CSS.escape(code)}"]`);
    item?.querySelector<HTMLButtonElement>('button:not([disabled])')?.focus();
  }, [currentKey]);

  if (cart.state.status === 'error') {
    return (
      <CartFrame>
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
      <CartFrame>
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
      <CartFrame windowName={saved.window?.name}>
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

  const moveTo = (code: string, from: number, to: number) => {
    if (from < 0 || to < 0 || to >= current.length) {
      return;
    }
    setOrder(moveItem(current, from, to));
    focusCode.current = code;
    setAnnouncement(describeMove(nameOf(code), to + 1, current.length));
  };

  const move = (code: string, delta: -1 | 1) => {
    const from = current.indexOf(code);
    moveTo(code, from, from + delta);
  };

  const reorder = (from: number, to: number) => {
    const code = current[from];
    if (code !== undefined) {
      moveTo(code, from, to);
    }
  };

  const removeLocally = (code: string) => {
    setOrder(current.filter((item) => item !== code));
    setAnnouncement(`${nameOf(code)} removed. ${current.length - 1} left in your cart.`);
  };

  const applyRefusal = (result: { message: string; problems: CartProblem[] }) => {
    setProblems(result.problems);
    if (needsReload(result.problems)) {
      cart.reload();
      setDraft(null);
    }
    toast.show({ tone: 'warning', title: 'Not saved', message: result.message });
  };

  const saveDraft = () => {
    void cart.save(current).then((result) => {
      if (result.ok) {
        setProblems([]);
        setDraft(null);
        toast.show({ tone: 'success', title: 'Draft saved' });
      } else {
        applyRefusal(result);
      }
    });
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
        'We couldn’t confirm your submission. Retrying is safe — it won’t create a duplicate.',
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

  return (
    <CartFrame
      windowName={saved.window?.name}
      live={<LiveSeatsIndicator updatedAt={live.updatedAt} failing={live.failing} />}
    >
      <section
        className={styles.layout}
        aria-labelledby="cart-heading"
        aria-busy={cart.saving || undefined}
      >
        <div className={styles.main}>
          <div className={styles.listHeader}>
            <h2 id="cart-heading" className={styles.heading}>
              Your ranked choices
            </h2>
            <p className={styles.count}>
              {items.length} of {MAX_PREFERENCES} · {totalCredits} credits
            </p>
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
              editable={saved.editable}
              problems={byProblemCode}
              onMove={move}
              onRemove={removeLocally}
              onReorder={reorder}
              listRef={listRef}
            />
          )}

          {overall.length > 0 && (
            <ul className={styles.overall}>
              {overall.map((problem) => (
                <li key={problem.type}>{describeOverall(problem)}</li>
              ))}
            </ul>
          )}
        </div>

        <aside className={styles.side} aria-label="Submitting">
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

            <div className={styles.actions}>
              <Button
                variant="secondary"
                onClick={saveDraft}
                loading={cart.saving}
                disabled={!dirty}
              >
                Save draft
              </Button>
              <Button
                variant="primary"
                iconStart={Send}
                onClick={openConfirm}
                disabled={empty || dirty || !saved.submittable}
              >
                Submit preferences
              </Button>
            </div>

            {dirty && <p className={styles.hint}>Save your draft before submitting.</p>}
            {!saved.submittable && saved.submitBlockedReason && (
              <p className={styles.hint}>
                <Icon icon={Lock} /> {saved.submitBlockedReason}
              </p>
            )}
            {saved.submittable && !dirty && !empty && (
              <p className={styles.hint}>
                <Icon icon={CircleCheck} /> Submitting is final: your list can’t be changed
                afterwards.
              </p>
            )}
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

/** The page header and banner, shared by every state of this page. */
function CartFrame({
  children,
  windowName,
  live,
}: {
  children: ReactNode;
  windowName?: string;
  live?: ReactNode;
}) {
  return (
    <>
      <PageHeader
        title="My cart"
        kicker={windowName ? `${windowName} · Registration` : 'Registration'}
        description={`Rank up to ${MAX_PREFERENCES} courses, save a draft, and submit once.`}
      >
        <RegistrationStatusBanner />
        {live}
      </PageHeader>
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
      return 'Your cart changed since this page loaded. It has been reloaded — please check it and submit again.';
    default:
      return 'Your cart was refused.';
  }
}
