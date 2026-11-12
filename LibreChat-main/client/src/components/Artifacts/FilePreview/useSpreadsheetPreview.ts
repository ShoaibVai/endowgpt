import { useInfiniteQuery } from '@tanstack/react-query';
import { QueryKeys, dataService } from 'librechat-data-provider';
import type { TFilePreview } from 'librechat-data-provider';

export const SPREADSHEET_PAGE_SIZE = 500;

/** Pages the stored workbook through the authenticated preview endpoint. */
export default function useSpreadsheetPreview(
  fileId: string | undefined,
  sheet: number,
  enabled: boolean,
) {
  return useInfiniteQuery<TFilePreview>({
    queryKey: [QueryKeys.filePreview, fileId, 'sheets', sheet, SPREADSHEET_PAGE_SIZE],
    queryFn: ({ pageParam = 0 }) =>
      dataService.getFilePreview(fileId ?? '', {
        sheet,
        offset: Number(pageParam),
        limit: SPREADSHEET_PAGE_SIZE,
      }),
    enabled: enabled && Boolean(fileId),
    getNextPageParam: (lastPage) => {
      const sheetPreview = lastPage.sheets?.find((entry) => entry.index === sheet);
      if (sheetPreview == null) {
        return undefined;
      }
      const loaded = sheetPreview.offset + sheetPreview.rows.length;
      return loaded < sheetPreview.totalRows ? loaded : undefined;
    },
    staleTime: 30_000,
  });
}
