import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// jsdom has no object URLs; photo previews only need a stand-in address.
URL.createObjectURL ??= () => 'blob:preview';
URL.revokeObjectURL ??= () => {};

afterEach(() => {
  cleanup();
  window.history.replaceState(null, '', '/');
  document.title = '';
});
