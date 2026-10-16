export type ItemPage<T> = {
  items: T[];
  page: {
    number: number;
    size: number;
    totalItems: number;
    totalPages: number;
  };
};
