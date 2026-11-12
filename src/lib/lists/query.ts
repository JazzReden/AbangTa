export type ListQuery = { bill?: string | string[]; q?: string | string[]; page?: string | string[]; status?: string | string[]; month?: string | string[]; priority?: string | string[]; filter?: string | string[] };
export const LIST_PAGE_SIZE = 12;
export function listQuery(raw: ListQuery = {}) {
  const text = (value: string | string[] | undefined) => typeof value === 'string' ? value.trim() : '';
  const page = Number(text(raw.page));
  const month = text(raw.month);
  return {
    q: text(raw.q).slice(0, 100),
    page: Number.isSafeInteger(page) && page > 0 ? page : 1,
    status: text(raw.status), priority: text(raw.priority), filter: text(raw.filter),
    month: /^(?:19|20|21)\d{2}-(?:0[1-9]|1[0-2])$/.test(month) ? month : '',
  };
}
export function pageWindow(total: number, requested: number) {
  const pages = Math.max(1, Math.ceil(total / LIST_PAGE_SIZE));
  const page = Math.min(Math.max(1, requested), pages);
  return { total, pages, page, pageSize: LIST_PAGE_SIZE, skip: (page - 1) * LIST_PAGE_SIZE };
}
export function listHref(path: string, query: Omit<ListQuery, 'page'>, page = 1) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) if (key !== 'page' && typeof value === 'string' && value) params.set(key, value);
  if (page > 1) params.set('page', String(page));
  return path + (params.size ? '?' + params.toString() : '');
}
