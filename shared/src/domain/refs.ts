/**
 * Public references to entities. The API addresses courses and programs by
 * their human-readable code; database ids never leave the server.
 */

export interface CourseRef {
  code: string;
  name: string;
}

export interface DepartmentRef {
  code: string;
  name: string;
}

export interface ProgramRef {
  code: string;
  name: string;
}
