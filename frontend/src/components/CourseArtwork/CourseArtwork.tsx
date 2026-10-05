import type { CSSProperties } from 'react';
import { hueFor, motifForCourse, type ArtworkMotif } from '../../utils/courseArtwork';
import styles from './CourseArtwork.module.css';

export interface CourseArtworkProps {
  /** The course's own code, which picks the motif. */
  code: string;
  /** The department code, which picks the hue every course in it shares. */
  departmentCode: string;
}

/**
 * The band of abstract artwork at the top of a course card.
 *
 * Original and generated: no photograph, no licence, no credit, no request.
 * The department decides the hue and the course decides the motif, so the
 * catalogue reads as departments at a glance while no two neighbouring cards
 * are the same picture. It is decoration — the code, name and department are
 * all written out underneath — so it is hidden from assistive technology.
 */
export function CourseArtwork({ code, departmentCode }: CourseArtworkProps) {
  const hue = hueFor(departmentCode, code);
  // Only the hue ANGLE is data; the stylesheet owns saturation and lightness,
  // which is what keeps the artwork inside the theme in light and dark alike.
  const style = { '--art-hue': hue } as CSSProperties;

  return (
    <div className={styles.art} style={style}>
      <svg
        className={styles.motif}
        viewBox="0 0 120 48"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
        focusable="false"
      >
        <Motif motif={motifForCourse(code)} />
      </svg>
    </div>
  );
}

function Motif({ motif }: { motif: ArtworkMotif }) {
  switch (motif) {
    case 'grid':
      return (
        <g className={styles.stroke}>
          {Array.from({ length: 13 }, (_, column) => (
            <line key={column} x1={column * 10} y1="0" x2={column * 10 - 24} y2="48" />
          ))}
          {Array.from({ length: 5 }, (_, row) => (
            <line key={row} x1="-24" y1={row * 12} x2="120" y2={row * 12} />
          ))}
        </g>
      );

    case 'arcs':
      return (
        <g className={styles.stroke}>
          {Array.from({ length: 7 }, (_, ring) => (
            <circle key={ring} cx="24" cy="48" r={14 + ring * 13} />
          ))}
        </g>
      );

    case 'bars':
      return (
        <g className={styles.fill}>
          {Array.from({ length: 10 }, (_, bar) => (
            <rect
              key={bar}
              x={bar * 12 + 2}
              y={48 - (6 + ((bar * 7) % 34))}
              width="7"
              height={6 + ((bar * 7) % 34)}
              rx="2"
            />
          ))}
        </g>
      );

    case 'rings':
      return (
        <g className={styles.fill}>
          {Array.from({ length: 24 }, (_, dot) => (
            <circle
              key={dot}
              cx={(dot % 8) * 16 + 8}
              cy={Math.floor(dot / 8) * 16 + 8}
              r={2 + ((dot * 3) % 5)}
            />
          ))}
        </g>
      );
  }
}
