import { describe, expect, it } from 'vitest';
import { findRowAction } from './tableActions';

function tableBody(): HTMLTableSectionElement {
  const table = document.createElement('table');
  table.innerHTML = `
    <tbody>
      <tr>
        <td>
          <button data-action="view" data-course-code="CS401"><span>View</span><svg><path></path></svg></button>
          <button data-action="view" data-course-code="CS402" disabled>View</button>
        </td>
        <td class="plain">CS401</td>
      </tr>
    </tbody>`;
  document.body.append(table);
  return table.tBodies[0]!;
}

describe('findRowAction (event delegation)', () => {
  it('finds the button from a click on something nested inside it', () => {
    const tbody = tableBody();
    const expected = { action: 'view', courseCode: 'CS401' };
    expect(findRowAction(tbody.querySelector('path'), tbody)).toEqual(expected);
    expect(findRowAction(tbody.querySelector('span'), tbody)).toEqual(expected);
  });

  it('ignores clicks outside action buttons, on disabled buttons and outside the table', () => {
    const tbody = tableBody();
    expect(findRowAction(tbody.querySelector('.plain'), tbody)).toBeNull();
    expect(findRowAction(tbody.querySelector('[disabled]'), tbody)).toBeNull();
    expect(findRowAction(null, tbody)).toBeNull();

    const outside = document.createElement('button');
    outside.dataset.action = 'view';
    outside.dataset.courseCode = 'CS999';
    document.body.append(outside);
    expect(findRowAction(outside, tbody)).toBeNull();
  });
});
