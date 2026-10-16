export interface PbAuthModel {
  id: string;
  email?: string;
  name?: string;
}

export interface PbRecord {
  id: string;
  [key: string]: unknown;
}

export interface PbSubscribeEvent {
  action: string;
  record: PbRecord;
}

export interface PbAuthStoreLike {
  isValid: boolean;
  token: string;
  record: PbAuthModel | null;
  clear(): void;
  onChange(
    callback: (token: string, record: PbAuthModel | null) => void,
    fireImmediately?: boolean
  ): () => void;
}

export interface PbListOptions {
  filter?: string;
  sort?: string;
  batch?: number;
  /** PocketBase field mask. Omit large JSON when listing catalogs. */
  fields?: string;
}

export interface PbCollectionLike {
  getFullList(options?: PbListOptions): Promise<PbRecord[]>;
  getFirstListItem(filter: string): Promise<PbRecord>;
  create(data: Record<string, unknown>): Promise<PbRecord>;
  update(id: string, data: Record<string, unknown>): Promise<PbRecord>;
  delete(id: string): Promise<boolean>;
  subscribe(
    topic: string,
    callback: (data: PbSubscribeEvent) => void
  ): Promise<() => Promise<void> | void>;
  authWithPassword?(
    email: string,
    password: string
  ): Promise<{ token: string; record: PbAuthModel | null }>;
}

export interface PbClientLike {
  autoCancellation(enable: boolean): void;
  authStore: PbAuthStoreLike;
  collection(name: string): PbCollectionLike;
}
