import { Check, Copy, Ellipsis, Eye, Minus, ShoppingCart } from 'lucide-react';
import { useState } from 'react';
import { Link, type To } from 'react-router';
import { useDisclosure } from '../../hooks/useDisclosure';
import { CART_ACTIONS, type CartAction } from '../../utils/cartActions';
import { Icon } from '../Icon';
import styles from './CourseCardMenu.module.css';

export interface CourseCardMenuProps {
  code: string;
  name: string;
  to: To;
  linkState?: unknown;
  /** What the cart offers for this course, from `cartActionFor`. */
  cartAction?: CartAction | null;
}

/**
 * The "⋮" on a course card: the same things the card already offers, plus the
 * course code on the clipboard.
 *
 * A disclosure, not an ARIA menu — it holds a link and ordinary buttons, and
 * Tab is the right way through them. The cart item carries `data-action` and
 * `data-course-code` like every other cart control, so the one delegated
 * listener around the catalogue handles it too.
 */
export function CourseCardMenu({ code, name, to, linkState, cartAction }: CourseCardMenuProps) {
  const { open, toggle, close, containerRef, triggerRef, panelId } = useDisclosure();
  const [copied, setCopied] = useState(false);

  const copyCode = () => {
    // Older browsers and jsdom have no clipboard; the menu simply does not
    // claim to have copied anything.
    void navigator.clipboard?.writeText(code).then(
      () => {
        setCopied(true);
      },
      () => {
        setCopied(false);
      },
    );
  };

  return (
    <div className={styles.menu} ref={containerRef}>
      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={toggle}
      >
        <Icon icon={Ellipsis} size={16} />
        <span className="visually-hidden">More for {name}</span>
      </button>

      <div id={panelId} className={styles.panel} hidden={!open}>
        <Link to={to} state={linkState} className={styles.item} onClick={close}>
          <Icon icon={Eye} size={16} />
          View details
        </Link>

        {cartAction?.kind === 'add' && (
          <button
            type="button"
            className={styles.item}
            data-action={CART_ACTIONS.add}
            data-course-code={code}
            onClick={close}
          >
            <Icon icon={ShoppingCart} size={16} />
            Add to cart
          </button>
        )}

        {cartAction?.kind === 'remove' && (
          <button
            type="button"
            className={styles.item}
            data-action={CART_ACTIONS.remove}
            data-course-code={code}
            onClick={close}
          >
            <Icon icon={Minus} size={16} />
            Remove from cart
          </button>
        )}

        <button type="button" className={styles.item} onClick={copyCode}>
          <Icon icon={copied ? Check : Copy} size={16} />
          {copied ? 'Code copied' : 'Copy course code'}
        </button>
      </div>
    </div>
  );
}
