// zustand's React hook reads `getInitialState()` as the server snapshot, so `renderToStaticMarkup`
// never sees `setState` updates. For SSR render tests, write the slice into both the live state
// and the initial-state object. Call it again with the defaults in `beforeEach`.

type SsrStore<S> = {
	setState: (partial: Partial<S>) => void;
	getInitialState: () => S;
};

export function setSsrStore<S>(store: SsrStore<S>, slice: Partial<S>): void {
	store.setState(slice);
	Object.assign(store.getInitialState() as object, slice);
}
