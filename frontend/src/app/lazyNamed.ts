import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

/**
 * React.lazy for modules with named exports:
 *   const CartPage = lazyNamed(() => import('../pages/student/CartPage'), 'CartPage');
 * Each call becomes its own chunk, so a page's code loads only when visited.
 */
export function lazyNamed<K extends string, M extends Record<K, ComponentType>>(
  loader: () => Promise<M>,
  name: K,
): LazyExoticComponent<M[K]> {
  return lazy(async () => ({ default: (await loader())[name] }));
}
