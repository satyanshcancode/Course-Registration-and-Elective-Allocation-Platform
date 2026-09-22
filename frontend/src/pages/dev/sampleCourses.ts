/**
 * Realistic, deterministic course rows for the component gallery (dev only).
 * Numbers come from a tiny seeded generator so screenshots are stable.
 */
import type { AllocationOutcome } from '@course-reg/shared';

export interface SampleCourse {
  id: string;
  code: string;
  name: string;
  department: string;
  credits: number;
  capacity: number;
  allocated: number;
  demand: number;
  opensAt: Date;
  outcome: AllocationOutcome | null;
}

const CATALOGUE: readonly [string, string, string][] = [
  ['CS', 'Computer Science', 'Data Structures and Algorithms'],
  ['CS', 'Computer Science', 'Database Management Systems'],
  ['CS', 'Computer Science', 'Operating Systems'],
  ['CS', 'Computer Science', 'Computer Networks'],
  ['CS', 'Computer Science', 'Artificial Intelligence'],
  ['CS', 'Computer Science', 'Cloud Security'],
  ['CS', 'Computer Science', 'Distributed Systems'],
  ['CS', 'Computer Science', 'Blockchain Technology'],
  ['CS', 'Computer Science', 'Machine Learning'],
  ['CS', 'Computer Science', 'Human-Computer Interaction'],
  ['CS', 'Computer Science', 'Compiler Design'],
  ['CS', 'Computer Science', 'Theory of Computation'],
  ['CS', 'Computer Science', 'Computer Graphics'],
  ['CS', 'Computer Science', 'Software Engineering'],
  ['CS', 'Computer Science', 'Information Retrieval'],
  ['CS', 'Computer Science', 'Natural Language Processing'],
  ['EC', 'Electronics', 'Embedded Systems'],
  ['EC', 'Electronics', 'VLSI Design'],
  ['EC', 'Electronics', 'Internet of Things'],
  ['EC', 'Electronics', 'Digital Signal Processing'],
  ['EC', 'Electronics', 'Wireless Communication'],
  ['EC', 'Electronics', 'Analog Circuits'],
  ['EC', 'Electronics', 'Microwave Engineering'],
  ['EC', 'Electronics', 'Control Systems'],
  ['ME', 'Mechanical', 'Robotics'],
  ['ME', 'Mechanical', 'Renewable Energy Systems'],
  ['ME', 'Mechanical', 'Thermodynamics'],
  ['ME', 'Mechanical', 'Fluid Mechanics'],
  ['ME', 'Mechanical', 'Manufacturing Processes'],
  ['ME', 'Mechanical', 'Finite Element Methods'],
  ['ME', 'Mechanical', 'Automotive Engineering'],
  ['MA', 'Mathematics', 'Probability and Statistics'],
  ['MA', 'Mathematics', 'Linear Algebra'],
  ['MA', 'Mathematics', 'Numerical Methods'],
  ['MA', 'Mathematics', 'Discrete Mathematics'],
  ['MA', 'Mathematics', 'Real Analysis'],
  ['MA', 'Mathematics', 'Optimisation Techniques'],
  ['MA', 'Mathematics', 'Graph Theory'],
  ['MA', 'Mathematics', 'Stochastic Processes'],
  ['MG', 'Management', 'Financial Management'],
  ['MG', 'Management', 'Entrepreneurship and Innovation'],
  ['MG', 'Management', 'Business Analytics'],
  ['MG', 'Management', 'Organisational Behaviour'],
  ['MG', 'Management', 'Marketing Management'],
  ['MG', 'Management', 'Operations Research'],
  ['MG', 'Management', 'Project Management'],
  ['PH', 'Physics', 'Quantum Mechanics'],
  ['PH', 'Physics', 'Solid State Physics'],
  ['PH', 'Physics', 'Optics and Photonics'],
  ['PH', 'Physics', 'Computational Physics'],
  ['HS', 'Humanities', 'Technical Writing'],
  ['HS', 'Humanities', 'Ethics in Technology'],
  ['HS', 'Humanities', 'Economics for Engineers'],
  ['HS', 'Humanities', 'Science, Technology and Society'],
  ['HS', 'Humanities', 'Public Speaking'],
  ['CS', 'Computer Science', 'Computer Vision'],
  ['CS', 'Computer Science', 'Parallel Programming'],
  ['EC', 'Electronics', 'Power Electronics'],
  ['MA', 'Mathematics', 'Cryptography'],
  ['MG', 'Management', 'Supply Chain Management'],
];

/** Mulberry32, inlined so dev data has no dependency on backend code. */
function seeded(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const OUTCOMES: readonly (AllocationOutcome | null)[] = [
  'ALLOCATED',
  'WAITLISTED',
  'NOT_ALLOCATED',
  null,
  null,
];

export function buildSampleCourses(): SampleCourse[] {
  const random = seeded(2026);
  const counters = new Map<string, number>();
  const base = Date.UTC(2026, 8, 21, 10, 0);

  return CATALOGUE.map(([prefix, department, name], index) => {
    const level = (counters.get(prefix) ?? 0) + 1;
    counters.set(prefix, level);
    const capacity = [20, 25, 30, 35, 40, 45, 50, 60, 80][Math.floor(random() * 9)] ?? 40;
    const allocated = Math.min(capacity, Math.floor(random() * (capacity + 12)));
    const demand = Math.round(capacity * (0.2 + random() * 5.5));
    return {
      id: `sample-${index + 1}`,
      code: `${prefix}${200 + level * 7 + (index % 3)}`,
      name,
      department,
      credits: [3, 3, 4, 4, 4, 2][Math.floor(random() * 6)] ?? 3,
      capacity,
      allocated,
      demand,
      opensAt: new Date(base + Math.floor(random() * 6) * 24 * 60 * 60 * 1000),
      outcome: OUTCOMES[Math.floor(random() * OUTCOMES.length)] ?? null,
    };
  });
}
