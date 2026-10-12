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
  return (Object.keys(paths) as Route[]).find((route) => paths[route] === pathname) ?? 'home';
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
