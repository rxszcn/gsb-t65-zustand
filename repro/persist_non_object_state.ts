// Probe E: persist + non-object (primitive) state, and the unconditional set() on hydrate
const mkMem = (initial?: [string, string]) => {
  const mem = new Map<string, string>()
  if (initial) mem.set(initial[0], initial[1])
  return {
    mem,
    state: {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
      removeItem: (k: string) => void mem.delete(k),
    } as any,
  }
}
const { createStore } = await import(
  '../src/vanilla.ts'
)
const { persist, createJSONStorage } = await import(
  '../src/middleware.ts'
)

// --- 1) EMPTY storage, primitive state (vanilla supports this: create(() => 1))
{
  const { mem, state } = mkMem()
  const store: any = createStore(
    persist(() => 0, {
      name: 'e1',
      storage: createJSONStorage(() => state),
    } as any),
  )
  console.log('E1 empty storage | getState =', JSON.stringify(store.getState()), typeof store.getState())
  console.log('E1 empty storage | getInitialState =', JSON.stringify(store.getInitialState()))
  console.log('E1 storage content =', JSON.stringify([...mem]))
}

// --- 2) primitive state + object store, persisted value present
{
  const { mem, state } = mkMem(['e2', JSON.stringify({ state: 5, version: 0 })])
  const store: any = createStore(
    persist(() => 0, { name: 'e2', storage: createJSONStorage(() => state) } as any),
  )
  console.log('E2 hydrated primitive =', JSON.stringify(store.getState()), typeof store.getState())
  store.setState(6 as any)
  console.log('E2 after setState(6), storage =', mem.get('e2'))
}

// --- 3) object state, EMPTY storage: does hydration still replace the state object?
{
  const { state } = mkMem()
  let notified = 0
  const store: any = createStore(
    persist(() => ({ count: 0 }), { name: 'e3', storage: createJSONStorage(() => state) } as any),
  )
  const initial = store.getInitialState()
  store.subscribe(() => notified++)
  store.persist.rehydrate()
  console.log('E3 listeners notified by a no-op rehydrate =', notified)
  console.log('E3 getState() === getInitialState() ?', store.getState() === initial)
  console.log('E3 getState() === getState() before ?', Object.is(store.getState(), initial))
}

// --- 4) object state, primitive *value* written by an action: what lands in storage?
{
  const { mem, state } = mkMem()
  const store: any = createStore(
    persist((set: any) => ({ n: 1, inc: () => set((s: any) => ({ n: s.n + 1 })) }), {
      name: 'e4',
      storage: createJSONStorage(() => state),
    } as any),
  )
  store.getState().inc()
  console.log('E4 storage =', mem.get('e4'), '| state =', JSON.stringify(store.getState()))
}
