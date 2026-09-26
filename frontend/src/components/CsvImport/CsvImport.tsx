import {
  buildCsvTemplate,
  CSV_MAX_BYTES,
  type ApiResponse,
  type CsvImportReport,
} from '@course-reg/shared';
import { CircleAlert, CircleCheck, Copy, Download, Upload } from 'lucide-react';
import { useId, useRef, useState, type ChangeEvent } from 'react';
import { Button } from '../Button';
import { Card } from '../Card';
import { Icon } from '../Icon';
import { CsvImportReportTable } from './CsvImportReportTable';
import styles from './CsvImport.module.css';

export interface CsvImportProps {
  /** e.g. "students" — used in every sentence on the panel. */
  itemName: { one: string; other: string };
  columns: readonly string[];
  /** One example row, so the expected format of each column is visible. */
  example: readonly string[];
  templateFileName: string;
  /** The dry run. Writes nothing. */
  onPreview: (csv: string) => Promise<ApiResponse<CsvImportReport>>;
  /** The confirm. Writes every valid row in one transaction. */
  onConfirm: (csv: string) => Promise<ApiResponse<CsvImportReport>>;
  /** Called once rows were actually written, so the caller can reload its list. */
  onImported: (report: CsvImportReport) => void;
  /** Extra guidance under the heading, e.g. "each student is invited by e-mail". */
  children?: React.ReactNode;
}

type Phase =
  | { kind: 'choosing' }
  | { kind: 'previewing' }
  | { kind: 'previewed'; csv: string; report: CsvImportReport }
  | { kind: 'importing'; csv: string; report: CsvImportReport }
  | { kind: 'imported'; report: CsvImportReport };

/**
 * Upload, then preview, then confirm.
 *
 * The preview is the point: the server judges every row and writes NOTHING, so
 * the administrator sees exactly which rows are fine and what is wrong with the
 * rest before anything happens. Confirming re-sends the same file — the server
 * re-judges it, because the verdicts shown here are not a credential — and
 * writes every valid row in one transaction.
 *
 * Nothing is ever imported halfway and silently: the report after the confirm
 * lists every row with what became of it.
 */
