import { defineMessages, type IntlShape, type MessageTag, type NoMessageValues } from 'react-intl';
import type { HideReason } from '../king/admin';

// Admin phrases shared by History's entry actions and the photos page.
export const adminMessages = defineMessages<{
  hidePhoto: NoMessageValues;
  confirmPhoto: NoMessageValues;
  yesPhoto: NoMessageValues;
  cancel: NoMessageValues;
  failed: NoMessageValues;
  hidden: { admin: MessageTag };
  why: NoMessageValues;
  notePlain: NoMessageValues;
  noteRequired: NoMessageValues;
  notKing: NoMessageValues;
  showsPerson: NoMessageValues;
  rude: NoMessageValues;
  unlawful: NoMessageValues;
  other: NoMessageValues;
}>({
  hidePhoto: {
    id: 'admin.hidePhoto',
    defaultMessage: 'Hide this photo',
    description: 'Admin button under an entry with a photo: hides only the photo, the entry stays',
  },
  confirmPhoto: {
    id: 'admin.confirmPhoto',
    defaultMessage: 'Hide this photo from everyone? The entry stays.',
    description: 'Asked before hiding one photo',
  },
  yesPhoto: { id: 'admin.yesPhoto', defaultMessage: 'Hide photo', description: 'Confirms hiding one photo' },
  cancel: { id: 'admin.cancel', defaultMessage: 'Cancel', description: 'Closes the hide question without hiding' },
  failed: { id: 'admin.hideFailed', defaultMessage: 'Couldn’t hide it. Try again.', description: 'Shown when hiding fails' },
  hidden: {
    id: 'log.hidden',
    defaultMessage: 'Hidden. You can restore it on the <admin>admin page</admin>.',
    description: 'Shown to an admin after hiding an entry, a poster or a photo; <admin> links to the admin page',
  },
  why: { id: 'admin.hideWhy', defaultMessage: 'Why hide it?', description: 'Heading over the reasons for hiding a photo' },
  notePlain: { id: 'admin.hideNote', defaultMessage: 'Note (optional)', description: 'Label of the note about why a photo is hidden' },
  noteRequired: {
    id: 'admin.hideNoteRequired',
    defaultMessage: 'Note (required for Other)',
    description: 'Label of the note about why a photo is hidden, when the reason is Other',
  },
  notKing: { id: 'admin.reason.notKing', defaultMessage: 'Not King', description: 'Reason for hiding a photo: it isn’t King' },
  showsPerson: { id: 'admin.reason.showsPerson', defaultMessage: 'Shows a person', description: 'Reason for hiding a photo: a person is in it' },
  rude: { id: 'admin.reason.rude', defaultMessage: 'Rude or off-topic', description: 'Reason for hiding a photo' },
  unlawful: {
    id: 'admin.reason.unlawful',
    defaultMessage: 'Possibly unlawful',
    description: 'Reason for hiding a photo: it may be illegal (kept hidden, never deleted, in case it must be reported)',
  },
  other: { id: 'admin.reason.other', defaultMessage: 'Other', description: 'Reason for hiding a photo: something else (a note is required)' },
});

const reasonNote = defineMessages<{ withNote: { reason: string; note: string } }>({
  withNote: {
    id: 'admin.reasonWithNote',
    defaultMessage: '{reason}: “{note}”',
    description: 'Why a photo was hidden, with the admin’s note; {reason} is e.g. “Not King”',
  },
});

/** "Not King", or "Other: “a thumb over the lens”" — on /admin and in its activity log. */
export function describeReason(intl: IntlShape, reason: HideReason, note: string | null): string {
  const label = intl.formatMessage(adminMessages[reason]);
  return note ? intl.formatMessage(reasonNote.withNote, { reason: label, note }) : label;
}
