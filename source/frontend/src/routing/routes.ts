import { useEffect, useState } from 'react';

// A few pages don't need a router library: the History API plus popstate is enough.
export type Route = 'home' | 'history' | 'photos' | 'about' | 'privacy' | 'admin';

const paths: Record<Route, string> = {
  home: '/',
  history: '/history',
  photos: '/photos',
  about: '/about',
  privacy: '/privacy',
  admin: '/admin',
};

export const pathOf = (route: Route) => paths[route];

export function routeFromPath(pathname: string): Route {
  if (photoIdFromPath(pathname) !== null) return 'photos';
  return (Object.keys(paths) as Route[]).find((route) => paths[route] === pathname) ?? 'home';
}

// One photo's own address: the photos page with its viewer open on it, so a picture of King can be sent as a link.
export const photoPath = (id: string) => `${paths.photos}/${encodeURIComponent(id)}`;

export function photoIdFromPath(pathname: string): string | null {
  const match = /^\/photos\/([^/]+)$/.exec(pathname);
  return match ? decodeURIComponent(match[1]) : null;
}

/** The photo the address names, following the browser's Back and Forward (and the page's own pushes, which announce themselves). */
export function usePhotoId(): string | null {
  const [id, setId] = useState(() => photoIdFromPath(window.location.pathname));
  useEffect(() => {
    const onPopState = () => setId(photoIdFromPath(window.location.pathname));
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);
  return id;
}

export function navigate(route: Route) {
  window.history.pushState(null, '', paths[route]);
  // A new page starts at its top; otherwise it opens wherever the last one was scrolled to (e.g. the footer).
  window.scrollTo(0, 0);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => routeFromPath(window.location.pathname));
  useEffect(() => {
    const onPopState = () => setRoute(routeFromPath(window.location.pathname));
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);
  return route;
}
