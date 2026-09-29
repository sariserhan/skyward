export function touchdownTransition(previous:{ground:boolean;gear:number}|null,current:{ground:boolean;gear:number;speed:number}){
 return !!previous&&!previous.ground&&current.ground&&current.gear>.8&&current.speed>35;
}
