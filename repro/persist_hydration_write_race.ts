// 复现：异步水合落地后，内存里那份状态和盘上那份不是同一笔账
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const mkMem = (initial?: [string, string]) => {
  const mem = new Map<string, string>()
  if (initial) mem.set(initial[0], initial[1])
  return {
    mem,
    sync: {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
      removeItem: (k: string) => void mem.delete(k),
    } as any,
    async: {
      getItem: async (k: string) => {
        await sleep(10)
        return mem.get(k) ?? null
      },
      setItem: async (k: string, v: string) => {
        await sleep(10)
        mem.set(k, v)
      },
      removeItem: async (k: string) => void mem.delete(k),
    } as any,
  }
}
const { createStore } = await import('../src/vanilla.ts')
const { persist, createJSONStorage } = await import('../src/middleware.ts')

const objCfg = (state: any, extra?: any) =>
  ((set: any) => ({ n: 1, bump: (v: number) => set({ n: v }) })) as any

// W1) 异步 storage：水合在途时写了一次，落地之后内存与盘各留一半
{
  const { mem, async } = mkMem(['w1', JSON.stringify({ state: { n: 5 }, version: 0 })])
  const store: any = createStore(
    persist(objCfg(null), { name: 'w1', storage: createJSONStorage(() => async) } as any),
  )
  store.getState().bump(9)
  await sleep(150)
  console.log('W1 state =', JSON.stringify(store.getState()), '| storage =', mem.get('w1'))
}

// W2) 对照组：写发生在水合完成之后
{
  const { mem, async } = mkMem(['w2', JSON.stringify({ state: { n: 5 }, version: 0 })])
  const store: any = createStore(
    persist(objCfg(null), { name: 'w2', storage: createJSONStorage(() => async) } as any),
  )
  await sleep(150)
  store.getState().bump(9)
  await sleep(150)
  console.log('W2 state =', JSON.stringify(store.getState()), '| storage =', mem.get('w2'))
}

// W3) 版本不匹配走 migrate，迁移在途时写了一次
{
  const { mem, async } = mkMem(['w3', JSON.stringify({ state: { n: 5 }, version: 0 })])
  const store: any = createStore(
    persist(objCfg(null), {
      name: 'w3',
      storage: createJSONStorage(() => async),
      version: 1,
      migrate: (p: any) => ({ n: (p as any).n * 2 }),
    } as any),
  )
  store.getState().bump(9)
  await sleep(150)
  console.log('W3 state =', JSON.stringify(store.getState()), '| storage =', mem.get('w3'))
}

// W4) skipHydration 后手动 rehydrate()，期间连写两次
{
  const { mem, async } = mkMem(['w4', JSON.stringify({ state: { n: 5 }, version: 0 })])
  const store: any = createStore(
    persist(objCfg(null), {
      name: 'w4',
      storage: createJSONStorage(() => async),
      skipHydration: true,
    } as any),
  )
  store.getState().bump(9)
  const p = store.persist.rehydrate()
  store.getState().bump(11)
  await p
  await sleep(150)
  console.log('W4 state =', JSON.stringify(store.getState()), '| storage =', mem.get('w4'))
}

// W5) 同步 storage 对照：现状不许变
{
  const { mem, sync } = mkMem(['w5', JSON.stringify({ state: { n: 5 }, version: 0 })])
  const store: any = createStore(
    persist(objCfg(null), { name: 'w5', storage: createJSONStorage(() => sync) } as any),
  )
  store.getState().bump(9)
  await sleep(50)
  console.log('W5 state =', JSON.stringify(store.getState()), '| storage =', mem.get('w5'))
}

// W6) 自定义 merge 的在途写（现成用例钉着这组语义）
{
  const { mem, async } = mkMem(['w6', JSON.stringify({ state: { n: 5, k: 'from-storage' }, version: 0 })])
  const store: any = createStore(
    persist(
      ((set: any) => ({ n: 1, k: 'initial', bump: (v: number) => set({ n: v }) })) as any,
      {
        name: 'w6',
        storage: createJSONStorage(() => async),
        merge: (p: any, c: any) => ({ ...c, ...(p as object) }),
      } as any,
    ),
  )
  store.getState().bump(9)
  await sleep(150)
  console.log('W6 state =', JSON.stringify(store.getState()), '| storage =', mem.get('w6'))
}
