/**
 * Static reference data for the demo university: departments, programs and
 * courses with their rules and the Fall 2026 offering capacities.
 */
import type { AcademicTerm } from '@course-reg/shared';

export const SEED_TERM: AcademicTerm = '2026-FALL';
export const SEED_WINDOW_NAME = 'Fall 2026';

export interface DepartmentSeed {
  code: string;
  name: string;
}

export const DEPARTMENTS: readonly DepartmentSeed[] = [
  { code: 'CSE', name: 'Computer Science and Engineering' },
  { code: 'ECE', name: 'Electronics and Communication Engineering' },
  { code: 'ME', name: 'Mechanical Engineering' },
  { code: 'MATH', name: 'Mathematics' },
  { code: 'MGMT', name: 'Management Studies' },
];

export type ProgramCode = 'BTECH-CSE' | 'BTECH-ECE' | 'BTECH-ME' | 'BSC-MATH' | 'BBA';

export interface ProgramSeed {
  code: ProgramCode;
  name: string;
  departmentCode: string;
  /** Prefix of generated roll numbers, e.g. CSE22014. */
  rollPrefix: string;
  /** Number of generated (non-demo) students. */
  generatedStudents: number;
}

export const PROGRAMS: readonly ProgramSeed[] = [
  {
    code: 'BTECH-CSE',
    name: 'B.Tech Computer Science and Engineering',
    departmentCode: 'CSE',
    rollPrefix: 'CSE',
    generatedStudents: 108,
  },
  {
    code: 'BTECH-ECE',
    name: 'B.Tech Electronics and Communication Engineering',
    departmentCode: 'ECE',
    rollPrefix: 'ECE',
    generatedStudents: 59,
  },
  {
    code: 'BTECH-ME',
    name: 'B.Tech Mechanical Engineering',
    departmentCode: 'ME',
    rollPrefix: 'MEC',
    generatedStudents: 44,
  },
  {
    code: 'BSC-MATH',
    name: 'B.Sc Mathematics and Computing',
    departmentCode: 'MATH',
    rollPrefix: 'MTH',
    generatedStudents: 45,
  },
  {
    code: 'BBA',
    name: 'Bachelor of Business Administration',
    departmentCode: 'MGMT',
    rollPrefix: 'BBA',
    generatedStudents: 40,
  },
];

export interface CourseSeed {
  code: string;
  name: string;
  departmentCode: string;
  credits: number;
  description: string;
  minSemester: number;
  minCredits: number;
  prerequisites: readonly string[];
  /** Empty = open to every program. */
  eligiblePrograms: readonly ProgramCode[];
  relevantPrograms: readonly ProgramCode[];
  /** Seats in the Fall 2026 offering. */
  capacity: number;
  /** Relative demand used when generating demo preferences. */
  popularity: number;
  /** Share of students past this course's semester who have already passed it. */
  completionRate: number;
}

export const AI_COURSE_CODE = 'CS401';
export const DEMO_ELECTIVE_CODES = ['CS401', 'CS402', 'CS403', 'CS404'] as const;

/**
 * Ordered so every prerequisite appears before the courses that need it
 * (the student generator relies on this when assigning completed courses).
 */
