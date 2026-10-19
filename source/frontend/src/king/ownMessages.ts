import { defineMessages, type NoMessageValues } from 'react-intl';

export type What = 'fed' | 'seen' | 'photo';
type Values = {
  undo: NoMessageValues;
  remove: NoMessageValues;
  confirm: { what: What };
  yes: { what: What };
  keep: NoMessageValues;
  tooLate: { what: What };
  failed: { what: What };
  undone: { what: 'entry' | 'photo' };
};

export const ownMessages = defineMessages<Values>({
  undo: { id: 'own.undo', defaultMessage: 'Undo', description: 'Button under one of this device’s own entries, within 10 minutes of logging it' },
  remove: { id: 'own.remove', defaultMessage: 'Remove', description: 'Button under a photo this device shared, within 10 minutes of sharing it' },
  confirm: {
    id: 'own.confirm',
    defaultMessage: '{what, select, fed {Undo this feeding?} seen {Undo this sighting?} other {Remove this photo?}}',
    description: 'Asked in place before undoing one’s own entry or removing one’s own photo',
  },
  yes: {
    id: 'own.yes',
    defaultMessage: '{what, select, photo {Remove it} other {Undo it}}',
    description: 'Confirms undoing one’s own entry, or removing one’s own photo',
  },
  keep: { id: 'own.keep', defaultMessage: 'Keep it', description: 'Answers no to undoing or removing; nothing changes' },
  tooLate: {
    id: 'own.tooLate',
    defaultMessage:
      '{what, select, photo {It’s too late to remove it — photos can only be removed for 10 minutes.} other {It’s too late to undo — entries can only be undone for 10 minutes.}}',
    description: 'The server refused because the entry or photo is older than 10 minutes',
  },
  failed: {
    id: 'own.failed',
    defaultMessage: '{what, select, photo {Couldn’t remove the photo. Try again.} other {Couldn’t undo it. Try again.}}',
    description: 'Undoing or removing failed for another reason (offline, server error)',
  },
  undone: {
    id: 'own.undone',
    defaultMessage: '{what, select, photo {Your photo was removed.} other {Your entry was undone.}}',
    description: 'Said, and focused, after one’s own entry was undone or photo removed (its buttons are gone)',
  },
});
