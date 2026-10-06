import { photoUrlFor } from '../../utils/coursePhoto';
import styles from './CoursePhoto.module.css';

export interface CoursePhotoProps {
  /** The course's own code, which picks the photograph. */
  code: string;
  /**
   * How tall the band is. `card` is the catalogue's strip; `hero` is the
   * taller banner a course's own page opens with.
   */
  height?: 'card' | 'hero';
  /** Rendered over the photograph, e.g. the card's "⋮" menu. */
  children?: React.ReactNode;
}

/**
 * The band of photography at the top of a course card.
 *
 * Dark, wide and cinematic, chosen by hashing the course code so a course
 * always wears the same one. The photographs are CC0, stored in this
 * repository and credited in the README — nothing is hotlinked.
 *
 * It is decoration: the code, name and department are all written out
 * underneath, so the image itself carries no information and is hidden from
 * assistive technology.
 */
export function CoursePhoto({ code, height = 'card', children }: CoursePhotoProps) {
  return (
    <div className={styles.band} data-height={height}>
      <img className={styles.image} src={photoUrlFor(code)} alt="" loading="lazy" decoding="async" />
      {children}
    </div>
  );
}
