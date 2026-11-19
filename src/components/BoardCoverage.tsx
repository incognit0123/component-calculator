interface Props {
  placedCount: number
  capacity: number
  inventoryCount: number
}

export function BoardCoverage({ placedCount, capacity, inventoryCount }: Props) {
  if (placedCount >= capacity) return null

  const shortage = capacity - inventoryCount
  return (
    <aside aria-label="Board coverage" className="rounded-md border border-bg-line bg-bg-elev/40 px-3 py-2 text-xs">
      <p className="font-semibold text-gray-200">
        {placedCount === inventoryCount
          ? `Used every piece in your inventory (${inventoryCount}).`
          : `Placed ${placedCount} of the ${inventoryCount} pieces in your inventory.`}
      </p>
      <p className="mt-1 text-gray-300">
        Total board capacity is {capacity} pieces.{' '}
        {shortage > 0
          ? `Aim for ${shortage} more ${shortage === 1 ? 'piece, even if it is' : 'pieces, even if they are'} lower grade.`
          : 'You have enough pieces by count.'}
      </p>
      <p className="mt-1 text-gray-400">
        {shortage > 0
          ? 'A full layout also needs shapes that fit together.'
          : 'A different layout or mix of shapes may fill the gaps.'}
      </p>
    </aside>
  )
}
