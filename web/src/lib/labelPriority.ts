export interface ScreenBox {x:number;y:number;width:number;height:number;}
export function overlapsAircraft(label:ScreenBox,aircraft:ScreenBox[]){return aircraft.some(a=>label.x<a.x+a.width&&label.x+label.width>a.x&&label.y<a.y+a.height&&label.y+label.height>a.y);}