export function CsvImport({
  itemName,
  columns,
  example,
  templateFileName,
  onPreview,
  onConfirm,
  onImported,
  children,
}: CsvImportProps) {
  const [phase, setPhase] = useState<Phase>({ kind: 'choosing' });
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileInputId = useId();

  const reset = () => {
    setPhase({ kind: 'choosing' });
    setError(null);
    setFileName(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const downloadTemplate = () => {
    const template = buildCsvTemplate(columns, example);
    const url = URL.createObjectURL(new Blob([template], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = templateFileName;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    setError(null);
    setFileName(file.name);

    // Checked here so an obviously oversized file is refused before it is read
    // and sent; the server enforces the same limit, which is the one that counts.
    if (file.size > CSV_MAX_BYTES) {
      setError(
        `That file is ${Math.round(file.size / 1024)} KB. The limit is ${Math.round(CSV_MAX_BYTES / 1024)} KB.`,
      );
      setPhase({ kind: 'choosing' });
      return;
    }

    setPhase({ kind: 'previewing' });
    const csv = await file.text();
    const response = await onPreview(csv);
    if (!response.success) {
      setError(response.message);
      setPhase({ kind: 'choosing' });
      return;
    }
    setPhase({ kind: 'previewed', csv, report: response.data });
  };

  const handleConfirm = async (csv: string, report: CsvImportReport) => {
    setError(null);
    setPhase({ kind: 'importing', csv, report });
    const response = await onConfirm(csv);
    if (!response.success) {
      setError(response.message);
      setPhase({ kind: 'previewed', csv, report });
      return;
    }
    setPhase({ kind: 'imported', report: response.data });
    if (response.data.counts.imported > 0) {
      onImported(response.data);
    }
  };

  const report =
    phase.kind === 'previewed' || phase.kind === 'importing' || phase.kind === 'imported'
      ? phase.report
      : null;
  const busy = phase.kind === 'previewing' || phase.kind === 'importing';
  const shown = phase.kind === 'imported' ? phase.report : report;

  return (
    <Card
      title={`Import ${itemName.other} from a CSV file`}
      actions={
        <Button size="sm" variant="secondary" iconStart={Download} onClick={downloadTemplate}>
          Download template
        </Button>
      }
    >
      <div className={styles.panel}>
        {children && <div className={styles.guidance}>{children}</div>}

        <p className={styles.columns}>
          <Icon icon={Copy} />
          <span>
            Columns, in any order: <code className={styles.code}>{columns.join(', ')}</code>. Lists
            inside one cell are separated by spaces. Extra columns are ignored.
          </span>
        </p>

        <div className={styles.alert} role="alert">
          {error && <p>{error}</p>}
        </div>

        <div className={styles.upload}>
          <label className={styles.fileLabel} htmlFor={fileInputId}>
            CSV file
          </label>
          <input
            ref={fileInputRef}
            id={fileInputId}
            className={styles.file}
            type="file"
            accept=".csv,text/csv"
            disabled={busy}
            onChange={(event) => {
              void handleFile(event);
            }}
          />
          {fileName !== null && (
            <p className={styles.fileName}>
              {fileName}
              {busy && ' — checking…'}
            </p>
          )}
        </div>

        {shown?.fileError !== null && shown !== null && (
          <p className={styles.fileError}>
            <Icon icon={CircleAlert} />
            <span>{shown.fileError} Nothing was imported. Fix the file and choose it again.</span>
          </p>
        )}

        {shown !== null && shown.fileError === null && (
          <>
            <p
              className={styles.counts}
              data-tone={shown.counts.invalid + shown.counts.duplicate > 0 ? 'warning' : 'ok'}
              role="status"
            >
              <Icon
                icon={shown.counts.invalid + shown.counts.duplicate > 0 ? CircleAlert : CircleCheck}
              />
              <span>
                {shown.applied
                  ? `Imported ${shown.counts.imported} of ${shown.counts.total} rows.`
                  : `${shown.counts.ok} of ${shown.counts.total} rows can be imported.`}
                {shown.counts.duplicate > 0 &&
                  ` ${shown.counts.duplicate} already ${shown.counts.duplicate === 1 ? 'exists' : 'exist'}.`}
                {shown.counts.invalid > 0 &&
                  ` ${shown.counts.invalid} ${shown.counts.invalid === 1 ? 'has' : 'have'} errors.`}
                {shown.applied &&
                  shown.invitationsSent !== null &&
                  ` ${shown.invitationsSent} invited by e-mail.`}
              </span>
            </p>

            <CsvImportReportTable report={shown} itemName={itemName} />

            <div className={styles.actions}>
              {phase.kind === 'imported' ? (
                <Button variant="secondary" onClick={reset}>
                  Import another file
                </Button>
              ) : (
                <>
                  <Button
                    variant="primary"
                    iconStart={Upload}
                    loading={phase.kind === 'importing'}
                    disabled={shown.counts.ok === 0 || phase.kind === 'importing'}
                    onClick={() => {
                      if (phase.kind === 'previewed') {
                        void handleConfirm(phase.csv, phase.report);
                      }
                    }}
                  >
                    {phase.kind === 'importing'
                      ? 'Importing…'
                      : shown.counts.ok === 0
                        ? 'Nothing to import'
                        : `Import ${shown.counts.ok} ${shown.counts.ok === 1 ? itemName.one : itemName.other}`}
                  </Button>
                  <Button variant="ghost" disabled={busy} onClick={reset}>
                    Choose a different file
                  </Button>
                </>
              )}
            </div>

            {!shown.applied && shown.counts.ok < shown.counts.total && (
              <p className={styles.note}>
                Importing writes only the {shown.counts.ok} valid{' '}
                {shown.counts.ok === 1 ? 'row' : 'rows'}, all in one transaction. The rest are left
                out and listed above, so nothing is imported halfway without you knowing.
              </p>
            )}
          </>
        )}
      </div>
    </Card>
  );
}
