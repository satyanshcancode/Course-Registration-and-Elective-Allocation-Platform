import type {
  AdminReferenceData,
  AdminStudentDetail,
  AdminStudentListItem,
  AdminStudentPage,
  AdminStudentQuery,
  ApiResponse,
  CreateStudentRequest,
  CreateStudentResult,
  CsvImportReport,
  StudentActivationChangeRequest,
  UpdateStudentRequest,
} from '@course-reg/shared';
import { apiClient } from './apiClient';

/** Students are addressed by roll number: internal ids never leave the server. */
const studentPath = (rollNumber: string): string =>
  `/admin/students/${encodeURIComponent(rollNumber)}`;

/** Defaults are left out, so the query string stays short and shareable. */
export function buildStudentQuery(query: AdminStudentQuery): string {
  const params = new URLSearchParams();
  if (query.search) {
    params.set('search', query.search);
  }
  if (query.program) {
    params.set('program', query.program);
  }
  if (query.semester !== undefined) {
    params.set('semester', String(query.semester));
  }
  if (query.status) {
    params.set('status', query.status);
  }
  if (query.page !== undefined && query.page > 1) {
    params.set('page', String(query.page));
  }
  const search = params.toString();
  return search ? `?${search}` : '';
}

export function getStudents(
  query: AdminStudentQuery,
  signal?: AbortSignal,
): Promise<ApiResponse<AdminStudentPage>> {
  return apiClient.get<AdminStudentPage>(`/admin/students${buildStudentQuery(query)}`, { signal });
}

export function getStudent(
  rollNumber: string,
  signal?: AbortSignal,
): Promise<ApiResponse<AdminStudentDetail>> {
  return apiClient.get<AdminStudentDetail>(studentPath(rollNumber), { signal });
}

/** Creates the account and e-mails the invitation, in one transaction. */
export function createStudent(
  request: CreateStudentRequest,
): Promise<ApiResponse<CreateStudentResult>> {
  return apiClient.post<CreateStudentResult>('/admin/students', { body: request });
}

export function updateStudent(
  rollNumber: string,
  request: UpdateStudentRequest,
): Promise<ApiResponse<AdminStudentListItem>> {
  return apiClient.patch<AdminStudentListItem>(studentPath(rollNumber), { body: request });
}

/** Invalidates the outstanding link and sends a new one. */
export function resendInvitation(rollNumber: string): Promise<ApiResponse<AdminStudentListItem>> {
  return apiClient.post<AdminStudentListItem>(`${studentPath(rollNumber)}/invitation`);
}

export function setStudentActive(
  rollNumber: string,
  isActive: boolean,
  request: StudentActivationChangeRequest = {},
): Promise<ApiResponse<AdminStudentListItem>> {
  return apiClient.post<AdminStudentListItem>(
    `${studentPath(rollNumber)}/${isActive ? 'reactivate' : 'deactivate'}`,
    { body: request },
  );
}

/** The dry run: judges every row and writes nothing. */
export function previewStudentImport(csv: string): Promise<ApiResponse<CsvImportReport>> {
  return apiClient.post<CsvImportReport>('/admin/students/import/preview', { body: { csv } });
}

/** The confirm: re-judges the file and writes every valid row in one transaction. */
export function confirmStudentImport(csv: string): Promise<ApiResponse<CsvImportReport>> {
  return apiClient.post<CsvImportReport>('/admin/students/import', { body: { csv } });
}

/** Programmes, departments and courses the forms' pickers choose from. */
export function getReferenceData(signal?: AbortSignal): Promise<ApiResponse<AdminReferenceData>> {
  return apiClient.get<AdminReferenceData>('/admin/reference-data', { signal });
}
