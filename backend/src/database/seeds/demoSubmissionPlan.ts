/**
 * Pure, deterministic plan of demo preference submissions: who submits, in
 * which order they arrive, and which courses they rank. Only courses a
 * student is eligible for are ever ranked.
 */
import { MAX_PREFERENCES } from '@course-reg/shared';
import type { SeededRandom } from '../../utils/random.js';
import { AI_COURSE_CODE, DEMO_ELECTIVE_CODES } from './catalog.js';

export interface PlanStudent {
  id: string;
  rollNumber: string;
  eligibleCourseCodes: ReadonlySet<string>;
  /** Fixed preferences for named demo accounts. */
  fixedPreferences?: readonly string[];
}

export interface PlannedSubmission {
  studentId: string;
  rollNumber: string;
  /** Course codes in rank order (index 0 = rank 1). */
  courseCodes: string[];
  /** Seconds after the window opened; defines FCFS arrival order. */
  arrivalOffsetSeconds: number;
  idempotencyKey: string;
}

export interface PlanOptions {
  targetSubmissions: number;
  minimumAiFirstChoices: number;
  /** Share of AI-eligible students who rank AI first. */
  aiFirstShare: number;
  popularity: ReadonlyMap<string, number>;
  arrivalWindowSeconds: number;
}

export const DEFAULT_PLAN_OPTIONS: Omit<PlanOptions, 'popularity'> = {
  targetSubmissions: 150,
  minimumAiFirstChoices: 100,
  aiFirstShare: 0.9,
  arrivalWindowSeconds: 3_600,
};

function pickDistinctWeighted(
  random: SeededRandom,
  candidates: readonly string[],
  count: number,
  weight: (code: string) => number,
): string[] {
  const remaining = [...candidates];
  const picked: string[] = [];
  while (picked.length < count && remaining.length > 0) {
    const choice = random.weightedPick(remaining, weight);
    picked.push(choice);
    remaining.splice(remaining.indexOf(choice), 1);
  }
  return picked;
}

/** AI, Cloud Security, Distributed Systems, Blockchain — filtered by eligibility. */
function aiFirstPreferences(
  random: SeededRandom,
  student: PlanStudent,
  weight: (code: string) => number,
): string[] {
  const codes: string[] = DEMO_ELECTIVE_CODES.filter((code) =>
    student.eligibleCourseCodes.has(code),
  );
  const [second, third] = [codes[1], codes[2]];
  if (second !== undefined && third !== undefined && random.chance(0.25)) {
    codes[1] = third;
    codes[2] = second;
  }
  const extras = [...student.eligibleCourseCodes].filter((code) => !codes.includes(code));
  const list = [...codes];
  if (random.chance(0.5)) {
    list.push(...pickDistinctWeighted(random, extras, 1, weight));
  }
  return list.slice(0, MAX_PREFERENCES);
}

function otherPreferences(
  random: SeededRandom,
  student: PlanStudent,
  weight: (code: string) => number,
): string[] {
  const withoutAi = [...student.eligibleCourseCodes].filter((code) => code !== AI_COURSE_CODE);
  const list = pickDistinctWeighted(random, withoutAi, random.int(2, 4), weight);
  // Some AI-eligible students still want AI, just not as first choice.
  if (student.eligibleCourseCodes.has(AI_COURSE_CODE) && list.length > 0 && random.chance(0.5)) {
    list.splice(1, 0, AI_COURSE_CODE);
  }
  return list.slice(0, MAX_PREFERENCES);
}

export function planDemoSubmissions(
  students: readonly PlanStudent[],
  random: SeededRandom,
  options: PlanOptions,
): PlannedSubmission[] {
  const weight = (code: string) => options.popularity.get(code) ?? 1;
  const byRoll = [...students].sort((a, b) => a.rollNumber.localeCompare(b.rollNumber));

  const fixed = byRoll.filter((student) => student.fixedPreferences);
  const regular = byRoll.filter((student) => !student.fixedPreferences);
  const aiEligible = random.shuffle(
    regular.filter((student) => student.eligibleCourseCodes.has(AI_COURSE_CODE)),
  );
  const aiFirstCount = Math.ceil(aiEligible.length * options.aiFirstShare);
  const others = random.shuffle(
    regular.filter(
      (student) =>
        !student.eligibleCourseCodes.has(AI_COURSE_CODE) && student.eligibleCourseCodes.size >= 2,
    ),
  );

  const choices: { student: PlanStudent; courseCodes: string[] }[] = [
    ...fixed.map((student) => ({
      student,
      courseCodes: (student.fixedPreferences ?? []).filter((code) =>
        student.eligibleCourseCodes.has(code),
      ),
    })),
    ...aiEligible.map((student, index) => ({
      student,
      courseCodes:
        index < aiFirstCount
          ? aiFirstPreferences(random, student, weight)
          : otherPreferences(random, student, weight),
    })),
  ];

  const remaining = Math.max(0, options.targetSubmissions - choices.length);
  choices.push(
    ...others.slice(0, remaining).map((student) => ({
      student,
      courseCodes: otherPreferences(random, student, weight),
    })),
  );

  const planned = choices
    .filter(({ courseCodes }) => courseCodes.length > 0)
    .map(({ student, courseCodes }): PlannedSubmission => ({
      studentId: student.id,
      rollNumber: student.rollNumber,
      courseCodes,
      arrivalOffsetSeconds: random.int(0, options.arrivalWindowSeconds - 1),
      idempotencyKey: random.uuid(),
    }))
    // Arrival order; roll number breaks ties so the order is total.
    .sort(
      (a, b) =>
        a.arrivalOffsetSeconds - b.arrivalOffsetSeconds || a.rollNumber.localeCompare(b.rollNumber),
    );

  const aiFirst = planned.filter((submission) => submission.courseCodes[0] === AI_COURSE_CODE);
  if (aiFirst.length < options.minimumAiFirstChoices) {
    throw new Error(
      `Demo plan has only ${aiFirst.length} AI first choices (need ${options.minimumAiFirstChoices}); ` +
        'the seed data no longer supports the oversubscription demo',
    );
  }
  return planned;
}
