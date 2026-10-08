import { useEffect, useState } from 'react';

// A three-page site doesn't need a router library: the History API plus popstate is enough.
export type Route = 'home' | 'about' | 'privacy';

const paths: Record<Route, string> = { home: '/', about: '/about', privacy: '/privacy' };

export const pathOf = (route: Route) => paths[route];

export function routeFromPath(pathname: string): Route {
  return (Object.keys(paths) as Route[]).find((route) => paths[route] === pathname) ?? 'home';
}

export function navigate(route: Route) {
  window.history.pushState(null, '', paths[route]);
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