export const COURSES: readonly CourseSeed[] = [
  // Foundations: most senior students have passed these.
  {
    code: 'MA201',
    name: 'Probability and Statistics',
    departmentCode: 'MATH',
    credits: 3,
    description: 'Random variables, distributions, estimation and hypothesis testing.',
    minSemester: 2,
    minCredits: 15,
    prerequisites: [],
    eligiblePrograms: [],
    relevantPrograms: ['BSC-MATH', 'BTECH-CSE'],
    capacity: 80,
    popularity: 2,
    completionRate: 0.9,
  },
  {
    code: 'MA202',
    name: 'Linear Algebra',
    departmentCode: 'MATH',
    credits: 3,
    description: 'Vector spaces, linear maps, eigenvalues and matrix decompositions.',
    minSemester: 2,
    minCredits: 15,
    prerequisites: [],
    eligiblePrograms: [],
    relevantPrograms: ['BSC-MATH'],
    capacity: 80,
    popularity: 1.5,
    completionRate: 0.88,
  },
  {
    code: 'CS201',
    name: 'Data Structures and Algorithms',
    departmentCode: 'CSE',
    credits: 4,
    description: 'Lists, trees, graphs, hashing and algorithm analysis.',
    minSemester: 3,
    minCredits: 30,
    prerequisites: [],
    eligiblePrograms: ['BTECH-CSE', 'BTECH-ECE', 'BSC-MATH'],
    relevantPrograms: ['BTECH-CSE'],
    capacity: 60,
    popularity: 3,
    completionRate: 0.92,
  },
  {
    code: 'CS202',
    name: 'Database Management Systems',
    departmentCode: 'CSE',
    credits: 4,
    description: 'Relational model, SQL, normalisation, transactions and indexing.',
    minSemester: 4,
    minCredits: 50,
    prerequisites: ['CS201'],
    eligiblePrograms: ['BTECH-CSE', 'BTECH-ECE', 'BSC-MATH'],
    relevantPrograms: ['BTECH-CSE'],
    capacity: 50,
    popularity: 3,
    completionRate: 0.85,
  },
  {
    code: 'CS301',
    name: 'Operating Systems',
    departmentCode: 'CSE',
    credits: 4,
    description: 'Processes, scheduling, memory management, file systems and concurrency.',
    minSemester: 4,
    minCredits: 50,
    prerequisites: ['CS201'],
    eligiblePrograms: ['BTECH-CSE', 'BTECH-ECE'],
    relevantPrograms: ['BTECH-CSE'],
    capacity: 45,
    popularity: 2,
    completionRate: 0.8,
  },
  {
    code: 'CS302',
    name: 'Computer Networks',
    departmentCode: 'CSE',
    credits: 4,
    description: 'Layered architecture, TCP/IP, routing, congestion control and sockets.',
    minSemester: 4,
    minCredits: 50,
    prerequisites: ['CS201'],
    eligiblePrograms: ['BTECH-CSE', 'BTECH-ECE'],
    relevantPrograms: ['BTECH-CSE', 'BTECH-ECE'],
    capacity: 45,
    popularity: 2,
    completionRate: 0.8,
  },

  // The demo case: AI is heavily oversubscribed; its usual alternatives follow.
  {
    code: 'CS401',
    name: 'Artificial Intelligence',
    departmentCode: 'CSE',
    credits: 4,
    description: 'Search, knowledge representation, planning and an introduction to learning.',
    minSemester: 5,
    minCredits: 80,
    prerequisites: ['CS201', 'MA201'],
    eligiblePrograms: ['BTECH-CSE', 'BTECH-ECE', 'BSC-MATH'],
    relevantPrograms: ['BTECH-CSE', 'BSC-MATH'],
    capacity: 20,
    popularity: 10,
    completionRate: 0,
  },
  {
    code: 'CS402',
    name: 'Cloud Security',
    departmentCode: 'CSE',
    credits: 4,
    description: 'Identity, isolation, encryption and threat models for cloud platforms.',
    minSemester: 5,
    minCredits: 80,
    prerequisites: ['CS302'],
    eligiblePrograms: ['BTECH-CSE', 'BTECH-ECE'],
    relevantPrograms: ['BTECH-CSE'],
    capacity: 30,
    popularity: 6,
    completionRate: 0,
  },
  {
    code: 'CS403',
    name: 'Distributed Systems',
    departmentCode: 'CSE',
    credits: 4,
    description: 'Consistency, consensus, replication and fault tolerance.',
    minSemester: 6,
    minCredits: 90,
    prerequisites: ['CS301'],
    eligiblePrograms: ['BTECH-CSE'],
    relevantPrograms: ['BTECH-CSE'],
    capacity: 30,
    popularity: 5,
    completionRate: 0,
  },
  {
    code: 'CS404',
    name: 'Blockchain Technology',
    departmentCode: 'CSE',
    credits: 3,
    description: 'Distributed ledgers, consensus protocols and smart contracts.',
    minSemester: 5,
    minCredits: 70,
    prerequisites: ['CS201'],
    eligiblePrograms: ['BTECH-CSE', 'BTECH-ECE', 'BBA'],
    relevantPrograms: ['BTECH-CSE'],
    capacity: 25,
    popularity: 4,
    completionRate: 0,
  },

  // Other electives: some popular, some undersubscribed.
  {
    code: 'CS405',
    name: 'Machine Learning',
    departmentCode: 'CSE',
    credits: 4,
    description: 'Supervised and unsupervised learning, model evaluation and regularisation.',
    minSemester: 5,
    minCredits: 80,
    prerequisites: ['MA201', 'MA202'],
    eligiblePrograms: ['BTECH-CSE', 'BTECH-ECE', 'BSC-MATH'],
    relevantPrograms: ['BTECH-CSE', 'BSC-MATH'],
    capacity: 40,
    popularity: 8,
    completionRate: 0,
  },
  {
    code: 'CS406',
    name: 'Human-Computer Interaction',
    departmentCode: 'CSE',
    credits: 3,
    description: 'User research, prototyping, usability evaluation and accessibility.',
    minSemester: 4,
    minCredits: 50,
    prerequisites: [],
    eligiblePrograms: [],
    relevantPrograms: ['BTECH-CSE'],
    capacity: 35,
    popularity: 2,
    completionRate: 0,
  },
  {
    code: 'EC301',
    name: 'Embedded Systems',
    departmentCode: 'ECE',
    credits: 4,
    description: 'Microcontrollers, real-time constraints and hardware/software co-design.',
    minSemester: 5,
    minCredits: 70,
    prerequisites: [],
    eligiblePrograms: ['BTECH-ECE', 'BTECH-CSE'],
    relevantPrograms: ['BTECH-ECE'],
    capacity: 40,
    popularity: 3,
    completionRate: 0,
  },
  {
    code: 'EC302',
    name: 'VLSI Design',
    departmentCode: 'ECE',
    credits: 4,
    description: 'CMOS logic, layout, timing analysis and design automation.',
    minSemester: 6,
    minCredits: 90,
    prerequisites: [],
    eligiblePrograms: ['BTECH-ECE'],
    relevantPrograms: ['BTECH-ECE'],
    capacity: 30,
    popularity: 1,
    completionRate: 0,
  },
  {
    code: 'EC401',
    name: 'Internet of Things',
    departmentCode: 'ECE',
    credits: 3,
    description: 'Sensors, low-power networking, edge computing and IoT security.',
    minSemester: 5,
    minCredits: 70,
    prerequisites: [],
    eligiblePrograms: ['BTECH-ECE', 'BTECH-CSE', 'BTECH-ME'],
    relevantPrograms: ['BTECH-ECE'],
    capacity: 35,
    popularity: 4,
    completionRate: 0,
  },
  {
    code: 'ME301',
    name: 'Robotics',
    departmentCode: 'ME',
    credits: 4,
    description: 'Kinematics, dynamics, control and robot perception.',
    minSemester: 5,
    minCredits: 70,
    prerequisites: [],
    eligiblePrograms: ['BTECH-ME', 'BTECH-ECE', 'BTECH-CSE'],
    relevantPrograms: ['BTECH-ME'],
    capacity: 30,
    popularity: 4,
    completionRate: 0,
  },
  {
    code: 'ME302',
    name: 'Renewable Energy Systems',
    departmentCode: 'ME',
    credits: 3,
    description: 'Solar, wind and storage technologies and their integration.',
    minSemester: 4,
    minCredits: 50,
    prerequisites: [],
    eligiblePrograms: [],
    relevantPrograms: ['BTECH-ME'],
    capacity: 40,
    popularity: 1,
    completionRate: 0,
  },
  {
    code: 'MA301',
    name: 'Numerical Methods',
    departmentCode: 'MATH',
    credits: 3,
    description: 'Root finding, interpolation, numerical integration and ODE solvers.',
    minSemester: 4,
    minCredits: 50,
    prerequisites: ['MA202'],
    eligiblePrograms: [],
    relevantPrograms: ['BSC-MATH'],
    capacity: 50,
    popularity: 1,
    completionRate: 0,
  },
  {
    code: 'MG301',
    name: 'Financial Management',
    departmentCode: 'MGMT',
    credits: 3,
    description: 'Time value of money, capital budgeting and financial statements.',
    minSemester: 3,
    minCredits: 30,
    prerequisites: [],
    eligiblePrograms: [],
    relevantPrograms: ['BBA'],
    capacity: 60,
    popularity: 2,
    completionRate: 0,
  },
  {
    code: 'MG302',
    name: 'Entrepreneurship and Innovation',
    departmentCode: 'MGMT',
    credits: 3,
    description: 'Opportunity discovery, business models and pitching a venture.',
    minSemester: 4,
    minCredits: 40,
    prerequisites: [],
    eligiblePrograms: [],
    relevantPrograms: ['BBA'],
    capacity: 40,
    popularity: 6,
    completionRate: 0,
  },
];

export function findCourseSeed(code: string): CourseSeed {
  const course = COURSES.find((candidate) => candidate.code === code);
  if (!course) {
    throw new Error(`Unknown course code ${code}`);
  }
  return course;
}
