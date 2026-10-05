import { Ban, Check, Minus, ShoppingCart } from 'lucide-react';
import { CART_ACTIONS, type CartAction as CartActionState } from '../../utils/cartActions';
import { Icon } from '../Icon';
import styles from './CartAction.module.css';

export interface CartActionProps {
  /** What to offer, from `cartActionFor`. Null draws nothing. */
  action: CartActionState | null;
  code: string;
  /** The course name, so the button's accessible name says which course. */
  name: string;
  /** Tighter wording for a table cell. */
  compact?: boolean;
}

/**
 * The add/remove control for one course.
 *
 * The buttons carry their intent in `data-action` and `data-course-code` and
 * have NO onClick: one delegated listener on the surrounding list or table
 * body handles every one of them (see `utils/tableActions.ts`). When the
 * course can't be added, this explains why instead of showing a dead button.
 */
export function CartAction({ action, code, name, compact = false }: CartActionProps) {
  if (!action) {
    return null;
  }

  switch (action.kind) {
    case 'add':
      return (
        <button
          type="button"
          className={styles.button}
          data-variant="add"
          data-action={CART_ACTIONS.add}
          data-course-code={code}
        >
          <Icon icon={ShoppingCart} />
          <span>Add to cart</span>
          <span className="visually-hidden">: {name}</span>
        </button>
      );

    case 'remove':
      return (
        <span className={styles.inCart}>
          <span className={styles.ranked}>
            <Icon icon={Check} />
            {compact ? `#${action.rank}` : `Choice ${action.rank}`}
          </span>
          <button
            type="button"
            className={styles.button}
            data-variant="remove"
            data-action={CART_ACTIONS.remove}
            data-course-code={code}
          >
            <Icon icon={Minus} />
            <span>Remove</span>
            <span className="visually-hidden"> {name} from your cart</span>
          </button>
        </span>
      );

    case 'full':
      return (
        <p className={styles.note}>
          Your cart is full ({action.max} courses). Remove one to add {compact ? 'this' : name}.
        </p>
      );

    case 'ineligible':
      // A disabled button rather than a sentence: it holds the place the Add
      // button would take, so a row of cards does not go ragged. The reason is
      // already on screen beside it (the eligibility line on a card or a row,
      // the checklist on the course page), so it is not repeated here.
      return (
        <button type="button" className={styles.button} data-variant="ineligible" disabled>
          <Icon icon={Ban} />
          <span>Not eligible</span>
          <span className="visually-hidden">: {name} can’t be ranked</span>
        </button>
      );

    case 'locked':
      return <p className={styles.note}>{action.reason}</p>;
  }
}
