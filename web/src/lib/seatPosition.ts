/** British Airways' official representative A320neo map: A/F window columns,
 * rows 1–30. Position buckets are our approximate visual mapping, not exact geometry.
 * Source: https://www.britishairways.com/content/information/seating/seat-maps
 * Map: https://ba.scene7.com/is/image/ba/airbus-A320neo-full-seatmap?dpr=off&fmt=png-alpha
 * Inspected 2026-09-30. Require the user to confirm their booking's layout. */
export function representativeWindowSeat(seat:string){
 const match=/^(\d{1,2})([AF])$/.exec(seat.trim().toUpperCase());if(!match)return null;const row=Number(match[1]);if(row<1||row>30)return null;
 return {side:match[2]==='A'?'left' as const:'right' as const,position:row<9?'front' as const:row>16?'rear' as const:'wing' as const};
}
