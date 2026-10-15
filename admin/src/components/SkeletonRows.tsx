// Table skeleton rows while a list loads (App Flow §15.9). The row count and shape match the real
// table, so the page does not jump when the data lands.
export function SkeletonRows({ rows = 5, columns }: { rows?: number; columns: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, row) => (
        <tr key={row} aria-hidden="true">
          {Array.from({ length: columns }, (_, column) => (
            <td key={column} className="border-b px-3 py-3">
              <span className="block h-4 animate-pulse rounded bg-secondary" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
