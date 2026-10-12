import { defineMessages, type MessageTag, type NoMessageValues } from 'react-intl';

// Admin phrases shared by History's entry actions and the photos page.
export const adminMessages = defineMessages<{
  hidePhoto: NoMessageValues;
  confirmPhoto: NoMessageValues;
  yesPhoto: NoMessageValues;
  cancel: NoMessageValues;
  failed: NoMessageValues;
  hidden: { admin: MessageTag };
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
});
