import type { LucideIcon } from 'lucide-react';
import type { ButtonHTMLAttributes, MouseEvent, ReactNode, Ref } from 'react';
import { Link, type LinkProps } from 'react-router';
import { Icon } from '../Icon';
import { Spinner } from '../LoadingSpinner';
import styles from './Button.module.css';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
export type ButtonSize = 'sm' | 'md';

/** Appearance options shared by Button and LinkButton. */
interface ButtonAppearance {
  variant?: ButtonVariant;
  size?: ButtonSize;
  iconStart?: LucideIcon;
  iconEnd?: LucideIcon;
  fullWidth?: boolean;
}

export interface ButtonProps extends ButtonAppearance, ButtonHTMLAttributes<HTMLButtonElement> {
  /**
   * Shows a spinner, sets aria-busy and ignores clicks, but keeps the button
   * focusable (unlike `disabled`) so keyboard users don't lose their place.
   */
  loading?: boolean;
  ref?: Ref<HTMLButtonElement>;
}

export type LinkButtonProps = ButtonAppearance & LinkProps;

function classNames(fullWidth: boolean | undefined, extra: string | undefined): string {
  return [styles.button, fullWidth ? styles.fullWidth : undefined, extra].filter(Boolean).join(' ');
}

function ButtonContent({
  iconStart,
  iconEnd,
  loading,
  children,
}: Pick<ButtonProps, 'iconStart' | 'iconEnd' | 'loading'> & { children: ReactNode }) {
  return (
    <>
      {loading ? <Spinner /> : iconStart && <Icon icon={iconStart} />}
      <span className={styles.label}>{children}</span>
      {iconEnd && !loading && <Icon icon={iconEnd} />}
    </>
  );
}

export function Button({
  variant = 'secondary',
  size = 'md',
  iconStart,
  iconEnd,
  fullWidth,
  loading = false,
  type = 'button',
  className,
  onClick,
  children,
  ref,
  ...rest
}: ButtonProps) {
  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (loading) {
      event.preventDefault();
      return;
    }
    onClick?.(event);
  };

  return (
    <button
      ref={ref}
      type={type}
      className={classNames(fullWidth, className)}
      data-variant={variant}
      data-size={size}
      aria-busy={loading || undefined}
      aria-disabled={loading || undefined}
      onClick={handleClick}
      {...rest}
    >
      <ButtonContent iconStart={iconStart} iconEnd={iconEnd} loading={loading}>
        {children}
      </ButtonContent>
    </button>
  );
}

/** A router link that looks like a button (for navigation, not actions). */
export function LinkButton({
  variant = 'secondary',
  size = 'md',
  iconStart,
  iconEnd,
  fullWidth,
  className,
  children,
  ...rest
}: LinkButtonProps) {
  return (
    <Link
      className={classNames(fullWidth, className)}
      data-variant={variant}
      data-size={size}
      {...rest}
    >
      <ButtonContent iconStart={iconStart} iconEnd={iconEnd}>
        {children}
      </ButtonContent>
    </Link>
  );
}
