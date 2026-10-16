/** Legacy / default board snapshot key (board-default only). */
export const FLOW_STORAGE_KEY = "foqz_reactflow_poc_board_v1";

/** Multi-board catalog metadata. */
export const STORAGE_BOARDS_KEY = "foqz_multiboards_meta_v1";

/** Active board id pointer. */
export const ACTIVE_BOARD_KEY = "foqz_active_board_id";

/** Display name mirror for the active board (legacy single-board key). */
export const BOARD_NAME_KEY = "foqz_board_name";

export const DEFAULT_BOARD_ID = "board-default";
export const DEFAULT_BOARD_NAME = "Foqz Board 1";

export function getBoardStorageKey(boardId: string): string {
  return boardId === DEFAULT_BOARD_ID
    ? FLOW_STORAGE_KEY
    : `foqz_board_snapshot_${boardId}`;
}
