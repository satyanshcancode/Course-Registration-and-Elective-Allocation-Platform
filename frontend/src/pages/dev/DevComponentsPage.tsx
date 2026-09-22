import { ArrowRight, BookOpen, Plus, Save, Send, Trash2 } from 'lucide-react';
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Checkbox } from '../../components/Checkbox';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { CourseCode } from '../../components/CourseCode';
import { DataTable, type Column } from '../../components/DataTable';
import { EmptyState } from '../../components/EmptyState';
import { ErrorMessage } from '../../components/ErrorMessage';
import { FormField } from '../../components/FormField';
import { Input } from '../../components/Input';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { Modal } from '../../components/Modal';
import { PageHeader } from '../../components/PageHeader';
import { Pagination } from '../../components/Pagination';
import { RadioGroup } from '../../components/RadioGroup';
import { SearchBar } from '../../components/SearchBar';
import { SeatMeter } from '../../components/SeatMeter';
import { Select } from '../../components/Select';
import { Skeleton } from '../../components/Skeleton';
import {
  STATUS_PRESENTATION,
  StatusBadge,
  type StatusKind,
  type StatusKinds,
} from '../../components/StatusBadge';
import { Tabs } from '../../components/Tabs';
import { useToast } from '../../components/Toast';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { formatDateTime, formatRelative } from '../../utils/formatDate';
import { formatDemandRatio } from '../../utils/formatSeats';
import styles from './DevComponentsPage.module.css';
import { buildSampleCourses, type SampleCourse } from './sampleCourses';

const SECTIONS = [
  ['foundations', 'Foundations'],
  ['buttons', 'Buttons'],
  ['forms', 'Forms'],
  ['status', 'Status'],
  ['seats', 'Codes and seats'],
  ['containers', 'Cards and empty states'],
  ['feedback', 'Feedback'],
  ['navigation', 'Search, pages, tabs'],
  ['dialogs', 'Dialogs and toasts'],
  ['table', 'Data table'],
] as const;

type SectionId = (typeof SECTIONS)[number][0];

