import { createIntl } from 'react-intl';
import { describe, expect, it } from 'vitest';
import { event, photo, spot } from '../test/fakeApi';
import { entryPhotoAlt, photoAlt } from './messages';

// English, in the test's own time zone (dates are shown in the reader's).
const intl = createIntl({ locale: 'en-US', messages: {} });
const at = '2026-10-08T16:12:00';

describe('photo alt texts', () => {
  it('says how a photo on a sighting was added, like its history line', () => {
    const sighting = event({ kind: 'seen', occurredAt: new Date(at).toISOString(), reporterName: 'Sarah' });

    expect(entryPhotoAlt(intl, sighting, [])).toBe('Photo from a sighting by Sarah, Oct 8, 2026, 4:12 PM');
  });

  it('names the place as history does: a feeding at its spot, a sighting near one', () => {
    const porch = spot('porch', 'Porch');
    const feeding = event({ kind: 'fed', occurredAt: new Date(at).toISOString(), reporterName: 'Kael', spotName: 'Porch' });
    const sighting = event({ kind: 'seen', occurredAt: new Date(at).toISOString(), location: porch.location });

    expect(entryPhotoAlt(intl, feeding, [porch])).toBe('Photo from a feeding by Kael at Porch, Oct 8, 2026, 4:12 PM');
    expect(entryPhotoAlt(intl, sighting, [porch])).toBe('Photo from a sighting by a neighbor near Porch, Oct 8, 2026, 4:12 PM');
  });

  it('says a shared photo was shared, by whom and on what day', () => {
    const shared = photo({ postedAt: new Date(at).toISOString(), reporterName: 'Sarah' });

    expect(photoAlt(intl, shared, [])).toBe('Photo shared by Sarah on Oct 8, 2026');
    expect(photoAlt(intl, { ...shared, reporterName: null }, [])).toBe('Photo shared by a neighbor on Oct 8, 2026');
  });

  it('describes a photo on an entry by its entry', () => {
    const entry = event({ kind: 'seen', occurredAt: new Date(at).toISOString(), reporterName: 'Sarah' });

    expect(photoAlt(intl, photo({ event: entry, reporterName: 'Sarah' }), [])).toBe(entryPhotoAlt(intl, entry, []));
  });
});
