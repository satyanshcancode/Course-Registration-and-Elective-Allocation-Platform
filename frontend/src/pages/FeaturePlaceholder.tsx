import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { EmptyState } from '../components/EmptyState';
import { PageHeader } from '../components/PageHeader';
import { RegistrationStatusBanner } from '../components/RegistrationStatusBanner';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import styles from './FeaturePlaceholder.module.css';

export interface FeaturePlaceholderProps {
  title: string;
  kicker: string;
  description: ReactNode;
  icon: LucideIcon;
  emptyTitle: string;
  children: ReactNode;
  /** Right-hand side of the page header. */
  actions?: ReactNode;
}

/**
 * Scaffold for a page whose feature arrives in a later phase: the real page
 * header plus an empty state that says, plainly, what will be here.
 */
export function FeaturePlaceholder({
  title,
  kicker,
  description,
  icon,
  emptyTitle,
  children,
  actions,
}: FeaturePlaceholderProps) {
  useDocumentTitle(title);
  return (
    <>
      <PageHeader title={title} kicker={kicker} description={description} actions={actions}>
        {/* Renders nothing outside the student area, which has no window. */}
        <RegistrationStatusBanner />
      </PageHeader>
      <div className={styles.body}>
        <EmptyState title={emptyTitle} icon={icon}>
          {children}
        </EmptyState>
      </div>
    </>
  );
}
