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

// jsdom 30 has no <dialog> methods; enough of them for the photo viewer (Escape is the component's own key handler).
const dialog = (globalThis.HTMLDialogElement ?? HTMLElement).prototype as HTMLDialogElement;
dialog.showModal ??= function (this: HTMLDialogElement) {
  this.setAttribute('open', '');
};
dialog.close ??= function (this: HTMLDialogElement) {
  this.removeAttribute('open');
  this.dispatchEvent(new Event('close'));
};