function Section({ id, title, children }: { id: SectionId; title: string; children: ReactNode }) {
  return (
    <section id={id} className={styles.section} aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className={styles.sectionTitle}>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Specimen({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={styles.specimen}>
      <p className={styles.specimenLabel}>{label}</p>
      <div className={styles.specimenBody}>{children}</div>
    </div>
  );
}

const SWATCHES = [
  'paper',
  'surface',
  'surface-sunken',
  'ink',
  'ink-muted',
  'rule',
  'rule-strong',
  'accent',
  'accent-soft',
  'success',
  'success-soft',
  'warning',
  'warning-soft',
  'danger',
  'danger-soft',
  'info',
  'info-soft',
] as const;

const COURSE_COLUMNS: Column<SampleCourse>[] = [
  {
    id: 'code',
    header: 'Code',
    key: 'code',
    sortable: true,
    width: '6.5rem',
    cell: (course) => <CourseCode code={course.code} />,
  },
  { id: 'name', header: 'Course', key: 'name', sortable: true },
  { id: 'department', header: 'Department', key: 'department', sortable: true },
  { id: 'credits', header: 'Credits', key: 'credits', sortable: true, align: 'end' },
  {
    id: 'seats',
    header: 'Seats',
    accessor: (course) => course.capacity - course.allocated,
    sortable: true,
    searchable: false,
    width: '15rem',
    cell: (course) => (
      <SeatMeter
        allocated={course.allocated}
        capacity={course.capacity}
        label={`Seats in ${course.name}`}
        compact
      />
    ),
  },
  {
    id: 'demand',
    header: 'Demand',
    accessor: (course) => course.demand / course.capacity,
    sortable: true,
    searchable: false,
    align: 'end',
    cell: (course) => (
      <span className={styles.mono}>{formatDemandRatio(course.demand, course.capacity)}</span>
    ),
  },
  {
    id: 'opens',
    header: 'Opens',
    key: 'opensAt',
    sortable: true,
    searchable: false,
    cell: (course) => (
      <time dateTime={course.opensAt.toISOString()}>{formatDateTime(course.opensAt)}</time>
    ),
  },
  {
    id: 'outcome',
    header: 'Your result',
    accessor: (course) => course.outcome,
    cell: (course) =>
      course.outcome ? (
        <StatusBadge kind="allocation" status={course.outcome} />
      ) : (
        <span className={styles.muted}>Not ranked</span>
      ),
  },
];

/** Every status of every kind, straight from the presentation table. */
function AllStatusBadges() {
  const kinds = Object.keys(STATUS_PRESENTATION) as StatusKind[];
  return (
    <div className={styles.statusGrid}>
      {kinds.map((kind) => (
        <div key={kind} className={styles.statusRow}>
          <p className={styles.specimenLabel}>{kind}</p>
          <div className="cluster">
            {(Object.keys(STATUS_PRESENTATION[kind]) as StatusKinds[typeof kind][]).map(
              (status) => (
                <StatusBadge key={status} kind={kind} status={status} />
              ),
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export function DevComponentsPage() {
  useDocumentTitle('Component gallery');
  const toast = useToast();
  const courses = useMemo(() => buildSampleCourses(), []);
  const [modalOpen, setModalOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [method, setMethod] = useState<'FCFS' | 'PREFERENCE_PRIORITY'>('PREFERENCE_PRIORITY');
  const [page, setPage] = useState(3);
  const [lastSearch, setLastSearch] = useState('');
  const modalTrigger = useRef<HTMLButtonElement>(null);
  // Captured once: rendering must stay pure.
  const [now] = useState(() => new Date());
  const opensAt = new Date(now.getTime() + 2 * 60 * 60 * 1000);

  return (
    <div className={styles.page}>
      <PageHeader
        // Public layout: its top bar does not stick, so neither does this.
        sticky={false}
        kicker="Development · Design review"
        title="Component gallery"
        description="Every shared component in each of its states. Only built in development."
        actions={
          <Button variant="primary" iconStart={Send}>
            Submit preferences
          </Button>
        }
      >
        <p className={styles.statusLine}>
          <StatusBadge kind="window" status="DRAFT" />
          <span>
            Registration opens <strong>{formatDateTime(opensAt)}</strong> (
            {formatRelative(opensAt, now)})
          </span>
        </p>
      </PageHeader>

      <nav className={styles.toc} aria-label="Gallery sections">
        <ol className={styles.tocList}>
          {SECTIONS.map(([id, title]) => (
            <li key={id}>
              <a href={`#${id}`}>{title}</a>
            </li>
          ))}
        </ol>
      </nav>

      <Section id="foundations" title="Foundations">
        <div className={styles.twoColumn}>
          <Specimen label="Type scale">
            <p className={styles.kicker}>Fall 2026 · Registration</p>
            <p className={styles.display}>Course catalogue</p>
            <h3>Artificial Intelligence</h3>
            <h4>Prerequisites and eligibility</h4>
            <p>
              Body text in IBM Plex Sans. Rank up to five courses; your first choice carries the
              most weight.
            </p>
            <p className={styles.muted}>
              Muted text for supporting detail · <code>CS401</code> ·{' '}
              <span className={styles.mono}>13 of 50 seats left</span>
            </p>
          </Specimen>
          <Specimen label="Colour tokens">
            <ul className={styles.swatches}>
              {SWATCHES.map((name) => (
                <li key={name} className={styles.swatch}>
                  <span
                    className={styles.swatchChip}
                    style={{ backgroundColor: `var(--color-${name})` }}
                  />
                  <code>--color-{name}</code>
                </li>
              ))}
            </ul>
          </Specimen>
        </div>
      </Section>

      <Section id="buttons" title="Buttons">
        <Specimen label="Variants">
          <div className="cluster">
            <Button variant="primary" iconStart={Send}>
              Submit preferences
            </Button>
            <Button variant="secondary" iconStart={Save}>
              Save draft
            </Button>
            <Button variant="danger" iconStart={Trash2}>
              Drop course
            </Button>
            <Button variant="ghost" iconEnd={ArrowRight}>
              View details
            </Button>
          </div>
        </Specimen>
        <Specimen label="Sizes and states">
          <div className="cluster">
            <Button size="sm" variant="primary" iconStart={Plus}>
              Add to cart
            </Button>
            <Button size="sm">Small secondary</Button>
            <Button variant="primary" loading>
              Submitting…
            </Button>
            <Button variant="secondary" disabled>
              Disabled
            </Button>
          </div>
        </Specimen>
      </Section>

      <Section id="forms" title="Forms">
        <div className={styles.formGrid}>
          <FormField label="E-mail address" hint="Your university address." required>
            {(control) => <Input {...control} type="email" placeholder="name@university.edu" />}
          </FormField>
          <FormField label="Roll number" error="Roll numbers look like CSE24901." required>
            {(control) => <Input {...control} mono defaultValue="CSE-249" />}
          </FormField>
          <FormField label="Programme">
            {(control) => (
              <Select
                {...control}
                placeholder="All programmes"
                options={[
                  { value: 'BTECH-CSE', label: 'B.Tech Computer Science and Engineering' },
                  { value: 'BTECH-ECE', label: 'B.Tech Electronics and Communication' },
                  { value: 'BSC-MATH', label: 'B.Sc Mathematics and Computing' },
                ]}
              />
            )}
          </FormField>
          <FormField label="Capacity" hint="Seats in this offering.">
            {(control) => (
              <Input {...control} type="number" min={0} max={500} defaultValue={20} mono />
            )}
          </FormField>
          <FormField label="Disabled">
            {(control) => <Input {...control} disabled value="Registration closed" readOnly />}
          </FormField>
          <div className={styles.stack}>
            <Checkbox label="Only show courses I'm eligible for" defaultChecked />
            <Checkbox label="Include full courses" description="You can still join the waitlist." />
            <Checkbox label="Disabled option" disabled />
          </div>
          <RadioGroup
            legend="Allocation method"
            name="method"
            value={method}
            onChange={setMethod}
            options={[
              {
                value: 'PREFERENCE_PRIORITY',
                label: 'Preference and priority',
                description: 'Scores each request by rank and mock priority points.',
              },
              {
                value: 'FCFS',
                label: 'First come, first served',
                description: 'Baseline for comparison: server arrival order only.',
              },
            ]}
          />
        </div>
      </Section>

      <Section id="status" title="Status">
        <AllStatusBadges />
        <Specimen label="Plain badges">
          <div className="cluster">
            <Badge>Neutral</Badge>
            <Badge tone="accent">Core</Badge>
            <Badge tone="info">4 credits</Badge>
          </div>
        </Specimen>
      </Section>

      <Section id="seats" title="Codes and seats">
        <Specimen label="Course codes">
          <div className="cluster">
            <CourseCode code="CS401" />
            <CourseCode code="MA202" />
            <CourseCode code="EC302" size="sm" />
          </div>
        </Specimen>
        <div className={styles.meters}>
          <SeatMeter allocated={0} capacity={50} label="Empty course" />
          <SeatMeter allocated={23} capacity={50} label="Half full course" demand={31} />
          <SeatMeter allocated={41} capacity={50} label="Filling course" demand={96} />
          <SeatMeter allocated={49} capacity={50} label="One seat left" />
          <SeatMeter allocated={20} capacity={20} label="Full course" demand={114} />
          <SeatMeter allocated={37} capacity={50} label="Compact meter" compact />
        </div>
      </Section>

      <Section id="containers" title="Cards and empty states">
        <div className={styles.twoColumn}>
          <Card
            kicker="CS401 · 4 credits"
            title="Artificial Intelligence"
            actions={
              <Button size="sm" iconStart={Plus}>
                Add to cart
              </Button>
            }
            footer="Prerequisites: CS201, MA201 · Semester 5 or later"
          >
            <SeatMeter allocated={20} capacity={20} demand={114} label="Seats in AI" />
          </Card>
          <EmptyState
            title="Your cart is empty"
            icon={BookOpen}
            action={<Button>Browse courses</Button>}
          >
            <p>Add up to five courses from the catalogue, then rank them.</p>
          </EmptyState>
        </div>
      </Section>

      <Section id="feedback" title="Feedback">
        <div className={styles.twoColumn}>
          <Specimen label="Loading">
            <div className={styles.stack}>
              <LoadingSpinner label="Loading courses…" showLabel />
              <Skeleton lines={3} />
              <Skeleton height="3rem" />
            </div>
          </Specimen>
          <Specimen label="Error with retry">
            <ErrorMessage
              title="Courses couldn't be loaded"
              message="The server didn't respond. Check your connection and try again."
              onRetry={() => {
                toast.show({ title: 'Retrying…', tone: 'info' });
              }}
            />
          </Specimen>
        </div>
      </Section>

      <Section id="navigation" title="Search, pages, tabs">
        <Specimen label={`Search (debounced) · last query: “${lastSearch}”`}>
          <SearchBar
            label="Search courses"
            placeholder="Search by code or name"
            onSearch={setLastSearch}
          />
        </Specimen>
        <Specimen label="Pagination">
          <Pagination page={page} pageCount={12} onPageChange={setPage} label="Example pages" />
        </Specimen>
        <Specimen label="Tabs (arrow keys, Home, End)">
          <Tabs
            label="Course sections"
            tabs={[
              { id: 'overview', label: 'Overview', panel: <p>Search, planning and learning.</p> },
              { id: 'rules', label: 'Eligibility', meta: '4', panel: <p>Semester 5 or later.</p> },
              {
                id: 'seats',
                label: 'Seats',
                meta: '20',
                panel: <SeatMeter allocated={20} capacity={20} />,
              },
            ]}
          />
        </Specimen>
      </Section>

      <Section id="dialogs" title="Dialogs and toasts">
        <div className="cluster">
          <Button
            ref={modalTrigger}
            onClick={() => {
              setModalOpen(true);
            }}
          >
            Open modal
          </Button>
          <Button
            variant="danger"
            iconStart={Trash2}
            onClick={() => {
              setConfirmOpen(true);
            }}
          >
            Drop a course…
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              toast.show({
                tone: 'success',
                title: 'Draft saved',
                message: '3 courses in your cart.',
              });
            }}
          >
            Success toast
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              toast.show({
                tone: 'warning',
                title: 'You’re #7 on the waitlist',
                message: 'Cloud Security is full.',
              });
            }}
          >
            Warning toast
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              toast.show({
                tone: 'danger',
                title: 'Submission failed',
                message: 'Nothing was saved. Try again.',
              });
            }}
          >
            Error toast
          </Button>
        </div>
        <Modal
          open={modalOpen}
          onClose={() => {
            setModalOpen(false);
          }}
          title="Artificial Intelligence"
          description="CS401 · 4 credits · Computer Science"
          footer={
            <>
              <Button
                onClick={() => {
                  setModalOpen(false);
                }}
              >
                Close
              </Button>
              <Button variant="primary" iconStart={Plus}>
                Add to cart
              </Button>
            </>
          }
        >
          <SeatMeter allocated={20} capacity={20} demand={114} label="Seats in AI" />
        </Modal>
        <ConfirmDialog
          open={confirmOpen}
          title="Drop Cloud Security?"
          message="Your seat goes to the next student on the waitlist. You can't undo this."
          confirmLabel="Drop course"
          tone="danger"
          onConfirm={() => {
            setConfirmOpen(false);
            toast.show({ tone: 'info', title: 'Cloud Security dropped' });
          }}
          onCancel={() => {
            setConfirmOpen(false);
          }}
        />
      </Section>

      <Section id="table" title="Data table">
        <DataTable
          caption="Fall 2026 course offerings"
          rows={courses}
          columns={COURSE_COLUMNS}
          getRowId={(course) => course.id}
          initialSort={{ columnId: 'code', direction: 'ascending' }}
          filterLabel="Filter courses"
          filterPlaceholder="Filter by code, name or department"
          itemName={{ one: 'course', other: 'courses' }}
        />
        <div className={styles.twoColumn}>
          <DataTable
            caption="Loading state"
            rows={[]}
            columns={COURSE_COLUMNS.slice(0, 4)}
            getRowId={(course) => course.id}
            status={{ kind: 'loading' }}
            filterable={false}
            itemName={{ one: 'course', other: 'courses' }}
          />
          <DataTable
            caption="Error state"
            rows={[]}
            columns={COURSE_COLUMNS.slice(0, 4)}
            getRowId={(course) => course.id}
            status={{
              kind: 'error',
              message: 'The catalogue could not be loaded.',
              onRetry: () => undefined,
            }}
          />
        </div>
        <DataTable
          caption="Empty state"
          rows={[]}
          columns={COURSE_COLUMNS.slice(0, 4)}
          getRowId={(course) => course.id}
          emptyTitle="No courses offered yet"
          emptyMessage="Courses appear here once the registrar publishes the term's offerings."
        />
      </Section>
    </div>
  );
}
