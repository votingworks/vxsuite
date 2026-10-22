import type { Browser, BrowserContext, Page } from 'playwright';

/** A pooled page, to be released once the caller is done with it. */
export interface PageLease {
  readonly page: Page;
  release(): void;
}

interface PagePool {
  readonly context: Promise<BrowserContext>;
  readonly idlePages: Page[];
}

const pagePools = new WeakMap<Browser, PagePool>();

/** Takes an idle page for `browser`, creating one if none is idle. */
export async function acquirePage(browser: Browser): Promise<PageLease> {
  let pool = pagePools.get(browser);
  if (!pool) {
    pool = { context: browser.newContext(), idlePages: [] };
    pagePools.set(browser, pool);
  }
  const { idlePages } = pool;
  const page = idlePages.pop() ?? (await (await pool.context).newPage());
  return {
    page,
    release() {
      idlePages.push(page);
    },
  };
}
