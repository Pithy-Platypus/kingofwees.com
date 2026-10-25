import { defineMessages, type NoMessageValues } from 'react-intl';

// The photo viewer's labels (PhotoViewer.tsx), in their own file like adminMessages.ts.
type Values = {
  close: NoMessageValues;
  previous: NoMessageValues;
  next: NoMessageValues;
  position: { n: number; total: number };
  loadingOlder: NoMessageValues;
  open: NoMessageValues;
  gone: NoMessageValues;
};

export const viewerMessages = defineMessages<Values>({
  close: { id: 'viewer.close', defaultMessage: 'Close', description: 'Closes the photo viewer' },
  previous: { id: 'viewer.previous', defaultMessage: 'Previous photo', description: 'Shows the newer photo in the viewer' },
  next: { id: 'viewer.next', defaultMessage: 'Next photo', description: 'Shows the older photo in the viewer' },
  position: { id: 'viewer.position', defaultMessage: '{n} of {total}', description: 'Which photo the viewer shows, e.g. 3 of 27' },
  loadingOlder: {
    id: 'viewer.loadingOlder',
    defaultMessage: 'Loading older photos…',
    description: 'The viewer is fetching the next page of older photos',
  },
  open: { id: 'viewer.open', defaultMessage: 'Open the picture', description: 'Link to the photo file itself' },
  gone: {
    id: 'viewer.gone',
    defaultMessage: 'That photo isn’t here any more.',
    description: 'A link named a photo that is hidden or was removed',
  },
});
